import { NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { clickupService } from '@/lib/clickup.service';
import { AUDIOVISUAL_TEAM_IDS } from '@/lib/constants';
import { extractFrameIoComments, categorizeComment } from '@/lib/frameio-api.service';

// =====================================================
// API DE ATUALIZAÇÃO DE FEEDBACKS DO FRAME.IO
// Roda a cada hora para extrair comentários de revisão
// =====================================================

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

// Mapeamento de ClickUp ID para editor no banco
const CLICKUP_TO_EDITOR_MAP: Record<number, { dbId: number; name: string }> = {
    248675265: { dbId: 1, name: 'Nathan Soares' },
    84070913: { dbId: 2, name: 'Victor Mazzine' },
    112053206: { dbId: 3, name: 'Moises Ramalho' },
    152605916: { dbId: 4, name: 'Victor Mendes' },
    3258937: { dbId: 5, name: 'Renato Fernandes Rodrigues' },
    3272897: { dbId: 6, name: 'Douglas Prado Cardoso' },
    96683026: { dbId: 7, name: 'Leonardo da Silva' },
    84241154: { dbId: 8, name: 'Rafael Andrade' },
    82093531: { dbId: 9, name: 'Loren Gayoso' },
    82074101: { dbId: 10, name: 'Bruno Cesar' },
};

async function saveFeedbackToDatabase(
    taskId: string,
    editorId: number | null,
    editorName: string | null,
    frameioUrl: string,
    comments: Array<{ author?: string; text: string; timestamp?: string; category: string }>,
    error?: string
) {
    try {
        // Inserir ou atualizar feedback
        const feedbackResult = await sql`
            INSERT INTO frameio_feedbacks (task_id, editor_id, editor_name, frameio_url, total_comments, error, processed_at)
            VALUES (${taskId}, ${editorId}, ${editorName}, ${frameioUrl}, ${comments.length}, ${error || null}, NOW())
            ON CONFLICT (frameio_url) DO UPDATE SET
                total_comments = ${comments.length},
                error = ${error || null},
                processed_at = NOW()
            RETURNING id
        `;

        const feedbackId = feedbackResult.rows[0]?.id;
        if (!feedbackId) return;

        // Limpar comentários antigos deste feedback
        await sql`DELETE FROM frameio_comments WHERE feedback_id = ${feedbackId}`;

        // Inserir novos comentários
        let commentNumber = 1;
        for (const comment of comments) {
            await sql`
                INSERT INTO frameio_comments (feedback_id, author, text, timestamp_marker, comment_number, category)
                VALUES (${feedbackId}, ${comment.author || 'Desconhecido'}, ${comment.text}, ${comment.timestamp || null}, ${commentNumber}, ${comment.category})
            `;
            commentNumber++;
        }

        console.log(`[Feedbacks] Saved ${comments.length} comments for feedback ${feedbackId}`);
    } catch (err) {
        console.error('[Feedbacks] Error saving to database:', err);
    }
}

async function updateErrorPatternsCache(editorId: number, editorName: string) {
    try {
        const currentMonth = new Date().toISOString().slice(0, 7);

        // Buscar todos os comentários do editor no mês atual
        const commentsResult = await sql`
            SELECT fc.category, COUNT(*) as count
            FROM frameio_comments fc
            JOIN frameio_feedbacks ff ON fc.feedback_id = ff.id
            WHERE ff.editor_id = ${editorId}
            AND ff.processed_at >= DATE_TRUNC('month', CURRENT_DATE)
            GROUP BY fc.category
            ORDER BY count DESC
        `;

        const totalErrors = commentsResult.rows.reduce((sum, r) => sum + parseInt(r.count), 0);
        const errorPatterns = commentsResult.rows.map(r => ({
            category: r.category,
            count: parseInt(r.count),
            percentage: totalErrors > 0 ? Math.round((parseInt(r.count) / totalErrors) * 100) : 0
        }));

        const mostCommonError = errorPatterns[0]?.category || null;

        // Atualizar cache
        await sql`
            INSERT INTO error_patterns_cache (editor_id, editor_name, year_month, error_patterns, total_errors, most_common_error)
            VALUES (${editorId}, ${editorName}, ${currentMonth}, ${JSON.stringify(errorPatterns)}::jsonb, ${totalErrors}, ${mostCommonError})
            ON CONFLICT (editor_id, year_month) DO UPDATE SET
                error_patterns = ${JSON.stringify(errorPatterns)}::jsonb,
                total_errors = ${totalErrors},
                most_common_error = ${mostCommonError},
                updated_at = NOW()
        `;

        console.log(`[Feedbacks] Updated error patterns for ${editorName}: ${totalErrors} total errors`);
    } catch (err) {
        console.error('[Feedbacks] Error updating error patterns:', err);
    }
}

export async function POST() {
    try {
        console.log('[Feedbacks Update] Starting hourly extraction...');

        if (!process.env.BROWSERLESS_API_KEY) {
            return NextResponse.json({
                success: false,
                error: 'BROWSERLESS_API_KEY not configured'
            }, { status: 500 });
        }

        // Garantir que as tabelas existem
        await sql`
            CREATE TABLE IF NOT EXISTS frameio_feedbacks (
                id SERIAL PRIMARY KEY,
                task_id VARCHAR(50),
                editor_id INT,
                editor_name VARCHAR(100),
                frameio_url TEXT NOT NULL UNIQUE,
                asset_name VARCHAR(255),
                total_comments INT DEFAULT 0,
                error TEXT,
                processed_at TIMESTAMP WITH TIME ZONE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            )
        `;

        await sql`
            CREATE TABLE IF NOT EXISTS frameio_comments (
                id SERIAL PRIMARY KEY,
                feedback_id INT NOT NULL REFERENCES frameio_feedbacks(id) ON DELETE CASCADE,
                author VARCHAR(100),
                text TEXT NOT NULL,
                timestamp_marker VARCHAR(20),
                comment_number INT,
                category VARCHAR(50),
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            )
        `;

        // Fetch tasks to get Frame.io links
        const allTasks = await clickupService.fetchTasks();
        const audiovisualTasks = allTasks.filter(task =>
            task.assignees?.some(a => AUDIOVISUAL_TEAM_IDS.includes(a.id))
        );

        const taskIds = audiovisualTasks.map(t => t.id);
        const phaseTimeMap = await clickupService.fetchPhaseTimeForTasks(taskIds);
        const feedbackData = await clickupService.fetchFeedbackAuditDataOptimized(audiovisualTasks, phaseTimeMap);

        // Get Frame.io links with task and editor info
        const tasksWithAlteration = feedbackData.filter(d => d.hadAlteration && d.frameIoLinks.length > 0);

        // Criar mapa de URL para task/editor
        const urlToTaskMap = new Map<string, { taskId: string; editorId: number | null; editorName: string | null }>();
        for (const feedbackItem of tasksWithAlteration) {
            const taskId = feedbackItem.task.id;
            const assignee = feedbackItem.task.assignees?.[0];
            const editorInfo = assignee ? CLICKUP_TO_EDITOR_MAP[assignee.id] : null;

            for (const url of feedbackItem.frameIoLinks) {
                urlToTaskMap.set(url, {
                    taskId: taskId,
                    editorId: editorInfo?.dbId || null,
                    editorName: editorInfo?.name || assignee?.username || null
                });
            }
        }

        const allFrameIoUrls = [...urlToTaskMap.keys()];
        console.log(`[Feedbacks Update] Found ${allFrameIoUrls.length} Frame.io URLs`);

        // Buscar URLs já processados recentemente (última hora)
        const recentlyProcessed = await sql`
            SELECT frameio_url FROM frameio_feedbacks
            WHERE processed_at >= NOW() - INTERVAL '1 hour'
        `;
        const recentUrls = new Set(recentlyProcessed.rows.map(r => r.frameio_url));

        // Filtrar URLs não processados recentemente
        const urlsToProcess = allFrameIoUrls
            .filter(url => !recentUrls.has(url))
            .slice(0, 5); // Processar até 5 novos por execução

        console.log(`[Feedbacks Update] Processing ${urlsToProcess.length} new URLs (${recentUrls.size} already processed)`);

        const results = [];
        const editorsToUpdate = new Set<number>();

        for (const url of urlsToProcess) {
            console.log(`[Feedbacks Update] Extracting: ${url}`);
            const taskInfo = urlToTaskMap.get(url);

            try {
                const feedback = await extractFrameIoComments(url);
                const categorizedComments = feedback.comments.map(c => ({
                    ...c,
                    category: categorizeComment(c.text)
                }));

                // Salvar no banco
                await saveFeedbackToDatabase(
                    taskInfo?.taskId || '',
                    taskInfo?.editorId || null,
                    taskInfo?.editorName || null,
                    url,
                    categorizedComments,
                    feedback.error
                );

                if (taskInfo?.editorId) {
                    editorsToUpdate.add(taskInfo.editorId);
                }

                results.push({
                    url,
                    taskId: taskInfo?.taskId,
                    editorName: taskInfo?.editorName,
                    comments: categorizedComments,
                    error: feedback.error
                });
            } catch (err) {
                console.error(`[Feedbacks] Error processing ${url}:`, err);
                results.push({
                    url,
                    taskId: taskInfo?.taskId,
                    editorName: taskInfo?.editorName,
                    comments: [],
                    error: err instanceof Error ? err.message : 'Unknown error'
                });
            }
        }

        // Atualizar padrões de erro para os editores afetados
        for (const editorDbId of editorsToUpdate) {
            const editorInfo = Object.values(CLICKUP_TO_EDITOR_MAP).find(e => e.dbId === editorDbId);
            if (editorInfo) {
                await updateErrorPatternsCache(editorDbId, editorInfo.name);
            }
        }

        const totalComments = results.reduce((acc, r) => acc + r.comments.length, 0);

        return NextResponse.json({
            success: true,
            stats: {
                totalUrls: allFrameIoUrls.length,
                processedUrls: urlsToProcess.length,
                skippedUrls: recentUrls.size,
                commentsExtracted: totalComments,
                editorsUpdated: editorsToUpdate.size
            },
            results,
            message: `${totalComments} feedbacks extraídos de ${urlsToProcess.length} links, ${editorsToUpdate.size} editores atualizados`
        });

    } catch (error) {
        console.error('[Feedbacks Update] Error:', error);
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}

export async function GET() {
    return POST();
}

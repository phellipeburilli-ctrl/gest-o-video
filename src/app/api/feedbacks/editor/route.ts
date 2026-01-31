import { NextResponse } from 'next/server';
import { getMemberById } from '@/lib/constants';
import { extractFrameIoComments, categorizeComment, FeedbackCategory } from '@/lib/frameio-api.service';

export const maxDuration = 60;

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { editorId, frameIoLinks, editorName, editorColor, totalTasks, tasksWithAlteration } = body;

        if (!editorId) {
            return NextResponse.json({ error: 'editorId required' }, { status: 400 });
        }

        if (!process.env.BROWSERLESS_API_KEY) {
            return NextResponse.json({ error: 'BROWSERLESS_API_KEY not configured' }, { status: 500 });
        }

        const editorIdNum = Number(editorId);
        const member = getMemberById(editorIdNum);
        const name = editorName || member?.name || 'Unknown';
        const color = editorColor || member?.color || '#666';

        console.log(`[Editor Feedback] Processing for: ${name} (ID: ${editorIdNum})`);
        console.log(`[Editor Feedback] Received ${frameIoLinks?.length || 0} Frame.io links`);

        // Process Frame.io links (limit to 3 to avoid timeout)
        const urlsToProcess = (frameIoLinks || []).slice(0, 3);

        const errorPatterns: Record<FeedbackCategory, number> = {
            'Áudio/Voz': 0,
            'Legenda/Texto': 0,
            'Corte/Transição': 0,
            'Fonte/Tipografia': 0,
            'Cor/Imagem': 0,
            'Timing/Sincronização': 0,
            'Logo/Marca': 0,
            'CTA/Preço': 0,
            'Footage/Vídeo': 0,
            'Outros': 0
        };

        const allComments: Array<{
            text: string;
            category: FeedbackCategory;
            timestamp: string;
            taskName: string;
        }> = [];

        for (const linkData of urlsToProcess) {
            const url = typeof linkData === 'string' ? linkData : linkData.url;
            const taskName = typeof linkData === 'string' ? 'Unknown' : (linkData.taskName || 'Unknown');

            console.log(`[Editor Feedback] Extracting: ${url}`);

            try {
                const feedback = await extractFrameIoComments(url);

                feedback.comments.forEach(c => {
                    const category = categorizeComment(c.text);
                    errorPatterns[category]++;
                    allComments.push({
                        text: c.text,
                        category,
                        timestamp: c.timestamp,
                        taskName
                    });
                });
            } catch (err) {
                console.error(`[Editor Feedback] Error extracting ${url}:`, err);
            }
        }

        const totalErrors = Object.values(errorPatterns).reduce((a, b) => a + b, 0);

        const topErrors = Object.entries(errorPatterns)
            .filter(([_, count]) => count > 0)
            .sort((a, b) => b[1] - a[1])
            .map(([category, count]) => ({
                category,
                count,
                percentage: totalErrors > 0 ? Math.round((count / totalErrors) * 100) : 0
            }));

        return NextResponse.json({
            success: true,
            editor: {
                id: editorIdNum,
                name,
                color
            },
            stats: {
                totalTasks: totalTasks || 0,
                tasksWithAlteration: tasksWithAlteration || 0,
                alterationRate: totalTasks > 0
                    ? Math.round(((tasksWithAlteration || 0) / totalTasks) * 100)
                    : 0,
                totalFrameIoLinks: frameIoLinks?.length || 0,
                linksProcessed: urlsToProcess.length,
                totalFeedbacks: totalErrors
            },
            errorPatterns: topErrors,
            recentComments: allComments.slice(0, 10),
            updatedAt: Date.now()
        });

    } catch (error) {
        console.error('[Editor Feedback] Error:', error);
        return NextResponse.json({
            error: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}

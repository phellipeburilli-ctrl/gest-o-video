import { NextResponse } from 'next/server';
import { getMemberById } from '@/lib/constants';
import { extractFrameIoComments, categorizeComment, FeedbackCategory } from '@/lib/frameio-api.service';

export const maxDuration = 60;

// Process links in batches to avoid overwhelming Browserless
async function processBatch<T, R>(
    items: T[],
    batchSize: number,
    processor: (item: T) => Promise<R>
): Promise<R[]> {
    const results: R[] = [];

    for (let i = 0; i < items.length; i += batchSize) {
        const batch = items.slice(i, i + batchSize);
        const batchResults = await Promise.all(batch.map(processor));
        results.push(...batchResults);
    }

    return results;
}

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

        // Process ALL links in batches of 5 (parallel within batch)
        const allLinks = frameIoLinks || [];

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

        let linksProcessed = 0;
        let linksFailed = 0;

        // Process 1 link at a time with longer timeout for reliability
        const results = await processBatch(allLinks, 1, async (linkData: any) => {
            const url = typeof linkData === 'string' ? linkData : linkData.url;
            const taskName = typeof linkData === 'string' ? 'Unknown' : (linkData.taskName || 'Unknown');

            console.log(`[Editor Feedback] Extracting: ${url}`);

            try {
                const feedback = await extractFrameIoComments(url, 50000); // 50s timeout per link

                if (feedback.error) {
                    linksFailed++;
                    return { url, success: false, comments: [] };
                }

                linksProcessed++;

                const processedComments = feedback.comments.map(c => {
                    const category = categorizeComment(c.text);
                    errorPatterns[category]++;
                    return {
                        text: c.text,
                        category,
                        timestamp: c.timestamp,
                        taskName
                    };
                });

                return { url, success: true, comments: processedComments };
            } catch (err) {
                console.error(`[Editor Feedback] Error extracting ${url}:`, err);
                linksFailed++;
                return { url, success: false, comments: [] };
            }
        });

        // Collect all comments from results
        results.forEach(r => {
            if (r.success && r.comments) {
                allComments.push(...r.comments);
            }
        });

        const totalErrors = Object.values(errorPatterns).reduce((a, b) => a + b, 0);

        const topErrors = Object.entries(errorPatterns)
            .filter(([_, count]) => count > 0)
            .sort((a, b) => b[1] - a[1])
            .map(([category, count]) => ({
                category,
                count,
                percentage: totalErrors > 0 ? Math.round((count / totalErrors) * 100) : 0
            }));

        console.log(`[Editor Feedback] Completed: ${linksProcessed} success, ${linksFailed} failed, ${totalErrors} feedbacks`);

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
                totalFrameIoLinks: allLinks.length,
                linksProcessed,
                linksFailed,
                totalFeedbacks: totalErrors
            },
            errorPatterns: topErrors,
            recentComments: allComments.slice(0, 15), // Show last 15 comments
            updatedAt: Date.now()
        });

    } catch (error) {
        console.error('[Editor Feedback] Error:', error);
        return NextResponse.json({
            error: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}

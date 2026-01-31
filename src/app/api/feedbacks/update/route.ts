import { NextResponse } from 'next/server';
import { clickupService } from '@/lib/clickup.service';
import { AUDIOVISUAL_TEAM_IDS } from '@/lib/constants';
import { extractMultipleFrameIoComments, categorizeComment } from '@/lib/frameio-api.service';

export const maxDuration = 60;

export async function POST(request: Request) {
    try {
        // Optional: Add secret key validation for security
        const { searchParams } = new URL(request.url);
        const secret = searchParams.get('secret');

        // You can add a secret check here if needed
        // if (secret !== process.env.UPDATE_SECRET) {
        //     return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        // }

        console.log('[Feedbacks Update] Starting manual update...');

        // Fetch all tasks
        const allTasks = await clickupService.fetchTasks();
        const audiovisualTasks = allTasks.filter(task =>
            task.assignees?.some(a => AUDIOVISUAL_TEAM_IDS.includes(a.id))
        );

        // Get phase time and feedback data
        const taskIds = audiovisualTasks.map(t => t.id);
        const phaseTimeMap = await clickupService.fetchPhaseTimeForTasks(taskIds);
        const feedbackData = await clickupService.fetchFeedbackAuditDataOptimized(audiovisualTasks, phaseTimeMap);

        // Get Frame.io links from tasks with alterations
        const tasksWithAlteration = feedbackData.filter(d => d.hadAlteration && d.frameIoLinks.length > 0);
        const allFrameIoUrls = [...new Set(tasksWithAlteration.flatMap(d => d.frameIoLinks))];

        console.log(`[Feedbacks Update] Found ${allFrameIoUrls.length} unique Frame.io URLs`);
        console.log(`[Feedbacks Update] BROWSERLESS_API_KEY configured: ${!!process.env.BROWSERLESS_API_KEY}`);

        // Extract comments from all URLs (no limit for manual update)
        let frameIoFeedbacks: Awaited<ReturnType<typeof extractMultipleFrameIoComments>> = [];

        if (allFrameIoUrls.length > 0 && process.env.BROWSERLESS_API_KEY) {
            // Process in smaller batches to avoid timeout
            const batchSize = 2;
            for (let i = 0; i < Math.min(allFrameIoUrls.length, 10); i += batchSize) {
                const batch = allFrameIoUrls.slice(i, i + batchSize);
                console.log(`[Feedbacks Update] Processing batch ${i / batchSize + 1}...`);
                const batchResults = await extractMultipleFrameIoComments(batch);
                frameIoFeedbacks.push(...batchResults);
            }
        }

        const totalComments = frameIoFeedbacks.reduce((acc, f) => acc + f.comments.length, 0);
        console.log(`[Feedbacks Update] Extracted ${totalComments} comments`);

        // Map comments to tasks and categorize
        const urlToCommentsMap = new Map();
        frameIoFeedbacks.forEach(f => {
            const categorizedComments = f.comments.map(c => ({
                ...c,
                category: categorizeComment(c.text)
            }));
            urlToCommentsMap.set(f.url, categorizedComments);
            const shortCode = f.url.split('/').pop() || '';
            if (shortCode) urlToCommentsMap.set(shortCode, categorizedComments);
        });

        // Calculate error patterns per editor
        const editorPatterns: Record<string, { errors: Record<string, number>, total: number }> = {};

        feedbackData.forEach(data => {
            const assignee = data.task.assignees?.[0];
            if (!assignee || !data.hadAlteration) return;

            const editorId = assignee.id;
            if (!editorPatterns[editorId]) {
                editorPatterns[editorId] = { errors: {}, total: 0 };
            }

            // Find comments for this task's Frame.io links
            data.frameIoLinks.forEach(link => {
                const shortCode = link.split('/').pop() || '';
                const comments = urlToCommentsMap.get(link) || urlToCommentsMap.get(shortCode) || urlToCommentsMap.get(`https://${link}`);

                if (comments) {
                    comments.forEach((c: any) => {
                        if (!editorPatterns[editorId].errors[c.category]) {
                            editorPatterns[editorId].errors[c.category] = 0;
                        }
                        editorPatterns[editorId].errors[c.category]++;
                        editorPatterns[editorId].total++;
                    });
                }
            });
        });

        return NextResponse.json({
            success: true,
            stats: {
                totalTasks: feedbackData.length,
                tasksWithAlteration: tasksWithAlteration.length,
                frameIoUrls: allFrameIoUrls.length,
                commentsExtracted: totalComments,
                editorsWithErrors: Object.keys(editorPatterns).filter(k => editorPatterns[k].total > 0).length
            },
            editorPatterns,
            updatedAt: Date.now()
        });

    } catch (error) {
        console.error('[Feedbacks Update] Error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        );
    }
}

// Also support GET for cron jobs
export async function GET(request: Request) {
    return POST(request);
}

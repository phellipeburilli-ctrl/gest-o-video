import { clickupService } from '@/lib/clickup.service';
import { FeedbacksView } from './feedbacks-view';
import { AUDIOVISUAL_TEAM_IDS } from '@/lib/constants';
import { extractMultipleFrameIoComments, categorizeComment, FeedbackCategory } from '@/lib/frameio-api.service';

export const revalidate = 300;
export const maxDuration = 60;

interface FrameIoCommentWithCategory {
    author: string;
    text: string;
    timestamp: string;
    commentNumber: number;
    category: FeedbackCategory;
}

export default async function FeedbacksPage() {
    // Fetch all tasks from editors
    const allTasks = await clickupService.fetchTasks();

    // Filter only tasks from audiovisual editors
    const audiovisualTasks = allTasks.filter(task =>
        task.assignees?.some(a => AUDIOVISUAL_TEAM_IDS.includes(a.id))
    );

    console.log(`[Feedbacks] Total: ${allTasks.length}, Audiovisual: ${audiovisualTasks.length}`);

    // Get task IDs for phase time fetching
    const taskIds = audiovisualTasks.map(t => t.id);

    // Fetch phase time for all tasks (includes alterationTimeMs)
    const phaseTimeMap = await clickupService.fetchPhaseTimeForTasks(taskIds);

    // Use optimized audit that reuses phaseTimeMap
    const feedbackData = await clickupService.fetchFeedbackAuditDataOptimized(audiovisualTasks, phaseTimeMap);

    // Get ALL Frame.io links from tasks with alterations
    const tasksWithAlteration = feedbackData.filter(d => d.hadAlteration && d.frameIoLinks.length > 0);

    // Collect unique Frame.io URLs (limit to 3 to fit in 60s Vercel timeout)
    const allFrameIoUrls = [...new Set(tasksWithAlteration.flatMap(d => d.frameIoLinks))].slice(0, 3);

    console.log(`[Feedbacks] Extracting comments from ${allFrameIoUrls.length} Frame.io links...`);
    console.log(`[Feedbacks] BROWSERLESS_API_KEY configured: ${!!process.env.BROWSERLESS_API_KEY}`);

    // Extract Frame.io comments using Browserless
    let frameIoFeedbacks: Awaited<ReturnType<typeof extractMultipleFrameIoComments>> = [];

    try {
        if (allFrameIoUrls.length > 0 && process.env.BROWSERLESS_API_KEY) {
            frameIoFeedbacks = await extractMultipleFrameIoComments(allFrameIoUrls);
        }
    } catch (error) {
        console.error('[Feedbacks] Error extracting Frame.io comments:', error);
    }

    // Create a map of URL to comments for quick lookup
    const urlToCommentsMap = new Map<string, FrameIoCommentWithCategory[]>();
    frameIoFeedbacks.forEach(f => {
        const categorizedComments: FrameIoCommentWithCategory[] = f.comments.map(c => ({
            ...c,
            category: categorizeComment(c.text)
        }));

        // Map by full URL and short code
        urlToCommentsMap.set(f.url, categorizedComments);
        const shortCode = f.url.split('/').pop() || '';
        if (shortCode) {
            urlToCommentsMap.set(shortCode, categorizedComments);
        }
    });

    // Map Frame.io feedback to tasks - match by URL or short code
    const feedbackDataWithComments = feedbackData.map(data => {
        const allComments: FrameIoCommentWithCategory[] = [];

        data.frameIoLinks.forEach(link => {
            const shortCode = link.split('/').pop() || '';
            const comments = urlToCommentsMap.get(link) || urlToCommentsMap.get(shortCode) || urlToCommentsMap.get(`https://${link}`);
            if (comments) {
                allComments.push(...comments);
            }
        });

        return {
            ...data,
            frameIoComments: allComments
        };
    });

    // Get tasks currently in "ALTERAÇÃO" status
    const tasksInAlteration = audiovisualTasks.filter(task => {
        const statusUpper = task.status.status.toUpperCase();
        return statusUpper.includes('ALTERA');
    });

    const withAlteration = feedbackData.filter(t => t.hadAlteration).length;
    const totalComments = frameIoFeedbacks.reduce((acc, f) => acc + f.comments.length, 0);

    console.log(`[Feedbacks] Completed: ${feedbackData.length}, With alteration: ${withAlteration}`);
    console.log(`[Feedbacks] Frame.io comments extracted: ${totalComments}`);

    return (
        <FeedbacksView
            tasks={audiovisualTasks}
            feedbackData={feedbackDataWithComments}
            currentAlterationTasks={tasksInAlteration}
            lastUpdated={Date.now()}
        />
    );
}

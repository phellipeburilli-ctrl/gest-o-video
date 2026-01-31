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

    // Get tasks with alterations that have Frame.io links
    const tasksWithAlteration = feedbackData.filter(d => d.hadAlteration && d.frameIoLinks.length > 0);

    // Collect Frame.io URLs to extract comments (limit to 5 to avoid timeout)
    const frameIoUrls = tasksWithAlteration
        .flatMap(d => d.frameIoLinks)
        .slice(0, 5);

    console.log(`[Feedbacks] Extracting comments from ${frameIoUrls.length} Frame.io links...`);

    // Extract Frame.io comments using Browserless
    let frameIoFeedbacks: Awaited<ReturnType<typeof extractMultipleFrameIoComments>> = [];

    try {
        if (frameIoUrls.length > 0 && process.env.BROWSERLESS_API_KEY) {
            frameIoFeedbacks = await extractMultipleFrameIoComments(frameIoUrls);
        }
    } catch (error) {
        console.error('[Feedbacks] Error extracting Frame.io comments:', error);
    }

    // Map Frame.io feedback to tasks
    const feedbackDataWithComments = feedbackData.map(data => {
        const matchingFeedbacks = frameIoFeedbacks.filter(f =>
            data.frameIoLinks.some(link => {
                // Match by URL or short code
                const shortCode = link.split('/').pop() || '';
                return f.url.includes(shortCode) || link.includes(f.url.split('/').pop() || '');
            })
        );

        const allComments = matchingFeedbacks.flatMap(f => f.comments);
        const categorizedComments: FrameIoCommentWithCategory[] = allComments.map(c => ({
            ...c,
            category: categorizeComment(c.text)
        }));

        return {
            ...data,
            frameIoComments: categorizedComments
        };
    });

    // Get tasks currently in "ALTERAÇÃO" status
    const tasksInAlteration = audiovisualTasks.filter(task => {
        const statusUpper = task.status.status.toUpperCase();
        return statusUpper.includes('ALTERA');
    });

    // Fetch Frame.io links for tasks currently in alteration
    const currentAlterationData = await clickupService.fetchTasksWithFrameIoLinks(tasksInAlteration.slice(0, 20));

    const withAlteration = feedbackData.filter(t => t.hadAlteration).length;
    const totalComments = frameIoFeedbacks.reduce((acc, f) => acc + f.comments.length, 0);

    console.log(`[Feedbacks] Completed: ${feedbackData.length}, With alteration: ${withAlteration}`);
    console.log(`[Feedbacks] Frame.io comments extracted: ${totalComments}`);

    return (
        <FeedbacksView
            tasks={audiovisualTasks}
            feedbackData={feedbackDataWithComments}
            currentAlterationTasks={currentAlterationData}
            lastUpdated={Date.now()}
        />
    );
}

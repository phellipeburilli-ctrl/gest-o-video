import { clickupService } from '@/lib/clickup.service';
import { FeedbacksView } from './feedbacks-view';
import { AUDIOVISUAL_TEAM_IDS } from '@/lib/constants';

export const revalidate = 300;
export const maxDuration = 60;

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

    // Get tasks currently in "ALTERAÇÃO" status
    const tasksInAlteration = audiovisualTasks.filter(task => {
        const statusUpper = task.status.status.toUpperCase();
        return statusUpper.includes('ALTERA');
    });

    // Fetch Frame.io links for tasks currently in alteration
    const currentAlterationData = await clickupService.fetchTasksWithFrameIoLinks(tasksInAlteration.slice(0, 20));

    const withAlteration = feedbackData.filter(t => t.hadAlteration).length;
    const totalFrameIoLinks = feedbackData.reduce((acc, d) => acc + d.frameIoLinks.length, 0);

    console.log(`[Feedbacks] Completed: ${feedbackData.length}, With alteration: ${withAlteration}`);
    console.log(`[Feedbacks] Total Frame.io links found: ${totalFrameIoLinks}`);

    return (
        <FeedbacksView
            tasks={audiovisualTasks}
            feedbackData={feedbackData}
            currentAlterationTasks={currentAlterationData}
            lastUpdated={Date.now()}
        />
    );
}

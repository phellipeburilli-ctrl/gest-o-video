import { clickupService } from '@/lib/clickup.service';
import { FeedbacksView } from './feedbacks-view';

export const revalidate = 300;
export const maxDuration = 60;

export default async function FeedbacksPage() {
    // Fetch all tasks from editors
    const tasks = await clickupService.fetchTasks();

    // Filter only tasks with "ALTERAÇÃO" status
    const tasksWithAlteration = tasks.filter(task => {
        const statusUpper = task.status.status.toUpperCase();
        return statusUpper.includes('ALTERA');
    });

    console.log(`[Feedbacks] Total tasks: ${tasks.length}, With Alteração: ${tasksWithAlteration.length}`);

    // Fetch comments for these tasks to find Frame.io links
    // Limit to first 50 tasks to avoid timeout
    const tasksToCheck = tasksWithAlteration.slice(0, 50);
    const tasksWithFrameIo = await clickupService.fetchTasksWithFrameIoLinks(tasksToCheck);

    // Filter only tasks that have Frame.io links
    const tasksWithLinks = tasksWithFrameIo.filter(t => t.frameIoLinks.length > 0);

    console.log(`[Feedbacks] Tasks with Frame.io links: ${tasksWithLinks.length}`);

    return (
        <FeedbacksView
            tasks={tasks}
            tasksWithFrameIo={tasksWithLinks}
            lastUpdated={Date.now()}
        />
    );
}

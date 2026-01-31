import { getFeedbacksData } from '@/lib/cached-data.service';
import { FeedbacksView } from './feedbacks-view';

// Force dynamic rendering to always fetch fresh data
export const dynamic = 'force-dynamic';

export default async function FeedbacksPage() {
    const data = await getFeedbacksData();

    return (
        <FeedbacksView
            tasks={data.tasks}
            feedbackData={data.feedbackData}
            currentAlterationTasks={data.currentAlterationTasks}
            lastUpdated={data.lastUpdated}
        />
    );
}

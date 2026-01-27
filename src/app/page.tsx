import { clickupService } from '@/lib/clickup.service';
import { dataService } from '@/lib/data-service';
import DashboardView from './dashboard-view';

// Revalidate data every 5 minutes
export const revalidate = 300;

export default async function Home() {
  console.log("Fetching ClickUp tasks...");

  const tasks = await clickupService.fetchTasks();
  const normalized = dataService.normalizeTasks(tasks);
  const kpis = dataService.calculateDashboardKPIs(normalized);

  console.log(`Prepared Dashboard for ${kpis.totalVideos} videos from ${kpis.editors.length} editors.`);

  return (
    <DashboardView
      initialData={kpis}
      lastUpdated={Date.now()}
    />
  );
}

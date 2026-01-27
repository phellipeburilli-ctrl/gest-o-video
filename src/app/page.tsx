import { clickupService } from '@/lib/clickup.service';
import { dataService } from '@/lib/data-service';
import { timeTrackingService } from '@/lib/time-tracking.service';
import DashboardView from './dashboard-view';

// Revalidate data every 5 minutes
export const revalidate = 300;

export default async function Home() {
  console.log("Fetching ClickUp tasks...");

  // 1. Fetch tasks from ClickUp API
  const tasks = await clickupService.fetchTasks();

  // 2. Get task IDs and fetch editing time from webhook history (EDITANDO -> APROVADO)
  const taskIds = tasks.map(t => t.id);
  console.log(`[Home] Fetching editing time for ${taskIds.length} tasks from webhook history...`);

  let webhookTimeMap: Map<string, number>;
  try {
    // Use getEditingTimeForTasks to calculate time from VIDEO: EDITANDO to APROVADO
    webhookTimeMap = await timeTrackingService.getEditingTimeForTasks(taskIds);
    const tasksWithWebhookTime = Array.from(webhookTimeMap.values()).filter(t => t > 0).length;
    console.log(`[Home] Found editing time data for ${tasksWithWebhookTime} tasks`);
  } catch (error) {
    console.error('[Home] Error fetching editing time data, using fallback:', error);
    webhookTimeMap = new Map();
  }

  // 3. Normalize tasks with webhook time data
  const normalized = dataService.normalizeTasks(tasks, webhookTimeMap);

  // 4. Calculate KPIs
  const kpis = dataService.calculateDashboardKPIs(normalized);

  console.log(`Prepared Dashboard for ${kpis.totalVideos} videos from ${kpis.editors.length} editors.`);

  return (
    <DashboardView
      initialData={kpis}
      lastUpdated={Date.now()}
    />
  );
}

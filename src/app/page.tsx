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

  // 2. Get task IDs and fetch editing time
  const taskIds = tasks.map(t => t.id);
  console.log(`[Home] Fetching editing time for ${taskIds.length} tasks...`);

  let editingTimeMap: Map<string, number>;
  try {
    // First try: Get editing time from webhook history (EDITANDO -> APROVADO)
    editingTimeMap = await timeTrackingService.getEditingTimeForTasks(taskIds);
    const tasksWithWebhookTime = Array.from(editingTimeMap.values()).filter(t => t > 0).length;
    console.log(`[Home] Found ${tasksWithWebhookTime} tasks with webhook time data`);

    // Second try: For tasks without webhook data, use ClickUp Time in Status API
    const tasksWithoutTime = taskIds.filter(id => !editingTimeMap.has(id) || editingTimeMap.get(id) === 0);
    if (tasksWithoutTime.length > 0) {
      console.log(`[Home] Fetching time in status from ClickUp API for ${tasksWithoutTime.length} tasks...`);
      const clickupTimeMap = await clickupService.fetchEditingTimeForTasks(tasksWithoutTime);

      // Merge ClickUp data into the map
      for (const [taskId, time] of clickupTimeMap) {
        if (time > 0 && (!editingTimeMap.has(taskId) || editingTimeMap.get(taskId) === 0)) {
          editingTimeMap.set(taskId, time);
        }
      }

      const tasksWithClickUpTime = Array.from(clickupTimeMap.values()).filter(t => t > 0).length;
      console.log(`[Home] Found ${tasksWithClickUpTime} additional tasks with ClickUp time data`);
    }
  } catch (error) {
    console.error('[Home] Error fetching editing time data:', error);
    editingTimeMap = new Map();
  }

  // 3. Normalize tasks with editing time data
  const normalized = dataService.normalizeTasks(tasks, editingTimeMap);

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

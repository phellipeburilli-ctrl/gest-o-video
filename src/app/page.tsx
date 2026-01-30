import { clickupService } from '@/lib/clickup.service';
import { dataService } from '@/lib/data-service';
import { timeTrackingService } from '@/lib/time-tracking.service';
import DashboardView from './dashboard-view';
import { TaskPhaseTime } from '@/types';

// Revalidate data every 5 minutes
export const revalidate = 300;

export default async function Home() {
  console.log("Fetching ClickUp tasks...");

  // 1. Fetch tasks from ClickUp API
  const tasks = await clickupService.fetchTasks();

  // 2. Get task IDs and fetch phase time (editing, revision, approval)
  const taskIds = tasks.map(t => t.id);
  console.log(`[Home] Fetching phase time for ${taskIds.length} tasks...`);

  let phaseTimeMap: Map<string, TaskPhaseTime>;
  try {
    // First try: Get phase time from webhook history
    phaseTimeMap = await timeTrackingService.getPhaseTimeForTasks(taskIds);
    const tasksWithWebhookTime = Array.from(phaseTimeMap.values()).filter(t => t.editingTimeMs > 0 || t.revisionTimeMs > 0).length;
    console.log(`[Home] Found ${tasksWithWebhookTime} tasks with webhook phase data`);

    // Second try: For tasks without webhook data, use ClickUp Time in Status API
    const tasksWithoutTime = taskIds.filter(id => {
      const phaseTime = phaseTimeMap.get(id);
      return !phaseTime || (phaseTime.editingTimeMs === 0 && phaseTime.revisionTimeMs === 0);
    });

    if (tasksWithoutTime.length > 0) {
      console.log(`[Home] Fetching time in status from ClickUp API for ${tasksWithoutTime.length} tasks...`);
      const clickupPhaseMap = await clickupService.fetchPhaseTimeForTasks(tasksWithoutTime);

      // Merge ClickUp data into the map
      for (const [taskId, phaseTime] of clickupPhaseMap) {
        const existing = phaseTimeMap.get(taskId);
        if (!existing || (existing.editingTimeMs === 0 && existing.revisionTimeMs === 0)) {
          phaseTimeMap.set(taskId, phaseTime);
        }
      }

      const tasksWithClickUpTime = Array.from(clickupPhaseMap.values()).filter(t => t.editingTimeMs > 0 || t.revisionTimeMs > 0).length;
      console.log(`[Home] Found ${tasksWithClickUpTime} additional tasks with ClickUp phase data`);
    }
  } catch (error) {
    console.error('[Home] Error fetching phase time data:', error);
    phaseTimeMap = new Map();
  }

  // 3. Normalize tasks with phase time data
  const normalized = dataService.normalizeTasks(tasks, phaseTimeMap);

  // Debug: Log status distribution
  const statusCounts: Record<string, number> = {};
  normalized.forEach(t => {
    statusCounts[t.status] = (statusCounts[t.status] || 0) + 1;
  });
  console.log(`[Home] Status distribution:`, statusCounts);

  // Debug: Count completed tasks
  const completedTasks = normalized.filter(t => t.status === 'COMPLETED');
  console.log(`[Home] Completed tasks: ${completedTasks.length}`);

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

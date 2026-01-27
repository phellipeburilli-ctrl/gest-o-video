import { sql } from '@vercel/postgres';
import { TaskStatusEvent, TaskWorkingTime, TaskTimeInterval, WORKING_STATUSES, END_STATUSES } from '@/types';

export class TimeTrackingService {

    /**
     * Fetches all status history events for a specific task
     */
    async getTaskStatusHistory(taskId: string): Promise<TaskStatusEvent[]> {
        try {
            const result = await sql`
                SELECT
                    id,
                    task_id,
                    task_name,
                    previous_status,
                    new_status,
                    editor_id,
                    editor_name,
                    event_timestamp,
                    created_at
                FROM task_status_history
                WHERE task_id = ${taskId}
                ORDER BY event_timestamp ASC
            `;

            return result.rows.map(row => ({
                id: row.id,
                taskId: row.task_id,
                taskName: row.task_name,
                previousStatus: row.previous_status,
                newStatus: row.new_status,
                editorId: row.editor_id,
                editorName: row.editor_name,
                eventTimestamp: parseInt(row.event_timestamp),
                createdAt: row.created_at
            }));
        } catch (error) {
            console.error(`[TimeTracking] Error fetching history for task ${taskId}:`, error);
            return [];
        }
    }

    /**
     * Fetches status history for multiple tasks in a single query (batch)
     */
    async getStatusHistoryForTasks(taskIds: string[]): Promise<Map<string, TaskStatusEvent[]>> {
        if (taskIds.length === 0) {
            return new Map();
        }

        try {
            // Convert array to PostgreSQL array format for ANY() clause
            const taskIdsArray = `{${taskIds.join(',')}}`;

            const result = await sql`
                SELECT
                    id,
                    task_id,
                    task_name,
                    previous_status,
                    new_status,
                    editor_id,
                    editor_name,
                    event_timestamp,
                    created_at
                FROM task_status_history
                WHERE task_id = ANY(${taskIdsArray}::text[])
                ORDER BY task_id, event_timestamp ASC
            `;

            // Group by task_id
            const historyMap = new Map<string, TaskStatusEvent[]>();

            for (const row of result.rows) {
                const event: TaskStatusEvent = {
                    id: row.id,
                    taskId: row.task_id,
                    taskName: row.task_name,
                    previousStatus: row.previous_status,
                    newStatus: row.new_status,
                    editorId: row.editor_id,
                    editorName: row.editor_name,
                    eventTimestamp: parseInt(row.event_timestamp),
                    createdAt: row.created_at
                };

                if (!historyMap.has(row.task_id)) {
                    historyMap.set(row.task_id, []);
                }
                historyMap.get(row.task_id)!.push(event);
            }

            return historyMap;
        } catch (error) {
            console.error('[TimeTracking] Error fetching batch history:', error);
            return new Map();
        }
    }

    /**
     * Checks if a status is considered "working" (active work)
     */
    isWorkingStatus(status: string): boolean {
        return WORKING_STATUSES.includes(status.toUpperCase());
    }

    /**
     * Checks if a status is considered "end" (completed)
     */
    isEndStatus(status: string): boolean {
        return END_STATUSES.includes(status.toUpperCase());
    }

    /**
     * Calculates total working time for a task based on status history.
     * Working time = sum of all intervals where task was in a "working" status
     * until it moved to an "end" status or another non-working status.
     */
    calculateWorkingTime(history: TaskStatusEvent[]): TaskWorkingTime {
        if (history.length === 0) {
            return {
                taskId: '',
                totalWorkingTimeMs: 0,
                intervals: []
            };
        }

        const taskId = history[0].taskId;
        const intervals: TaskTimeInterval[] = [];
        let currentWorkingStart: number | null = null;
        let currentWorkingStatus: string | null = null;

        for (let i = 0; i < history.length; i++) {
            const event = history[i];
            const newStatus = event.newStatus.toUpperCase();

            // If entering a working status
            if (this.isWorkingStatus(newStatus)) {
                if (currentWorkingStart === null) {
                    // Start a new working interval
                    currentWorkingStart = event.eventTimestamp;
                    currentWorkingStatus = newStatus;
                }
                // If already in working status, continue (don't reset)
            }
            // If leaving working status (to any non-working status)
            else if (currentWorkingStart !== null) {
                // End the current interval
                const endTimestamp = event.eventTimestamp;
                const durationMs = endTimestamp - currentWorkingStart;

                intervals.push({
                    taskId,
                    status: currentWorkingStatus!,
                    startTimestamp: currentWorkingStart,
                    endTimestamp,
                    durationMs
                });

                currentWorkingStart = null;
                currentWorkingStatus = null;
            }
        }

        // If task is still in working status (no end event yet)
        if (currentWorkingStart !== null) {
            const now = Date.now();
            const durationMs = now - currentWorkingStart;

            intervals.push({
                taskId,
                status: currentWorkingStatus!,
                startTimestamp: currentWorkingStart,
                endTimestamp: null, // Still ongoing
                durationMs
            });
        }

        // Calculate total
        const totalWorkingTimeMs = intervals.reduce((sum, interval) => sum + interval.durationMs, 0);

        return {
            taskId,
            totalWorkingTimeMs,
            intervals
        };
    }

    /**
     * Calculates working time for multiple tasks efficiently
     * Returns a Map of taskId -> working time in milliseconds
     */
    async getWorkingTimeForTasks(taskIds: string[]): Promise<Map<string, number>> {
        const historyMap = await this.getStatusHistoryForTasks(taskIds);
        const workingTimeMap = new Map<string, number>();

        for (const [taskId, history] of historyMap) {
            const workingTime = this.calculateWorkingTime(history);
            workingTimeMap.set(taskId, workingTime.totalWorkingTimeMs);
        }

        // Ensure all requested task IDs have an entry (0 if no history)
        for (const taskId of taskIds) {
            if (!workingTimeMap.has(taskId)) {
                workingTimeMap.set(taskId, 0);
            }
        }

        return workingTimeMap;
    }

    /**
     * Gets detailed working time info for a single task
     */
    async getDetailedWorkingTime(taskId: string): Promise<TaskWorkingTime> {
        const history = await this.getTaskStatusHistory(taskId);
        return this.calculateWorkingTime(history);
    }
}

export const timeTrackingService = new TimeTrackingService();

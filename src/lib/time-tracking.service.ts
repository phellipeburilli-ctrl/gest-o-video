import { sql } from '@vercel/postgres';
import {
    TaskStatusEvent, TaskWorkingTime, TaskTimeInterval, TaskPhaseTime,
    WORKING_STATUSES, END_STATUSES, EDITING_START_STATUSES, EDITING_END_STATUSES,
    REVISION_STATUSES, APPROVAL_STATUSES
} from '@/types';

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
     * Checks if a status is the start of editing phase (VIDEO: EDITANDO)
     */
    isEditingStartStatus(status: string): boolean {
        return EDITING_START_STATUSES.some(s => status.toUpperCase().includes(s));
    }

    /**
     * Checks if a status is the end of editing phase (APROVADO)
     */
    isEditingEndStatus(status: string): boolean {
        return EDITING_END_STATUSES.some(s => status.toUpperCase().includes(s));
    }

    /**
     * Checks if a status is a revision/alteration status
     */
    isRevisionStatus(status: string): boolean {
        return REVISION_STATUSES.some(s => status.toUpperCase().includes(s));
    }

    /**
     * Checks if a status is approval status
     */
    isApprovalStatus(status: string): boolean {
        return APPROVAL_STATUSES.some(s => status.toUpperCase().includes(s));
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

    /**
     * Calculates editing time: from "VIDEO: EDITANDO" to "APROVADO"
     * This is the specific metric for video editors
     */
    calculateEditingTime(history: TaskStatusEvent[]): TaskWorkingTime {
        if (history.length === 0) {
            return {
                taskId: '',
                totalWorkingTimeMs: 0,
                intervals: []
            };
        }

        const taskId = history[0].taskId;
        const intervals: TaskTimeInterval[] = [];
        let editingStartTime: number | null = null;
        let editingStartStatus: string | null = null;

        for (let i = 0; i < history.length; i++) {
            const event = history[i];
            const newStatus = event.newStatus.toUpperCase();

            // Check if entering editing status (VIDEO: EDITANDO)
            if (this.isEditingStartStatus(newStatus)) {
                if (editingStartTime === null) {
                    editingStartTime = event.eventTimestamp;
                    editingStartStatus = newStatus;
                    console.log(`[TimeTracking] Task ${taskId}: Started editing at ${new Date(editingStartTime).toISOString()}`);
                }
            }
            // Check if task is approved (end of editing phase)
            else if (this.isEditingEndStatus(newStatus) && editingStartTime !== null) {
                const endTimestamp = event.eventTimestamp;
                const durationMs = endTimestamp - editingStartTime;

                intervals.push({
                    taskId,
                    status: editingStartStatus || 'EDITANDO',
                    startTimestamp: editingStartTime,
                    endTimestamp,
                    durationMs
                });

                console.log(`[TimeTracking] Task ${taskId}: Approved! Editing time = ${(durationMs / 3600000).toFixed(2)}h`);

                // Reset for potential re-editing cycles
                editingStartTime = null;
                editingStartStatus = null;
            }
        }

        // If still editing (not yet approved)
        if (editingStartTime !== null) {
            const now = Date.now();
            const durationMs = now - editingStartTime;

            intervals.push({
                taskId,
                status: editingStartStatus || 'EDITANDO',
                startTimestamp: editingStartTime,
                endTimestamp: null, // Still in progress
                durationMs
            });

            console.log(`[TimeTracking] Task ${taskId}: Still editing, current time = ${(durationMs / 3600000).toFixed(2)}h`);
        }

        const totalWorkingTimeMs = intervals.reduce((sum, interval) => sum + interval.durationMs, 0);

        return {
            taskId,
            totalWorkingTimeMs,
            intervals
        };
    }

    /**
     * Calculates editing time (EDITANDO -> APROVADO) for multiple tasks
     * Returns a Map of taskId -> editing time in milliseconds
     */
    async getEditingTimeForTasks(taskIds: string[]): Promise<Map<string, number>> {
        const historyMap = await this.getStatusHistoryForTasks(taskIds);
        const editingTimeMap = new Map<string, number>();

        for (const [taskId, history] of historyMap) {
            const editingTime = this.calculateEditingTime(history);
            editingTimeMap.set(taskId, editingTime.totalWorkingTimeMs);
        }

        // Ensure all requested task IDs have an entry (0 if no history)
        for (const taskId of taskIds) {
            if (!editingTimeMap.has(taskId)) {
                editingTimeMap.set(taskId, 0);
            }
        }

        return editingTimeMap;
    }

    /**
     * Calculates time spent in each phase of the workflow
     * Phases: EDITANDO, REVISÃO/ALTERAÇÃO, APROVADO
     */
    calculatePhaseTime(history: TaskStatusEvent[]): TaskPhaseTime {
        const result: TaskPhaseTime = {
            editingTimeMs: 0,
            revisionTimeMs: 0,
            approvalTimeMs: 0,
            totalTimeMs: 0
        };

        if (history.length === 0) {
            return result;
        }

        let currentPhaseStart: number | null = null;
        let currentPhase: 'editing' | 'revision' | 'approval' | null = null;

        for (let i = 0; i < history.length; i++) {
            const event = history[i];
            const newStatus = event.newStatus.toUpperCase();

            // Determine the new phase
            let newPhase: 'editing' | 'revision' | 'approval' | 'end' | null = null;

            if (this.isEditingStartStatus(newStatus)) {
                newPhase = 'editing';
            } else if (this.isRevisionStatus(newStatus)) {
                newPhase = 'revision';
            } else if (this.isApprovalStatus(newStatus)) {
                newPhase = 'approval';
            } else if (this.isEndStatus(newStatus)) {
                newPhase = 'end';
            }

            // If we were in a phase and changed, calculate time
            if (currentPhaseStart !== null && currentPhase !== null && newPhase !== null) {
                const duration = event.eventTimestamp - currentPhaseStart;

                switch (currentPhase) {
                    case 'editing':
                        result.editingTimeMs += duration;
                        break;
                    case 'revision':
                        result.revisionTimeMs += duration;
                        break;
                    case 'approval':
                        result.approvalTimeMs += duration;
                        break;
                }
            }

            // Start new phase
            if (newPhase && newPhase !== 'end') {
                currentPhaseStart = event.eventTimestamp;
                currentPhase = newPhase;
            } else if (newPhase === 'end') {
                currentPhaseStart = null;
                currentPhase = null;
            }
        }

        // If still in a phase, calculate ongoing time
        if (currentPhaseStart !== null && currentPhase !== null) {
            const now = Date.now();
            const duration = now - currentPhaseStart;

            switch (currentPhase) {
                case 'editing':
                    result.editingTimeMs += duration;
                    break;
                case 'revision':
                    result.revisionTimeMs += duration;
                    break;
                case 'approval':
                    result.approvalTimeMs += duration;
                    break;
            }
        }

        // Calculate total time from first to last event (or now if ongoing)
        if (history.length > 0) {
            const firstEvent = history[0];
            const lastEvent = history[history.length - 1];
            const isEnded = this.isEndStatus(lastEvent.newStatus.toUpperCase());

            result.totalTimeMs = isEnded
                ? lastEvent.eventTimestamp - firstEvent.eventTimestamp
                : Date.now() - firstEvent.eventTimestamp;
        }

        return result;
    }

    /**
     * Gets phase time for multiple tasks
     * Returns a Map of taskId -> TaskPhaseTime
     */
    async getPhaseTimeForTasks(taskIds: string[]): Promise<Map<string, TaskPhaseTime>> {
        const historyMap = await this.getStatusHistoryForTasks(taskIds);
        const phaseTimeMap = new Map<string, TaskPhaseTime>();

        for (const [taskId, history] of historyMap) {
            const phaseTime = this.calculatePhaseTime(history);
            phaseTimeMap.set(taskId, phaseTime);
        }

        // Ensure all requested task IDs have an entry
        const defaultPhaseTime: TaskPhaseTime = {
            editingTimeMs: 0,
            revisionTimeMs: 0,
            approvalTimeMs: 0,
            totalTimeMs: 0
        };

        for (const taskId of taskIds) {
            if (!phaseTimeMap.has(taskId)) {
                phaseTimeMap.set(taskId, { ...defaultPhaseTime });
            }
        }

        return phaseTimeMap;
    }
}

export const timeTrackingService = new TimeTrackingService();

import { ClickUpTask, TaskPhaseTime } from '@/types';
import { AUDIOVISUAL_TEAM_IDS } from './constants';

const CLICKUP_API_URL = 'https://api.clickup.com/api/v2';
const MAX_PAGES = 10; // Safety limit for pagination

// Data de início para filtrar tarefas (1 de Janeiro de 2026)
const START_DATE_2026 = new Date('2026-01-01T00:00:00Z').getTime();

export class ClickUpService {
    private apiKey: string;
    private listId: string;

    constructor() {
        this.apiKey = process.env.CLICKUP_API_KEY || '';
        this.listId = process.env.CLICKUP_LIST_ID || '';
    }

    /**
     * Fetches all tasks from the configured list, handling pagination.
     * Filters by "AUDIOVISUAL" tag OR if assignee is in the AUDIOVISUAL_TEAM_IDS list.
     */
    async fetchTasks(): Promise<ClickUpTask[]> {
        if (!this.apiKey || !this.listId) {
            console.error('ClickUp credentials missing');
            return [];
        }

        let allTasks: ClickUpTask[] = [];
        let page = 0;
        let hasMore = true;

        try {
            while (hasMore && page < MAX_PAGES) {
                // Filtrar tarefas criadas a partir de 1 de Janeiro de 2026
                const url = `${CLICKUP_API_URL}/list/${this.listId}/task?page=${page}&include_closed=true&subtasks=true&date_created_gt=${START_DATE_2026}`;
                console.log(`[ClickUp] Fetching page ${page}... URL: ${url}`);

                const response = await fetch(url, {
                    method: 'GET',
                    headers: {
                        'Authorization': this.apiKey,
                        'Content-Type': 'application/json',
                    },
                    cache: 'no-store', // Always fetch fresh data
                });

                if (!response.ok) {
                    const body = await response.text();
                    console.error(`[ClickUp] API Error: ${response.status} ${response.statusText} - Body: ${body}`);
                    throw new Error(`ClickUp API Error: ${response.statusText}`);
                }

                const data = await response.json();
                const tasks: ClickUpTask[] = data.tasks || [];

                console.log(`[ClickUp] Page ${page} fetched. Count: ${tasks.length}`);

                if (tasks.length > 0) {
                    // DEBUG: Log key fields of the first task to find where "Hours" are stored
                    const t = tasks[0];
                    console.log(`[ClickUp] Debug Task [${t.name}]:`, JSON.stringify({
                        status: t.status,
                        time_spent: t.time_spent,
                        date_created: t.date_created,
                        date_closed: t.date_closed,
                        custom_fields: t.custom_fields.map(f => ({ name: f.name, value: f.value, type: f.type }))
                    }, null, 2));
                }

                if (tasks.length === 0) {
                    hasMore = false;
                } else {
                    allTasks = [...allTasks, ...tasks];
                    page++;
                }
            }

            console.log(`[ClickUp] Total raw tasks fetched: ${allTasks.length}`);

            // MODIFIED FILTER: Check Tag OR Assignee ID
            const filteredTasks = allTasks.filter(task => {
                // Condition 0: Explicitly Exclude User 55083349
                if (task.assignees.some(u => u.id === 55083349)) return false;

                // Condition 1: Has "AUDIOVISUAL" Tag
                const hasTag = task.tags.some(tag => tag.name.toUpperCase() === 'AUDIOVISUAL');

                // Condition 2: Assigned to one of the Team Members
                const hasTeamMember = task.assignees.some(user => AUDIOVISUAL_TEAM_IDS.includes(user.id));

                const isValid = hasTag || hasTeamMember;

                if (!isValid && allTasks.length < 50) {
                    // console.log(`[ClickUp] Task '${task.name}' REJECTED. Tags: [${task.tags.map(t => t.name).join(', ')}] Assignees: [${task.assignees.map(u => u.id).join(', ')}]`);
                }
                return isValid;
            });

            console.log(`[ClickUp] Valid tasks after filter (Tag OR Team Member): ${filteredTasks.length}`);

            return filteredTasks;

        } catch (error) {
            console.error('Failed to fetch ClickUp tasks:', error);
            return [];
        }
    }

    /**
     * Fetches time in status history for a single task
     * Returns the time spent in each status
     */
    async fetchTaskTimeInStatus(taskId: string): Promise<{ [status: string]: { time: number; total_time: { by_minute: number; since: string } } } | null> {
        if (!this.apiKey) {
            return null;
        }

        try {
            const url = `${CLICKUP_API_URL}/task/${taskId}/time_in_status`;
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Authorization': this.apiKey,
                    'Content-Type': 'application/json',
                },
                cache: 'no-store',
            });

            if (!response.ok) {
                console.error(`[ClickUp] Time in status error for task ${taskId}: ${response.status}`);
                return null;
            }

            const data = await response.json();
            return data.current_status || data;
        } catch (error) {
            console.error(`[ClickUp] Failed to fetch time in status for task ${taskId}:`, error);
            return null;
        }
    }

    /**
     * Fetches time in status for multiple tasks and returns a map of taskId -> editing time in ms
     * Editing time = time in "video: editando" status (até APROVADO ou CONCLUÍDO)
     */
    async fetchEditingTimeForTasks(taskIds: string[]): Promise<Map<string, number>> {
        const editingTimeMap = new Map<string, number>();

        // Process in batches to avoid rate limiting
        const batchSize = 10;
        for (let i = 0; i < taskIds.length; i += batchSize) {
            const batch = taskIds.slice(i, i + batchSize);

            const promises = batch.map(async (taskId) => {
                const timeInStatus = await this.fetchTaskTimeInStatus(taskId);
                if (timeInStatus) {
                    // Look for "video: editando" or similar status
                    let editingTime = 0;
                    for (const [status, data] of Object.entries(timeInStatus)) {
                        const statusUpper = status.toUpperCase();
                        // Conta tempo em EDITANDO (este é o tempo que queremos medir)
                        if (statusUpper.includes('EDITANDO') || statusUpper.includes('VIDEO: EDITANDO')) {
                            // time is in milliseconds
                            const timeMs = (data as any).total_time?.by_minute * 60 * 1000 || (data as any).time || 0;
                            editingTime += timeMs;
                        }
                    }
                    editingTimeMap.set(taskId, editingTime);
                    if (editingTime > 0) {
                        console.log(`[ClickUp] Task ${taskId}: editing time = ${(editingTime / 3600000).toFixed(2)}h`);
                    }
                }
            });

            await Promise.all(promises);

            // Small delay between batches to avoid rate limiting
            if (i + batchSize < taskIds.length) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }

        return editingTimeMap;
    }

    /**
     * Fetches phase time (editing, revision, approval) for multiple tasks from ClickUp Time in Status API
     */
    async fetchPhaseTimeForTasks(taskIds: string[]): Promise<Map<string, TaskPhaseTime>> {
        const phaseTimeMap = new Map<string, TaskPhaseTime>();

        // Process in batches to avoid rate limiting
        const batchSize = 10;
        for (let i = 0; i < taskIds.length; i += batchSize) {
            const batch = taskIds.slice(i, i + batchSize);

            const promises = batch.map(async (taskId) => {
                const timeInStatus = await this.fetchTaskTimeInStatus(taskId);
                if (timeInStatus) {
                    const phaseTime: TaskPhaseTime = {
                        editingTimeMs: 0,
                        revisionTimeMs: 0,
                        approvalTimeMs: 0,
                        totalTimeMs: 0
                    };

                    for (const [status, data] of Object.entries(timeInStatus)) {
                        const statusUpper = status.toUpperCase();
                        const timeMs = (data as any).total_time?.by_minute * 60 * 1000 || (data as any).time || 0;

                        // Tempo em EDITANDO
                        if (statusUpper.includes('EDITANDO')) {
                            phaseTime.editingTimeMs += timeMs;
                        }
                        // Tempo em REVISÃO/ALTERAÇÃO
                        else if (statusUpper.includes('REVIS') || statusUpper.includes('ALTERA') || statusUpper.includes('AJUSTE') || statusUpper.includes('CORRE')) {
                            phaseTime.revisionTimeMs += timeMs;
                        }
                        // Tempo em APROVADO
                        else if (statusUpper.includes('APROVADO') || statusUpper.includes('APPROVED')) {
                            phaseTime.approvalTimeMs += timeMs;
                        }

                        // Total inclui todos os status
                        phaseTime.totalTimeMs += timeMs;
                    }

                    phaseTimeMap.set(taskId, phaseTime);

                    if (phaseTime.editingTimeMs > 0 || phaseTime.revisionTimeMs > 0) {
                        console.log(`[ClickUp] Task ${taskId}: editing=${(phaseTime.editingTimeMs / 3600000).toFixed(2)}h, revision=${(phaseTime.revisionTimeMs / 3600000).toFixed(2)}h`);
                    }
                }
            });

            await Promise.all(promises);

            // Small delay between batches to avoid rate limiting
            if (i + batchSize < taskIds.length) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }

        return phaseTimeMap;
    }
}

export const clickupService = new ClickUpService();

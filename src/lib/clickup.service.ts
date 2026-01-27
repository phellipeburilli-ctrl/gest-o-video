import { ClickUpTask, TaskPhaseTime } from '@/types';
import { AUDIOVISUAL_TEAM_IDS } from './constants';

const CLICKUP_API_URL = 'https://api.clickup.com/api/v2';
const MAX_PAGES = 10; // Safety limit for pagination

// Data de início para filtrar tarefas (1 de Janeiro de 2026)
const START_DATE_2026 = new Date('2026-01-01T00:00:00Z').getTime();

export class ClickUpService {
    private apiKey: string;
    private listIds: string[];
    private statusMap: Map<string, string> | null = null;

    constructor() {
        this.apiKey = process.env.CLICKUP_API_KEY || '';
        // Support multiple list IDs separated by newline, comma, or space
        const rawListId = process.env.CLICKUP_LIST_ID || '';
        this.listIds = rawListId
            .split(/[\n,\s]+/)
            .map(id => id.trim())
            .filter(id => id.length > 0);
        console.log(`[ClickUp] Initialized with ${this.listIds.length} list IDs: ${this.listIds.join(', ')}`);
    }

    /**
     * Fetches the status ID to name mapping from all configured lists
     */
    async getStatusMap(): Promise<Map<string, string>> {
        if (this.statusMap) {
            return this.statusMap;
        }

        this.statusMap = new Map<string, string>();

        for (const listId of this.listIds) {
            try {
                const url = `${CLICKUP_API_URL}/list/${listId}`;
                const response = await fetch(url, {
                    headers: { 'Authorization': this.apiKey },
                    cache: 'no-store',
                });

                if (!response.ok) {
                    console.error(`[ClickUp] Failed to fetch statuses for list ${listId}`);
                    continue;
                }

                const data = await response.json();
                const statuses = data.statuses || [];

                for (const status of statuses) {
                    this.statusMap.set(status.id, status.status);
                    console.log(`[ClickUp] Status mapping: ${status.id} -> ${status.status}`);
                }
            } catch (error) {
                console.error(`[ClickUp] Error fetching status map for list ${listId}:`, error);
            }
        }

        return this.statusMap;
    }

    /**
     * Fetches all tasks from ALL configured lists, handling pagination.
     * Filters by "AUDIOVISUAL" tag OR if assignee is in the AUDIOVISUAL_TEAM_IDS list.
     */
    async fetchTasks(): Promise<ClickUpTask[]> {
        if (!this.apiKey || this.listIds.length === 0) {
            console.error('ClickUp credentials missing');
            return [];
        }

        let allTasks: ClickUpTask[] = [];

        try {
            // Fetch from each list
            for (const listId of this.listIds) {
                console.log(`[ClickUp] Fetching tasks from list ${listId}...`);
                let page = 0;
                let hasMore = true;

                while (hasMore && page < MAX_PAGES) {
                    // Filtrar tarefas criadas a partir de 1 de Janeiro de 2026
                    const url = `${CLICKUP_API_URL}/list/${listId}/task?page=${page}&include_closed=true&subtasks=true&date_created_gt=${START_DATE_2026}`;
                    console.log(`[ClickUp] Fetching list ${listId}, page ${page}...`);

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
                        console.error(`[ClickUp] API Error for list ${listId}: ${response.status} ${response.statusText} - Body: ${body}`);
                        break; // Skip to next list instead of throwing
                    }

                    const data = await response.json();
                    const tasks: ClickUpTask[] = data.tasks || [];

                    console.log(`[ClickUp] List ${listId}, page ${page} fetched. Count: ${tasks.length}`);

                    if (tasks.length > 0 && page === 0) {
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
            }

            console.log(`[ClickUp] Total raw tasks fetched from all lists: ${allTasks.length}`);

            // MODIFIED FILTER: Check Tag OR Assignee ID
            const filteredTasks = allTasks.filter(task => {
                // Condition 0: Explicitly Exclude User 55083349
                if (task.assignees.some(u => u.id === 55083349)) return false;

                // Condition 1: Has "AUDIOVISUAL" Tag
                const hasTag = task.tags.some(tag => tag.name.toUpperCase() === 'AUDIOVISUAL');

                // Condition 2: Assigned to one of the Team Members
                const hasTeamMember = task.assignees.some(user => AUDIOVISUAL_TEAM_IDS.includes(user.id));

                const isValid = hasTag || hasTeamMember;

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
     * Returns the raw API response (which contains current_status with status IDs as keys)
     */
    async fetchTaskTimeInStatus(taskId: string): Promise<any | null> {
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
            // Return the full response so we can access current_status
            return data;
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
                const rawData = await this.fetchTaskTimeInStatus(taskId);
                if (rawData) {
                    // The API returns status_history as an ARRAY
                    const statusHistory = rawData.status_history || [];
                    let editingTime = 0;

                    for (const statusItem of statusHistory) {
                        const statusName = statusItem.status || '';
                        const statusUpper = statusName.toUpperCase();

                        // Conta tempo em VIDEO: EDITANDO
                        if (statusUpper === 'VIDEO: EDITANDO') {
                            const byMinute = statusItem.total_time?.by_minute || 0;
                            const timeMs = byMinute * 60 * 1000;
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
                        alterationTimeMs: 0,
                        approvalTimeMs: 0,
                        totalTimeMs: 0
                    };

                    // The API returns status_history as an ARRAY, not an object
                    // Each item has: status, color, type, total_time.by_minute, orderindex
                    const statusHistory = timeInStatus.status_history || [];

                    for (const statusItem of statusHistory) {
                        const statusName = statusItem.status || '';
                        const statusUpper = statusName.toUpperCase();

                        // Calculate time from total_time.by_minute (in minutes)
                        const byMinute = statusItem.total_time?.by_minute || 0;
                        const timeMs = byMinute * 60 * 1000;

                        if (timeMs > 0) {
                            console.log(`[ClickUp] Task ${taskId}: status "${statusName}" = ${(timeMs / 3600000).toFixed(2)}h`);
                        }

                        // Tempo em VIDEO: EDITANDO
                        if (statusUpper === 'VIDEO: EDITANDO') {
                            phaseTime.editingTimeMs += timeMs;
                        }
                        // Tempo em REVISÃO (PARA REVISÃO, REVISANDO)
                        else if (statusUpper === 'PARA REVISÃO' || statusUpper === 'REVISANDO') {
                            phaseTime.revisionTimeMs += timeMs;
                        }
                        // Tempo em ALTERAÇÃO (separado da revisão)
                        else if (statusUpper === 'ALTERAÇÃO') {
                            phaseTime.alterationTimeMs += timeMs;
                        }
                        // Tempo em APROVADO
                        else if (statusUpper === 'APROVADO') {
                            phaseTime.approvalTimeMs += timeMs;
                        }

                        // Total inclui todos os status
                        phaseTime.totalTimeMs += timeMs;
                    }

                    phaseTimeMap.set(taskId, phaseTime);

                    if (phaseTime.editingTimeMs > 0 || phaseTime.revisionTimeMs > 0 || phaseTime.alterationTimeMs > 0) {
                        console.log(`[ClickUp] Task ${taskId}: TOTAL editing=${(phaseTime.editingTimeMs / 3600000).toFixed(2)}h, revision=${(phaseTime.revisionTimeMs / 3600000).toFixed(2)}h, alteration=${(phaseTime.alterationTimeMs / 3600000).toFixed(2)}h`);
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

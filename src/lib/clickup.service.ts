import { ClickUpTask, TaskPhaseTime } from '@/types';
import { AUDIOVISUAL_TEAM_IDS, EXCLUDED_USER_IDS } from './constants';

const CLICKUP_API_URL = 'https://api.clickup.com/api/v2';
const MAX_PAGES = 10;

// Data de início para filtrar tarefas (1 de Janeiro de 2026)
const START_DATE_2026 = new Date('2026-01-01T00:00:00Z').getTime();

// Extract numeric list ID from various ClickUp URL formats
function extractListId(input: string): string {
    const dashMatch = input.match(/^6-(\d+)-\d+$/);
    if (dashMatch) {
        return dashMatch[1];
    }
    if (/^\d+$/.test(input)) {
        return input;
    }
    return input;
}

export class ClickUpService {
    private apiKey: string;
    private listIds: string[];
    private statusMap: Map<string, string> | null = null;

    constructor() {
        this.apiKey = process.env.CLICKUP_API_KEY || '';
        const rawListId = process.env.CLICKUP_LIST_ID || '';
        this.listIds = rawListId
            .split(/[\n,\s]+/)
            .map(id => id.trim())
            .filter(id => id.length > 0)
            .map(id => extractListId(id));
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
            for (const listId of this.listIds) {
                console.log(`[ClickUp] Fetching tasks from list ${listId}...`);
                let page = 0;
                let hasMore = true;

                while (hasMore && page < MAX_PAGES) {
                    const url = `${CLICKUP_API_URL}/list/${listId}/task?page=${page}&include_closed=true&subtasks=true&date_created_gt=${START_DATE_2026}`;
                    console.log(`[ClickUp] Fetching list ${listId}, page ${page}...`);

                    const response = await fetch(url, {
                        method: 'GET',
                        headers: {
                            'Authorization': this.apiKey,
                            'Content-Type': 'application/json',
                        },
                        cache: 'no-store',
                    });

                    if (!response.ok) {
                        const body = await response.text();
                        console.error(`[ClickUp] API Error for list ${listId}: ${response.status} ${response.statusText} - Body: ${body}`);
                        break;
                    }

                    const data = await response.json();
                    const tasks: ClickUpTask[] = data.tasks || [];

                    console.log(`[ClickUp] List ${listId}, page ${page} fetched. Count: ${tasks.length}`);

                    if (tasks.length > 0 && page === 0) {
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

            const filteredTasks = allTasks
                .map(task => {
                    const validAssignees = task.assignees.filter(
                        user => !EXCLUDED_USER_IDS.includes(user.id)
                    );
                    return {
                        ...task,
                        assignees: validAssignees
                    };
                })
                .filter(task => {
                    const hasTag = task.tags.some(tag => tag.name.toUpperCase() === 'AUDIOVISUAL');
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
                return null;
            }

            return await response.json();
        } catch (error) {
            console.error(`[ClickUp] Failed to fetch time in status for task ${taskId}:`, error);
            return null;
        }
    }

    /**
     * Fetches editing time for multiple tasks in parallel batches
     */
    async fetchEditingTimeForTasks(taskIds: string[]): Promise<Map<string, number>> {
        const editingTimeMap = new Map<string, number>();
        const batchSize = 10;

        for (let i = 0; i < taskIds.length; i += batchSize) {
            const batch = taskIds.slice(i, i + batchSize);

            const promises = batch.map(async (taskId) => {
                const rawData = await this.fetchTaskTimeInStatus(taskId);
                if (rawData) {
                    const statusHistory = rawData.status_history || [];
                    let editingTime = 0;

                    for (const statusItem of statusHistory) {
                        const statusName = statusItem.status || '';
                        const statusUpper = statusName.toUpperCase();

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

            if (i + batchSize < taskIds.length) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }

        return editingTimeMap;
    }

    /**
     * Fetches phase time (editing, revision, approval) for multiple tasks
     */
    async fetchPhaseTimeForTasks(taskIds: string[]): Promise<Map<string, TaskPhaseTime>> {
        const phaseTimeMap = new Map<string, TaskPhaseTime>();
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

                    const statusHistory = timeInStatus.status_history || [];

                    for (const statusItem of statusHistory) {
                        const statusName = statusItem.status || '';
                        const statusUpper = statusName.toUpperCase();
                        const byMinute = statusItem.total_time?.by_minute || 0;
                        const timeMs = byMinute * 60 * 1000;

                        if (timeMs > 0) {
                            console.log(`[ClickUp] Task ${taskId}: status "${statusName}" = ${(timeMs / 3600000).toFixed(2)}h`);
                        }

                        if (statusUpper === 'VIDEO: EDITANDO') {
                            phaseTime.editingTimeMs += timeMs;
                        } else if (statusUpper === 'PARA REVISÃO' || statusUpper === 'REVISANDO') {
                            phaseTime.revisionTimeMs += timeMs;
                        } else if (statusUpper === 'ALTERAÇÃO') {
                            phaseTime.alterationTimeMs += timeMs;
                        } else if (statusUpper === 'APROVADO') {
                            phaseTime.approvalTimeMs += timeMs;
                        }

                        phaseTime.totalTimeMs += timeMs;
                    }

                    phaseTimeMap.set(taskId, phaseTime);

                    if (phaseTime.editingTimeMs > 0 || phaseTime.revisionTimeMs > 0 || phaseTime.alterationTimeMs > 0) {
                        console.log(`[ClickUp] Task ${taskId}: TOTAL editing=${(phaseTime.editingTimeMs / 3600000).toFixed(2)}h, revision=${(phaseTime.revisionTimeMs / 3600000).toFixed(2)}h, alteration=${(phaseTime.alterationTimeMs / 3600000).toFixed(2)}h`);
                    }
                }
            });

            await Promise.all(promises);

            if (i + batchSize < taskIds.length) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }

        return phaseTimeMap;
    }

    /**
     * Fetches comments for a single task
     */
    async fetchTaskComments(taskId: string): Promise<any[]> {
        if (!this.apiKey) {
            return [];
        }

        try {
            const url = `${CLICKUP_API_URL}/task/${taskId}/comment`;
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Authorization': this.apiKey,
                    'Content-Type': 'application/json',
                },
                cache: 'no-store',
            });

            if (!response.ok) {
                console.error(`[ClickUp] Comments error for task ${taskId}: ${response.status}`);
                return [];
            }

            const data = await response.json();
            return data.comments || [];
        } catch (error) {
            console.error(`[ClickUp] Failed to fetch comments for task ${taskId}:`, error);
            return [];
        }
    }

    /**
     * Fetches tasks with their comments and extracts Frame.io links
     * Only searches in COMMENTS (not description)
     */
    async fetchTasksWithFrameIoLinks(tasks: ClickUpTask[]): Promise<{ task: ClickUpTask; frameIoLinks: string[]; comments: any[] }[]> {
        const results: { task: ClickUpTask; frameIoLinks: string[]; comments: any[] }[] = [];
        
        // Improved regex to catch all Frame.io URL variations
        const frameIoRegex = /https?:\/\/(?:[\w-]+\.)?(?:frame\.io|f\.io)\/[^\s<>"'\])}]+/gi;

        console.log(`[ClickUp] Searching Frame.io links in ${tasks.length} tasks...`);

        // Process in batches
        const batchSize = 5;
        for (let i = 0; i < tasks.length; i += batchSize) {
            const batch = tasks.slice(i, i + batchSize);

            const promises = batch.map(async (task) => {
                const comments = await this.fetchTaskComments(task.id);
                const allLinks: string[] = [];

                console.log(`[ClickUp] Task "${task.name}" (${task.id}): ${comments.length} comments`);

                // Search ONLY in comments
                for (const comment of comments) {
                    const commentText = comment.comment_text || '';
                    
                    // Log first 200 chars of each comment for debugging
                    if (commentText.length > 0) {
                        console.log(`[ClickUp] Comment preview: ${commentText.substring(0, 200)}...`);
                    }

                    const commentLinks = commentText.match(frameIoRegex) || [];
                    
                    if (commentLinks.length > 0) {
                        console.log(`[ClickUp] Found ${commentLinks.length} Frame.io links in task "${task.name}": ${commentLinks.join(', ')}`);
                    }

                    allLinks.push(...commentLinks);
                }

                // Remove duplicates
                const uniqueLinks = [...new Set(allLinks)];

                return {
                    task,
                    frameIoLinks: uniqueLinks,
                    comments
                };
            });

            const batchResults = await Promise.all(promises);
            results.push(...batchResults);

            // Rate limiting delay
            if (i + batchSize < tasks.length) {
                await new Promise(resolve => setTimeout(resolve, 200));
            }
        }

        const totalLinksFound = results.reduce((acc, r) => acc + r.frameIoLinks.length, 0);
        console.log(`[ClickUp] Total Frame.io links found: ${totalLinksFound}`);

        return results;
    }
}

export const clickupService = new ClickUpService();

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
                        console.error(`[ClickUp] API Error for list ${listId}: ${response.status} - ${body}`);
                        break;
                    }

                    const data = await response.json();
                    const tasks: ClickUpTask[] = data.tasks || [];

                    console.log(`[ClickUp] List ${listId}, page ${page}: ${tasks.length} tasks`);

                    if (tasks.length === 0) {
                        hasMore = false;
                    } else {
                        allTasks = [...allTasks, ...tasks];
                        page++;
                    }
                }
            }

            console.log(`[ClickUp] Total raw tasks: ${allTasks.length}`);

            const filteredTasks = allTasks
                .map(task => {
                    const validAssignees = task.assignees.filter(
                        user => !EXCLUDED_USER_IDS.includes(user.id)
                    );
                    return { ...task, assignees: validAssignees };
                })
                .filter(task => {
                    const hasTag = task.tags.some(tag => tag.name.toUpperCase() === 'AUDIOVISUAL');
                    const hasTeamMember = task.assignees.some(user => AUDIOVISUAL_TEAM_IDS.includes(user.id));
                    return hasTag || hasTeamMember;
                });

            console.log(`[ClickUp] Filtered tasks: ${filteredTasks.length}`);
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
        if (!this.apiKey) return null;

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

            if (!response.ok) return null;
            return await response.json();
        } catch (error) {
            return null;
        }
    }

    /**
     * Fetches comments for a single task
     */
    async fetchTaskComments(taskId: string): Promise<any[]> {
        if (!this.apiKey) return [];

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

            if (!response.ok) return [];
            const data = await response.json();
            return data.comments || [];
        } catch (error) {
            return [];
        }
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
     * Extracts Frame.io links from a comment's structured data
     */
    private extractFrameIoLinksFromComment(comment: any): string[] {
        const links: string[] = [];
        const frameIoPattern = /(?:frame\.io|f\.io)/i;
        const commentElements = comment.comment || [];

        for (const element of commentElements) {
            if (element.type === 'bookmark' && element.bookmark?.url) {
                const url = element.bookmark.url;
                if (frameIoPattern.test(url)) {
                    links.push(url);
                }
            }
            if (element.type === 'link_mention' && element.link_mention?.url) {
                const url = element.link_mention.url;
                if (frameIoPattern.test(url)) {
                    links.push(url);
                }
            }
        }

        // Fallback: check comment_text
        const commentText = comment.comment_text || '';
        const plainLinkRegex = /(?:https?:\/\/)?(?:[\w-]+\.)?(?:frame\.io|f\.io)\/[\w-]+/gi;
        const textMatches = commentText.match(plainLinkRegex) || [];

        for (const match of textMatches) {
            const fullUrl = match.startsWith('http') ? match : `https://${match}`;
            if (!links.includes(fullUrl)) {
                links.push(fullUrl);
            }
        }

        return links;
    }

    /**
     * Extracts all links (Frame.io and Google Docs) from a comment
     */
    private extractAllLinksFromComment(comment: any): { frameIoLinks: string[]; googleDocsLinks: string[] } {
        const frameIoLinks: string[] = [];
        const googleDocsLinks: string[] = [];
        const frameIoPattern = /(?:frame\.io|f\.io)/i;
        const googleDocsPattern = /docs\.google\.com/i;

        const commentElements = comment.comment || [];

        for (const element of commentElements) {
            if (element.type === 'bookmark' && element.bookmark?.url) {
                const url = element.bookmark.url;
                if (frameIoPattern.test(url)) {
                    frameIoLinks.push(url);
                } else if (googleDocsPattern.test(url)) {
                    googleDocsLinks.push(url);
                }
            }
            if (element.type === 'link_mention' && element.link_mention?.url) {
                const url = element.link_mention.url;
                if (frameIoPattern.test(url)) {
                    frameIoLinks.push(url);
                } else if (googleDocsPattern.test(url)) {
                    googleDocsLinks.push(url);
                }
            }
        }

        // Fallback: check comment_text
        const commentText = comment.comment_text || '';
        const plainLinkRegex = /(?:https?:\/\/)?(?:[\w-]+\.)?(?:frame\.io|f\.io|docs\.google\.com)\/[\w\-\/?=&#.]+/gi;
        const textMatches = commentText.match(plainLinkRegex) || [];

        for (const match of textMatches) {
            const fullUrl = match.startsWith('http') ? match : `https://${match}`;
            if (frameIoPattern.test(fullUrl) && !frameIoLinks.includes(fullUrl)) {
                frameIoLinks.push(fullUrl);
            } else if (googleDocsPattern.test(fullUrl) && !googleDocsLinks.includes(fullUrl)) {
                googleDocsLinks.push(fullUrl);
            }
        }

        return { frameIoLinks, googleDocsLinks };
    }

    /**
     * Fetches tasks with their comments and extracts Frame.io links
     */
    async fetchTasksWithFrameIoLinks(tasks: ClickUpTask[]): Promise<{ task: ClickUpTask; frameIoLinks: string[]; comments: any[] }[]> {
        const results: { task: ClickUpTask; frameIoLinks: string[]; comments: any[] }[] = [];
        const batchSize = 10;

        for (let i = 0; i < tasks.length; i += batchSize) {
            const batch = tasks.slice(i, i + batchSize);

            const promises = batch.map(async (task) => {
                const comments = await this.fetchTaskComments(task.id);
                const allLinks: string[] = [];

                for (const comment of comments) {
                    const commentLinks = this.extractFrameIoLinksFromComment(comment);
                    allLinks.push(...commentLinks);
                }

                return {
                    task,
                    frameIoLinks: [...new Set(allLinks)],
                    comments
                };
            });

            const batchResults = await Promise.all(promises);
            results.push(...batchResults);

            if (i + batchSize < tasks.length) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }

        return results;
    }

    /**
     * OPTIMIZED: Fetches feedback audit data using phaseTime (already fetched)
     * Uses alterationTimeMs > 0 to determine if task had alteration
     */
    async fetchFeedbackAuditDataOptimized(
        tasks: ClickUpTask[],
        phaseTimeMap: Map<string, TaskPhaseTime>
    ): Promise<{
        task: ClickUpTask;
        hadAlteration: boolean;
        frameIoLinks: string[];
        googleDocsLinks: string[];
        comments: any[];
    }[]> {
        const results: {
            task: ClickUpTask;
            hadAlteration: boolean;
            frameIoLinks: string[];
            googleDocsLinks: string[];
            comments: any[];
        }[] = [];

        // Filter completed tasks
        const completedTasks = tasks.filter(task => {
            const status = (task.status.status || '').toLowerCase();
            return status.includes('aprovado') || status.includes('conclu');
        });

        console.log(`[ClickUp] Audit: ${completedTasks.length} completed tasks`);

        // Process in larger batches since we already have phaseTime
        const batchSize = 15;
        for (let i = 0; i < completedTasks.length; i += batchSize) {
            const batch = completedTasks.slice(i, i + batchSize);

            const promises = batch.map(async (task) => {
                // Check alteration from phaseTimeMap (already fetched!)
                const phaseTime = phaseTimeMap.get(task.id);
                const hadAlteration = phaseTime ? phaseTime.alterationTimeMs > 0 : false;

                // Only fetch comments if had alteration (saves API calls)
                let comments: any[] = [];
                let allFrameIoLinks: string[] = [];
                let allGoogleDocsLinks: string[] = [];

                if (hadAlteration) {
                    comments = await this.fetchTaskComments(task.id);
                    for (const comment of comments) {
                        const { frameIoLinks, googleDocsLinks } = this.extractAllLinksFromComment(comment);
                        allFrameIoLinks.push(...frameIoLinks);
                        allGoogleDocsLinks.push(...googleDocsLinks);
                    }
                }

                return {
                    task,
                    hadAlteration,
                    frameIoLinks: [...new Set(allFrameIoLinks)],
                    googleDocsLinks: [...new Set(allGoogleDocsLinks)],
                    comments
                };
            });

            const batchResults = await Promise.all(promises);
            results.push(...batchResults);

            if (i + batchSize < completedTasks.length) {
                await new Promise(resolve => setTimeout(resolve, 50));
            }
        }

        const withAlteration = results.filter(r => r.hadAlteration).length;
        console.log(`[ClickUp] Audit complete: ${withAlteration}/${results.length} with alteration`);

        return results;
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
                }
            });

            await Promise.all(promises);

            if (i + batchSize < taskIds.length) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }

        return editingTimeMap;
    }
}

export const clickupService = new ClickUpService();

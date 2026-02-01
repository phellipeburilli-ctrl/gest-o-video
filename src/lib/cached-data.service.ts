/**
 * Centralized Data Cache Service
 * Caches all dashboard data for 5 minutes to avoid repeated API calls
 */

import { clickupService } from './clickup.service';
import { dataService } from './data-service';
import { timeTrackingService } from './time-tracking.service';
import { calculateAllInsights, InsightsData } from './insights.service';
import { ClickUpTask, TaskPhaseTime, NormalizedTask, DashboardKPIs } from '@/types';
import { AUDIOVISUAL_TEAM_IDS } from './constants';

interface CachedData {
    tasks: ClickUpTask[];
    phaseTimeMap: Map<string, TaskPhaseTime>;
    normalized: NormalizedTask[];
    kpis: DashboardKPIs;
    audiovisualTasks: ClickUpTask[];
    timestamp: number;
}

// Cache duration: 5 minutes
const CACHE_DURATION_MS = 5 * 60 * 1000;

// Global cache (persists across requests in same server instance)
let cachedData: CachedData | null = null;

/**
 * Gets all dashboard data, using cache if available
 */
export async function getCachedDashboardData(): Promise<CachedData> {
    const now = Date.now();

    // Return cached data if still valid
    if (cachedData && (now - cachedData.timestamp) < CACHE_DURATION_MS) {
        console.log('[Cache] Using cached data, age:', Math.round((now - cachedData.timestamp) / 1000), 'seconds');
        return cachedData;
    }

    console.log('[Cache] Fetching fresh data...');
    const startTime = Date.now();

    // Fetch tasks
    const tasks = await clickupService.fetchTasks();
    console.log(`[Cache] Fetched ${tasks.length} tasks in ${Date.now() - startTime}ms`);

    // Filter audiovisual tasks
    const audiovisualTasks = tasks.filter(task =>
        task.assignees?.some(a => AUDIOVISUAL_TEAM_IDS.includes(a.id))
    );

    // Get phase time data
    const taskIds = tasks.map(t => t.id);
    let phaseTimeMap: Map<string, TaskPhaseTime>;

    try {
        phaseTimeMap = await timeTrackingService.getPhaseTimeForTasks(taskIds);

        // Fill in missing data from ClickUp
        const tasksWithoutTime = taskIds.filter(id => {
            const phaseTime = phaseTimeMap.get(id);
            return !phaseTime || (phaseTime.editingTimeMs === 0 && phaseTime.revisionTimeMs === 0);
        });

        if (tasksWithoutTime.length > 0) {
            const clickupPhaseMap = await clickupService.fetchPhaseTimeForTasks(tasksWithoutTime);
            for (const [taskId, phaseTime] of clickupPhaseMap) {
                const existing = phaseTimeMap.get(taskId);
                if (!existing || (existing.editingTimeMs === 0 && existing.revisionTimeMs === 0)) {
                    phaseTimeMap.set(taskId, phaseTime);
                }
            }
        }
    } catch (error) {
        console.error('[Cache] Error fetching phase time:', error);
        phaseTimeMap = new Map();
    }

    // Normalize and calculate KPIs
    const normalized = dataService.normalizeTasks(tasks, phaseTimeMap);
    const kpis = dataService.calculateDashboardKPIs(normalized);

    const totalTime = Date.now() - startTime;
    console.log(`[Cache] Data ready in ${totalTime}ms`);

    // Store in cache
    cachedData = {
        tasks,
        phaseTimeMap,
        normalized,
        kpis,
        audiovisualTasks,
        timestamp: now
    };

    return cachedData;
}

/**
 * Gets data for Diagnóstico page
 */
export async function getDiagnosticoData() {
    const data = await getCachedDashboardData();

    // Calculate weekly data (week starts on Monday)
    const now = new Date();
    const startOfWeek = new Date(now);
    const dayOfWeek = now.getDay();
    const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Sunday = go back 6 days
    startOfWeek.setDate(now.getDate() - diffToMonday);
    startOfWeek.setHours(0, 0, 0, 0);

    const startOfLastWeek = new Date(startOfWeek);
    startOfLastWeek.setDate(startOfLastWeek.getDate() - 7);

    const thisWeekVideos = data.normalized.filter(v => {
        if (!v.dateClosed) return false;
        return v.dateClosed >= startOfWeek.getTime();
    });

    const lastWeekVideos = data.normalized.filter(v => {
        if (!v.dateClosed) return false;
        return v.dateClosed >= startOfLastWeek.getTime() && v.dateClosed < startOfWeek.getTime();
    });

    return {
        kpis: data.kpis,
        thisWeekVideos,
        lastWeekVideos,
        allVideos: data.normalized,
        lastUpdated: data.timestamp
    };
}

/**
 * Gets data for Evolução page
 */
export async function getEvolucaoData() {
    const data = await getCachedDashboardData();

    return {
        kpis: data.kpis,
        allVideos: data.normalized,
        lastUpdated: data.timestamp
    };
}

/**
 * Gets data for Relatórios page
 */
export async function getRelatoriosData() {
    const data = await getCachedDashboardData();

    return {
        kpis: data.kpis,
        allVideos: data.normalized,
        lastUpdated: data.timestamp
    };
}

/**
 * Gets data for Feedbacks page
 */
export async function getFeedbacksData() {
    const data = await getCachedDashboardData();

    // Get phase time for feedback audit
    const feedbackData = await clickupService.fetchFeedbackAuditDataOptimized(
        data.audiovisualTasks,
        data.phaseTimeMap
    );

    // Get tasks currently in "ALTERAÇÃO" status
    const tasksInAlteration = data.audiovisualTasks.filter(task => {
        const statusUpper = task.status.status.toUpperCase();
        return statusUpper.includes('ALTERA');
    });

    return {
        tasks: data.audiovisualTasks,
        feedbackData,
        currentAlterationTasks: tasksInAlteration,
        lastUpdated: data.timestamp
    };
}

/**
 * Invalidates the cache (useful for manual refresh)
 */
export function invalidateCache() {
    cachedData = null;
    console.log('[Cache] Cache invalidated');
}

/**
 * Gets cache status
 */
export function getCacheStatus() {
    if (!cachedData) {
        return { cached: false, age: 0 };
    }
    return {
        cached: true,
        age: Math.round((Date.now() - cachedData.timestamp) / 1000),
        tasksCount: cachedData.tasks.length
    };
}

/**
 * Gets data for Insights page
 * Analyzes editors who need help based on alteration rate, error patterns, and trends
 */
export async function getInsightsData(): Promise<InsightsData> {
    const data = await getCachedDashboardData();

    const now = new Date();

    // Período atual: últimas 2 semanas
    const twoWeeksAgo = new Date(now);
    twoWeeksAgo.setDate(now.getDate() - 14);
    twoWeeksAgo.setHours(0, 0, 0, 0);

    // Período anterior: 2 semanas antes disso
    const fourWeeksAgo = new Date(twoWeeksAgo);
    fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 14);

    // Helper para pegar data efetiva (dateClosed ou dateCreated para completed)
    const getEffectiveDate = (v: NormalizedTask): number | null => {
        if (v.dateClosed) return v.dateClosed;
        if (v.status === 'COMPLETED') return v.dateCreated;
        return null;
    };

    // Filtrar vídeos completados do período atual
    const currentVideos = data.normalized.filter(v => {
        if (v.status !== 'COMPLETED') return false;
        const date = getEffectiveDate(v);
        return date && date >= twoWeeksAgo.getTime();
    });

    // Filtrar vídeos completados do período anterior (para comparação)
    const previousVideos = data.normalized.filter(v => {
        if (v.status !== 'COMPLETED') return false;
        const date = getEffectiveDate(v);
        return date && date >= fourWeeksAgo.getTime() && date < twoWeeksAgo.getTime();
    });

    console.log(`[Insights] Current period: ${currentVideos.length} videos, Previous: ${previousVideos.length} videos`);

    // Calcular insights (sem feedbacks do Frame.io por enquanto - será adicionado depois)
    const insights = calculateAllInsights(currentVideos, previousVideos);

    return {
        ...insights,
        lastUpdated: data.timestamp
    };
}

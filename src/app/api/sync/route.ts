import { NextResponse } from 'next/server';
import { clickupService } from '@/lib/clickup.service';
import {
    upsertTask,
    upsertTaskPhaseMetrics,
    getEditorByClickupId,
    getEditorByName,
    upsertEditorMonthlyMetrics,
    saveDashboardSnapshot,
    getActiveEditors
} from '@/lib/db.service';
import { normalizeStatus, getVideoType, calculateAlterationRate } from '@/lib/utils';

// =====================================================
// API DE SINCRONIZAÇÃO - RODA TODO DIA ÀS 23:00H BRT
// =====================================================

export const maxDuration = 300; // 5 minutos max
export const dynamic = 'force-dynamic';

interface SyncResult {
    success: boolean;
    timestamp: string;
    stats: {
        tasksProcessed: number;
        tasksSaved: number;
        phaseMetricsSaved: number;
        monthlyMetricsSaved: number;
        snapshotSaved: boolean;
        errors: string[];
    };
}

export async function GET(request: Request) {
    // Verificar se é um cron job autorizado ou request manual
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    // Se tiver CRON_SECRET configurado, validar
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
        // Permitir também chamadas sem auth para testes manuais em dev
        const url = new URL(request.url);
        const forceSync = url.searchParams.get('force') === 'true';

        if (!forceSync) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
    }

    console.log('[Sync] Starting full database sync...');
    const startTime = Date.now();

    const result: SyncResult = {
        success: false,
        timestamp: new Date().toISOString(),
        stats: {
            tasksProcessed: 0,
            tasksSaved: 0,
            phaseMetricsSaved: 0,
            monthlyMetricsSaved: 0,
            snapshotSaved: false,
            errors: []
        }
    };

    try {
        // ========== 1. BUSCAR TASKS DO CLICKUP ==========
        console.log('[Sync] Fetching tasks from ClickUp...');
        const tasks = await clickupService.fetchTasks();
        result.stats.tasksProcessed = tasks.length;
        console.log(`[Sync] Found ${tasks.length} tasks`);

        if (tasks.length === 0) {
            result.stats.errors.push('No tasks found from ClickUp');
            return NextResponse.json(result);
        }

        // ========== 2. BUSCAR PHASE TIME PARA TODAS AS TASKS ==========
        console.log('[Sync] Fetching phase time for tasks...');
        const taskIds = tasks.map(t => t.id);
        const phaseTimeMap = await clickupService.fetchPhaseTimeForTasks(taskIds);
        console.log(`[Sync] Got phase time for ${phaseTimeMap.size} tasks`);

        // ========== 3. SALVAR TASKS NO BANCO ==========
        console.log('[Sync] Saving tasks to database...');

        for (const task of tasks) {
            try {
                // Encontrar editor
                const assignee = task.assignees[0];
                let editorId: number | null = null;
                let editorName: string | null = null;
                let clickupEditorId: number | null = null;

                if (assignee) {
                    clickupEditorId = assignee.id;
                    editorName = assignee.username || assignee.email?.split('@')[0] || null;

                    // Tentar encontrar no banco
                    const dbEditor = await getEditorByClickupId(assignee.id);
                    if (dbEditor) {
                        editorId = dbEditor.id;
                        editorName = dbEditor.name;
                    }
                }

                // Normalizar status
                const normalizedStatus = normalizeStatus(task.status?.status || 'open');
                const videoType = getVideoType(task);

                // Upsert task
                await upsertTask({
                    id: task.id,
                    title: task.name,
                    status: normalizedStatus,
                    raw_status: task.status?.status || null,
                    editor_id: editorId,
                    editor_name: editorName,
                    clickup_editor_id: clickupEditorId,
                    date_created: parseInt(task.date_created),
                    date_closed: task.date_closed ? parseInt(task.date_closed) : null,
                    time_tracked_ms: task.time_spent || 0,
                    video_type: videoType,
                    link: task.url || null,
                    tags: task.tags?.map(t => t.name) || []
                });

                result.stats.tasksSaved++;

                // Salvar phase metrics se existir
                const phaseTime = phaseTimeMap.get(task.id);
                if (phaseTime) {
                    await upsertTaskPhaseMetrics({
                        task_id: task.id,
                        editing_time_ms: phaseTime.editingTimeMs,
                        revision_time_ms: phaseTime.revisionTimeMs,
                        alteration_time_ms: phaseTime.alterationTimeMs,
                        approval_time_ms: phaseTime.approvalTimeMs,
                        total_time_ms: phaseTime.totalTimeMs,
                        had_alteration: phaseTime.alterationTimeMs > 0
                    });
                    result.stats.phaseMetricsSaved++;
                }

            } catch (error) {
                const errorMsg = `Error saving task ${task.id}: ${error instanceof Error ? error.message : 'Unknown'}`;
                console.error(`[Sync] ${errorMsg}`);
                result.stats.errors.push(errorMsg);
            }
        }

        // ========== 4. CALCULAR MÉTRICAS MENSAIS POR EDITOR ==========
        console.log('[Sync] Calculating monthly metrics per editor...');

        const currentDate = new Date();
        const yearMonth = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`;

        // Agrupar tasks por editor
        const tasksByEditor = new Map<string, typeof tasks>();

        for (const task of tasks) {
            const assignee = task.assignees[0];
            if (!assignee) continue;

            const editorKey = assignee.username || assignee.email?.split('@')[0] || `user_${assignee.id}`;

            if (!tasksByEditor.has(editorKey)) {
                tasksByEditor.set(editorKey, []);
            }
            tasksByEditor.get(editorKey)!.push(task);
        }

        // Calcular métricas para cada editor
        const editors = await getActiveEditors();

        for (const editor of editors) {
            try {
                const editorTasks = tasksByEditor.get(editor.name) || [];

                // Filtrar tasks completadas do mês atual
                const monthStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).getTime();
                const completedTasks = editorTasks.filter(t => {
                    const status = (t.status?.status || '').toLowerCase();
                    const isCompleted = status.includes('aprovado') || status.includes('conclu');
                    const dateClosed = t.date_closed ? parseInt(t.date_closed) : 0;
                    return isCompleted && dateClosed >= monthStart;
                });

                // Calcular métricas
                let totalEditingMs = 0;
                let totalAlterationMs = 0;
                let videosWithAlteration = 0;

                for (const task of completedTasks) {
                    const phaseTime = phaseTimeMap.get(task.id);
                    if (phaseTime) {
                        totalEditingMs += phaseTime.editingTimeMs;
                        totalAlterationMs += phaseTime.alterationTimeMs;
                        if (phaseTime.alterationTimeMs > 0) {
                            videosWithAlteration++;
                        }
                    }
                }

                const totalVideos = completedTasks.length;
                const alterationRate = calculateAlterationRate(videosWithAlteration, totalVideos);
                const totalEditingHours = totalEditingMs / (1000 * 60 * 60);
                const avgEditingHours = totalVideos > 0 ? totalEditingHours / totalVideos : 0;
                const totalAlterationHours = totalAlterationMs / (1000 * 60 * 60);

                // Calcular meses na empresa
                let monthsInCompany = 0;
                if (editor.admission_date) {
                    const admissionDate = new Date(editor.admission_date);
                    const diffMs = currentDate.getTime() - admissionDate.getTime();
                    monthsInCompany = Math.floor(diffMs / (1000 * 60 * 60 * 24 * 30));
                }

                // Determinar status de evolução
                let evolutionStatus = 'on_track';
                if (alterationRate > 30) {
                    evolutionStatus = 'needs_attention';
                } else if (alterationRate > 20) {
                    evolutionStatus = 'warning';
                } else if (alterationRate <= 10 && totalVideos >= 5) {
                    evolutionStatus = 'excellent';
                }

                await upsertEditorMonthlyMetrics({
                    editor_id: editor.id,
                    editor_name: editor.name,
                    year_month: yearMonth,
                    total_videos: totalVideos,
                    videos_with_alteration: videosWithAlteration,
                    alteration_rate: alterationRate,
                    total_editing_hours: Math.round(totalEditingHours * 100) / 100,
                    avg_editing_hours: Math.round(avgEditingHours * 100) / 100,
                    total_alteration_hours: Math.round(totalAlterationHours * 100) / 100,
                    avg_lead_time_hours: 0, // TODO: calcular lead time
                    months_in_company: monthsInCompany,
                    evolution_status: evolutionStatus
                });

                result.stats.monthlyMetricsSaved++;

            } catch (error) {
                const errorMsg = `Error saving metrics for ${editor.name}: ${error instanceof Error ? error.message : 'Unknown'}`;
                console.error(`[Sync] ${errorMsg}`);
                result.stats.errors.push(errorMsg);
            }
        }

        // ========== 5. SALVAR SNAPSHOT DO DASHBOARD ==========
        console.log('[Sync] Saving dashboard snapshot...');

        try {
            // Calcular totais
            const completedTasks = tasks.filter(t => {
                const status = (t.status?.status || '').toLowerCase();
                return status.includes('aprovado') || status.includes('conclu');
            });

            let totalHours = 0;
            let totalAlterations = 0;

            for (const task of completedTasks) {
                const phaseTime = phaseTimeMap.get(task.id);
                if (phaseTime) {
                    totalHours += phaseTime.totalTimeMs / (1000 * 60 * 60);
                    if (phaseTime.alterationTimeMs > 0) {
                        totalAlterations++;
                    }
                }
            }

            // Contar por status
            const tasksByStatus: Record<string, number> = {};
            const tasksByType: Record<string, number> = {};
            const tasksByTeam: Record<string, number> = {};

            for (const task of tasks) {
                const status = normalizeStatus(task.status?.status || 'open');
                tasksByStatus[status] = (tasksByStatus[status] || 0) + 1;

                const videoType = getVideoType(task);
                if (videoType) {
                    tasksByType[videoType] = (tasksByType[videoType] || 0) + 1;
                }
            }

            // Encontrar top performer
            let topPerformer = { name: '', count: 0 };
            for (const [editorName, editorTasks] of tasksByEditor.entries()) {
                const completed = editorTasks.filter(t => {
                    const status = (t.status?.status || '').toLowerCase();
                    return status.includes('aprovado') || status.includes('conclu');
                }).length;

                if (completed > topPerformer.count) {
                    topPerformer = { name: editorName, count: completed };
                }
            }

            await saveDashboardSnapshot({
                snapshot_date: currentDate,
                year_month: yearMonth,
                total_videos: completedTasks.length,
                total_hours: Math.round(totalHours * 100) / 100,
                avg_hours_per_video: completedTasks.length > 0 ? Math.round((totalHours / completedTasks.length) * 100) / 100 : 0,
                avg_alteration_rate: completedTasks.length > 0 ? Math.round((totalAlterations / completedTasks.length) * 100) : 0,
                top_performer_name: topPerformer.name || undefined,
                top_performer_count: topPerformer.count || undefined,
                tasks_by_status: tasksByStatus,
                tasks_by_type: tasksByType,
                tasks_by_team: tasksByTeam
            });

            result.stats.snapshotSaved = true;

        } catch (error) {
            const errorMsg = `Error saving snapshot: ${error instanceof Error ? error.message : 'Unknown'}`;
            console.error(`[Sync] ${errorMsg}`);
            result.stats.errors.push(errorMsg);
        }

        // ========== FINALIZAR ==========
        const duration = Date.now() - startTime;
        console.log(`[Sync] Completed in ${duration}ms`);
        console.log(`[Sync] Stats: ${result.stats.tasksSaved} tasks, ${result.stats.phaseMetricsSaved} phase metrics, ${result.stats.monthlyMetricsSaved} monthly metrics`);

        result.success = result.stats.errors.length === 0;

        return NextResponse.json({
            ...result,
            duration_ms: duration
        });

    } catch (error) {
        console.error('[Sync] Fatal error:', error);
        result.stats.errors.push(`Fatal error: ${error instanceof Error ? error.message : 'Unknown'}`);

        return NextResponse.json(result, { status: 500 });
    }
}

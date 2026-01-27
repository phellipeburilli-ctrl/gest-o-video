import { ClickUpTask, NormalizedTask, EditorStats, DashboardKPIs, TaskPhaseTime, EditorPhaseMetrics } from '@/types';

export class DataService {

    /**
     * Normalizes raw ClickUp tasks into a clean format.
     * Handles time conversions and field extraction.
     * @param tasks - Raw tasks from ClickUp API
     * @param phaseTimeMap - Optional map of taskId -> TaskPhaseTime (from webhook history or ClickUp API)
     */
    normalizeTasks(tasks: ClickUpTask[], phaseTimeMap?: Map<string, TaskPhaseTime>): NormalizedTask[] {
        return tasks.map(task => {
            // 1. Extract Lead Time (Closed - Created)
            const created = parseInt(task.date_created);
            const closed = task.date_closed ? parseInt(task.date_closed) : null;

            // 2. Extract Editor (First Assignee)
            const assignee = task.assignees.length > 0 ? task.assignees[0] : null;

            // 3. Get phase time data
            const phaseTime = phaseTimeMap?.get(task.id);

            // 4. Extract Time Tracked (use editing time from phases as primary)
            let timeTrackedMs = 0;

            // First priority: Editing time from phase data
            if (phaseTime && phaseTime.editingTimeMs > 0) {
                timeTrackedMs = phaseTime.editingTimeMs;
                console.log(`[DataService] Task ${task.id}: Using phase editing time = ${(timeTrackedMs / 3600000).toFixed(2)}h`);
            }

            // Second priority: Native ClickUp time_spent
            if (timeTrackedMs === 0 && task.time_spent) {
                timeTrackedMs = task.time_spent;
            }

            // Third priority: Custom fields
            if (timeTrackedMs === 0) {
                const hoursField = task.custom_fields.find(f =>
                    ['horas', 'tempo', 'duração', 'time', 'duration', 'hours'].some(key => f.name.toLowerCase().includes(key))
                );
                if (hoursField?.value) {
                    const val = parseFloat(hoursField.value);
                    if (!isNaN(val)) {
                        if (val > 10000) timeTrackedMs = val; // Likely ms
                        else timeTrackedMs = val * 60 * 60 * 1000; // Assume hours, convert to ms
                    }
                }
            }

            // Final fallback: Use lead time (date_closed - date_created) if task is completed
            if (timeTrackedMs === 0 && closed) {
                timeTrackedMs = closed - created;
                console.log(`[DataService] Task ${task.id}: Using lead time fallback = ${(timeTrackedMs / 3600000).toFixed(2)}h`);
            }

            const timeTrackedHours = parseFloat((timeTrackedMs / (1000 * 60 * 60)).toFixed(2));

            // 5. Custom Fields (Video Type)
            const typeField = task.custom_fields.find(f =>
                ['tipo', 'type', 'categoria', 'category', 'formato'].some(key => f.name.toLowerCase().includes(key))
            );

            let videoType = 'Outros';
            if (typeField) {
                if (typeField.type_config?.options && typeof typeField.value === 'number') {
                    videoType = typeField.type_config.options[typeField.value]?.name || 'Outros';
                } else if (typeof typeField.value === 'string') {
                    videoType = typeField.value;
                }
            }

            // 6. Normalizing Status (Handle Portuguese)
            let normalizedStatus = task.status.status.toUpperCase();
            if (['CONCLUÍDO', 'CONCLUIDO', 'FINALIZADO', 'ENTREGUE', 'CLOSED', 'COMPLETE', 'DONE'].includes(normalizedStatus)) {
                normalizedStatus = 'COMPLETED';
            } else if (['EM ANDAMENTO', 'ANDAMENTO', 'FAZENDO', 'DOING', 'IN PROGRESS', 'RUNNING'].includes(normalizedStatus)) {
                normalizedStatus = 'IN PROGRESS';
            } else if (['REVISÃO', 'REVISAO', 'REVIEW', 'QA', 'APROVAÇÃO'].includes(normalizedStatus)) {
                normalizedStatus = 'REVIEW';
            }

            // Use username, but prefer full name if available
            const editorDisplayName = assignee
                ? (assignee.username || `User ${assignee.id}`)
                : 'Não Atribuído';

            return {
                id: task.id,
                title: task.name,
                status: normalizedStatus,
                rawStatus: task.status.status,
                editorName: editorDisplayName,
                editorId: assignee ? assignee.id : 0,
                dateCreated: created,
                dateClosed: closed,
                timeTrackedHours,
                videoType,
                tags: task.tags.map(t => t.name),
                phaseTime: phaseTime || undefined,
            };
        });
    }

    /**
     * Calculates phase metrics for an editor based on their completed videos
     */
    calculateEditorPhaseMetrics(videos: NormalizedTask[]): EditorPhaseMetrics {
        const completedVideos = videos.filter(v => ['COMPLETED', 'CLOSED', 'DONE'].includes(v.status) && v.phaseTime);

        if (completedVideos.length === 0) {
            return {
                avgEditingTimeHours: 0,
                avgRevisionTimeHours: 0,
                avgApprovalTimeHours: 0,
                avgTotalTimeHours: 0,
                totalEditingTimeHours: 0,
                totalRevisionTimeHours: 0,
                videosWithRevision: 0,
                revisionRate: 0
            };
        }

        let totalEditingMs = 0;
        let totalRevisionMs = 0;
        let totalApprovalMs = 0;
        let totalTimeMs = 0;
        let videosWithRevision = 0;

        completedVideos.forEach(video => {
            if (video.phaseTime) {
                totalEditingMs += video.phaseTime.editingTimeMs;
                totalRevisionMs += video.phaseTime.revisionTimeMs;
                totalApprovalMs += video.phaseTime.approvalTimeMs;
                totalTimeMs += video.phaseTime.totalTimeMs;

                if (video.phaseTime.revisionTimeMs > 0) {
                    videosWithRevision++;
                }
            }
        });

        const count = completedVideos.length;
        const msToHours = (ms: number) => ms / (1000 * 60 * 60);

        return {
            avgEditingTimeHours: parseFloat((msToHours(totalEditingMs) / count).toFixed(2)),
            avgRevisionTimeHours: parseFloat((msToHours(totalRevisionMs) / count).toFixed(2)),
            avgApprovalTimeHours: parseFloat((msToHours(totalApprovalMs) / count).toFixed(2)),
            avgTotalTimeHours: parseFloat((msToHours(totalTimeMs) / count).toFixed(2)),
            totalEditingTimeHours: parseFloat(msToHours(totalEditingMs).toFixed(2)),
            totalRevisionTimeHours: parseFloat(msToHours(totalRevisionMs).toFixed(2)),
            videosWithRevision,
            revisionRate: parseFloat(((videosWithRevision / count) * 100).toFixed(1))
        };
    }

    /**
     * Aggregates normalized tasks into Editor KPIs.
     */
    calculateDashboardKPIs(tasks: NormalizedTask[]): DashboardKPIs {
        const editorsMap = new Map<string, EditorStats>();

        // Initialize Global Counters
        let globalTotalVideos = 0;
        let globalTotalHours = 0;
        const tasksByStatus: { [key: string]: number } = {};
        const tasksByType: { [key: string]: number } = {};

        tasks.forEach(task => {
            const isCompleted = ['COMPLETED', 'CLOSED', 'DONE'].includes(task.status);

            if (!editorsMap.has(task.editorName)) {
                editorsMap.set(task.editorName, {
                    editorId: task.editorId || 0,
                    editorName: task.editorName,
                    totalVideos: 0,
                    totalHours: 0,
                    avgHoursPerVideo: 0,
                    avgLeadTimeHours: 0,
                    videos: []
                });
            }

            const stats = editorsMap.get(task.editorName)!;
            stats.videos.push(task);

            // Global Status Counts
            tasksByStatus[task.status] = (tasksByStatus[task.status] || 0) + 1;

            // Global Type Counts
            if (task.videoType) {
                tasksByType[task.videoType] = (tasksByType[task.videoType] || 0) + 1;
            }

            if (isCompleted) {
                stats.totalVideos += 1;
                stats.totalHours += task.timeTrackedHours;

                globalTotalVideos += 1;
                globalTotalHours += task.timeTrackedHours;

                // Lead Time: DateClosed - DateCreated
                if (task.dateClosed) {
                    const leadTimeMs = task.dateClosed - task.dateCreated;
                    const leadTimeHours = leadTimeMs / (1000 * 60 * 60);
                    stats.avgLeadTimeHours += leadTimeHours;
                }
            }
        });

        // Finalize Averages and calculate phase metrics
        const editors = Array.from(editorsMap.values()).map(stats => {
            if (stats.totalVideos > 0) {
                stats.avgHoursPerVideo = parseFloat((stats.totalHours / stats.totalVideos).toFixed(2));
                stats.avgLeadTimeHours = parseFloat((stats.avgLeadTimeHours / stats.totalVideos).toFixed(2));
            }

            // Calculate phase metrics for this editor
            stats.phaseMetrics = this.calculateEditorPhaseMetrics(stats.videos);

            return stats;
        });

        // Find Top Performer (by Volume)
        const topPerformer = editors.reduce((prev, current) =>
            (current.totalVideos > prev.totalVideos) ? current : prev
            , { editorName: '', totalVideos: -1 });

        return {
            totalVideos: globalTotalVideos,
            totalHours: parseFloat(globalTotalHours.toFixed(2)),
            avgHoursPerVideo: globalTotalVideos > 0 ? parseFloat((globalTotalHours / globalTotalVideos).toFixed(2)) : 0,
            topPerformer: topPerformer.totalVideos >= 0 ? { name: topPerformer.editorName, count: topPerformer.totalVideos } : null,
            editors,
            tasksByStatus,
            tasksByType
        };
    }
}

export const dataService = new DataService();

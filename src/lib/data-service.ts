import { ClickUpTask, NormalizedTask, EditorStats, DashboardKPIs } from '@/types';

export class DataService {

    /**
     * Normalizes raw ClickUp tasks into a clean format.
     * Handles time conversions and field extraction.
     * @param tasks - Raw tasks from ClickUp API
     * @param webhookTimeMap - Optional map of taskId -> working time in ms (from webhook history)
     */
    normalizeTasks(tasks: ClickUpTask[], webhookTimeMap?: Map<string, number>): NormalizedTask[] {
        return tasks.map(task => {
            // 1. Extract Lead Time (Closed - Created)
            const created = parseInt(task.date_created);
            const closed = task.date_closed ? parseInt(task.date_closed) : null;

            // 2. Extract Editor (First Assignee)
            const assignee = task.assignees.length > 0 ? task.assignees[0] : null;

            // 3. Extract Time Tracked
            // Priority: Webhook history -> time_spent (native) -> Custom Field "Horas" -> Fallback
            let timeTrackedMs = 0;

            // First priority: Time calculated from webhook status history
            if (webhookTimeMap && webhookTimeMap.has(task.id)) {
                timeTrackedMs = webhookTimeMap.get(task.id)!;
                if (timeTrackedMs > 0) {
                    console.log(`[DataService] Task ${task.id}: Using webhook time = ${(timeTrackedMs / 3600000).toFixed(2)}h`);
                }
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

            // 4. Custom Fields (Video Type)
            // Look for a field matching "Tipo", "Type", "Categoria"
            const typeField = task.custom_fields.find(f =>
                ['tipo', 'type', 'categoria', 'category', 'formato'].some(key => f.name.toLowerCase().includes(key))
            );

            let videoType = 'Outros';
            if (typeField) {
                if (typeField.type_config?.options && typeof typeField.value === 'number') {
                    // Dropdown index
                    videoType = typeField.type_config.options[typeField.value]?.name || 'Outros';
                } else if (typeof typeField.value === 'string') {
                    videoType = typeField.value;
                }
            }

            // 5. Normalizing Status (Handle Portuguese)
            let normalizedStatus = task.status.status.toUpperCase();
            if (['CONCLUÍDO', 'CONCLUIDO', 'FINALIZADO', 'ENTREGUE', 'CLOSED', 'COMPLETE', 'DONE'].includes(normalizedStatus)) {
                normalizedStatus = 'COMPLETED';
            } else if (['EM ANDAMENTO', 'ANDAMENTO', 'FAZENDO', 'DOING', 'IN PROGRESS', 'RUNNING'].includes(normalizedStatus)) {
                normalizedStatus = 'IN PROGRESS';
            } else if (['REVISÃO', 'REVISAO', 'REVIEW', 'QA', 'APROVAÇÃO'].includes(normalizedStatus)) {
                normalizedStatus = 'REVIEW';
            }

            // Use username, but prefer full name if available (some ClickUp users have both)
            const editorDisplayName = assignee
                ? (assignee.username || `User ${assignee.id}`)
                : 'Não Atribuído';

            return {
                id: task.id,
                title: task.name,
                status: normalizedStatus, // Use the normalized ENUM
                rawStatus: task.status.status, // Keep original for display if needed
                editorName: editorDisplayName,
                editorId: assignee ? assignee.id : 0,
                dateCreated: created,
                dateClosed: closed,
                timeTrackedHours,
                videoType,
                tags: task.tags.map(t => t.name),
            };
        });
    }

    /**
     * Aggregates normalized tasks into Editor KPIs.
     */
    calculateDashboardKPIs(tasks: NormalizedTask[]): DashboardKPIs {
        const editorsMap = new Map<string, EditorStats>(); // Key: EditorName for simplicity, usually ID

        // Initialize Global Counters
        let globalTotalVideos = 0;
        let globalTotalHours = 0;
        const tasksByStatus: { [key: string]: number } = {};
        const tasksByType: { [key: string]: number } = {};

        tasks.forEach(task => {
            // Filter for Completed/Closed tasks only for Performance Metrics? 
            // User asked for "Volume: Videos Entregues (Status Completed/Closed)"
            // So we consider "Entregues" as closed or completed.
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
                    // We store sum temporarily in avgLeadTimeHours to calculate avg later
                    stats.avgLeadTimeHours += leadTimeHours;
                }
            }
        });

        // Finalize Averages
        const editors = Array.from(editorsMap.values()).map(stats => {
            if (stats.totalVideos > 0) {
                stats.avgHoursPerVideo = parseFloat((stats.totalHours / stats.totalVideos).toFixed(2));
                stats.avgLeadTimeHours = parseFloat((stats.avgLeadTimeHours / stats.totalVideos).toFixed(2)); // Divide sum by count
            }
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

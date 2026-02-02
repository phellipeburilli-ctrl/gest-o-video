import { sql } from '@vercel/postgres';

// =====================================================
// SERVIÇO DE BANCO DE DADOS - NEON/VERCEL POSTGRES
// =====================================================

// -------------------- TIPOS --------------------

export interface DbTeam {
    id: string;
    name: string;
    short_name: string;
    description: string | null;
    color: string;
    created_at: Date;
    updated_at: Date;
}

export interface DbEditor {
    id: number;
    clickup_id: number | null;
    name: string;
    email: string | null;
    role: 'leader' | 'editor';
    color: string;
    team_id: string | null;
    admission_date: Date | null;
    promotion_date: Date | null;
    status: 'active' | 'inactive' | 'promoted';
    created_at: Date;
    updated_at: Date;
}

export interface DbTask {
    id: string;
    title: string;
    status: string;
    raw_status: string | null;
    editor_id: number | null;
    editor_name: string | null;
    clickup_editor_id: number | null;
    date_created: number;
    date_closed: number | null;
    time_tracked_ms: number;
    video_type: string | null;
    link: string | null;
    tags: string[];
    created_at: Date;
    updated_at: Date;
}

export interface DbTaskPhaseMetrics {
    id: number;
    task_id: string;
    editing_time_ms: number;
    revision_time_ms: number;
    alteration_time_ms: number;
    approval_time_ms: number;
    total_time_ms: number;
    had_alteration: boolean;
    created_at: Date;
}

export interface DbOneOnOneRecord {
    id: number;
    editor_id: number | null;
    editor_name: string;
    team_name: string | null;
    last_one_on_one: Date | null;
    next_suggested_date: Date | null;
    notes: string | null;
    status: 'ok' | 'pending' | 'overdue';
    created_at: Date;
    updated_at: Date;
}

export interface DbEditorMonthlyMetrics {
    id: number;
    editor_id: number | null;
    editor_name: string;
    year_month: string;
    total_videos: number;
    videos_with_alteration: number;
    alteration_rate: number;
    total_editing_hours: number;
    avg_editing_hours: number;
    total_alteration_hours: number;
    avg_lead_time_hours: number;
    months_in_company: number;
    evolution_status: string | null;
    created_at: Date;
}

// -------------------- EQUIPES --------------------

export async function getTeams(): Promise<DbTeam[]> {
    const result = await sql<DbTeam>`SELECT * FROM teams ORDER BY name`;
    return result.rows;
}

export async function getTeamById(id: string): Promise<DbTeam | null> {
    const result = await sql<DbTeam>`SELECT * FROM teams WHERE id = ${id}`;
    return result.rows[0] || null;
}

// -------------------- EDITORES --------------------

export async function getEditors(): Promise<DbEditor[]> {
    const result = await sql<DbEditor>`SELECT * FROM editors ORDER BY name`;
    return result.rows;
}

export async function getActiveEditors(): Promise<DbEditor[]> {
    const result = await sql<DbEditor>`
        SELECT * FROM editors
        WHERE status = 'active'
        ORDER BY name
    `;
    return result.rows;
}

export async function getEditorById(id: number): Promise<DbEditor | null> {
    const result = await sql<DbEditor>`SELECT * FROM editors WHERE id = ${id}`;
    return result.rows[0] || null;
}

export async function getEditorByClickupId(clickupId: number): Promise<DbEditor | null> {
    const result = await sql<DbEditor>`SELECT * FROM editors WHERE clickup_id = ${clickupId}`;
    return result.rows[0] || null;
}

export async function getEditorByName(name: string): Promise<DbEditor | null> {
    const result = await sql<DbEditor>`
        SELECT * FROM editors
        WHERE LOWER(name) = LOWER(${name})
    `;
    return result.rows[0] || null;
}

export async function getEditorsByTeam(teamId: string): Promise<DbEditor[]> {
    const result = await sql<DbEditor>`
        SELECT * FROM editors
        WHERE team_id = ${teamId} AND status = 'active'
        ORDER BY name
    `;
    return result.rows;
}

export async function upsertEditor(editor: Partial<DbEditor> & { clickup_id: number; name: string }): Promise<DbEditor> {
    const admissionDateStr = editor.admission_date ? editor.admission_date.toISOString().split('T')[0] : null;
    const result = await sql<DbEditor>`
        INSERT INTO editors (clickup_id, name, email, role, color, team_id, admission_date, status)
        VALUES (
            ${editor.clickup_id},
            ${editor.name},
            ${editor.email || null},
            ${editor.role || 'editor'},
            ${editor.color || '#6B7280'},
            ${editor.team_id || null},
            ${admissionDateStr},
            ${editor.status || 'active'}
        )
        ON CONFLICT (clickup_id) DO UPDATE SET
            name = EXCLUDED.name,
            email = COALESCE(EXCLUDED.email, editors.email),
            role = COALESCE(EXCLUDED.role, editors.role),
            color = COALESCE(EXCLUDED.color, editors.color),
            team_id = COALESCE(EXCLUDED.team_id, editors.team_id),
            updated_at = CURRENT_TIMESTAMP
        RETURNING *
    `;
    return result.rows[0];
}

export async function updateEditorAdmissionDate(editorId: number, admissionDate: Date): Promise<void> {
    await sql`
        UPDATE editors
        SET admission_date = ${admissionDate.toISOString()}, updated_at = CURRENT_TIMESTAMP
        WHERE id = ${editorId}
    `;
}

export async function promoteEditor(editorId: number, promotionDate: Date): Promise<void> {
    await sql`
        UPDATE editors
        SET promotion_date = ${promotionDate.toISOString()},
            status = 'promoted',
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ${editorId}
    `;
}

// -------------------- TASKS --------------------

export async function upsertTask(task: Partial<DbTask> & { id: string; title: string; status: string; date_created: number }): Promise<DbTask> {
    const result = await sql<DbTask>`
        INSERT INTO tasks (id, title, status, raw_status, editor_id, editor_name, clickup_editor_id, date_created, date_closed, time_tracked_ms, video_type, link, tags)
        VALUES (
            ${task.id},
            ${task.title},
            ${task.status},
            ${task.raw_status || null},
            ${task.editor_id || null},
            ${task.editor_name || null},
            ${task.clickup_editor_id || null},
            ${task.date_created},
            ${task.date_closed || null},
            ${task.time_tracked_ms || 0},
            ${task.video_type || null},
            ${task.link || null},
            ${JSON.stringify(task.tags || [])}
        )
        ON CONFLICT (id) DO UPDATE SET
            title = EXCLUDED.title,
            status = EXCLUDED.status,
            raw_status = EXCLUDED.raw_status,
            editor_id = COALESCE(EXCLUDED.editor_id, tasks.editor_id),
            editor_name = COALESCE(EXCLUDED.editor_name, tasks.editor_name),
            date_closed = COALESCE(EXCLUDED.date_closed, tasks.date_closed),
            time_tracked_ms = EXCLUDED.time_tracked_ms,
            updated_at = CURRENT_TIMESTAMP
        RETURNING *
    `;
    return result.rows[0];
}

export async function getTaskById(id: string): Promise<DbTask | null> {
    const result = await sql<DbTask>`SELECT * FROM tasks WHERE id = ${id}`;
    return result.rows[0] || null;
}

export async function getTasksByEditor(editorId: number, limit = 100): Promise<DbTask[]> {
    const result = await sql<DbTask>`
        SELECT * FROM tasks
        WHERE editor_id = ${editorId}
        ORDER BY date_created DESC
        LIMIT ${limit}
    `;
    return result.rows;
}

export async function getCompletedTasksInPeriod(startDate: number, endDate: number): Promise<DbTask[]> {
    const result = await sql<DbTask>`
        SELECT * FROM tasks
        WHERE status = 'COMPLETED'
        AND date_closed >= ${startDate}
        AND date_closed <= ${endDate}
        ORDER BY date_closed DESC
    `;
    return result.rows;
}

// -------------------- TASK PHASE METRICS --------------------

export async function upsertTaskPhaseMetrics(metrics: Omit<DbTaskPhaseMetrics, 'id' | 'created_at'>): Promise<void> {
    await sql`
        INSERT INTO task_phase_metrics (task_id, editing_time_ms, revision_time_ms, alteration_time_ms, approval_time_ms, total_time_ms, had_alteration)
        VALUES (
            ${metrics.task_id},
            ${metrics.editing_time_ms},
            ${metrics.revision_time_ms},
            ${metrics.alteration_time_ms},
            ${metrics.approval_time_ms},
            ${metrics.total_time_ms},
            ${metrics.had_alteration}
        )
        ON CONFLICT (task_id) DO UPDATE SET
            editing_time_ms = EXCLUDED.editing_time_ms,
            revision_time_ms = EXCLUDED.revision_time_ms,
            alteration_time_ms = EXCLUDED.alteration_time_ms,
            approval_time_ms = EXCLUDED.approval_time_ms,
            total_time_ms = EXCLUDED.total_time_ms,
            had_alteration = EXCLUDED.had_alteration
    `;
}

export async function getTaskPhaseMetrics(taskId: string): Promise<DbTaskPhaseMetrics | null> {
    const result = await sql<DbTaskPhaseMetrics>`
        SELECT * FROM task_phase_metrics WHERE task_id = ${taskId}
    `;
    return result.rows[0] || null;
}

// -------------------- ONE ON ONE RECORDS --------------------

export async function getOneOnOneRecords(): Promise<DbOneOnOneRecord[]> {
    const result = await sql<DbOneOnOneRecord>`
        SELECT * FROM one_on_one_records ORDER BY editor_name
    `;
    return result.rows;
}

export async function upsertOneOnOneRecord(record: Partial<DbOneOnOneRecord> & { editor_name: string }): Promise<DbOneOnOneRecord> {
    const result = await sql<DbOneOnOneRecord>`
        INSERT INTO one_on_one_records (editor_id, editor_name, team_name, last_one_on_one, next_suggested_date, notes, status)
        VALUES (
            ${record.editor_id || null},
            ${record.editor_name},
            ${record.team_name || null},
            ${record.last_one_on_one || null},
            ${record.next_suggested_date || null},
            ${record.notes || null},
            ${record.status || 'pending'}
        )
        ON CONFLICT (id) DO UPDATE SET
            last_one_on_one = COALESCE(EXCLUDED.last_one_on_one, one_on_one_records.last_one_on_one),
            next_suggested_date = COALESCE(EXCLUDED.next_suggested_date, one_on_one_records.next_suggested_date),
            notes = COALESCE(EXCLUDED.notes, one_on_one_records.notes),
            status = COALESCE(EXCLUDED.status, one_on_one_records.status),
            updated_at = CURRENT_TIMESTAMP
        RETURNING *
    `;
    return result.rows[0];
}

export async function updateOneOnOneDate(editorName: string, date: Date, notes?: string): Promise<void> {
    // Calcular próxima data sugerida (30 dias)
    const nextDate = new Date(date);
    nextDate.setDate(nextDate.getDate() + 30);

    await sql`
        UPDATE one_on_one_records
        SET last_one_on_one = ${date.toISOString().split('T')[0]},
            next_suggested_date = ${nextDate.toISOString().split('T')[0]},
            notes = COALESCE(${notes || null}, notes),
            status = 'ok',
            updated_at = CURRENT_TIMESTAMP
        WHERE LOWER(editor_name) = LOWER(${editorName})
    `;
}

// -------------------- EDITOR MONTHLY METRICS --------------------

export async function upsertEditorMonthlyMetrics(metrics: Omit<DbEditorMonthlyMetrics, 'id' | 'created_at'>): Promise<void> {
    await sql`
        INSERT INTO editor_monthly_metrics (
            editor_id, editor_name, year_month, total_videos, videos_with_alteration,
            alteration_rate, total_editing_hours, avg_editing_hours, total_alteration_hours,
            avg_lead_time_hours, months_in_company, evolution_status
        )
        VALUES (
            ${metrics.editor_id || null},
            ${metrics.editor_name},
            ${metrics.year_month},
            ${metrics.total_videos},
            ${metrics.videos_with_alteration},
            ${metrics.alteration_rate},
            ${metrics.total_editing_hours},
            ${metrics.avg_editing_hours},
            ${metrics.total_alteration_hours},
            ${metrics.avg_lead_time_hours},
            ${metrics.months_in_company},
            ${metrics.evolution_status || null}
        )
        ON CONFLICT (editor_id, year_month) DO UPDATE SET
            total_videos = EXCLUDED.total_videos,
            videos_with_alteration = EXCLUDED.videos_with_alteration,
            alteration_rate = EXCLUDED.alteration_rate,
            total_editing_hours = EXCLUDED.total_editing_hours,
            avg_editing_hours = EXCLUDED.avg_editing_hours,
            total_alteration_hours = EXCLUDED.total_alteration_hours,
            avg_lead_time_hours = EXCLUDED.avg_lead_time_hours,
            months_in_company = EXCLUDED.months_in_company,
            evolution_status = EXCLUDED.evolution_status
    `;
}

export async function getEditorMonthlyMetrics(editorId: number, yearMonth?: string): Promise<DbEditorMonthlyMetrics[]> {
    if (yearMonth) {
        const result = await sql<DbEditorMonthlyMetrics>`
            SELECT * FROM editor_monthly_metrics
            WHERE editor_id = ${editorId} AND year_month = ${yearMonth}
        `;
        return result.rows;
    }

    const result = await sql<DbEditorMonthlyMetrics>`
        SELECT * FROM editor_monthly_metrics
        WHERE editor_id = ${editorId}
        ORDER BY year_month DESC
    `;
    return result.rows;
}

export async function getMonthlyMetricsForAllEditors(yearMonth: string): Promise<DbEditorMonthlyMetrics[]> {
    const result = await sql<DbEditorMonthlyMetrics>`
        SELECT * FROM editor_monthly_metrics
        WHERE year_month = ${yearMonth}
        ORDER BY editor_name
    `;
    return result.rows;
}

// -------------------- DASHBOARD SNAPSHOTS --------------------

export async function saveDashboardSnapshot(snapshot: {
    snapshot_date: Date;
    year_month: string;
    total_videos: number;
    total_hours: number;
    avg_hours_per_video: number;
    avg_alteration_rate: number;
    top_performer_name?: string;
    top_performer_count?: number;
    tasks_by_status: Record<string, number>;
    tasks_by_type: Record<string, number>;
    tasks_by_team: Record<string, number>;
    volume_vs_previous_month?: number;
    alteration_vs_previous_month?: number;
}): Promise<void> {
    await sql`
        INSERT INTO dashboard_snapshots (
            snapshot_date, year_month, total_videos, total_hours, avg_hours_per_video,
            avg_alteration_rate, top_performer_name, top_performer_count,
            tasks_by_status, tasks_by_type, tasks_by_team,
            volume_vs_previous_month, alteration_vs_previous_month
        )
        VALUES (
            ${snapshot.snapshot_date.toISOString().split('T')[0]},
            ${snapshot.year_month},
            ${snapshot.total_videos},
            ${snapshot.total_hours},
            ${snapshot.avg_hours_per_video},
            ${snapshot.avg_alteration_rate},
            ${snapshot.top_performer_name || null},
            ${snapshot.top_performer_count || null},
            ${JSON.stringify(snapshot.tasks_by_status)},
            ${JSON.stringify(snapshot.tasks_by_type)},
            ${JSON.stringify(snapshot.tasks_by_team)},
            ${snapshot.volume_vs_previous_month || null},
            ${snapshot.alteration_vs_previous_month || null}
        )
        ON CONFLICT (snapshot_date) DO UPDATE SET
            total_videos = EXCLUDED.total_videos,
            total_hours = EXCLUDED.total_hours,
            avg_hours_per_video = EXCLUDED.avg_hours_per_video,
            avg_alteration_rate = EXCLUDED.avg_alteration_rate,
            top_performer_name = EXCLUDED.top_performer_name,
            top_performer_count = EXCLUDED.top_performer_count,
            tasks_by_status = EXCLUDED.tasks_by_status,
            tasks_by_type = EXCLUDED.tasks_by_type,
            tasks_by_team = EXCLUDED.tasks_by_team,
            volume_vs_previous_month = EXCLUDED.volume_vs_previous_month,
            alteration_vs_previous_month = EXCLUDED.alteration_vs_previous_month
    `;
}

// -------------------- UTILITÁRIOS --------------------

export async function testConnection(): Promise<boolean> {
    try {
        await sql`SELECT 1`;
        return true;
    } catch (error) {
        console.error('Database connection failed:', error);
        return false;
    }
}

export async function getTableCounts(): Promise<Record<string, number>> {
    const tables = ['teams', 'editors', 'tasks', 'task_status_history', 'one_on_one_records', 'editor_monthly_metrics', 'dashboard_snapshots'];
    const counts: Record<string, number> = {};

    for (const table of tables) {
        try {
            const result = await sql.query(`SELECT COUNT(*) as count FROM ${table}`);
            counts[table] = parseInt(result.rows[0].count, 10);
        } catch {
            counts[table] = -1; // Tabela não existe ou erro
        }
    }

    return counts;
}

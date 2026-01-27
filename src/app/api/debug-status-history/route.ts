import { NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';

export async function GET() {
    try {
        // Get all unique status values from the database
        const uniqueStatuses = await sql`
            SELECT DISTINCT new_status, COUNT(*) as count
            FROM task_status_history
            GROUP BY new_status
            ORDER BY count DESC
        `;

        // Get recent status changes (last 50)
        const recentChanges = await sql`
            SELECT
                task_id,
                task_name,
                previous_status,
                new_status,
                editor_name,
                event_timestamp,
                created_at
            FROM task_status_history
            ORDER BY event_timestamp DESC
            LIMIT 50
        `;

        // Get sample of tasks with EDITANDO status
        const editandoTasks = await sql`
            SELECT DISTINCT task_id, task_name, editor_name
            FROM task_status_history
            WHERE UPPER(new_status) LIKE '%EDITANDO%'
            LIMIT 20
        `;

        // Get sample of tasks with APROVADO status
        const aprovadoTasks = await sql`
            SELECT DISTINCT task_id, task_name, editor_name
            FROM task_status_history
            WHERE UPPER(new_status) LIKE '%APROVADO%'
            LIMIT 20
        `;

        // Count total records
        const totalCount = await sql`SELECT COUNT(*) as total FROM task_status_history`;

        return NextResponse.json({
            totalRecords: totalCount.rows[0]?.total || 0,
            uniqueStatuses: uniqueStatuses.rows,
            editandoTasksFound: editandoTasks.rows.length,
            editandoTasks: editandoTasks.rows,
            aprovadoTasksFound: aprovadoTasks.rows.length,
            aprovadoTasks: aprovadoTasks.rows,
            recentChanges: recentChanges.rows.map(r => ({
                ...r,
                event_timestamp: r.event_timestamp,
                event_date: new Date(parseInt(r.event_timestamp)).toISOString()
            }))
        });
    } catch (error) {
        return NextResponse.json({ error: String(error) }, { status: 500 });
    }
}

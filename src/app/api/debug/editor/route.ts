import { NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        // Buscar editor 1
        const editor = await sql`SELECT * FROM editors WHERE id = 1`;

        // Buscar tasks do editor 1
        const tasks = await sql`SELECT id, title, status, date_created, date_closed FROM tasks WHERE editor_id = 1 LIMIT 5`;

        // Buscar métricas semanais
        const weekly = await sql`SELECT * FROM editor_weekly_metrics WHERE editor_id = 1 LIMIT 3`;

        // Buscar métricas mensais
        const monthly = await sql`SELECT * FROM editor_monthly_metrics WHERE editor_id = 1 LIMIT 3`;

        return NextResponse.json({
            editor: editor.rows[0],
            editorFields: editor.rows[0] ? Object.keys(editor.rows[0]).map(k => ({
                key: k,
                value: editor.rows[0][k],
                type: typeof editor.rows[0][k]
            })) : [],
            tasks: tasks.rows,
            taskFields: tasks.rows[0] ? Object.keys(tasks.rows[0]).map(k => ({
                key: k,
                value: tasks.rows[0][k],
                type: typeof tasks.rows[0][k]
            })) : [],
            weekly: weekly.rows,
            monthly: monthly.rows
        });
    } catch (error) {
        return NextResponse.json({
            error: error instanceof Error ? error.message : 'Unknown',
            stack: error instanceof Error ? error.stack : undefined
        }, { status: 500 });
    }
}

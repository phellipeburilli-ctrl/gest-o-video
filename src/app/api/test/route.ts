import { NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        // Teste 1: Query simples
        const test1 = await sql`SELECT 1 as test`;

        // Teste 2: Editor com cast de datas
        const test2 = await sql`
            SELECT id, name, admission_date::text as admission_date
            FROM editors WHERE id = 1
        `;

        // Teste 3: Weekly metrics com cast
        const test3 = await sql`
            SELECT id, year_week, week_start::text as week_start,
                   total_videos, productivity_score
            FROM editor_weekly_metrics
            WHERE editor_id = 1 LIMIT 2
        `;

        // Teste 4: Monthly metrics
        const test4 = await sql`
            SELECT id, year_month, total_videos, alteration_rate
            FROM editor_monthly_metrics
            WHERE editor_id = 1 LIMIT 2
        `;

        // Teste 5: Tasks
        const test5 = await sql`
            SELECT id, title, date_created, date_closed
            FROM tasks
            WHERE editor_id = 1 LIMIT 2
        `;

        return NextResponse.json({
            success: true,
            test1: test1.rows,
            test2: test2.rows,
            test3: test3.rows,
            test4: test4.rows,
            test5: test5.rows
        });

    } catch (error) {
        return NextResponse.json({
            error: error instanceof Error ? error.message : 'Unknown',
            stack: error instanceof Error ? error.stack : undefined
        }, { status: 500 });
    }
}

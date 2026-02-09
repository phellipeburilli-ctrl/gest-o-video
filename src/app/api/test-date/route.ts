import { NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        // Teste 1: editor
        const editorResult = await sql`SELECT id, name, admission_date FROM editors WHERE id = 1`;
        const editor = editorResult.rows[0];

        let admissionTest = null;
        if (editor?.admission_date) {
            admissionTest = {
                raw: editor.admission_date,
                type: typeof editor.admission_date,
                toString: String(editor.admission_date),
                isDate: editor.admission_date instanceof Date,
            };
            try {
                const d = new Date(editor.admission_date);
                admissionTest.parsedValid = !isNaN(d.getTime());
                admissionTest.parsedValue = d.toISOString();
            } catch (e) {
                admissionTest.parseError = String(e);
            }
        }

        // Teste 2: tasks
        const tasksResult = await sql`SELECT id, title, date_created, date_closed FROM tasks WHERE editor_id = 1 LIMIT 3`;
        const tasksTest = tasksResult.rows.map(t => {
            const test: Record<string, unknown> = {
                id: t.id,
                date_created_raw: t.date_created,
                date_created_type: typeof t.date_created,
                date_closed_raw: t.date_closed,
                date_closed_type: typeof t.date_closed,
            };

            try {
                if (t.date_created) {
                    const d = new Date(t.date_created);
                    test.date_created_valid = !isNaN(d.getTime());
                    if (!isNaN(d.getTime())) {
                        test.date_created_iso = d.toISOString();
                    }
                }
            } catch (e) {
                test.date_created_error = String(e);
            }

            try {
                if (t.date_closed) {
                    const d = new Date(t.date_closed);
                    test.date_closed_valid = !isNaN(d.getTime());
                    if (!isNaN(d.getTime())) {
                        test.date_closed_iso = d.toISOString();
                    }
                }
            } catch (e) {
                test.date_closed_error = String(e);
            }

            return test;
        });

        // Teste 3: weekly metrics
        const weeklyResult = await sql`SELECT * FROM editor_weekly_metrics WHERE editor_id = 1 LIMIT 2`;
        const weeklyTest = weeklyResult.rows.map(w => ({
            year_week: w.year_week,
            week_start_raw: w.week_start,
            week_start_type: typeof w.week_start,
            week_end_raw: w.week_end,
            week_end_type: typeof w.week_end,
        }));

        return NextResponse.json({
            editor: editor,
            admissionTest,
            tasksTest,
            weeklyTest
        });

    } catch (error) {
        return NextResponse.json({
            error: error instanceof Error ? error.message : 'Unknown',
            stack: error instanceof Error ? error.stack : undefined
        }, { status: 500 });
    }
}

import { sql } from '@vercel/postgres';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { event, task_id, history_items } = body;

        console.log(`[Webhook] Received event: ${event} for task ${task_id}`);

        // Verify it's a status update
        if (event === 'taskStatusUpdated' && history_items) {
            const statusChange = history_items.find((item: any) => item.field === 'status');

            if (statusChange) {
                const newStatus = statusChange.after.status.toUpperCase();

                // Determine event type
                let eventType = 'UPDATE';
                if (['EM ANDAMENTO', 'IN PROGRESS', 'DOING', 'RUNNING'].includes(newStatus)) {
                    eventType = 'START';
                } else if (['CONCLUÍDO', 'COMPLETED', 'DONE', 'CLOSED', 'REVISÃO', 'REVIEW'].includes(newStatus)) {
                    eventType = 'END';
                }

                // Insert into DB
                // We assume the table 'task_history' exists (created via setup-db)
                await sql`
            INSERT INTO task_history (task_id, status, event_type, timestamp)
            VALUES (${task_id}, ${newStatus}, ${eventType}, NOW())
        `;

                console.log(`[Webhook] Saved ${eventType} event for task ${task_id} (Status: ${newStatus})`);
            }
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('[Webhook] Error processing request:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

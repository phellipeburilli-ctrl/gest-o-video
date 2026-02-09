import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';

// =====================================================
// API DE ALERTAS DE EVOLUÇÃO
// Retorna alertas de melhoria/regressão dos editores
// =====================================================

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const editorId = searchParams.get('editor_id');
    const limit = parseInt(searchParams.get('limit') || '20');
    const unreadOnly = searchParams.get('unread_only') === 'true';

    try {
        let result;

        if (editorId) {
            // Alertas de um editor específico
            if (unreadOnly) {
                result = await sql`
                    SELECT * FROM evolution_alerts
                    WHERE editor_id = ${parseInt(editorId)}
                    AND is_read = FALSE
                    ORDER BY created_at DESC
                    LIMIT ${limit}
                `;
            } else {
                result = await sql`
                    SELECT * FROM evolution_alerts
                    WHERE editor_id = ${parseInt(editorId)}
                    ORDER BY created_at DESC
                    LIMIT ${limit}
                `;
            }
        } else {
            // Todos os alertas
            if (unreadOnly) {
                result = await sql`
                    SELECT * FROM evolution_alerts
                    WHERE is_read = FALSE
                    ORDER BY created_at DESC
                    LIMIT ${limit}
                `;
            } else {
                result = await sql`
                    SELECT * FROM evolution_alerts
                    ORDER BY created_at DESC
                    LIMIT ${limit}
                `;
            }
        }

        // Agrupar por tipo para estatísticas
        const stats = {
            total: result.rows.length,
            improvements: result.rows.filter(a => a.type === 'improvement').length,
            regressions: result.rows.filter(a => a.type === 'regression').length,
            milestones: result.rows.filter(a => a.type === 'milestone').length,
            streaks: result.rows.filter(a => a.type === 'streak').length
        };

        return NextResponse.json({
            success: true,
            stats,
            alerts: result.rows.map(row => ({
                id: row.id,
                editorId: row.editor_id,
                editorName: row.editor_name,
                type: row.type,
                category: row.category,
                message: row.message,
                data: row.data,
                severity: row.severity,
                isRead: row.is_read,
                createdAt: row.created_at
            }))
        });

    } catch (error) {
        console.error('[Evolution Alerts] Error:', error);
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}

// Marcar alertas como lidos
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { alertIds, editorId, markAll } = body;

        if (markAll && editorId) {
            // Marcar todos os alertas de um editor como lidos
            await sql`
                UPDATE evolution_alerts
                SET is_read = TRUE
                WHERE editor_id = ${editorId}
            `;
        } else if (alertIds && Array.isArray(alertIds)) {
            // Marcar alertas específicos como lidos
            for (const id of alertIds) {
                await sql`
                    UPDATE evolution_alerts
                    SET is_read = TRUE
                    WHERE id = ${id}
                `;
            }
        }

        return NextResponse.json({ success: true });

    } catch (error) {
        console.error('[Evolution Alerts] Error:', error);
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}

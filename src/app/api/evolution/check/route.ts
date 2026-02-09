import { NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';

// =====================================================
// API DE VERIFICAÇÃO DE EVOLUÇÃO
// Detecta melhorias e regressões nos editores
// Roda diariamente às 00:00h BRT (03:00 UTC)
// =====================================================

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

interface EvolutionAlert {
    editorId: number;
    editorName: string;
    type: 'improvement' | 'regression' | 'milestone' | 'streak';
    category: string;
    message: string;
    data: {
        previous: number;
        current: number;
        change: number;
    };
    severity: 'positive' | 'neutral' | 'warning';
    createdAt: string;
}

// Função para obter a semana atual no formato YYYY-WXX
function getCurrentYearWeek(): string {
    const now = new Date();
    const jan1 = new Date(now.getFullYear(), 0, 1);
    const dayOfWeek = jan1.getDay();
    const daysToMonday = dayOfWeek === 0 ? 1 : (dayOfWeek === 1 ? 0 : 8 - dayOfWeek);
    const firstMonday = new Date(jan1);
    firstMonday.setDate(jan1.getDate() + daysToMonday);
    const diffMs = now.getTime() - firstMonday.getTime();
    const weekNum = Math.ceil(diffMs / (7 * 24 * 60 * 60 * 1000)) + 1;
    return `${now.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

function getPreviousWeek(yearWeek: string): string {
    const [year, weekPart] = yearWeek.split('-W');
    const weekNum = parseInt(weekPart);
    if (weekNum === 1) {
        return `${parseInt(year) - 1}-W52`;
    }
    return `${year}-W${String(weekNum - 1).padStart(2, '0')}`;
}

async function detectEvolutionAlerts(): Promise<EvolutionAlert[]> {
    const alerts: EvolutionAlert[] = [];
    const currentWeek = getCurrentYearWeek();
    const previousWeek = getPreviousWeek(currentWeek);
    const twoWeeksAgo = getPreviousWeek(previousWeek);

    // Buscar editores ativos
    const editorsResult = await sql`
        SELECT id, name FROM editors WHERE status = 'active'
    `;

    for (const editor of editorsResult.rows) {
        // Buscar métricas das últimas semanas
        const metricsResult = await sql`
            SELECT year_week, total_videos, alteration_rate, productivity_score, quality_score
            FROM editor_weekly_metrics
            WHERE editor_id = ${editor.id}
            AND year_week IN (${currentWeek}, ${previousWeek}, ${twoWeeksAgo})
            ORDER BY year_week DESC
        `;

        if (metricsResult.rows.length < 2) continue;

        const current = metricsResult.rows.find(m => m.year_week === currentWeek);
        const previous = metricsResult.rows.find(m => m.year_week === previousWeek);
        const twoWeeksBefore = metricsResult.rows.find(m => m.year_week === twoWeeksAgo);

        if (!current || !previous) continue;

        // 1. MELHORIA NA TAXA DE ALTERAÇÃO
        const alterationChange = previous.alteration_rate - current.alteration_rate;
        if (alterationChange >= 10) {
            alerts.push({
                editorId: editor.id,
                editorName: editor.name,
                type: 'improvement',
                category: 'alteration_rate',
                message: `${editor.name} reduziu a taxa de alteração em ${Math.round(alterationChange)}pp! (${previous.alteration_rate}% → ${current.alteration_rate}%)`,
                data: {
                    previous: previous.alteration_rate,
                    current: current.alteration_rate,
                    change: alterationChange
                },
                severity: 'positive',
                createdAt: new Date().toISOString()
            });
        } else if (alterationChange <= -15 && current.alteration_rate > 25) {
            alerts.push({
                editorId: editor.id,
                editorName: editor.name,
                type: 'regression',
                category: 'alteration_rate',
                message: `${editor.name} teve aumento na taxa de alteração (${previous.alteration_rate}% → ${current.alteration_rate}%)`,
                data: {
                    previous: previous.alteration_rate,
                    current: current.alteration_rate,
                    change: alterationChange
                },
                severity: 'warning',
                createdAt: new Date().toISOString()
            });
        }

        // 2. MELHORIA NA PRODUTIVIDADE
        const productivityChange = current.productivity_score - previous.productivity_score;
        if (productivityChange >= 15) {
            alerts.push({
                editorId: editor.id,
                editorName: editor.name,
                type: 'improvement',
                category: 'productivity',
                message: `${editor.name} aumentou a produtividade em ${Math.round(productivityChange)} pontos!`,
                data: {
                    previous: previous.productivity_score,
                    current: current.productivity_score,
                    change: productivityChange
                },
                severity: 'positive',
                createdAt: new Date().toISOString()
            });
        }

        // 3. MILESTONE: Taxa de alteração abaixo de 10%
        if (current.alteration_rate <= 10 && previous.alteration_rate > 10) {
            alerts.push({
                editorId: editor.id,
                editorName: editor.name,
                type: 'milestone',
                category: 'quality',
                message: `${editor.name} atingiu taxa de alteração abaixo de 10%! Excelente qualidade!`,
                data: {
                    previous: previous.alteration_rate,
                    current: current.alteration_rate,
                    change: previous.alteration_rate - current.alteration_rate
                },
                severity: 'positive',
                createdAt: new Date().toISOString()
            });
        }

        // 4. STREAK: 3 semanas consecutivas de melhoria
        if (twoWeeksBefore &&
            previous.alteration_rate < twoWeeksBefore.alteration_rate &&
            current.alteration_rate < previous.alteration_rate) {
            alerts.push({
                editorId: editor.id,
                editorName: editor.name,
                type: 'streak',
                category: 'consistency',
                message: `${editor.name} está em uma sequência de 3 semanas de melhoria contínua!`,
                data: {
                    previous: twoWeeksBefore.alteration_rate,
                    current: current.alteration_rate,
                    change: twoWeeksBefore.alteration_rate - current.alteration_rate
                },
                severity: 'positive',
                createdAt: new Date().toISOString()
            });
        }

        // 5. AUMENTO DE VOLUME
        const volumeChange = current.total_videos - previous.total_videos;
        const volumePercent = previous.total_videos > 0
            ? ((volumeChange / previous.total_videos) * 100)
            : (current.total_videos > 0 ? 100 : 0);

        if (volumePercent >= 50 && current.total_videos >= 3) {
            alerts.push({
                editorId: editor.id,
                editorName: editor.name,
                type: 'improvement',
                category: 'volume',
                message: `${editor.name} aumentou a produção em ${Math.round(volumePercent)}%! (${previous.total_videos} → ${current.total_videos} vídeos)`,
                data: {
                    previous: previous.total_videos,
                    current: current.total_videos,
                    change: volumeChange
                },
                severity: 'positive',
                createdAt: new Date().toISOString()
            });
        }
    }

    return alerts;
}

async function detectErrorPatternImprovements(): Promise<EvolutionAlert[]> {
    const alerts: EvolutionAlert[] = [];

    // Buscar padrões de erro dos últimos 2 meses
    const currentMonth = new Date().toISOString().slice(0, 7);
    const lastMonth = (() => {
        const d = new Date();
        d.setMonth(d.getMonth() - 1);
        return d.toISOString().slice(0, 7);
    })();

    const patternsResult = await sql`
        SELECT
            e1.editor_id,
            e1.editor_name,
            e1.error_patterns as current_patterns,
            e2.error_patterns as previous_patterns,
            e1.most_common_error as current_error,
            e2.most_common_error as previous_error
        FROM error_patterns_cache e1
        LEFT JOIN error_patterns_cache e2
            ON e1.editor_id = e2.editor_id
            AND e2.year_month = ${lastMonth}
        WHERE e1.year_month = ${currentMonth}
    `;

    for (const row of patternsResult.rows) {
        if (!row.previous_patterns || !row.current_patterns) continue;

        const previousPatterns = row.previous_patterns as Array<{category: string; count: number}>;
        const currentPatterns = row.current_patterns as Array<{category: string; count: number}>;

        // Encontrar erros que o editor costumava cometer mas não comete mais
        for (const prevPattern of previousPatterns) {
            const currentPattern = currentPatterns.find(p => p.category === prevPattern.category);
            const currentCount = currentPattern?.count || 0;

            // Se tinha mais de 3 erros e agora tem 0
            if (prevPattern.count >= 3 && currentCount === 0) {
                alerts.push({
                    editorId: row.editor_id,
                    editorName: row.editor_name,
                    type: 'improvement',
                    category: 'error_pattern',
                    message: `${row.editor_name} eliminou erros de "${prevPattern.category}"! (${prevPattern.count} erros → 0)`,
                    data: {
                        previous: prevPattern.count,
                        current: 0,
                        change: prevPattern.count
                    },
                    severity: 'positive',
                    createdAt: new Date().toISOString()
                });
            }
            // Se reduziu significativamente (mais de 50%)
            else if (prevPattern.count >= 3 && currentCount < prevPattern.count * 0.5) {
                alerts.push({
                    editorId: row.editor_id,
                    editorName: row.editor_name,
                    type: 'improvement',
                    category: 'error_pattern',
                    message: `${row.editor_name} reduziu erros de "${prevPattern.category}" em mais de 50%!`,
                    data: {
                        previous: prevPattern.count,
                        current: currentCount,
                        change: prevPattern.count - currentCount
                    },
                    severity: 'positive',
                    createdAt: new Date().toISOString()
                });
            }
        }
    }

    return alerts;
}

export async function GET() {
    try {
        console.log('[Evolution Check] Starting...');

        // Detectar alertas de evolução
        const evolutionAlerts = await detectEvolutionAlerts();
        const errorPatternAlerts = await detectErrorPatternImprovements();

        const allAlerts = [...evolutionAlerts, ...errorPatternAlerts];

        // Salvar alertas no banco (criar tabela se não existir)
        await sql`
            CREATE TABLE IF NOT EXISTS evolution_alerts (
                id SERIAL PRIMARY KEY,
                editor_id INT REFERENCES editors(id),
                editor_name VARCHAR(100) NOT NULL,
                type VARCHAR(20) NOT NULL,
                category VARCHAR(50) NOT NULL,
                message TEXT NOT NULL,
                data JSONB DEFAULT '{}'::jsonb,
                severity VARCHAR(20) NOT NULL,
                is_read BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            )
        `;

        await sql`
            CREATE INDEX IF NOT EXISTS idx_evolution_alerts_editor ON evolution_alerts(editor_id)
        `;
        await sql`
            CREATE INDEX IF NOT EXISTS idx_evolution_alerts_created ON evolution_alerts(created_at)
        `;

        // Inserir novos alertas
        for (const alert of allAlerts) {
            await sql`
                INSERT INTO evolution_alerts (editor_id, editor_name, type, category, message, data, severity)
                VALUES (${alert.editorId}, ${alert.editorName}, ${alert.type}, ${alert.category},
                        ${alert.message}, ${JSON.stringify(alert.data)}::jsonb, ${alert.severity})
            `;
        }

        console.log(`[Evolution Check] Generated ${allAlerts.length} alerts`);

        return NextResponse.json({
            success: true,
            alertsGenerated: allAlerts.length,
            alerts: allAlerts,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('[Evolution Check] Error:', error);
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}

export async function POST() {
    return GET();
}

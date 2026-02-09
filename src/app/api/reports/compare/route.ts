import { NextRequest, NextResponse } from 'next/server';
import {
    getActiveEditors,
    getEditorsByTeam,
    compareEditors,
    getEditorWeeklyMetrics,
    getEditorMonthlyMetrics
} from '@/lib/db.service';

// =====================================================
// API DE COMPARAÇÃO ENTRE EDITORES
// =====================================================

export const dynamic = 'force-dynamic';

interface ComparisonReport {
    period: {
        type: 'week' | 'month' | 'quarter';
        value: string;
        label: string;
    };
    editors: Array<{
        id: number;
        name: string;
        team: string | null;
        metrics: {
            totalVideos: number;
            alterationRate: number;
            avgEditingHours: number;
            productivityScore: number;
            qualityScore: number;
        };
        rankings: {
            volume: number;
            quality: number;
            productivity: number;
            overall: number;
        };
        comparison: {
            vsTeamAvg: {
                videos: string; // "+20%" ou "-10%"
                alteration: string; // "+5pp" ou "-3pp" (pontos percentuais)
            };
            vsLastPeriod: {
                videos: string;
                alteration: string;
            };
        };
        badges: string[]; // "Top Volume", "Melhor Qualidade", etc.
    }>;
    teamAverages: {
        totalVideos: number;
        alterationRate: number;
        avgEditingHours: number;
    };
    highlights: {
        topVolume: { name: string; value: number } | null;
        bestQuality: { name: string; value: number } | null;
        mostImproved: { name: string; improvement: string } | null;
        needsAttention: { name: string; reason: string }[];
    };
    chartData: {
        volumeComparison: Array<{ name: string; value: number; color: string }>;
        alterationComparison: Array<{ name: string; value: number; color: string }>;
        radarData: Array<{
            editor: string;
            volume: number;
            quality: number;
            productivity: number;
            consistency: number;
        }>;
    };
}

function getCurrentWeek(): string {
    const now = new Date();
    const jan1 = new Date(now.getFullYear(), 0, 1);
    const days = Math.floor((now.getTime() - jan1.getTime()) / (24 * 60 * 60 * 1000));
    const weekNum = Math.ceil((days + jan1.getDay() + 1) / 7);
    return `${now.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

function getCurrentMonth(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function getCurrentQuarter(): string {
    const now = new Date();
    const quarter = Math.ceil((now.getMonth() + 1) / 3);
    return `${now.getFullYear()}-Q${quarter}`;
}

function getPreviousPeriod(type: 'week' | 'month' | 'quarter', current: string): string {
    if (type === 'week') {
        const [year, weekPart] = current.split('-W');
        const weekNum = parseInt(weekPart);
        if (weekNum === 1) {
            return `${parseInt(year) - 1}-W52`;
        }
        return `${year}-W${String(weekNum - 1).padStart(2, '0')}`;
    } else if (type === 'month') {
        const [year, month] = current.split('-').map(Number);
        if (month === 1) {
            return `${year - 1}-12`;
        }
        return `${year}-${String(month - 1).padStart(2, '0')}`;
    } else {
        const [year, quarterPart] = current.split('-Q');
        const quarter = parseInt(quarterPart);
        if (quarter === 1) {
            return `${parseInt(year) - 1}-Q4`;
        }
        return `${year}-Q${quarter - 1}`;
    }
}

function formatComparison(current: number, previous: number, isPercentage = false): string {
    const diff = current - previous;
    const sign = diff >= 0 ? '+' : '';
    if (isPercentage) {
        return `${sign}${Math.round(diff)}pp`;
    }
    if (previous === 0) return current > 0 ? '+∞%' : '0%';
    const percentChange = Math.round((diff / previous) * 100);
    return `${sign}${percentChange}%`;
}

const teamColors: Record<string, string> = {
    'vsl': '#e91e63',
    'funil': '#9c27b0',
    'ads': '#2196f3',
    'tp-mic-lead': '#4caf50',
    'default': '#6b7280'
};

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const type = (searchParams.get('type') || 'month') as 'week' | 'month' | 'quarter';
    const period = searchParams.get('period');
    const teamId = searchParams.get('team'); // Filtrar por equipe (opcional)
    const editorIdsParam = searchParams.get('editors'); // IDs específicos (opcional)

    try {
        // Determinar período
        let periodValue: string;
        if (type === 'week') {
            periodValue = period || getCurrentWeek();
        } else if (type === 'quarter') {
            periodValue = period || getCurrentQuarter();
        } else {
            periodValue = period || getCurrentMonth();
        }

        const previousPeriod = getPreviousPeriod(type, periodValue);

        // Buscar editores
        let editors;
        if (editorIdsParam) {
            const editorIds = editorIdsParam.split(',').map(Number);
            const allEditors = await getActiveEditors();
            editors = allEditors.filter(e => editorIds.includes(e.id));
        } else if (teamId) {
            editors = await getEditorsByTeam(teamId);
        } else {
            editors = await getActiveEditors();
        }

        if (editors.length === 0) {
            return NextResponse.json({ error: 'Nenhum editor encontrado' }, { status: 404 });
        }

        // Buscar comparação
        const editorIds = editors.map(e => e.id);
        const comparison = await compareEditors(editorIds, type, periodValue);

        // Buscar dados do período anterior para comparação
        const previousComparison = await compareEditors(editorIds, type, previousPeriod);
        const previousMetricsMap = new Map(
            previousComparison.editors.map(e => [e.editor.id, e.metrics])
        );

        // Construir relatório
        const reportEditors: ComparisonReport['editors'] = comparison.editors.map(e => {
            const prevMetrics = previousMetricsMap.get(e.editor.id);
            const badges: string[] = [];

            // Verificar badges
            if (e.ranking.volume === 1) badges.push('🏆 Top Volume');
            if (e.ranking.quality === 1) badges.push('⭐ Melhor Qualidade');
            if (e.ranking.productivity === 1) badges.push('🚀 Mais Produtivo');
            if (e.metrics.alterationRate <= 10 && e.metrics.totalVideos > 0) badges.push('✨ Zero Defeitos');

            // Verificar melhoria
            if (prevMetrics && prevMetrics.alterationRate > 0) {
                const alterationImprovement = prevMetrics.alterationRate - e.metrics.alterationRate;
                if (alterationImprovement >= 10) badges.push('📈 Grande Melhoria');
            }

            return {
                id: e.editor.id,
                name: e.editor.name,
                team: e.editor.team_id,
                metrics: e.metrics,
                rankings: e.ranking,
                comparison: {
                    vsTeamAvg: {
                        videos: comparison.teamAverages.totalVideos > 0
                            ? formatComparison(e.metrics.totalVideos, comparison.teamAverages.totalVideos)
                            : '0%',
                        alteration: formatComparison(e.metrics.alterationRate, comparison.teamAverages.alterationRate, true)
                    },
                    vsLastPeriod: {
                        videos: prevMetrics
                            ? formatComparison(e.metrics.totalVideos, prevMetrics.totalVideos)
                            : 'N/A',
                        alteration: prevMetrics
                            ? formatComparison(e.metrics.alterationRate, prevMetrics.alterationRate, true)
                            : 'N/A'
                    }
                },
                badges
            };
        });

        // Highlights
        const sortedByVolume = [...reportEditors].sort((a, b) => b.metrics.totalVideos - a.metrics.totalVideos);
        const sortedByQuality = [...reportEditors].sort((a, b) => a.metrics.alterationRate - b.metrics.alterationRate);

        // Encontrar quem mais melhorou
        let mostImproved: { name: string; improvement: string } | null = null;
        let bestImprovement = 0;
        for (const e of reportEditors) {
            const prevMetrics = previousMetricsMap.get(e.id);
            if (prevMetrics && prevMetrics.alterationRate > 0) {
                const improvement = prevMetrics.alterationRate - e.metrics.alterationRate;
                if (improvement > bestImprovement) {
                    bestImprovement = improvement;
                    mostImproved = {
                        name: e.name,
                        improvement: `-${Math.round(improvement)}pp na taxa de alteração`
                    };
                }
            }
        }

        // Quem precisa de atenção
        const needsAttention = reportEditors
            .filter(e => e.metrics.alterationRate > 30 || e.metrics.totalVideos === 0)
            .map(e => ({
                name: e.name,
                reason: e.metrics.totalVideos === 0
                    ? 'Sem entregas no período'
                    : `Taxa de alteração muito alta (${e.metrics.alterationRate}%)`
            }));

        // Dados para gráficos
        const chartData = {
            volumeComparison: reportEditors.map(e => ({
                name: e.name.split(' ')[0], // Primeiro nome
                value: e.metrics.totalVideos,
                color: teamColors[e.team || 'default'] || teamColors.default
            })),
            alterationComparison: reportEditors.map(e => ({
                name: e.name.split(' ')[0],
                value: e.metrics.alterationRate,
                color: e.metrics.alterationRate > 25 ? '#ef4444' : e.metrics.alterationRate > 15 ? '#f59e0b' : '#22c55e'
            })),
            radarData: reportEditors.slice(0, 6).map(e => ({
                editor: e.name.split(' ')[0],
                volume: Math.min(100, (e.metrics.totalVideos / (comparison.teamAverages.totalVideos || 1)) * 50),
                quality: Math.max(0, 100 - e.metrics.alterationRate * 2),
                productivity: e.metrics.productivityScore || 50,
                consistency: 100 - Math.abs(e.metrics.alterationRate - comparison.teamAverages.alterationRate) * 2
            }))
        };

        // Label do período
        let periodLabel = '';
        if (type === 'week') {
            periodLabel = `Semana ${periodValue.split('-W')[1]}/${periodValue.split('-W')[0]}`;
        } else if (type === 'month') {
            const [year, month] = periodValue.split('-');
            const monthNames = ['', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
            periodLabel = `${monthNames[parseInt(month)]} ${year}`;
        } else {
            periodLabel = `${periodValue.replace('-Q', ' - Q')}º Trimestre`;
        }

        const report: ComparisonReport = {
            period: {
                type,
                value: periodValue,
                label: periodLabel
            },
            editors: reportEditors,
            teamAverages: comparison.teamAverages,
            highlights: {
                topVolume: sortedByVolume[0]?.metrics.totalVideos > 0
                    ? { name: sortedByVolume[0].name, value: sortedByVolume[0].metrics.totalVideos }
                    : null,
                bestQuality: sortedByQuality[0]?.metrics.totalVideos > 0
                    ? { name: sortedByQuality[0].name, value: sortedByQuality[0].metrics.alterationRate }
                    : null,
                mostImproved,
                needsAttention
            },
            chartData
        };

        return NextResponse.json(report);

    } catch (error) {
        console.error('[Compare] Error:', error);
        return NextResponse.json(
            { error: 'Erro ao comparar editores', details: error instanceof Error ? error.message : 'Unknown' },
            { status: 500 }
        );
    }
}

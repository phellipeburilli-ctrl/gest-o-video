import { NextRequest, NextResponse } from 'next/server';
import {
    getActiveEditors,
    getWeeklyMetricsForAllEditors,
    getMonthlyMetricsForAllEditors,
    getQuarterlyMetricsForAllEditors,
    DbEditorWeeklyMetrics,
    DbEditorMonthlyMetrics,
    DbEditorQuarterlyMetrics
} from '@/lib/db.service';

// =====================================================
// API DE RELATÓRIOS - SEMANAL, MENSAL, TRIMESTRAL
// =====================================================

export const dynamic = 'force-dynamic';

interface ReportData {
    period: {
        type: 'weekly' | 'monthly' | 'quarterly';
        value: string;
        label: string;
        startDate: string;
        endDate: string;
    };
    summary: {
        totalEditors: number;
        totalVideos: number;
        avgAlterationRate: number;
        avgEditingHours: number;
        topPerformer: {
            name: string;
            videos: number;
            alterationRate: number;
        } | null;
        bottomPerformer: {
            name: string;
            videos: number;
            alterationRate: number;
        } | null;
    };
    editors: Array<{
        name: string;
        team: string | null;
        totalVideos: number;
        videosWithAlteration: number;
        alterationRate: number;
        totalEditingHours: number;
        avgEditingHours: number;
        productivityScore?: number;
        qualityScore?: number;
        ranking: number;
        vsTeamAvg: {
            videos: number; // percentual vs média
            alteration: number; // diferença vs média
        };
    }>;
    insights: string[];
}

function getWeekDates(yearWeek: string): { start: string; end: string } {
    // Formato: "2026-W05"
    const [year, weekPart] = yearWeek.split('-W');
    const weekNum = parseInt(weekPart);

    // Primeiro dia do ano
    const jan1 = new Date(parseInt(year), 0, 1);
    // Ajustar para segunda-feira
    const dayOfWeek = jan1.getDay();
    const daysToMonday = dayOfWeek === 0 ? 1 : (dayOfWeek === 1 ? 0 : 8 - dayOfWeek);

    const firstMonday = new Date(jan1);
    firstMonday.setDate(jan1.getDate() + daysToMonday);

    const weekStart = new Date(firstMonday);
    weekStart.setDate(firstMonday.getDate() + (weekNum - 1) * 7);

    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);

    return {
        start: weekStart.toISOString().split('T')[0],
        end: weekEnd.toISOString().split('T')[0]
    };
}

function getMonthDates(yearMonth: string): { start: string; end: string } {
    // Formato: "2026-02"
    const [year, month] = yearMonth.split('-').map(Number);
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 0); // Último dia do mês

    return {
        start: start.toISOString().split('T')[0],
        end: end.toISOString().split('T')[0]
    };
}

function getQuarterDates(yearQuarter: string): { start: string; end: string } {
    // Formato: "2026-Q1"
    const [year, quarterPart] = yearQuarter.split('-Q');
    const quarter = parseInt(quarterPart);

    const startMonth = (quarter - 1) * 3;
    const start = new Date(parseInt(year), startMonth, 1);
    const end = new Date(parseInt(year), startMonth + 3, 0);

    return {
        start: start.toISOString().split('T')[0],
        end: end.toISOString().split('T')[0]
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

function generateInsights(
    editors: ReportData['editors'],
    summary: ReportData['summary'],
    periodType: string
): string[] {
    const insights: string[] = [];

    // Insight sobre taxa de alteração
    if (summary.avgAlterationRate > 25) {
        insights.push(`⚠️ Taxa de alteração média está alta (${summary.avgAlterationRate}%). Meta: abaixo de 20%.`);
    } else if (summary.avgAlterationRate <= 15) {
        insights.push(`✅ Excelente taxa de alteração média (${summary.avgAlterationRate}%).`);
    }

    // Insight sobre top performer
    if (summary.topPerformer) {
        insights.push(`🏆 ${summary.topPerformer.name} liderou com ${summary.topPerformer.videos} vídeos e ${summary.topPerformer.alterationRate}% de alteração.`);
    }

    // Editores com alta taxa de alteração
    const highAlteration = editors.filter(e => e.alterationRate > 30);
    if (highAlteration.length > 0) {
        const names = highAlteration.map(e => e.name).join(', ');
        insights.push(`🔴 Atenção: ${names} com taxa de alteração acima de 30%.`);
    }

    // Editores com baixa produtividade
    const lowProduction = editors.filter(e => e.totalVideos < summary.totalVideos / editors.length * 0.5);
    if (lowProduction.length > 0) {
        const names = lowProduction.map(e => e.name).join(', ');
        insights.push(`📉 ${names} produziu(ram) menos de 50% da média da equipe.`);
    }

    // Editores destaques positivos
    const stars = editors.filter(e => e.alterationRate <= 10 && e.totalVideos >= summary.totalVideos / editors.length);
    if (stars.length > 0) {
        const names = stars.map(e => e.name).join(', ');
        insights.push(`⭐ Destaque: ${names} - alta produção com baixa alteração.`);
    }

    return insights;
}

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const type = searchParams.get('type') || 'monthly'; // weekly, monthly, quarterly
    const period = searchParams.get('period'); // ex: "2026-W05", "2026-02", "2026-Q1"

    try {
        // Determinar período
        let periodValue: string;
        let periodType: 'weekly' | 'monthly' | 'quarterly';

        if (type === 'weekly') {
            periodType = 'weekly';
            periodValue = period || getCurrentWeek();
        } else if (type === 'quarterly') {
            periodType = 'quarterly';
            periodValue = period || getCurrentQuarter();
        } else {
            periodType = 'monthly';
            periodValue = period || getCurrentMonth();
        }

        // Buscar dados do período
        const activeEditors = await getActiveEditors();
        let reportEditors: ReportData['editors'] = [];
        let periodLabel = '';
        let periodDates = { start: '', end: '' };

        if (periodType === 'weekly') {
            periodLabel = `Semana ${periodValue.split('-W')[1]}/${periodValue.split('-W')[0]}`;
            periodDates = getWeekDates(periodValue);

            const weeklyMetrics = await getWeeklyMetricsForAllEditors(periodValue);
            const metricsMap = new Map(weeklyMetrics.map(m => [m.editor_id, m]));

            reportEditors = activeEditors.map(editor => {
                const metrics = metricsMap.get(editor.id);
                return {
                    name: editor.name,
                    team: editor.team_id,
                    totalVideos: metrics?.total_videos || 0,
                    videosWithAlteration: metrics?.videos_with_alteration || 0,
                    alterationRate: metrics?.alteration_rate || 0,
                    totalEditingHours: metrics?.total_editing_hours || 0,
                    avgEditingHours: metrics?.avg_editing_hours || 0,
                    productivityScore: metrics?.productivity_score || 0,
                    qualityScore: metrics?.quality_score || 0,
                    ranking: 0,
                    vsTeamAvg: { videos: 0, alteration: 0 }
                };
            });
        } else if (periodType === 'monthly') {
            const [year, month] = periodValue.split('-');
            const monthNames = ['', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
            periodLabel = `${monthNames[parseInt(month)]} ${year}`;
            periodDates = getMonthDates(periodValue);

            const monthlyMetrics = await getMonthlyMetricsForAllEditors(periodValue);
            const metricsMap = new Map(monthlyMetrics.map(m => [m.editor_id, m]));

            reportEditors = activeEditors.map(editor => {
                const metrics = metricsMap.get(editor.id);
                return {
                    name: editor.name,
                    team: editor.team_id,
                    totalVideos: metrics?.total_videos || 0,
                    videosWithAlteration: metrics?.videos_with_alteration || 0,
                    alterationRate: metrics?.alteration_rate || 0,
                    totalEditingHours: metrics?.total_editing_hours || 0,
                    avgEditingHours: metrics?.avg_editing_hours || 0,
                    ranking: 0,
                    vsTeamAvg: { videos: 0, alteration: 0 }
                };
            });
        } else {
            periodLabel = `${periodValue.replace('-Q', ' - Q')}º Trimestre`;
            periodDates = getQuarterDates(periodValue);

            const quarterlyMetrics = await getQuarterlyMetricsForAllEditors(periodValue);
            const metricsMap = new Map(quarterlyMetrics.map(m => [m.editor_id, m]));

            reportEditors = activeEditors.map(editor => {
                const metrics = metricsMap.get(editor.id);
                return {
                    name: editor.name,
                    team: editor.team_id,
                    totalVideos: metrics?.total_videos || 0,
                    videosWithAlteration: metrics?.videos_with_alteration || 0,
                    alterationRate: metrics?.alteration_rate || 0,
                    totalEditingHours: metrics?.total_editing_hours || 0,
                    avgEditingHours: metrics?.avg_editing_hours || 0,
                    ranking: 0,
                    vsTeamAvg: { videos: 0, alteration: 0 }
                };
            });
        }

        // Calcular médias
        const totalVideos = reportEditors.reduce((sum, e) => sum + e.totalVideos, 0);
        const avgVideos = reportEditors.length > 0 ? totalVideos / reportEditors.length : 0;
        const avgAlteration = reportEditors.length > 0
            ? reportEditors.reduce((sum, e) => sum + e.alterationRate, 0) / reportEditors.length
            : 0;
        const avgEditingHours = reportEditors.length > 0
            ? reportEditors.reduce((sum, e) => sum + e.avgEditingHours, 0) / reportEditors.length
            : 0;

        // Calcular vsTeamAvg e ranking
        reportEditors = reportEditors
            .map(e => ({
                ...e,
                vsTeamAvg: {
                    videos: avgVideos > 0 ? Math.round(((e.totalVideos - avgVideos) / avgVideos) * 100) : 0,
                    alteration: Math.round((e.alterationRate - avgAlteration) * 10) / 10
                }
            }))
            .sort((a, b) => {
                // Ordenar por: mais vídeos, menor taxa de alteração
                const scoreA = a.totalVideos * 10 - a.alterationRate;
                const scoreB = b.totalVideos * 10 - b.alterationRate;
                return scoreB - scoreA;
            })
            .map((e, index) => ({ ...e, ranking: index + 1 }));

        // Encontrar top e bottom performers
        const sortedByScore = [...reportEditors].sort((a, b) => {
            const scoreA = a.totalVideos - a.alterationRate * 0.5;
            const scoreB = b.totalVideos - b.alterationRate * 0.5;
            return scoreB - scoreA;
        });

        const topPerformer = sortedByScore[0]?.totalVideos > 0 ? {
            name: sortedByScore[0].name,
            videos: sortedByScore[0].totalVideos,
            alterationRate: sortedByScore[0].alterationRate
        } : null;

        const bottomPerformer = sortedByScore.length > 1 && sortedByScore[sortedByScore.length - 1]?.totalVideos > 0 ? {
            name: sortedByScore[sortedByScore.length - 1].name,
            videos: sortedByScore[sortedByScore.length - 1].totalVideos,
            alterationRate: sortedByScore[sortedByScore.length - 1].alterationRate
        } : null;

        // Montar resposta
        const summary: ReportData['summary'] = {
            totalEditors: reportEditors.length,
            totalVideos,
            avgAlterationRate: Math.round(avgAlteration * 10) / 10,
            avgEditingHours: Math.round(avgEditingHours * 10) / 10,
            topPerformer,
            bottomPerformer
        };

        const insights = generateInsights(reportEditors, summary, periodType);

        const report: ReportData = {
            period: {
                type: periodType,
                value: periodValue,
                label: periodLabel,
                startDate: periodDates.start,
                endDate: periodDates.end
            },
            summary,
            editors: reportEditors,
            insights
        };

        return NextResponse.json(report);

    } catch (error) {
        console.error('[Reports] Error:', error);
        return NextResponse.json(
            { error: 'Erro ao gerar relatório', details: error instanceof Error ? error.message : 'Unknown' },
            { status: 500 }
        );
    }
}

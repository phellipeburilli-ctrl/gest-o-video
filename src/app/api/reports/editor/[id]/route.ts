import { NextRequest, NextResponse } from 'next/server';
import {
    getEditorById,
    getEditorEvolutionAnalysis,
    getEditorWeeklyMetrics,
    getEditorMonthlyMetrics,
    getEditorQuarterlyMetrics,
    getTasksByEditor,
    DbTask
} from '@/lib/db.service';

// =====================================================
// API DE ANÁLISE INDIVIDUAL DO EDITOR
// =====================================================

export const dynamic = 'force-dynamic';

interface EditorAnalysisReport {
    editor: {
        id: number;
        name: string;
        team: string | null;
        role: string;
        admissionDate: string | null;
        monthsInCompany: number;
        status: string;
    };
    currentPeriod: {
        week: {
            totalVideos: number;
            alterationRate: number;
            productivityScore: number;
            qualityScore: number;
        } | null;
        month: {
            totalVideos: number;
            alterationRate: number;
            totalEditingHours: number;
            avgEditingHours: number;
        } | null;
    };
    evolution: {
        weeklyTrend: Array<{
            period: string;
            videos: number;
            alterationRate: number;
            productivityScore: number;
        }>;
        monthlyTrend: Array<{
            period: string;
            videos: number;
            alterationRate: number;
            editingHours: number;
        }>;
        quarterlyTrend: Array<{
            period: string;
            videos: number;
            alterationRate: number;
            ranking: number;
        }>;
    };
    improvements: {
        alterationRateChange: number;
        productivityChange: number;
        volumeChange: number;
        trend: 'improving' | 'stable' | 'declining';
    };
    strengths: string[];
    areasToImprove: string[];
    overallScore: number;
    recentTasks: Array<{
        id: string;
        title: string;
        status: string;
        videoType: string | null;
        dateCreated: string;
        dateClosed: string | null;
    }>;
    recommendations: string[];
}

function calculateMonthsInCompany(admissionDate: Date | string | null): number {
    if (!admissionDate) return 0;
    try {
        const now = new Date();
        const admission = typeof admissionDate === 'string' ? new Date(admissionDate) : admissionDate;
        if (isNaN(admission.getTime())) return 0;
        const diffMs = now.getTime() - admission.getTime();
        return Math.floor(diffMs / (1000 * 60 * 60 * 24 * 30));
    } catch {
        return 0;
    }
}

function generateRecommendations(
    alterationRate: number,
    productivityScore: number,
    volumeChange: number,
    monthsInCompany: number
): string[] {
    const recommendations: string[] = [];

    // Recomendações baseadas em taxa de alteração
    if (alterationRate > 30) {
        recommendations.push('📋 Agendar sessão de feedback focada em entender padrões de erro recorrentes.');
        recommendations.push('🎯 Definir checklist de qualidade antes da entrega.');
    } else if (alterationRate > 20) {
        recommendations.push('👀 Revisar últimos vídeos com alteração para identificar padrões.');
    }

    // Recomendações baseadas em produtividade
    if (productivityScore < 50) {
        recommendations.push('⏱️ Avaliar se há gargalos no processo ou necessidade de treinamento.');
        recommendations.push('🤝 Considerar mentoria com editor mais experiente.');
    }

    // Recomendações baseadas em volume
    if (volumeChange < -20) {
        recommendations.push('📉 Volume em queda - verificar se há problemas de demanda ou bloqueios.');
    }

    // Recomendações por tempo de empresa
    if (monthsInCompany <= 3) {
        recommendations.push('🆕 Editor em período de adaptação - acompanhamento mais próximo recomendado.');
    } else if (monthsInCompany >= 6 && alterationRate <= 15) {
        recommendations.push('⬆️ Considerar para projetos mais complexos ou promoção.');
    }

    // Recomendação padrão se tudo estiver bem
    if (recommendations.length === 0) {
        recommendations.push('✅ Manter acompanhamento regular. Performance está dentro do esperado.');
    }

    return recommendations;
}

export async function GET(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    const { id } = await context.params;
    const editorId = parseInt(id);

    if (isNaN(editorId)) {
        return NextResponse.json({ error: 'ID inválido' }, { status: 400 });
    }

    try {
        // Buscar dados do editor
        const editor = await getEditorById(editorId);
        if (!editor) {
            return NextResponse.json({ error: 'Editor não encontrado' }, { status: 404 });
        }

        // Buscar análise de evolução
        const evolutionAnalysis = await getEditorEvolutionAnalysis(editorId);

        // Buscar métricas
        const weeklyMetrics = await getEditorWeeklyMetrics(editorId, 8);
        const monthlyMetrics = await getEditorMonthlyMetrics(editorId);
        const quarterlyMetrics = await getEditorQuarterlyMetrics(editorId, 4);

        // Buscar tasks recentes (com tratamento seguro)
        let recentTasks: Awaited<ReturnType<typeof getTasksByEditor>> = [];
        try {
            recentTasks = await getTasksByEditor(editorId, 10);
        } catch (e) {
            console.error('[Editor Analysis] Error fetching tasks:', e);
        }

        // Calcular meses na empresa
        const monthsInCompany = calculateMonthsInCompany(editor.admission_date);

        // Período atual
        const currentWeek = weeklyMetrics[0] || null;
        const currentMonth = monthlyMetrics[0] || null;

        // Determinar tendência
        let trend: 'improving' | 'stable' | 'declining' = 'stable';
        if (evolutionAnalysis) {
            const { alterationRateChange, productivityChange } = evolutionAnalysis.improvements;
            if (alterationRateChange < -5 && productivityChange > 5) {
                trend = 'improving';
            } else if (alterationRateChange > 5 || productivityChange < -10) {
                trend = 'declining';
            }
        }

        // Montar relatório
        const report: EditorAnalysisReport = {
            editor: {
                id: editor.id,
                name: editor.name,
                team: editor.team_id,
                role: editor.role,
                admissionDate: editor.admission_date
                    ? String(editor.admission_date).split('T')[0]
                    : null,
                monthsInCompany,
                status: editor.status
            },
            currentPeriod: {
                week: currentWeek ? {
                    totalVideos: currentWeek.total_videos,
                    alterationRate: currentWeek.alteration_rate,
                    productivityScore: currentWeek.productivity_score,
                    qualityScore: currentWeek.quality_score
                } : null,
                month: currentMonth ? {
                    totalVideos: currentMonth.total_videos,
                    alterationRate: currentMonth.alteration_rate,
                    totalEditingHours: currentMonth.total_editing_hours,
                    avgEditingHours: currentMonth.avg_editing_hours
                } : null
            },
            evolution: {
                weeklyTrend: weeklyMetrics.map(w => ({
                    period: w.year_week,
                    videos: w.total_videos,
                    alterationRate: w.alteration_rate,
                    productivityScore: w.productivity_score
                })).reverse(),
                monthlyTrend: monthlyMetrics.slice(0, 6).map(m => ({
                    period: m.year_month,
                    videos: m.total_videos,
                    alterationRate: m.alteration_rate,
                    editingHours: m.total_editing_hours
                })).reverse(),
                quarterlyTrend: quarterlyMetrics.map(q => ({
                    period: q.year_quarter,
                    videos: q.total_videos,
                    alterationRate: q.alteration_rate,
                    ranking: q.ranking_position
                })).reverse()
            },
            improvements: evolutionAnalysis ? {
                ...evolutionAnalysis.improvements,
                trend
            } : {
                alterationRateChange: 0,
                productivityChange: 0,
                volumeChange: 0,
                trend: 'stable'
            },
            strengths: evolutionAnalysis?.strengths || [],
            areasToImprove: evolutionAnalysis?.areasToImprove || [],
            overallScore: evolutionAnalysis?.overallScore || 50,
            recentTasks: recentTasks.map(t => ({
                id: t.id,
                title: t.title,
                status: t.status,
                videoType: t.video_type,
                dateCreated: t.date_created ? String(t.date_created) : '',
                dateClosed: t.date_closed ? String(t.date_closed) : null
            })),
            recommendations: generateRecommendations(
                currentMonth?.alteration_rate || currentWeek?.alteration_rate || 0,
                currentWeek?.productivity_score || 50,
                evolutionAnalysis?.improvements.volumeChange || 0,
                monthsInCompany
            )
        };

        return NextResponse.json(report);

    } catch (error) {
        console.error('[Editor Analysis] Error:', error);
        console.error('[Editor Analysis] Stack:', error instanceof Error ? error.stack : 'No stack');
        return NextResponse.json(
            {
                error: 'Erro ao gerar análise',
                details: error instanceof Error ? error.message : 'Unknown',
                stack: error instanceof Error ? error.stack : undefined
            },
            { status: 500 }
        );
    }
}

import { NextRequest, NextResponse } from 'next/server';
import {
    getEditorById,
    getEditorWeeklyMetrics,
    getEditorMonthlyMetrics,
    getTasksByEditor,
} from '@/lib/db.service';

export const dynamic = 'force-dynamic';

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

        // Buscar métricas semanais
        let weeklyMetrics: Array<{
            year_week: string;
            total_videos: number;
            alteration_rate: number;
            productivity_score: number;
            quality_score: number;
        }> = [];
        try {
            weeklyMetrics = await getEditorWeeklyMetrics(editorId, 8);
        } catch (e) {
            console.error('[Editor] Weekly error:', e);
        }

        // Buscar métricas mensais
        let monthlyMetrics: Array<{
            year_month: string;
            total_videos: number;
            alteration_rate: number;
            total_editing_hours: number;
            avg_editing_hours: number;
        }> = [];
        try {
            monthlyMetrics = await getEditorMonthlyMetrics(editorId);
        } catch (e) {
            console.error('[Editor] Monthly error:', e);
        }

        // Buscar tasks
        let recentTasks: Array<{
            id: string;
            title: string;
            status: string;
            video_type: string | null;
            date_created: number;
            date_closed: number | null;
        }> = [];
        try {
            recentTasks = await getTasksByEditor(editorId, 10);
        } catch (e) {
            console.error('[Editor] Tasks error:', e);
        }

        // Período atual
        const currentWeek = weeklyMetrics[0] || null;
        const currentMonth = monthlyMetrics[0] || null;

        // Calcular meses na empresa de forma segura
        let monthsInCompany = 0;
        if (editor.admission_date) {
            try {
                const admStr = String(editor.admission_date);
                const admDate = new Date(admStr);
                if (!isNaN(admDate.getTime())) {
                    const now = new Date();
                    monthsInCompany = Math.floor((now.getTime() - admDate.getTime()) / (1000 * 60 * 60 * 24 * 30));
                }
            } catch {
                monthsInCompany = 0;
            }
        }

        // Montar resposta simplificada
        const response = {
            editor: {
                id: editor.id,
                name: editor.name,
                team: editor.team_id,
                role: editor.role,
                admissionDate: editor.admission_date ? String(editor.admission_date).split('T')[0] : null,
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
                quarterlyTrend: []
            },
            improvements: {
                alterationRateChange: 0,
                productivityChange: 0,
                volumeChange: 0,
                trend: 'stable' as const
            },
            strengths: [] as string[],
            areasToImprove: [] as string[],
            overallScore: currentWeek
                ? Math.round((currentWeek.productivity_score * 0.4) + (currentWeek.quality_score * 0.4) + ((100 - currentWeek.alteration_rate) * 0.2))
                : 50,
            recentTasks: recentTasks.map(t => ({
                id: t.id,
                title: t.title,
                status: t.status,
                videoType: t.video_type,
                dateCreated: String(t.date_created || ''),
                dateClosed: t.date_closed ? String(t.date_closed) : null
            })),
            recommendations: monthsInCompany <= 3
                ? ['🆕 Editor em período de adaptação - acompanhamento mais próximo recomendado.']
                : ['✅ Manter acompanhamento regular. Performance está dentro do esperado.']
        };

        return NextResponse.json(response);

    } catch (error) {
        console.error('[Editor Analysis] Error:', error);
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

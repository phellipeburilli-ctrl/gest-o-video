'use client';

import { useState, useEffect } from 'react';
import { DashboardKPIs, NormalizedTask } from '@/types';
import { ALL_TEAMS, getTeamByMemberName, TeamMember } from '@/lib/constants';
import {
    Award,
    Clock,
    AlertCircle,
    CheckCircle,
    TrendingUp,
    TrendingDown,
    Calendar,
    Shield,
    User,
    AlertTriangle,
    Target,
    Zap,
    Lightbulb,
    BarChart3,
    ArrowUp,
    ArrowDown,
    Minus
} from 'lucide-react';

interface EvolucaoViewProps {
    kpis: DashboardKPIs;
    allVideos: NormalizedTask[];
    lastUpdated: number;
}

// Datas de admissão dos editores
const ADMISSION_DATES: Record<number, number> = {
    // VSL
    248675265: new Date('2026-01-15').getTime(), // Nathan Soares
    84070913: new Date('2026-01-26').getTime(),  // Victor Mazzine
    // Funil
    112053206: new Date('2026-01-28').getTime(), // Moises Ramalho
    152605916: new Date('2026-01-28').getTime(), // Victor Mendes
    3258937: new Date('2025-08-19').getTime(),   // Renato Fernandes
    3272897: new Date('2025-07-29').getTime(),   // Douglas Prado
    // ADs
    96683026: new Date('2026-01-15').getTime(),  // Leonardo da Silva
    84241154: new Date('2026-01-27').getTime(),  // Rafael Andrade
    // TP/MIC/LEAD
    82093531: new Date('2025-08-01').getTime(),  // Loren Gayoso
    82074101: new Date('2025-11-19').getTime(),  // Bruno Cesar
};

// Mapeamento clickup_id para db_id
const CLICKUP_TO_DB_ID: Record<number, number> = {
    248675265: 1,  // Nathan Soares
    84070913: 2,   // Victor Mazzine
    112053206: 3,  // Moises Ramalho
    152605916: 4,  // Victor Mendes
    3258937: 5,    // Renato Fernandes
    3272897: 6,    // Douglas Prado
    96683026: 7,   // Leonardo da Silva
    84241154: 8,   // Rafael Andrade
    82093531: 9,   // Loren Gayoso
    82074101: 10,  // Bruno Cesar
};

interface EditorEvolution {
    member: TeamMember;
    teamName: string;
    teamColor: string;
    admissionDate: number;
    monthsInCompany: number;
    daysUntilPromotion: number;
    alterationRate: number;
    alterationRateLast2Months: number;
    status: 'on_track' | 'attention' | 'risk' | 'promoted' | 'audit_mode';
    isInAuditMode: boolean;
    canBePromoted: boolean;
    videosCount: number;
    initials: string;
    dbId: number | null;
}

interface EditorAnalysisData {
    overallScore: number;
    strengths: string[];
    areasToImprove: string[];
    recommendations: string[];
    improvements: {
        alterationRateChange: number;
        productivityChange: number;
        volumeChange: number;
        trend: 'improving' | 'stable' | 'declining';
    };
    evolution: {
        weeklyTrend: Array<{
            period: string;
            videos: number;
            alterationRate: number;
            productivityScore: number;
        }>;
    };
}

function calculateMonthsDiff(start: number, end: number): number {
    const startDate = new Date(start);
    const endDate = new Date(end);
    return (endDate.getFullYear() - startDate.getFullYear()) * 12 +
        (endDate.getMonth() - startDate.getMonth());
}

function getInitials(name: string): string {
    return name
        .split(' ')
        .map(n => n[0])
        .join('')
        .substring(0, 2)
        .toUpperCase();
}

export function EvolucaoView({ kpis, allVideos, lastUpdated }: EvolucaoViewProps) {
    const [selectedEditorId, setSelectedEditorId] = useState<number | null>(null);
    const [analysisData, setAnalysisData] = useState<EditorAnalysisData | null>(null);
    const [loadingAnalysis, setLoadingAnalysis] = useState(false);
    const now = Date.now();

    // Calculate last 2 months range
    const twoMonthsAgo = new Date();
    twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);
    const twoMonthsAgoTimestamp = twoMonthsAgo.getTime();

    // Build evolution data for each editor
    const editorsEvolution: EditorEvolution[] = [];

    ALL_TEAMS.forEach(team => {
        team.members.forEach(member => {
            if (member.role === 'leader') return;

            const admissionDate = ADMISSION_DATES[member.id];
            if (!admissionDate) return;

            const monthsInCompany = calculateMonthsDiff(admissionDate, now);
            const daysUntilPromotion = Math.max(0, 365 - Math.floor((now - admissionDate) / (1000 * 60 * 60 * 24)));

            const editorStats = kpis.editors.find(e =>
                e.editorName.toLowerCase() === member.name.toLowerCase()
            );

            const editorVideosLast2Months = allVideos.filter(v => {
                if (v.editorName.toLowerCase() !== member.name.toLowerCase()) return false;
                if (!v.dateClosed) return false;
                return v.dateClosed >= twoMonthsAgoTimestamp;
            });

            const videosWithAlteration = editorVideosLast2Months.filter(v =>
                v.phaseTime?.alterationTimeMs && v.phaseTime.alterationTimeMs > 0
            ).length;

            const alterationRateLast2Months = editorVideosLast2Months.length > 0
                ? (videosWithAlteration / editorVideosLast2Months.length) * 100
                : 0;

            const alterationRate = editorStats?.phaseMetrics?.alterationRate || 0;

            const isInAuditMode = monthsInCompany >= 10 && monthsInCompany < 12;
            let status: EditorEvolution['status'] = 'on_track';

            if (monthsInCompany >= 12 && alterationRateLast2Months <= 5) {
                status = 'promoted';
            } else if (isInAuditMode) {
                status = 'audit_mode';
            } else if (alterationRateLast2Months > 10) {
                status = 'risk';
            } else if (alterationRateLast2Months > 5) {
                status = 'attention';
            }

            const canBePromoted = monthsInCompany >= 12 && alterationRateLast2Months <= 5;

            editorsEvolution.push({
                member,
                teamName: team.name,
                teamColor: team.color,
                admissionDate,
                monthsInCompany,
                daysUntilPromotion,
                alterationRate,
                alterationRateLast2Months: parseFloat(alterationRateLast2Months.toFixed(1)),
                status,
                isInAuditMode,
                canBePromoted,
                videosCount: editorVideosLast2Months.length,
                initials: getInitials(member.name),
                dbId: CLICKUP_TO_DB_ID[member.id] || null,
            });
        });
    });

    // Sort by months in company (closest to promotion first)
    editorsEvolution.sort((a, b) => b.monthsInCompany - a.monthsInCompany);

    const selectedEditor = selectedEditorId
        ? editorsEvolution.find(e => e.member.id === selectedEditorId)
        : null;

    // Fetch analysis data when editor is selected
    useEffect(() => {
        if (selectedEditor?.dbId) {
            setLoadingAnalysis(true);
            fetch(`/api/reports/editor/${selectedEditor.dbId}`)
                .then(res => res.json())
                .then(data => {
                    if (data && !data.error) {
                        setAnalysisData({
                            overallScore: data.overallScore || 50,
                            strengths: data.strengths || [],
                            areasToImprove: data.areasToImprove || [],
                            recommendations: data.recommendations || [],
                            improvements: data.improvements || {
                                alterationRateChange: 0,
                                productivityChange: 0,
                                volumeChange: 0,
                                trend: 'stable'
                            },
                            evolution: {
                                weeklyTrend: data.evolution?.weeklyTrend || []
                            }
                        });
                    } else {
                        setAnalysisData(null);
                    }
                })
                .catch(() => setAnalysisData(null))
                .finally(() => setLoadingAnalysis(false));
        } else {
            setAnalysisData(null);
        }
    }, [selectedEditor?.dbId]);

    const statusConfig = {
        on_track: { color: 'text-green-400', bg: 'bg-green-600/20', border: 'border-green-500/30', icon: CheckCircle, label: 'No Caminho' },
        attention: { color: 'text-amber-400', bg: 'bg-amber-600/20', border: 'border-amber-500/30', icon: AlertCircle, label: 'Atenção' },
        risk: { color: 'text-red-400', bg: 'bg-red-600/20', border: 'border-red-500/30', icon: AlertTriangle, label: 'Risco' },
        promoted: { color: 'text-purple-400', bg: 'bg-purple-600/20', border: 'border-purple-500/30', icon: Award, label: 'Apto p/ Pleno' },
        audit_mode: { color: 'text-blue-400', bg: 'bg-blue-600/20', border: 'border-blue-500/30', icon: Shield, label: 'Auditoria' },
    };

    const editorsInAudit = editorsEvolution.filter(e => e.isInAuditMode);
    const editorsReadyForPromotion = editorsEvolution.filter(e => e.canBePromoted);
    const editorsAtRisk = editorsEvolution.filter(e => e.status === 'risk' || e.status === 'attention');

    const getTrendIcon = (trend: string) => {
        if (trend === 'improving') return <TrendingUp className="w-4 h-4 text-green-400" />;
        if (trend === 'declining') return <TrendingDown className="w-4 h-4 text-red-400" />;
        return <Minus className="w-4 h-4 text-gray-400" />;
    };

    const getScoreColor = (score: number) => {
        if (score >= 80) return 'text-green-400';
        if (score >= 60) return 'text-blue-400';
        if (score >= 40) return 'text-amber-400';
        return 'text-red-400';
    };

    return (
        <div className="p-6">
            {/* Header compacto */}
            <div className="flex justify-between items-start mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                        <TrendingUp className="w-6 h-6 text-purple-400" />
                        Evolução de Time
                    </h1>
                    <p className="text-gray-500 text-sm">
                        {editorsEvolution.length} editores • {editorsReadyForPromotion.length} aptos para pleno
                    </p>
                </div>
                <div className="text-right text-sm text-gray-500">
                    {new Date(lastUpdated).toLocaleString('pt-BR')}
                </div>
            </div>

            <div className="flex gap-6">
                {/* Lista de editores - estilo Padrões de Erro */}
                <div className="w-[420px] flex-shrink-0">
                    <p className="text-gray-400 text-sm mb-3">Selecione um Editor</p>

                    {/* Lista de editores */}
                    <div className="space-y-1 max-h-[calc(100vh-200px)] overflow-y-auto">
                        {editorsEvolution.map(editor => {
                            const config = statusConfig[editor.status];
                            const progressPercent = Math.min(100, (editor.monthsInCompany / 12) * 100);

                            return (
                                <div
                                    key={editor.member.id}
                                    onClick={() => setSelectedEditorId(editor.member.id)}
                                    className={`
                                        flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all
                                        ${selectedEditorId === editor.member.id
                                            ? 'bg-purple-600/30 border border-purple-500/50'
                                            : 'bg-[#12121a] border border-transparent hover:border-purple-500/30'
                                        }
                                    `}
                                >
                                    <div
                                        className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
                                        style={{ backgroundColor: editor.member.color }}
                                    >
                                        {editor.initials}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className="text-white font-medium truncate">{editor.member.name}</span>
                                            {editor.status === 'risk' && (
                                                <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
                                            )}
                                            {editor.isInAuditMode && (
                                                <Shield className="w-4 h-4 text-blue-400 flex-shrink-0" />
                                            )}
                                            {editor.canBePromoted && (
                                                <Award className="w-4 h-4 text-purple-400 flex-shrink-0" />
                                            )}
                                        </div>
                                        <span className="text-gray-500 text-xs">
                                            {editor.monthsInCompany}/12 meses • {editor.alterationRateLast2Months}% alteração
                                        </span>
                                    </div>
                                    <div className="text-right flex-shrink-0">
                                        <span className={`text-lg font-bold ${config.color}`}>
                                            {progressPercent.toFixed(0)}%
                                        </span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Área de conteúdo */}
                <div className="flex-1 min-w-0">
                    {selectedEditor ? (
                        /* Detalhes do editor selecionado */
                        <div className="space-y-4">
                            {/* Header do editor */}
                            <div className="bg-[#12121a] border border-purple-900/30 rounded-xl p-4">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div
                                            className="w-14 h-14 rounded-full flex items-center justify-center text-white font-bold text-xl"
                                            style={{ backgroundColor: selectedEditor.member.color }}
                                        >
                                            {selectedEditor.initials}
                                        </div>
                                        <div>
                                            <h2 className="text-xl font-bold text-white">{selectedEditor.member.name}</h2>
                                            <p className="text-gray-500 text-sm">{selectedEditor.teamName}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        {/* Score Geral */}
                                        {analysisData && (
                                            <div className="text-center">
                                                <p className={`text-3xl font-bold ${getScoreColor(analysisData.overallScore)}`}>
                                                    {analysisData.overallScore}
                                                </p>
                                                <p className="text-gray-500 text-xs">Score</p>
                                            </div>
                                        )}
                                        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full ${statusConfig[selectedEditor.status].bg}`}>
                                            {(() => {
                                                const StatusIcon = statusConfig[selectedEditor.status].icon;
                                                return <StatusIcon className={`w-4 h-4 ${statusConfig[selectedEditor.status].color}`} />;
                                            })()}
                                            <span className={`text-sm font-medium ${statusConfig[selectedEditor.status].color}`}>
                                                {statusConfig[selectedEditor.status].label}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Barra de progresso */}
                            <div className="bg-[#12121a] border border-purple-900/30 rounded-xl p-4">
                                <div className="flex justify-between text-sm mb-2">
                                    <span className="text-gray-400">Progresso para 12 meses</span>
                                    <span className="text-white font-medium">{selectedEditor.monthsInCompany}/12 meses</span>
                                </div>
                                <div className="h-4 bg-gray-800 rounded-full overflow-hidden">
                                    <div
                                        className="h-full rounded-full transition-all duration-500"
                                        style={{
                                            width: `${Math.min(100, (selectedEditor.monthsInCompany / 12) * 100)}%`,
                                            backgroundColor: selectedEditor.isInAuditMode ? '#3b82f6' :
                                                selectedEditor.canBePromoted ? '#a855f7' :
                                                    selectedEditor.member.color
                                        }}
                                    />
                                </div>
                                {selectedEditor.isInAuditMode && (
                                    <p className="text-blue-400 text-xs mt-2 flex items-center gap-1">
                                        <Shield className="w-3 h-3" />
                                        Modo Auditoria ativo - monitoramento intensivo nos meses 11 e 12
                                    </p>
                                )}
                            </div>

                            {/* Métricas + Tendência */}
                            <div className="grid grid-cols-4 gap-3">
                                <div className="bg-[#12121a] border border-purple-900/30 rounded-xl p-3">
                                    <p className="text-gray-500 text-xs mb-1">Data de Admissão</p>
                                    <p className="text-white font-bold">
                                        {new Date(selectedEditor.admissionDate).toLocaleDateString('pt-BR')}
                                    </p>
                                </div>
                                <div className="bg-[#12121a] border border-purple-900/30 rounded-xl p-3">
                                    <p className="text-gray-500 text-xs mb-1">Dias p/ Promoção</p>
                                    <p className={`font-bold ${selectedEditor.daysUntilPromotion === 0 ? 'text-purple-400' : 'text-white'}`}>
                                        {selectedEditor.daysUntilPromotion === 0 ? 'Elegível!' : `${selectedEditor.daysUntilPromotion} dias`}
                                    </p>
                                </div>
                                <div className="bg-[#12121a] border border-purple-900/30 rounded-xl p-3">
                                    <p className="text-gray-500 text-xs mb-1">Taxa Alteração (2m)</p>
                                    <p className={`font-bold ${
                                        selectedEditor.alterationRateLast2Months <= 5 ? 'text-green-400' :
                                        selectedEditor.alterationRateLast2Months <= 10 ? 'text-amber-400' : 'text-red-400'
                                    }`}>
                                        {selectedEditor.alterationRateLast2Months}%
                                    </p>
                                </div>
                                <div className="bg-[#12121a] border border-purple-900/30 rounded-xl p-3">
                                    <p className="text-gray-500 text-xs mb-1">Vídeos (2m)</p>
                                    <p className="text-white font-bold">{selectedEditor.videosCount}</p>
                                </div>
                            </div>

                            {/* Análise de Evolução do Banco */}
                            {loadingAnalysis ? (
                                <div className="bg-[#12121a] border border-purple-900/30 rounded-xl p-8 text-center">
                                    <div className="animate-spin w-8 h-8 border-2 border-purple-400 border-t-transparent rounded-full mx-auto mb-3" />
                                    <p className="text-gray-400">Carregando análise...</p>
                                </div>
                            ) : analysisData && (analysisData.evolution.weeklyTrend.length > 0 || analysisData.strengths.length > 0) ? (
                                <>
                                    {/* Tendência Semanal */}
                                    {analysisData.evolution.weeklyTrend.length > 0 && (
                                        <div className="bg-[#12121a] border border-purple-900/30 rounded-xl p-4">
                                            <div className="flex items-center justify-between mb-3">
                                                <h3 className="text-white font-medium flex items-center gap-2">
                                                    <BarChart3 className="w-4 h-4 text-purple-400" />
                                                    Tendência Semanal
                                                </h3>
                                                <div className="flex items-center gap-1 text-sm">
                                                    {getTrendIcon(analysisData.improvements.trend)}
                                                    <span className={
                                                        analysisData.improvements.trend === 'improving' ? 'text-green-400' :
                                                        analysisData.improvements.trend === 'declining' ? 'text-red-400' : 'text-gray-400'
                                                    }>
                                                        {analysisData.improvements.trend === 'improving' ? 'Melhorando' :
                                                         analysisData.improvements.trend === 'declining' ? 'Em queda' : 'Estável'}
                                                    </span>
                                                </div>
                                            </div>

                                            {/* Mini gráfico de barras */}
                                            <div className="flex items-end gap-1 h-20">
                                                {analysisData.evolution.weeklyTrend.slice(-8).map((week, i) => (
                                                    <div key={week.period} className="flex-1 flex flex-col items-center">
                                                        <div
                                                            className="w-full bg-purple-500/50 rounded-t transition-all"
                                                            style={{
                                                                height: `${Math.max(10, week.videos * 15)}px`,
                                                            }}
                                                            title={`${week.period}: ${week.videos} vídeos`}
                                                        />
                                                        <span className="text-[10px] text-gray-500 mt-1">
                                                            S{week.period.split('-W')[1]}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>

                                            {/* Indicadores de mudança */}
                                            <div className="grid grid-cols-3 gap-3 mt-4 pt-3 border-t border-gray-800">
                                                <div className="text-center">
                                                    <div className="flex items-center justify-center gap-1">
                                                        {analysisData.improvements.alterationRateChange < 0 ? (
                                                            <ArrowDown className="w-3 h-3 text-green-400" />
                                                        ) : analysisData.improvements.alterationRateChange > 0 ? (
                                                            <ArrowUp className="w-3 h-3 text-red-400" />
                                                        ) : (
                                                            <Minus className="w-3 h-3 text-gray-400" />
                                                        )}
                                                        <span className={`text-sm font-bold ${
                                                            analysisData.improvements.alterationRateChange < 0 ? 'text-green-400' :
                                                            analysisData.improvements.alterationRateChange > 0 ? 'text-red-400' : 'text-gray-400'
                                                        }`}>
                                                            {analysisData.improvements.alterationRateChange > 0 ? '+' : ''}
                                                            {analysisData.improvements.alterationRateChange}pp
                                                        </span>
                                                    </div>
                                                    <p className="text-gray-500 text-xs">Alteração</p>
                                                </div>
                                                <div className="text-center">
                                                    <div className="flex items-center justify-center gap-1">
                                                        {analysisData.improvements.productivityChange > 0 ? (
                                                            <ArrowUp className="w-3 h-3 text-green-400" />
                                                        ) : analysisData.improvements.productivityChange < 0 ? (
                                                            <ArrowDown className="w-3 h-3 text-red-400" />
                                                        ) : (
                                                            <Minus className="w-3 h-3 text-gray-400" />
                                                        )}
                                                        <span className={`text-sm font-bold ${
                                                            analysisData.improvements.productivityChange > 0 ? 'text-green-400' :
                                                            analysisData.improvements.productivityChange < 0 ? 'text-red-400' : 'text-gray-400'
                                                        }`}>
                                                            {analysisData.improvements.productivityChange > 0 ? '+' : ''}
                                                            {analysisData.improvements.productivityChange}
                                                        </span>
                                                    </div>
                                                    <p className="text-gray-500 text-xs">Produtividade</p>
                                                </div>
                                                <div className="text-center">
                                                    <div className="flex items-center justify-center gap-1">
                                                        {analysisData.improvements.volumeChange > 0 ? (
                                                            <ArrowUp className="w-3 h-3 text-green-400" />
                                                        ) : analysisData.improvements.volumeChange < 0 ? (
                                                            <ArrowDown className="w-3 h-3 text-red-400" />
                                                        ) : (
                                                            <Minus className="w-3 h-3 text-gray-400" />
                                                        )}
                                                        <span className={`text-sm font-bold ${
                                                            analysisData.improvements.volumeChange > 0 ? 'text-green-400' :
                                                            analysisData.improvements.volumeChange < 0 ? 'text-red-400' : 'text-gray-400'
                                                        }`}>
                                                            {analysisData.improvements.volumeChange > 0 ? '+' : ''}
                                                            {analysisData.improvements.volumeChange}%
                                                        </span>
                                                    </div>
                                                    <p className="text-gray-500 text-xs">Volume</p>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* Pontos Fortes e Áreas de Melhoria */}
                                    <div className="grid grid-cols-2 gap-4">
                                        {/* Pontos Fortes */}
                                        <div className="bg-green-950/30 border border-green-900/50 rounded-xl p-4">
                                            <h3 className="text-green-400 font-medium mb-3 flex items-center gap-2 text-sm">
                                                <Zap className="w-4 h-4" />
                                                Pontos Fortes
                                            </h3>
                                            {analysisData.strengths.length > 0 ? (
                                                <ul className="space-y-2">
                                                    {analysisData.strengths.map((strength, i) => (
                                                        <li key={i} className="text-green-200/80 text-sm flex items-start gap-2">
                                                            <CheckCircle className="w-3 h-3 text-green-400 mt-1 flex-shrink-0" />
                                                            {strength}
                                                        </li>
                                                    ))}
                                                </ul>
                                            ) : (
                                                <p className="text-gray-500 text-sm">Dados insuficientes</p>
                                            )}
                                        </div>

                                        {/* Áreas de Melhoria */}
                                        <div className="bg-amber-950/30 border border-amber-900/50 rounded-xl p-4">
                                            <h3 className="text-amber-400 font-medium mb-3 flex items-center gap-2 text-sm">
                                                <Target className="w-4 h-4" />
                                                Áreas de Melhoria
                                            </h3>
                                            {analysisData.areasToImprove.length > 0 ? (
                                                <ul className="space-y-2">
                                                    {analysisData.areasToImprove.map((area, i) => (
                                                        <li key={i} className="text-amber-200/80 text-sm flex items-start gap-2">
                                                            <AlertCircle className="w-3 h-3 text-amber-400 mt-1 flex-shrink-0" />
                                                            {area}
                                                        </li>
                                                    ))}
                                                </ul>
                                            ) : (
                                                <p className="text-gray-500 text-sm">Nenhuma área crítica identificada</p>
                                            )}
                                        </div>
                                    </div>

                                    {/* Recomendações */}
                                    {analysisData.recommendations.length > 0 && (
                                        <div className="bg-blue-950/30 border border-blue-900/50 rounded-xl p-4">
                                            <h3 className="text-blue-400 font-medium mb-3 flex items-center gap-2 text-sm">
                                                <Lightbulb className="w-4 h-4" />
                                                Recomendações
                                            </h3>
                                            <ul className="space-y-2">
                                                {analysisData.recommendations.map((rec, i) => (
                                                    <li key={i} className="text-blue-200/80 text-sm">
                                                        {rec}
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                </>
                            ) : null}

                            {/* Status de promoção */}
                            {selectedEditor.canBePromoted && (
                                <div className="p-4 bg-purple-950/50 border border-purple-500/30 rounded-xl">
                                    <p className="text-purple-400 flex items-center gap-2">
                                        <Award className="w-5 h-5" />
                                        <strong>{selectedEditor.member.name}</strong> atende todos os critérios para promoção a Pleno!
                                    </p>
                                </div>
                            )}

                            {selectedEditor.status === 'risk' && (
                                <div className="p-4 bg-red-950/50 border border-red-500/30 rounded-xl">
                                    <p className="text-red-400 flex items-center gap-2">
                                        <AlertTriangle className="w-5 h-5" />
                                        Taxa de alteração acima de 10% - necessário acompanhamento urgente
                                    </p>
                                </div>
                            )}

                            {selectedEditor.status === 'attention' && (
                                <div className="p-4 bg-amber-950/50 border border-amber-500/30 rounded-xl">
                                    <p className="text-amber-400 flex items-center gap-2">
                                        <AlertCircle className="w-5 h-5" />
                                        Taxa de alteração entre 5-10% - monitorar nas próximas semanas
                                    </p>
                                </div>
                            )}
                        </div>
                    ) : (
                        /* Visão geral quando nenhum editor selecionado */
                        <div className="space-y-4">
                            {/* Cards de resumo */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="bg-[#12121a] border border-purple-900/30 rounded-xl p-4">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-lg bg-purple-600/20 flex items-center justify-center">
                                            <Award className="w-5 h-5 text-purple-400" />
                                        </div>
                                        <div>
                                            <p className="text-gray-400 text-sm">Aptos para Pleno</p>
                                            <p className="text-2xl font-bold text-purple-400">{editorsReadyForPromotion.length}</p>
                                        </div>
                                    </div>
                                </div>

                                <div className="bg-[#12121a] border border-blue-900/30 rounded-xl p-4">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-lg bg-blue-600/20 flex items-center justify-center">
                                            <Shield className="w-5 h-5 text-blue-400" />
                                        </div>
                                        <div>
                                            <p className="text-gray-400 text-sm">Em Auditoria</p>
                                            <p className="text-2xl font-bold text-blue-400">{editorsInAudit.length}</p>
                                        </div>
                                    </div>
                                </div>

                                <div className="bg-[#12121a] border border-red-900/30 rounded-xl p-4">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-lg bg-red-600/20 flex items-center justify-center">
                                            <AlertTriangle className="w-5 h-5 text-red-400" />
                                        </div>
                                        <div>
                                            <p className="text-gray-400 text-sm">Em Risco/Atenção</p>
                                            <p className="text-2xl font-bold text-red-400">{editorsAtRisk.length}</p>
                                        </div>
                                    </div>
                                </div>

                                <div className="bg-[#12121a] border border-green-900/30 rounded-xl p-4">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-lg bg-green-600/20 flex items-center justify-center">
                                            <CheckCircle className="w-5 h-5 text-green-400" />
                                        </div>
                                        <div>
                                            <p className="text-gray-400 text-sm">No Caminho</p>
                                            <p className="text-2xl font-bold text-green-400">
                                                {editorsEvolution.filter(e => e.status === 'on_track').length}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Critérios */}
                            <div className="bg-purple-950/30 border border-purple-900/50 rounded-xl p-4">
                                <h3 className="text-purple-400 font-medium mb-3 text-sm">Critérios para Promoção Junior → Pleno</h3>
                                <div className="grid grid-cols-3 gap-4 text-sm">
                                    <div className="flex items-start gap-2">
                                        <Calendar className="w-4 h-4 text-purple-400 mt-0.5" />
                                        <div>
                                            <p className="text-white font-medium">12 meses</p>
                                            <p className="text-gray-500 text-xs">Tempo mínimo</p>
                                        </div>
                                    </div>
                                    <div className="flex items-start gap-2">
                                        <CheckCircle className="w-4 h-4 text-purple-400 mt-0.5" />
                                        <div>
                                            <p className="text-white font-medium">≤ 5% alteração</p>
                                            <p className="text-gray-500 text-xs">Últimos 2 meses</p>
                                        </div>
                                    </div>
                                    <div className="flex items-start gap-2">
                                        <Shield className="w-4 h-4 text-purple-400 mt-0.5" />
                                        <div>
                                            <p className="text-white font-medium">Auditoria</p>
                                            <p className="text-gray-500 text-xs">Meses 11 e 12</p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Instrução */}
                            <div className="bg-[#12121a] border border-purple-900/30 rounded-xl p-8 text-center">
                                <User className="w-12 h-12 text-purple-400 mx-auto mb-3" />
                                <h3 className="text-white font-medium mb-1">Selecione um editor</h3>
                                <p className="text-gray-500 text-sm">
                                    Clique em um editor na lista para ver o progresso detalhado e análise de evolução
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

'use client';

import { useState, useEffect } from 'react';
import { DashboardKPIs, NormalizedTask } from '@/types';
import { ALL_TEAMS, TeamMember } from '@/lib/constants';
import {
    Award,
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
    Minus,
    Clock,
    Video,
    Activity,
    Users,
    Star,
    ChevronRight
} from 'lucide-react';

interface EvolucaoViewProps {
    kpis: DashboardKPIs;
    allVideos: NormalizedTask[];
    lastUpdated: number;
}

// Datas de admissão dos editores
const ADMISSION_DATES: Record<number, number> = {
    248675265: new Date('2026-01-15').getTime(), // Nathan Soares
    84070913: new Date('2026-01-26').getTime(),  // Victor Mazzine
    112053206: new Date('2026-01-28').getTime(), // Moises Ramalho
    152605916: new Date('2026-01-28').getTime(), // Victor Mendes
    3258937: new Date('2025-08-19').getTime(),   // Renato Fernandes
    3272897: new Date('2025-07-29').getTime(),   // Douglas Prado
    96683026: new Date('2026-01-15').getTime(),  // Leonardo da Silva
    84241154: new Date('2026-01-27').getTime(),  // Rafael Andrade
    82093531: new Date('2025-08-01').getTime(),  // Loren Gayoso
    82074101: new Date('2025-11-19').getTime(),  // Bruno Cesar
};

const CLICKUP_TO_DB_ID: Record<number, number> = {
    248675265: 1, 84070913: 2, 112053206: 3, 152605916: 4, 3258937: 5,
    3272897: 6, 96683026: 7, 84241154: 8, 82093531: 9, 82074101: 10,
};

interface EditorData {
    member: TeamMember;
    teamName: string;
    teamColor: string;
    admissionDate: number;
    monthsInCompany: number;
    initials: string;
    dbId: number | null;
    // Métricas atuais
    totalVideos: number;
    alterationRate: number;
    avgEditingHours: number;
    // Status promoção
    daysUntilPromotion: number;
    isInAuditMode: boolean;
    canBePromoted: boolean;
    status: 'on_track' | 'attention' | 'risk' | 'promoted' | 'audit_mode';
}

interface EditorAnalysis {
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
    currentPeriod: {
        week: { totalVideos: number; alterationRate: number; productivityScore: number; qualityScore: number } | null;
        month: { totalVideos: number; alterationRate: number; totalEditingHours: number; avgEditingHours: number } | null;
    };
    evolution: {
        weeklyTrend: Array<{ period: string; videos: number; alterationRate: number; productivityScore: number }>;
        monthlyTrend: Array<{ period: string; videos: number; alterationRate: number; editingHours: number }>;
    };
    recentTasks: Array<{ id: string; title: string; status: string; videoType: string | null; dateCreated: string; dateClosed: string | null }>;
}

interface EvolutionAlert {
    id: number;
    editorId: number;
    editorName: string;
    type: 'improvement' | 'regression' | 'milestone' | 'streak';
    category: string;
    message: string;
    data: { previous: number; current: number; change: number };
    severity: 'positive' | 'neutral' | 'warning';
    isRead: boolean;
    createdAt: string;
}

function calculateMonthsDiff(start: number, end: number): number {
    const startDate = new Date(start);
    const endDate = new Date(end);
    return (endDate.getFullYear() - startDate.getFullYear()) * 12 + (endDate.getMonth() - startDate.getMonth());
}

function getInitials(name: string): string {
    return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
}

export function EvolucaoView({ kpis, allVideos, lastUpdated }: EvolucaoViewProps) {
    const [selectedEditorId, setSelectedEditorId] = useState<number | null>(null);
    const [analysisData, setAnalysisData] = useState<EditorAnalysis | null>(null);
    const [loadingAnalysis, setLoadingAnalysis] = useState(false);
    const [activeTab, setActiveTab] = useState<'overview' | 'history' | 'promotion'>('overview');
    const [evolutionAlerts, setEvolutionAlerts] = useState<EvolutionAlert[]>([]);
    const [loadingAlerts, setLoadingAlerts] = useState(false);
    const now = Date.now();

    // Build editor data
    const editorsData: EditorData[] = [];
    const twoMonthsAgo = new Date();
    twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);
    const twoMonthsAgoTimestamp = twoMonthsAgo.getTime();

    ALL_TEAMS.forEach(team => {
        team.members.forEach(member => {
            if (member.role === 'leader') return;

            const admissionDate = ADMISSION_DATES[member.id];
            if (!admissionDate) return;

            const monthsInCompany = calculateMonthsDiff(admissionDate, now);
            const daysUntilPromotion = Math.max(0, 365 - Math.floor((now - admissionDate) / (1000 * 60 * 60 * 24)));

            const editorStats = kpis.editors.find(e => e.editorName.toLowerCase() === member.name.toLowerCase());
            const editorVideos = allVideos.filter(v => v.editorName.toLowerCase() === member.name.toLowerCase());
            const editorVideosLast2Months = editorVideos.filter(v => v.dateClosed && v.dateClosed >= twoMonthsAgoTimestamp);

            const videosWithAlteration = editorVideosLast2Months.filter(v => v.phaseTime?.alterationTimeMs && v.phaseTime.alterationTimeMs > 0).length;
            const alterationRate = editorVideosLast2Months.length > 0 ? (videosWithAlteration / editorVideosLast2Months.length) * 100 : 0;

            const isInAuditMode = monthsInCompany >= 10 && monthsInCompany < 12;
            let status: EditorData['status'] = 'on_track';

            if (monthsInCompany >= 12 && alterationRate <= 5) status = 'promoted';
            else if (isInAuditMode) status = 'audit_mode';
            else if (alterationRate > 10) status = 'risk';
            else if (alterationRate > 5) status = 'attention';

            editorsData.push({
                member,
                teamName: team.name,
                teamColor: team.color,
                admissionDate,
                monthsInCompany,
                initials: getInitials(member.name),
                dbId: CLICKUP_TO_DB_ID[member.id] || null,
                totalVideos: editorVideos.filter(v => v.status === 'COMPLETED').length,
                alterationRate: parseFloat(alterationRate.toFixed(1)),
                avgEditingHours: editorStats?.phaseMetrics?.avgEditingTime || 0,
                daysUntilPromotion,
                isInAuditMode,
                canBePromoted: monthsInCompany >= 12 && alterationRate <= 5,
                status,
            });
        });
    });

    editorsData.sort((a, b) => b.totalVideos - a.totalVideos);

    const selectedEditor = selectedEditorId ? editorsData.find(e => e.member.id === selectedEditorId) : null;

    // Fetch analysis when editor selected
    useEffect(() => {
        if (selectedEditor?.dbId) {
            setLoadingAnalysis(true);
            setLoadingAlerts(true);

            // Fetch analysis data
            fetch(`/api/reports/editor/${selectedEditor.dbId}`)
                .then(res => res.json())
                .then(data => {
                    if (data && !data.error) {
                        setAnalysisData({
                            overallScore: data.overallScore || 50,
                            strengths: data.strengths || [],
                            areasToImprove: data.areasToImprove || [],
                            recommendations: data.recommendations || [],
                            improvements: data.improvements || { alterationRateChange: 0, productivityChange: 0, volumeChange: 0, trend: 'stable' },
                            currentPeriod: data.currentPeriod || { week: null, month: null },
                            evolution: {
                                weeklyTrend: data.evolution?.weeklyTrend || [],
                                monthlyTrend: data.evolution?.monthlyTrend || []
                            },
                            recentTasks: data.recentTasks || []
                        });
                    } else {
                        setAnalysisData(null);
                    }
                })
                .catch(() => setAnalysisData(null))
                .finally(() => setLoadingAnalysis(false));

            // Fetch evolution alerts for this editor
            fetch(`/api/evolution/alerts?editor_id=${selectedEditor.dbId}&limit=10`)
                .then(res => res.json())
                .then(data => {
                    if (data.success && data.alerts) {
                        setEvolutionAlerts(data.alerts);
                    } else {
                        setEvolutionAlerts([]);
                    }
                })
                .catch(() => setEvolutionAlerts([]))
                .finally(() => setLoadingAlerts(false));
        } else {
            setAnalysisData(null);
            setEvolutionAlerts([]);
        }
    }, [selectedEditor?.dbId]);

    const statusConfig = {
        on_track: { color: 'text-green-400', bg: 'bg-green-600/20', icon: CheckCircle, label: 'No Caminho' },
        attention: { color: 'text-amber-400', bg: 'bg-amber-600/20', icon: AlertCircle, label: 'Atenção' },
        risk: { color: 'text-red-400', bg: 'bg-red-600/20', icon: AlertTriangle, label: 'Risco' },
        promoted: { color: 'text-purple-400', bg: 'bg-purple-600/20', icon: Award, label: 'Apto p/ Pleno' },
        audit_mode: { color: 'text-blue-400', bg: 'bg-blue-600/20', icon: Shield, label: 'Auditoria' },
    };

    const getScoreColor = (score: number) => {
        if (score >= 80) return 'text-green-400';
        if (score >= 60) return 'text-blue-400';
        if (score >= 40) return 'text-amber-400';
        return 'text-red-400';
    };

    const getScoreBg = (score: number) => {
        if (score >= 80) return 'from-green-500/20 to-green-600/10';
        if (score >= 60) return 'from-blue-500/20 to-blue-600/10';
        if (score >= 40) return 'from-amber-500/20 to-amber-600/10';
        return 'from-red-500/20 to-red-600/10';
    };

    // Team averages for comparison
    const teamAvg = {
        videos: editorsData.length > 0 ? Math.round(editorsData.reduce((s, e) => s + e.totalVideos, 0) / editorsData.length) : 0,
        alteration: editorsData.length > 0 ? Math.round(editorsData.reduce((s, e) => s + e.alterationRate, 0) / editorsData.length) : 0,
    };

    return (
        <div className="p-6">
            {/* Header */}
            <div className="flex justify-between items-start mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                        <Activity className="w-6 h-6 text-purple-400" />
                        Evolução Individual
                    </h1>
                    <p className="text-gray-500 text-sm">
                        Análise completa de performance e desenvolvimento de cada editor
                    </p>
                </div>
                <div className="text-right text-sm text-gray-500">
                    {new Date(lastUpdated).toLocaleString('pt-BR')}
                </div>
            </div>

            <div className="flex gap-6">
                {/* Lista de editores */}
                <div className="w-[380px] flex-shrink-0">
                    <p className="text-gray-400 text-sm mb-3">Selecione um Editor</p>
                    <div className="space-y-1 max-h-[calc(100vh-200px)] overflow-y-auto">
                        {editorsData.map(editor => {
                            const config = statusConfig[editor.status];
                            const vsAvgVideos = teamAvg.videos > 0 ? Math.round(((editor.totalVideos - teamAvg.videos) / teamAvg.videos) * 100) : 0;

                            return (
                                <div
                                    key={editor.member.id}
                                    onClick={() => { setSelectedEditorId(editor.member.id); setActiveTab('overview'); }}
                                    className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all
                                        ${selectedEditorId === editor.member.id
                                            ? 'bg-purple-600/30 border border-purple-500/50'
                                            : 'bg-[#12121a] border border-transparent hover:border-purple-500/30'
                                        }`}
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
                                            {editor.status === 'risk' && <AlertTriangle className="w-3 h-3 text-red-400" />}
                                            {editor.canBePromoted && <Award className="w-3 h-3 text-purple-400" />}
                                        </div>
                                        <div className="flex items-center gap-2 text-xs">
                                            <span className="text-gray-500">{editor.totalVideos} vídeos</span>
                                            <span className={vsAvgVideos >= 0 ? 'text-green-400' : 'text-red-400'}>
                                                {vsAvgVideos >= 0 ? '+' : ''}{vsAvgVideos}% vs média
                                            </span>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <span className={`text-sm font-bold ${
                                            editor.alterationRate <= 10 ? 'text-green-400' :
                                            editor.alterationRate <= 20 ? 'text-amber-400' : 'text-red-400'
                                        }`}>
                                            {editor.alterationRate}%
                                        </span>
                                        <p className="text-gray-600 text-[10px]">alteração</p>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Conteúdo principal */}
                <div className="flex-1 min-w-0">
                    {selectedEditor ? (
                        <div className="space-y-4">
                            {/* Header do editor com Score */}
                            <div className="bg-[#12121a] border border-purple-900/30 rounded-xl p-5">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-4">
                                        <div
                                            className="w-16 h-16 rounded-full flex items-center justify-center text-white font-bold text-2xl"
                                            style={{ backgroundColor: selectedEditor.member.color }}
                                        >
                                            {selectedEditor.initials}
                                        </div>
                                        <div>
                                            <h2 className="text-xl font-bold text-white">{selectedEditor.member.name}</h2>
                                            <p className="text-gray-500">{selectedEditor.teamName} • {selectedEditor.monthsInCompany} meses na empresa</p>
                                            <div className="flex items-center gap-2 mt-1">
                                                <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${statusConfig[selectedEditor.status].bg}`}>
                                                    {(() => { const Icon = statusConfig[selectedEditor.status].icon; return <Icon className={`w-3 h-3 ${statusConfig[selectedEditor.status].color}`} />; })()}
                                                    <span className={statusConfig[selectedEditor.status].color}>{statusConfig[selectedEditor.status].label}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    {/* Score Circle */}
                                    {analysisData && (
                                        <div className={`w-24 h-24 rounded-full bg-gradient-to-br ${getScoreBg(analysisData.overallScore)} flex flex-col items-center justify-center border-2 ${
                                            analysisData.overallScore >= 80 ? 'border-green-500/50' :
                                            analysisData.overallScore >= 60 ? 'border-blue-500/50' :
                                            analysisData.overallScore >= 40 ? 'border-amber-500/50' : 'border-red-500/50'
                                        }`}>
                                            <span className={`text-3xl font-bold ${getScoreColor(analysisData.overallScore)}`}>
                                                {analysisData.overallScore}
                                            </span>
                                            <span className="text-gray-400 text-xs">Score</span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Tabs */}
                            <div className="flex gap-2">
                                {[
                                    { id: 'overview', label: 'Visão Geral', icon: BarChart3 },
                                    { id: 'history', label: 'Histórico', icon: Clock },
                                    { id: 'promotion', label: 'Promoção', icon: Award },
                                ].map(tab => (
                                    <button
                                        key={tab.id}
                                        onClick={() => setActiveTab(tab.id as typeof activeTab)}
                                        className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all text-sm font-medium
                                            ${activeTab === tab.id
                                                ? 'bg-purple-600/30 text-purple-400 border border-purple-500/50'
                                                : 'bg-[#12121a] text-gray-400 border border-transparent hover:border-purple-500/30'
                                            }`}
                                    >
                                        <tab.icon className="w-4 h-4" />
                                        {tab.label}
                                    </button>
                                ))}
                            </div>

                            {loadingAnalysis ? (
                                <div className="bg-[#12121a] border border-purple-900/30 rounded-xl p-12 text-center">
                                    <div className="animate-spin w-10 h-10 border-2 border-purple-400 border-t-transparent rounded-full mx-auto mb-4" />
                                    <p className="text-gray-400">Carregando análise completa...</p>
                                </div>
                            ) : (
                                <>
                                    {/* TAB: Visão Geral */}
                                    {activeTab === 'overview' && (
                                        <div className="space-y-4">
                                            {/* KPIs principais */}
                                            <div className="grid grid-cols-4 gap-3">
                                                <div className="bg-[#12121a] border border-purple-900/30 rounded-xl p-4">
                                                    <div className="flex items-center gap-2 mb-2">
                                                        <Video className="w-4 h-4 text-purple-400" />
                                                        <span className="text-gray-400 text-xs">Total Vídeos</span>
                                                    </div>
                                                    <p className="text-2xl font-bold text-white">{selectedEditor.totalVideos}</p>
                                                    <p className={`text-xs ${selectedEditor.totalVideos >= teamAvg.videos ? 'text-green-400' : 'text-red-400'}`}>
                                                        {selectedEditor.totalVideos >= teamAvg.videos ? '↑' : '↓'} vs média ({teamAvg.videos})
                                                    </p>
                                                </div>
                                                <div className="bg-[#12121a] border border-purple-900/30 rounded-xl p-4">
                                                    <div className="flex items-center gap-2 mb-2">
                                                        <Target className="w-4 h-4 text-amber-400" />
                                                        <span className="text-gray-400 text-xs">Taxa Alteração</span>
                                                    </div>
                                                    <p className={`text-2xl font-bold ${
                                                        selectedEditor.alterationRate <= 10 ? 'text-green-400' :
                                                        selectedEditor.alterationRate <= 20 ? 'text-amber-400' : 'text-red-400'
                                                    }`}>{selectedEditor.alterationRate}%</p>
                                                    <p className={`text-xs ${selectedEditor.alterationRate <= teamAvg.alteration ? 'text-green-400' : 'text-red-400'}`}>
                                                        {selectedEditor.alterationRate <= teamAvg.alteration ? '↓ melhor' : '↑ pior'} que média ({teamAvg.alteration}%)
                                                    </p>
                                                </div>
                                                <div className="bg-[#12121a] border border-purple-900/30 rounded-xl p-4">
                                                    <div className="flex items-center gap-2 mb-2">
                                                        <Clock className="w-4 h-4 text-blue-400" />
                                                        <span className="text-gray-400 text-xs">Tempo Médio</span>
                                                    </div>
                                                    <p className="text-2xl font-bold text-white">{selectedEditor.avgEditingHours.toFixed(1)}h</p>
                                                    <p className="text-xs text-gray-500">por vídeo</p>
                                                </div>
                                                <div className="bg-[#12121a] border border-purple-900/30 rounded-xl p-4">
                                                    <div className="flex items-center gap-2 mb-2">
                                                        <Calendar className="w-4 h-4 text-green-400" />
                                                        <span className="text-gray-400 text-xs">Na Empresa</span>
                                                    </div>
                                                    <p className="text-2xl font-bold text-white">{selectedEditor.monthsInCompany}</p>
                                                    <p className="text-xs text-gray-500">meses</p>
                                                </div>
                                            </div>

                                            {/* Tendência + Indicadores */}
                                            {analysisData?.evolution.weeklyTrend.length > 0 && (
                                                <div className="bg-[#12121a] border border-purple-900/30 rounded-xl p-4">
                                                    <div className="flex items-center justify-between mb-4">
                                                        <h3 className="text-white font-medium flex items-center gap-2">
                                                            <TrendingUp className="w-4 h-4 text-purple-400" />
                                                            Evolução Semanal
                                                        </h3>
                                                        <span className={`text-sm flex items-center gap-1 ${
                                                            analysisData.improvements.trend === 'improving' ? 'text-green-400' :
                                                            analysisData.improvements.trend === 'declining' ? 'text-red-400' : 'text-gray-400'
                                                        }`}>
                                                            {analysisData.improvements.trend === 'improving' ? <TrendingUp className="w-4 h-4" /> :
                                                             analysisData.improvements.trend === 'declining' ? <TrendingDown className="w-4 h-4" /> :
                                                             <Minus className="w-4 h-4" />}
                                                            {analysisData.improvements.trend === 'improving' ? 'Melhorando' :
                                                             analysisData.improvements.trend === 'declining' ? 'Em queda' : 'Estável'}
                                                        </span>
                                                    </div>

                                                    {/* Gráfico de barras */}
                                                    <div className="flex items-end gap-2 h-28 mb-4">
                                                        {analysisData.evolution.weeklyTrend.slice(-8).map((week) => (
                                                            <div key={week.period} className="flex-1 flex flex-col items-center">
                                                                <div
                                                                    className="w-full bg-gradient-to-t from-purple-600/50 to-purple-400/30 rounded-t transition-all hover:from-purple-500/60 hover:to-purple-300/40"
                                                                    style={{ height: `${Math.max(8, week.videos * 18)}px` }}
                                                                    title={`${week.videos} vídeos • ${week.alterationRate}% alteração`}
                                                                />
                                                                <span className="text-[10px] text-gray-500 mt-1">S{week.period.split('-W')[1]}</span>
                                                            </div>
                                                        ))}
                                                    </div>

                                                    {/* Indicadores de mudança */}
                                                    <div className="grid grid-cols-3 gap-4 pt-3 border-t border-gray-800">
                                                        <div className="text-center">
                                                            <div className="flex items-center justify-center gap-1">
                                                                {analysisData.improvements.alterationRateChange < 0 ? <ArrowDown className="w-4 h-4 text-green-400" /> :
                                                                 analysisData.improvements.alterationRateChange > 0 ? <ArrowUp className="w-4 h-4 text-red-400" /> :
                                                                 <Minus className="w-4 h-4 text-gray-400" />}
                                                                <span className={`text-lg font-bold ${
                                                                    analysisData.improvements.alterationRateChange < 0 ? 'text-green-400' :
                                                                    analysisData.improvements.alterationRateChange > 0 ? 'text-red-400' : 'text-gray-400'
                                                                }`}>
                                                                    {analysisData.improvements.alterationRateChange > 0 ? '+' : ''}{analysisData.improvements.alterationRateChange}pp
                                                                </span>
                                                            </div>
                                                            <p className="text-gray-500 text-xs mt-1">Taxa de Alteração</p>
                                                        </div>
                                                        <div className="text-center">
                                                            <div className="flex items-center justify-center gap-1">
                                                                {analysisData.improvements.productivityChange > 0 ? <ArrowUp className="w-4 h-4 text-green-400" /> :
                                                                 analysisData.improvements.productivityChange < 0 ? <ArrowDown className="w-4 h-4 text-red-400" /> :
                                                                 <Minus className="w-4 h-4 text-gray-400" />}
                                                                <span className={`text-lg font-bold ${
                                                                    analysisData.improvements.productivityChange > 0 ? 'text-green-400' :
                                                                    analysisData.improvements.productivityChange < 0 ? 'text-red-400' : 'text-gray-400'
                                                                }`}>
                                                                    {analysisData.improvements.productivityChange > 0 ? '+' : ''}{analysisData.improvements.productivityChange}
                                                                </span>
                                                            </div>
                                                            <p className="text-gray-500 text-xs mt-1">Produtividade</p>
                                                        </div>
                                                        <div className="text-center">
                                                            <div className="flex items-center justify-center gap-1">
                                                                {analysisData.improvements.volumeChange > 0 ? <ArrowUp className="w-4 h-4 text-green-400" /> :
                                                                 analysisData.improvements.volumeChange < 0 ? <ArrowDown className="w-4 h-4 text-red-400" /> :
                                                                 <Minus className="w-4 h-4 text-gray-400" />}
                                                                <span className={`text-lg font-bold ${
                                                                    analysisData.improvements.volumeChange > 0 ? 'text-green-400' :
                                                                    analysisData.improvements.volumeChange < 0 ? 'text-red-400' : 'text-gray-400'
                                                                }`}>
                                                                    {analysisData.improvements.volumeChange > 0 ? '+' : ''}{analysisData.improvements.volumeChange}%
                                                                </span>
                                                            </div>
                                                            <p className="text-gray-500 text-xs mt-1">Volume</p>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}

                                            {/* Pontos Fortes + Áreas de Melhoria */}
                                            {analysisData && (
                                                <div className="grid grid-cols-2 gap-4">
                                                    <div className="bg-green-950/30 border border-green-900/50 rounded-xl p-4">
                                                        <h3 className="text-green-400 font-medium mb-3 flex items-center gap-2 text-sm">
                                                            <Zap className="w-4 h-4" /> Pontos Fortes
                                                        </h3>
                                                        {analysisData.strengths.length > 0 ? (
                                                            <ul className="space-y-2">
                                                                {analysisData.strengths.map((s, i) => (
                                                                    <li key={i} className="text-green-200/80 text-sm flex items-start gap-2">
                                                                        <CheckCircle className="w-3 h-3 text-green-400 mt-1 flex-shrink-0" /> {s}
                                                                    </li>
                                                                ))}
                                                            </ul>
                                                        ) : <p className="text-gray-500 text-sm">Aguardando mais dados</p>}
                                                    </div>
                                                    <div className="bg-amber-950/30 border border-amber-900/50 rounded-xl p-4">
                                                        <h3 className="text-amber-400 font-medium mb-3 flex items-center gap-2 text-sm">
                                                            <Target className="w-4 h-4" /> Áreas de Melhoria
                                                        </h3>
                                                        {analysisData.areasToImprove.length > 0 ? (
                                                            <ul className="space-y-2">
                                                                {analysisData.areasToImprove.map((a, i) => (
                                                                    <li key={i} className="text-amber-200/80 text-sm flex items-start gap-2">
                                                                        <AlertCircle className="w-3 h-3 text-amber-400 mt-1 flex-shrink-0" /> {a}
                                                                    </li>
                                                                ))}
                                                            </ul>
                                                        ) : <p className="text-gray-500 text-sm">Nenhuma área crítica</p>}
                                                    </div>
                                                </div>
                                            )}

                                            {/* Recomendações */}
                                            {analysisData?.recommendations.length > 0 && (
                                                <div className="bg-blue-950/30 border border-blue-900/50 rounded-xl p-4">
                                                    <h3 className="text-blue-400 font-medium mb-3 flex items-center gap-2 text-sm">
                                                        <Lightbulb className="w-4 h-4" /> Recomendações
                                                    </h3>
                                                    <ul className="space-y-2">
                                                        {analysisData.recommendations.map((r, i) => (
                                                            <li key={i} className="text-blue-200/80 text-sm">{r}</li>
                                                        ))}
                                                    </ul>
                                                </div>
                                            )}

                                            {/* Alertas de Evolução */}
                                            {evolutionAlerts.length > 0 && (
                                                <div className="bg-[#12121a] border border-purple-900/30 rounded-xl p-4">
                                                    <h3 className="text-white font-medium mb-3 flex items-center gap-2 text-sm">
                                                        <Activity className="w-4 h-4 text-purple-400" />
                                                        Alertas de Evolução
                                                        {evolutionAlerts.filter(a => !a.isRead).length > 0 && (
                                                            <span className="px-2 py-0.5 text-xs bg-purple-600 text-white rounded-full">
                                                                {evolutionAlerts.filter(a => !a.isRead).length} novos
                                                            </span>
                                                        )}
                                                    </h3>
                                                    <div className="space-y-2">
                                                        {evolutionAlerts.slice(0, 5).map((alert) => (
                                                            <div
                                                                key={alert.id}
                                                                className={`flex items-start gap-3 p-3 rounded-lg ${
                                                                    alert.severity === 'positive' ? 'bg-green-950/30 border border-green-900/50' :
                                                                    alert.severity === 'warning' ? 'bg-red-950/30 border border-red-900/50' :
                                                                    'bg-gray-900/30 border border-gray-800'
                                                                } ${!alert.isRead ? 'ring-1 ring-purple-500/50' : ''}`}
                                                            >
                                                                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                                                                    alert.type === 'improvement' ? 'bg-green-600/30' :
                                                                    alert.type === 'milestone' ? 'bg-purple-600/30' :
                                                                    alert.type === 'streak' ? 'bg-blue-600/30' :
                                                                    'bg-red-600/30'
                                                                }`}>
                                                                    {alert.type === 'improvement' && <TrendingUp className="w-4 h-4 text-green-400" />}
                                                                    {alert.type === 'milestone' && <Award className="w-4 h-4 text-purple-400" />}
                                                                    {alert.type === 'streak' && <Zap className="w-4 h-4 text-blue-400" />}
                                                                    {alert.type === 'regression' && <TrendingDown className="w-4 h-4 text-red-400" />}
                                                                </div>
                                                                <div className="flex-1 min-w-0">
                                                                    <p className={`text-sm ${
                                                                        alert.severity === 'positive' ? 'text-green-200' :
                                                                        alert.severity === 'warning' ? 'text-red-200' : 'text-gray-200'
                                                                    }`}>{alert.message}</p>
                                                                    <p className="text-gray-500 text-xs mt-1">
                                                                        {new Date(alert.createdAt).toLocaleDateString('pt-BR')}
                                                                    </p>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* TAB: Histórico */}
                                    {activeTab === 'history' && (
                                        <div className="space-y-4">
                                            {/* Histórico Mensal */}
                                            {analysisData?.evolution.monthlyTrend.length > 0 && (
                                                <div className="bg-[#12121a] border border-purple-900/30 rounded-xl p-4">
                                                    <h3 className="text-white font-medium mb-4 flex items-center gap-2">
                                                        <Calendar className="w-4 h-4 text-purple-400" />
                                                        Histórico Mensal
                                                    </h3>
                                                    <div className="space-y-2">
                                                        {analysisData.evolution.monthlyTrend.map((month) => {
                                                            const [year, m] = month.period.split('-');
                                                            const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
                                                            return (
                                                                <div key={month.period} className="flex items-center gap-4 p-3 bg-[#0a0a0f] rounded-lg">
                                                                    <span className="text-gray-400 text-sm w-20">{monthNames[parseInt(m) - 1]} {year}</span>
                                                                    <div className="flex-1">
                                                                        <div className="flex items-center gap-4">
                                                                            <div className="flex items-center gap-1">
                                                                                <Video className="w-3 h-3 text-purple-400" />
                                                                                <span className="text-white font-medium">{month.videos}</span>
                                                                                <span className="text-gray-500 text-xs">vídeos</span>
                                                                            </div>
                                                                            <div className="flex items-center gap-1">
                                                                                <Target className="w-3 h-3 text-amber-400" />
                                                                                <span className={`font-medium ${
                                                                                    month.alterationRate <= 10 ? 'text-green-400' :
                                                                                    month.alterationRate <= 20 ? 'text-amber-400' : 'text-red-400'
                                                                                }`}>{month.alterationRate}%</span>
                                                                            </div>
                                                                            <div className="flex items-center gap-1">
                                                                                <Clock className="w-3 h-3 text-blue-400" />
                                                                                <span className="text-white">{month.editingHours.toFixed(1)}h</span>
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            )}

                                            {/* Últimas Tasks */}
                                            {analysisData?.recentTasks.length > 0 && (
                                                <div className="bg-[#12121a] border border-purple-900/30 rounded-xl p-4">
                                                    <h3 className="text-white font-medium mb-4 flex items-center gap-2">
                                                        <Video className="w-4 h-4 text-purple-400" />
                                                        Últimas Entregas
                                                    </h3>
                                                    <div className="space-y-2">
                                                        {analysisData.recentTasks.slice(0, 8).map((task) => (
                                                            <div key={task.id} className="flex items-center gap-3 p-2 bg-[#0a0a0f] rounded-lg">
                                                                <div className={`w-2 h-2 rounded-full ${task.status === 'COMPLETED' ? 'bg-green-400' : 'bg-amber-400'}`} />
                                                                <span className="text-white text-sm flex-1 truncate">{task.title}</span>
                                                                {task.videoType && (
                                                                    <span className="text-purple-400 text-xs px-2 py-0.5 bg-purple-500/20 rounded">{task.videoType}</span>
                                                                )}
                                                                <span className="text-gray-500 text-xs">{task.dateCreated}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}

                                            {!analysisData?.evolution.monthlyTrend.length && !analysisData?.recentTasks.length && (
                                                <div className="bg-[#12121a] border border-purple-900/30 rounded-xl p-8 text-center">
                                                    <Clock className="w-12 h-12 text-gray-600 mx-auto mb-3" />
                                                    <p className="text-gray-400">Histórico será preenchido após sincronização do banco</p>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* TAB: Promoção */}
                                    {activeTab === 'promotion' && (
                                        <div className="space-y-4">
                                            {/* Barra de progresso */}
                                            <div className="bg-[#12121a] border border-purple-900/30 rounded-xl p-5">
                                                <div className="flex justify-between text-sm mb-2">
                                                    <span className="text-gray-400">Progresso para Promoção</span>
                                                    <span className="text-white font-medium">{selectedEditor.monthsInCompany}/12 meses</span>
                                                </div>
                                                <div className="h-6 bg-gray-800 rounded-full overflow-hidden relative">
                                                    <div
                                                        className="h-full rounded-full transition-all duration-500 absolute"
                                                        style={{
                                                            width: `${Math.min(100, (selectedEditor.monthsInCompany / 12) * 100)}%`,
                                                            backgroundColor: selectedEditor.isInAuditMode ? '#3b82f6' :
                                                                selectedEditor.canBePromoted ? '#a855f7' : selectedEditor.member.color
                                                        }}
                                                    />
                                                    {/* Marcadores */}
                                                    <div className="absolute inset-0 flex items-center justify-around px-2">
                                                        {[3, 6, 9, 10, 12].map(m => (
                                                            <div key={m} className={`w-1 h-3 rounded ${selectedEditor.monthsInCompany >= m ? 'bg-white/50' : 'bg-gray-600'}`} />
                                                        ))}
                                                    </div>
                                                </div>
                                                <div className="flex justify-between text-xs mt-2 text-gray-500">
                                                    <span>Início</span>
                                                    <span>6 meses</span>
                                                    <span className="text-blue-400">Auditoria</span>
                                                    <span className="text-purple-400">Promoção</span>
                                                </div>
                                            </div>

                                            {/* Critérios */}
                                            <div className="grid grid-cols-3 gap-4">
                                                <div className={`p-4 rounded-xl border ${selectedEditor.monthsInCompany >= 12 ? 'bg-green-950/30 border-green-500/50' : 'bg-[#12121a] border-purple-900/30'}`}>
                                                    <div className="flex items-center gap-2 mb-2">
                                                        {selectedEditor.monthsInCompany >= 12 ? <CheckCircle className="w-5 h-5 text-green-400" /> : <Calendar className="w-5 h-5 text-gray-400" />}
                                                        <span className="text-white font-medium">12 Meses</span>
                                                    </div>
                                                    <p className="text-gray-400 text-sm">{selectedEditor.monthsInCompany}/12 meses completos</p>
                                                    {selectedEditor.daysUntilPromotion > 0 && (
                                                        <p className="text-purple-400 text-xs mt-1">{selectedEditor.daysUntilPromotion} dias restantes</p>
                                                    )}
                                                </div>
                                                <div className={`p-4 rounded-xl border ${selectedEditor.alterationRate <= 5 ? 'bg-green-950/30 border-green-500/50' : 'bg-[#12121a] border-purple-900/30'}`}>
                                                    <div className="flex items-center gap-2 mb-2">
                                                        {selectedEditor.alterationRate <= 5 ? <CheckCircle className="w-5 h-5 text-green-400" /> : <Target className="w-5 h-5 text-gray-400" />}
                                                        <span className="text-white font-medium">≤ 5% Alteração</span>
                                                    </div>
                                                    <p className={`text-sm ${selectedEditor.alterationRate <= 5 ? 'text-green-400' : 'text-amber-400'}`}>
                                                        {selectedEditor.alterationRate}% atual
                                                    </p>
                                                </div>
                                                <div className={`p-4 rounded-xl border ${selectedEditor.isInAuditMode || selectedEditor.canBePromoted ? 'bg-blue-950/30 border-blue-500/50' : 'bg-[#12121a] border-purple-900/30'}`}>
                                                    <div className="flex items-center gap-2 mb-2">
                                                        {selectedEditor.isInAuditMode ? <Shield className="w-5 h-5 text-blue-400" /> :
                                                         selectedEditor.canBePromoted ? <CheckCircle className="w-5 h-5 text-green-400" /> :
                                                         <Shield className="w-5 h-5 text-gray-400" />}
                                                        <span className="text-white font-medium">Auditoria</span>
                                                    </div>
                                                    <p className={`text-sm ${selectedEditor.isInAuditMode ? 'text-blue-400' : selectedEditor.canBePromoted ? 'text-green-400' : 'text-gray-400'}`}>
                                                        {selectedEditor.isInAuditMode ? 'Em andamento' : selectedEditor.canBePromoted ? 'Aprovado' : 'Aguardando'}
                                                    </p>
                                                </div>
                                            </div>

                                            {/* Status final */}
                                            {selectedEditor.canBePromoted && (
                                                <div className="p-5 bg-purple-950/50 border border-purple-500/30 rounded-xl text-center">
                                                    <Award className="w-12 h-12 text-purple-400 mx-auto mb-3" />
                                                    <h3 className="text-purple-400 text-lg font-bold mb-1">Pronto para Promoção!</h3>
                                                    <p className="text-purple-200/70">{selectedEditor.member.name} atende todos os critérios para ser promovido a Pleno</p>
                                                </div>
                                            )}

                                            {selectedEditor.status === 'risk' && (
                                                <div className="p-4 bg-red-950/50 border border-red-500/30 rounded-xl">
                                                    <p className="text-red-400 flex items-center gap-2">
                                                        <AlertTriangle className="w-5 h-5" />
                                                        Taxa de alteração acima de 10% - necessário acompanhamento intensivo
                                                    </p>
                                                </div>
                                            )}

                                            {selectedEditor.isInAuditMode && (
                                                <div className="p-4 bg-blue-950/50 border border-blue-500/30 rounded-xl">
                                                    <p className="text-blue-400 flex items-center gap-2">
                                                        <Shield className="w-5 h-5" />
                                                        Período de auditoria ativo (meses 11-12) - monitoramento intensivo em andamento
                                                    </p>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    ) : (
                        /* Nenhum editor selecionado */
                        <div className="space-y-4">
                            {/* Resumo da equipe */}
                            <div className="grid grid-cols-3 gap-4">
                                <div className="bg-[#12121a] border border-purple-900/30 rounded-xl p-5">
                                    <div className="flex items-center gap-3">
                                        <div className="w-12 h-12 rounded-lg bg-purple-600/20 flex items-center justify-center">
                                            <Users className="w-6 h-6 text-purple-400" />
                                        </div>
                                        <div>
                                            <p className="text-gray-400 text-sm">Total Editores</p>
                                            <p className="text-3xl font-bold text-white">{editorsData.length}</p>
                                        </div>
                                    </div>
                                </div>
                                <div className="bg-[#12121a] border border-purple-900/30 rounded-xl p-5">
                                    <div className="flex items-center gap-3">
                                        <div className="w-12 h-12 rounded-lg bg-green-600/20 flex items-center justify-center">
                                            <Video className="w-6 h-6 text-green-400" />
                                        </div>
                                        <div>
                                            <p className="text-gray-400 text-sm">Média Vídeos</p>
                                            <p className="text-3xl font-bold text-green-400">{teamAvg.videos}</p>
                                        </div>
                                    </div>
                                </div>
                                <div className="bg-[#12121a] border border-purple-900/30 rounded-xl p-5">
                                    <div className="flex items-center gap-3">
                                        <div className="w-12 h-12 rounded-lg bg-amber-600/20 flex items-center justify-center">
                                            <Target className="w-6 h-6 text-amber-400" />
                                        </div>
                                        <div>
                                            <p className="text-gray-400 text-sm">Média Alteração</p>
                                            <p className="text-3xl font-bold text-amber-400">{teamAvg.alteration}%</p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Top performers */}
                            <div className="bg-[#12121a] border border-purple-900/30 rounded-xl p-4">
                                <h3 className="text-white font-medium mb-4 flex items-center gap-2">
                                    <Star className="w-4 h-4 text-yellow-400" />
                                    Destaques da Equipe
                                </h3>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="p-3 bg-green-950/30 rounded-lg border border-green-900/50">
                                        <p className="text-green-400 text-xs mb-1">Maior Volume</p>
                                        <p className="text-white font-medium">{editorsData[0]?.member.name}</p>
                                        <p className="text-green-400 text-sm">{editorsData[0]?.totalVideos} vídeos</p>
                                    </div>
                                    <div className="p-3 bg-blue-950/30 rounded-lg border border-blue-900/50">
                                        <p className="text-blue-400 text-xs mb-1">Menor Alteração</p>
                                        <p className="text-white font-medium">{[...editorsData].sort((a, b) => a.alterationRate - b.alterationRate)[0]?.member.name}</p>
                                        <p className="text-blue-400 text-sm">{[...editorsData].sort((a, b) => a.alterationRate - b.alterationRate)[0]?.alterationRate}%</p>
                                    </div>
                                </div>
                            </div>

                            {/* Instrução */}
                            <div className="bg-[#12121a] border border-purple-900/30 rounded-xl p-10 text-center">
                                <User className="w-16 h-16 text-purple-400 mx-auto mb-4" />
                                <h3 className="text-white font-medium text-lg mb-2">Selecione um editor</h3>
                                <p className="text-gray-500">
                                    Clique em um editor na lista para ver a análise completa de evolução,<br />
                                    histórico de entregas, tendências e progresso rumo à promoção
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

'use client';

import { useState, useRef, useMemo } from 'react';
import { DashboardKPIs, NormalizedTask } from '@/types';
import { ALL_TEAMS, getTeamByMemberName, getMemberByName } from '@/lib/constants';
import {
    FileText,
    Download,
    Calendar,
    Clock,
    CheckCircle,
    AlertCircle,
    TrendingUp,
    TrendingDown,
    Users,
    Video,
    Target,
    Eye,
    Printer,
    X,
    BarChart3,
    Award
} from 'lucide-react';

interface RelatoriosViewProps {
    kpis: DashboardKPIs;
    allVideos: NormalizedTask[];
    lastUpdated: number;
}

type ReportType = 'weekly' | 'monthly' | 'bimonthly' | 'quarterly';

interface ReportConfig {
    type: ReportType;
    label: string;
    description: string;
    frequency: string;
    audience: string;
    icon: typeof FileText;
    color: string;
}

const reportConfigs: ReportConfig[] = [
    {
        type: 'weekly',
        label: 'Relatório Semanal',
        description: 'Resumo operacional, gargalos e ações imediatas',
        frequency: 'Toda sexta-feira',
        audience: 'Phellipe (interno)',
        icon: FileText,
        color: 'purple',
    },
    {
        type: 'monthly',
        label: 'Relatório Mensal',
        description: 'Evolução, tendências e maturidade do time',
        frequency: 'Fim do mês',
        audience: 'Mateus Maialle',
        icon: TrendingUp,
        color: 'blue',
    },
    {
        type: 'bimonthly',
        label: 'Relatório Bimestral',
        description: 'Comparativo detalhado entre os 2 meses',
        frequency: 'A cada 2 meses',
        audience: 'Tático',
        icon: Target,
        color: 'green',
    },
    {
        type: 'quarterly',
        label: 'Relatório Trimestral',
        description: 'Visão macro, ROI e projeções',
        frequency: 'A cada 3 meses',
        audience: 'C-Level',
        icon: Users,
        color: 'amber',
    },
];

// Helper functions for date calculations
function getMonthName(month: number): string {
    const months = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
                    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    return months[month];
}

function getQuarterName(quarter: number): string {
    return `${quarter}º Trimestre`;
}

export function RelatoriosView({ kpis, allVideos, lastUpdated }: RelatoriosViewProps) {
    const [selectedReport, setSelectedReport] = useState<ReportType | null>(null);
    const [showPreview, setShowPreview] = useState(false);
    const printRef = useRef<HTMLDivElement>(null);

    const now = new Date();

    // ========== DATE RANGES ==========
    // Week
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);

    const startOfLastWeek = new Date(startOfWeek);
    startOfLastWeek.setDate(startOfLastWeek.getDate() - 7);

    // Month
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);

    // Bimester (last 2 months)
    const startOfBimester = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const startOfPreviousBimester = new Date(now.getFullYear(), now.getMonth() - 3, 1);
    const endOfPreviousBimester = new Date(now.getFullYear(), now.getMonth() - 1, 0);

    // Quarter
    const currentQuarter = Math.floor(now.getMonth() / 3);
    const startOfQuarter = new Date(now.getFullYear(), currentQuarter * 3, 1);
    const startOfLastQuarter = new Date(now.getFullYear(), (currentQuarter - 1) * 3, 1);
    const endOfLastQuarter = new Date(now.getFullYear(), currentQuarter * 3, 0);

    // ========== VIDEO FILTERS ==========
    const thisWeekVideos = allVideos.filter(v => v.dateClosed && v.dateClosed >= startOfWeek.getTime());
    const lastWeekVideos = allVideos.filter(v => v.dateClosed && v.dateClosed >= startOfLastWeek.getTime() && v.dateClosed < startOfWeek.getTime());

    const thisMonthVideos = allVideos.filter(v => v.dateClosed && v.dateClosed >= startOfMonth.getTime());
    const lastMonthVideos = allVideos.filter(v => v.dateClosed && v.dateClosed >= startOfLastMonth.getTime() && v.dateClosed <= endOfLastMonth.getTime());

    const thisBimesterVideos = allVideos.filter(v => v.dateClosed && v.dateClosed >= startOfBimester.getTime());
    const lastBimesterVideos = allVideos.filter(v => v.dateClosed && v.dateClosed >= startOfPreviousBimester.getTime() && v.dateClosed <= endOfPreviousBimester.getTime());

    const thisQuarterVideos = allVideos.filter(v => v.dateClosed && v.dateClosed >= startOfQuarter.getTime());
    const lastQuarterVideos = allVideos.filter(v => v.dateClosed && v.dateClosed >= startOfLastQuarter.getTime() && v.dateClosed <= endOfLastQuarter.getTime());

    // ========== HELPER: Calculate metrics for a set of videos ==========
    const calculateMetrics = (videos: NormalizedTask[], comparisonVideos: NormalizedTask[]) => {
        // Team metrics
        const teamMetrics = ALL_TEAMS.map(team => {
            const teamVideos = videos.filter(v => {
                const memberTeam = getTeamByMemberName(v.editorName);
                return memberTeam?.id === team.id;
            });

            const teamVideosWithPhase = teamVideos.filter(v => v.phaseTime);
            const videosWithAlteration = teamVideosWithPhase.filter(v => v.phaseTime?.alterationTimeMs && v.phaseTime.alterationTimeMs > 0).length;
            const alterationRate = teamVideosWithPhase.length > 0 ? (videosWithAlteration / teamVideosWithPhase.length) * 100 : 0;

            // Comparison
            const compTeamVideos = comparisonVideos.filter(v => {
                const memberTeam = getTeamByMemberName(v.editorName);
                return memberTeam?.id === team.id;
            });

            return {
                teamId: team.id,
                teamName: team.name,
                teamColor: team.color,
                totalVideos: teamVideos.length,
                comparisonVideos: compTeamVideos.length,
                alterationRate: parseFloat(alterationRate.toFixed(1)),
            };
        });

        // Editor metrics
        const editorMap = new Map<string, { name: string; videos: number; alteration: number; totalWithPhase: number; color: string; teamName: string; teamColor: string }>();

        videos.forEach(v => {
            const existing = editorMap.get(v.editorName);
            const member = getMemberByName(v.editorName);
            const team = getTeamByMemberName(v.editorName);
            const hasAlteration = v.phaseTime?.alterationTimeMs && v.phaseTime.alterationTimeMs > 0;

            if (existing) {
                existing.videos += 1;
                if (v.phaseTime) {
                    existing.totalWithPhase += 1;
                    if (hasAlteration) existing.alteration += 1;
                }
            } else {
                editorMap.set(v.editorName, {
                    name: v.editorName,
                    videos: 1,
                    alteration: hasAlteration ? 1 : 0,
                    totalWithPhase: v.phaseTime ? 1 : 0,
                    color: member?.color || '#6b7280',
                    teamName: team?.name || 'Sem Equipe',
                    teamColor: team?.color || '#6b7280',
                });
            }
        });

        const editorMetrics = Array.from(editorMap.values()).map(e => ({
            ...e,
            alterationRate: e.totalWithPhase > 0 ? parseFloat(((e.alteration / e.totalWithPhase) * 100).toFixed(1)) : 0,
        })).sort((a, b) => b.videos - a.videos);

        // Averages
        const teamsWithVideos = teamMetrics.filter(t => t.totalVideos > 0);
        const avgAlterationRate = teamsWithVideos.length > 0
            ? teamsWithVideos.reduce((acc, t) => acc + t.alterationRate, 0) / teamsWithVideos.length
            : 0;

        return {
            teamMetrics,
            editorMetrics,
            totalVideos: videos.length,
            comparisonTotalVideos: comparisonVideos.length,
            avgAlterationRate,
        };
    };

    // Pre-calculate metrics for each report type
    const weeklyMetrics = useMemo(() => calculateMetrics(thisWeekVideos, lastWeekVideos), [thisWeekVideos, lastWeekVideos]);
    const monthlyMetrics = useMemo(() => calculateMetrics(thisMonthVideos, lastMonthVideos), [thisMonthVideos, lastMonthVideos]);
    const bimesterMetrics = useMemo(() => calculateMetrics(thisBimesterVideos, lastBimesterVideos), [thisBimesterVideos, lastBimesterVideos]);
    const quarterlyMetrics = useMemo(() => calculateMetrics(thisQuarterVideos, lastQuarterVideos), [thisQuarterVideos, lastQuarterVideos]);

    const handleGenerateReport = (type: ReportType) => {
        setSelectedReport(type);
        setShowPreview(true);
    };

    const handlePrint = () => {
        window.print();
    };

    const colorClasses: Record<string, { bg: string; border: string; text: string; headerBg: string }> = {
        purple: { bg: 'bg-purple-600/20', border: 'border-purple-500/30', text: 'text-purple-400', headerBg: 'border-purple-600' },
        blue: { bg: 'bg-blue-600/20', border: 'border-blue-500/30', text: 'text-blue-400', headerBg: 'border-blue-600' },
        green: { bg: 'bg-green-600/20', border: 'border-green-500/30', text: 'text-green-400', headerBg: 'border-green-600' },
        amber: { bg: 'bg-amber-600/20', border: 'border-amber-500/30', text: 'text-amber-400', headerBg: 'border-amber-600' },
    };

    // Get current report data
    const getReportData = () => {
        switch (selectedReport) {
            case 'weekly':
                return {
                    metrics: weeklyMetrics,
                    title: 'Relatório Semanal - Audiovisual',
                    subtitle: formatWeekRange(),
                    periodLabel: 'Esta Semana',
                    comparisonLabel: 'Semana Anterior',
                    color: 'purple',
                };
            case 'monthly':
                return {
                    metrics: monthlyMetrics,
                    title: 'Relatório Mensal - Audiovisual',
                    subtitle: `${getMonthName(now.getMonth())} ${now.getFullYear()}`,
                    periodLabel: 'Este Mês',
                    comparisonLabel: 'Mês Anterior',
                    color: 'blue',
                };
            case 'bimonthly':
                return {
                    metrics: bimesterMetrics,
                    title: 'Relatório Bimestral - Audiovisual',
                    subtitle: `${getMonthName(now.getMonth() - 1)} - ${getMonthName(now.getMonth())} ${now.getFullYear()}`,
                    periodLabel: 'Este Bimestre',
                    comparisonLabel: 'Bimestre Anterior',
                    color: 'green',
                };
            case 'quarterly':
                return {
                    metrics: quarterlyMetrics,
                    title: 'Relatório Trimestral - Audiovisual',
                    subtitle: `${getQuarterName(currentQuarter + 1)} ${now.getFullYear()}`,
                    periodLabel: 'Este Trimestre',
                    comparisonLabel: 'Trimestre Anterior',
                    color: 'amber',
                };
            default:
                return null;
        }
    };

    const formatWeekRange = () => {
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(endOfWeek.getDate() + 6);
        return `${startOfWeek.toLocaleDateString('pt-BR')} a ${endOfWeek.toLocaleDateString('pt-BR')}`;
    };

    const reportData = getReportData();

    return (
        <>
            {/* Main Content */}
            <div className="p-8 space-y-8 print:hidden">
                {/* Header */}
                <div className="flex justify-between items-start">
                    <div>
                        <h1 className="text-3xl font-bold text-white">Central de Relatórios</h1>
                        <p className="text-gray-400 mt-1">
                            Gere relatórios em PDF para diferentes períodos e públicos
                        </p>
                    </div>
                    <div className="text-right">
                        <div className="text-sm text-gray-500">Dados atualizados em</div>
                        <div className="text-lg text-purple-400">
                            {new Date(lastUpdated).toLocaleString('pt-BR')}
                        </div>
                    </div>
                </div>

                {/* Quick Stats */}
                <div className="grid grid-cols-4 gap-6">
                    <div className="bg-[#12121a] border border-purple-900/30 rounded-xl p-6">
                        <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-lg bg-purple-600/20 flex items-center justify-center">
                                <Video className="w-6 h-6 text-purple-400" />
                            </div>
                            <div>
                                <p className="text-gray-400 text-sm">Esta Semana</p>
                                <p className="text-2xl font-bold text-white">{thisWeekVideos.length}</p>
                            </div>
                        </div>
                    </div>

                    <div className="bg-[#12121a] border border-blue-900/30 rounded-xl p-6">
                        <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-lg bg-blue-600/20 flex items-center justify-center">
                                <Calendar className="w-6 h-6 text-blue-400" />
                            </div>
                            <div>
                                <p className="text-gray-400 text-sm">Este Mês</p>
                                <p className="text-2xl font-bold text-white">{thisMonthVideos.length}</p>
                            </div>
                        </div>
                    </div>

                    <div className="bg-[#12121a] border border-green-900/30 rounded-xl p-6">
                        <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-lg bg-green-600/20 flex items-center justify-center">
                                <BarChart3 className="w-6 h-6 text-green-400" />
                            </div>
                            <div>
                                <p className="text-gray-400 text-sm">Este Trimestre</p>
                                <p className="text-2xl font-bold text-white">{thisQuarterVideos.length}</p>
                            </div>
                        </div>
                    </div>

                    <div className="bg-[#12121a] border border-amber-900/30 rounded-xl p-6">
                        <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-lg bg-amber-600/20 flex items-center justify-center">
                                <Award className="w-6 h-6 text-amber-400" />
                            </div>
                            <div>
                                <p className="text-gray-400 text-sm">Total Geral</p>
                                <p className="text-2xl font-bold text-white">{allVideos.length}</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Report Cards */}
                <div>
                    <h2 className="text-lg font-semibold text-white mb-4">Selecione o Tipo de Relatório</h2>
                    <div className="grid grid-cols-2 gap-6">
                        {reportConfigs.map(config => {
                            const colors = colorClasses[config.color];
                            const Icon = config.icon;

                            return (
                                <div
                                    key={config.type}
                                    className={`bg-[#12121a] border ${colors.border} rounded-xl p-6 hover:border-opacity-100 transition-all cursor-pointer`}
                                    onClick={() => handleGenerateReport(config.type)}
                                >
                                    <div className="flex items-start justify-between">
                                        <div className="flex items-start gap-4">
                                            <div className={`w-12 h-12 rounded-lg ${colors.bg} flex items-center justify-center`}>
                                                <Icon className={`w-6 h-6 ${colors.text}`} />
                                            </div>
                                            <div>
                                                <h3 className="text-white font-semibold text-lg">{config.label}</h3>
                                                <p className="text-gray-400 text-sm mt-1">{config.description}</p>
                                                <div className="flex items-center gap-4 mt-3">
                                                    <span className="text-gray-500 text-xs flex items-center gap-1">
                                                        <Clock className="w-3 h-3" />
                                                        {config.frequency}
                                                    </span>
                                                    <span className="text-gray-500 text-xs flex items-center gap-1">
                                                        <Users className="w-3 h-3" />
                                                        {config.audience}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                        <button className={`px-4 py-2 ${colors.bg} ${colors.text} rounded-lg hover:opacity-80 transition-opacity flex items-center gap-2`}>
                                            <Eye className="w-4 h-4" />
                                            Gerar
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Report Preview Modal - Universal for all report types */}
            {showPreview && reportData && (
                <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 print:static print:bg-white print:p-0">
                    <div
                        ref={printRef}
                        className="bg-white text-black w-full max-w-4xl max-h-[90vh] overflow-auto rounded-xl print:max-w-none print:max-h-none print:overflow-visible print:rounded-none"
                    >
                        {/* Close and Print buttons */}
                        <div className="sticky top-0 bg-white border-b p-4 flex justify-between items-center print:hidden">
                            <h2 className="text-xl font-bold text-gray-800">Pré-visualização do Relatório</h2>
                            <div className="flex gap-2">
                                <button
                                    onClick={handlePrint}
                                    className={`px-4 py-2 ${reportData.color === 'purple' ? 'bg-purple-600' : reportData.color === 'blue' ? 'bg-blue-600' : reportData.color === 'green' ? 'bg-green-600' : 'bg-amber-600'} text-white rounded-lg hover:opacity-90 flex items-center gap-2`}
                                >
                                    <Printer className="w-4 h-4" />
                                    Imprimir / Salvar PDF
                                </button>
                                <button
                                    onClick={() => setShowPreview(false)}
                                    className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 flex items-center gap-2"
                                >
                                    <X className="w-4 h-4" />
                                    Fechar
                                </button>
                            </div>
                        </div>

                        {/* Report Content */}
                        <div className="p-8 print:p-6" id="report-content">
                            {/* Header */}
                            <div className={`text-center mb-8 pb-6 border-b-2 ${colorClasses[reportData.color].headerBg}`}>
                                <h1 className={`text-3xl font-bold ${reportData.color === 'purple' ? 'text-purple-600' : reportData.color === 'blue' ? 'text-blue-600' : reportData.color === 'green' ? 'text-green-600' : 'text-amber-600'}`}>
                                    {reportData.title}
                                </h1>
                                <p className="text-gray-500 mt-2 text-lg">{reportData.subtitle}</p>
                                <p className="text-gray-400 text-sm mt-1">Gerado em {new Date().toLocaleString('pt-BR')}</p>
                            </div>

                            {/* Summary */}
                            <div className="grid grid-cols-4 gap-4 mb-8">
                                <div className={`${reportData.color === 'purple' ? 'bg-purple-50' : reportData.color === 'blue' ? 'bg-blue-50' : reportData.color === 'green' ? 'bg-green-50' : 'bg-amber-50'} rounded-lg p-4 text-center`}>
                                    <p className={`text-3xl font-bold ${reportData.color === 'purple' ? 'text-purple-600' : reportData.color === 'blue' ? 'text-blue-600' : reportData.color === 'green' ? 'text-green-600' : 'text-amber-600'}`}>
                                        {reportData.metrics.totalVideos}
                                    </p>
                                    <p className="text-gray-600 text-sm">Vídeos Entregues</p>
                                </div>
                                <div className="bg-gray-50 rounded-lg p-4 text-center">
                                    <p className="text-3xl font-bold text-gray-600">{reportData.metrics.comparisonTotalVideos}</p>
                                    <p className="text-gray-600 text-sm">{reportData.comparisonLabel}</p>
                                </div>
                                <div className="bg-green-50 rounded-lg p-4 text-center">
                                    <p className={`text-3xl font-bold ${reportData.metrics.totalVideos >= reportData.metrics.comparisonTotalVideos ? 'text-green-600' : 'text-red-600'}`}>
                                        {reportData.metrics.comparisonTotalVideos > 0
                                            ? `${reportData.metrics.totalVideos >= reportData.metrics.comparisonTotalVideos ? '+' : ''}${((reportData.metrics.totalVideos - reportData.metrics.comparisonTotalVideos) / reportData.metrics.comparisonTotalVideos * 100).toFixed(0)}%`
                                            : 'N/A'
                                        }
                                    </p>
                                    <p className="text-gray-600 text-sm">Variação</p>
                                </div>
                                <div className="bg-amber-50 rounded-lg p-4 text-center">
                                    <p className={`text-3xl font-bold ${reportData.metrics.avgAlterationRate < 20 ? 'text-green-600' : reportData.metrics.avgAlterationRate < 35 ? 'text-amber-600' : 'text-red-600'}`}>
                                        {reportData.metrics.avgAlterationRate.toFixed(1)}%
                                    </p>
                                    <p className="text-gray-600 text-sm">Taxa Alteração (Média)</p>
                                </div>
                            </div>

                            {/* Team Comparison */}
                            <div className="mb-8">
                                <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                                    <Users className={`w-5 h-5 ${reportData.color === 'purple' ? 'text-purple-600' : reportData.color === 'blue' ? 'text-blue-600' : reportData.color === 'green' ? 'text-green-600' : 'text-amber-600'}`} />
                                    Desempenho por Equipe
                                </h2>
                                <table className="w-full border-collapse text-sm">
                                    <thead>
                                        <tr className="bg-gray-100">
                                            <th className="text-left p-3 border">Equipe</th>
                                            <th className="text-center p-3 border">{reportData.periodLabel}</th>
                                            <th className="text-center p-3 border">{reportData.comparisonLabel}</th>
                                            <th className="text-center p-3 border">Variação</th>
                                            <th className="text-center p-3 border">Taxa Alteração</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {reportData.metrics.teamMetrics.map((team, idx) => {
                                            const variation = team.comparisonVideos > 0
                                                ? ((team.totalVideos - team.comparisonVideos) / team.comparisonVideos * 100)
                                                : 0;

                                            return (
                                                <tr key={team.teamId} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                                                    <td className="p-3 border">
                                                        <div className="flex items-center gap-2">
                                                            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: team.teamColor }} />
                                                            <span className="font-medium">{team.teamName}</span>
                                                        </div>
                                                    </td>
                                                    <td className="text-center p-3 border font-bold">{team.totalVideos}</td>
                                                    <td className="text-center p-3 border text-gray-600">{team.comparisonVideos}</td>
                                                    <td className={`text-center p-3 border font-medium ${variation >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                        {team.comparisonVideos > 0 ? `${variation >= 0 ? '+' : ''}${variation.toFixed(0)}%` : '-'}
                                                    </td>
                                                    <td className={`text-center p-3 border font-medium ${team.alterationRate < 20 ? 'text-green-600' : team.alterationRate < 35 ? 'text-amber-600' : 'text-red-600'}`}>
                                                        {team.totalVideos > 0 ? `${team.alterationRate}%` : '-'}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>

                            {/* Individual Editor Performance */}
                            <div className="mb-8">
                                <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                                    <Target className={`w-5 h-5 ${reportData.color === 'purple' ? 'text-purple-600' : reportData.color === 'blue' ? 'text-blue-600' : reportData.color === 'green' ? 'text-green-600' : 'text-amber-600'}`} />
                                    Desempenho Individual - Taxa de Alteração
                                </h2>
                                <table className="w-full border-collapse text-sm">
                                    <thead>
                                        <tr className="bg-gray-100">
                                            <th className="text-left p-3 border">Editor</th>
                                            <th className="text-center p-3 border">Equipe</th>
                                            <th className="text-center p-3 border">Vídeos</th>
                                            <th className="text-center p-3 border">Taxa Alteração</th>
                                            <th className="text-center p-3 border">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {reportData.metrics.editorMetrics.map((editor, idx) => (
                                            <tr key={editor.name} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                                                <td className="p-3 border">
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: editor.color }} />
                                                        <span className="font-medium">{editor.name}</span>
                                                    </div>
                                                </td>
                                                <td className="text-center p-3 border">
                                                    <span className="px-2 py-1 rounded text-xs font-medium" style={{ backgroundColor: `${editor.teamColor}20`, color: editor.teamColor }}>
                                                        {editor.teamName}
                                                    </span>
                                                </td>
                                                <td className="text-center p-3 border font-bold">{editor.videos}</td>
                                                <td className={`text-center p-3 border font-bold ${editor.alterationRate < 20 ? 'text-green-600' : editor.alterationRate < 35 ? 'text-amber-600' : 'text-red-600'}`}>
                                                    {editor.alterationRate}%
                                                </td>
                                                <td className="text-center p-3 border">
                                                    {editor.alterationRate < 20 ? (
                                                        <span className="inline-flex items-center gap-1 text-green-600">
                                                            <CheckCircle className="w-4 h-4" /> Excelente
                                                        </span>
                                                    ) : editor.alterationRate < 35 ? (
                                                        <span className="inline-flex items-center gap-1 text-amber-600">
                                                            <AlertCircle className="w-4 h-4" /> Atenção
                                                        </span>
                                                    ) : (
                                                        <span className="inline-flex items-center gap-1 text-red-600">
                                                            <AlertCircle className="w-4 h-4" /> Crítico
                                                        </span>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                <p className="text-gray-500 text-xs mt-2 italic">
                                    * Taxa de Alteração = % de vídeos que passaram por alteração (retrabalho)
                                </p>
                            </div>

                            {/* Top Performers (for monthly, bimesterly, quarterly) */}
                            {(selectedReport === 'monthly' || selectedReport === 'bimonthly' || selectedReport === 'quarterly') && reportData.metrics.editorMetrics.length > 0 && (
                                <div className="mb-8 p-4 bg-green-50 rounded-lg border border-green-200">
                                    <h3 className="text-green-700 font-bold flex items-center gap-2 mb-3">
                                        <Award className="w-5 h-5" />
                                        Destaques do Período
                                    </h3>
                                    <div className="grid grid-cols-3 gap-4">
                                        <div className="text-center">
                                            <p className="text-gray-600 text-sm">Maior Volume</p>
                                            <p className="font-bold text-green-700">{reportData.metrics.editorMetrics[0]?.name || '-'}</p>
                                            <p className="text-green-600 text-sm">{reportData.metrics.editorMetrics[0]?.videos || 0} vídeos</p>
                                        </div>
                                        <div className="text-center">
                                            <p className="text-gray-600 text-sm">Melhor Qualidade</p>
                                            {(() => {
                                                const sorted = [...reportData.metrics.editorMetrics].sort((a, b) => a.alterationRate - b.alterationRate);
                                                return (
                                                    <>
                                                        <p className="font-bold text-green-700">{sorted[0]?.name || '-'}</p>
                                                        <p className="text-green-600 text-sm">{sorted[0]?.alterationRate || 0}% alteração</p>
                                                    </>
                                                );
                                            })()}
                                        </div>
                                        <div className="text-center">
                                            <p className="text-gray-600 text-sm">Equipe Destaque</p>
                                            {(() => {
                                                const sorted = [...reportData.metrics.teamMetrics].sort((a, b) => b.totalVideos - a.totalVideos);
                                                return (
                                                    <>
                                                        <p className="font-bold text-green-700">{sorted[0]?.teamName || '-'}</p>
                                                        <p className="text-green-600 text-sm">{sorted[0]?.totalVideos || 0} vídeos</p>
                                                    </>
                                                );
                                            })()}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Alerts */}
                            {reportData.metrics.editorMetrics.filter(e => e.alterationRate >= 35).length > 0 && (
                                <div className="mb-8 p-4 bg-red-50 rounded-lg border border-red-200">
                                    <h3 className="text-red-700 font-bold flex items-center gap-2 mb-2">
                                        <AlertCircle className="w-5 h-5" />
                                        Alertas de Qualidade
                                    </h3>
                                    <ul className="text-red-600 text-sm space-y-1">
                                        {reportData.metrics.editorMetrics.filter(e => e.alterationRate >= 35).map(editor => (
                                            <li key={editor.name}>
                                                • <strong>{editor.name}</strong> ({editor.teamName}) - taxa de alteração de {editor.alterationRate}% (acima do limite de 35%)
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                            {/* Footer */}
                            <div className="text-center pt-6 border-t text-gray-400 text-sm">
                                <p className="font-medium">Dashboard Audiovisual - XMX Corp</p>
                                <p>Relatório gerado automaticamente</p>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Print Styles */}
            <style jsx global>{`
                @media print {
                    body * {
                        visibility: hidden;
                    }
                    #report-content,
                    #report-content * {
                        visibility: visible;
                    }
                    #report-content {
                        position: absolute;
                        left: 0;
                        top: 0;
                        width: 100%;
                    }
                    .print\\:hidden {
                        display: none !important;
                    }
                    @page {
                        size: A4;
                        margin: 1cm;
                    }
                }
            `}</style>
        </>
    );
}

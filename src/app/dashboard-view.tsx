"use client";

import { useState, useMemo, useEffect } from 'react';
import { DashboardKPIs, NormalizedTask, EditorStats } from '@/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from "@/components/ui/separator";
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
    PieChart, Pie, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
    LineChart, Line, Legend, ComposedChart, Area
} from 'recharts';
import {
    Users, TrendingUp, Target, Award, Clock, Zap, BarChart3, GitCompare,
    ChevronRight, ArrowUp, ArrowDown, Minus, Calendar, RefreshCw
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { subDays } from 'date-fns';

// --- COLORS (Power BI inspired) ---
const COLORS = {
    primary: '#3b82f6',
    secondary: '#8b5cf6',
    success: '#10b981',
    warning: '#f59e0b',
    danger: '#ef4444',
    info: '#06b6d4',
    chart: ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ec4899', '#06b6d4', '#84cc16', '#f97316']
};

interface DashboardViewProps {
    initialData: DashboardKPIs;
    lastUpdated: number;
}

// --- CUSTOM TOOLTIP (Power BI Style) ---
function CustomTooltip({ active, payload, label }: any) {
    if (active && payload && payload.length) {
        return (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-4 rounded-lg shadow-xl">
                <p className="font-semibold text-slate-900 dark:text-slate-100 mb-2 text-sm">{label}</p>
                {payload.map((entry: any, index: number) => (
                    <div key={index} className="flex items-center justify-between gap-4 text-sm">
                        <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: entry.color }} />
                            <span className="text-slate-600 dark:text-slate-400">{entry.name}</span>
                        </div>
                        <span className="font-bold text-slate-900 dark:text-white">{typeof entry.value === 'number' ? entry.value.toFixed(1) : entry.value}</span>
                    </div>
                ))}
            </div>
        );
    }
    return null;
}

export default function DashboardView({ initialData, lastUpdated }: DashboardViewProps) {
    const [isMounted, setIsMounted] = useState(false);
    const [timeRange, setTimeRange] = useState("all");
    const [viewMode, setViewMode] = useState<'team' | 'compare'>('team');
    const [selectedEditors, setSelectedEditors] = useState<string[]>([]);

    useEffect(() => {
        setIsMounted(true);
    }, []);

    const ChartWrapper = ({ children }: { children: React.ReactNode }) => {
        if (!isMounted) return <div className="h-full w-full flex items-center justify-center text-slate-400">Carregando...</div>;
        return <>{children}</>;
    };

    // --- FILTER BY TIME RANGE ---
    const filteredVideos = useMemo(() => {
        let videos = initialData.editors.flatMap(e => e.videos);
        const now = new Date();

        if (timeRange === "month") {
            const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
            videos = videos.filter(v => new Date(v.dateCreated).getTime() >= startOfMonth.getTime());
        } else if (timeRange === "quarter") {
            const startOfQuarter = subDays(now, 90);
            videos = videos.filter(v => new Date(v.dateCreated).getTime() >= startOfQuarter.getTime());
        } else if (timeRange === "week") {
            const startOfWeek = subDays(now, 7);
            videos = videos.filter(v => new Date(v.dateCreated).getTime() >= startOfWeek.getTime());
        }

        return videos;
    }, [initialData, timeRange]);

    // --- TEAM METRICS ---
    const teamMetrics = useMemo(() => {
        const completedVideos = filteredVideos.filter(v => ['COMPLETED', 'CLOSED', 'DONE'].includes(v.status));
        const totalVideos = completedVideos.length;
        const totalHours = completedVideos.reduce((acc, v) => acc + v.timeTrackedHours, 0);
        const avgEfficiency = totalVideos > 0 ? totalHours / totalVideos : 0;

        // Lead time médio
        const videosWithLeadTime = completedVideos.filter(v => v.dateClosed && v.dateCreated);
        const avgLeadTime = videosWithLeadTime.length > 0
            ? videosWithLeadTime.reduce((acc, v) => acc + (v.dateClosed! - v.dateCreated) / (1000 * 60 * 60), 0) / videosWithLeadTime.length
            : 0;

        return { totalVideos, totalHours, avgEfficiency, avgLeadTime, activeEditors: initialData.editors.length };
    }, [filteredVideos, initialData.editors]);

    // --- EDITOR STATS (Recalculated based on time filter) ---
    const editorStats = useMemo(() => {
        const statsMap = new Map<string, {
            name: string;
            videos: number;
            hours: number;
            efficiency: number;
            leadTime: number;
            inProgress: number;
        }>();

        filteredVideos.forEach(video => {
            if (!statsMap.has(video.editorName)) {
                statsMap.set(video.editorName, {
                    name: video.editorName,
                    videos: 0,
                    hours: 0,
                    efficiency: 0,
                    leadTime: 0,
                    inProgress: 0
                });
            }

            const stats = statsMap.get(video.editorName)!;

            if (['COMPLETED', 'CLOSED', 'DONE'].includes(video.status)) {
                stats.videos += 1;
                stats.hours += video.timeTrackedHours;

                if (video.dateClosed && video.dateCreated) {
                    const lt = (video.dateClosed - video.dateCreated) / (1000 * 60 * 60);
                    stats.leadTime += lt;
                }
            } else if (['IN PROGRESS', 'DOING', 'REVIEW'].includes(video.status)) {
                stats.inProgress += 1;
            }
        });

        // Calculate averages
        return Array.from(statsMap.values()).map(s => ({
            ...s,
            efficiency: s.videos > 0 ? s.hours / s.videos : 0,
            leadTime: s.videos > 0 ? s.leadTime / s.videos : 0
        })).sort((a, b) => b.videos - a.videos);
    }, [filteredVideos]);

    // --- COMPARISON DATA ---
    const comparisonData = useMemo(() => {
        if (selectedEditors.length < 2) return null;

        const editors = selectedEditors.map(name => editorStats.find(e => e.name === name)).filter(Boolean) as typeof editorStats;
        const teamAvg = {
            videos: teamMetrics.totalVideos / teamMetrics.activeEditors,
            efficiency: teamMetrics.avgEfficiency,
            leadTime: teamMetrics.avgLeadTime
        };

        return { editors, teamAvg };
    }, [selectedEditors, editorStats, teamMetrics]);

    // --- RADAR DATA FOR COMPARISON ---
    const radarData = useMemo(() => {
        if (!comparisonData) return [];

        const maxVideos = Math.max(...editorStats.map(e => e.videos), 1);
        const maxEfficiency = Math.max(...editorStats.map(e => e.efficiency), 1);
        const maxLeadTime = Math.max(...editorStats.map(e => e.leadTime), 1);

        return [
            {
                metric: 'Volume',
                ...Object.fromEntries(comparisonData.editors.map(e => [e.name, (e.videos / maxVideos) * 100])),
                'Média Equipe': (comparisonData.teamAvg.videos / maxVideos) * 100
            },
            {
                metric: 'Eficiência',
                ...Object.fromEntries(comparisonData.editors.map(e => [e.name, (1 - e.efficiency / maxEfficiency) * 100])),
                'Média Equipe': (1 - comparisonData.teamAvg.efficiency / maxEfficiency) * 100
            },
            {
                metric: 'Agilidade',
                ...Object.fromEntries(comparisonData.editors.map(e => [e.name, (1 - e.leadTime / maxLeadTime) * 100])),
                'Média Equipe': (1 - comparisonData.teamAvg.leadTime / maxLeadTime) * 100
            },
            {
                metric: 'Produtividade',
                ...Object.fromEntries(comparisonData.editors.map(e => [e.name, e.videos > 0 ? Math.min((e.videos / e.hours) * 50, 100) : 0])),
                'Média Equipe': teamMetrics.totalVideos > 0 ? Math.min((teamMetrics.totalVideos / teamMetrics.totalHours) * 50, 100) : 0
            }
        ];
    }, [comparisonData, editorStats, teamMetrics]);

    // Toggle editor selection for comparison
    const toggleEditorSelection = (editorName: string) => {
        setSelectedEditors(prev => {
            if (prev.includes(editorName)) {
                return prev.filter(e => e !== editorName);
            }
            if (prev.length >= 3) {
                return [...prev.slice(1), editorName];
            }
            return [...prev, editorName];
        });
    };

    // --- RENDER ---
    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white p-4 md:p-6 lg:p-8">

            {/* HEADER */}
            <header className="mb-8">
                <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
                    <div>
                        <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">
                            Painel de Gestão
                            <span className="text-blue-500 ml-2">Audiovisual</span>
                        </h1>
                        <p className="text-slate-400 text-sm mt-1 flex items-center gap-2">
                            <RefreshCw className="w-3 h-3" />
                            Atualizado: {new Date(lastUpdated).toLocaleString('pt-BR')}
                        </p>
                    </div>

                    {/* Controls */}
                    <div className="flex flex-wrap gap-2">
                        {/* View Mode Toggle */}
                        <div className="flex bg-slate-800/50 rounded-lg p-1 border border-slate-700/50">
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setViewMode('team')}
                                className={cn(
                                    "rounded-md px-4 transition-all",
                                    viewMode === 'team'
                                        ? "bg-blue-600 text-white hover:bg-blue-700"
                                        : "text-slate-400 hover:text-white hover:bg-slate-700/50"
                                )}
                            >
                                <Users className="w-4 h-4 mr-2" />
                                Equipe
                            </Button>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setViewMode('compare')}
                                className={cn(
                                    "rounded-md px-4 transition-all",
                                    viewMode === 'compare'
                                        ? "bg-blue-600 text-white hover:bg-blue-700"
                                        : "text-slate-400 hover:text-white hover:bg-slate-700/50"
                                )}
                            >
                                <GitCompare className="w-4 h-4 mr-2" />
                                Comparar
                            </Button>
                        </div>

                        {/* Time Range */}
                        <Select value={timeRange} onValueChange={setTimeRange}>
                            <SelectTrigger className="w-[140px] bg-slate-800/50 border-slate-700/50 text-slate-200">
                                <Calendar className="w-4 h-4 mr-2 text-slate-400" />
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-slate-800 border-slate-700">
                                <SelectItem value="all">Todo Período</SelectItem>
                                <SelectItem value="week">Esta Semana</SelectItem>
                                <SelectItem value="month">Este Mês</SelectItem>
                                <SelectItem value="quarter">Trimestre</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>
            </header>

            {/* TEAM VIEW */}
            {viewMode === 'team' && (
                <>
                    {/* KPI CARDS */}
                    <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
                        <MetricCard
                            title="Entregas"
                            value={teamMetrics.totalVideos}
                            icon={Target}
                            color="blue"
                            subtitle="vídeos concluídos"
                        />
                        <MetricCard
                            title="Horas Totais"
                            value={teamMetrics.totalHours.toFixed(0)}
                            suffix="h"
                            icon={Clock}
                            color="violet"
                            subtitle="tempo registrado"
                        />
                        <MetricCard
                            title="Eficiência"
                            value={teamMetrics.avgEfficiency.toFixed(1)}
                            suffix="h/vídeo"
                            icon={Zap}
                            color="emerald"
                            subtitle="média da equipe"
                        />
                        <MetricCard
                            title="Lead Time"
                            value={teamMetrics.avgLeadTime.toFixed(0)}
                            suffix="h"
                            icon={TrendingUp}
                            color="amber"
                            subtitle="tempo médio"
                        />
                        <MetricCard
                            title="Editores"
                            value={teamMetrics.activeEditors}
                            icon={Users}
                            color="cyan"
                            subtitle="ativos no período"
                        />
                    </div>

                    {/* MAIN CONTENT */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">

                        {/* RANKING DOS EDITORES */}
                        <Card className="lg:col-span-1 bg-slate-900/50 border-slate-800/50 backdrop-blur">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-base font-medium text-slate-200 flex items-center gap-2">
                                    <Award className="w-4 h-4 text-amber-500" />
                                    Ranking de Entregas
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-2">
                                {editorStats.slice(0, 8).map((editor, index) => (
                                    <div
                                        key={editor.name}
                                        className={cn(
                                            "flex items-center gap-3 p-3 rounded-lg transition-all cursor-pointer",
                                            "hover:bg-slate-800/50",
                                            index === 0 && "bg-gradient-to-r from-amber-500/10 to-transparent border-l-2 border-amber-500"
                                        )}
                                        onClick={() => toggleEditorSelection(editor.name)}
                                    >
                                        <div className={cn(
                                            "w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold",
                                            index === 0 ? "bg-amber-500 text-black" :
                                                index === 1 ? "bg-slate-400 text-black" :
                                                    index === 2 ? "bg-amber-700 text-white" :
                                                        "bg-slate-700 text-slate-300"
                                        )}>
                                            {index + 1}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="font-medium text-slate-200 truncate">{editor.name}</p>
                                            <p className="text-xs text-slate-500">{editor.efficiency.toFixed(1)}h por vídeo</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="font-bold text-lg text-white">{editor.videos}</p>
                                            <p className="text-xs text-slate-500">vídeos</p>
                                        </div>
                                        {selectedEditors.includes(editor.name) && (
                                            <div className="w-2 h-2 rounded-full bg-blue-500" />
                                        )}
                                    </div>
                                ))}
                            </CardContent>
                        </Card>

                        {/* GRÁFICO DE VOLUME */}
                        <Card className="lg:col-span-2 bg-slate-900/50 border-slate-800/50 backdrop-blur">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-base font-medium text-slate-200 flex items-center gap-2">
                                    <BarChart3 className="w-4 h-4 text-blue-500" />
                                    Volume de Entregas por Editor
                                </CardTitle>
                                <CardDescription className="text-slate-500">
                                    Comparação de produtividade individual
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="h-[350px]">
                                <ChartWrapper>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <ComposedChart data={editorStats} layout="vertical" margin={{ left: 20, right: 30 }}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#334155" horizontal={true} vertical={false} />
                                            <XAxis type="number" stroke="#64748b" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                                            <YAxis
                                                dataKey="name"
                                                type="category"
                                                width={100}
                                                stroke="#64748b"
                                                tick={{ fill: '#94a3b8', fontSize: 11 }}
                                            />
                                            <Tooltip content={<CustomTooltip />} />
                                            <Bar dataKey="videos" name="Concluídos" fill={COLORS.primary} radius={[0, 4, 4, 0]} barSize={20} />
                                            <Bar dataKey="inProgress" name="Em Andamento" fill={COLORS.warning} radius={[0, 4, 4, 0]} barSize={20} />
                                        </ComposedChart>
                                    </ResponsiveContainer>
                                </ChartWrapper>
                            </CardContent>
                        </Card>
                    </div>

                    {/* PERFORMANCE CARDS */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        {editorStats.slice(0, 8).map((editor, index) => (
                            <EditorCard
                                key={editor.name}
                                editor={editor}
                                teamAvg={teamMetrics}
                                rank={index + 1}
                                onClick={() => toggleEditorSelection(editor.name)}
                                isSelected={selectedEditors.includes(editor.name)}
                            />
                        ))}
                    </div>
                </>
            )}

            {/* COMPARISON VIEW */}
            {viewMode === 'compare' && (
                <>
                    {/* Editor Selection */}
                    <Card className="mb-6 bg-slate-900/50 border-slate-800/50 backdrop-blur">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-base font-medium text-slate-200">
                                Selecione até 3 editores para comparar
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="flex flex-wrap gap-2">
                                {editorStats.map(editor => (
                                    <Button
                                        key={editor.name}
                                        variant={selectedEditors.includes(editor.name) ? "default" : "outline"}
                                        size="sm"
                                        onClick={() => toggleEditorSelection(editor.name)}
                                        className={cn(
                                            "transition-all",
                                            selectedEditors.includes(editor.name)
                                                ? "bg-blue-600 hover:bg-blue-700 border-blue-600"
                                                : "bg-transparent border-slate-700 text-slate-300 hover:bg-slate-800"
                                        )}
                                    >
                                        {editor.name}
                                        {selectedEditors.includes(editor.name) && (
                                            <span className="ml-2 w-5 h-5 rounded-full bg-white/20 flex items-center justify-center text-xs">
                                                {selectedEditors.indexOf(editor.name) + 1}
                                            </span>
                                        )}
                                    </Button>
                                ))}
                            </div>
                        </CardContent>
                    </Card>

                    {selectedEditors.length >= 2 && comparisonData ? (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            {/* Radar Chart */}
                            <Card className="bg-slate-900/50 border-slate-800/50 backdrop-blur">
                                <CardHeader>
                                    <CardTitle className="text-base font-medium text-slate-200">
                                        Análise Comparativa
                                    </CardTitle>
                                    <CardDescription className="text-slate-500">
                                        Performance relativa em múltiplas dimensões
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="h-[400px]">
                                    <ChartWrapper>
                                        <ResponsiveContainer width="100%" height="100%">
                                            <RadarChart data={radarData}>
                                                <PolarGrid stroke="#334155" />
                                                <PolarAngleAxis dataKey="metric" tick={{ fill: '#94a3b8', fontSize: 12 }} />
                                                <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fill: '#64748b', fontSize: 10 }} />
                                                {comparisonData.editors.map((editor, index) => (
                                                    <Radar
                                                        key={editor.name}
                                                        name={editor.name}
                                                        dataKey={editor.name}
                                                        stroke={COLORS.chart[index]}
                                                        fill={COLORS.chart[index]}
                                                        fillOpacity={0.2}
                                                        strokeWidth={2}
                                                    />
                                                ))}
                                                <Radar
                                                    name="Média Equipe"
                                                    dataKey="Média Equipe"
                                                    stroke="#6b7280"
                                                    fill="#6b7280"
                                                    fillOpacity={0.1}
                                                    strokeWidth={2}
                                                    strokeDasharray="5 5"
                                                />
                                                <Legend />
                                                <Tooltip content={<CustomTooltip />} />
                                            </RadarChart>
                                        </ResponsiveContainer>
                                    </ChartWrapper>
                                </CardContent>
                            </Card>

                            {/* Comparison Table */}
                            <Card className="bg-slate-900/50 border-slate-800/50 backdrop-blur">
                                <CardHeader>
                                    <CardTitle className="text-base font-medium text-slate-200">
                                        Métricas Detalhadas
                                    </CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="space-y-4">
                                        {/* Headers */}
                                        <div className="grid grid-cols-4 gap-4 pb-2 border-b border-slate-700">
                                            <div className="text-sm text-slate-500">Métrica</div>
                                            {comparisonData.editors.map((editor, i) => (
                                                <div key={editor.name} className="text-sm font-medium text-center" style={{ color: COLORS.chart[i] }}>
                                                    {editor.name}
                                                </div>
                                            ))}
                                            <div className="text-sm text-slate-500 text-center">Equipe</div>
                                        </div>

                                        {/* Rows */}
                                        <ComparisonRow
                                            label="Vídeos Entregues"
                                            values={comparisonData.editors.map(e => e.videos)}
                                            teamValue={comparisonData.teamAvg.videos}
                                            format="number"
                                        />
                                        <ComparisonRow
                                            label="Horas Totais"
                                            values={comparisonData.editors.map(e => e.hours)}
                                            teamValue={teamMetrics.totalHours / teamMetrics.activeEditors}
                                            format="hours"
                                        />
                                        <ComparisonRow
                                            label="Eficiência"
                                            values={comparisonData.editors.map(e => e.efficiency)}
                                            teamValue={comparisonData.teamAvg.efficiency}
                                            format="efficiency"
                                            lowerIsBetter
                                        />
                                        <ComparisonRow
                                            label="Lead Time"
                                            values={comparisonData.editors.map(e => e.leadTime)}
                                            teamValue={comparisonData.teamAvg.leadTime}
                                            format="hours"
                                            lowerIsBetter
                                        />
                                        <ComparisonRow
                                            label="Em Andamento"
                                            values={comparisonData.editors.map(e => e.inProgress)}
                                            teamValue={filteredVideos.filter(v => ['IN PROGRESS', 'DOING', 'REVIEW'].includes(v.status)).length / teamMetrics.activeEditors}
                                            format="number"
                                        />
                                    </div>
                                </CardContent>
                            </Card>

                            {/* Individual Cards */}
                            <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-3 gap-4">
                                {comparisonData.editors.map((editor, index) => (
                                    <Card key={editor.name} className="bg-slate-900/50 border-slate-800/50 backdrop-blur overflow-hidden">
                                        <div className="h-1" style={{ backgroundColor: COLORS.chart[index] }} />
                                        <CardContent className="pt-4">
                                            <div className="flex items-center gap-3 mb-4">
                                                <div
                                                    className="w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold text-white"
                                                    style={{ backgroundColor: COLORS.chart[index] }}
                                                >
                                                    {editor.name.charAt(0)}
                                                </div>
                                                <div>
                                                    <p className="font-semibold text-white">{editor.name}</p>
                                                    <p className="text-xs text-slate-500">Performance Individual</p>
                                                </div>
                                            </div>

                                            <div className="space-y-3">
                                                <StatRow
                                                    label="Entregas"
                                                    value={editor.videos}
                                                    comparison={comparisonData.teamAvg.videos}
                                                />
                                                <StatRow
                                                    label="Eficiência"
                                                    value={editor.efficiency}
                                                    comparison={comparisonData.teamAvg.efficiency}
                                                    suffix="h/vídeo"
                                                    lowerIsBetter
                                                />
                                                <StatRow
                                                    label="Lead Time"
                                                    value={editor.leadTime}
                                                    comparison={comparisonData.teamAvg.leadTime}
                                                    suffix="h"
                                                    lowerIsBetter
                                                />
                                            </div>
                                        </CardContent>
                                    </Card>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center py-20 text-slate-500">
                            <GitCompare className="w-16 h-16 mb-4 opacity-50" />
                            <p className="text-lg">Selecione pelo menos 2 editores para comparar</p>
                            <p className="text-sm mt-2">Clique nos nomes acima para selecionar</p>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

// --- COMPONENTS ---

function MetricCard({ title, value, suffix, icon: Icon, color, subtitle }: {
    title: string;
    value: string | number;
    suffix?: string;
    icon: any;
    color: 'blue' | 'violet' | 'emerald' | 'amber' | 'cyan';
    subtitle: string;
}) {
    const colorMap = {
        blue: 'from-blue-500/20 to-blue-500/5 border-blue-500/20 text-blue-500',
        violet: 'from-violet-500/20 to-violet-500/5 border-violet-500/20 text-violet-500',
        emerald: 'from-emerald-500/20 to-emerald-500/5 border-emerald-500/20 text-emerald-500',
        amber: 'from-amber-500/20 to-amber-500/5 border-amber-500/20 text-amber-500',
        cyan: 'from-cyan-500/20 to-cyan-500/5 border-cyan-500/20 text-cyan-500',
    };

    return (
        <Card className={cn("bg-gradient-to-br border backdrop-blur", colorMap[color])}>
            <CardContent className="p-4">
                <div className="flex items-start justify-between">
                    <div>
                        <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-1">{title}</p>
                        <div className="flex items-baseline gap-1">
                            <span className="text-2xl md:text-3xl font-bold text-white">{value}</span>
                            {suffix && <span className="text-sm text-slate-400">{suffix}</span>}
                        </div>
                        <p className="text-xs text-slate-500 mt-1">{subtitle}</p>
                    </div>
                    <Icon className={cn("w-8 h-8 opacity-50", `text-${color}-500`)} />
                </div>
            </CardContent>
        </Card>
    );
}

function EditorCard({ editor, teamAvg, rank, onClick, isSelected }: {
    editor: { name: string; videos: number; hours: number; efficiency: number; leadTime: number; inProgress: number };
    teamAvg: { avgEfficiency: number; avgLeadTime: number };
    rank: number;
    onClick: () => void;
    isSelected: boolean;
}) {
    const efficiencyDiff = ((editor.efficiency - teamAvg.avgEfficiency) / teamAvg.avgEfficiency) * 100;
    const isEfficient = editor.efficiency < teamAvg.avgEfficiency;

    return (
        <Card
            className={cn(
                "bg-slate-900/50 border-slate-800/50 backdrop-blur cursor-pointer transition-all hover:border-slate-700",
                isSelected && "ring-2 ring-blue-500 border-blue-500/50"
            )}
            onClick={onClick}
        >
            <CardContent className="p-4">
                <div className="flex items-center gap-3 mb-3">
                    <div className={cn(
                        "w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold",
                        rank <= 3 ? "bg-gradient-to-br from-amber-400 to-amber-600 text-black" : "bg-slate-700 text-slate-300"
                    )}>
                        {rank}
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="font-medium text-white truncate">{editor.name}</p>
                    </div>
                    {isSelected && <div className="w-2 h-2 rounded-full bg-blue-500" />}
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <p className="text-xs text-slate-500">Entregas</p>
                        <p className="text-lg font-bold text-white">{editor.videos}</p>
                    </div>
                    <div>
                        <p className="text-xs text-slate-500">Em Andamento</p>
                        <p className="text-lg font-bold text-amber-400">{editor.inProgress}</p>
                    </div>
                </div>

                <Separator className="my-3 bg-slate-800" />

                <div className="flex items-center justify-between">
                    <div>
                        <p className="text-xs text-slate-500">Eficiência</p>
                        <p className="text-sm font-medium text-white">{editor.efficiency.toFixed(1)}h/vídeo</p>
                    </div>
                    <Badge
                        variant="outline"
                        className={cn(
                            "text-xs border-0",
                            isEfficient
                                ? "bg-emerald-500/10 text-emerald-400"
                                : "bg-red-500/10 text-red-400"
                        )}
                    >
                        {isEfficient ? <ArrowDown className="w-3 h-3 mr-1" /> : <ArrowUp className="w-3 h-3 mr-1" />}
                        {Math.abs(efficiencyDiff).toFixed(0)}%
                    </Badge>
                </div>
            </CardContent>
        </Card>
    );
}

function ComparisonRow({ label, values, teamValue, format, lowerIsBetter = false }: {
    label: string;
    values: number[];
    teamValue: number;
    format: 'number' | 'hours' | 'efficiency';
    lowerIsBetter?: boolean;
}) {
    const formatValue = (val: number) => {
        if (format === 'hours') return `${val.toFixed(1)}h`;
        if (format === 'efficiency') return `${val.toFixed(1)}h`;
        return val.toFixed(0);
    };

    const bestValue = lowerIsBetter
        ? Math.min(...values.filter(v => v > 0))
        : Math.max(...values);

    return (
        <div className="grid grid-cols-4 gap-4 py-2">
            <div className="text-sm text-slate-400">{label}</div>
            {values.map((value, i) => (
                <div key={i} className={cn(
                    "text-sm font-medium text-center",
                    value === bestValue && value > 0 ? "text-emerald-400" : "text-white"
                )}>
                    {formatValue(value)}
                    {value === bestValue && value > 0 && <span className="ml-1">★</span>}
                </div>
            ))}
            <div className="text-sm text-slate-500 text-center">{formatValue(teamValue)}</div>
        </div>
    );
}

function StatRow({ label, value, comparison, suffix = '', lowerIsBetter = false }: {
    label: string;
    value: number;
    comparison: number;
    suffix?: string;
    lowerIsBetter?: boolean;
}) {
    const diff = ((value - comparison) / comparison) * 100;
    const isPositive = lowerIsBetter ? diff < 0 : diff > 0;

    return (
        <div className="flex items-center justify-between">
            <span className="text-sm text-slate-400">{label}</span>
            <div className="flex items-center gap-2">
                <span className="font-medium text-white">
                    {value.toFixed(1)}{suffix}
                </span>
                {comparison > 0 && (
                    <span className={cn(
                        "text-xs flex items-center",
                        isPositive ? "text-emerald-400" : "text-red-400"
                    )}>
                        {isPositive ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
                        {Math.abs(diff).toFixed(0)}%
                    </span>
                )}
            </div>
        </div>
    );
}

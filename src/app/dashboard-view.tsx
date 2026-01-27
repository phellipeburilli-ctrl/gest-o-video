"use client";

import { useState, useMemo, useEffect } from 'react';
import { DashboardKPIs, NormalizedTask, EditorStats } from '@/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from "@/components/ui/separator";
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
    PieChart, Pie, AreaChart, Area
} from 'recharts';
import {
    Video, Clock, Activity, Trophy, Calendar, Filter, ArrowUpRight, Search, X
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, subDays, isAfter, isBefore } from 'date-fns';

// --- COLORS ---
const COLORS = ['#0ea5e9', '#8b5cf6', '#10b981', '#f59e0b', '#ec4899', '#6366f1'];

interface DashboardViewProps {
    initialData: DashboardKPIs;
    lastUpdated: number;
}

export default function DashboardView({ initialData, lastUpdated }: DashboardViewProps) {
    const [isMounted, setIsMounted] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const [selectedEditor, setSelectedEditor] = useState("all");
    const [timeRange, setTimeRange] = useState("all");

    useEffect(() => {
        setIsMounted(true);
    }, []);

    const ChartWrapper = ({ children }: { children: React.ReactNode }) => {
        if (!isMounted) return <div className="h-full w-full flex items-center justify-center text-slate-500 animate-pulse">Carregando gráfico...</div>;
        return <>{children}</>;
    };

    // --- FILTERING LOGIC ---
    const filteredVideos = useMemo(() => {
        let videos = initialData.editors.flatMap(e => e.videos);

        // 1. Filter by Editor
        if (selectedEditor !== "all") {
            videos = videos.filter(v => v.editorName === selectedEditor);
        }

        // 2. Filter by Search (Title or Status)
        if (searchTerm) {
            const lower = searchTerm.toLowerCase();
            videos = videos.filter(v =>
                v.title.toLowerCase().includes(lower) ||
                v.status.toLowerCase().includes(lower)
            );
        }

        // 3. Filter by Time Range (Based on Date Created)
        const now = new Date();
        if (timeRange === "month") {
            const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
            videos = videos.filter(v => new Date(v.dateCreated).getTime() >= startOfMonth.getTime());
        } else if (timeRange === "quarter") {
            const startOfQuarter = subDays(now, 90); // Rough approximation
            videos = videos.filter(v => new Date(v.dateCreated).getTime() >= startOfQuarter.getTime());
        }

        return videos;
    }, [initialData, selectedEditor, searchTerm, timeRange]);

    // --- RECALCULATE KPIS BASED ON FILTER ---
    const kpis = useMemo(() => {
        const totalVideos = filteredVideos.filter(v => ['COMPLETED', 'CLOSED', 'DONE'].includes(v.status)).length;
        const totalHours = filteredVideos.reduce((acc, v) => acc + v.timeTrackedHours, 0);
        const avgHours = totalVideos > 0 ? totalHours / totalVideos : 0;

        // Group by Editor for Chart
        const editorCounts: Record<string, number> = {};
        filteredVideos.filter(v => ['COMPLETED', 'CLOSED', 'DONE'].includes(v.status)).forEach(v => {
            editorCounts[v.editorName] = (editorCounts[v.editorName] || 0) + 1;
        });

        const chartDataEditors = Object.entries(editorCounts)
            .map(([name, count]) => ({ name, videos: count }))
            .sort((a, b) => b.videos - a.videos);

        // Group by Type for Pie
        const typeCounts: Record<string, number> = {};
        filteredVideos.forEach(v => {
            const type = v.videoType || 'Outros';
            typeCounts[type] = (typeCounts[type] || 0) + 1;
        });
        const chartDataTypes = Object.entries(typeCounts).map(([name, value]) => ({ name, value }));

        // Top Performer
        const topName = chartDataEditors.length > 0 ? chartDataEditors[0].name : "N/A";
        const topCount = chartDataEditors.length > 0 ? chartDataEditors[0].videos : 0;

        return { totalVideos, totalHours, avgHours, topName, topCount, chartDataEditors, chartDataTypes };
    }, [filteredVideos]);


    return (
        <div className="min-h-screen bg-slate-950 text-slate-50 p-6 md:p-10 font-sans selection:bg-cyan-500/30">

            {/* HEADER */}
            <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center mb-8 gap-6">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">
                        Performance Audiovisual
                    </h1>
                    <p className="text-slate-400 mt-1 flex items-center gap-2 text-sm">
                        <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                        Dados atualizados em: {new Date(lastUpdated).toLocaleDateString()} às {new Date(lastUpdated).toLocaleTimeString()}
                    </p>
                </div>

                {/* FILTERS TOOLBAR */}
                <div className="flex flex-col md:flex-row gap-3 w-full xl:w-auto bg-slate-900/50 p-2 rounded-xl border border-slate-800 backdrop-blur-sm">

                    {/* Search */}
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                        <Input
                            placeholder="Buscar tarefa..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-9 w-full md:w-[250px] bg-slate-950 border-slate-800 focus:ring-cyan-500/20"
                        />
                    </div>

                    {/* Editor Filter */}
                    <Select value={selectedEditor} onValueChange={setSelectedEditor}>
                        <SelectTrigger className="w-full md:w-[200px] bg-slate-950 border-slate-800 text-slate-200">
                            <Filter className="mr-2 h-4 w-4 text-slate-500" />
                            <SelectValue placeholder="Editor" />
                        </SelectTrigger>
                        <SelectContent className="bg-slate-900 border-slate-800 text-slate-200">
                            <SelectItem value="all">Todos os Editores</SelectItem>
                            {initialData.editors.map(e => (
                                <SelectItem key={e.editorId} value={e.editorName}>{e.editorName}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    {/* Time Range */}
                    <Select value={timeRange} onValueChange={setTimeRange}>
                        <SelectTrigger className="w-full md:w-[180px] bg-slate-950 border-slate-800 text-slate-200">
                            <Calendar className="mr-2 h-4 w-4 text-slate-500" />
                            <SelectValue placeholder="Período" />
                        </SelectTrigger>
                        <SelectContent className="bg-slate-900 border-slate-800 text-slate-200">
                            <SelectItem value="all">Todo o Período</SelectItem>
                            <SelectItem value="month">Este Mês</SelectItem>
                            <SelectItem value="quarter">Este Trimestre</SelectItem>
                        </SelectContent>
                    </Select>

                    {/* Reset */}
                    {(searchTerm || selectedEditor !== 'all' || timeRange !== 'all') && (
                        <Button variant="ghost" size="icon" onClick={() => { setSearchTerm(""); setSelectedEditor("all"); setTimeRange("all"); }} className="text-slate-400 hover:text-white hover:bg-slate-800">
                            <X className="h-4 w-4" />
                        </Button>
                    )}
                </div>
            </div>

            {/* KPIS (BIG NUMBERS) */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                <KpiCard
                    title="Vídeos Entregues"
                    value={kpis.totalVideos}
                    icon={Video}
                    color="text-cyan-400"
                />
                <KpiCard
                    title="Horas Totais"
                    value={kpis.totalHours.toFixed(1)}
                    suffix="h"
                    icon={Clock}
                    color="text-violet-400"
                />
                <KpiCard
                    title="Eficiência Média"
                    value={kpis.avgHours.toFixed(1)}
                    suffix="h / vídeo"
                    icon={Activity}
                    color="text-emerald-400"
                />
                <KpiCard
                    title="Top Performer"
                    value={kpis.topName}
                    subValue={`${kpis.topCount} vídeos`}
                    icon={Trophy}
                    color="text-amber-400"
                    isHighlight
                />
            </div>

            {/* 1. TIMELINE OVERVIEW (AREA CHART) */}
            <Card className="col-span-1 lg:col-span-3 bg-slate-900/40 border-slate-800/60 backdrop-blur-md shadow-2xl mb-6">
                <CardHeader>
                    <CardTitle className="text-lg font-medium text-slate-200 flex items-center gap-2">
                        <Activity className="w-4 h-4 text-cyan-400" />
                        Performance Temporal
                    </CardTitle>
                    <CardDescription className="text-slate-500">Volume de entregas ao longo do tempo</CardDescription>
                </CardHeader>
                <CardContent className="h-[250px]">
                    <ChartWrapper>
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={chartDataTimeline} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="colorVideos" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                                <XAxis
                                    dataKey="date"
                                    stroke="#475569"
                                    tick={{ fill: '#64748b', fontSize: 10 }}
                                    axisLine={false}
                                    tickLine={false}
                                />
                                <YAxis
                                    stroke="#475569"
                                    tick={{ fill: '#64748b', fontSize: 10 }}
                                    axisLine={false}
                                    tickLine={false}
                                    allowDecimals={false}
                                />
                                <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#334155', strokeWidth: 1, strokeDasharray: '4 4' }} />
                                <Area
                                    type="monotone"
                                    dataKey="count"
                                    name="Entregas"
                                    stroke="#0ea5e9"
                                    strokeWidth={3}
                                    fillOpacity={1}
                                    fill="url(#colorVideos)"
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    </ChartWrapper>
                </CardContent>
            </Card>

            {/* CHARTS ROW */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">

                {/* BAR CHART: VIDEOS PER EDITOR */}
                <Card className="col-span-2 bg-slate-900/40 border-slate-800/60 backdrop-blur-md shadow-xl overflow-hidden relative">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/10 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none"></div>
                    <CardHeader>
                        <CardTitle className="text-lg font-medium text-slate-200">Volume por Editor</CardTitle>
                    </CardHeader>
                    <CardContent className="h-[320px]">
                        <ChartWrapper>
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={kpis.chartDataEditors} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                                    <XAxis
                                        dataKey="name"
                                        stroke="#475569"
                                        tick={{ fill: '#64748b', fontSize: 11 }}
                                        axisLine={false}
                                        tickLine={false}
                                        interval={0}
                                    />
                                    <YAxis
                                        stroke="#475569"
                                        tick={{ fill: '#64748b', fontSize: 11 }}
                                        axisLine={false}
                                        tickLine={false}
                                        allowDecimals={false}
                                    />
                                    <Tooltip content={<CustomTooltip />} cursor={{ fill: '#ffffff', opacity: 0.05 }} />
                                    <Bar dataKey="videos" name="Vídeos" radius={[6, 6, 0, 0]} maxBarSize={50}>
                                        {kpis.chartDataEditors.map((entry, index) => (
                                            <Cell
                                                key={`cell-${index}`}
                                                fill={COLORS[index % COLORS.length]}
                                                className="opacity-80 hover:opacity-100 transition-opacity"
                                            />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </ChartWrapper>
                    </CardContent>
                </Card>

                {/* PIE CHART: TYPES */}
                <Card className="col-span-1 bg-slate-900/40 border-slate-800/60 backdrop-blur-md shadow-xl">
                    <CardHeader>
                        <CardTitle className="text-lg font-medium text-slate-200">Tipos de Vídeo</CardTitle>
                    </CardHeader>
                    <CardContent className="h-[320px] flex justify-center items-center relative">
                        <ChartWrapper>
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={kpis.chartDataTypes}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={70}
                                        outerRadius={90}
                                        paddingAngle={5}
                                        dataKey="value"
                                        nameKey="name"
                                        stroke="none"
                                    >
                                        {kpis.chartDataTypes.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <Tooltip content={<CustomTooltip />} />
                                </PieChart>
                            </ResponsiveContainer>
                        </ChartWrapper>
                        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                            <span className="text-4xl font-bold text-slate-200">{kpis.totalVideos}</span>
                            <span className="text-xs text-slate-500 font-medium tracking-widest uppercase mt-1">Total</span>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* DETAILED TABLE */}
            <Card className="bg-slate-900/50 border-slate-800 backdrop-blur-sm overflow-hidden">
                <CardHeader className="border-b border-slate-800/50 pb-4">
                    <CardTitle className="text-lg font-medium text-slate-200">Detalhamento de Entregas</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    <ScrollArea className="h-[400px]">
                        <table className="w-full text-sm text-left">
                            <thead className="text-xs text-slate-400 uppercase bg-slate-950/80 sticky top-0 z-10 backdrop-blur-md">
                                <tr>
                                    <th className="px-6 py-4 font-medium tracking-wider">Tarefa</th>
                                    <th className="px-6 py-4 font-medium tracking-wider">Editor</th>
                                    <th className="px-6 py-4 font-medium tracking-wider">Status</th>
                                    <th className="px-6 py-4 font-medium text-right tracking-wider">Horas</th>
                                    <th className="px-6 py-4 font-medium text-right tracking-wider">Lead Time</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800">
                                {filteredVideos.map((video) => (
                                    <tr key={video.id} className="hover:bg-slate-800/30 transition-colors group">
                                        <td className="px-6 py-4 font-medium text-slate-200">
                                            <div className="flex items-center gap-3">
                                                <div className={`w-1 h-8 rounded-full flex-shrink-0 ${getStatusColor(video.status)}`}></div>
                                                <span className="line-clamp-2">{video.title}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-slate-400 whitespace-nowrap">
                                            <div className="flex items-center gap-2">
                                                <div className="w-6 h-6 rounded-full bg-slate-800 flex items-center justify-center text-xs font-bold text-slate-500 border border-slate-700">
                                                    {video.editorName.charAt(0)}
                                                </div>
                                                {video.editorName}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <Badge variant="outline" className={`border-0 font-medium ${getStatusBadgeColor(video.status)}`}>
                                                {video.rawStatus}
                                            </Badge>
                                        </td>
                                        <td className="px-6 py-4 text-right text-slate-300 font-mono">
                                            {video.timeTrackedHours > 0 ? video.timeTrackedHours.toFixed(1) : <span className="text-slate-600">-</span>}
                                        </td>
                                        <td className="px-6 py-4 text-right text-slate-400 font-mono text-xs whitespace-nowrap">
                                            {video.dateClosed && video.dateCreated
                                                ? ((video.dateClosed - video.dateCreated) / (1000 * 60 * 60 * 24)).toFixed(1) + 'd'
                                                : '-'}
                                        </td>
                                    </tr>
                                ))}
                                {filteredVideos.length === 0 && (
                                    <tr>
                                        <td colSpan={5} className="text-center py-10 text-slate-500">
                                            Nenhuma tarefa encontrada com os filtros atuais.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </ScrollArea>
                </CardContent>
            </Card>

        </div>
    );
}

// --- SUB COMPONENTS ---

// --- CUSTOM TOOLTIP ---
const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
        return (
            <div className="bg-slate-900/90 border border-slate-700 p-4 rounded-xl shadow-2xl backdrop-blur-xl">
                <p className="font-semibold text-slate-200 mb-2 border-b border-slate-700 pb-2">{label}</p>
                {payload.map((entry: any, index: number) => (
                    <div key={index} className="flex items-center gap-2 mb-1 last:mb-0">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
                        <span className="text-slate-400 text-xs font-medium uppercase tracking-wider">{entry.name}:</span>
                        <span className="text-slate-100 font-bold font-mono">{entry.value}</span>
                    </div>
                ))}
            </div>
        );
    }
    return null;
};

// ... inside main component ...

// --- TEMPORAL DATA FOR AREA CHART ---
const chartDataTimeline = useMemo(() => {
    const timeline: Record<string, number> = {};
    filteredVideos.filter(v => v.dateClosed).forEach(v => {
        const date = new Date(v.dateClosed!);
        const key = date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
        timeline[key] = (timeline[key] || 0) + 1;
    });
    return Object.entries(timeline)
        .sort((a, b) => {
            const [d1, m1] = a[0].split('/').map(Number);
            const [d2, m2] = b[0].split('/').map(Number);
            return new Date(2025, m1 - 1, d1).getTime() - new Date(2025, m2 - 1, d2).getTime(); // Rough sort
        })
        .map(([date, count]) => ({ date, count }));
}, [filteredVideos]);

// ... (inside ChartWrapper area) ...

{/* 1. TIMELINE OVERVIEW (AREA CHART) */ }
<Card className="col-span-1 lg:col-span-3 bg-slate-900/40 border-slate-800/60 backdrop-blur-md shadow-2xl mb-6">
    <CardHeader>
        <CardTitle className="text-lg font-medium text-slate-200 flex items-center gap-2">
            <Activity className="w-4 h-4 text-cyan-400" />
            Performance Temporal
        </CardTitle>
        <CardDescription className="text-slate-500">Volume de entregas ao longo do tempo</CardDescription>
    </CardHeader>
    <CardContent className="h-[250px]">
        <ChartWrapper>
            <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartDataTimeline} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <defs>
                        <linearGradient id="colorVideos" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0} />
                        </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                    <XAxis
                        dataKey="date"
                        stroke="#475569"
                        tick={{ fill: '#64748b', fontSize: 10 }}
                        axisLine={false}
                        tickLine={false}
                    />
                    <YAxis
                        stroke="#475569"
                        tick={{ fill: '#64748b', fontSize: 10 }}
                        axisLine={false}
                        tickLine={false}
                        allowDecimals={false}
                    />
                    <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#334155', strokeWidth: 1, strokeDasharray: '4 4' }} />
                    <Area
                        type="monotone"
                        dataKey="count"
                        name="Entregas"
                        stroke="#0ea5e9"
                        strokeWidth={3}
                        fillOpacity={1}
                        fill="url(#colorVideos)"
                    />
                </AreaChart>
            </ResponsiveContainer>
        </ChartWrapper>
    </CardContent>
</Card>

{/* CHARTS ROW */ }
<div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">

    {/* BAR CHART: VIDEOS PER EDITOR */}
    <Card className="col-span-2 bg-slate-900/40 border-slate-800/60 backdrop-blur-md shadow-xl overflow-hidden relative">
        <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/10 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none"></div>
        <CardHeader>
            <CardTitle className="text-lg font-medium text-slate-200">Volume por Editor</CardTitle>
        </CardHeader>
        <CardContent className="h-[320px]">
            <ChartWrapper>
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={kpis.chartDataEditors} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                        <XAxis
                            dataKey="name"
                            stroke="#475569"
                            tick={{ fill: '#64748b', fontSize: 11 }}
                            axisLine={false}
                            tickLine={false}
                            interval={0}
                        />
                        <YAxis
                            stroke="#475569"
                            tick={{ fill: '#64748b', fontSize: 11 }}
                            axisLine={false}
                            tickLine={false}
                            allowDecimals={false}
                        />
                        <Tooltip content={<CustomTooltip />} cursor={{ fill: '#ffffff', opacity: 0.05 }} />
                        <Bar dataKey="videos" name="Vídeos" radius={[6, 6, 0, 0]} maxBarSize={50}>
                            {kpis.chartDataEditors.map((entry, index) => (
                                <Cell
                                    key={`cell-${index}`}
                                    fill={COLORS[index % COLORS.length]}
                                    className="opacity-80 hover:opacity-100 transition-opacity"
                                />
                            ))}
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            </ChartWrapper>
        </CardContent>
    </Card>

    {/* PIE CHART: TYPES */}
    <Card className="col-span-1 bg-slate-900/40 border-slate-800/60 backdrop-blur-md shadow-xl">
        <CardHeader>
            <CardTitle className="text-lg font-medium text-slate-200">Tipos de Vídeo</CardTitle>
        </CardHeader>
        <CardContent className="h-[320px] flex justify-center items-center relative">
            <ChartWrapper>
                <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                        <Pie
                            data={kpis.chartDataTypes}
                            cx="50%"
                            cy="50%"
                            innerRadius={70}
                            outerRadius={90}
                            paddingAngle={5}
                            dataKey="value"
                            nameKey="name"
                            stroke="none"
                        >
                            {kpis.chartDataTypes.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                            ))}
                        </Pie>
                        <Tooltip content={<CustomTooltip />} />
                    </PieChart>
                </ResponsiveContainer>
            </ChartWrapper>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-4xl font-bold text-slate-200">{kpis.totalVideos}</span>
                <span className="text-xs text-slate-500 font-medium tracking-widest uppercase mt-1">Total</span>
            </div>
        </CardContent>
    </Card>
</div>


function KpiCard({ title, value, subValue, suffix, icon: Icon, color, isHighlight, trend }: any) {
    return (
        <Card className={cn(
            "bg-slate-900/50 border-slate-800 shadow-lg transition-all hover:-translate-y-1 hover:shadow-cyan-500/10",
            isHighlight && "bg-gradient-to-br from-slate-900 to-slate-800 border-amber-500/20"
        )}>
            <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                    <p className="text-sm font-medium text-slate-400 uppercase tracking-wider">{title}</p>
                    <div className={cn("p-2 rounded-lg bg-slate-950", color.replace('text-', 'bg-').replace('400', '950'))}>
                        <Icon className={cn("w-5 h-5", color)} />
                    </div>
                </div>
                <div className="flex items-baseline gap-1">
                    <h3 className="text-3xl font-bold text-white">{value}</h3>
                    {suffix && <span className="text-slate-500 text-sm font-medium">{suffix}</span>}
                </div>
                {subValue && <p className="text-sm text-slate-500 mt-1">{subValue}</p>}
                {trend && (
                    <div className="flex items-center gap-1 mt-2 text-xs font-medium text-emerald-400">
                        <ArrowUpRight className="w-3 h-3" />
                        {trend} <span className="text-slate-500 font-normal">vs mês passado</span>
                    </div>
                )}
            </CardContent>
        </Card>
    )
}


function getStatusColor(status: string) {
    if (['COMPLETED', 'CLOSED', 'DONE'].includes(status)) return 'bg-emerald-500';
    if (['IN PROGRESS', 'DOING'].includes(status)) return 'bg-blue-500';
    if (['REVIEW', 'QA'].includes(status)) return 'bg-amber-500';
    return 'bg-slate-500';
}

function getStatusBadgeColor(status: string) {
    if (['COMPLETED', 'CLOSED', 'DONE'].includes(status)) return 'bg-emerald-500/10 text-emerald-500';
    if (['IN PROGRESS', 'DOING'].includes(status)) return 'bg-blue-500/10 text-blue-500';
    if (['REVIEW', 'QA'].includes(status)) return 'bg-amber-500/10 text-amber-500';
    return 'bg-slate-800 text-slate-400';
}

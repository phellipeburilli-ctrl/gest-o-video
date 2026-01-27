"use client";

import { useState, useMemo, useEffect } from 'react';
import { DashboardKPIs, NormalizedTask, EditorStats } from '@/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
    PieChart, Pie
} from 'recharts';
import {
    Video, Clock, Activity, Trophy, Calendar, Filter, ArrowUpRight, CheckCircle2
} from 'lucide-react';
import { cn } from '@/lib/utils';

// --- COLORS ---
const COLORS = ['#0ea5e9', '#8b5cf6', '#10b981', '#f59e0b', '#ec4899', '#6366f1'];

interface DashboardViewProps {
    initialData: DashboardKPIs;
    lastUpdated: number;
}

export default function DashboardView({ initialData, lastUpdated }: DashboardViewProps) {
    const [timeRange, setTimeRange] = useState("all");
    const [isMounted, setIsMounted] = useState(false);

    useEffect(() => {
        setIsMounted(true);
    }, []);

    // Prevent hydration mismatch for Recharts by only rendering charts after mount
    const ChartWrapper = ({ children }: { children: React.ReactNode }) => {
        if (!isMounted) return <div className="h-full w-full flex items-center justify-center text-slate-500 animate-pulse">Carregando gráfico...</div>;
        return <>{children}</>;
    };

    // TODO: Implement actual date filtering logic here if we had historical data in initialData.videos
    // For now, we display the calculated static snapshot.

    const { totalVideos, totalHours, avgHoursPerVideo, topPerformer, editors, tasksByType, tasksByStatus } = initialData;

    const chartDataEditors = editors.map(e => ({
        name: e.editorName,
        videos: e.totalVideos,
        hours: e.totalHours
    })).sort((a, b) => b.videos - a.videos);

    const chartDataTypes = Object.entries(tasksByType).map(([name, value]) => ({ name, value }));

    return (
        <div className="min-h-screen bg-slate-950 text-slate-50 p-6 md:p-10 font-sans selection:bg-cyan-500/30">

            {/* HEADER */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">
                        Performance Audiovisual
                    </h1>
                    <p className="text-slate-400 mt-1 flex items-center gap-2 text-sm">
                        <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                        Dados atualizados em: {new Date(lastUpdated).toLocaleDateString()} às {new Date(lastUpdated).toLocaleTimeString()}
                    </p>
                </div>

                <div className="flex items-center gap-2">
                    <Select defaultValue={timeRange} onValueChange={setTimeRange}>
                        <SelectTrigger className="w-[180px] bg-slate-900 border-slate-800 text-slate-200">
                            <Calendar className="mr-2 h-4 w-4" />
                            <SelectValue placeholder="Período" />
                        </SelectTrigger>
                        <SelectContent className="bg-slate-900 border-slate-800 text-slate-200">
                            <SelectItem value="all">Todo o Período</SelectItem>
                            <SelectItem value="month">Este Mês</SelectItem>
                            <SelectItem value="quarter">Este Trimestre</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>

            {/* KPIS (BIG NUMBERS) */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                <KpiCard
                    title="Vídeos Entregues"
                    value={totalVideos}
                    icon={Video}
                    color="text-cyan-400"
                    trend="+12%" // Mock trend 
                />
                <KpiCard
                    title="Horas Produzidas"
                    value={totalHours.toFixed(1)}
                    suffix="h"
                    icon={Clock}
                    color="text-violet-400"
                />
                <KpiCard
                    title="Eficiência Média"
                    value={avgHoursPerVideo.toFixed(1)}
                    suffix="h / vídeo"
                    icon={Activity}
                    color="text-emerald-400"
                />
                <KpiCard
                    title="Top Performer"
                    value={topPerformer?.name || "N/A"}
                    subValue={`${topPerformer?.count} vídeos`}
                    icon={Trophy}
                    color="text-amber-400"
                    isHighlight
                />
            </div>

            {/* CHARTS ROW */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">

                {/* BAR CHART: VIDEOS PER EDITOR */}
                <Card className="col-span-2 bg-slate-900/50 border-slate-800 backdrop-blur-sm shadow-xl">
                    <CardHeader>
                        <CardTitle className="text-lg font-medium text-slate-200">Volume por Editor</CardTitle>
                    </CardHeader>
                    <CardContent className="h-[300px]">
                        <ChartWrapper>
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={chartDataEditors} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                                    <XAxis
                                        dataKey="name"
                                        stroke="#94a3b8"
                                        tick={{ fill: '#94a3b8', fontSize: 12 }}
                                        axisLine={false}
                                        tickLine={false}
                                    />
                                    <YAxis
                                        stroke="#94a3b8"
                                        tick={{ fill: '#94a3b8', fontSize: 12 }}
                                        axisLine={false}
                                        tickLine={false}
                                    />
                                    <Tooltip
                                        cursor={{ fill: '#334155', opacity: 0.2 }}
                                        contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', color: '#f8fafc' }}
                                    />
                                    <Bar dataKey="videos" radius={[4, 4, 0, 0]}>
                                        {chartDataEditors.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </ChartWrapper>
                    </CardContent>
                </Card>

                {/* PIE CHART: TYPES */}
                <Card className="col-span-1 bg-slate-900/50 border-slate-800 backdrop-blur-sm shadow-xl">
                    <CardHeader>
                        <CardTitle className="text-lg font-medium text-slate-200">Tipos de Vídeo</CardTitle>
                    </CardHeader>
                    <CardContent className="h-[300px] flex justify-center items-center">
                        <ChartWrapper>
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={chartDataTypes}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={60}
                                        outerRadius={80}
                                        paddingAngle={5}
                                        dataKey="value"
                                    >
                                        {chartDataTypes.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} stroke="none" />
                                        ))}
                                    </Pie>
                                    <Tooltip
                                        contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', color: '#f8fafc' }}
                                    />
                                </PieChart>
                            </ResponsiveContainer>
                        </ChartWrapper>
                        <div className="absolute pointer-events-none flex flex-col items-center justify-center">
                            <span className="text-2xl font-bold">{totalVideos}</span>
                            <span className="text-xs text-slate-500 uppercase">Total</span>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* DETAILED TABLE */}
            <Card className="bg-slate-900/50 border-slate-800 backdrop-blur-sm">
                <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle className="text-lg font-medium text-slate-200">Detalhamento de Entregas</CardTitle>
                    <div className="flex gap-2">
                        {/* Filter placeholders */}
                    </div>
                </CardHeader>
                <CardContent>
                    <ScrollArea className="h-[400px]">
                        <table className="w-full text-sm text-left">
                            <thead className="text-xs text-slate-400 uppercase bg-slate-950/50 sticky top-0">
                                <tr>
                                    <th className="px-4 py-3 font-medium">Tarefa</th>
                                    <th className="px-4 py-3 font-medium">Editor</th>
                                    <th className="px-4 py-3 font-medium">Status</th>
                                    <th className="px-4 py-3 font-medium text-right">Horas</th>
                                    <th className="px-4 py-3 font-medium text-right">Lead Time</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800">
                                {editors.flatMap(e => e.videos).map((video) => (
                                    <tr key={video.id} className="hover:bg-slate-800/30 transition-colors group">
                                        <td className="px-4 py-3 font-medium text-slate-200 flex items-center gap-2">
                                            <div className={`w-1 h-8 rounded-full ${getStatusColor(video.status)}`}></div>
                                            {video.title}
                                        </td>
                                        <td className="px-4 py-3 text-slate-400">
                                            <div className="flex items-center gap-2">
                                                <div className="w-6 h-6 rounded-full bg-slate-800 flex items-center justify-center text-xs font-bold text-slate-500">
                                                    {video.editorName.charAt(0)}
                                                </div>
                                                {video.editorName}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3">
                                            <Badge variant="outline" className={`border-0 ${getStatusBadgeColor(video.status)}`}>
                                                {video.status}
                                            </Badge>
                                        </td>
                                        <td className="px-4 py-3 text-right text-slate-300 font-mono">
                                            {video.timeTrackedHours.toFixed(1)}
                                        </td>
                                        <td className="px-4 py-3 text-right text-slate-400 font-mono text-xs">
                                            {video.dateClosed && video.dateCreated
                                                ? ((video.dateClosed - video.dateCreated) / (1000 * 60 * 60 * 24)).toFixed(1) + 'd'
                                                : '-'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </ScrollArea>
                </CardContent>
            </Card>

        </div>
    );
}

// --- SUB COMPONENTS ---

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

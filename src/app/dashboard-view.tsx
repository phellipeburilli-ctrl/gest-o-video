"use client";

import { useState, useMemo, useEffect } from 'react';
import { DashboardKPIs, NormalizedTask } from '@/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from "@/components/ui/separator";
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
    RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
    Legend, LabelList, PieChart, Pie
} from 'recharts';
import {
    Users, TrendingUp, Target, Award, Clock, Zap, BarChart3, GitCompare,
    ArrowUp, ArrowDown, Calendar, RefreshCw, Timer, ClipboardList, Edit3, RotateCcw, CheckCircle, AlertCircle,
    Lightbulb, AlertTriangle, ThumbsUp, Activity, Crown, UserCheck, Building2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { subDays } from 'date-fns';
import { ALL_TEAMS, Team, TeamMember, isLeader, getMemberById, getTeamByMemberId, getEditorColorByName, COMPLETED_STATUSES, getMemberByName, getTeamByMemberName } from '@/lib/constants';

// Helper para verificar se status é APROVADO ou CONCLUÍDO
function isCompletedStatus(status: string): boolean {
    const statusUpper = status.toUpperCase();
    return COMPLETED_STATUSES.some(s => statusUpper.includes(s));
}

interface DashboardViewProps {
    initialData: DashboardKPIs;
    lastUpdated: number;
}

// --- CUSTOM TOOLTIP ---
function CustomTooltip({ active, payload, label }: any) {
    if (active && payload && payload.length) {
        return (
            <div className="bg-slate-900 border border-slate-700 p-4 rounded-xl shadow-2xl">
                <p className="font-semibold text-white mb-3 pb-2 border-b border-slate-700">{label}</p>
                {payload.map((entry: any, index: number) => (
                    <div key={index} className="flex items-center justify-between gap-6 py-1">
                        <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: entry.color || entry.fill }} />
                            <span className="text-slate-300 text-sm">{entry.name}</span>
                        </div>
                        <span className="font-bold text-white text-sm">
                            {typeof entry.value === 'number' ? entry.value.toFixed(1) : entry.value}
                        </span>
                    </div>
                ))}
            </div>
        );
    }
    return null;
}

// --- EDITOR STATS TYPE ---
interface EditorStat {
    name: string;
    editorId: number;
    videos: number;
    hours: number;
    efficiency: number;
    leadTime: number;
    avgTimeToComplete: number;
    inProgress: number;
    color: string;
    avgEditingTime: number;
    avgRevisionTime: number;
    avgAlterationTime: number;
    totalEditingTime: number;
    totalRevisionTime: number;
    totalAlterationTime: number;
    videosWithRevision: number;
    videosWithAlteration: number;
    revisionRate: number;
    alterationRate: number;
    isLeader: boolean;
    teamId: string;
}

export default function DashboardView({ initialData, lastUpdated }: DashboardViewProps) {
    const [isMounted, setIsMounted] = useState(false);
    const [timeRange, setTimeRange] = useState("all");
    const [selectedTeam, setSelectedTeam] = useState<string>('all');

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

    // --- Encontrar o ID do editor pelo nome (case-insensitive) ---
    const getEditorIdByName = (name: string): number => {
        const member = getMemberByName(name);
        return member?.id || 0;
    };

    // --- EDITOR STATS COM TEAM INFO ---
    const allEditorStats = useMemo(() => {
        const statsMap = new Map<string, EditorStat>();
        const allNames = filteredVideos.map(v => v.editorName);
        const uniqueNames = [...new Set(allNames)];

        filteredVideos.forEach(video => {
            if (!statsMap.has(video.editorName)) {
                const editorId = getEditorIdByName(video.editorName);
                // Busca equipe por ID ou por nome (fallback)
                const team = editorId ? getTeamByMemberId(editorId) : getTeamByMemberName(video.editorName);

                statsMap.set(video.editorName, {
                    name: video.editorName,
                    editorId: editorId,
                    videos: 0,
                    hours: 0,
                    efficiency: 0,
                    leadTime: 0,
                    avgTimeToComplete: 0,
                    inProgress: 0,
                    color: getEditorColorByName(video.editorName), // Usa cor fixa do editor
                    avgEditingTime: 0,
                    avgRevisionTime: 0,
                    avgAlterationTime: 0,
                    totalEditingTime: 0,
                    totalRevisionTime: 0,
                    totalAlterationTime: 0,
                    videosWithRevision: 0,
                    videosWithAlteration: 0,
                    revisionRate: 0,
                    alterationRate: 0,
                    isLeader: isLeader(editorId),
                    teamId: team?.id || 'unknown'
                });
            }

            const stats = statsMap.get(video.editorName)!;

            // Conta apenas tarefas APROVADO ou CONCLUÍDO
            if (isCompletedStatus(video.status)) {
                stats.videos += 1;
                stats.hours += video.timeTrackedHours;

                if (video.dateClosed && video.dateCreated) {
                    const timeToComplete = (video.dateClosed - video.dateCreated) / (1000 * 60 * 60);
                    stats.leadTime += timeToComplete;
                }

                if (video.phaseTime) {
                    stats.totalEditingTime += video.phaseTime.editingTimeMs / (1000 * 60 * 60);
                    stats.totalRevisionTime += video.phaseTime.revisionTimeMs / (1000 * 60 * 60);
                    stats.totalAlterationTime += (video.phaseTime.alterationTimeMs || 0) / (1000 * 60 * 60);
                    if (video.phaseTime.revisionTimeMs > 0) stats.videosWithRevision += 1;
                    if (video.phaseTime.alterationTimeMs && video.phaseTime.alterationTimeMs > 0) stats.videosWithAlteration += 1;
                }
            } else if (['IN PROGRESS', 'DOING', 'REVIEW', 'VIDEO: EDITANDO', 'PARA REVISÃO', 'REVISANDO', 'ALTERAÇÃO'].includes(video.status.toUpperCase())) {
                stats.inProgress += 1;
            }
        });

        return Array.from(statsMap.values()).map(s => ({
            ...s,
            efficiency: s.videos > 0 ? s.hours / s.videos : 0,
            avgTimeToComplete: s.videos > 0 ? s.leadTime / s.videos : 0,
            avgEditingTime: s.videos > 0 ? s.totalEditingTime / s.videos : 0,
            avgRevisionTime: s.videos > 0 ? s.totalRevisionTime / s.videos : 0,
            avgAlterationTime: s.videos > 0 ? s.totalAlterationTime / s.videos : 0,
            revisionRate: s.videos > 0 ? (s.videosWithRevision / s.videos) * 100 : 0,
            alterationRate: s.videos > 0 ? (s.videosWithAlteration / s.videos) * 100 : 0
        })).sort((a, b) => b.videos - a.videos);
    }, [filteredVideos]);

    // --- TEAM SPECIFIC DATA ---
    const teamData = useMemo(() => {
        const teams: Record<string, {
            team: Team;
            editors: EditorStat[];
            leader?: EditorStat;
            teamAvg: {
                videos: number;
                efficiency: number;
                avgEditingTime: number;
                revisionRate: number;
                alterationRate: number;
                leadTime: number;
            };
            totalVideos: number;
            totalHours: number;
        }> = {};

        ALL_TEAMS.forEach(team => {
            const teamEditors = allEditorStats.filter(e => e.teamId === team.id);
            const leader = teamEditors.find(e => e.isLeader);
            const regularEditors = teamEditors.filter(e => !e.isLeader);

            // Calcular média apenas dos editores (não líderes)
            const editorsForAvg = regularEditors.length > 0 ? regularEditors : teamEditors;
            const avgVideos = editorsForAvg.reduce((acc, e) => acc + e.videos, 0) / (editorsForAvg.length || 1);
            const avgEfficiency = editorsForAvg.reduce((acc, e) => acc + e.efficiency, 0) / (editorsForAvg.length || 1);
            const avgEditingTime = editorsForAvg.reduce((acc, e) => acc + e.avgEditingTime, 0) / (editorsForAvg.length || 1);
            const avgRevisionRate = editorsForAvg.reduce((acc, e) => acc + e.revisionRate, 0) / (editorsForAvg.length || 1);
            const avgAlterationRate = editorsForAvg.reduce((acc, e) => acc + e.alterationRate, 0) / (editorsForAvg.length || 1);
            const avgLeadTime = editorsForAvg.reduce((acc, e) => acc + e.avgTimeToComplete, 0) / (editorsForAvg.length || 1);

            teams[team.id] = {
                team,
                editors: teamEditors.sort((a, b) => b.videos - a.videos),
                leader,
                teamAvg: {
                    videos: avgVideos,
                    efficiency: avgEfficiency,
                    avgEditingTime: avgEditingTime,
                    revisionRate: avgRevisionRate,
                    alterationRate: avgAlterationRate,
                    leadTime: avgLeadTime
                },
                totalVideos: teamEditors.reduce((acc, e) => acc + e.videos, 0),
                totalHours: teamEditors.reduce((acc, e) => acc + e.hours, 0)
            };
        });

        return teams;
    }, [allEditorStats]);

    // --- GLOBAL METRICS ---
    const globalMetrics = useMemo(() => {
        const totalVideos = allEditorStats.reduce((acc, e) => acc + e.videos, 0);
        const totalHours = allEditorStats.reduce((acc, e) => acc + e.hours, 0);
        const activeEditors = allEditorStats.filter(e => e.videos > 0).length;

        return {
            totalVideos,
            totalHours,
            avgEfficiency: totalVideos > 0 ? totalHours / totalVideos : 0,
            activeEditors,
            teamsCount: ALL_TEAMS.length
        };
    }, [allEditorStats]);

    // Formatar horas
    const formatHours = (hours: number) => {
        if (hours < 1) return `${(hours * 60).toFixed(0)}min`;
        if (hours < 24) return `${hours.toFixed(1)}h`;
        const days = Math.floor(hours / 24);
        const remainingHours = hours % 24;
        return `${days}d ${remainingHours.toFixed(0)}h`;
    };

    // Calcular score do editor
    const calculateScore = (editor: EditorStat, teamAvg: typeof teamData[string]['teamAvg']) => {
        let score = 50;

        if (editor.videos > teamAvg.videos * 1.2) score += 15;
        else if (editor.videos < teamAvg.videos * 0.7) score -= 10;

        if (editor.avgEditingTime > 0 && editor.avgEditingTime < teamAvg.avgEditingTime * 0.8) score += 10;
        else if (editor.avgEditingTime > teamAvg.avgEditingTime * 1.3) score -= 10;

        // Taxa de Alteração é o indicador de qualidade (retrabalho real)
        if (editor.alterationRate < teamAvg.alterationRate * 0.7) score += 15;
        else if (editor.alterationRate > teamAvg.alterationRate * 1.3) score -= 15;

        if (editor.alterationRate < teamAvg.alterationRate * 0.7) score += 10;
        else if (editor.alterationRate > teamAvg.alterationRate * 1.3) score -= 10;

        return Math.max(0, Math.min(100, score));
    };

    // --- RENDER ---
    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white p-4 md:p-6 lg:p-8">

            {/* HEADER */}
            <header className="mb-6">
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

            {/* TEAM TABS */}
            <div className="flex flex-wrap gap-2 mb-6 bg-slate-800/30 p-2 rounded-xl">
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedTeam('all')}
                    className={cn(
                        "rounded-lg px-4 transition-all gap-2",
                        selectedTeam === 'all'
                            ? "bg-gradient-to-r from-blue-600 to-violet-600 text-white hover:from-blue-700 hover:to-violet-700"
                            : "text-slate-400 hover:text-white hover:bg-slate-700/50"
                    )}
                >
                    <Building2 className="w-4 h-4" />
                    Todas Equipes
                </Button>
                {ALL_TEAMS.map(team => (
                    <Button
                        key={team.id}
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedTeam(team.id)}
                        className={cn(
                            "rounded-lg px-4 transition-all gap-2",
                            selectedTeam === team.id
                                ? "text-white hover:opacity-90"
                                : "text-slate-400 hover:text-white hover:bg-slate-700/50"
                        )}
                        style={{
                            backgroundColor: selectedTeam === team.id ? team.color : undefined
                        }}
                    >
                        <Users className="w-4 h-4" />
                        {team.shortName}
                    </Button>
                ))}
            </div>

            {/* ALL TEAMS VIEW */}
            {selectedTeam === 'all' && (
                <>
                    {/* Global KPIs */}
                    <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
                        <MetricCard
                            title="Total Entregas"
                            value={globalMetrics.totalVideos}
                            icon={Target}
                            color="blue"
                            subtitle="todas as equipes"
                        />
                        <MetricCard
                            title="Horas Totais"
                            value={globalMetrics.totalHours.toFixed(0)}
                            suffix="h"
                            icon={Clock}
                            color="violet"
                            subtitle="tempo registrado"
                        />
                        <MetricCard
                            title="Eficiência Média"
                            value={globalMetrics.avgEfficiency.toFixed(1)}
                            suffix="h/vídeo"
                            icon={Zap}
                            color="emerald"
                            subtitle="geral"
                        />
                        <MetricCard
                            title="Editores Ativos"
                            value={globalMetrics.activeEditors}
                            icon={Users}
                            color="amber"
                            subtitle="com entregas"
                        />
                        <MetricCard
                            title="Equipes"
                            value={globalMetrics.teamsCount}
                            icon={Building2}
                            color="cyan"
                            subtitle="micro equipes"
                        />
                    </div>

                    {/* Teams Overview Cards */}
                    <h2 className="text-lg font-semibold text-slate-200 mb-4 flex items-center gap-2">
                        <BarChart3 className="w-5 h-5 text-blue-500" />
                        Visão por Equipe
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                        {ALL_TEAMS.map(team => {
                            const data = teamData[team.id];
                            if (!data) return null;

                            return (
                                <Card
                                    key={team.id}
                                    className="bg-slate-900/50 border-slate-800/50 backdrop-blur overflow-hidden cursor-pointer hover:ring-2 hover:ring-offset-2 hover:ring-offset-slate-900 transition-all"
                                    style={{ '--tw-ring-color': team.color } as any}
                                    onClick={() => setSelectedTeam(team.id)}
                                >
                                    <CardHeader className="pb-2">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <div
                                                    className="w-3 h-12 rounded-full"
                                                    style={{ backgroundColor: team.color }}
                                                />
                                                <div>
                                                    <CardTitle className="text-lg font-semibold text-white">{team.name}</CardTitle>
                                                    <CardDescription className="text-slate-500">{team.description}</CardDescription>
                                                </div>
                                            </div>
                                            {data.leader && (
                                                <Badge variant="outline" className="bg-amber-500/10 text-amber-400 border-amber-500/20">
                                                    <Crown className="w-3 h-3 mr-1" />
                                                    {data.leader.name.split(' ')[0]}
                                                </Badge>
                                            )}
                                        </div>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="grid grid-cols-4 gap-4 mb-4">
                                            <div className="text-center">
                                                <p className="text-2xl font-bold text-white">{data.totalVideos}</p>
                                                <p className="text-xs text-slate-500">Vídeos</p>
                                            </div>
                                            <div className="text-center">
                                                <p className="text-2xl font-bold text-white">{data.totalHours.toFixed(0)}h</p>
                                                <p className="text-xs text-slate-500">Horas</p>
                                            </div>
                                            <div className="text-center">
                                                <p className="text-2xl font-bold text-white">{data.teamAvg.efficiency.toFixed(1)}h</p>
                                                <p className="text-xs text-slate-500">Eficiência</p>
                                            </div>
                                            <div className="text-center">
                                                <p className="text-2xl font-bold text-white">{data.editors.length}</p>
                                                <p className="text-xs text-slate-500">Membros</p>
                                            </div>
                                        </div>

                                        {/* Mini ranking */}
                                        <div className="space-y-2">
                                            {data.editors.slice(0, 3).map((editor, idx) => (
                                                <div key={editor.name} className="flex items-center justify-between text-sm">
                                                    <div className="flex items-center gap-2">
                                                        <span className={cn(
                                                            "w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold",
                                                            idx === 0 ? "bg-amber-500 text-black" : "bg-slate-700 text-slate-400"
                                                        )}>
                                                            {idx + 1}
                                                        </span>
                                                        <span className="text-slate-300">
                                                            {editor.name.split(' ')[0]}
                                                            {editor.isLeader && <Crown className="w-3 h-3 inline ml-1 text-amber-500" />}
                                                        </span>
                                                    </div>
                                                    <span className="font-bold text-white">{editor.videos} vídeos</span>
                                                </div>
                                            ))}
                                        </div>

                                        <div className="mt-4 pt-4 border-t border-slate-800">
                                            <div className="flex items-center justify-between text-sm">
                                                <span className="text-slate-500">Taxa de Alteração</span>
                                                <Badge
                                                    variant="outline"
                                                    className={cn(
                                                        "border-0",
                                                        data.teamAvg.alterationRate < 20 ? "bg-emerald-500/10 text-emerald-400" :
                                                        data.teamAvg.alterationRate < 40 ? "bg-amber-500/10 text-amber-400" :
                                                        "bg-red-500/10 text-red-400"
                                                    )}
                                                >
                                                    {data.teamAvg.alterationRate.toFixed(0)}%
                                                </Badge>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            );
                        })}
                    </div>

                    {/* Comparison Chart */}
                    <Card className="bg-slate-900/50 border-slate-800/50 backdrop-blur mb-6">
                        <CardHeader>
                            <CardTitle className="text-base font-medium text-slate-200 flex items-center gap-2">
                                <GitCompare className="w-4 h-4 text-blue-500" />
                                Comparativo entre Equipes
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="h-[350px]">
                            <ChartWrapper>
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart
                                        data={ALL_TEAMS.map(team => ({
                                            name: team.shortName,
                                            Vídeos: teamData[team.id]?.totalVideos || 0,
                                            'Eficiência (h)': teamData[team.id]?.teamAvg.efficiency || 0,
                                            color: team.color
                                        }))}
                                        margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
                                    >
                                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                                        <XAxis dataKey="name" stroke="#64748b" tick={{ fill: '#94a3b8', fontSize: 12 }} />
                                        <YAxis stroke="#64748b" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                                        <Tooltip content={<CustomTooltip />} />
                                        <Legend />
                                        <Bar dataKey="Vídeos" radius={[4, 4, 0, 0]}>
                                            {ALL_TEAMS.map((team) => (
                                                <Cell key={team.id} fill={team.color} />
                                            ))}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            </ChartWrapper>
                        </CardContent>
                    </Card>

                    {/* Full Ranking */}
                    <Card className="bg-slate-900/50 border-slate-800/50 backdrop-blur">
                        <CardHeader>
                            <CardTitle className="text-base font-medium text-slate-200 flex items-center gap-2">
                                <Award className="w-4 h-4 text-amber-500" />
                                Ranking Geral de Editores
                            </CardTitle>
                            <CardDescription className="text-slate-500">
                                Todos os editores ordenados por volume de entregas
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="p-0">
                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead className="bg-slate-800/50">
                                        <tr>
                                            <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase">#</th>
                                            <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase">Editor</th>
                                            <th className="text-center px-4 py-3 text-xs font-medium text-slate-400 uppercase">Equipe</th>
                                            <th className="text-center px-4 py-3 text-xs font-medium text-slate-400 uppercase">Vídeos</th>
                                            <th className="text-center px-4 py-3 text-xs font-medium text-slate-400 uppercase">Eficiência</th>
                                            <th className="text-center px-4 py-3 text-xs font-medium text-slate-400 uppercase">Taxa Alteração</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-800/50">
                                        {allEditorStats.map((editor, index) => {
                                            const team = ALL_TEAMS.find(t => t.id === editor.teamId);
                                            return (
                                                <tr key={editor.name} className="hover:bg-slate-800/30">
                                                    <td className="px-4 py-3">
                                                        <span className={cn(
                                                            "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold",
                                                            index === 0 ? "bg-amber-500 text-black" :
                                                            index === 1 ? "bg-slate-300 text-black" :
                                                            index === 2 ? "bg-amber-700 text-white" :
                                                            "bg-slate-700 text-slate-400"
                                                        )}>
                                                            {index + 1}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <div className="flex items-center gap-2">
                                                            <div
                                                                className="w-3 h-3 rounded-full"
                                                                style={{ backgroundColor: editor.color }}
                                                            />
                                                            <span className="text-white font-medium">{editor.name}</span>
                                                            {editor.isLeader && (
                                                                <Crown className="w-4 h-4 text-amber-500" />
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className="text-center px-4 py-3">
                                                        <Badge
                                                            variant="outline"
                                                            className="border-0"
                                                            style={{ backgroundColor: `${team?.color}20`, color: team?.color }}
                                                        >
                                                            {team?.shortName || '-'}
                                                        </Badge>
                                                    </td>
                                                    <td className="text-center px-4 py-3 font-bold text-white">{editor.videos}</td>
                                                    <td className="text-center px-4 py-3 text-slate-300">{editor.efficiency.toFixed(1)}h</td>
                                                    <td className="text-center px-4 py-3">
                                                        <Badge
                                                            variant="outline"
                                                            className={cn(
                                                                "border-0",
                                                                editor.alterationRate < 20 ? "bg-emerald-500/10 text-emerald-400" :
                                                                editor.alterationRate < 40 ? "bg-amber-500/10 text-amber-400" :
                                                                "bg-red-500/10 text-red-400"
                                                            )}
                                                        >
                                                            {editor.alterationRate.toFixed(0)}%
                                                        </Badge>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </CardContent>
                    </Card>
                </>
            )}

            {/* TEAM SPECIFIC VIEW */}
            {selectedTeam !== 'all' && teamData[selectedTeam] && (
                <TeamDetailView
                    teamInfo={teamData[selectedTeam]}
                    formatHours={formatHours}
                    calculateScore={calculateScore}
                    ChartWrapper={ChartWrapper}
                />
            )}
        </div>
    );
}

// ============================================
// TEAM DETAIL VIEW COMPONENT
// ============================================
interface TeamDetailViewProps {
    teamInfo: {
        team: Team;
        editors: EditorStat[];
        leader?: EditorStat;
        teamAvg: {
            videos: number;
            efficiency: number;
            avgEditingTime: number;
            revisionRate: number;
            alterationRate: number;
            leadTime: number;
        };
        totalVideos: number;
        totalHours: number;
    };
    formatHours: (hours: number) => string;
    calculateScore: (editor: EditorStat, teamAvg: any) => number;
    ChartWrapper: ({ children }: { children: React.ReactNode }) => React.ReactElement | null;
}

function TeamDetailView({ teamInfo, formatHours, calculateScore, ChartWrapper }: TeamDetailViewProps) {
    const { team, editors, leader, teamAvg, totalVideos, totalHours } = teamInfo;
    const regularEditors = editors.filter(e => !e.isLeader);

    return (
        <>
            {/* Team Header */}
            <div className="mb-6 p-4 rounded-xl" style={{ backgroundColor: `${team.color}15`, borderLeft: `4px solid ${team.color}` }}>
                <div className="flex items-center justify-between">
                    <div>
                        <h2 className="text-xl font-bold text-white flex items-center gap-2">
                            {team.name}
                            {leader && (
                                <Badge variant="outline" className="bg-amber-500/10 text-amber-400 border-amber-500/20 ml-2">
                                    <Crown className="w-3 h-3 mr-1" />
                                    Líder: {leader.name.split(' ')[0]}
                                </Badge>
                            )}
                        </h2>
                        <p className="text-slate-400 text-sm">{team.description}</p>
                    </div>
                    <div className="text-right">
                        <p className="text-3xl font-bold text-white">{totalVideos}</p>
                        <p className="text-sm text-slate-400">vídeos entregues</p>
                    </div>
                </div>
            </div>

            {/* Team KPIs */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <MetricCard
                    title="Entregas"
                    value={totalVideos}
                    icon={Target}
                    color="blue"
                    subtitle="vídeos concluídos"
                />
                <MetricCard
                    title="Horas Totais"
                    value={totalHours.toFixed(0)}
                    suffix="h"
                    icon={Clock}
                    color="violet"
                    subtitle="tempo registrado"
                />
                <MetricCard
                    title="Eficiência Média"
                    value={teamAvg.efficiency.toFixed(1)}
                    suffix="h/vídeo"
                    icon={Zap}
                    color="emerald"
                    subtitle="dos editores"
                />
                <MetricCard
                    title="Taxa Alteração"
                    value={teamAvg.alterationRate.toFixed(0)}
                    suffix="%"
                    icon={AlertCircle}
                    color="amber"
                    subtitle="retrabalho médio"
                />
            </div>

            {/* Leader Section (if exists) */}
            {leader && (
                <Card className="mb-6 bg-gradient-to-r from-amber-500/10 to-amber-500/5 border-amber-500/20 backdrop-blur">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base font-medium text-amber-400 flex items-center gap-2">
                            <Crown className="w-4 h-4" />
                            Líder da Equipe
                        </CardTitle>
                        <CardDescription className="text-slate-500">
                            Responsável pela gestão e entregas no prazo
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 rounded-full bg-amber-500/20 flex items-center justify-center">
                                    <Crown className="w-6 h-6 text-amber-500" />
                                </div>
                                <div>
                                    <p className="text-lg font-bold text-white">{leader.name}</p>
                                    <p className="text-sm text-slate-400">Edita menos para focar na gestão</p>
                                </div>
                            </div>
                            <div className="grid grid-cols-3 gap-6 text-center">
                                <div>
                                    <p className="text-2xl font-bold text-white">{leader.videos}</p>
                                    <p className="text-xs text-slate-500">Vídeos</p>
                                </div>
                                <div>
                                    <p className="text-2xl font-bold text-white">{leader.hours.toFixed(0)}h</p>
                                    <p className="text-xs text-slate-500">Horas</p>
                                </div>
                                <div>
                                    <p className="text-2xl font-bold text-white">{regularEditors.length}</p>
                                    <p className="text-xs text-slate-500">Editores</p>
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Editors Comparison */}
            <h2 className="text-lg font-semibold text-slate-200 mb-4 flex items-center gap-2">
                <Users className="w-5 h-5" style={{ color: team.color }} />
                Editores da Equipe
            </h2>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-6">
                {/* Bar Chart */}
                <Card className="bg-slate-900/50 border-slate-800/50 backdrop-blur">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base font-medium text-slate-200 flex items-center gap-2">
                            <BarChart3 className="w-4 h-4 text-blue-500" />
                            Volume de Entregas
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="h-[300px]">
                        <ChartWrapper>
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={editors} margin={{ top: 20, right: 30, left: 20, bottom: 40 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                                    <XAxis
                                        dataKey="name"
                                        stroke="#64748b"
                                        tick={{ fill: '#94a3b8', fontSize: 11 }}
                                        tickFormatter={(name) => name.split(' ')[0]}
                                        angle={-20}
                                        textAnchor="end"
                                    />
                                    <YAxis stroke="#64748b" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                                    <Tooltip content={<CustomTooltip />} />
                                    <Bar dataKey="videos" name="Vídeos" radius={[6, 6, 0, 0]} fill={team.color}>
                                        <LabelList dataKey="videos" position="top" fill="#fff" fontSize={12} fontWeight="bold" />
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </ChartWrapper>
                    </CardContent>
                </Card>

                {/* Radar Chart - Comparison */}
                <Card className="bg-slate-900/50 border-slate-800/50 backdrop-blur">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base font-medium text-slate-200 flex items-center gap-2">
                            <GitCompare className="w-4 h-4 text-violet-500" />
                            Comparativo Multidimensional
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="h-[300px]">
                        <ChartWrapper>
                            <ResponsiveContainer width="100%" height="100%">
                                <RadarChart
                                    data={[
                                        {
                                            metric: 'Volume',
                                            ...Object.fromEntries(editors.map(e => [
                                                e.name.split(' ')[0],
                                                teamAvg.videos > 0 ? (e.videos / teamAvg.videos) * 50 : 0
                                            ]))
                                        },
                                        {
                                            metric: 'Velocidade',
                                            ...Object.fromEntries(editors.map(e => [
                                                e.name.split(' ')[0],
                                                teamAvg.avgEditingTime > 0 ? Math.max(0, 100 - (e.avgEditingTime / teamAvg.avgEditingTime) * 50) : 50
                                            ]))
                                        },
                                        {
                                            metric: 'Qualidade',
                                            ...Object.fromEntries(editors.map(e => [
                                                e.name.split(' ')[0],
                                                Math.max(0, 100 - e.alterationRate) // Menos alteração = mais qualidade
                                            ]))
                                        },
                                        {
                                            metric: 'Eficiência',
                                            ...Object.fromEntries(editors.map(e => [
                                                e.name.split(' ')[0],
                                                teamAvg.efficiency > 0 ? Math.max(0, 100 - (e.efficiency / teamAvg.efficiency) * 50) : 50
                                            ]))
                                        }
                                    ]}
                                >
                                    <PolarGrid stroke="#334155" />
                                    <PolarAngleAxis dataKey="metric" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                                    <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fill: '#64748b', fontSize: 10 }} />
                                    {editors.map((editor) => (
                                        <Radar
                                            key={editor.name}
                                            name={editor.name.split(' ')[0]}
                                            dataKey={editor.name.split(' ')[0]}
                                            stroke={editor.color}
                                            fill={editor.color}
                                            fillOpacity={0.2}
                                            strokeWidth={2}
                                        />
                                    ))}
                                    <Legend />
                                </RadarChart>
                            </ResponsiveContainer>
                        </ChartWrapper>
                    </CardContent>
                </Card>
            </div>

            {/* Editor Cards with Analysis */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mb-6">
                {editors.map((editor, index) => {
                    const score = calculateScore(editor, teamAvg);
                    const vsVideos = teamAvg.videos > 0 ? ((editor.videos - teamAvg.videos) / teamAvg.videos) * 100 : 0;
                    const vsEfficiency = teamAvg.efficiency > 0 ? ((editor.efficiency - teamAvg.efficiency) / teamAvg.efficiency) * 100 : 0;
                    const vsAlteration = teamAvg.alterationRate > 0 ? ((editor.alterationRate - teamAvg.alterationRate) / teamAvg.alterationRate) * 100 : 0;

                    const strengths: string[] = [];
                    const improvements: string[] = [];

                    // Volume de entregas
                    if (vsVideos > 15) strengths.push('Alto volume de entregas');
                    else if (vsVideos < -20) improvements.push('Aumentar volume de entregas');

                    // Eficiência (tempo por vídeo) - menor é melhor
                    if (vsEfficiency < -15) strengths.push('Boa eficiência');
                    else if (vsEfficiency > 20) improvements.push('Melhorar eficiência');

                    // Taxa de alteração (retrabalho) - menor é melhor
                    if (editor.alterationRate < 15) strengths.push('Poucos retrabalhos');
                    else if (editor.alterationRate > 35) improvements.push('Reduzir alterações');
                    else if (vsAlteration > 25) improvements.push('Atenção aos retrabalhos');

                    // Tempo de edição - se muito acima da média
                    if (editor.avgEditingTime > 0 && teamAvg.avgEditingTime > 0) {
                        const vsEditTime = ((editor.avgEditingTime - teamAvg.avgEditingTime) / teamAvg.avgEditingTime) * 100;
                        if (vsEditTime < -15) strengths.push('Edição rápida');
                        else if (vsEditTime > 25) improvements.push('Acelerar edição');
                    }

                    // Se não tem nada, adiciona baseado na posição geral
                    if (strengths.length === 0 && improvements.length === 0) {
                        if (editor.videos > 0) {
                            if (score >= 60) strengths.push('Performance consistente');
                            else improvements.push('Buscar mais consistência');
                        }
                    }

                    return (
                        <Card
                            key={editor.name}
                            className={cn(
                                "bg-slate-900/50 border-slate-800/50 backdrop-blur overflow-hidden",
                                editor.isLeader && "ring-1 ring-amber-500/30"
                            )}
                        >
                            <CardHeader className="pb-2">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div
                                            className="w-3 h-10 rounded-full"
                                            style={{ backgroundColor: team.color }}
                                        />
                                        <div>
                                            <CardTitle className="text-base font-medium text-white flex items-center gap-2">
                                                {editor.name}
                                                {editor.isLeader && <Crown className="w-4 h-4 text-amber-500" />}
                                            </CardTitle>
                                            <CardDescription className="text-slate-500">
                                                #{index + 1} na equipe
                                            </CardDescription>
                                        </div>
                                    </div>
                                    {!editor.isLeader && (
                                        <div className={cn(
                                            "w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold",
                                            score >= 70 ? "bg-emerald-500/20 text-emerald-400" :
                                            score >= 50 ? "bg-amber-500/20 text-amber-400" :
                                            "bg-red-500/20 text-red-400"
                                        )}>
                                            {score}
                                        </div>
                                    )}
                                </div>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                {/* Metrics */}
                                <div className="grid grid-cols-2 gap-2 text-sm">
                                    <div className="bg-slate-800/50 rounded-lg p-2">
                                        <p className="text-slate-500 text-xs">Vídeos</p>
                                        <div className="flex items-center gap-1">
                                            <p className="font-bold text-white">{editor.videos}</p>
                                            {!editor.isLeader && (
                                                <Badge variant="outline" className={cn(
                                                    "border-0 text-xs px-1",
                                                    vsVideos > 0 ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"
                                                )}>
                                                    {vsVideos > 0 ? '+' : ''}{vsVideos.toFixed(0)}%
                                                </Badge>
                                            )}
                                        </div>
                                    </div>
                                    <div className="bg-slate-800/50 rounded-lg p-2">
                                        <p className="text-slate-500 text-xs">Eficiência</p>
                                        <p className="font-bold text-white">{editor.efficiency.toFixed(1)}h</p>
                                    </div>
                                    <div className="bg-slate-800/50 rounded-lg p-2">
                                        <p className="text-slate-500 text-xs">Taxa Alteração</p>
                                        <p className={cn(
                                            "font-bold",
                                            editor.alterationRate < 20 ? "text-emerald-400" :
                                            editor.alterationRate < 40 ? "text-amber-400" : "text-red-400"
                                        )}>{editor.alterationRate.toFixed(0)}%</p>
                                    </div>
                                    <div className="bg-slate-800/50 rounded-lg p-2">
                                        <p className="text-slate-500 text-xs">Horas</p>
                                        <p className="font-bold text-white">{editor.hours.toFixed(0)}h</p>
                                    </div>
                                </div>

                                {/* Strengths & Improvements - mostrar para todos */}
                                {(strengths.length > 0 || improvements.length > 0) && (
                                    <>
                                        <Separator className="bg-slate-800" />
                                        <div className="space-y-2">
                                            {strengths.map((s, i) => (
                                                <div key={i} className="flex items-center gap-2 text-xs text-emerald-400">
                                                    <ThumbsUp className="w-3 h-3" />
                                                    {s}
                                                </div>
                                            ))}
                                            {improvements.map((imp, i) => (
                                                <div key={i} className="flex items-center gap-2 text-xs text-amber-400">
                                                    <TrendingUp className="w-3 h-3" />
                                                    {imp}
                                                </div>
                                            ))}
                                        </div>
                                    </>
                                )}
                            </CardContent>
                        </Card>
                    );
                })}
            </div>

            {/* Detailed Table */}
            <Card className="bg-slate-900/50 border-slate-800/50 backdrop-blur">
                <CardHeader className="pb-2">
                    <CardTitle className="text-base font-medium text-slate-200 flex items-center gap-2">
                        <ClipboardList className="w-4 h-4 text-blue-500" />
                        Métricas Detalhadas por Fase
                    </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-slate-800/50">
                                <tr>
                                    <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase">Editor</th>
                                    <th className="text-center px-4 py-3 text-xs font-medium text-slate-400 uppercase">Vídeos</th>
                                    <th className="text-center px-4 py-3 text-xs font-medium text-slate-400 uppercase">Tempo Edição</th>
                                    <th className="text-center px-4 py-3 text-xs font-medium text-slate-400 uppercase">Tempo Revisão</th>
                                    <th className="text-center px-4 py-3 text-xs font-medium text-slate-400 uppercase">Taxa Revisão</th>
                                    <th className="text-center px-4 py-3 text-xs font-medium text-slate-400 uppercase">Taxa Alteração</th>
                                    <th className="text-center px-4 py-3 text-xs font-medium text-slate-400 uppercase">Eficiência</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/50">
                                {editors.map((editor, idx) => (
                                    <tr key={editor.name} className="hover:bg-slate-800/30">
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-2">
                                                <span className="text-white font-medium">{editor.name}</span>
                                                {editor.isLeader && <Crown className="w-4 h-4 text-amber-500" />}
                                            </div>
                                        </td>
                                        <td className="text-center px-4 py-3 font-bold text-white">{editor.videos}</td>
                                        <td className="text-center px-4 py-3 text-blue-400">{formatHours(editor.avgEditingTime)}</td>
                                        <td className="text-center px-4 py-3 text-amber-400">{formatHours(editor.avgRevisionTime)}</td>
                                        <td className="text-center px-4 py-3">
                                            <Badge variant="outline" className={cn(
                                                "border-0",
                                                editor.revisionRate < 30 ? "bg-emerald-500/10 text-emerald-400" :
                                                editor.revisionRate < 60 ? "bg-amber-500/10 text-amber-400" :
                                                "bg-red-500/10 text-red-400"
                                            )}>
                                                {editor.revisionRate.toFixed(0)}%
                                            </Badge>
                                        </td>
                                        <td className="text-center px-4 py-3">
                                            <Badge variant="outline" className={cn(
                                                "border-0",
                                                editor.alterationRate < 30 ? "bg-emerald-500/10 text-emerald-400" :
                                                editor.alterationRate < 60 ? "bg-orange-500/10 text-orange-400" :
                                                "bg-red-500/10 text-red-400"
                                            )}>
                                                {editor.alterationRate.toFixed(0)}%
                                            </Badge>
                                        </td>
                                        <td className="text-center px-4 py-3 text-slate-300">{editor.efficiency.toFixed(1)}h/vídeo</td>
                                    </tr>
                                ))}
                                {/* Team Average Row */}
                                <tr className="bg-slate-800/30 font-medium">
                                    <td className="px-4 py-3 text-slate-300">Média da Equipe</td>
                                    <td className="text-center px-4 py-3 text-slate-300">{teamAvg.videos.toFixed(1)}</td>
                                    <td className="text-center px-4 py-3 text-slate-300">{formatHours(teamAvg.avgEditingTime)}</td>
                                    <td className="text-center px-4 py-3 text-slate-300">-</td>
                                    <td className="text-center px-4 py-3 text-slate-300">{teamAvg.revisionRate.toFixed(0)}%</td>
                                    <td className="text-center px-4 py-3 text-slate-300">{teamAvg.alterationRate.toFixed(0)}%</td>
                                    <td className="text-center px-4 py-3 text-slate-300">{teamAvg.efficiency.toFixed(1)}h/vídeo</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>
        </>
    );
}

// ============================================
// METRIC CARD COMPONENT
// ============================================
function MetricCard({ title, value, suffix, icon: Icon, color, subtitle }: {
    title: string;
    value: string | number;
    suffix?: string;
    icon: any;
    color: 'blue' | 'violet' | 'emerald' | 'amber' | 'cyan';
    subtitle: string;
}) {
    const colorMap = {
        blue: 'from-blue-500/20 to-blue-500/5 border-blue-500/20',
        violet: 'from-violet-500/20 to-violet-500/5 border-violet-500/20',
        emerald: 'from-emerald-500/20 to-emerald-500/5 border-emerald-500/20',
        amber: 'from-amber-500/20 to-amber-500/5 border-amber-500/20',
        cyan: 'from-cyan-500/20 to-cyan-500/5 border-cyan-500/20',
    };

    const iconColorMap = {
        blue: 'text-blue-500',
        violet: 'text-violet-500',
        emerald: 'text-emerald-500',
        amber: 'text-amber-500',
        cyan: 'text-cyan-500',
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
                    <Icon className={cn("w-8 h-8 opacity-50", iconColorMap[color])} />
                </div>
            </CardContent>
        </Card>
    );
}

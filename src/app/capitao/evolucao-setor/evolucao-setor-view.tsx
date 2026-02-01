'use client';

import { useMemo } from 'react';
import { NormalizedTask } from '@/types';
import { ALL_TEAMS, getTeamByMemberName } from '@/lib/constants';
import {
    TrendingUp,
    TrendingDown,
    BarChart3,
    Clock,
    Video,
    Target,
    ArrowUp,
    ArrowDown,
    Minus,
    Calendar
} from 'lucide-react';

interface EvolucaoSetorViewProps {
    allVideos: NormalizedTask[];
    lastUpdated: number;
}

interface WeeklyData {
    weekStart: Date;
    weekLabel: string;
    totalVideos: number;
    completedVideos: number;
    alterationRate: number;
    avgEditingTime: number; // em horas
}

export function EvolucaoSetorView({ allVideos, lastUpdated }: EvolucaoSetorViewProps) {
    // Calculate weekly data for the last 8 weeks
    const weeklyData = useMemo(() => {
        const weeks: WeeklyData[] = [];
        const now = new Date();

        // Start from 8 weeks ago (week starts on Monday)
        for (let i = 7; i >= 0; i--) {
            const weekStart = new Date(now);
            const dayOfWeek = now.getDay();
            const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
            weekStart.setDate(now.getDate() - diffToMonday - (i * 7));
            weekStart.setHours(0, 0, 0, 0);

            const weekEnd = new Date(weekStart);
            weekEnd.setDate(weekEnd.getDate() + 7);

            // Filter videos for this week
            const weekVideos = allVideos.filter(v => {
                const date = v.dateClosed || v.dateCreated;
                return date >= weekStart.getTime() && date < weekEnd.getTime();
            });

            const completedVideos = weekVideos.filter(v => v.status === 'COMPLETED');
            const videosWithPhase = completedVideos.filter(v => v.phaseTime);
            const videosWithAlteration = videosWithPhase.filter(v =>
                v.phaseTime?.alterationTimeMs && v.phaseTime.alterationTimeMs > 0
            );

            const alterationRate = videosWithPhase.length > 0
                ? (videosWithAlteration.length / videosWithPhase.length) * 100
                : 0;

            // Calculate average editing time
            const editingTimes = completedVideos
                .filter(v => v.phaseTime?.editingTimeMs)
                .map(v => v.phaseTime!.editingTimeMs!);
            const avgEditingTime = editingTimes.length > 0
                ? editingTimes.reduce((a, b) => a + b, 0) / editingTimes.length / (1000 * 60 * 60)
                : 0;

            weeks.push({
                weekStart,
                weekLabel: `${weekStart.getDate()}/${weekStart.getMonth() + 1}`,
                totalVideos: weekVideos.length,
                completedVideos: completedVideos.length,
                alterationRate: parseFloat(alterationRate.toFixed(1)),
                avgEditingTime: parseFloat(avgEditingTime.toFixed(1))
            });
        }

        return weeks;
    }, [allVideos]);

    // Current week vs last week comparison
    const currentWeek = weeklyData[weeklyData.length - 1];
    const lastWeek = weeklyData[weeklyData.length - 2];

    const volumeVariation = lastWeek && lastWeek.completedVideos > 0
        ? ((currentWeek.completedVideos - lastWeek.completedVideos) / lastWeek.completedVideos * 100)
        : 0;

    const alterationVariation = lastWeek && lastWeek.alterationRate > 0
        ? currentWeek.alterationRate - lastWeek.alterationRate
        : 0;

    const editingTimeVariation = lastWeek && lastWeek.avgEditingTime > 0
        ? ((currentWeek.avgEditingTime - lastWeek.avgEditingTime) / lastWeek.avgEditingTime * 100)
        : 0;

    // Max values for bar chart scaling
    const maxVideos = Math.max(...weeklyData.map(w => w.completedVideos), 1);
    const maxAlteration = Math.max(...weeklyData.map(w => w.alterationRate), 35);
    const maxEditingTime = Math.max(...weeklyData.map(w => w.avgEditingTime), 1);

    // Calculate monthly aggregates
    const monthlyData = useMemo(() => {
        const now = new Date();
        const months: { name: string; videos: number; alterationRate: number }[] = [];

        for (let i = 2; i >= 0; i--) {
            const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
            const monthName = monthStart.toLocaleString('pt-BR', { month: 'short' }).replace('.', '');

            const monthVideos = allVideos.filter(v => {
                const date = v.dateClosed || v.dateCreated;
                return date >= monthStart.getTime() && date <= monthEnd.getTime() && v.status === 'COMPLETED';
            });

            const videosWithPhase = monthVideos.filter(v => v.phaseTime);
            const videosWithAlteration = videosWithPhase.filter(v =>
                v.phaseTime?.alterationTimeMs && v.phaseTime.alterationTimeMs > 0
            );
            const alterationRate = videosWithPhase.length > 0
                ? (videosWithAlteration.length / videosWithPhase.length) * 100
                : 0;

            months.push({
                name: monthName.charAt(0).toUpperCase() + monthName.slice(1),
                videos: monthVideos.length,
                alterationRate: parseFloat(alterationRate.toFixed(1))
            });
        }

        return months;
    }, [allVideos]);

    // Helper to get trend icon
    const getTrendIcon = (value: number, inverted = false) => {
        const isPositive = inverted ? value < 0 : value > 0;
        if (Math.abs(value) < 1) return <Minus className="w-4 h-4 text-gray-400" />;
        if (isPositive) return <ArrowUp className="w-4 h-4 text-green-400" />;
        return <ArrowDown className="w-4 h-4 text-red-400" />;
    };

    const getTrendColor = (value: number, inverted = false) => {
        const isPositive = inverted ? value < 0 : value > 0;
        if (Math.abs(value) < 1) return 'text-gray-400';
        return isPositive ? 'text-green-400' : 'text-red-400';
    };

    return (
        <div className="p-8 space-y-8">
            {/* Header */}
            <div className="flex justify-between items-start">
                <div>
                    <h1 className="text-3xl font-bold text-white flex items-center gap-3">
                        <BarChart3 className="w-8 h-8 text-purple-400" />
                        Evolução do Setor
                    </h1>
                    <p className="text-gray-400 mt-1">
                        Tendências e comparativos ao longo do tempo
                    </p>
                </div>
                <div className="text-right">
                    <div className="text-sm text-gray-500">Dados atualizados em</div>
                    <div className="text-lg text-purple-400">
                        {new Date(lastUpdated).toLocaleString('pt-BR')}
                    </div>
                </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-4 gap-6">
                {/* Volume */}
                <div className="bg-[#12121a] border border-purple-900/30 rounded-xl p-6">
                    <div className="flex items-center justify-between mb-2">
                        <Video className="w-5 h-5 text-purple-400" />
                        <div className={`flex items-center gap-1 ${getTrendColor(volumeVariation)}`}>
                            {getTrendIcon(volumeVariation)}
                            <span className="text-sm font-medium">
                                {volumeVariation > 0 ? '+' : ''}{volumeVariation.toFixed(0)}%
                            </span>
                        </div>
                    </div>
                    <p className="text-gray-400 text-sm">Esta Semana</p>
                    <p className="text-3xl font-bold text-white">{currentWeek?.completedVideos || 0}</p>
                    <p className="text-gray-500 text-xs mt-1">
                        vs {lastWeek?.completedVideos || 0} semana passada
                    </p>
                </div>

                {/* Alteration Rate */}
                <div className="bg-[#12121a] border border-purple-900/30 rounded-xl p-6">
                    <div className="flex items-center justify-between mb-2">
                        <Target className="w-5 h-5 text-amber-400" />
                        <div className={`flex items-center gap-1 ${getTrendColor(alterationVariation, true)}`}>
                            {getTrendIcon(alterationVariation, true)}
                            <span className="text-sm font-medium">
                                {alterationVariation > 0 ? '+' : ''}{alterationVariation.toFixed(1)}%
                            </span>
                        </div>
                    </div>
                    <p className="text-gray-400 text-sm">Taxa Alteração</p>
                    <p className={`text-3xl font-bold ${
                        currentWeek?.alterationRate < 20 ? 'text-green-400' :
                        currentWeek?.alterationRate < 35 ? 'text-amber-400' : 'text-red-400'
                    }`}>
                        {currentWeek?.alterationRate || 0}%
                    </p>
                    <p className="text-gray-500 text-xs mt-1">
                        vs {lastWeek?.alterationRate || 0}% semana passada
                    </p>
                </div>

                {/* Avg Editing Time */}
                <div className="bg-[#12121a] border border-purple-900/30 rounded-xl p-6">
                    <div className="flex items-center justify-between mb-2">
                        <Clock className="w-5 h-5 text-blue-400" />
                        <div className={`flex items-center gap-1 ${getTrendColor(editingTimeVariation, true)}`}>
                            {getTrendIcon(editingTimeVariation, true)}
                            <span className="text-sm font-medium">
                                {editingTimeVariation > 0 ? '+' : ''}{editingTimeVariation.toFixed(0)}%
                            </span>
                        </div>
                    </div>
                    <p className="text-gray-400 text-sm">Tempo Médio Edição</p>
                    <p className="text-3xl font-bold text-white">
                        {currentWeek?.avgEditingTime.toFixed(1) || 0}h
                    </p>
                    <p className="text-gray-500 text-xs mt-1">
                        vs {lastWeek?.avgEditingTime.toFixed(1) || 0}h semana passada
                    </p>
                </div>

                {/* 8 Week Trend */}
                <div className="bg-[#12121a] border border-purple-900/30 rounded-xl p-6">
                    <div className="flex items-center justify-between mb-2">
                        <TrendingUp className="w-5 h-5 text-green-400" />
                    </div>
                    <p className="text-gray-400 text-sm">Total 8 Semanas</p>
                    <p className="text-3xl font-bold text-white">
                        {weeklyData.reduce((acc, w) => acc + w.completedVideos, 0)}
                    </p>
                    <p className="text-gray-500 text-xs mt-1">
                        Média: {(weeklyData.reduce((acc, w) => acc + w.completedVideos, 0) / 8).toFixed(0)} por semana
                    </p>
                </div>
            </div>

            {/* Weekly Charts */}
            <div className="grid grid-cols-2 gap-6">
                {/* Volume Chart */}
                <div className="bg-[#12121a] border border-purple-900/30 rounded-xl p-6">
                    <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                        <Video className="w-5 h-5 text-purple-400" />
                        Volume de Entregas por Semana
                    </h2>
                    <div className="flex items-end gap-2 h-40">
                        {weeklyData.map((week, idx) => (
                            <div key={idx} className="flex-1 flex flex-col items-center">
                                <div
                                    className={`w-full rounded-t transition-all ${
                                        idx === weeklyData.length - 1 ? 'bg-purple-500' : 'bg-purple-600/40'
                                    }`}
                                    style={{ height: `${(week.completedVideos / maxVideos) * 100}%`, minHeight: 4 }}
                                />
                                <span className="text-xs text-gray-500 mt-2">{week.weekLabel}</span>
                                <span className="text-xs text-white font-medium">{week.completedVideos}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Alteration Rate Chart */}
                <div className="bg-[#12121a] border border-purple-900/30 rounded-xl p-6">
                    <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                        <Target className="w-5 h-5 text-amber-400" />
                        Taxa de Alteração por Semana
                    </h2>
                    <div className="relative">
                        {/* Meta line at 35% */}
                        <div
                            className="absolute w-full border-t-2 border-dashed border-red-500/50"
                            style={{ bottom: `${(35 / maxAlteration) * 100}%` }}
                        >
                            <span className="absolute right-0 -top-5 text-xs text-red-400">Meta: 35%</span>
                        </div>

                        <div className="flex items-end gap-2 h-40">
                            {weeklyData.map((week, idx) => {
                                const barColor = week.alterationRate < 20
                                    ? 'bg-green-500'
                                    : week.alterationRate < 35
                                        ? 'bg-amber-500'
                                        : 'bg-red-500';

                                return (
                                    <div key={idx} className="flex-1 flex flex-col items-center">
                                        <div
                                            className={`w-full rounded-t transition-all ${
                                                idx === weeklyData.length - 1 ? barColor : `${barColor}/60`
                                            }`}
                                            style={{ height: `${(week.alterationRate / maxAlteration) * 100}%`, minHeight: 4 }}
                                        />
                                        <span className="text-xs text-gray-500 mt-2">{week.weekLabel}</span>
                                        <span className={`text-xs font-medium ${
                                            week.alterationRate < 20 ? 'text-green-400' :
                                            week.alterationRate < 35 ? 'text-amber-400' : 'text-red-400'
                                        }`}>
                                            {week.alterationRate}%
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>

            {/* Editing Time Chart */}
            <div className="bg-[#12121a] border border-purple-900/30 rounded-xl p-6">
                <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                    <Clock className="w-5 h-5 text-blue-400" />
                    Tempo Médio de Edição por Semana (horas)
                </h2>
                <div className="flex items-end gap-3 h-32">
                    {weeklyData.map((week, idx) => (
                        <div key={idx} className="flex-1 flex flex-col items-center">
                            <div
                                className={`w-full rounded-t transition-all ${
                                    idx === weeklyData.length - 1 ? 'bg-blue-500' : 'bg-blue-600/40'
                                }`}
                                style={{ height: `${(week.avgEditingTime / maxEditingTime) * 100}%`, minHeight: 4 }}
                            />
                            <span className="text-xs text-gray-500 mt-2">{week.weekLabel}</span>
                            <span className="text-xs text-white font-medium">{week.avgEditingTime}h</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Monthly Comparison */}
            <div className="bg-[#12121a] border border-purple-900/30 rounded-xl p-6">
                <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                    <Calendar className="w-5 h-5 text-green-400" />
                    Comparativo Mensal (Últimos 3 meses)
                </h2>
                <div className="grid grid-cols-3 gap-6">
                    {monthlyData.map((month, idx) => {
                        const isCurrentMonth = idx === monthlyData.length - 1;
                        const prevMonth = monthlyData[idx - 1];
                        const volumeChange = prevMonth && prevMonth.videos > 0
                            ? ((month.videos - prevMonth.videos) / prevMonth.videos * 100)
                            : 0;
                        const alterationChange = prevMonth
                            ? month.alterationRate - prevMonth.alterationRate
                            : 0;

                        return (
                            <div
                                key={month.name}
                                className={`p-4 rounded-lg border ${
                                    isCurrentMonth
                                        ? 'bg-purple-600/20 border-purple-500/50'
                                        : 'bg-[#0a0a0f] border-purple-900/30'
                                }`}
                            >
                                <h3 className={`text-lg font-bold mb-3 ${isCurrentMonth ? 'text-purple-300' : 'text-gray-300'}`}>
                                    {month.name}
                                    {isCurrentMonth && <span className="text-xs ml-2 text-purple-400">(Atual)</span>}
                                </h3>

                                <div className="space-y-3">
                                    <div className="flex justify-between items-center">
                                        <span className="text-gray-400 text-sm">Vídeos</span>
                                        <div className="flex items-center gap-2">
                                            <span className="text-white font-bold">{month.videos}</span>
                                            {idx > 0 && (
                                                <span className={`text-xs ${getTrendColor(volumeChange)}`}>
                                                    {volumeChange > 0 ? '+' : ''}{volumeChange.toFixed(0)}%
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    <div className="flex justify-between items-center">
                                        <span className="text-gray-400 text-sm">Taxa Alteração</span>
                                        <div className="flex items-center gap-2">
                                            <span className={`font-bold ${
                                                month.alterationRate < 20 ? 'text-green-400' :
                                                month.alterationRate < 35 ? 'text-amber-400' : 'text-red-400'
                                            }`}>
                                                {month.alterationRate}%
                                            </span>
                                            {idx > 0 && (
                                                <span className={`text-xs ${getTrendColor(alterationChange, true)}`}>
                                                    {alterationChange > 0 ? '+' : ''}{alterationChange.toFixed(1)}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Analysis Summary */}
            <div className="bg-purple-600/10 border border-purple-500/30 rounded-xl p-6">
                <h2 className="text-lg font-semibold text-purple-300 mb-4">
                    Análise Automática
                </h2>
                <div className="space-y-3 text-sm">
                    {/* Volume trend */}
                    {(() => {
                        const totalFirstHalf = weeklyData.slice(0, 4).reduce((a, w) => a + w.completedVideos, 0);
                        const totalSecondHalf = weeklyData.slice(4).reduce((a, w) => a + w.completedVideos, 0);
                        const trend = totalSecondHalf > totalFirstHalf ? 'crescente' : totalSecondHalf < totalFirstHalf ? 'decrescente' : 'estável';

                        return (
                            <p className="flex items-center gap-2">
                                {trend === 'crescente' ? (
                                    <TrendingUp className="w-4 h-4 text-green-400" />
                                ) : trend === 'decrescente' ? (
                                    <TrendingDown className="w-4 h-4 text-red-400" />
                                ) : (
                                    <Minus className="w-4 h-4 text-gray-400" />
                                )}
                                <span className="text-gray-300">
                                    <strong>Volume:</strong> Tendência {trend} nas últimas 8 semanas
                                    ({totalFirstHalf} vídeos nas primeiras 4 semanas vs {totalSecondHalf} nas últimas 4)
                                </span>
                            </p>
                        );
                    })()}

                    {/* Alteration trend */}
                    {(() => {
                        const avgFirst = weeklyData.slice(0, 4).reduce((a, w) => a + w.alterationRate, 0) / 4;
                        const avgSecond = weeklyData.slice(4).reduce((a, w) => a + w.alterationRate, 0) / 4;
                        const trend = avgSecond < avgFirst ? 'melhorando' : avgSecond > avgFirst ? 'piorando' : 'estável';

                        return (
                            <p className="flex items-center gap-2">
                                {trend === 'melhorando' ? (
                                    <TrendingDown className="w-4 h-4 text-green-400" />
                                ) : trend === 'piorando' ? (
                                    <TrendingUp className="w-4 h-4 text-red-400" />
                                ) : (
                                    <Minus className="w-4 h-4 text-gray-400" />
                                )}
                                <span className="text-gray-300">
                                    <strong>Qualidade:</strong> Taxa de alteração {trend}
                                    ({avgFirst.toFixed(1)}% média primeiras 4 semanas vs {avgSecond.toFixed(1)}% últimas 4)
                                </span>
                            </p>
                        );
                    })()}

                    {/* Current status */}
                    <p className="flex items-center gap-2 mt-4 pt-4 border-t border-purple-500/30">
                        <Target className="w-4 h-4 text-purple-400" />
                        <span className="text-gray-300">
                            <strong>Status Atual:</strong> {
                                currentWeek?.alterationRate < 20
                                    ? 'Setor em excelente performance!'
                                    : currentWeek?.alterationRate < 35
                                        ? 'Setor dentro da meta, mas com pontos de atenção.'
                                        : 'Setor acima da meta de alteração - ação necessária.'
                            }
                        </span>
                    </p>
                </div>
            </div>
        </div>
    );
}

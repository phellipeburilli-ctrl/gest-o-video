'use client';

import { useMemo, useState } from 'react';
import { NormalizedTask } from '@/types';
import { getTeamByMemberName } from '@/lib/constants';
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
    Users,
    AlertTriangle
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
    avgEditingTime: number;
}

interface EditorData {
    id: string;
    name: string;
    initials: string;
    teamColor: string;
    totalVideos: number;
    videosWithAlteration: number;
    alterationRate: number;
    weeklyData: WeeklyData[];
}

function getInitials(name: string): string {
    return name
        .split(' ')
        .map(n => n[0])
        .join('')
        .substring(0, 2)
        .toUpperCase();
}

export function EvolucaoSetorView({ allVideos, lastUpdated }: EvolucaoSetorViewProps) {
    const [selectedEditorId, setSelectedEditorId] = useState<string | null>(null);

    // Calculate weekly data for the last 8 weeks (SETOR GERAL)
    const weeklyData = useMemo(() => {
        const weeks: WeeklyData[] = [];
        const now = new Date();

        for (let i = 7; i >= 0; i--) {
            const weekStart = new Date(now);
            const dayOfWeek = now.getDay();
            const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
            weekStart.setDate(now.getDate() - diffToMonday - (i * 7));
            weekStart.setHours(0, 0, 0, 0);

            const weekEnd = new Date(weekStart);
            weekEnd.setDate(weekEnd.getDate() + 7);

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

    // Calculate editor data
    const editorsData: EditorData[] = useMemo(() => {
        const editorMap = new Map<string, EditorData>();
        const now = new Date();

        allVideos.forEach(video => {
            if (!video.editorName) return;

            if (!editorMap.has(video.editorName)) {
                const team = getTeamByMemberName(video.editorName);
                editorMap.set(video.editorName, {
                    id: video.editorName,
                    name: video.editorName,
                    initials: getInitials(video.editorName),
                    teamColor: team?.color || '#6B7280',
                    totalVideos: 0,
                    videosWithAlteration: 0,
                    alterationRate: 0,
                    weeklyData: []
                });
            }
        });

        editorMap.forEach((editor, editorName) => {
            const editorVideos = allVideos.filter(v => v.editorName === editorName);
            const weeks: WeeklyData[] = [];

            for (let i = 7; i >= 0; i--) {
                const weekStart = new Date(now);
                const dayOfWeek = now.getDay();
                const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
                weekStart.setDate(now.getDate() - diffToMonday - (i * 7));
                weekStart.setHours(0, 0, 0, 0);

                const weekEnd = new Date(weekStart);
                weekEnd.setDate(weekEnd.getDate() + 7);

                const weekVideos = editorVideos.filter(v => {
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

            const completedVideos = editorVideos.filter(v => v.status === 'COMPLETED');
            const videosWithPhase = completedVideos.filter(v => v.phaseTime);
            const videosWithAlteration = videosWithPhase.filter(v =>
                v.phaseTime?.alterationTimeMs && v.phaseTime.alterationTimeMs > 0
            );
            const totalAlterationRate = videosWithPhase.length > 0
                ? (videosWithAlteration.length / videosWithPhase.length) * 100
                : 0;

            editor.totalVideos = completedVideos.length;
            editor.videosWithAlteration = videosWithAlteration.length;
            editor.alterationRate = parseFloat(totalAlterationRate.toFixed(1));
            editor.weeklyData = weeks;
        });

        return Array.from(editorMap.values())
            .filter(e => e.totalVideos > 0)
            .sort((a, b) => b.alterationRate - a.alterationRate);
    }, [allVideos]);

    const selectedEditor = selectedEditorId
        ? editorsData.find(e => e.id === selectedEditorId)
        : null;

    const displayData = selectedEditor?.weeklyData || weeklyData;

    // Stats
    const currentWeek = displayData[displayData.length - 1];
    const lastWeek = displayData[displayData.length - 2];

    const totalVideos8Weeks = displayData.reduce((acc, w) => acc + w.completedVideos, 0);
    const totalAlterations = editorsData.reduce((acc, e) => acc + e.videosWithAlteration, 0);
    const overallRate = totalVideos8Weeks > 0
        ? (totalAlterations / totalVideos8Weeks * 100).toFixed(0)
        : 0;

    // Max values for scaling
    const maxVideos = Math.max(...displayData.map(w => w.completedVideos), 1);
    const maxAlteration = Math.max(...displayData.map(w => w.alterationRate), 35);

    const getTrendIcon = (value: number, inverted = false) => {
        const isPositive = inverted ? value < 0 : value > 0;
        if (Math.abs(value) < 1) return <Minus className="w-3 h-3 text-gray-400" />;
        if (isPositive) return <ArrowUp className="w-3 h-3 text-green-400" />;
        return <ArrowDown className="w-3 h-3 text-red-400" />;
    };

    return (
        <div className="p-6">
            {/* Header compacto */}
            <div className="flex justify-between items-start mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                        <BarChart3 className="w-6 h-6 text-purple-400" />
                        Evolução do Setor
                    </h1>
                    <p className="text-gray-500 text-sm">
                        {totalVideos8Weeks} tasks • {totalAlterations} alterações ({overallRate}%)
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

                    {/* Botão Setor Completo */}
                    <div
                        onClick={() => setSelectedEditorId(null)}
                        className={`
                            flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all mb-2
                            ${!selectedEditorId
                                ? 'bg-purple-600/30 border border-purple-500/50'
                                : 'bg-[#12121a] border border-transparent hover:border-purple-500/30'
                            }
                        `}
                    >
                        <div className="w-10 h-10 rounded-full bg-purple-600/30 flex items-center justify-center flex-shrink-0">
                            <Users className="w-5 h-5 text-purple-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <span className="text-white font-medium">Setor Completo</span>
                            <p className="text-gray-500 text-xs">{editorsData.length} editores</p>
                        </div>
                        <span className="text-purple-400 font-bold">{overallRate}%</span>
                    </div>

                    {/* Lista de editores */}
                    <div className="space-y-1 max-h-[calc(100vh-300px)] overflow-y-auto">
                        {editorsData.map(editor => (
                            <div
                                key={editor.id}
                                onClick={() => setSelectedEditorId(editor.id)}
                                className={`
                                    flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all
                                    ${selectedEditorId === editor.id
                                        ? 'bg-purple-600/30 border border-purple-500/50'
                                        : 'bg-[#12121a] border border-transparent hover:border-purple-500/30'
                                    }
                                `}
                            >
                                <div
                                    className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
                                    style={{ backgroundColor: editor.teamColor }}
                                >
                                    {editor.initials}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <span className="text-white font-medium truncate">{editor.name}</span>
                                        {editor.alterationRate >= 35 && (
                                            <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
                                        )}
                                    </div>
                                    <span className="text-gray-500 text-xs">
                                        {editor.videosWithAlteration}/{editor.totalVideos} alterações
                                    </span>
                                </div>
                                <span className={`text-lg font-bold ${
                                    editor.alterationRate >= 35 ? 'text-red-400' :
                                    editor.alterationRate >= 20 ? 'text-yellow-400' : 'text-green-400'
                                }`}>
                                    {editor.alterationRate}%
                                </span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Área de conteúdo */}
                <div className="flex-1 min-w-0">
                    {/* Header do editor/setor selecionado */}
                    <div className="bg-[#12121a] border border-purple-900/30 rounded-xl p-4 mb-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                {selectedEditor ? (
                                    <>
                                        <div
                                            className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold"
                                            style={{ backgroundColor: selectedEditor.teamColor }}
                                        >
                                            {selectedEditor.initials}
                                        </div>
                                        <div>
                                            <h2 className="text-xl font-bold text-white">{selectedEditor.name}</h2>
                                            <p className="text-gray-500 text-sm">
                                                {selectedEditor.totalVideos} vídeos • {selectedEditor.videosWithAlteration} alterações
                                            </p>
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <div className="w-12 h-12 rounded-full bg-purple-600/30 flex items-center justify-center">
                                            <Users className="w-6 h-6 text-purple-400" />
                                        </div>
                                        <div>
                                            <h2 className="text-xl font-bold text-white">Visão Geral do Setor</h2>
                                            <p className="text-gray-500 text-sm">
                                                {editorsData.length} editores • {totalVideos8Weeks} vídeos nas últimas 8 semanas
                                            </p>
                                        </div>
                                    </>
                                )}
                            </div>
                            <div className="text-right">
                                <div className={`text-3xl font-bold ${
                                    currentWeek?.alterationRate >= 35 ? 'text-red-400' :
                                    currentWeek?.alterationRate >= 20 ? 'text-yellow-400' : 'text-green-400'
                                }`}>
                                    {currentWeek?.alterationRate || 0}%
                                </div>
                                <p className="text-gray-500 text-xs">esta semana</p>
                            </div>
                        </div>
                    </div>

                    {/* Gráficos lado a lado */}
                    <div className="grid grid-cols-2 gap-4 mb-4">
                        {/* Volume */}
                        <div className="bg-[#12121a] border border-purple-900/30 rounded-xl p-4">
                            <h3 className="text-sm font-medium text-gray-400 mb-3 flex items-center gap-2">
                                <Video className="w-4 h-4 text-purple-400" />
                                Volume por Semana
                            </h3>
                            <div className="flex items-end gap-1 h-24">
                                {displayData.map((week, idx) => (
                                    <div key={idx} className="flex-1 flex flex-col items-center">
                                        <div
                                            className={`w-full rounded-t transition-all ${
                                                idx === displayData.length - 1 ? 'bg-purple-500' : 'bg-purple-600/40'
                                            }`}
                                            style={{ height: `${(week.completedVideos / maxVideos) * 100}%`, minHeight: 2 }}
                                        />
                                        <span className="text-[10px] text-gray-600 mt-1">{week.weekLabel}</span>
                                    </div>
                                ))}
                            </div>
                            <div className="flex justify-between mt-2 text-xs">
                                <span className="text-gray-500">8 semanas</span>
                                <span className="text-white font-medium">{currentWeek?.completedVideos || 0} esta semana</span>
                            </div>
                        </div>

                        {/* Taxa de Alteração */}
                        <div className="bg-[#12121a] border border-purple-900/30 rounded-xl p-4">
                            <h3 className="text-sm font-medium text-gray-400 mb-3 flex items-center gap-2">
                                <Target className="w-4 h-4 text-amber-400" />
                                Taxa de Alteração
                            </h3>
                            <div className="flex items-end gap-1 h-24 relative">
                                {/* Linha de meta 35% */}
                                <div
                                    className="absolute w-full border-t border-dashed border-red-500/40"
                                    style={{ bottom: `${(35 / maxAlteration) * 100}%` }}
                                />
                                {displayData.map((week, idx) => {
                                    const barColor = week.alterationRate < 20
                                        ? 'bg-green-500'
                                        : week.alterationRate < 35
                                            ? 'bg-amber-500'
                                            : 'bg-red-500';
                                    return (
                                        <div key={idx} className="flex-1 flex flex-col items-center">
                                            <div
                                                className={`w-full rounded-t transition-all ${
                                                    idx === displayData.length - 1 ? barColor : `${barColor}/50`
                                                }`}
                                                style={{ height: `${(week.alterationRate / maxAlteration) * 100}%`, minHeight: 2 }}
                                            />
                                            <span className="text-[10px] text-gray-600 mt-1">{week.weekLabel}</span>
                                        </div>
                                    );
                                })}
                            </div>
                            <div className="flex justify-between mt-2 text-xs">
                                <span className="text-red-400/60">meta: 35%</span>
                                <span className={`font-medium ${
                                    currentWeek?.alterationRate >= 35 ? 'text-red-400' :
                                    currentWeek?.alterationRate >= 20 ? 'text-yellow-400' : 'text-green-400'
                                }`}>
                                    {currentWeek?.alterationRate || 0}% esta semana
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Análise */}
                    <div className="bg-purple-600/10 border border-purple-500/30 rounded-xl p-4">
                        <h3 className="text-purple-300 font-medium mb-3 text-sm">
                            Análise Automática {selectedEditor && `- ${selectedEditor.name}`}
                        </h3>
                        <div className="space-y-2 text-sm">
                            {(() => {
                                const totalFirstHalf = displayData.slice(0, 4).reduce((a, w) => a + w.completedVideos, 0);
                                const totalSecondHalf = displayData.slice(4).reduce((a, w) => a + w.completedVideos, 0);
                                const trend = totalSecondHalf > totalFirstHalf ? 'crescente' : totalSecondHalf < totalFirstHalf ? 'decrescente' : 'estável';

                                return (
                                    <p className="flex items-center gap-2 text-gray-300">
                                        {trend === 'crescente' ? (
                                            <TrendingUp className="w-4 h-4 text-green-400" />
                                        ) : trend === 'decrescente' ? (
                                            <TrendingDown className="w-4 h-4 text-red-400" />
                                        ) : (
                                            <Minus className="w-4 h-4 text-gray-400" />
                                        )}
                                        <strong>Volume:</strong> Tendência {trend} ({totalFirstHalf} → {totalSecondHalf} vídeos)
                                    </p>
                                );
                            })()}

                            {(() => {
                                const avgFirst = displayData.slice(0, 4).reduce((a, w) => a + w.alterationRate, 0) / 4;
                                const avgSecond = displayData.slice(4).reduce((a, w) => a + w.alterationRate, 0) / 4;
                                const trend = avgSecond < avgFirst ? 'melhorando' : avgSecond > avgFirst ? 'piorando' : 'estável';

                                return (
                                    <p className="flex items-center gap-2 text-gray-300">
                                        {trend === 'melhorando' ? (
                                            <TrendingDown className="w-4 h-4 text-green-400" />
                                        ) : trend === 'piorando' ? (
                                            <TrendingUp className="w-4 h-4 text-red-400" />
                                        ) : (
                                            <Minus className="w-4 h-4 text-gray-400" />
                                        )}
                                        <strong>Qualidade:</strong> Taxa {trend} ({avgFirst.toFixed(1)}% → {avgSecond.toFixed(1)}%)
                                    </p>
                                );
                            })()}

                            <p className="flex items-center gap-2 text-gray-300 pt-2 border-t border-purple-500/30">
                                <Target className="w-4 h-4 text-purple-400" />
                                <strong>Status:</strong> {
                                    currentWeek?.alterationRate < 20
                                        ? selectedEditor ? 'Excelente performance!' : 'Setor em excelente performance!'
                                        : currentWeek?.alterationRate < 35
                                            ? 'Dentro da meta, mas com pontos de atenção.'
                                            : 'Acima da meta - ação necessária.'
                                }
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

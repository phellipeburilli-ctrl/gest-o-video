'use client';

import { useState } from 'react';
import { ClickUpTask } from '@/types';
import { getMemberById } from '@/lib/constants';
import { FeedbackCategory } from '@/lib/frameio-api.service';
import {
    AlertTriangle,
    ChevronDown,
    ChevronUp,
    Volume2,
    Type,
    Scissors,
    Palette,
    Timer,
    Tag,
    DollarSign,
    Film,
    HelpCircle,
    TrendingDown,
    Award,
    RefreshCw,
    Loader2
} from 'lucide-react';

interface FrameIoCommentWithCategory {
    author: string;
    text: string;
    timestamp: string;
    commentNumber: number;
    category: FeedbackCategory;
}

interface FeedbackAuditData {
    task: ClickUpTask;
    hadAlteration: boolean;
    frameIoLinks: string[];
    googleDocsLinks: string[];
    comments: any[];
    frameIoComments?: FrameIoCommentWithCategory[];
}

interface FeedbacksViewProps {
    tasks: ClickUpTask[];
    feedbackData: FeedbackAuditData[];
    currentAlterationTasks: ClickUpTask[];
    lastUpdated: number;
}

interface EditorStats {
    name: string;
    color: string;
    totalCompleted: number;
    withAlteration: number;
    alterationRate: number;
    errorPatterns: Record<FeedbackCategory, number>;
    totalErrors: number;
}

const CATEGORY_ICONS: Record<FeedbackCategory, any> = {
    'Áudio/Voz': Volume2,
    'Legenda/Texto': Type,
    'Corte/Transição': Scissors,
    'Fonte/Tipografia': Type,
    'Cor/Imagem': Palette,
    'Timing/Sincronização': Timer,
    'Logo/Marca': Tag,
    'CTA/Preço': DollarSign,
    'Footage/Vídeo': Film,
    'Outros': HelpCircle
};

const CATEGORY_COLORS: Record<FeedbackCategory, string> = {
    'Áudio/Voz': 'bg-purple-500/20 text-purple-400 border-purple-500/30',
    'Legenda/Texto': 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    'Corte/Transição': 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    'Fonte/Tipografia': 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
    'Cor/Imagem': 'bg-pink-500/20 text-pink-400 border-pink-500/30',
    'Timing/Sincronização': 'bg-orange-500/20 text-orange-400 border-orange-500/30',
    'Logo/Marca': 'bg-green-500/20 text-green-400 border-green-500/30',
    'CTA/Preço': 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    'Footage/Vídeo': 'bg-red-500/20 text-red-400 border-red-500/30',
    'Outros': 'bg-gray-500/20 text-gray-400 border-gray-500/30'
};

const ALL_CATEGORIES: FeedbackCategory[] = [
    'Áudio/Voz', 'Legenda/Texto', 'Corte/Transição', 'Fonte/Tipografia',
    'Cor/Imagem', 'Timing/Sincronização', 'Logo/Marca', 'CTA/Preço',
    'Footage/Vídeo', 'Outros'
];

export function FeedbacksView({ tasks, feedbackData, currentAlterationTasks, lastUpdated }: FeedbacksViewProps) {
    const [expandedEditor, setExpandedEditor] = useState<string | null>(null);
    const [isUpdating, setIsUpdating] = useState(false);
    const [updateResult, setUpdateResult] = useState<{ success: boolean; message: string } | null>(null);

    const handleUpdate = async () => {
        setIsUpdating(true);
        setUpdateResult(null);

        try {
            const response = await fetch('/api/feedbacks/update', { method: 'POST' });
            const data = await response.json();

            if (data.success) {
                setUpdateResult({
                    success: true,
                    message: `${data.stats.commentsExtracted} feedbacks extraídos de ${data.stats.frameIoUrls} links`
                });
                // Reload page after 2 seconds to show updated data
                setTimeout(() => window.location.reload(), 2000);
            } else {
                setUpdateResult({ success: false, message: data.error || 'Erro ao atualizar' });
            }
        } catch (error) {
            setUpdateResult({ success: false, message: 'Erro de conexão' });
        } finally {
            setIsUpdating(false);
        }
    };

    // Calculate stats by editor
    const editorStatsMap: Record<string, EditorStats> = {};

    feedbackData.forEach(data => {
        const assignee = data.task.assignees?.[0];
        if (!assignee) return;

        const member = getMemberById(assignee.id);
        const editorName = member?.name || assignee.username;
        const editorColor = member?.color || '#6b7280';

        if (!editorStatsMap[editorName]) {
            editorStatsMap[editorName] = {
                name: editorName,
                color: editorColor,
                totalCompleted: 0,
                withAlteration: 0,
                alterationRate: 0,
                errorPatterns: ALL_CATEGORIES.reduce((acc, cat) => ({ ...acc, [cat]: 0 }), {} as Record<FeedbackCategory, number>),
                totalErrors: 0
            };
        }

        editorStatsMap[editorName].totalCompleted++;
        if (data.hadAlteration) {
            editorStatsMap[editorName].withAlteration++;
        }

        // Count error patterns from Frame.io comments
        if (data.frameIoComments) {
            data.frameIoComments.forEach(comment => {
                editorStatsMap[editorName].errorPatterns[comment.category]++;
                editorStatsMap[editorName].totalErrors++;
            });
        }
    });

    // Calculate alteration rates
    Object.values(editorStatsMap).forEach(stats => {
        stats.alterationRate = stats.totalCompleted > 0
            ? (stats.withAlteration / stats.totalCompleted) * 100
            : 0;
    });

    const editorStats = Object.values(editorStatsMap)
        .filter(e => e.totalCompleted > 0)
        .sort((a, b) => b.alterationRate - a.alterationRate);

    // Overall stats
    const totalCompleted = feedbackData.length;
    const totalWithAlteration = feedbackData.filter(d => d.hadAlteration).length;
    const overallRate = totalCompleted > 0 ? (totalWithAlteration / totalCompleted) * 100 : 0;
    const totalComments = feedbackData.reduce((acc, d) => acc + (d.frameIoComments?.length || 0), 0);

    // Global error patterns
    const globalErrorPatterns: Record<FeedbackCategory, number> = ALL_CATEGORIES.reduce(
        (acc, cat) => ({ ...acc, [cat]: 0 }),
        {} as Record<FeedbackCategory, number>
    );
    feedbackData.forEach(data => {
        data.frameIoComments?.forEach(comment => {
            globalErrorPatterns[comment.category]++;
        });
    });

    const topGlobalErrors = Object.entries(globalErrorPatterns)
        .filter(([_, count]) => count > 0)
        .sort((a, b) => b[1] - a[1]);

    const getAlterationRateColor = (rate: number) => {
        if (rate <= 15) return 'text-green-400';
        if (rate <= 30) return 'text-yellow-400';
        return 'text-red-400';
    };

    return (
        <div className="p-6 space-y-6 max-w-5xl mx-auto">
            {/* Header */}
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-white">Padrões de Erro</h1>
                    <p className="text-gray-500 text-sm">
                        {totalCompleted} tasks • {totalWithAlteration} alterações ({overallRate.toFixed(0)}%) • {totalComments} feedbacks analisados
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={handleUpdate}
                        disabled={isUpdating}
                        className="flex items-center gap-2 px-3 py-1.5 bg-purple-600/20 text-purple-400 border border-purple-500/30 rounded-lg text-sm hover:bg-purple-600/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        {isUpdating ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                            <RefreshCw className="w-4 h-4" />
                        )}
                        {isUpdating ? 'Atualizando...' : 'Atualizar'}
                    </button>
                    <div className="text-xs text-gray-600">
                        {new Date(lastUpdated).toLocaleString('pt-BR')}
                    </div>
                </div>
            </div>

            {/* Update Result Message */}
            {updateResult && (
                <div className={`p-3 rounded-lg text-sm ${
                    updateResult.success
                        ? 'bg-green-950/30 border border-green-900/50 text-green-400'
                        : 'bg-red-950/30 border border-red-900/50 text-red-400'
                }`}>
                    {updateResult.message}
                </div>
            )}

            {/* Global Error Patterns */}
            {topGlobalErrors.length > 0 && (
                <div className="bg-[#12121a] border border-gray-800 rounded-xl p-5">
                    <h2 className="text-sm font-medium text-gray-400 mb-3 flex items-center gap-2">
                        <TrendingDown className="w-4 h-4" />
                        Erros Mais Frequentes
                    </h2>
                    <div className="flex flex-wrap gap-2">
                        {topGlobalErrors.map(([category, count]) => {
                            const Icon = CATEGORY_ICONS[category as FeedbackCategory];
                            const colors = CATEGORY_COLORS[category as FeedbackCategory];
                            return (
                                <div
                                    key={category}
                                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border ${colors}`}
                                >
                                    <Icon className="w-4 h-4" />
                                    <span className="text-sm">{category}</span>
                                    <span className="text-xs opacity-70">{count}</span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Editor List */}
            <div className="space-y-2">
                {editorStats.map((editor, index) => {
                    const topErrors = Object.entries(editor.errorPatterns)
                        .filter(([_, count]) => count > 0)
                        .sort((a, b) => b[1] - a[1])
                        .slice(0, 5);

                    const isExpanded = expandedEditor === editor.name;
                    const isTopPerformer = index === editorStats.length - 1 && editor.alterationRate < 15;
                    const isWorstPerformer = index === 0 && editor.alterationRate > 30;

                    return (
                        <div
                            key={editor.name}
                            className={`bg-[#12121a] border rounded-xl overflow-hidden ${
                                isWorstPerformer ? 'border-red-900/50' :
                                isTopPerformer ? 'border-green-900/50' : 'border-gray-800'
                            }`}
                        >
                            <button
                                onClick={() => setExpandedEditor(isExpanded ? null : editor.name)}
                                className="w-full p-4 flex items-center gap-4 hover:bg-gray-900/50 transition-colors"
                            >
                                {/* Avatar */}
                                <div
                                    className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
                                    style={{ backgroundColor: editor.color }}
                                >
                                    {editor.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                                </div>

                                {/* Name and stats */}
                                <div className="flex-1 text-left min-w-0">
                                    <div className="flex items-center gap-2">
                                        <span className="text-white font-medium truncate">{editor.name}</span>
                                        {isTopPerformer && <Award className="w-4 h-4 text-green-400" />}
                                        {isWorstPerformer && <AlertTriangle className="w-4 h-4 text-red-400" />}
                                    </div>
                                    <div className="text-xs text-gray-500">
                                        {editor.totalCompleted} tasks • {editor.withAlteration} alterações
                                        {editor.totalErrors > 0 && ` • ${editor.totalErrors} erros`}
                                    </div>
                                </div>

                                {/* Mini error badges (collapsed view) */}
                                {!isExpanded && topErrors.length > 0 && (
                                    <div className="hidden sm:flex gap-1">
                                        {topErrors.slice(0, 3).map(([cat, count]) => {
                                            const Icon = CATEGORY_ICONS[cat as FeedbackCategory];
                                            const colors = CATEGORY_COLORS[cat as FeedbackCategory];
                                            return (
                                                <div
                                                    key={cat}
                                                    className={`flex items-center gap-1 px-2 py-1 rounded text-xs border ${colors}`}
                                                    title={cat}
                                                >
                                                    <Icon className="w-3 h-3" />
                                                    <span>{count}</span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}

                                {/* Rate */}
                                <div className="text-right flex-shrink-0">
                                    <div className={`text-lg font-bold ${getAlterationRateColor(editor.alterationRate)}`}>
                                        {editor.alterationRate.toFixed(0)}%
                                    </div>
                                </div>

                                {/* Expand icon */}
                                {editor.totalErrors > 0 && (
                                    isExpanded
                                        ? <ChevronUp className="w-5 h-5 text-gray-500" />
                                        : <ChevronDown className="w-5 h-5 text-gray-500" />
                                )}
                            </button>

                            {/* Expanded error details */}
                            {isExpanded && editor.totalErrors > 0 && (
                                <div className="border-t border-gray-800 p-4 bg-gray-900/30">
                                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
                                        {Object.entries(editor.errorPatterns)
                                            .filter(([_, count]) => count > 0)
                                            .sort((a, b) => b[1] - a[1])
                                            .map(([cat, count]) => {
                                                const Icon = CATEGORY_ICONS[cat as FeedbackCategory];
                                                const colors = CATEGORY_COLORS[cat as FeedbackCategory];
                                                const percentage = ((count / editor.totalErrors) * 100).toFixed(0);
                                                return (
                                                    <div
                                                        key={cat}
                                                        className={`flex flex-col items-center gap-1 p-3 rounded-lg border ${colors}`}
                                                    >
                                                        <Icon className="w-5 h-5" />
                                                        <span className="text-xs text-center">{cat}</span>
                                                        <span className="text-lg font-bold">{count}</span>
                                                        <span className="text-xs opacity-60">{percentage}%</span>
                                                    </div>
                                                );
                                            })}
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Aguardando Alteração */}
            {currentAlterationTasks.length > 0 && (
                <div className="bg-red-950/20 border border-red-900/30 rounded-xl p-4">
                    <h3 className="text-sm font-medium text-red-400 mb-2">
                        Aguardando Alteração ({currentAlterationTasks.length})
                    </h3>
                    <div className="text-xs text-gray-400 space-y-1">
                        {currentAlterationTasks.slice(0, 5).map(task => {
                            const assignee = task.assignees?.[0];
                            const member = assignee ? getMemberById(assignee.id) : null;
                            return (
                                <div key={task.id} className="truncate">
                                    <span className="text-gray-500">{member?.name || assignee?.username}:</span> {task.name}
                                </div>
                            );
                        })}
                        {currentAlterationTasks.length > 5 && (
                            <div className="text-gray-600">+{currentAlterationTasks.length - 5} mais</div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

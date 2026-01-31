'use client';

import { useState } from 'react';
import { ClickUpTask } from '@/types';
import { getMemberById, AUDIOVISUAL_TEAM_IDS } from '@/lib/constants';
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
    Award,
    RefreshCw,
    Loader2,
    User,
    MessageSquare
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
    id: string;
    name: string;
    color: string;
    totalCompleted: number;
    withAlteration: number;
    alterationRate: number;
}

interface EditorFeedbackData {
    editor: { id: string; name: string; color: string };
    stats: {
        totalTasks: number;
        tasksWithAlteration: number;
        alterationRate: number;
        totalFrameIoLinks: number;
        linksProcessed: number;
        linksFailed?: number;
        totalFeedbacks: number;
    };
    errorPatterns: Array<{ category: string; count: number; percentage: number }>;
    recentComments: Array<{ text: string; category: string; timestamp: string; taskName: string }>;
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

export function FeedbacksView({ tasks, feedbackData, currentAlterationTasks, lastUpdated }: FeedbacksViewProps) {
    const [selectedEditor, setSelectedEditor] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [editorData, setEditorData] = useState<EditorFeedbackData | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);

    // Calculate stats by editor
    const editorStatsMap: Record<string, EditorStats> = {};

    feedbackData.forEach(data => {
        const assignee = data.task.assignees?.[0];
        if (!assignee) return;

        const member = getMemberById(assignee.id);
        const editorId = String(assignee.id);
        const editorName = member?.name || assignee.username;
        const editorColor = member?.color || '#6b7280';

        if (!editorStatsMap[editorId]) {
            editorStatsMap[editorId] = {
                id: editorId,
                name: editorName,
                color: editorColor,
                totalCompleted: 0,
                withAlteration: 0,
                alterationRate: 0
            };
        }

        editorStatsMap[editorId].totalCompleted++;
        if (data.hadAlteration) {
            editorStatsMap[editorId].withAlteration++;
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

    const getAlterationRateColor = (rate: number) => {
        if (rate <= 15) return 'text-green-400';
        if (rate <= 30) return 'text-yellow-400';
        return 'text-red-400';
    };

    const loadEditorFeedback = async (editorId: string) => {
        setSelectedEditor(editorId);
        setIsLoading(true);
        setError(null);
        setEditorData(null);
        setProgress(null);

        try {
            // Get Frame.io links from this editor's tasks with alterations
            const editorTasksData = feedbackData.filter(data => {
                const assignee = data.task.assignees?.[0];
                return assignee && String(assignee.id) === editorId;
            });

            const tasksWithAlteration = editorTasksData.filter(d => d.hadAlteration && d.frameIoLinks.length > 0);

            const frameIoLinks = tasksWithAlteration.flatMap(d =>
                d.frameIoLinks.map(url => ({
                    url,
                    taskName: d.task.name
                }))
            );

            const editorInfo = editorStatsMap[editorId];

            // Process links one by one with progress
            const allComments: Array<{ text: string; category: string; timestamp: string; taskName: string }> = [];
            const errorPatterns: Record<string, number> = {};
            let linksProcessed = 0;
            let linksFailed = 0;

            setProgress({ current: 0, total: frameIoLinks.length });

            for (let i = 0; i < frameIoLinks.length; i++) {
                const link = frameIoLinks[i];
                setProgress({ current: i + 1, total: frameIoLinks.length });

                try {
                    const response = await fetch('/api/feedbacks/extract-link', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ url: link.url, taskName: link.taskName })
                    });

                    const data = await response.json();

                    if (data.success && data.comments) {
                        linksProcessed++;
                        allComments.push(...data.comments);

                        // Aggregate error patterns
                        Object.entries(data.errorPatterns || {}).forEach(([cat, count]) => {
                            errorPatterns[cat] = (errorPatterns[cat] || 0) + (count as number);
                        });
                    } else {
                        linksFailed++;
                    }
                } catch {
                    linksFailed++;
                }
            }

            // Calculate percentages
            const totalErrors = Object.values(errorPatterns).reduce((a, b) => a + b, 0);
            const topErrors = Object.entries(errorPatterns)
                .filter(([_, count]) => count > 0)
                .sort((a, b) => b[1] - a[1])
                .map(([category, count]) => ({
                    category,
                    count,
                    percentage: totalErrors > 0 ? Math.round((count / totalErrors) * 100) : 0
                }));

            setEditorData({
                editor: {
                    id: editorId,
                    name: editorInfo?.name || 'Unknown',
                    color: editorInfo?.color || '#666'
                },
                stats: {
                    totalTasks: editorInfo?.totalCompleted || 0,
                    tasksWithAlteration: editorInfo?.withAlteration || 0,
                    alterationRate: editorInfo?.alterationRate || 0,
                    totalFrameIoLinks: frameIoLinks.length,
                    linksProcessed,
                    linksFailed,
                    totalFeedbacks: totalErrors
                },
                errorPatterns: topErrors,
                recentComments: allComments.slice(0, 15)
            });

        } catch (err) {
            setError('Erro de conexão');
        } finally {
            setIsLoading(false);
            setProgress(null);
        }
    };

    return (
        <div className="p-6 space-y-6 max-w-6xl mx-auto">
            {/* Header */}
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-white">Padrões de Erro</h1>
                    <p className="text-gray-500 text-sm">
                        {totalCompleted} tasks • {totalWithAlteration} alterações ({overallRate.toFixed(0)}%)
                    </p>
                </div>
                <div className="text-xs text-gray-600">
                    {new Date(lastUpdated).toLocaleString('pt-BR')}
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Editor List */}
                <div className="lg:col-span-1 space-y-2">
                    <h2 className="text-sm font-medium text-gray-400 mb-3">Selecione um Editor</h2>
                    {editorStats.map((editor) => {
                        const isSelected = selectedEditor === editor.id;
                        const isTopPerformer = editor.alterationRate === 0;
                        const isWorstPerformer = editor.alterationRate > 50;

                        return (
                            <button
                                key={editor.id}
                                onClick={() => loadEditorFeedback(editor.id)}
                                disabled={isLoading}
                                className={`w-full p-3 rounded-xl flex items-center gap-3 transition-all ${
                                    isSelected
                                        ? 'bg-purple-600/20 border-2 border-purple-500'
                                        : 'bg-[#12121a] border border-gray-800 hover:border-gray-700'
                                } ${isLoading ? 'opacity-50' : ''}`}
                            >
                                <div
                                    className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
                                    style={{ backgroundColor: editor.color }}
                                >
                                    {editor.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                                </div>
                                <div className="flex-1 text-left min-w-0">
                                    <div className="flex items-center gap-2">
                                        <span className="text-white font-medium truncate text-sm">{editor.name}</span>
                                        {isTopPerformer && <Award className="w-3 h-3 text-green-400" />}
                                        {isWorstPerformer && <AlertTriangle className="w-3 h-3 text-red-400" />}
                                    </div>
                                    <div className="text-xs text-gray-500">
                                        {editor.withAlteration}/{editor.totalCompleted} alterações
                                    </div>
                                </div>
                                <div className={`text-lg font-bold ${getAlterationRateColor(editor.alterationRate)}`}>
                                    {editor.alterationRate.toFixed(0)}%
                                </div>
                            </button>
                        );
                    })}
                </div>

                {/* Editor Details */}
                <div className="lg:col-span-2">
                    {!selectedEditor && (
                        <div className="bg-[#12121a] border border-gray-800 rounded-xl p-12 text-center">
                            <User className="w-12 h-12 text-gray-600 mx-auto mb-4" />
                            <p className="text-gray-400">Selecione um editor para ver os padrões de erro</p>
                            <p className="text-gray-600 text-sm mt-2">Os feedbacks serão extraídos do Frame.io automaticamente</p>
                        </div>
                    )}

                    {isLoading && (
                        <div className="bg-[#12121a] border border-gray-800 rounded-xl p-12 text-center">
                            <Loader2 className="w-12 h-12 text-purple-400 mx-auto mb-4 animate-spin" />
                            <p className="text-gray-400">Extraindo feedbacks do Frame.io...</p>
                            {progress && (
                                <>
                                    <div className="w-full max-w-xs mx-auto mt-4 bg-gray-800 rounded-full h-2">
                                        <div
                                            className="bg-purple-500 h-2 rounded-full transition-all duration-300"
                                            style={{ width: `${(progress.current / progress.total) * 100}%` }}
                                        />
                                    </div>
                                    <p className="text-purple-400 text-sm mt-2">
                                        {progress.current} de {progress.total} links
                                    </p>
                                </>
                            )}
                            <p className="text-gray-600 text-xs mt-2">Processando um link por vez para garantir precisão</p>
                        </div>
                    )}

                    {error && (
                        <div className="bg-red-950/20 border border-red-900/50 rounded-xl p-6 text-center">
                            <AlertTriangle className="w-12 h-12 text-red-400 mx-auto mb-4" />
                            <p className="text-red-400">{error}</p>
                        </div>
                    )}

                    {editorData && !isLoading && (
                        <div className="space-y-4">
                            {/* Editor Header */}
                            <div className="bg-[#12121a] border border-gray-800 rounded-xl p-4">
                                <div className="flex items-center gap-4">
                                    <div
                                        className="w-14 h-14 rounded-full flex items-center justify-center text-white font-bold text-lg"
                                        style={{ backgroundColor: editorData.editor.color }}
                                    >
                                        {editorData.editor.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                                    </div>
                                    <div className="flex-1">
                                        <h3 className="text-xl font-bold text-white">{editorData.editor.name}</h3>
                                        <p className="text-gray-500 text-sm">
                                            {editorData.stats.totalTasks} tasks • {editorData.stats.tasksWithAlteration} alterações • {editorData.stats.totalFeedbacks} feedbacks
                                        </p>
                                    </div>
                                    <div className="text-right">
                                        <div className={`text-3xl font-bold ${getAlterationRateColor(editorData.stats.alterationRate)}`}>
                                            {editorData.stats.alterationRate}%
                                        </div>
                                        <div className="text-xs text-gray-500">taxa de alteração</div>
                                    </div>
                                </div>
                            </div>

                            {/* Error Patterns */}
                            {editorData.errorPatterns.length > 0 ? (
                                <div className="bg-[#12121a] border border-gray-800 rounded-xl p-4">
                                    <h4 className="text-sm font-medium text-gray-400 mb-3">Padrões de Erro</h4>
                                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                        {editorData.errorPatterns.map(({ category, count, percentage }) => {
                                            const Icon = CATEGORY_ICONS[category as FeedbackCategory] || HelpCircle;
                                            const colors = CATEGORY_COLORS[category as FeedbackCategory] || CATEGORY_COLORS['Outros'];
                                            return (
                                                <div
                                                    key={category}
                                                    className={`flex items-center gap-2 p-3 rounded-lg border ${colors}`}
                                                >
                                                    <Icon className="w-5 h-5 flex-shrink-0" />
                                                    <div className="flex-1 min-w-0">
                                                        <div className="text-xs truncate">{category}</div>
                                                        <div className="text-lg font-bold">{count}</div>
                                                    </div>
                                                    <div className="text-xs opacity-60">{percentage}%</div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            ) : (
                                <div className="bg-green-950/20 border border-green-900/50 rounded-xl p-6 text-center">
                                    <Award className="w-12 h-12 text-green-400 mx-auto mb-2" />
                                    <p className="text-green-400 font-medium">Nenhum erro encontrado!</p>
                                    <p className="text-gray-500 text-sm">
                                        {editorData.stats.linksProcessed > 0
                                            ? `${editorData.stats.linksProcessed} links analisados sem feedbacks de correção`
                                            : 'Não há links do Frame.io para analisar'
                                        }
                                    </p>
                                </div>
                            )}

                            {/* Recent Comments */}
                            {editorData.recentComments.length > 0 && (
                                <div className="bg-[#12121a] border border-gray-800 rounded-xl p-4">
                                    <h4 className="text-sm font-medium text-gray-400 mb-3 flex items-center gap-2">
                                        <MessageSquare className="w-4 h-4" />
                                        Últimos Feedbacks
                                    </h4>
                                    <div className="space-y-2 max-h-64 overflow-y-auto">
                                        {editorData.recentComments.map((comment, idx) => {
                                            const Icon = CATEGORY_ICONS[comment.category as FeedbackCategory] || HelpCircle;
                                            const colors = CATEGORY_COLORS[comment.category as FeedbackCategory] || CATEGORY_COLORS['Outros'];
                                            return (
                                                <div key={idx} className="flex items-start gap-2 p-2 bg-gray-900/50 rounded-lg">
                                                    <div className={`p-1.5 rounded ${colors} flex-shrink-0`}>
                                                        <Icon className="w-3 h-3" />
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-gray-300 text-sm">{comment.text}</p>
                                                        <p className="text-gray-600 text-xs mt-1 truncate">
                                                            {comment.taskName} • {comment.timestamp}
                                                        </p>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* Info */}
                            <div className="text-xs text-gray-600 text-center">
                                {editorData.stats.linksProcessed} de {editorData.stats.totalFrameIoLinks} links analisados
                                {(editorData.stats.linksFailed ?? 0) > 0 && (
                                    <span className="text-yellow-500"> • {editorData.stats.linksFailed} falharam (timeout)</span>
                                )}
                            </div>
                        </div>
                    )}
                </div>
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
                    </div>
                </div>
            )}
        </div>
    );
}

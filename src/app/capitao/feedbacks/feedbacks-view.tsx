'use client';

import { useState } from 'react';
import { ClickUpTask } from '@/types';
import { getMemberById } from '@/lib/constants';
import { FeedbackCategory } from '@/lib/frameio.service';
import {
    MessageSquare,
    ExternalLink,
    Search,
    AlertCircle,
    CheckCircle,
    Clock,
    Video,
    FileText,
    TrendingUp,
    Users,
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
    HelpCircle
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

interface CurrentAlterationTask {
    task: ClickUpTask;
    frameIoLinks: string[];
    comments: any[];
}

interface FeedbacksViewProps {
    tasks: ClickUpTask[];
    feedbackData: FeedbackAuditData[];
    currentAlterationTasks: CurrentAlterationTask[];
    lastUpdated: number;
}

interface EditorStats {
    name: string;
    color: string;
    totalCompleted: number;
    withAlteration: number;
    alterationRate: number;
    tasks: FeedbackAuditData[];
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
    'Áudio/Voz': 'text-purple-400 bg-purple-600/20',
    'Legenda/Texto': 'text-blue-400 bg-blue-600/20',
    'Corte/Transição': 'text-orange-400 bg-orange-600/20',
    'Fonte/Tipografia': 'text-cyan-400 bg-cyan-600/20',
    'Cor/Imagem': 'text-pink-400 bg-pink-600/20',
    'Timing/Sincronização': 'text-yellow-400 bg-yellow-600/20',
    'Logo/Marca': 'text-green-400 bg-green-600/20',
    'CTA/Preço': 'text-emerald-400 bg-emerald-600/20',
    'Footage/Vídeo': 'text-red-400 bg-red-600/20',
    'Outros': 'text-gray-400 bg-gray-600/20'
};

export function FeedbacksView({ tasks, feedbackData, currentAlterationTasks, lastUpdated }: FeedbacksViewProps) {
    const [expandedEditor, setExpandedEditor] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');

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
                tasks: [],
                errorPatterns: {
                    'Áudio/Voz': 0,
                    'Legenda/Texto': 0,
                    'Corte/Transição': 0,
                    'Fonte/Tipografia': 0,
                    'Cor/Imagem': 0,
                    'Timing/Sincronização': 0,
                    'Logo/Marca': 0,
                    'CTA/Preço': 0,
                    'Footage/Vídeo': 0,
                    'Outros': 0
                },
                totalErrors: 0
            };
        }

        editorStatsMap[editorName].totalCompleted++;
        if (data.hadAlteration) {
            editorStatsMap[editorName].withAlteration++;
        }
        editorStatsMap[editorName].tasks.push(data);

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
        .sort((a, b) => b.totalErrors - a.totalErrors || b.alterationRate - a.alterationRate);

    // Overall stats
    const totalCompleted = feedbackData.length;
    const totalWithAlteration = feedbackData.filter(d => d.hadAlteration).length;
    const overallRate = totalCompleted > 0 ? (totalWithAlteration / totalCompleted) * 100 : 0;
    const totalFrameIoComments = feedbackData.reduce((acc, d) => acc + (d.frameIoComments?.length || 0), 0);

    // Aggregate error patterns
    const overallPatterns: Record<FeedbackCategory, number> = {
        'Áudio/Voz': 0,
        'Legenda/Texto': 0,
        'Corte/Transição': 0,
        'Fonte/Tipografia': 0,
        'Cor/Imagem': 0,
        'Timing/Sincronização': 0,
        'Logo/Marca': 0,
        'CTA/Preço': 0,
        'Footage/Vídeo': 0,
        'Outros': 0
    };

    feedbackData.forEach(d => {
        d.frameIoComments?.forEach(c => {
            overallPatterns[c.category]++;
        });
    });

    const topPatterns = Object.entries(overallPatterns)
        .filter(([_, count]) => count > 0)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

    const getAlterationRateColor = (rate: number) => {
        if (rate <= 15) return 'text-green-400';
        if (rate <= 30) return 'text-yellow-400';
        return 'text-red-400';
    };

    return (
        <div className="p-8 space-y-8">
            {/* Header */}
            <div className="flex justify-between items-start">
                <div>
                    <h1 className="text-3xl font-bold text-white">Auditoria de Feedbacks</h1>
                    <p className="text-gray-400 mt-1">
                        Padrões de erro extraídos automaticamente do Frame.io
                    </p>
                </div>
                <div className="text-right">
                    <div className="text-sm text-gray-500">Última atualização</div>
                    <div className="text-lg text-purple-400">
                        {new Date(lastUpdated).toLocaleString('pt-BR')}
                    </div>
                </div>
            </div>

            {/* Overview Stats */}
            <div className="grid grid-cols-4 gap-6">
                <div className="bg-[#12121a] border border-purple-900/30 rounded-xl p-6">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-lg bg-purple-600/20 flex items-center justify-center">
                            <CheckCircle className="w-6 h-6 text-purple-400" />
                        </div>
                        <div>
                            <p className="text-gray-400 text-sm">Tasks Concluídas</p>
                            <p className="text-2xl font-bold text-white">{totalCompleted}</p>
                        </div>
                    </div>
                </div>

                <div className="bg-[#12121a] border border-amber-900/30 rounded-xl p-6">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-lg bg-amber-600/20 flex items-center justify-center">
                            <AlertTriangle className="w-6 h-6 text-amber-400" />
                        </div>
                        <div>
                            <p className="text-gray-400 text-sm">Com Alteração</p>
                            <p className="text-2xl font-bold text-white">{totalWithAlteration}</p>
                            <p className="text-xs text-gray-500">{overallRate.toFixed(1)}% do total</p>
                        </div>
                    </div>
                </div>

                <div className="bg-[#12121a] border border-blue-900/30 rounded-xl p-6">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-lg bg-blue-600/20 flex items-center justify-center">
                            <MessageSquare className="w-6 h-6 text-blue-400" />
                        </div>
                        <div>
                            <p className="text-gray-400 text-sm">Feedbacks Analisados</p>
                            <p className="text-2xl font-bold text-white">{totalFrameIoComments}</p>
                        </div>
                    </div>
                </div>

                <div className="bg-[#12121a] border border-red-900/30 rounded-xl p-6">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-lg bg-red-600/20 flex items-center justify-center">
                            <Clock className="w-6 h-6 text-red-400" />
                        </div>
                        <div>
                            <p className="text-gray-400 text-sm">Aguardando Alteração</p>
                            <p className="text-2xl font-bold text-white">{currentAlterationTasks.length}</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Top Error Patterns */}
            {topPatterns.length > 0 && (
                <div className="bg-[#12121a] border border-purple-900/30 rounded-xl p-6">
                    <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                        <TrendingUp className="w-5 h-5 text-purple-400" />
                        Principais Tipos de Erro
                    </h2>
                    <div className="grid grid-cols-5 gap-4">
                        {topPatterns.map(([category, count]) => {
                            const Icon = CATEGORY_ICONS[category as FeedbackCategory];
                            const colorClass = CATEGORY_COLORS[category as FeedbackCategory];
                            const percentage = totalFrameIoComments > 0
                                ? ((count / totalFrameIoComments) * 100).toFixed(0)
                                : 0;

                            return (
                                <div key={category} className="bg-gray-900/50 rounded-lg p-4">
                                    <div className="flex items-center gap-3 mb-2">
                                        <div className={`w-10 h-10 rounded-lg ${colorClass} flex items-center justify-center`}>
                                            <Icon className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <p className="text-white font-medium text-sm">{category}</p>
                                            <p className="text-gray-500 text-xs">{percentage}% dos erros</p>
                                        </div>
                                    </div>
                                    <p className="text-2xl font-bold text-white">{count}</p>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Editor Error Patterns */}
            <div className="bg-[#12121a] border border-purple-900/30 rounded-xl p-6">
                <h2 className="text-xl font-semibold text-white mb-6 flex items-center gap-2">
                    <Users className="w-5 h-5 text-purple-400" />
                    Padrões de Erro por Editor
                </h2>

                {editorStats.length === 0 ? (
                    <div className="text-center py-12">
                        <MessageSquare className="w-12 h-12 text-gray-600 mx-auto mb-4" />
                        <p className="text-gray-400">Nenhum feedback encontrado</p>
                        <p className="text-gray-500 text-sm mt-2">
                            Comentários do Frame.io serão extraídos automaticamente
                        </p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {editorStats.map(editor => (
                            <div key={editor.name} className="bg-gray-900/50 rounded-lg overflow-hidden">
                                <button
                                    onClick={() => setExpandedEditor(expandedEditor === editor.name ? null : editor.name)}
                                    className="w-full p-4 flex items-center justify-between hover:bg-gray-800/50 transition-colors"
                                >
                                    <div className="flex items-center gap-4">
                                        <div
                                            className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold"
                                            style={{ backgroundColor: editor.color }}
                                        >
                                            {editor.name.charAt(0)}
                                        </div>
                                        <div className="text-left">
                                            <p className="text-white font-medium">{editor.name}</p>
                                            <p className="text-gray-500 text-sm">
                                                {editor.totalCompleted} concluídas • {editor.withAlteration} alterações • {editor.totalErrors} feedbacks
                                            </p>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-6">
                                        {/* Top 3 error categories for this editor */}
                                        <div className="flex items-center gap-2">
                                            {Object.entries(editor.errorPatterns)
                                                .filter(([_, count]) => count > 0)
                                                .sort((a, b) => b[1] - a[1])
                                                .slice(0, 3)
                                                .map(([category, count]) => {
                                                    const Icon = CATEGORY_ICONS[category as FeedbackCategory];
                                                    const colorClass = CATEGORY_COLORS[category as FeedbackCategory];
                                                    return (
                                                        <div
                                                            key={category}
                                                            className={`flex items-center gap-1 px-2 py-1 rounded ${colorClass}`}
                                                            title={`${category}: ${count}`}
                                                        >
                                                            <Icon className="w-4 h-4" />
                                                            <span className="text-xs font-medium">{count}</span>
                                                        </div>
                                                    );
                                                })}
                                        </div>

                                        <div className="text-right">
                                            <p className={`text-lg font-bold ${getAlterationRateColor(editor.alterationRate)}`}>
                                                {editor.alterationRate.toFixed(1)}%
                                            </p>
                                            <p className="text-gray-500 text-xs">taxa de alteração</p>
                                        </div>

                                        {expandedEditor === editor.name
                                            ? <ChevronUp className="w-5 h-5 text-gray-400" />
                                            : <ChevronDown className="w-5 h-5 text-gray-400" />
                                        }
                                    </div>
                                </button>

                                {/* Expanded details */}
                                {expandedEditor === editor.name && (
                                    <div className="border-t border-gray-800 p-4">
                                        {/* Error breakdown */}
                                        <div className="mb-4">
                                            <h4 className="text-sm text-gray-400 mb-3">Tipos de erro:</h4>
                                            <div className="flex flex-wrap gap-2">
                                                {Object.entries(editor.errorPatterns)
                                                    .filter(([_, count]) => count > 0)
                                                    .sort((a, b) => b[1] - a[1])
                                                    .map(([category, count]) => {
                                                        const Icon = CATEGORY_ICONS[category as FeedbackCategory];
                                                        const colorClass = CATEGORY_COLORS[category as FeedbackCategory];
                                                        const percentage = editor.totalErrors > 0
                                                            ? ((count / editor.totalErrors) * 100).toFixed(0)
                                                            : 0;
                                                        return (
                                                            <div
                                                                key={category}
                                                                className={`flex items-center gap-2 px-3 py-2 rounded-lg ${colorClass}`}
                                                            >
                                                                <Icon className="w-4 h-4" />
                                                                <span className="text-sm font-medium">{category}</span>
                                                                <span className="text-xs opacity-75">({count} - {percentage}%)</span>
                                                            </div>
                                                        );
                                                    })}
                                            </div>
                                        </div>

                                        {/* Recent feedback comments */}
                                        <div>
                                            <h4 className="text-sm text-gray-400 mb-3">Feedbacks recentes:</h4>
                                            <div className="space-y-2 max-h-60 overflow-y-auto">
                                                {editor.tasks
                                                    .filter(t => t.frameIoComments && t.frameIoComments.length > 0)
                                                    .flatMap(t => t.frameIoComments!.map(c => ({ ...c, taskName: t.task.name })))
                                                    .slice(0, 10)
                                                    .map((comment, idx) => {
                                                        const Icon = CATEGORY_ICONS[comment.category];
                                                        const colorClass = CATEGORY_COLORS[comment.category];
                                                        return (
                                                            <div key={idx} className="bg-gray-800/50 rounded-lg p-3">
                                                                <div className="flex items-start gap-3">
                                                                    <div className={`w-8 h-8 rounded flex items-center justify-center flex-shrink-0 ${colorClass}`}>
                                                                        <Icon className="w-4 h-4" />
                                                                    </div>
                                                                    <div className="flex-1 min-w-0">
                                                                        <div className="flex items-center gap-2 mb-1">
                                                                            <span className="text-xs text-gray-500">{comment.timestamp}</span>
                                                                            <span className={`text-xs px-1.5 py-0.5 rounded ${colorClass}`}>
                                                                                {comment.category}
                                                                            </span>
                                                                        </div>
                                                                        <p className="text-sm text-white">{comment.text}</p>
                                                                        <p className="text-xs text-gray-500 mt-1 truncate">
                                                                            {comment.taskName}
                                                                        </p>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                {editor.tasks.filter(t => t.frameIoComments && t.frameIoComments.length > 0).length === 0 && (
                                                    <p className="text-gray-500 text-sm text-center py-4">
                                                        Nenhum feedback detalhado disponível
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Current Alterations */}
            {currentAlterationTasks.length > 0 && (
                <div className="bg-[#12121a] border border-red-900/30 rounded-xl p-6">
                    <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                        <AlertCircle className="w-5 h-5 text-red-400" />
                        Aguardando Alteração ({currentAlterationTasks.length})
                    </h2>

                    <div className="grid gap-3">
                        {currentAlterationTasks.map(({ task, frameIoLinks }) => {
                            const assignee = task.assignees?.[0];
                            const member = assignee ? getMemberById(assignee.id) : null;
                            const editorName = member?.name || assignee?.username || 'Não atribuído';
                            const editorColor = member?.color || '#6b7280';

                            return (
                                <div
                                    key={task.id}
                                    className="bg-gray-900/50 rounded-lg p-4 flex items-center justify-between"
                                >
                                    <div className="flex items-center gap-4">
                                        <div
                                            className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold"
                                            style={{ backgroundColor: editorColor }}
                                        >
                                            {editorName.charAt(0)}
                                        </div>
                                        <div>
                                            <p className="text-white font-medium">{task.name}</p>
                                            <p className="text-gray-500 text-sm">{editorName}</p>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2">
                                        {frameIoLinks.length > 0 && (
                                            <a
                                                href={frameIoLinks[0]}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="flex items-center gap-2 px-3 py-2 bg-purple-600/20 text-purple-400 rounded-lg text-sm hover:bg-purple-600/30 transition-colors"
                                            >
                                                <Video className="w-4 h-4" />
                                                Frame.io
                                            </a>
                                        )}
                                        <a
                                            href={`https://app.clickup.com/t/${task.id}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex items-center gap-2 px-3 py-2 bg-gray-600/20 text-gray-400 rounded-lg text-sm hover:bg-gray-600/30 transition-colors"
                                        >
                                            <ExternalLink className="w-4 h-4" />
                                            ClickUp
                                        </a>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}

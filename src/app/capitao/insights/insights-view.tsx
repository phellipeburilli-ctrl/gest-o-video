'use client';

import { useState, useMemo } from 'react';
import { EditorInsight, InsightsData, ActionItem } from '@/lib/insights.service';
import { ALL_TEAMS } from '@/lib/constants';
import { EditorList, EditorListItem } from '@/components/capitao/EditorList';
import {
    AlertTriangle,
    TrendingUp,
    TrendingDown,
    Minus,
    Users,
    Target,
    Lightbulb,
    Filter,
    Award,
    AlertCircle,
    CheckCircle,
    HelpCircle,
    User
} from 'lucide-react';

interface InsightsViewProps {
    critical: EditorInsight[];
    attention: EditorInsight[];
    ok: EditorInsight[];
    summary: InsightsData['summary'];
    periodLabel: string;
    comparisonLabel: string;
    lastUpdated: number;
}

// Componente de Ação Concreta
function ActionCard({ action }: { action: ActionItem }) {
    const getPriorityColor = () => {
        if (action.priority === 'high') return 'border-red-500/50 bg-red-500/10';
        if (action.priority === 'medium') return 'border-yellow-500/50 bg-yellow-500/10';
        return 'border-green-500/30 bg-green-500/10';
    };

    const getPriorityBadge = () => {
        if (action.priority === 'high') return { text: 'URGENTE', color: 'bg-red-500 text-white' };
        if (action.priority === 'medium') return { text: 'IMPORTANTE', color: 'bg-yellow-500 text-black' };
        return { text: 'ROTINA', color: 'bg-green-500/50 text-white' };
    };

    const badge = getPriorityBadge();

    return (
        <div className={`border rounded-lg p-3 ${getPriorityColor()}`}>
            <div className="flex items-start gap-3">
                <span className="text-xl">{action.icon}</span>
                <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                        <h5 className="text-white font-medium">{action.title}</h5>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${badge.color}`}>
                            {badge.text}
                        </span>
                    </div>
                    <p className="text-gray-300 text-sm">{action.description}</p>
                </div>
            </div>
        </div>
    );
}

// Componente de Detalhe do Editor Selecionado
function EditorDetail({ insight }: { insight: EditorInsight }) {
    const getTrendIcon = () => {
        if (insight.trend === 'improving') return <TrendingDown className="w-5 h-5 text-green-400" />;
        if (insight.trend === 'worsening') return <TrendingUp className="w-5 h-5 text-red-400" />;
        return <Minus className="w-5 h-5 text-gray-400" />;
    };

    const getTrendColor = () => {
        if (insight.trend === 'improving') return 'text-green-400';
        if (insight.trend === 'worsening') return 'text-red-400';
        return 'text-gray-400';
    };

    const getTrendLabel = () => {
        if (insight.trend === 'improving') return 'Melhorando';
        if (insight.trend === 'worsening') return 'Piorando';
        return 'Estável';
    };

    return (
        <div className="space-y-6">
            {/* Header do Editor */}
            <div className="flex items-center gap-4 pb-4 border-b border-purple-900/30">
                <div
                    className="w-16 h-16 rounded-full flex items-center justify-center text-white font-bold text-2xl"
                    style={{ backgroundColor: insight.editorColor }}
                >
                    {insight.editorName.charAt(0)}
                </div>
                <div className="flex-1">
                    <h2 className="text-2xl font-bold text-white">{insight.editorName}</h2>
                    <div className="flex items-center gap-3 mt-1">
                        <span
                            className="text-sm px-3 py-1 rounded"
                            style={{ backgroundColor: `${insight.teamColor}30`, color: insight.teamColor }}
                        >
                            {insight.teamName}
                        </span>
                        <span className="text-gray-400 text-sm">
                            {insight.totalVideos} vídeos no período
                        </span>
                    </div>
                </div>
                <div className="text-right">
                    <div className={`text-4xl font-bold ${
                        insight.alterationRate >= 35 ? 'text-red-400' :
                        insight.alterationRate >= 20 ? 'text-yellow-400' : 'text-green-400'
                    }`}>
                        {insight.alterationRate}%
                    </div>
                    <div className={`flex items-center justify-end gap-1 text-sm ${getTrendColor()}`}>
                        {getTrendIcon()}
                        <span>{getTrendLabel()}</span>
                        <span className="text-gray-500">
                            ({insight.trendValue > 0 ? '+' : ''}{insight.trendValue}%)
                        </span>
                    </div>
                </div>
            </div>

            {/* Métricas */}
            <div className="grid grid-cols-3 gap-4">
                <div className="bg-[#12121a] border border-purple-900/30 rounded-lg p-4 text-center">
                    <p className="text-gray-400 text-sm">Vídeos Entregues</p>
                    <p className="text-2xl font-bold text-white mt-1">{insight.totalVideos}</p>
                </div>
                <div className="bg-[#12121a] border border-purple-900/30 rounded-lg p-4 text-center">
                    <p className="text-gray-400 text-sm">Com Alteração</p>
                    <p className={`text-2xl font-bold mt-1 ${
                        insight.videosWithAlteration > 0 ? 'text-yellow-400' : 'text-green-400'
                    }`}>
                        {insight.videosWithAlteration}
                    </p>
                </div>
                <div className="bg-[#12121a] border border-purple-900/30 rounded-lg p-4 text-center">
                    <p className="text-gray-400 text-sm">Período Anterior</p>
                    <p className="text-2xl font-bold text-gray-300 mt-1">{insight.previousAlterationRate}%</p>
                </div>
            </div>

            {/* Principal Erro */}
            {insight.topError && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
                    <h3 className="text-red-400 font-semibold flex items-center gap-2 mb-2">
                        <AlertTriangle className="w-4 h-4" />
                        Principal Erro
                    </h3>
                    <div className="flex items-center justify-between">
                        <span className="text-white text-lg font-medium">{insight.topError.category}</span>
                        <span className="text-red-400 font-bold text-xl">{insight.topError.percentage}%</span>
                    </div>
                </div>
            )}

            {/* Diagnóstico */}
            <div className="bg-white/5 rounded-lg p-4">
                <h3 className="text-gray-300 font-semibold flex items-center gap-2 mb-3">
                    📊 Diagnóstico
                </h3>
                <p className="text-white leading-relaxed">{insight.diagnosis}</p>
            </div>

            {/* AÇÕES CONCRETAS */}
            <div>
                <h3 className="text-purple-400 font-semibold flex items-center gap-2 mb-4">
                    <Lightbulb className="w-5 h-5" />
                    O que fazer agora
                </h3>
                <div className="space-y-3">
                    {insight.actions.map((action, idx) => (
                        <ActionCard key={idx} action={action} />
                    ))}
                </div>
            </div>
        </div>
    );
}

export function InsightsView({
    critical,
    attention,
    ok,
    summary,
    periodLabel,
    comparisonLabel,
    lastUpdated
}: InsightsViewProps) {
    const [selectedEditorId, setSelectedEditorId] = useState<string | number | null>(null);
    const [teamFilter, setTeamFilter] = useState<string>('all');

    // Filtrar por equipe
    const filterByTeam = (insights: EditorInsight[]) => {
        if (teamFilter === 'all') return insights;
        return insights.filter(i => i.teamId === teamFilter);
    };

    const filteredCritical = filterByTeam(critical);
    const filteredAttention = filterByTeam(attention);
    const filteredOk = filterByTeam(ok);

    // Converter EditorInsight para EditorListItem
    const editorListItems: EditorListItem[] = useMemo(() => {
        const allInsights = [...filteredCritical, ...filteredAttention, ...filteredOk];
        return allInsights.map(insight => ({
            id: insight.editorId,
            name: insight.editorName,
            teamName: insight.teamName,
            teamColor: insight.teamColor,
            editorColor: insight.editorColor,
            alterationRate: insight.alterationRate,
            totalVideos: insight.totalVideos,
            videosWithAlteration: insight.videosWithAlteration,
            trend: insight.trend,
            trendValue: insight.trendValue
        }));
    }, [filteredCritical, filteredAttention, filteredOk]);

    // Encontrar insight selecionado
    const selectedInsight = useMemo(() => {
        if (!selectedEditorId) return null;
        return [...critical, ...attention, ...ok].find(i => i.editorId === selectedEditorId);
    }, [selectedEditorId, critical, attention, ok]);

    // Handler para selecionar editor
    const handleSelectEditor = (editor: EditorListItem) => {
        setSelectedEditorId(editor.id);
    };

    return (
        <div className="flex h-[calc(100vh-80px)]">
            {/* Sidebar com lista de editores */}
            <div className="w-80 flex-shrink-0 bg-[#0a0a0f] border-r border-purple-900/30 p-4 flex flex-col">
                {/* Header da sidebar */}
                <div className="mb-4">
                    <h1 className="text-xl font-bold text-white flex items-center gap-2">
                        <Target className="w-5 h-5 text-purple-400" />
                        Insights
                    </h1>
                    <p className="text-gray-500 text-xs mt-1">{periodLabel}</p>
                </div>

                {/* Filtro por equipe */}
                <div className="mb-4">
                    <div className="flex flex-wrap gap-1">
                        <button
                            onClick={() => setTeamFilter('all')}
                            className={`px-2 py-1 rounded text-xs transition-colors ${
                                teamFilter === 'all'
                                    ? 'bg-purple-600 text-white'
                                    : 'bg-white/10 text-gray-400 hover:bg-white/20'
                            }`}
                        >
                            Todos
                        </button>
                        {ALL_TEAMS.map(team => (
                            <button
                                key={team.id}
                                onClick={() => setTeamFilter(team.id)}
                                className={`px-2 py-1 rounded text-xs transition-colors ${
                                    teamFilter === team.id
                                        ? 'text-white'
                                        : 'bg-white/10 text-gray-400 hover:bg-white/20'
                                }`}
                                style={teamFilter === team.id ? { backgroundColor: team.color } : undefined}
                            >
                                {team.shortName}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Lista de editores */}
                <div className="flex-1 overflow-hidden">
                    <EditorList
                        editors={editorListItems}
                        selectedId={selectedEditorId}
                        onSelect={handleSelectEditor}
                        title=""
                        showSearch={true}
                        compact={false}
                    />
                </div>
            </div>

            {/* Conteúdo principal */}
            <div className="flex-1 overflow-y-auto">
                {selectedInsight ? (
                    <div className="p-6">
                        <EditorDetail insight={selectedInsight} />
                    </div>
                ) : (
                    <div className="p-8 space-y-6">
                        {/* Header quando nenhum editor selecionado */}
                        <div className="flex justify-between items-start">
                            <div>
                                <h1 className="text-3xl font-bold text-white flex items-center gap-3">
                                    <Target className="w-8 h-8 text-purple-400" />
                                    Central de Insights
                                </h1>
                                <p className="text-gray-400 mt-1">
                                    Selecione um editor na lista para ver detalhes
                                </p>
                            </div>
                            <div className="text-right">
                                <div className="text-sm text-gray-500">Período analisado</div>
                                <div className="text-lg text-purple-400">{periodLabel}</div>
                                <div className="text-xs text-gray-500 mt-1">
                                    Atualizado: {new Date(lastUpdated).toLocaleString('pt-BR')}
                                </div>
                            </div>
                        </div>

                        {/* Summary Cards */}
                        <div className="grid grid-cols-4 gap-6">
                            <div className="bg-[#12121a] border border-purple-900/30 rounded-xl p-6">
                                <div className="flex items-center gap-3">
                                    <div className="w-12 h-12 rounded-lg bg-purple-600/20 flex items-center justify-center">
                                        <Users className="w-6 h-6 text-purple-400" />
                                    </div>
                                    <div>
                                        <p className="text-gray-400 text-sm">Editores Analisados</p>
                                        <p className="text-2xl font-bold text-white">{summary.totalEditors}</p>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-[#12121a] border border-red-900/30 rounded-xl p-6">
                                <div className="flex items-center gap-3">
                                    <div className="w-12 h-12 rounded-lg bg-red-600/20 flex items-center justify-center">
                                        <AlertTriangle className="w-6 h-6 text-red-400" />
                                    </div>
                                    <div>
                                        <p className="text-gray-400 text-sm">Precisam de Ajuda</p>
                                        <p className="text-2xl font-bold text-red-400">{summary.editorsNeedingHelp}</p>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-[#12121a] border border-yellow-900/30 rounded-xl p-6">
                                <div className="flex items-center gap-3">
                                    <div className="w-12 h-12 rounded-lg bg-yellow-600/20 flex items-center justify-center">
                                        <Target className="w-6 h-6 text-yellow-400" />
                                    </div>
                                    <div>
                                        <p className="text-gray-400 text-sm">Taxa Média Alteração</p>
                                        <p className={`text-2xl font-bold ${
                                            summary.avgAlterationRate >= 35 ? 'text-red-400' :
                                            summary.avgAlterationRate >= 20 ? 'text-yellow-400' : 'text-green-400'
                                        }`}>
                                            {summary.avgAlterationRate}%
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-[#12121a] border border-blue-900/30 rounded-xl p-6">
                                <div className="flex items-center gap-3">
                                    <div className="w-12 h-12 rounded-lg bg-blue-600/20 flex items-center justify-center">
                                        <HelpCircle className="w-6 h-6 text-blue-400" />
                                    </div>
                                    <div>
                                        <p className="text-gray-400 text-sm">Erro Mais Comum</p>
                                        <p className="text-lg font-bold text-white truncate">{summary.mostCommonError}</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Instrução */}
                        <div className="bg-purple-600/10 border border-purple-500/30 rounded-xl p-8 text-center">
                            <User className="w-16 h-16 text-purple-400 mx-auto mb-4" />
                            <h3 className="text-xl text-white font-semibold mb-2">
                                Selecione um editor
                            </h3>
                            <p className="text-gray-400">
                                Clique em um editor na lista à esquerda para ver o diagnóstico detalhado e ações recomendadas
                            </p>
                        </div>

                        {/* Legenda */}
                        <div className="bg-[#12121a] border border-white/10 rounded-xl p-4">
                            <h4 className="text-gray-400 text-sm font-semibold mb-3">Classificação por Taxa de Alteração</h4>
                            <div className="grid grid-cols-3 gap-4 text-sm">
                                <div className="flex items-center gap-2">
                                    <div className="w-3 h-3 rounded-full bg-red-500" />
                                    <span className="text-gray-300">Crítico: ≥ 35% alteração</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className="w-3 h-3 rounded-full bg-yellow-500" />
                                    <span className="text-gray-300">Atenção: 20% - 35% alteração</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className="w-3 h-3 rounded-full bg-green-500" />
                                    <span className="text-gray-300">OK: &lt; 20% alteração</span>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

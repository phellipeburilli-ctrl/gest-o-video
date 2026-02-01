'use client';

import { useState } from 'react';
import { DashboardKPIs, NormalizedTask } from '@/types';
import { ALL_TEAMS, getTeamByMemberName, TeamMember } from '@/lib/constants';
import {
    Award,
    Clock,
    AlertCircle,
    CheckCircle,
    TrendingUp,
    Calendar,
    Shield,
    User,
    AlertTriangle
} from 'lucide-react';

interface EvolucaoViewProps {
    kpis: DashboardKPIs;
    allVideos: NormalizedTask[];
    lastUpdated: number;
}

// Datas de admissão dos editores
const ADMISSION_DATES: Record<number, number> = {
    // VSL
    248675265: new Date('2026-01-15').getTime(), // Nathan Soares
    84070913: new Date('2026-01-26').getTime(),  // Victor Mazzine
    // Funil
    112053206: new Date('2026-01-28').getTime(), // Moises Ramalho
    152605916: new Date('2026-01-28').getTime(), // Victor Mendes
    3258937: new Date('2025-08-19').getTime(),   // Renato Fernandes
    3272897: new Date('2025-07-29').getTime(),   // Douglas Prado
    // ADs
    96683026: new Date('2026-01-15').getTime(),  // Leonardo da Silva
    84241154: new Date('2026-01-27').getTime(),  // Rafael Andrade
    // TP/MIC/LEAD
    82093531: new Date('2025-08-01').getTime(),  // Loren Gayoso
    82074101: new Date('2025-11-19').getTime(),  // Bruno Cesar
};

interface EditorEvolution {
    member: TeamMember;
    teamName: string;
    teamColor: string;
    admissionDate: number;
    monthsInCompany: number;
    daysUntilPromotion: number;
    alterationRate: number;
    alterationRateLast2Months: number;
    status: 'on_track' | 'attention' | 'risk' | 'promoted' | 'audit_mode';
    isInAuditMode: boolean;
    canBePromoted: boolean;
    videosCount: number;
    initials: string;
}

function calculateMonthsDiff(start: number, end: number): number {
    const startDate = new Date(start);
    const endDate = new Date(end);
    return (endDate.getFullYear() - startDate.getFullYear()) * 12 +
        (endDate.getMonth() - startDate.getMonth());
}

function getInitials(name: string): string {
    return name
        .split(' ')
        .map(n => n[0])
        .join('')
        .substring(0, 2)
        .toUpperCase();
}

export function EvolucaoView({ kpis, allVideos, lastUpdated }: EvolucaoViewProps) {
    const [selectedEditorId, setSelectedEditorId] = useState<number | null>(null);
    const now = Date.now();

    // Calculate last 2 months range
    const twoMonthsAgo = new Date();
    twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);
    const twoMonthsAgoTimestamp = twoMonthsAgo.getTime();

    // Build evolution data for each editor
    const editorsEvolution: EditorEvolution[] = [];

    ALL_TEAMS.forEach(team => {
        team.members.forEach(member => {
            if (member.role === 'leader') return;

            const admissionDate = ADMISSION_DATES[member.id];
            if (!admissionDate) return;

            const monthsInCompany = calculateMonthsDiff(admissionDate, now);
            const daysUntilPromotion = Math.max(0, 365 - Math.floor((now - admissionDate) / (1000 * 60 * 60 * 24)));

            const editorStats = kpis.editors.find(e =>
                e.editorName.toLowerCase() === member.name.toLowerCase()
            );

            const editorVideosLast2Months = allVideos.filter(v => {
                if (v.editorName.toLowerCase() !== member.name.toLowerCase()) return false;
                if (!v.dateClosed) return false;
                return v.dateClosed >= twoMonthsAgoTimestamp;
            });

            const videosWithAlteration = editorVideosLast2Months.filter(v =>
                v.phaseTime?.alterationTimeMs && v.phaseTime.alterationTimeMs > 0
            ).length;

            const alterationRateLast2Months = editorVideosLast2Months.length > 0
                ? (videosWithAlteration / editorVideosLast2Months.length) * 100
                : 0;

            const alterationRate = editorStats?.phaseMetrics?.alterationRate || 0;

            const isInAuditMode = monthsInCompany >= 10 && monthsInCompany < 12;
            let status: EditorEvolution['status'] = 'on_track';

            if (monthsInCompany >= 12 && alterationRateLast2Months <= 5) {
                status = 'promoted';
            } else if (isInAuditMode) {
                status = 'audit_mode';
            } else if (alterationRateLast2Months > 10) {
                status = 'risk';
            } else if (alterationRateLast2Months > 5) {
                status = 'attention';
            }

            const canBePromoted = monthsInCompany >= 12 && alterationRateLast2Months <= 5;

            editorsEvolution.push({
                member,
                teamName: team.name,
                teamColor: team.color,
                admissionDate,
                monthsInCompany,
                daysUntilPromotion,
                alterationRate,
                alterationRateLast2Months: parseFloat(alterationRateLast2Months.toFixed(1)),
                status,
                isInAuditMode,
                canBePromoted,
                videosCount: editorVideosLast2Months.length,
                initials: getInitials(member.name),
            });
        });
    });

    // Sort by months in company (closest to promotion first)
    editorsEvolution.sort((a, b) => b.monthsInCompany - a.monthsInCompany);

    const selectedEditor = selectedEditorId
        ? editorsEvolution.find(e => e.member.id === selectedEditorId)
        : null;

    const statusConfig = {
        on_track: { color: 'text-green-400', bg: 'bg-green-600/20', border: 'border-green-500/30', icon: CheckCircle, label: 'No Caminho' },
        attention: { color: 'text-amber-400', bg: 'bg-amber-600/20', border: 'border-amber-500/30', icon: AlertCircle, label: 'Atenção' },
        risk: { color: 'text-red-400', bg: 'bg-red-600/20', border: 'border-red-500/30', icon: AlertTriangle, label: 'Risco' },
        promoted: { color: 'text-purple-400', bg: 'bg-purple-600/20', border: 'border-purple-500/30', icon: Award, label: 'Apto p/ Pleno' },
        audit_mode: { color: 'text-blue-400', bg: 'bg-blue-600/20', border: 'border-blue-500/30', icon: Shield, label: 'Auditoria' },
    };

    const editorsInAudit = editorsEvolution.filter(e => e.isInAuditMode);
    const editorsReadyForPromotion = editorsEvolution.filter(e => e.canBePromoted);
    const editorsAtRisk = editorsEvolution.filter(e => e.status === 'risk' || e.status === 'attention');

    return (
        <div className="p-6">
            {/* Header compacto */}
            <div className="flex justify-between items-start mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                        <TrendingUp className="w-6 h-6 text-purple-400" />
                        Evolução de Time
                    </h1>
                    <p className="text-gray-500 text-sm">
                        {editorsEvolution.length} editores • {editorsReadyForPromotion.length} aptos para pleno
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

                    {/* Lista de editores */}
                    <div className="space-y-1 max-h-[calc(100vh-200px)] overflow-y-auto">
                        {editorsEvolution.map(editor => {
                            const config = statusConfig[editor.status];
                            const progressPercent = Math.min(100, (editor.monthsInCompany / 12) * 100);

                            return (
                                <div
                                    key={editor.member.id}
                                    onClick={() => setSelectedEditorId(editor.member.id)}
                                    className={`
                                        flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all
                                        ${selectedEditorId === editor.member.id
                                            ? 'bg-purple-600/30 border border-purple-500/50'
                                            : 'bg-[#12121a] border border-transparent hover:border-purple-500/30'
                                        }
                                    `}
                                >
                                    <div
                                        className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
                                        style={{ backgroundColor: editor.member.color }}
                                    >
                                        {editor.initials}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className="text-white font-medium truncate">{editor.member.name}</span>
                                            {editor.status === 'risk' && (
                                                <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
                                            )}
                                            {editor.isInAuditMode && (
                                                <Shield className="w-4 h-4 text-blue-400 flex-shrink-0" />
                                            )}
                                            {editor.canBePromoted && (
                                                <Award className="w-4 h-4 text-purple-400 flex-shrink-0" />
                                            )}
                                        </div>
                                        <span className="text-gray-500 text-xs">
                                            {editor.monthsInCompany}/12 meses • {editor.alterationRateLast2Months}% alteração
                                        </span>
                                    </div>
                                    <div className="text-right flex-shrink-0">
                                        <span className={`text-lg font-bold ${config.color}`}>
                                            {progressPercent.toFixed(0)}%
                                        </span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Área de conteúdo */}
                <div className="flex-1 min-w-0">
                    {selectedEditor ? (
                        /* Detalhes do editor selecionado */
                        <div className="space-y-4">
                            {/* Header do editor */}
                            <div className="bg-[#12121a] border border-purple-900/30 rounded-xl p-4">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div
                                            className="w-14 h-14 rounded-full flex items-center justify-center text-white font-bold text-xl"
                                            style={{ backgroundColor: selectedEditor.member.color }}
                                        >
                                            {selectedEditor.initials}
                                        </div>
                                        <div>
                                            <h2 className="text-xl font-bold text-white">{selectedEditor.member.name}</h2>
                                            <p className="text-gray-500 text-sm">{selectedEditor.teamName}</p>
                                        </div>
                                    </div>
                                    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full ${statusConfig[selectedEditor.status].bg}`}>
                                        {(() => {
                                            const StatusIcon = statusConfig[selectedEditor.status].icon;
                                            return <StatusIcon className={`w-4 h-4 ${statusConfig[selectedEditor.status].color}`} />;
                                        })()}
                                        <span className={`text-sm font-medium ${statusConfig[selectedEditor.status].color}`}>
                                            {statusConfig[selectedEditor.status].label}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* Barra de progresso */}
                            <div className="bg-[#12121a] border border-purple-900/30 rounded-xl p-4">
                                <div className="flex justify-between text-sm mb-2">
                                    <span className="text-gray-400">Progresso para 12 meses</span>
                                    <span className="text-white font-medium">{selectedEditor.monthsInCompany}/12 meses</span>
                                </div>
                                <div className="h-4 bg-gray-800 rounded-full overflow-hidden">
                                    <div
                                        className="h-full rounded-full transition-all duration-500"
                                        style={{
                                            width: `${Math.min(100, (selectedEditor.monthsInCompany / 12) * 100)}%`,
                                            backgroundColor: selectedEditor.isInAuditMode ? '#3b82f6' :
                                                selectedEditor.canBePromoted ? '#a855f7' :
                                                    selectedEditor.member.color
                                        }}
                                    />
                                </div>
                                {selectedEditor.isInAuditMode && (
                                    <p className="text-blue-400 text-xs mt-2 flex items-center gap-1">
                                        <Shield className="w-3 h-3" />
                                        Modo Auditoria ativo - monitoramento intensivo nos meses 11 e 12
                                    </p>
                                )}
                            </div>

                            {/* Métricas */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="bg-[#12121a] border border-purple-900/30 rounded-xl p-4">
                                    <p className="text-gray-500 text-xs mb-1">Data de Admissão</p>
                                    <p className="text-white font-bold text-lg">
                                        {new Date(selectedEditor.admissionDate).toLocaleDateString('pt-BR')}
                                    </p>
                                </div>
                                <div className="bg-[#12121a] border border-purple-900/30 rounded-xl p-4">
                                    <p className="text-gray-500 text-xs mb-1">Dias para Promoção</p>
                                    <p className={`font-bold text-lg ${selectedEditor.daysUntilPromotion === 0 ? 'text-purple-400' : 'text-white'}`}>
                                        {selectedEditor.daysUntilPromotion === 0 ? 'Elegível!' : `${selectedEditor.daysUntilPromotion} dias`}
                                    </p>
                                </div>
                                <div className="bg-[#12121a] border border-purple-900/30 rounded-xl p-4">
                                    <p className="text-gray-500 text-xs mb-1">Taxa Alteração (2 meses)</p>
                                    <p className={`font-bold text-lg ${
                                        selectedEditor.alterationRateLast2Months <= 5 ? 'text-green-400' :
                                        selectedEditor.alterationRateLast2Months <= 10 ? 'text-amber-400' : 'text-red-400'
                                    }`}>
                                        {selectedEditor.alterationRateLast2Months}%
                                        <span className="text-gray-500 text-xs font-normal ml-1">(meta: ≤5%)</span>
                                    </p>
                                </div>
                                <div className="bg-[#12121a] border border-purple-900/30 rounded-xl p-4">
                                    <p className="text-gray-500 text-xs mb-1">Vídeos (2 meses)</p>
                                    <p className="text-white font-bold text-lg">{selectedEditor.videosCount}</p>
                                </div>
                            </div>

                            {/* Status de promoção */}
                            {selectedEditor.canBePromoted && (
                                <div className="p-4 bg-purple-950/50 border border-purple-500/30 rounded-xl">
                                    <p className="text-purple-400 flex items-center gap-2">
                                        <Award className="w-5 h-5" />
                                        <strong>{selectedEditor.member.name}</strong> atende todos os critérios para promoção a Pleno!
                                    </p>
                                </div>
                            )}

                            {selectedEditor.status === 'risk' && (
                                <div className="p-4 bg-red-950/50 border border-red-500/30 rounded-xl">
                                    <p className="text-red-400 flex items-center gap-2">
                                        <AlertTriangle className="w-5 h-5" />
                                        Taxa de alteração acima de 10% - necessário acompanhamento urgente
                                    </p>
                                </div>
                            )}

                            {selectedEditor.status === 'attention' && (
                                <div className="p-4 bg-amber-950/50 border border-amber-500/30 rounded-xl">
                                    <p className="text-amber-400 flex items-center gap-2">
                                        <AlertCircle className="w-5 h-5" />
                                        Taxa de alteração entre 5-10% - monitorar nas próximas semanas
                                    </p>
                                </div>
                            )}
                        </div>
                    ) : (
                        /* Visão geral quando nenhum editor selecionado */
                        <div className="space-y-4">
                            {/* Cards de resumo */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="bg-[#12121a] border border-purple-900/30 rounded-xl p-4">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-lg bg-purple-600/20 flex items-center justify-center">
                                            <Award className="w-5 h-5 text-purple-400" />
                                        </div>
                                        <div>
                                            <p className="text-gray-400 text-sm">Aptos para Pleno</p>
                                            <p className="text-2xl font-bold text-purple-400">{editorsReadyForPromotion.length}</p>
                                        </div>
                                    </div>
                                </div>

                                <div className="bg-[#12121a] border border-blue-900/30 rounded-xl p-4">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-lg bg-blue-600/20 flex items-center justify-center">
                                            <Shield className="w-5 h-5 text-blue-400" />
                                        </div>
                                        <div>
                                            <p className="text-gray-400 text-sm">Em Auditoria</p>
                                            <p className="text-2xl font-bold text-blue-400">{editorsInAudit.length}</p>
                                        </div>
                                    </div>
                                </div>

                                <div className="bg-[#12121a] border border-red-900/30 rounded-xl p-4">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-lg bg-red-600/20 flex items-center justify-center">
                                            <AlertTriangle className="w-5 h-5 text-red-400" />
                                        </div>
                                        <div>
                                            <p className="text-gray-400 text-sm">Em Risco/Atenção</p>
                                            <p className="text-2xl font-bold text-red-400">{editorsAtRisk.length}</p>
                                        </div>
                                    </div>
                                </div>

                                <div className="bg-[#12121a] border border-green-900/30 rounded-xl p-4">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-lg bg-green-600/20 flex items-center justify-center">
                                            <CheckCircle className="w-5 h-5 text-green-400" />
                                        </div>
                                        <div>
                                            <p className="text-gray-400 text-sm">No Caminho</p>
                                            <p className="text-2xl font-bold text-green-400">
                                                {editorsEvolution.filter(e => e.status === 'on_track').length}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Critérios */}
                            <div className="bg-purple-950/30 border border-purple-900/50 rounded-xl p-4">
                                <h3 className="text-purple-400 font-medium mb-3 text-sm">Critérios para Promoção Junior → Pleno</h3>
                                <div className="grid grid-cols-3 gap-4 text-sm">
                                    <div className="flex items-start gap-2">
                                        <Calendar className="w-4 h-4 text-purple-400 mt-0.5" />
                                        <div>
                                            <p className="text-white font-medium">12 meses</p>
                                            <p className="text-gray-500 text-xs">Tempo mínimo</p>
                                        </div>
                                    </div>
                                    <div className="flex items-start gap-2">
                                        <CheckCircle className="w-4 h-4 text-purple-400 mt-0.5" />
                                        <div>
                                            <p className="text-white font-medium">≤ 5% alteração</p>
                                            <p className="text-gray-500 text-xs">Últimos 2 meses</p>
                                        </div>
                                    </div>
                                    <div className="flex items-start gap-2">
                                        <Shield className="w-4 h-4 text-purple-400 mt-0.5" />
                                        <div>
                                            <p className="text-white font-medium">Auditoria</p>
                                            <p className="text-gray-500 text-xs">Meses 11 e 12</p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Instrução */}
                            <div className="bg-[#12121a] border border-purple-900/30 rounded-xl p-8 text-center">
                                <User className="w-12 h-12 text-purple-400 mx-auto mb-3" />
                                <h3 className="text-white font-medium mb-1">Selecione um editor</h3>
                                <p className="text-gray-500 text-sm">
                                    Clique em um editor na lista para ver o progresso detalhado
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

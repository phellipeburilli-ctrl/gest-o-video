/**
 * Insights Service - Sistema de Ajuda Inteligente
 * Identifica editores que precisam de ajuda e gera recomendações
 */

import { NormalizedTask } from '@/types';
import { ALL_TEAMS, getTeamByMemberName, getMemberByName, Team, TeamMember } from './constants';
import { FeedbackCategory } from './frameio-api.service';

// ============================================
// TIPOS
// ============================================

export type UrgencyLevel = 'critical' | 'attention' | 'ok';

export interface ErrorPattern {
    category: string;
    count: number;
    percentage: number;
}

export interface ActionItem {
    type: 'conversation' | 'training' | 'process' | 'recognition' | 'observation';
    priority: 'high' | 'medium' | 'low';
    title: string;
    description: string;
    icon: string;
}

export interface EditorInsight {
    // Identificação
    editorId: number;
    editorName: string;
    teamId: string;
    teamName: string;
    teamColor: string;
    editorColor: string;

    // Métricas atuais (período atual)
    totalVideos: number;
    videosWithAlteration: number;
    alterationRate: number;

    // Métricas anteriores (para comparação)
    previousVideos: number;
    previousAlterationRate: number;

    // Tendência
    trend: 'improving' | 'stable' | 'worsening';
    trendValue: number; // diferença em pontos percentuais

    // Padrões de erro (do Frame.io)
    errorPatterns: ErrorPattern[];
    topError: ErrorPattern | null;

    // Score de urgência (0-100)
    urgencyScore: number;
    urgencyLevel: UrgencyLevel;

    // Recomendações CONCRETAS
    actions: ActionItem[];

    // Diagnóstico em texto
    diagnosis: string;
}

export interface InsightsData {
    // Editores agrupados por urgência
    critical: EditorInsight[];   // Score > 70
    attention: EditorInsight[];  // Score 40-70
    ok: EditorInsight[];         // Score < 40

    // Resumo geral
    summary: {
        totalEditors: number;
        editorsNeedingHelp: number;
        avgAlterationRate: number;
        mostCommonError: string;
    };

    // Metadata
    periodLabel: string;
    comparisonLabel: string;
    lastUpdated: number;
}

// ============================================
// AÇÕES ESPECÍFICAS POR TIPO DE PROBLEMA
// ============================================

const ERROR_SPECIFIC_ACTIONS: Record<string, ActionItem[]> = {
    'Áudio/Voz': [
        {
            type: 'training',
            priority: 'high',
            title: 'Treinamento de áudio',
            description: 'Revisar tutorial de mixagem: níveis -6dB para voz, -12dB para música de fundo',
            icon: '🎧'
        },
        {
            type: 'process',
            priority: 'medium',
            title: 'Checklist de áudio',
            description: 'Implementar verificação obrigatória de áudio antes de enviar para revisão',
            icon: '✅'
        }
    ],
    'Legenda/Texto': [
        {
            type: 'training',
            priority: 'high',
            title: 'Revisão de legendas',
            description: 'Mostrar exemplos de legendas corretas vs erradas. Focar em: timing, ortografia, quebra de linha',
            icon: '📝'
        },
        {
            type: 'process',
            priority: 'medium',
            title: 'Revisão ortográfica',
            description: 'Usar verificador ortográfico antes de exportar. Considerar Grammarly/LanguageTool',
            icon: '🔍'
        }
    ],
    'Corte/Transição': [
        {
            type: 'training',
            priority: 'high',
            title: 'Workshop de ritmo',
            description: 'Estudar referências de corte do setor. Analisar 3 vídeos aprovados de primeira',
            icon: '🎬'
        },
        {
            type: 'observation',
            priority: 'medium',
            title: 'Shadowing',
            description: 'Acompanhar editor sênior em 2 projetos para absorver técnicas de corte',
            icon: '👀'
        }
    ],
    'Fonte/Tipografia': [
        {
            type: 'process',
            priority: 'high',
            title: 'Guia de estilo',
            description: 'Revisar manual de tipografia da marca. Criar atalhos no editor para fontes padrão',
            icon: '🔤'
        }
    ],
    'Cor/Imagem': [
        {
            type: 'training',
            priority: 'high',
            title: 'Correção de cor',
            description: 'Treinar uso de LUTs padrão do setor. Calibrar monitor se necessário',
            icon: '🎨'
        }
    ],
    'Timing/Sincronização': [
        {
            type: 'training',
            priority: 'high',
            title: 'Sincronização A/V',
            description: 'Praticar alinhamento de áudio com vídeo. Usar waveform como guia visual',
            icon: '⏱️'
        }
    ],
    'Logo/Marca': [
        {
            type: 'process',
            priority: 'medium',
            title: 'Templates de marca',
            description: 'Usar templates pré-aprovados com logos já posicionados corretamente',
            icon: '🏷️'
        }
    ],
    'CTA/Preço': [
        {
            type: 'process',
            priority: 'high',
            title: 'Validação de CTA',
            description: 'Sempre confirmar valores e CTAs com o briefing antes de exportar',
            icon: '💰'
        }
    ],
    'Footage/Vídeo': [
        {
            type: 'training',
            priority: 'medium',
            title: 'Seleção de footage',
            description: 'Revisar biblioteca de assets aprovados. Evitar footage de baixa qualidade',
            icon: '🎥'
        }
    ]
};

// ============================================
// FUNÇÕES PRINCIPAIS
// ============================================

/**
 * Calcula o score de urgência (0-100)
 * Quanto MAIOR, mais urgente a ajuda
 *
 * REGRA PRINCIPAL: Taxa < 35% = nunca é crítico
 */
export function calculateUrgencyScore(
    alterationRate: number,
    topErrorPercentage: number,
    trendValue: number
): number {
    let score = 0;

    // 1. Taxa de alteração atual (peso 50% - mais importante)
    if (alterationRate >= 50) score += 50;      // Muito crítico
    else if (alterationRate >= 35) score += 40; // Crítico
    else if (alterationRate >= 25) score += 25; // Atenção
    else if (alterationRate >= 15) score += 15; // Monitorar
    else score += 5;                             // OK

    // 2. Tendência de piora (peso 30%)
    if (trendValue > 15) score += 30;      // Piorou muito
    else if (trendValue > 10) score += 25; // Piorou bastante
    else if (trendValue > 5) score += 15;  // Piorou um pouco
    else if (trendValue > 0) score += 5;   // Estável/leve piora
    else score += 0;                        // Melhorando!

    // 3. Concentração de erro (peso 20%)
    if (topErrorPercentage >= 60) score += 20;
    else if (topErrorPercentage >= 40) score += 10;
    else score += 0;

    return Math.min(100, Math.max(0, score));
}

/**
 * Determina o nível de urgência baseado APENAS na taxa de alteração
 *
 * REGRAS SIMPLES (cada pessoa aparece em apenas um grupo):
 * - Crítico: >= 35% alteração
 * - Atenção: 20-35% alteração
 * - OK: < 20% alteração
 */
export function getUrgencyLevel(score: number, alterationRate?: number): UrgencyLevel {
    if (alterationRate === undefined) {
        // Fallback para score se não tiver taxa
        if (score >= 65) return 'critical';
        if (score >= 35) return 'attention';
        return 'ok';
    }

    // Regra baseada APENAS na taxa de alteração
    if (alterationRate >= 35) return 'critical';
    if (alterationRate >= 20) return 'attention';
    return 'ok';
}

/**
 * Gera ações concretas baseadas nos dados do editor
 */
export function generateActions(
    editorName: string,
    trend: 'improving' | 'stable' | 'worsening',
    topError: ErrorPattern | null,
    alterationRate: number,
    videosWithAlteration: number,
    totalVideos: number
): ActionItem[] {
    const actions: ActionItem[] = [];

    // CASO 1: Performance EXCELENTE (< 10% alteração)
    if (alterationRate < 10 && totalVideos >= 3) {
        actions.push({
            type: 'recognition',
            priority: 'low',
            title: 'Reconhecer publicamente',
            description: `Destacar ${editorName} na reunião semanal como referência de qualidade`,
            icon: '🏆'
        });
        actions.push({
            type: 'process',
            priority: 'medium',
            title: 'Mentoria',
            description: `Considerar ${editorName} como mentor para editores com dificuldade`,
            icon: '🎓'
        });
        return actions;
    }

    // CASO 2: Melhorando (tendência positiva)
    if (trend === 'improving') {
        actions.push({
            type: 'recognition',
            priority: 'medium',
            title: 'Feedback positivo',
            description: `Reconhecer evolução de ${editorName}: taxa caiu ${Math.abs(alterationRate)}% vs período anterior`,
            icon: '📈'
        });
    }

    // CASO 3: Taxa CRÍTICA (>= 35%)
    if (alterationRate >= 35) {
        actions.push({
            type: 'conversation',
            priority: 'high',
            title: '1:1 urgente',
            description: `Agendar conversa com ${editorName} HOJE. Perguntar: "O que está dificultando seu trabalho?"`,
            icon: '🚨'
        });
        actions.push({
            type: 'observation',
            priority: 'high',
            title: 'Acompanhamento diário',
            description: `Revisar TODOS os vídeos de ${editorName} antes de ir para aprovação por 1 semana`,
            icon: '👁️'
        });
    }

    // CASO 4: Taxa ATENÇÃO (20-35%)
    else if (alterationRate >= 20) {
        actions.push({
            type: 'conversation',
            priority: 'medium',
            title: 'Check-in semanal',
            description: `Conversa rápida com ${editorName}: "Como posso te ajudar a reduzir alterações?"`,
            icon: '💬'
        });
    }

    // CASO 5: Ações específicas baseadas no tipo de erro
    if (topError && topError.percentage >= 25) {
        const specificActions = ERROR_SPECIFIC_ACTIONS[topError.category];
        if (specificActions) {
            actions.push(...specificActions.map(a => ({
                ...a,
                description: a.description.replace('{editor}', editorName)
            })));
        }
    }

    // CASO 6: Piorando (tendência negativa)
    if (trend === 'worsening' && actions.length < 3) {
        actions.push({
            type: 'conversation',
            priority: 'high',
            title: 'Investigar piora',
            description: `${editorName} piorou vs período anterior. Verificar: sobrecarga? problemas pessoais? falta de clareza no briefing?`,
            icon: '📉'
        });
    }

    // CASO 7: Poucos vídeos (pode não ser representativo)
    if (totalVideos < 3 && actions.length === 0) {
        actions.push({
            type: 'observation',
            priority: 'low',
            title: 'Aguardar mais dados',
            description: `${editorName} tem apenas ${totalVideos} vídeo(s). Continuar monitorando para análise mais precisa`,
            icon: '⏳'
        });
    }

    // Se não tem ações específicas, dar uma genérica útil
    if (actions.length === 0) {
        actions.push({
            type: 'observation',
            priority: 'low',
            title: 'Manter acompanhamento',
            description: `${editorName} está dentro da meta. Verificar novamente na próxima semana`,
            icon: '✅'
        });
    }

    return actions;
}

/**
 * Gera diagnóstico em texto explicando a situação
 */
export function generateDiagnosis(
    editorName: string,
    alterationRate: number,
    videosWithAlteration: number,
    totalVideos: number,
    trend: 'improving' | 'stable' | 'worsening',
    trendValue: number,
    topError: ErrorPattern | null
): string {
    const parts: string[] = [];

    // Volume
    if (totalVideos === 0) {
        return `${editorName} não entregou vídeos no período analisado.`;
    }

    // Taxa de alteração
    if (alterationRate >= 35) {
        parts.push(`⚠️ Taxa de alteração CRÍTICA: ${videosWithAlteration} de ${totalVideos} vídeos precisaram de correção (${alterationRate}%)`);
    } else if (alterationRate >= 20) {
        parts.push(`Taxa de alteração ACIMA da meta: ${videosWithAlteration} de ${totalVideos} vídeos com alteração (${alterationRate}%)`);
    } else if (alterationRate > 0) {
        parts.push(`Taxa de alteração DENTRO da meta: ${videosWithAlteration} de ${totalVideos} vídeos com alteração (${alterationRate}%)`);
    } else {
        parts.push(`🎯 ZERO alterações em ${totalVideos} vídeos! Performance excelente.`);
    }

    // Tendência
    if (trend === 'improving') {
        parts.push(`📈 Melhorou ${Math.abs(trendValue)}% comparado ao período anterior.`);
    } else if (trend === 'worsening') {
        parts.push(`📉 Piorou ${trendValue}% comparado ao período anterior.`);
    }

    // Padrão de erro
    if (topError && topError.percentage >= 30) {
        parts.push(`🔍 Principal problema: ${topError.category} (${topError.percentage}% dos erros)`);
    }

    return parts.join(' ');
}

/**
 * Calcula padrões de erro a partir de feedbacks categorizados
 */
export function calculateErrorPatterns(
    feedbackCategories: Record<string, number>
): ErrorPattern[] {
    const total = Object.values(feedbackCategories).reduce((a, b) => a + b, 0);
    if (total === 0) return [];

    return Object.entries(feedbackCategories)
        .map(([category, count]) => ({
            category,
            count,
            percentage: Math.round((count / total) * 100),
        }))
        .sort((a, b) => b.count - a.count);
}

/**
 * Calcula insights para um editor específico
 */
export function calculateEditorInsight(
    editorName: string,
    currentVideos: NormalizedTask[],
    previousVideos: NormalizedTask[],
    feedbackCategories?: Record<string, number>
): EditorInsight | null {
    const member = getMemberByName(editorName);
    const team = getTeamByMemberName(editorName);

    if (!member || !team) return null;

    // Métricas atuais
    const totalVideos = currentVideos.length;
    const videosWithAlteration = currentVideos.filter(
        v => v.phaseTime?.alterationTimeMs && v.phaseTime.alterationTimeMs > 0
    ).length;
    const alterationRate = totalVideos > 0
        ? Math.round((videosWithAlteration / totalVideos) * 100)
        : 0;

    // Métricas anteriores
    const prevTotal = previousVideos.length;
    const prevWithAlteration = previousVideos.filter(
        v => v.phaseTime?.alterationTimeMs && v.phaseTime.alterationTimeMs > 0
    ).length;
    const previousAlterationRate = prevTotal > 0
        ? Math.round((prevWithAlteration / prevTotal) * 100)
        : 0;

    // Tendência
    const trendValue = alterationRate - previousAlterationRate;
    let trend: 'improving' | 'stable' | 'worsening' = 'stable';
    if (trendValue < -5) trend = 'improving';
    else if (trendValue > 5) trend = 'worsening';

    // Padrões de erro
    const errorPatterns = feedbackCategories
        ? calculateErrorPatterns(feedbackCategories)
        : [];
    const topError = errorPatterns.length > 0 ? errorPatterns[0] : null;

    // Score de urgência
    const topErrorPercentage = topError?.percentage || 0;
    const urgencyScore = calculateUrgencyScore(alterationRate, topErrorPercentage, trendValue);
    const urgencyLevel = getUrgencyLevel(urgencyScore, alterationRate);

    // Gerar ações concretas
    const actions = generateActions(
        member.name,
        trend,
        topError,
        alterationRate,
        videosWithAlteration,
        totalVideos
    );

    // Gerar diagnóstico
    const diagnosis = generateDiagnosis(
        member.name,
        alterationRate,
        videosWithAlteration,
        totalVideos,
        trend,
        trendValue,
        topError
    );

    return {
        editorId: member.id,
        editorName: member.name,
        teamId: team.id,
        teamName: team.name,
        teamColor: team.color,
        editorColor: member.color,
        totalVideos,
        videosWithAlteration,
        alterationRate,
        previousVideos: prevTotal,
        previousAlterationRate,
        trend,
        trendValue,
        errorPatterns,
        topError,
        urgencyScore,
        urgencyLevel,
        actions,
        diagnosis,
    };
}

/**
 * Calcula insights para todos os editores
 */
export function calculateAllInsights(
    currentVideos: NormalizedTask[],
    previousVideos: NormalizedTask[],
    editorFeedbacks?: Map<string, Record<string, number>>
): InsightsData {
    const insights: EditorInsight[] = [];

    // Agrupar vídeos por editor
    const currentByEditor = new Map<string, NormalizedTask[]>();
    const previousByEditor = new Map<string, NormalizedTask[]>();

    currentVideos.forEach(v => {
        const list = currentByEditor.get(v.editorName) || [];
        list.push(v);
        currentByEditor.set(v.editorName, list);
    });

    previousVideos.forEach(v => {
        const list = previousByEditor.get(v.editorName) || [];
        list.push(v);
        previousByEditor.set(v.editorName, list);
    });

    // Calcular insight para cada editor conhecido
    ALL_TEAMS.forEach(team => {
        team.members.forEach(member => {
            if (member.role === 'leader') return; // Pular líderes

            const current = currentByEditor.get(member.name) || [];
            const previous = previousByEditor.get(member.name) || [];
            const feedbacks = editorFeedbacks?.get(member.name);

            const insight = calculateEditorInsight(member.name, current, previous, feedbacks);
            if (insight) {
                insights.push(insight);
            }
        });
    });

    // Ordenar por score de urgência (maior primeiro)
    insights.sort((a, b) => b.urgencyScore - a.urgencyScore);

    // Agrupar por nível
    const critical = insights.filter(i => i.urgencyLevel === 'critical');
    const attention = insights.filter(i => i.urgencyLevel === 'attention');
    const ok = insights.filter(i => i.urgencyLevel === 'ok');

    // Calcular resumo
    const totalEditors = insights.length;
    const editorsNeedingHelp = critical.length + attention.length;
    const avgAlterationRate = insights.length > 0
        ? Math.round(insights.reduce((acc, i) => acc + i.alterationRate, 0) / insights.length)
        : 0;

    // Erro mais comum (consolidado)
    const allErrors = new Map<string, number>();
    insights.forEach(i => {
        i.errorPatterns.forEach(e => {
            allErrors.set(e.category, (allErrors.get(e.category) || 0) + e.count);
        });
    });
    const mostCommonError = Array.from(allErrors.entries())
        .sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A';

    return {
        critical,
        attention,
        ok,
        summary: {
            totalEditors,
            editorsNeedingHelp,
            avgAlterationRate,
            mostCommonError,
        },
        periodLabel: 'Últimas 2 semanas',
        comparisonLabel: '2 semanas anteriores',
        lastUpdated: Date.now(),
    };
}

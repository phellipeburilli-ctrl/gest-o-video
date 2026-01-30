// ============================================
// ESTRUTURA DE EQUIPES AUDIOVISUAL
// ============================================

// Tipos de função na equipe
export type TeamRole = 'leader' | 'editor';

// Interface para membro da equipe
export interface TeamMember {
    id: number;
    name: string;
    role: TeamRole;
    color: string; // Cor fixa do editor
}

// Interface para equipe
export interface Team {
    id: string;
    name: string;
    shortName: string;
    description: string;
    color: string;
    members: TeamMember[];
    // IDs dos editores para cálculo de média (exclui líderes)
    editorIds: number[];
    // ID do líder (se houver)
    leaderId?: number;
}

// ============================================
// EQUIPE VSL
// ============================================
export const TEAM_VSL: Team = {
    id: 'vsl',
    name: 'VSL',
    shortName: 'VSL',
    description: 'Video Sales Letter - Vídeos de vendas longos',
    color: '#8b5cf6', // violet
    members: [
        { id: 248675265, name: 'Nathan Soares', role: 'editor', color: '#6366f1' }, // indigo
        { id: 84070913, name: 'Victor Mazzine', role: 'editor', color: '#8b5cf6' }, // violet
    ],
    editorIds: [248675265, 84070913], // Média entre Nathan e Mazzine
};

// ============================================
// EQUIPE FUNIL
// ============================================
export const TEAM_FUNIL: Team = {
    id: 'funil',
    name: 'Funil',
    shortName: 'Funil',
    description: 'Vídeos para funis de vendas',
    color: '#3b82f6', // blue
    members: [
        { id: 112053206, name: 'Moises Ramalho', role: 'editor', color: '#3b82f6' },   // blue
        { id: 152605916, name: 'Victor Mendes', role: 'editor', color: '#0ea5e9' },   // sky
        { id: 3258937, name: 'renato fernandes rodrigues', role: 'editor', color: '#06b6d4' },  // cyan - nome exato do ClickUp
        { id: 3272897, name: 'Douglas Prado Cardoso', role: 'editor', color: '#14b8a6' },     // teal - nome exato do ClickUp
    ],
    editorIds: [112053206, 152605916, 3258937, 3272897], // Todos são editores
};

// ============================================
// EQUIPE ADS
// ============================================
export const TEAM_ADS: Team = {
    id: 'ads',
    name: 'ADs',
    shortName: 'ADs',
    description: 'Criativos para anúncios',
    color: '#10b981', // emerald
    members: [
        { id: 96683026, name: 'Leonardo da Silva', role: 'leader', color: '#10b981' }, // emerald
        { id: 84241154, name: 'Rafael Andrade', role: 'editor', color: '#22c55e' },    // green
    ],
    editorIds: [84241154], // Média só do Rafael
    leaderId: 96683026, // Leonardo é líder
};

// ============================================
// EQUIPE TP/MIC/LEAD
// ============================================
export const TEAM_TP_MIC_LEAD: Team = {
    id: 'tp-mic-lead',
    name: 'TP/MIC/LEAD',
    shortName: 'TP/MIC',
    description: 'Troca de Pote, Microlead e Lead',
    color: '#f59e0b', // amber
    members: [
        { id: 82093531, name: 'Loren Gayoso', role: 'editor', color: '#f59e0b' },  // amber
        { id: 82074101, name: 'Bruno Cesar', role: 'editor', color: '#f97316' },   // orange
    ],
    editorIds: [82093531, 82074101], // Média entre os dois
};

// ============================================
// TODAS AS EQUIPES
// ============================================
export const ALL_TEAMS: Team[] = [
    TEAM_VSL,
    TEAM_FUNIL,
    TEAM_ADS,
    TEAM_TP_MIC_LEAD,
];

// Mapa de equipe por ID do membro
export const MEMBER_TO_TEAM_MAP: Map<number, Team> = new Map();
ALL_TEAMS.forEach(team => {
    team.members.forEach(member => {
        MEMBER_TO_TEAM_MAP.set(member.id, team);
    });
});

// Função para obter equipe de um membro
export function getTeamByMemberId(memberId: number): Team | undefined {
    return MEMBER_TO_TEAM_MAP.get(memberId);
}

// Função para obter membro por ID
export function getMemberById(memberId: number): TeamMember | undefined {
    for (const team of ALL_TEAMS) {
        const member = team.members.find(m => m.id === memberId);
        if (member) return member;
    }
    return undefined;
}

// Função para verificar se é líder
export function isLeader(memberId: number): boolean {
    const member = getMemberById(memberId);
    return member?.role === 'leader';
}

// Função para obter a cor de um editor pelo ID
export function getEditorColorById(memberId: number): string {
    const member = getMemberById(memberId);
    return member?.color || '#6b7280'; // gray default
}

// Função para obter a cor de um editor pelo nome (case-insensitive)
export function getEditorColorByName(name: string): string {
    const nameLower = name.toLowerCase();
    for (const team of ALL_TEAMS) {
        const member = team.members.find(m => m.name.toLowerCase() === nameLower);
        if (member) return member.color;
    }
    return '#6b7280'; // gray default
}

// Função para obter membro pelo nome (case-insensitive)
export function getMemberByName(name: string): TeamMember | undefined {
    const nameLower = name.toLowerCase();
    for (const team of ALL_TEAMS) {
        const member = team.members.find(m => m.name.toLowerCase() === nameLower);
        if (member) return member;
    }
    return undefined;
}

// Função para obter equipe pelo nome do membro (case-insensitive)
export function getTeamByMemberName(name: string): Team | undefined {
    const nameLower = name.toLowerCase();
    for (const team of ALL_TEAMS) {
        const member = team.members.find(m => m.name.toLowerCase() === nameLower);
        if (member) return team;
    }
    return undefined;
}

// Status que indicam tarefa APROVADA ou CONCLUÍDA
export const COMPLETED_STATUSES = [
    'APROVADO',
    'CONCLUÍDO',
    'CONCLUIDO',
    'COMPLETED',
    'CLOSED',
    'DONE'
];

// ============================================
// IDs CONSOLIDADOS (para compatibilidade)
// ============================================

// IDs dos editores válidos da equipe Audiovisual (todos os membros)
export const AUDIOVISUAL_TEAM_IDS = ALL_TEAMS.flatMap(team =>
    team.members.map(m => m.id)
);

// IDs de usuários a serem EXCLUÍDOS das métricas (não são editores)
export const EXCLUDED_USER_IDS = [
    55083349,     // Phellipe Burilli Santos (Capitão)
    224505888,    // João Pedro Xavier Millen Penedo
    230468751,    // Jamile Castro Félix
    89254046,     // Leonardo Cruz
    230468665,    // Denner Silva
    2142641513,   // Isaías Deodato
    96683006,     // Luma Viegas (desligada)
    90754261,     // Leandro Lima
];

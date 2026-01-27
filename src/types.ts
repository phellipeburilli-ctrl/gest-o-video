export interface ClickUpCustomField {
  id: string;
  name: string;
  type: string;
  type_config: any;
  date_created: string;
  hide_from_guests: boolean;
  value?: any;
  required: boolean;
}

export interface ClickUpUser {
  id: number;
  username: string;
  color: string;
  email: string;
  profilePicture: string | null;
}

export interface ClickUpTag {
  name: string;
  tag_fg: string;
  tag_bg: string;
  creator: number;
}

export interface ClickUpTask {
  id: string;
  custom_id: string | null;
  name: string;
  text_content: string | null;
  description: string | null;
  status: {
    status: string;
    color: string;
    type: string;
    orderindex: number;
  };
  orderindex: string;
  date_created: string;
  date_updated: string;
  date_closed: string | null;
  archived: boolean;
  creator: ClickUpUser;
  assignees: ClickUpUser[];
  watchers: ClickUpUser[];
  checklists: any[];
  tags: ClickUpTag[];
  parent: string | null;
  priority: {
    id: string;
    priority: string;
    color: string;
    orderindex: string;
  } | null;
  due_date: string | null;
  start_date: string | null;
  points: number | null;
  time_estimate: number | null;
  time_spent: number | null;
  custom_fields: ClickUpCustomField[];
  list: {
    id: string;
    name: string;
    access: boolean;
  };
  folder: {
    id: string;
    name: string;
    hidden: boolean;
    access: boolean;
  };
  space: {
    id: string;
  };
  url: string;
}

// Tempo por fase do workflow
export interface TaskPhaseTime {
  editingTimeMs: number;      // Tempo em EDITANDO
  revisionTimeMs: number;     // Tempo em REVISÃO/ALTERAÇÃO
  approvalTimeMs: number;     // Tempo em APROVADO (antes de concluir)
  totalTimeMs: number;        // Tempo total (criação até conclusão)
}

export interface NormalizedTask {
  id: string;
  title: string;
  status: string; // Normalized (COMPLETED, IN PROGRESS, etc)
  rawStatus: string; // Original text
  editorName: string;
  editorId: number | null;
  dateCreated: number; // Timestamp
  dateClosed: number | null; // Timestamp
  timeTrackedHours: number;
  videoType?: string; // Derived from Custom Fields
  link?: string; // Derived from Custom Fields
  tags: string[];
  phaseTime?: TaskPhaseTime; // Tempo por fase
}

// Métricas detalhadas por fase para cada editor
export interface EditorPhaseMetrics {
  avgEditingTimeHours: number;    // Média de tempo em edição
  avgRevisionTimeHours: number;   // Média de tempo em revisão/alteração
  avgApprovalTimeHours: number;   // Média de tempo até aprovação
  avgTotalTimeHours: number;      // Média de tempo total
  totalEditingTimeHours: number;  // Total de horas em edição
  totalRevisionTimeHours: number; // Total de horas em revisão
  videosWithRevision: number;     // Quantos vídeos tiveram revisão
  revisionRate: number;           // Taxa de revisão (%)
}

export interface EditorStats {
  editorId: number;
  editorName: string;
  totalVideos: number;
  totalHours: number;
  avgHoursPerVideo: number;
  avgLeadTimeHours: number; // Agilidade
  videos: NormalizedTask[];
  phaseMetrics?: EditorPhaseMetrics; // Métricas por fase
}

export interface DashboardKPIs {
  totalVideos: number;
  totalHours: number;
  avgHoursPerVideo: number;
  topPerformer: {
    name: string;
    count: number;
  } | null;
  editors: EditorStats[];
  tasksByStatus: { [key: string]: number };
  tasksByType: { [key: string]: number };
}

// Task Status History Types (for time tracking via webhooks)
export interface TaskStatusEvent {
  id: number;
  taskId: string;
  taskName: string | null;
  previousStatus: string | null;
  newStatus: string;
  editorId: string | null;
  editorName: string | null;
  eventTimestamp: number; // Unix timestamp in ms
  createdAt: Date;
}

export interface TaskTimeInterval {
  taskId: string;
  status: string;
  startTimestamp: number;
  endTimestamp: number | null;
  durationMs: number;
}

export interface TaskWorkingTime {
  taskId: string;
  totalWorkingTimeMs: number;
  intervals: TaskTimeInterval[];
}

// Status categories for time tracking
export const WORKING_STATUSES = [
  'EM ANDAMENTO', 'IN PROGRESS', 'DOING', 'RUNNING', 'FAZENDO',
  'REVISÃO', 'REVISAO', 'REVIEW', 'QA', 'APROVAÇÃO',
  'VIDEO: EDITANDO', 'EDITANDO'
];

export const END_STATUSES = [
  'CONCLUÍDO', 'CONCLUIDO', 'COMPLETED', 'DONE', 'CLOSED',
  'FINALIZADO', 'ENTREGUE', 'APROVADO'
];

// Status específicos para medir tempo de edição
export const EDITING_START_STATUSES = [
  'VIDEO: EDITANDO'
];

// Fim da edição: APROVADO ou CONCLUÍDO (o que vier primeiro)
export const EDITING_END_STATUSES = [
  'APROVADO', 'CONCLUÍDO', 'CONCLUIDO', 'DISCARTADO'
];

// Status de REVISÃO/ALTERAÇÃO (inclui PARA REVISÃO, REVISANDO, ALTERAÇÃO)
export const REVISION_STATUSES = [
  'PARA REVISÃO', 'PARA REVISAO', 'REVISANDO', 'ALTERAÇÃO', 'ALTERACAO'
];

// Status de APROVADO
export const APPROVAL_STATUSES = [
  'APROVADO'
];

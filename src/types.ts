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
}

export interface EditorStats {
  editorId: number;
  editorName: string;
  totalVideos: number;
  totalHours: number;
  avgHoursPerVideo: number;
  avgLeadTimeHours: number; // Agilidade
  videos: NormalizedTask[];
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

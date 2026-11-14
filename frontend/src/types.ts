export interface ConversationSummary {
  conversation_id: string;
  title: string;
  preview: string;
  step_count: number;
  last_modified_time: string;
  workspace_uris: string;
  status: string;
  agent_name: string;
}

export interface Step {
  step_index: number;
  source: 'USER_EXPLICIT' | 'MODEL' | 'SYSTEM';
  type: 'USER_INPUT' | 'PLANNER_RESPONSE' | string;
  status?: string;
  created_at?: string;
  content?: string;
  thinking?: string;
  tool_calls?: any[];
}

export interface Artifact {
  name: string;
  path: string;
  size: number;
}

export interface ConversationDetail {
  conversation_id: string;
  step_count: number;
  steps: Step[];
  artifacts: Artifact[];
  pending_permissions: any[];
}

export interface FileItem {
  name: string;
  path: string;
  is_dir: boolean;
  size: number;
  mtime: string;
  is_hidden: boolean;
}

export interface DirectoryContent {
  current_path: string;
  parent_path: string | null;
  items: FileItem[];
}

export interface SystemStatus {
  hostname: string;
  tailscale_ip: string | null;
  active_workspace: string;
  user: string;
}

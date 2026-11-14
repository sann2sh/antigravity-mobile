export interface ConversationSummary {
  conversation_id: string;
  trajectory_id?: string;
  title: string;
  preview: string;
  step_count: number;
  last_modified_time: string;
  workspace_uris?: string;
  workspaces?: string[];
  status: string;
  agent_name?: string;
}

export interface Step {
  step_index: number;
  source: 'USER_EXPLICIT' | 'MODEL' | 'SYSTEM';
  type: 'USER_INPUT' | 'PLANNER_RESPONSE' | 'RUN_COMMAND' | string;
  status?: string;
  created_at?: string;
  content?: string;
  thinking?: string;
  tool_calls?: any[];
  model?: string;
}

export interface Artifact {
  name: string;
  path: string;
  size: number;
}

export interface PendingPermission {
  step_index: number;
  trajectory_id: string;
  action: string;
  target: string;
  description: string;
}

export interface ConversationDetail {
  conversation_id: string;
  trajectory_id?: string;
  status?: string;
  step_count: number;
  steps: Step[];
  artifacts: Artifact[];
  pending_permissions: PendingPermission[];
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
  hub_connected?: boolean;
}

export interface ModelOption {
  id: string;
  label: string;
  tag?: string | null;
  quota?: number | null;
}

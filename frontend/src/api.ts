import type {
  ConversationSummary,
  ConversationDetail,
  DirectoryContent,
  SystemStatus,
  ModelOption,
} from './types';

const API_BASE = '/api';
const TOKEN_STORAGE_KEY = 'mobileterminal_token';

export class AuthError extends Error {
  constructor(message = 'Authentication required') {
    super(message);
    this.name = 'AuthError';
  }
}

export function getAuthToken(): string {
  return localStorage.getItem(TOKEN_STORAGE_KEY) || '';
}

export function setAuthToken(token: string): void {
  const trimmed = token.trim();
  if (trimmed) {
    localStorage.setItem(TOKEN_STORAGE_KEY, trimmed);
  } else {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
  }
}

export function clearAuthToken(): void {
  localStorage.removeItem(TOKEN_STORAGE_KEY);
}

export function getWsTokenQuery(): string {
  const token = getAuthToken();
  return token ? `token=${encodeURIComponent(token)}` : '';
}

async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  const token = getAuthToken();
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
  });
  if (res.status === 401) {
    throw new AuthError('Authentication required');
  }
  return res;
}

export async function checkAuth(token?: string): Promise<boolean> {
  const headers = new Headers();
  const candidate = token !== undefined ? token.trim() : getAuthToken();
  if (candidate) {
    headers.set('Authorization', `Bearer ${candidate}`);
  }
  const res = await fetch(`${API_BASE}/auth/check`, { headers });
  if (res.status === 401) {
    return false;
  }
  if (!res.ok) {
    throw new Error('Failed to verify authentication');
  }
  return true;
}

export async function getSystemStatus(): Promise<SystemStatus> {
  const res = await apiFetch('/system/status');
  if (!res.ok) throw new Error('Failed to fetch system status');
  return res.json();
}

export async function getConversations(search?: string): Promise<ConversationSummary[]> {
  const path = search ? `/conversations?search=${encodeURIComponent(search)}` : '/conversations';
  const res = await apiFetch(path);
  if (!res.ok) throw new Error('Failed to fetch conversations');
  return res.json();
}

export async function getConversationDetail(id: string): Promise<ConversationDetail> {
  const res = await apiFetch(`/conversations/${id}`);
  if (!res.ok) throw new Error('Failed to fetch conversation details');
  return res.json();
}

export async function getArtifactContent(convId: string, name: string): Promise<string> {
  const res = await apiFetch(`/conversations/${convId}/artifacts/${encodeURIComponent(name)}`);
  if (!res.ok) throw new Error('Failed to fetch artifact');
  const data = await res.json();
  return data.content;
}

export async function getAgentModels(): Promise<{ models: ModelOption[]; default_model: string }> {
  const res = await apiFetch('/agent/models');
  if (!res.ok) throw new Error('Failed to fetch models');
  return res.json();
}

export async function sendAgentPrompt(
  prompt: string,
  conversationId: string | null,
  workspace?: string,
  model?: string | null
): Promise<{ success: boolean; cascade_id: string }> {
  const res = await apiFetch('/agent/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      conversation_id: conversationId,
      prompt,
      workspace,
      model: model || undefined,
    }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || 'Failed to send prompt');
  }
  return res.json();
}

export async function stopAgent(
  conversationId: string
): Promise<{ success: boolean; stopped?: boolean }> {
  const res = await apiFetch('/agent/stop', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      conversation_id: conversationId,
    }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || 'Failed to stop agent');
  }
  return res.json();
}

export async function respondToPermission(
  conversationId: string,
  trajectoryId: string,
  stepIndex: number,
  allow: boolean,
  scope: string = 'PERMISSION_SCOPE_ONCE'
): Promise<{ success: boolean }> {
  const res = await apiFetch('/agent/permission', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      conversation_id: conversationId,
      trajectory_id: trajectoryId,
      step_index: stepIndex,
      allow,
      scope,
    }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || 'Failed to respond to permission');
  }
  return res.json();
}

export async function listDirectory(path?: string): Promise<DirectoryContent> {
  const endpoint = path ? `/fs/list?path=${encodeURIComponent(path)}` : '/fs/list';
  const res = await apiFetch(endpoint);
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || 'Failed to list directory');
  }
  return res.json();
}

export async function readFile(path: string): Promise<{ path: string; name: string; content: string; is_binary: boolean }> {
  const res = await apiFetch(`/fs/read?path=${encodeURIComponent(path)}`);
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || 'Failed to read file');
  }
  return res.json();
}

export async function saveFile(path: string, content: string): Promise<{ path: string; size: number; success: boolean }> {
  const res = await apiFetch('/fs/write', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, content }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || 'Failed to save file');
  }
  return res.json();
}

export async function createFsEntry(path: string, isDir: boolean = false): Promise<{ path: string; success: boolean }> {
  const res = await apiFetch('/fs/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, is_dir: isDir }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || 'Failed to create entry');
  }
  return res.json();
}

export async function setWorkspace(path: string): Promise<{ workspace: string; success: boolean }> {
  const res = await apiFetch('/fs/set-workspace', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || 'Failed to set workspace');
  }
  return res.json();
}

export async function runQuickCommand(command: string, cwd?: string): Promise<{
  command: string;
  cwd: string;
  exit_code: number;
  stdout: string;
  stderr: string;
  success: boolean;
}> {
  const res = await apiFetch('/terminal/quick-run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ command, cwd }),
  });
  if (!res.ok) throw new Error('Failed to run command');
  return res.json();
}

export interface TerminalSession {
  id: string;
  name: string;
  cwd: string;
  alive: boolean;
}

export async function listTerminalSessions(): Promise<{ sessions: TerminalSession[] }> {
  const res = await apiFetch('/terminal/sessions');
  if (!res.ok) throw new Error('Failed to list terminal sessions');
  return res.json();
}

export async function createTerminalSession(
  cwd?: string,
  name?: string
): Promise<TerminalSession> {
  const res = await apiFetch('/terminal/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cwd, name }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to create terminal session');
  }
  return res.json();
}

export async function deleteTerminalSession(id: string): Promise<{ success: boolean }> {
  const res = await apiFetch(`/terminal/sessions/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to delete terminal session');
  }
  return res.json();
}

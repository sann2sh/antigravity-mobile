import type { ConversationSummary, ConversationDetail, DirectoryContent, SystemStatus } from './types';

const API_BASE = '/api';

export async function getSystemStatus(): Promise<SystemStatus> {
  const res = await fetch(`${API_BASE}/system/status`);
  if (!res.ok) throw new Error('Failed to fetch system status');
  return res.json();
}

export async function getConversations(search?: string): Promise<ConversationSummary[]> {
  const url = search ? `${API_BASE}/conversations?search=${encodeURIComponent(search)}` : `${API_BASE}/conversations`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to fetch conversations');
  return res.json();
}

export async function getConversationDetail(id: string): Promise<ConversationDetail> {
  const res = await fetch(`${API_BASE}/conversations/${id}`);
  if (!res.ok) throw new Error('Failed to fetch conversation details');
  return res.json();
}

export async function getArtifactContent(convId: string, name: string): Promise<string> {
  const res = await fetch(`${API_BASE}/conversations/${convId}/artifacts/${encodeURIComponent(name)}`);
  if (!res.ok) throw new Error('Failed to fetch artifact');
  const data = await res.json();
  return data.content;
}

export async function listDirectory(path?: string): Promise<DirectoryContent> {
  const url = path ? `${API_BASE}/fs/list?path=${encodeURIComponent(path)}` : `${API_BASE}/fs/list`;
  const res = await fetch(url);
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || 'Failed to list directory');
  }
  return res.json();
}

export async function readFile(path: string): Promise<{ path: string; name: string; content: string; is_binary: boolean }> {
  const res = await fetch(`${API_BASE}/fs/read?path=${encodeURIComponent(path)}`);
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || 'Failed to read file');
  }
  return res.json();
}

export async function setWorkspace(path: string): Promise<{ workspace: string; success: boolean }> {
  const res = await fetch(`${API_BASE}/fs/set-workspace`, {
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
  const res = await fetch(`${API_BASE}/terminal/quick-run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ command, cwd }),
  });
  if (!res.ok) throw new Error('Failed to run command');
  return res.json();
}

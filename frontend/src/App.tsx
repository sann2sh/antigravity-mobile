import { useState, useEffect, useCallback, useRef } from 'react';
import { Lock } from 'lucide-react';
import { Header } from './components/Header';
import { BottomNav } from './components/BottomNav';
import type { NavTab } from './components/BottomNav';
import { ConversationsDrawer } from './components/ConversationsDrawer';
import { AgentChat } from './components/AgentChat';
import { FileBrowser } from './components/FileBrowser';
import { TerminalView } from './components/TerminalView';
import type {
  ConversationSummary,
  ConversationDetail,
  SystemStatus,
  PendingPermission,
  ModelOption,
} from './types';
import {
  AuthError,
  checkAuth,
  setAuthToken,
  clearAuthToken,
  getSystemStatus,
  getConversations,
  getConversationDetail,
  getAgentModels,
  sendAgentPrompt,
  stopAgent,
  respondToPermission,
} from './api';

export function App() {
  const [activeTab, setActiveTab] = useState<NavTab>('chat');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [conversationDetail, setConversationDetail] = useState<ConversationDetail | null>(null);
  const [currentWorkspace, setCurrentWorkspace] = useState<string>('');
  const [isSending, setIsSending] = useState(false);
  const [models, setModels] = useState<ModelOption[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>(
    () => localStorage.getItem('agy_selected_model') || ''
  );
  const [authRequired, setAuthRequired] = useState(false);
  const [tokenInput, setTokenInput] = useState('');
  const [authError, setAuthError] = useState('');
  const [isUnlocking, setIsUnlocking] = useState(false);
  const recentlyResolvedPermsRef = useRef<Record<string, number>>({});

  const filterResolvedPermissions = useCallback((detail: ConversationDetail): ConversationDetail => {
    const now = Date.now();
    const resolved = recentlyResolvedPermsRef.current;
    for (const key of Object.keys(resolved)) {
      if (now - resolved[key] > 8000) {
        delete resolved[key];
      }
    }
    const pending = detail.pending_permissions || [];
    const filtered = pending.filter(
      (p) => !resolved[`${p.trajectory_id}:${p.step_index}`]
    );
    if (filtered.length === pending.length) {
      return detail;
    }
    return { ...detail, pending_permissions: filtered };
  }, []);

  const loadConversation = useCallback(async (id: string) => {
    setActiveConvId(id);
    try {
      const detail = await getConversationDetail(id);
      setConversationDetail(filterResolvedPermissions(detail));
    } catch (err) {
      if (err instanceof AuthError) {
        setAuthRequired(true);
        return;
      }
      console.error(`Failed to load conversation ${id}:`, err);
    }
  }, [filterResolvedPermissions]);

  const loadInitialData = async () => {
    try {
      const status = await getSystemStatus();
      setAuthRequired(false);
      setSystemStatus(status);
      setCurrentWorkspace(status.active_workspace);

      const convs = await getConversations();
      setConversations(convs);

      getAgentModels()
        .then((res) => {
          setModels(res.models || []);
          setSelectedModel((prev) => prev || res.default_model || res.models?.[0]?.id || '');
        })
        .catch(() => {});

      if (convs.length > 0 && !activeConvId) {
        loadConversation(convs[0].conversation_id);
      }
    } catch (err) {
      if (err instanceof AuthError) {
        clearAuthToken();
        setAuthRequired(true);
        return;
      }
      console.error('Failed to load initial data:', err);
    }
  };

  useEffect(() => {
    loadInitialData();
  }, []);

  // Poll active conversation every 1.5s when viewing chat so live responses & permissions appear immediately
  useEffect(() => {
    if (authRequired || activeTab !== 'chat' || !activeConvId || activeConvId === 'new') return;

    const interval = setInterval(() => {
      getConversationDetail(activeConvId)
        .then((detail) => setConversationDetail(filterResolvedPermissions(detail)))
        .catch((err) => {
          if (err instanceof AuthError) {
            setAuthRequired(true);
          }
        });
    }, 1500);

    return () => clearInterval(interval);
  }, [authRequired, activeTab, activeConvId, filterResolvedPermissions]);

  const handleSendPrompt = async (prompt: string) => {
    setIsSending(true);
    try {
      // Optimistically show user message
      if (conversationDetail) {
        setConversationDetail({
          ...conversationDetail,
          steps: [
            ...conversationDetail.steps,
            {
              step_index: conversationDetail.steps.length,
              source: 'USER_EXPLICIT',
              type: 'USER_INPUT',
              content: prompt,
              created_at: new Date().toISOString(),
            },
          ],
        });
      }

      const res = await sendAgentPrompt(prompt, activeConvId, currentWorkspace, selectedModel);
      if (res.cascade_id) {
        setActiveConvId(res.cascade_id);
        await loadConversation(res.cascade_id);
        getConversations().then(setConversations).catch(() => {});
      }
    } catch (err: any) {
      alert(`Failed to send prompt: ${err.message}`);
    } finally {
      setIsSending(false);
    }
  };

  const handleStopAgent = async () => {
    if (!activeConvId || activeConvId === 'new') return;
    try {
      await stopAgent(activeConvId);
      await loadConversation(activeConvId);
    } catch (err: any) {
      console.error('Failed to stop agent:', err);
    }
  };

  const handleRespondPermission = async (
    perm: PendingPermission,
    allow: boolean,
    scope: string = 'PERMISSION_SCOPE_ONCE'
  ) => {
    if (!activeConvId) return;
    const permKey = `${perm.trajectory_id}:${perm.step_index}`;
    recentlyResolvedPermsRef.current[permKey] = Date.now();

    setConversationDetail((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        pending_permissions: (prev.pending_permissions || []).filter(
          (p) => !(p.trajectory_id === perm.trajectory_id && p.step_index === perm.step_index)
        ),
      };
    });

    try {
      await respondToPermission(
        activeConvId,
        perm.trajectory_id,
        perm.step_index,
        allow,
        scope
      );
      await loadConversation(activeConvId);
    } catch (err: any) {
      delete recentlyResolvedPermsRef.current[permKey];
      setConversationDetail((prev) => {
        if (!prev) return prev;
        const exists = (prev.pending_permissions || []).some(
          (p) => p.trajectory_id === perm.trajectory_id && p.step_index === perm.step_index
        );
        if (exists) return prev;
        return {
          ...prev,
          pending_permissions: [...(prev.pending_permissions || []), perm],
        };
      });
      loadConversation(activeConvId).catch(() => {});
      alert(`Failed to respond to permission: ${err.message}`);
    }
  };

  const handleNewSession = () => {
    setActiveConvId('new');
    setConversationDetail({
      conversation_id: 'new',
      step_count: 0,
      steps: [],
      artifacts: [],
      pending_permissions: [],
    });
    setActiveTab('chat');
  };

  const handleWorkspaceChange = (newWorkspace: string) => {
    setCurrentWorkspace(newWorkspace);
    if (systemStatus) {
      setSystemStatus({ ...systemStatus, active_workspace: newWorkspace });
    }
  };

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = tokenInput.trim();
    if (!trimmed) {
      setAuthError('Enter your access token.');
      return;
    }
    setIsUnlocking(true);
    setAuthError('');
    try {
      const valid = await checkAuth(trimmed);
      if (!valid) {
        setAuthError('Invalid access token.');
        return;
      }
      setAuthToken(trimmed);
      setTokenInput('');
      setAuthRequired(false);
      await loadInitialData();
    } catch (err: any) {
      setAuthError(err?.message || 'Unable to verify token.');
    } finally {
      setIsUnlocking(false);
    }
  };

  if (authRequired) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen px-6 bg-canvas text-ink">
        <div className="w-full max-w-sm rounded-xl bg-surface border border-edge p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-sunk border border-edge text-accent">
              <Lock className="w-4 h-4" />
            </div>
            <div>
              <h1 className="text-base font-semibold text-ink">Sign in to MobileTerminal</h1>
              <p className="text-xs text-ink-muted">Enter your server access token to continue.</p>
            </div>
          </div>

          <form onSubmit={handleUnlock} className="space-y-3">
            <input
              type="password"
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              placeholder="Access token"
              autoFocus
              autoComplete="current-password"
              className="w-full rounded-lg bg-sunk border border-edge px-3 py-2.5 text-sm text-ink placeholder:text-ink-subtle focus:outline-none focus:border-accent"
            />
            {authError && (
              <p className="text-xs text-danger">{authError}</p>
            )}
            <button
              type="submit"
              disabled={isUnlocking}
              className="w-full rounded-lg bg-accent text-sunk font-medium text-sm py-2.5 transition-opacity disabled:opacity-50"
            >
              {isUnlocking ? 'Verifying...' : 'Continue'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen max-w-lg mx-auto bg-canvas shadow-2xl relative overflow-hidden">
      <Header
        onOpenDrawer={() => {
          getConversations().then(setConversations).catch(() => {});
          setDrawerOpen(true);
        }}
        systemStatus={systemStatus}
        onNavigateFiles={() => setActiveTab('files')}
      />

      <main className="flex-1 overflow-hidden">
        {activeTab === 'chat' && (
          <AgentChat
            conversation={conversationDetail}
            conversationId={activeConvId}
            onSendPrompt={handleSendPrompt}
            onStopAgent={handleStopAgent}
            onRespondPermission={handleRespondPermission}
            isSending={isSending}
            hubConnected={systemStatus?.hub_connected}
            onRefreshConversation={() => activeConvId && activeConvId !== 'new' && loadConversation(activeConvId)}
            models={models}
            selectedModel={selectedModel}
            onSelectModel={(modelId) => {
              setSelectedModel(modelId);
              localStorage.setItem('agy_selected_model', modelId);
            }}
          />
        )}

        {activeTab === 'files' && (
          <FileBrowser
            currentWorkspace={currentWorkspace}
            onWorkspaceChange={handleWorkspaceChange}
          />
        )}


        <div className={activeTab === 'terminal' ? 'h-full' : 'hidden'}>
          <TerminalView currentWorkspace={currentWorkspace} />
        </div>
      </main>

      <BottomNav
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />

      <ConversationsDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        conversations={conversations}
        activeId={activeConvId}
        onSelectConversation={loadConversation}
        onNewSession={handleNewSession}
      />
    </div>
  );
}

export default App;

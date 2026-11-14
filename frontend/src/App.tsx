import { useState, useEffect, useRef } from 'react';
import { Header } from './components/Header';
import { BottomNav } from './components/BottomNav';
import type { NavTab } from './components/BottomNav';
import { ConversationsDrawer } from './components/ConversationsDrawer';
import { AgentChat } from './components/AgentChat';
import { FileBrowser } from './components/FileBrowser';
import { ArtifactViewer } from './components/ArtifactViewer';
import { TerminalView } from './components/TerminalView';
import type {
  ConversationSummary,
  ConversationDetail,
  SystemStatus,
} from './types';
import {
  getSystemStatus,
  getConversations,
  getConversationDetail,
} from './api';

export function App() {
  const [activeTab, setActiveTab] = useState<NavTab>('chat');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [conversationDetail, setConversationDetail] = useState<ConversationDetail | null>(null);
  const [currentWorkspace, setCurrentWorkspace] = useState<string>('');

  // Agent Streaming State
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamText, setStreamText] = useState('');
  const [streamThinking, setStreamThinking] = useState('');
  const agentWsRef = useRef<WebSocket | null>(null);

  // Initial load
  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    try {
      const status = await getSystemStatus();
      setSystemStatus(status);
      setCurrentWorkspace(status.active_workspace);

      const convs = await getConversations();
      setConversations(convs);

      if (convs.length > 0 && !activeConvId) {
        // Select the most recent active conversation
        loadConversation(convs[0].conversation_id);
      }
    } catch (err) {
      console.error('Failed to load initial data:', err);
    }
  };

  const loadConversation = async (id: string) => {
    setActiveConvId(id);
    try {
      const detail = await getConversationDetail(id);
      setConversationDetail(detail);
    } catch (err) {
      console.error(`Failed to load conversation ${id}:`, err);
    }
  };

  // Setup /ws/agent WebSocket
  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/agent`;
    const ws = new WebSocket(wsUrl);
    agentWsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.event === 'step_update') {
          const su = data.step_update || {};
          if (su.text_delta) {
            setStreamText((prev) => prev + su.text_delta);
          }
        } else if (data.event === 'result') {
          setIsStreaming(false);
          // Refresh conversation
          if (activeConvId) {
            loadConversation(activeConvId);
          }
        } else if (data.event === 'stream_end') {
          setIsStreaming(false);
          if (activeConvId) {
            loadConversation(activeConvId);
          }
        } else if (data.event === 'error') {
          setIsStreaming(false);
          setStreamText((prev) => prev + `\n\n[Error: ${data.message}]`);
        }
      } catch (err) {
        console.error('WS parse error:', err);
      }
    };

    ws.onclose = () => {
      setIsStreaming(false);
    };

    return () => {
      ws.close();
    };
  }, [activeConvId]);

  const handleSendPrompt = (prompt: string, skipPermissions: boolean = false) => {
    if (!agentWsRef.current || agentWsRef.current.readyState !== WebSocket.OPEN) {
      alert('WebSocket not connected. Please reload the page.');
      return;
    }

    // Add optimistic user step
    if (conversationDetail) {
      const optimisticStep = {
        step_index: conversationDetail.steps.length,
        source: 'USER_EXPLICIT' as const,
        type: 'USER_INPUT' as const,
        content: prompt,
        created_at: new Date().toISOString(),
      };
      setConversationDetail({
        ...conversationDetail,
        steps: [...conversationDetail.steps, optimisticStep],
        pending_permissions: [],
      });
    }

    setIsStreaming(true);
    setStreamText('');
    setStreamThinking('');

    agentWsRef.current.send(
      JSON.stringify({
        type: 'prompt',
        prompt,
        conversation_id: activeConvId,
        workspace: currentWorkspace,
        mode: 'auto',
        skip_permissions: skipPermissions,
      })
    );
  };

  const handleNewSession = () => {
    setActiveConvId(null);
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

  return (
    <div className="flex flex-col h-screen max-w-lg mx-auto bg-[#0d1117] shadow-2xl relative overflow-hidden">
      {/* Header */}
      <Header
        onOpenDrawer={() => setDrawerOpen(true)}
        systemStatus={systemStatus}
        onNavigateFiles={() => setActiveTab('files')}
      />

      {/* Main Views */}
      <main className="flex-1 overflow-hidden">
        {activeTab === 'chat' && (
          <AgentChat
            conversation={conversationDetail}
            conversationId={activeConvId}
            onSendPrompt={handleSendPrompt}
            isStreaming={isStreaming}
            streamText={streamText}
            streamThinking={streamThinking}
            onRefreshConversation={() => activeConvId && loadConversation(activeConvId)}
          />
        )}

        {activeTab === 'files' && (
          <FileBrowser
            currentWorkspace={currentWorkspace}
            onWorkspaceChange={handleWorkspaceChange}
          />
        )}

        {activeTab === 'artifacts' && (
          <ArtifactViewer
            artifacts={conversationDetail?.artifacts || []}
            conversationId={activeConvId}
          />
        )}

        {activeTab === 'terminal' && (
          <TerminalView currentWorkspace={currentWorkspace} />
        )}
      </main>

      {/* Bottom Tab Navigation */}
      <BottomNav
        activeTab={activeTab}
        onTabChange={setActiveTab}
        artifactCount={conversationDetail?.artifacts?.length || 0}
      />

      {/* Slide-out Conversations Drawer */}
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

import React, { useState, useEffect, useRef } from 'react';
import {
  Send,
  Mic,
  MicOff,
  ChevronDown,
  ChevronRight,
  ShieldAlert,
  Check,
  X,
  Terminal,
  Loader2,
  Copy,
  CheckCheck,
  RefreshCw,
  FileText,
  Download,
  ChevronUp,
  Square,
  Pencil,
  Eye
} from 'lucide-react';
import type { Artifact, ConversationDetail, ModelOption, PendingPermission } from '../types';
import { getArtifactContent } from '../api';
import { MarkdownRenderer } from './MarkdownRenderer';

interface AgentChatProps {
  conversation: ConversationDetail | null;
  conversationId: string | null;
  onSendPrompt: (prompt: string) => void;
  onStopAgent: () => Promise<void> | void;
  onRespondPermission: (perm: PendingPermission, allow: boolean, scope?: string) => void;
  isSending: boolean;
  hubConnected?: boolean;
  onRefreshConversation: () => void;
  models: ModelOption[];
  selectedModel: string;
  onSelectModel: (modelId: string) => void;
}

export const AgentChat: React.FC<AgentChatProps> = ({
  conversation,
  conversationId,
  onSendPrompt,
  onStopAgent,
  onRespondPermission,
  isSending,
  hubConnected,
  onRefreshConversation,
  models,
  selectedModel,
  onSelectModel,
}) => {
  const [input, setInput] = useState('');
  const [isStopping, setIsStopping] = useState(false);
  const [expandedSteps, setExpandedSteps] = useState<Record<string, boolean>>({});
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [copiedId, setCopiedId] = useState<number | null>(null);

  const toggleExpand = (key: string) => {
    setExpandedSteps((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const activeModelObj = models.find((m) => m.id === selectedModel);

  // IDE-style Artifacts Drawer / Viewer
  const [artifactsOpen, setArtifactsOpen] = useState(false);
  const [selectedArtifact, setSelectedArtifact] = useState<Artifact | null>(null);
  const [artifactContent, setArtifactContent] = useState('');
  const [loadingArtifact, setLoadingArtifact] = useState(false);
  const [copiedArtifact, setCopiedArtifact] = useState(false);

  const chatBottomRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);

  const isAgentRunning =
    conversation?.status === 'CASCADE_RUN_STATUS_RUNNING' || isSending;

  useEffect(() => {
    if (!isAgentRunning) {
      setIsStopping(false);
    }
  }, [isAgentRunning]);

  const handleStop = async () => {
    setIsStopping(true);
    try {
      await onStopAgent();
    } finally {
      setTimeout(() => setIsStopping(false), 2000);
    }
  };

  // Auto-scroll on new steps
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversation?.steps?.length, conversation?.pending_permissions?.length, isSending]);

  // Speech Recognition Setup
  useEffect(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onresult = (event: any) => {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript;
        }
        setInput((prev) => (prev ? `${prev} ${transcript}` : transcript));
      };

      recognition.onerror = () => setIsListening(false);
      recognition.onend = () => setIsListening(false);
      recognitionRef.current = recognition;
    }
  }, []);

  const toggleMic = () => {
    if (!recognitionRef.current) {
      alert('Speech recognition is not supported in this browser.');
      return;
    }
    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      recognitionRef.current.start();
      setIsListening(true);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isSending) return;
    onSendPrompt(input.trim());
    setInput('');
  };

  const copyToClipboard = (text: string, id: number) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const artifacts = conversation?.artifacts || [];

  const handleSelectArtifact = async (art: Artifact) => {
    if (!conversationId) return;
    setSelectedArtifact(art);
    setLoadingArtifact(true);
    try {
      const data = await getArtifactContent(conversationId, art.name);
      setArtifactContent(data);
    } catch (err: any) {
      setArtifactContent(`Failed to load artifact: ${err.message}`);
    } finally {
      setLoadingArtifact(false);
    }
  };

  const handleOpenArtifacts = () => {
    setArtifactsOpen(true);
    if (artifacts.length > 0 && (!selectedArtifact || !artifacts.some((a) => a.name === selectedArtifact.name))) {
      handleSelectArtifact(artifacts[0]);
    }
  };

  const pendingPermissions = conversation?.pending_permissions || [];

  return (
    <div className="flex flex-col h-[calc(100dvh-3.5rem-3.5rem)] bg-canvas text-ink">
      {/* Live Sync Status Bar */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-surface border-b border-edge text-[11px]">
        <div className="flex items-center gap-1.5">
          <span className={hubConnected ? 'text-ok font-medium' : 'text-warn'}>
            {hubConnected ? 'Live Synced with Laptop IDE' : 'IDE Hub Offline'}
          </span>
          {isAgentRunning && (
            <span className="flex items-center gap-1 ml-1 px-1.5 py-0.5 rounded bg-accent-dim text-accent text-[10px]">
              <Loader2 className="w-2.5 h-2.5 animate-spin" /> Running
            </span>
          )}
        </div>

        <button
          onClick={onRefreshConversation}
          className="p-1 rounded hover:bg-surface-hover text-ink-muted hover:text-ink active:scale-95 transition-colors motion-reduce:transition-none"
          title="Refresh conversation"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {!conversation || conversation.steps.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <h3 className="text-sm font-semibold text-ink">Antigravity Agent Ready</h3>
            <p className="text-xs text-ink-muted mt-1 max-w-xs">
              Prompts sent here appear directly in your laptop’s Antigravity IDE chat in real time.
            </p>
          </div>
        ) : (
          conversation.steps.map((step, idx) => {
            const isUser = step.source === 'USER_EXPLICIT';
            const isCmd = step.type === 'RUN_COMMAND';

            if (isCmd) {
              const cmdKey = `cmd-${idx}`;
              const isOpen = !!expandedSteps[cmdKey];
              const firstLine = (step.content || '').split('\n').find((l) => l.trim()) || 'Command';
              return (
                <div key={idx} className="my-1 rounded-xl bg-sunk border border-edge overflow-hidden font-mono text-[11px]">
                  <button
                    type="button"
                    onClick={() => toggleExpand(cmdKey)}
                    className="w-full flex items-center justify-between px-2.5 py-1.5 bg-surface/80 hover:bg-surface text-left transition-colors motion-reduce:transition-none"
                  >
                    <span className="flex items-center gap-1.5 text-accent font-semibold truncate min-w-0">
                      {isOpen ? <ChevronDown className="w-3.5 h-3.5 shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 shrink-0" />}
                      <Terminal className="w-3 h-3 shrink-0" />
                      <span className="truncate text-ink font-normal">{firstLine}</span>
                    </span>
                    <span className="text-[10px] text-ink-subtle shrink-0 ml-2">
                      {step.status?.replace('CORTEX_STEP_STATUS_', '')}
                    </span>
                  </button>
                  {isOpen && (
                    <pre className="p-2.5 border-t border-edge text-ink-muted text-[10px] overflow-x-auto whitespace-pre-wrap leading-relaxed max-h-60 overflow-y-auto">
                      {step.content}
                    </pre>
                  )}
                </div>
              );
            }

            if (step.type === 'CODE_ACTION') {
              const editKey = `edit-${idx}`;
              const isOpen = !!expandedSteps[editKey];
              const lines = (step.content || '').split('\n');
              const filePath = lines[0] || 'File Edit';
              const diffLines = lines.slice(1);
              const addedCount = diffLines.filter((l) => l.startsWith('+ ')).length;
              const removedCount = diffLines.filter((l) => l.startsWith('- ')).length;
              return (
                <div key={idx} className="my-1 rounded-xl bg-sunk border border-edge overflow-hidden font-mono text-[11px]">
                  <button
                    type="button"
                    onClick={() => diffLines.length > 0 && toggleExpand(editKey)}
                    className="w-full flex items-center justify-between px-2.5 py-1.5 bg-surface/80 hover:bg-surface text-left transition-colors motion-reduce:transition-none"
                  >
                    <span className="flex items-center gap-1.5 text-warn truncate min-w-0 font-semibold">
                      {diffLines.length > 0 && (
                        isOpen ? <ChevronDown className="w-3.5 h-3.5 shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 shrink-0" />
                      )}
                      <Pencil className="w-3 h-3 shrink-0" />
                      <span className="truncate">{filePath.split('/').slice(-2).join('/')}</span>
                    </span>
                    <span className="flex items-center gap-1.5 shrink-0 ml-2 text-[10px]">
                      {addedCount > 0 && <span className="text-ok">+{addedCount}</span>}
                      {removedCount > 0 && <span className="text-danger">-{removedCount}</span>}
                      <span className="text-ink-subtle">
                        {step.status?.replace('CORTEX_STEP_STATUS_', '')}
                      </span>
                    </span>
                  </button>
                  {isOpen && diffLines.length > 0 && (
                    <div className="p-2 border-t border-edge overflow-x-auto text-[10px] leading-relaxed max-h-56 overflow-y-auto">
                      {diffLines.map((line, lIdx) => (
                        <div
                          key={lIdx}
                          className={`whitespace-pre ${
                            line.startsWith('+ ')
                              ? 'bg-ok/15 text-ok'
                              : line.startsWith('- ')
                                ? 'bg-danger/15 text-danger'
                                : 'text-ink-muted'
                          }`}
                        >
                          {line}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            }

            if (step.type === 'VIEW_FILE') {
              return (
                <div key={idx} className="my-0.5 px-2.5 py-1 rounded-lg bg-surface/60 border border-edge/60 text-[10px] text-ink-muted truncate flex items-center gap-1.5">
                  <Eye className="w-3 h-3 shrink-0 inline" />
                  <span>Read</span>
                  <span className="font-mono truncate">{(step.content || '').split('/').slice(-2).join('/')}</span>
                </div>
              );
            }

            return (
              <div
                key={idx}
                className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} space-y-1`}
              >
                <div className="flex items-center gap-1.5 px-1 text-[10px] text-ink-muted">
                  {isUser ? (
                    <span>You</span>
                  ) : (
                    <span className="flex items-center gap-1.5 text-accent font-medium">
                      Agent
                      {step.model && (
                        <span className="px-1.5 py-0.2 rounded bg-accent-dim border border-accent/30 text-accent font-mono text-[9px]">
                          {step.model}
                        </span>
                      )}
                    </span>
                  )}
                  {step.created_at && (
                    <span className="text-ink-subtle font-mono">
                      {new Date(step.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                </div>

                <div
                  className={`max-w-[92%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed ${
                    isUser
                      ? 'bg-accent text-sunk rounded-br-xs'
                      : 'bg-surface border border-edge text-ink rounded-bl-xs'
                  }`}
                >
                  {step.thinking && (
                    <div className="mb-2 pb-2 border-b border-edge/60">
                      <button
                        type="button"
                        onClick={() => toggleExpand(`think-${idx}`)}
                        className="flex items-center gap-1 text-[11px] text-accent hover:text-accent/80 transition-colors motion-reduce:transition-none"
                      >
                        {expandedSteps[`think-${idx}`] ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                        Agent Reasoning {expandedSteps[`think-${idx}`] ? '(Collapse)' : '(Peek)'}
                      </button>
                      {expandedSteps[`think-${idx}`] && (
                        <div className="mt-1.5 p-2 rounded bg-sunk text-[11px] font-mono text-ink-muted whitespace-pre-wrap max-h-48 overflow-y-auto">
                          {step.thinking}
                        </div>
                      )}
                    </div>
                  )}

                  {isUser ? (
                    <div className="whitespace-pre-wrap break-words">{step.content}</div>
                  ) : (
                    step.content && <MarkdownRenderer content={step.content} />
                  )}

                  {step.tool_calls && step.tool_calls.length > 0 && (
                    <div className="mt-2 space-y-1.5 pt-2 border-t border-edge/40">
                      {step.tool_calls.map((tc: any, tcIdx: number) => {
                        const toolName = tc.name || tc.tool || 'Tool';
                        const params = tc.args || tc.parameters || {};
                        const tcKey = `tc-${idx}-${tcIdx}`;
                        const isOpen = !!expandedSteps[tcKey];
                        return (
                          <div
                            key={tcIdx}
                            className="rounded-lg bg-sunk border border-edge overflow-hidden font-mono text-[11px]"
                          >
                            <div className="flex items-center justify-between px-2 py-1.5 text-accent">
                              <button
                                type="button"
                                onClick={() => toggleExpand(tcKey)}
                                className="flex items-center gap-1 font-semibold flex-1 text-left truncate"
                              >
                                {isOpen ? <ChevronDown className="w-3 h-3 shrink-0" /> : <ChevronRight className="w-3 h-3 shrink-0" />}
                                <Terminal className="w-3 h-3 shrink-0" />
                                <span className="truncate">{toolName}</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => copyToClipboard(JSON.stringify(params, null, 2), idx * 100 + tcIdx)}
                                className="text-ink-muted hover:text-ink ml-2 shrink-0 transition-colors motion-reduce:transition-none"
                              >
                                {copiedId === idx * 100 + tcIdx ? (
                                  <CheckCheck className="w-3.5 h-3.5 text-ok" />
                                ) : (
                                  <Copy className="w-3.5 h-3.5" />
                                )}
                              </button>
                            </div>
                            {isOpen && (
                              <pre className="p-2 border-t border-edge text-ink-muted text-[10px] overflow-x-auto whitespace-pre-wrap max-h-48 overflow-y-auto">
                                {JSON.stringify(params, null, 2)}
                              </pre>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}

        {/* Pending Permission Cards */}
        {pendingPermissions.map((perm, pIdx) => (
          <div key={pIdx} className="my-3 p-3.5 rounded-xl bg-warn/10 border border-warn/60">
            <div className="flex items-center gap-2 text-warn text-xs font-semibold mb-1.5">
              <ShieldAlert className="w-4 h-4 shrink-0" />
              <span>Permission Required: {perm.action}</span>
            </div>
            {perm.description && (
              <p className="text-[11px] text-ink-muted mb-2">{perm.description}</p>
            )}
            <div className="mb-3 p-2.5 rounded-lg bg-sunk border border-warn/30 font-mono text-[11px] text-warn overflow-x-auto whitespace-pre-wrap">
              {perm.target}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => onRespondPermission(perm, true, 'PERMISSION_SCOPE_ONCE')}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-ok hover:bg-ok/90 text-sunk font-semibold text-xs active:scale-95 transition-colors motion-reduce:transition-none"
              >
                <Check className="w-4 h-4" /> Allow Once
              </button>
              <button
                onClick={() => onRespondPermission(perm, true, 'PERMISSION_SCOPE_CONVERSATION')}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-accent hover:bg-accent/90 text-sunk font-semibold text-xs active:scale-95 transition-colors motion-reduce:transition-none"
              >
                <Check className="w-4 h-4" /> Always in Chat
              </button>
              <button
                onClick={() => onRespondPermission(perm, false)}
                className="flex items-center justify-center gap-1 py-2.5 px-3 rounded-xl bg-danger/90 hover:bg-danger text-sunk font-semibold text-xs active:scale-95 transition-colors motion-reduce:transition-none"
              >
                <X className="w-4 h-4" /> Deny
              </button>
            </div>
          </div>
        ))}

        <div ref={chatBottomRef} />
      </div>

      {/* Buttons Bar Above Prompt Field */}
      <div className="px-2.5 py-1.5 flex items-center gap-2 border-t border-edge/50 bg-surface/70">
        <button
          type="button"
          onClick={handleOpenArtifacts}
          className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-medium bg-surface-hover text-ink hover:text-ink border border-edge active:scale-95 transition-colors motion-reduce:transition-none"
        >
          <FileText className="w-3.5 h-3.5 text-accent" />
          <span>Artifacts</span>
          {artifacts.length > 0 && (
            <span className="px-1.5 py-0.2 rounded-full bg-accent text-sunk text-[10px] font-bold leading-tight font-mono">
              {artifacts.length}
            </span>
          )}
        </button>
      </div>

      {/* IDE-Style Artifacts Modal */}
      {artifactsOpen && (
        <div className="fixed inset-0 z-50 flex flex-col bg-canvas safe-top safe-bottom">
          <div className="flex items-center justify-between px-3.5 py-2.5 bg-surface border-b border-edge">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-accent" />
              <span className="text-xs font-semibold text-ink">
                Artifacts ({artifacts.length})
              </span>
            </div>
            <button
              onClick={() => setArtifactsOpen(false)}
              className="p-1 rounded-lg text-ink-muted hover:text-ink hover:bg-surface-hover transition-colors motion-reduce:transition-none"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {artifacts.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center px-6 text-ink-muted">
              <p className="text-xs font-medium text-ink">No artifacts in this session yet</p>
              <p className="text-[11px] text-ink-subtle mt-1">
                Plans, task lists, and walkthroughs created by the agent will appear here.
              </p>
            </div>
          ) : (
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Artifact List (like IDE tabs/list) */}
              <div className="flex gap-2 p-2.5 overflow-x-auto bg-surface/60 border-b border-edge no-scrollbar">
                {artifacts.map((art) => {
                  const isSel = selectedArtifact?.name === art.name;
                  return (
                    <button
                      key={art.name}
                      onClick={() => handleSelectArtifact(art)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono shrink-0 border transition-colors motion-reduce:transition-none ${
                        isSel
                          ? 'bg-accent text-sunk border-accent'
                          : 'bg-sunk text-ink-muted border-edge hover:bg-surface-hover hover:text-ink'
                      }`}
                    >
                      <FileText className="w-3.5 h-3.5" />
                      <span>{art.name}</span>
                    </button>
                  );
                })}
              </div>

              {/* Artifact Toolbar */}
              {selectedArtifact && (
                <div className="flex items-center justify-between px-3.5 py-2 bg-surface/30 border-b border-edge text-xs">
                  <span className="font-mono text-[11px] text-ink-muted">
                    {loadingArtifact ? 'Loading...' : `${(selectedArtifact.size / 1024).toFixed(1)} KB`}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(artifactContent);
                        setCopiedArtifact(true);
                        setTimeout(() => setCopiedArtifact(false), 1800);
                      }}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-surface-hover text-ink-muted hover:text-ink border border-edge transition-colors motion-reduce:transition-none"
                    >
                      {copiedArtifact ? (
                        <Check className="w-3.5 h-3.5 text-ok" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                      <span>{copiedArtifact ? 'Copied' : 'Copy'}</span>
                    </button>
                    <button
                      onClick={() => {
                        const blob = new Blob([artifactContent], { type: 'text/markdown;charset=utf-8;' });
                        const url = URL.createObjectURL(blob);
                        const link = document.createElement('a');
                        link.href = url;
                        link.download = selectedArtifact.name;
                        link.click();
                        URL.revokeObjectURL(url);
                      }}
                      className="p-1.5 rounded-lg bg-surface-hover text-ink-muted hover:text-ink border border-edge transition-colors motion-reduce:transition-none"
                      title="Download"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}

              {/* Rendered Content */}
              <div className="flex-1 overflow-y-auto p-3.5">
                <div className="bg-surface p-4 rounded-xl border border-edge">
                  {selectedArtifact?.name.endsWith('.md') ? (
                    <MarkdownRenderer content={artifactContent} />
                  ) : (
                    <pre className="whitespace-pre-wrap font-mono text-[11px] text-ink leading-relaxed">
                      {artifactContent}
                    </pre>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Input Form */}
      <form onSubmit={handleSubmit} className="px-2.5 pt-2.5 pb-1.5 bg-surface border-t border-edge flex items-center gap-2">
        <button
          type="button"
          onClick={toggleMic}
          className={`p-2.5 rounded-xl border transition-colors motion-reduce:transition-none ${
            isListening
              ? 'bg-danger/20 text-danger border-danger'
              : 'bg-surface-hover text-ink-muted hover:text-ink border-edge'
          }`}
          title="Voice prompt"
        >
          {isListening ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
        </button>

        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={isListening ? 'Listening to voice...' : 'Prompt agent (syncs to laptop)...'}
          className="flex-1 bg-sunk text-ink text-xs px-3.5 py-2.5 rounded-xl border border-edge focus:outline-none focus:border-accent placeholder:text-ink-subtle transition-colors motion-reduce:transition-none"
        />

        {isAgentRunning ? (
          <button
            type="button"
            onClick={handleStop}
            disabled={isStopping}
            className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-danger hover:bg-danger/90 disabled:opacity-50 text-sunk font-medium text-xs active:scale-95 transition-colors motion-reduce:transition-none shrink-0"
            title="Stop agent"
          >
            {isStopping ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Square className="w-3.5 h-3.5 fill-current" />
            )}
            <span>Stop</span>
          </button>
        ) : (
          <button
            type="submit"
            disabled={!input.trim() || isSending}
            className="p-2.5 rounded-xl bg-accent hover:bg-accent/90 disabled:opacity-40 text-sunk active:scale-95 transition-colors motion-reduce:transition-none shrink-0"
            title="Send prompt"
          >
            <Send className="w-4 h-4" />
          </button>
        )}
      </form>

      {/* Model Selector Bar Below Prompt Field (IDE-style) */}
      <div className="relative px-2.5 pb-2 bg-surface flex items-center justify-between">
        {modelMenuOpen && (
          <>
            <div
              className="fixed inset-0 z-30"
              onClick={() => setModelMenuOpen(false)}
            />
            <div className="absolute bottom-full left-2.5 right-2.5 mb-1.5 z-40 max-h-64 overflow-y-auto rounded-xl bg-surface border border-edge p-1.5 space-y-0.5">
              <div className="px-2.5 py-1 text-xs font-medium text-ink-muted">
                Select model
              </div>
              {models.map((m) => {
                const isSelected = m.id === selectedModel;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      onSelectModel(m.id);
                      setModelMenuOpen(false);
                    }}
                    className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs transition-colors motion-reduce:transition-none ${
                      isSelected
                        ? 'bg-accent-dim text-accent font-medium'
                        : 'text-ink-muted hover:bg-surface-hover hover:text-ink'
                    }`}
                  >
                    <span className="flex items-center gap-2 truncate">
                      <span className="truncate">{m.label}</span>
                      {m.tag && (
                        <span className="px-1.5 py-0.2 rounded bg-accent-dim text-accent text-[9px] font-semibold">
                          {m.tag}
                        </span>
                      )}
                    </span>
                    <span className="flex items-center gap-2 shrink-0 ml-2">
                      {typeof m.quota === 'number' && (
                        <span className="text-[10px] font-mono text-ink-subtle">
                          {Math.round(m.quota * 100)}%
                        </span>
                      )}
                      {isSelected && <Check className="w-3.5 h-3.5 text-accent" />}
                    </span>
                  </button>
                );
              })}
            </div>
          </>
        )}

        <button
          type="button"
          onClick={() => models.length > 0 && setModelMenuOpen((v) => !v)}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-sunk hover:bg-surface-hover border border-edge text-[11px] text-ink-muted hover:text-ink transition-colors motion-reduce:transition-none max-w-full"
        >
          <span className="truncate">
            {activeModelObj ? activeModelObj.label : models.length === 0 ? 'Default Model' : 'Select Model'}
          </span>
          <ChevronUp className={`w-3 h-3 text-ink-muted shrink-0 transition-transform motion-reduce:transition-none ${modelMenuOpen ? 'rotate-180' : ''}`} />
        </button>
      </div>
    </div>
  );
};

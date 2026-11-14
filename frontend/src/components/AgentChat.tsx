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
  Sparkles,
  Terminal,
  Loader2,
  Copy,
  CheckCheck
} from 'lucide-react';
import type { ConversationDetail } from '../types';

interface AgentChatProps {
  conversation: ConversationDetail | null;
  conversationId: string | null;
  onSendPrompt: (prompt: string, skipPermissions?: boolean) => void;
  isStreaming: boolean;
  streamText: string;
  streamThinking: string;
  onRefreshConversation: () => void;
}

export const AgentChat: React.FC<AgentChatProps> = ({
  conversation,
  onSendPrompt,
  isStreaming,
  streamText,
  streamThinking,
}) => {
  const [input, setInput] = useState('');
  const [showThinking, setShowThinking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);

  // Auto-scroll on new content
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversation?.steps, streamText, streamThinking, isStreaming]);

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
    if (!input.trim() || isStreaming) return;
    onSendPrompt(input.trim());
    setInput('');
  };

  const copyToClipboard = (text: string, id: number) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const quickPrompts = [
    { label: 'Check git status', text: 'Check git status and summarize recent changes' },
    { label: '/plan next step', text: '/plan what needs to be done next' },
    { label: 'Run tests', text: 'Run tests and report results' },
    { label: 'Review work', text: 'Review all recent edits and verify no regressions' },
  ];

  const pendingPermissions = conversation?.pending_permissions || [];

  return (
    <div className="flex flex-col h-[calc(100dvh-3.5rem-3.5rem)] bg-[#0d1117] text-gray-200">
      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3.5">
        {!conversation && !isStreaming ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mb-3">
              <Sparkles className="w-6 h-6 text-indigo-400" />
            </div>
            <h3 className="text-sm font-semibold text-white">Antigravity Agent Ready</h3>
            <p className="text-xs text-gray-400 mt-1 max-w-xs">
              Prompt your agent, review tools, grant permissions, and inspect code—all from your phone.
            </p>
          </div>
        ) : (
          conversation?.steps.map((step, idx) => {
            const isUser = step.source === 'USER_EXPLICIT';

            return (
              <div
                key={idx}
                className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} space-y-1`}
              >
                {/* Header label */}
                <div className="flex items-center gap-1.5 px-1 text-[10px] text-gray-400 font-mono">
                  {isUser ? (
                    <span>You</span>
                  ) : (
                    <span className="flex items-center gap-1 text-indigo-400 font-medium">
                      <Sparkles className="w-2.5 h-2.5" /> Agent
                    </span>
                  )}
                  {step.created_at && (
                    <span className="text-gray-500">
                      {new Date(step.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                </div>

                {/* Bubble */}
                <div
                  className={`max-w-[92%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed shadow-sm ${
                    isUser
                      ? 'bg-indigo-600 text-white rounded-br-xs'
                      : 'bg-[#161b22] border border-[#30363d] text-gray-200 rounded-bl-xs'
                  }`}
                >
                  {/* Thinking Block */}
                  {step.thinking && (
                    <div className="mb-2 pb-2 border-b border-[#30363d]/60">
                      <button
                        onClick={() => setShowThinking(!showThinking)}
                        className="flex items-center gap-1 text-[11px] font-mono text-purple-400 hover:text-purple-300"
                      >
                        {showThinking ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                        Agent Reasoning {showThinking ? '(Collapse)' : '(Peek)'}
                      </button>
                      {showThinking && (
                        <div className="mt-1.5 p-2 rounded bg-[#0d1117] text-[11px] font-mono text-gray-400 whitespace-pre-wrap max-h-48 overflow-y-auto">
                          {step.thinking}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Main content */}
                  <div className="whitespace-pre-wrap break-words">{step.content}</div>

                  {/* Tool Calls Summary */}
                  {step.tool_calls && step.tool_calls.length > 0 && (
                    <div className="mt-2 space-y-1.5 pt-2 border-t border-[#30363d]/40">
                      {step.tool_calls.map((tc: any, tcIdx: number) => {
                        const toolName = tc.name || tc.tool || 'Tool';
                        const params = tc.args || tc.parameters || {};
                        return (
                          <div
                            key={tcIdx}
                            className="p-2 rounded-lg bg-[#0d1117] border border-[#30363d] font-mono text-[11px]"
                          >
                            <div className="flex items-center justify-between text-indigo-400 mb-1">
                              <span className="flex items-center gap-1 font-semibold">
                                <Terminal className="w-3 h-3" /> {toolName}
                              </span>
                              <button
                                onClick={() => copyToClipboard(JSON.stringify(params, null, 2), idx * 100 + tcIdx)}
                                className="text-gray-400 hover:text-white"
                              >
                                {copiedId === idx * 100 + tcIdx ? (
                                  <CheckCheck className="w-3 h-3 text-emerald-400" />
                                ) : (
                                  <Copy className="w-3 h-3" />
                                )}
                              </button>
                            </div>
                            <pre className="text-gray-400 text-[10px] overflow-x-auto whitespace-pre-wrap">
                              {JSON.stringify(params, null, 2)}
                            </pre>
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

        {/* Live Streaming Indicator & Output */}
        {isStreaming && (
          <div className="flex flex-col items-start space-y-1">
            <div className="flex items-center gap-1.5 px-1 text-[10px] text-indigo-400 font-mono">
              <Loader2 className="w-3 h-3 animate-spin" />
              <span>Agent is thinking & responding...</span>
            </div>

            <div className="max-w-[92%] rounded-2xl rounded-bl-xs px-3.5 py-2.5 text-xs bg-[#161b22] border border-indigo-500/50 text-gray-200">
              {streamThinking && (
                <div className="mb-2 p-2 rounded bg-[#0d1117] border border-purple-900/30 font-mono text-[11px] text-purple-300 max-h-36 overflow-y-auto">
                  <div className="text-[10px] text-purple-400 font-bold mb-1">Live Thought Chain:</div>
                  {streamThinking}
                </div>
              )}
              <div className="whitespace-pre-wrap break-words">{streamText || '...'}</div>
            </div>
          </div>
        )}

        {/* Pending Permission Card (If any) */}
        {pendingPermissions.length > 0 && (
          <div className="my-3 p-3 rounded-xl bg-amber-950/40 border border-amber-500/60 shadow-lg">
            <div className="flex items-center gap-2 text-amber-400 text-xs font-semibold mb-1.5">
              <ShieldAlert className="w-4 h-4 shrink-0 animate-bounce" />
              <span>Permission Request</span>
            </div>
            <p className="text-[11px] text-gray-300 mb-2.5 leading-relaxed">
              The agent needs your permission to execute:
            </p>
            {pendingPermissions.map((perm, pIdx) => (
              <div key={pIdx} className="mb-2 p-2 rounded bg-[#0d1117] font-mono text-[10px] text-amber-300 overflow-x-auto">
                <span className="font-bold text-white">{perm.tool}: </span>
                {JSON.stringify(perm.args)}
              </div>
            ))}
            <div className="flex items-center gap-2 mt-2">
              <button
                onClick={() => onSendPrompt('Approved, proceed.', true)}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs active:scale-95 transition-all"
              >
                <Check className="w-3.5 h-3.5" /> Approve & Run
              </button>
              <button
                onClick={() => onSendPrompt('Denied, do not run this command.')}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-rose-600/80 hover:bg-rose-600 text-white font-medium text-xs active:scale-95 transition-all"
              >
                <X className="w-3.5 h-3.5" /> Reject
              </button>
            </div>
          </div>
        )}

        <div ref={chatBottomRef} />
      </div>

      {/* Quick Prompts Bar */}
      <div className="px-2.5 py-1.5 flex gap-1.5 overflow-x-auto border-t border-[#30363d]/50 bg-[#161b22]/70 no-scrollbar">
        {quickPrompts.map((qp, idx) => (
          <button
            key={idx}
            disabled={isStreaming}
            onClick={() => onSendPrompt(qp.text)}
            className="shrink-0 px-2.5 py-1 rounded-full text-[11px] font-medium bg-[#21262d] text-gray-300 hover:text-white border border-[#30363d] active:scale-95 disabled:opacity-50 transition-all whitespace-nowrap"
          >
            {qp.label}
          </button>
        ))}
      </div>

      {/* Input Form */}
      <form onSubmit={handleSubmit} className="p-2.5 bg-[#161b22] border-t border-[#30363d] flex items-center gap-2">
        <button
          type="button"
          onClick={toggleMic}
          className={`p-2.5 rounded-xl border transition-all ${
            isListening
              ? 'bg-rose-600/20 text-rose-400 border-rose-500 animate-pulse'
              : 'bg-[#21262d] text-gray-400 hover:text-white border-[#30363d]'
          }`}
          title="Voice prompt"
        >
          {isListening ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
        </button>

        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={isListening ? 'Listening to voice...' : 'Ask agent to do something...'}
          disabled={isStreaming}
          className="flex-1 bg-[#0d1117] text-white text-xs px-3.5 py-2.5 rounded-xl border border-[#30363d] focus:outline-none focus:border-indigo-500 placeholder-gray-500"
        />

        <button
          type="submit"
          disabled={!input.trim() || isStreaming}
          className="p-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white active:scale-95 transition-all shadow-md shadow-indigo-600/20"
        >
          {isStreaming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </button>
      </form>
    </div>
  );
};

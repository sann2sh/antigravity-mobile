import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { Plus, X, Terminal as TerminalIcon, RotateCw } from 'lucide-react';
import {
  type TerminalSession,
  listTerminalSessions,
  createTerminalSession,
  deleteTerminalSession,
  getWsTokenQuery,
} from '../api';

interface TerminalViewProps {
  currentWorkspace: string;
}

interface TerminalPaneProps {
  session: TerminalSession;
  currentWorkspace: string;
  isActive: boolean;
  registerSender: (sessionId: string, sender: ((data: string) => void) | null) => void;
}

const TerminalPane: React.FC<TerminalPaneProps> = ({
  session,
  currentWorkspace,
  isActive,
  registerSender,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const isActiveRef = useRef(isActive);
  const [disconnected, setDisconnected] = useState(false);
  const [reconnectTick, setReconnectTick] = useState(0);

  useEffect(() => {
    isActiveRef.current = isActive;
    if (isActive && fitAddonRef.current && termRef.current && containerRef.current) {
      const frame = requestAnimationFrame(() => {
        if (!containerRef.current || !fitAddonRef.current || !termRef.current) return;
        if (containerRef.current.clientWidth > 0 && containerRef.current.clientHeight > 0) {
          try {
            fitAddonRef.current.fit();
            const ws = socketRef.current;
            if (ws && ws.readyState === WebSocket.OPEN) {
              ws.send(
                JSON.stringify({
                  type: 'resize',
                  rows: termRef.current.rows,
                  cols: termRef.current.cols,
                })
              );
            }
          } catch {
            // ignore fit errors during layout transitions
          }
        }
        termRef.current.focus();
      });
      return () => cancelAnimationFrame(frame);
    }
  }, [isActive]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const term = new XTerm({
      cursorBlink: true,
      fontSize: 12,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
      theme: {
        background: '#0d1014',
        foreground: '#D4D3CE',
        cursor: '#2dd4bf',
        selectionBackground: 'rgba(45, 212, 191, 0.25)',
      },
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(container);

    if (container.clientWidth > 0 && container.clientHeight > 0) {
      try {
        fitAddon.fit();
      } catch {
        // ignore initial fit error if hidden
      }
    }

    termRef.current = term;
    fitAddonRef.current = fitAddon;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const cwd = session.cwd || currentWorkspace;
    const tokenQuery = getWsTokenQuery();
    const wsUrl = `${protocol}//${window.location.host}/ws/terminal?session_id=${encodeURIComponent(
      session.id
    )}&cwd=${encodeURIComponent(cwd)}&rows=${term.rows}&cols=${term.cols}${tokenQuery ? `&${tokenQuery}` : ''}`;
    const ws = new WebSocket(wsUrl);
    socketRef.current = ws;
    setDisconnected(false);

    let intentionallyClosed = false;

    ws.onopen = () => {
      setDisconnected(false);
      if (container.clientWidth > 0 && container.clientHeight > 0) {
        try {
          fitAddon.fit();
        } catch {
          // ignore
        }
      }
      ws.send(JSON.stringify({ type: 'resize', rows: term.rows, cols: term.cols }));
      if (isActiveRef.current) {
        term.focus();
      }
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'output') {
          term.write(msg.data);
        }
      } catch {
        term.write(event.data);
      }
    };

    ws.onclose = () => {
      if (!intentionallyClosed) {
        setDisconnected(true);
      }
    };

    const dataDisposable = term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'input', data }));
      }
    });

    registerSender(session.id, (data: string) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'input', data }));
      }
      term.focus();
    });

    const syncSize = () => {
      if (!container || container.clientWidth === 0 || container.clientHeight === 0) return;
      try {
        fitAddon.fit();
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'resize', rows: term.rows, cols: term.cols }));
        }
      } catch {
        // ignore
      }
    };

    const resizeObserver = new ResizeObserver(() => {
      if (isActiveRef.current) {
        syncSize();
      }
    });
    resizeObserver.observe(container);
    window.addEventListener('resize', syncSize);

    return () => {
      intentionallyClosed = true;
      registerSender(session.id, null);
      window.removeEventListener('resize', syncSize);
      resizeObserver.disconnect();
      dataDisposable.dispose();
      ws.close();
      term.dispose();
      termRef.current = null;
      fitAddonRef.current = null;
      socketRef.current = null;
    };
  }, [session.id, reconnectTick]);

  return (
    <div className={isActive ? 'flex-1 flex flex-col overflow-hidden relative' : 'hidden'}>
      {disconnected && (
        <div className="flex items-center justify-between px-3 py-1.5 bg-warn/15 border-b border-warn/40 text-warn text-xs">
          <span>Terminal disconnected</span>
          <button
            onClick={() => setReconnectTick((t) => t + 1)}
            className="flex items-center gap-1 px-2 py-0.5 rounded bg-warn/25 hover:bg-warn/40 text-ink font-medium transition-colors motion-reduce:transition-none"
          >
            <RotateCw className="w-3 h-3" /> Reconnect
          </button>
        </div>
      )}
      <div ref={containerRef} className="flex-1 p-2 bg-sunk overflow-hidden" />
    </div>
  );
};

export const TerminalView: React.FC<TerminalViewProps> = ({ currentWorkspace }) => {
  const [sessions, setSessions] = useState<TerminalSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const sendersRef = useRef<Map<string, (data: string) => void>>(new Map());
  const initPromiseRef = useRef<Promise<TerminalSession[]> | null>(null);

  const registerSender = useCallback(
    (sessionId: string, sender: ((data: string) => void) | null) => {
      if (sender) {
        sendersRef.current.set(sessionId, sender);
      } else {
        sendersRef.current.delete(sessionId);
      }
    },
    []
  );

  useEffect(() => {
    let mounted = true;

    if (!initPromiseRef.current) {
      initPromiseRef.current = (async () => {
        try {
          const data = await listTerminalSessions();
          if (data.sessions && data.sessions.length > 0) {
            return data.sessions;
          }
          const created = await createTerminalSession(currentWorkspace);
          return [created];
        } catch {
          return [];
        }
      })();
    }

    initPromiseRef.current.then((initialSessions) => {
      if (!mounted) return;
      setSessions(initialSessions);
      if (initialSessions.length > 0) {
        setActiveSessionId((prev) => prev ?? initialSessions[0].id);
      }
      setLoading(false);
    });

    return () => {
      mounted = false;
    };
  }, []);

  const handleCreateSession = async () => {
    if (creating) return;
    setCreating(true);
    try {
      const created = await createTerminalSession(currentWorkspace);
      setSessions((prev) => [...prev, created]);
      setActiveSessionId(created.id);
    } catch (err) {
      console.error('Failed to create terminal session:', err);
    } finally {
      setCreating(false);
    }
  };

  const handleCloseSession = async (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();

    setSessions((prev) => {
      const idx = prev.findIndex((s) => s.id === sessionId);
      const next = prev.filter((s) => s.id !== sessionId);
      if (activeSessionId === sessionId) {
        const fallback = next[Math.min(idx, next.length - 1)] ?? null;
        setActiveSessionId(fallback ? fallback.id : null);
      }
      return next;
    });

    try {
      await deleteTerminalSession(sessionId);
    } catch (err) {
      console.error('Failed to delete terminal session:', err);
    }
  };

  const sendKey = (keyString: string) => {
    if (!activeSessionId) return;
    const sender = sendersRef.current.get(activeSessionId);
    if (sender) {
      sender(keyString);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100dvh-3.5rem-3.5rem)] bg-canvas text-ink">
      {/* IDE-style Terminal Session Tab Bar */}
      <div className="flex items-center justify-between gap-2 px-2 py-1.5 bg-surface border-b border-edge">
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar flex-1 min-w-0">
          {sessions.map((session) => {
            const isActive = session.id === activeSessionId;
            return (
              <div
                key={session.id}
                onClick={() => setActiveSessionId(session.id)}
                className={`group flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium cursor-pointer shrink-0 transition-colors motion-reduce:transition-none border ${
                  isActive
                    ? 'bg-canvas text-ink border-edge'
                    : 'bg-transparent text-ink-muted border-transparent hover:text-ink hover:bg-surface-hover/60'
                }`}
              >
                <TerminalIcon
                  className={`w-3 h-3 shrink-0 ${
                    isActive ? 'text-accent' : 'text-ink-subtle'
                  }`}
                />
                <span className="truncate max-w-[110px]">{session.name}</span>
                <button
                  type="button"
                  onClick={(e) => handleCloseSession(e, session.id)}
                  title={`Close ${session.name}`}
                  aria-label={`Close ${session.name}`}
                  className="p-0.5 rounded hover:bg-surface-hover text-ink-muted hover:text-ink transition-colors motion-reduce:transition-none"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            );
          })}

          <button
            type="button"
            onClick={handleCreateSession}
            disabled={creating}
            title="New Terminal"
            aria-label="New Terminal"
            className="flex items-center justify-center p-1 rounded-md text-ink-muted hover:text-ink hover:bg-surface-hover disabled:opacity-50 shrink-0 transition-colors motion-reduce:transition-none"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        <span className="text-[10px] font-mono text-ink-muted truncate max-w-[110px] shrink-0">
          {currentWorkspace.replace(/^\/home\/[^/]+/, '~')}
        </span>
      </div>

      {/* Terminal Panes */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {loading ? (
          <div className="flex-1 flex items-center justify-center text-xs text-ink-subtle">
            Starting terminal…
          </div>
        ) : sessions.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-ink-muted">
            <TerminalIcon className="w-8 h-8 text-ink-subtle" />
            <span className="text-xs">No active terminal sessions</span>
            <button
              type="button"
              onClick={handleCreateSession}
              disabled={creating}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent hover:bg-accent/90 text-sunk text-xs font-medium transition-colors motion-reduce:transition-none"
            >
              <Plus className="w-3.5 h-3.5" /> New Terminal
            </button>
          </div>
        ) : (
          sessions.map((session) => (
            <TerminalPane
              key={session.id}
              session={session}
              currentWorkspace={currentWorkspace}
              isActive={session.id === activeSessionId}
              registerSender={registerSender}
            />
          ))
        )}

        {/* Mobile Helper Keys Bar */}
        <div className="flex items-center gap-1 p-1.5 bg-surface border-t border-edge overflow-x-auto no-scrollbar">
          <button
            type="button"
            onClick={() => sendKey('\x1b')}
            className="px-2.5 py-1.5 rounded-lg bg-surface-hover text-ink active:bg-accent active:text-sunk text-xs border border-edge transition-colors motion-reduce:transition-none"
          >
            ESC
          </button>
          <button
            type="button"
            onClick={() => sendKey('\t')}
            className="px-2.5 py-1.5 rounded-lg bg-surface-hover text-ink active:bg-accent active:text-sunk text-xs border border-edge transition-colors motion-reduce:transition-none"
          >
            TAB
          </button>
          <button
            type="button"
            onClick={() => sendKey('\x03')}
            className="px-2.5 py-1.5 rounded-lg bg-danger/15 text-danger active:bg-danger active:text-sunk text-xs font-mono border border-danger/40 transition-colors motion-reduce:transition-none"
          >
            CTRL+C
          </button>
          <button
            type="button"
            onClick={() => sendKey('\x1b[A')}
            className="px-2.5 py-1.5 rounded-lg bg-surface-hover text-ink active:bg-accent active:text-sunk text-xs font-mono border border-edge transition-colors motion-reduce:transition-none"
          >
            ↑
          </button>
          <button
            type="button"
            onClick={() => sendKey('\x1b[B')}
            className="px-2.5 py-1.5 rounded-lg bg-surface-hover text-ink active:bg-accent active:text-sunk text-xs font-mono border border-edge transition-colors motion-reduce:transition-none"
          >
            ↓
          </button>
          <button
            type="button"
            onClick={() => sendKey('clear\n')}
            className="px-2.5 py-1.5 rounded-lg bg-surface-hover text-ink active:bg-accent active:text-sunk text-xs border border-edge transition-colors motion-reduce:transition-none"
          >
            Clear
          </button>
          <button
            type="button"
            onClick={() => sendKey('|')}
            className="px-2 py-1.5 rounded-lg bg-surface-hover text-ink active:bg-accent active:text-sunk text-xs font-mono border border-edge transition-colors motion-reduce:transition-none"
          >
            |
          </button>
          <button
            type="button"
            onClick={() => sendKey('~')}
            className="px-2 py-1.5 rounded-lg bg-surface-hover text-ink active:bg-accent active:text-sunk text-xs font-mono border border-edge transition-colors motion-reduce:transition-none"
          >
            ~
          </button>
          <button
            type="button"
            onClick={() => sendKey('/')}
            className="px-2 py-1.5 rounded-lg bg-surface-hover text-ink active:bg-accent active:text-sunk text-xs font-mono border border-edge transition-colors motion-reduce:transition-none"
          >
            /
          </button>
        </div>
      </div>
    </div>
  );
};

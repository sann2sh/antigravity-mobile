import React, { useState, useEffect, useRef } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import {
  Play,
  RotateCcw,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { runQuickCommand } from '../api';

interface TerminalViewProps {
  currentWorkspace: string;
}

export const TerminalView: React.FC<TerminalViewProps> = ({ currentWorkspace }) => {
  const [mode, setMode] = useState<'interactive' | 'quick'>('quick');
  const [quickCmd, setQuickCmd] = useState('');
  const [quickOutput, setQuickOutput] = useState<{
    command: string;
    exit_code: number;
    stdout: string;
    stderr: string;
    success: boolean;
  } | null>(null);
  const [running, setRunning] = useState(false);

  // Xterm refs
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermInstance = useRef<XTerm | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);

  // Quick preset chips
  const quickPresets = [
    'git status -s',
    'git diff --stat',
    'git log -n 3 --oneline',
    'ls -la',
    'npm run build',
    'docker ps',
  ];

  const handleRunQuick = async (cmdToRun?: string) => {
    const target = cmdToRun || quickCmd;
    if (!target.trim() || running) return;
    setRunning(true);
    setQuickOutput(null);
    try {
      const res = await runQuickCommand(target.trim(), currentWorkspace);
      setQuickOutput(res);
    } catch (err: any) {
      setQuickOutput({
        command: target,
        exit_code: -1,
        stdout: '',
        stderr: err.message,
        success: false,
      });
    } finally {
      setRunning(false);
    }
  };

  // Initialize interactive terminal when switching to 'interactive'
  useEffect(() => {
    if (mode !== 'interactive' || !terminalRef.current) return;

    const term = new XTerm({
      cursorBlink: true,
      fontSize: 12,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
      theme: {
        background: '#0d1117',
        foreground: '#c9d1d9',
        cursor: '#58a6ff',
      },
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(terminalRef.current);
    fitAddon.fit();

    xtermInstance.current = term;
    fitAddonRef.current = fitAddon;

    // Connect WebSocket
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/terminal?rows=${term.rows}&cols=${term.cols}`;
    const ws = new WebSocket(wsUrl);
    socketRef.current = ws;

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

    term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'input', data }));
      }
    });

    const handleResize = () => {
      try {
        fitAddon.fit();
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'resize', rows: term.rows, cols: term.cols }));
        }
      } catch {}
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      ws.close();
      term.dispose();
      xtermInstance.current = null;
    };
  }, [mode]);

  // Touch helper buttons for mobile terminal
  const sendKey = (keyString: string) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: 'input', data: keyString }));
    }
  };

  return (
    <div className="flex flex-col h-[calc(100dvh-3.5rem-3.5rem)] bg-[#0d1117] text-gray-200">
      {/* Mode Switcher */}
      <div className="flex items-center justify-between p-2 bg-[#161b22] border-b border-[#30363d]">
        <div className="flex items-center gap-1.5 p-0.5 bg-[#0d1117] rounded-lg border border-[#30363d]">
          <button
            onClick={() => setMode('quick')}
            className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
              mode === 'quick' ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-400 hover:text-white'
            }`}
          >
            Quick Commands
          </button>
          <button
            onClick={() => setMode('interactive')}
            className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
              mode === 'interactive' ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-400 hover:text-white'
            }`}
          >
            Interactive PTY
          </button>
        </div>

        <span className="text-[10px] font-mono text-gray-400 truncate max-w-[140px]">
          {currentWorkspace.replace(/^\/home\/[^/]+/, '~')}
        </span>
      </div>

      {mode === 'quick' ? (
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {/* Preset Buttons */}
          <div>
            <div className="text-[11px] font-medium text-gray-400 mb-1.5">Common Actions</div>
            <div className="grid grid-cols-2 gap-2">
              {quickPresets.map((preset) => (
                <button
                  key={preset}
                  onClick={() => handleRunQuick(preset)}
                  disabled={running}
                  className="flex items-center justify-between p-2 rounded-xl bg-[#161b22] hover:bg-[#21262d] border border-[#30363d] text-left text-xs font-mono text-gray-300 active:scale-95 transition-all"
                >
                  <span className="truncate">{preset}</span>
                  <Play className="w-3 h-3 text-indigo-400 shrink-0 ml-1" />
                </button>
              ))}
            </div>
          </div>

          {/* Custom Command Box */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleRunQuick();
            }}
            className="flex gap-2"
          >
            <input
              type="text"
              value={quickCmd}
              onChange={(e) => setQuickCmd(e.target.value)}
              placeholder="e.g. pytest, git status, cargo check..."
              className="flex-1 px-3 py-2 text-xs font-mono bg-[#161b22] border border-[#30363d] rounded-xl text-white focus:outline-none focus:border-indigo-500 placeholder-gray-500"
            />
            <button
              type="submit"
              disabled={!quickCmd.trim() || running}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold rounded-xl flex items-center gap-1 active:scale-95 transition-all"
            >
              <Play className="w-3.5 h-3.5" /> Run
            </button>
          </form>

          {/* Output Card */}
          {running && (
            <div className="p-4 rounded-xl bg-[#161b22] border border-[#30363d] text-xs text-indigo-400 flex items-center gap-2">
              <RotateCcw className="w-4 h-4 animate-spin" />
              <span>Executing command...</span>
            </div>
          )}

          {quickOutput && !running && (
            <div className="rounded-xl bg-[#161b22] border border-[#30363d] overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 bg-[#1f242c] border-b border-[#30363d] text-xs font-mono">
                <span className="text-gray-300 font-semibold">$ {quickOutput.command}</span>
                <span className="flex items-center gap-1">
                  {quickOutput.success ? (
                    <span className="text-emerald-400 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> exit 0
                    </span>
                  ) : (
                    <span className="text-rose-400 flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5" /> exit {quickOutput.exit_code}
                    </span>
                  )}
                </span>
              </div>

              <div className="p-3 font-mono text-[11px] max-h-72 overflow-y-auto leading-relaxed">
                {quickOutput.stdout && (
                  <pre className="text-gray-200 whitespace-pre-wrap">{quickOutput.stdout}</pre>
                )}
                {quickOutput.stderr && (
                  <pre className="text-rose-400 mt-2 whitespace-pre-wrap">{quickOutput.stderr}</pre>
                )}
                {!quickOutput.stdout && !quickOutput.stderr && (
                  <span className="text-gray-500 italic">(No output produced)</span>
                )}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Terminal Container */}
          <div ref={terminalRef} className="flex-1 p-2 bg-[#0d1117] overflow-hidden" />

          {/* Mobile Helper Keys Bar */}
          <div className="flex items-center gap-1 p-1.5 bg-[#161b22] border-t border-[#30363d] overflow-x-auto no-scrollbar">
            <button
              onClick={() => sendKey('\x1b')}
              className="px-2.5 py-1.5 rounded-lg bg-[#21262d] text-gray-300 active:bg-indigo-600 text-xs font-mono border border-[#30363d]"
            >
              ESC
            </button>
            <button
              onClick={() => sendKey('\t')}
              className="px-2.5 py-1.5 rounded-lg bg-[#21262d] text-gray-300 active:bg-indigo-600 text-xs font-mono border border-[#30363d]"
            >
              TAB
            </button>
            <button
              onClick={() => sendKey('\x03')}
              className="px-2.5 py-1.5 rounded-lg bg-rose-950/60 text-rose-300 active:bg-rose-600 active:text-white text-xs font-mono border border-rose-800/50"
            >
              CTRL+C
            </button>
            <button
              onClick={() => sendKey('\x1b[A')}
              className="px-2.5 py-1.5 rounded-lg bg-[#21262d] text-gray-300 active:bg-indigo-600 text-xs font-mono border border-[#30363d]"
            >
              ↑
            </button>
            <button
              onClick={() => sendKey('\x1b[B')}
              className="px-2.5 py-1.5 rounded-lg bg-[#21262d] text-gray-300 active:bg-indigo-600 text-xs font-mono border border-[#30363d]"
            >
              ↓
            </button>
            <button
              onClick={() => sendKey('clear\n')}
              className="px-2.5 py-1.5 rounded-lg bg-[#21262d] text-gray-300 active:bg-indigo-600 text-xs font-mono border border-[#30363d]"
            >
              Clear
            </button>
            <button
              onClick={() => sendKey('|')}
              className="px-2 py-1.5 rounded-lg bg-[#21262d] text-gray-300 active:bg-indigo-600 text-xs font-mono border border-[#30363d]"
            >
              |
            </button>
            <button
              onClick={() => sendKey('~')}
              className="px-2 py-1.5 rounded-lg bg-[#21262d] text-gray-300 active:bg-indigo-600 text-xs font-mono border border-[#30363d]"
            >
              ~
            </button>
            <button
              onClick={() => sendKey('/')}
              className="px-2 py-1.5 rounded-lg bg-[#21262d] text-gray-300 active:bg-indigo-600 text-xs font-mono border border-[#30363d]"
            >
              /
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

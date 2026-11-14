import React, { useState, useEffect } from 'react';
import {
  Folder,
  File,
  ChevronRight,
  ArrowUp,
  Check,
  Copy,
  X,
  RefreshCw,
  FolderCheck,
  FileCode,
  FileText
} from 'lucide-react';
import type { DirectoryContent, FileItem } from '../types';
import { listDirectory, readFile, setWorkspace } from '../api';

interface FileBrowserProps {
  currentWorkspace: string;
  onWorkspaceChange: (newWorkspace: string) => void;
}

export const FileBrowser: React.FC<FileBrowserProps> = ({
  currentWorkspace,
  onWorkspaceChange,
}) => {
  const [currentPath, setCurrentPath] = useState(currentWorkspace || '/');
  const [dirContent, setDirContent] = useState<DirectoryContent | null>(null);
  const [loading, setLoading] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  const [activeFile, setActiveFile] = useState<{ path: string; name: string; content: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const loadPath = async (targetPath?: string) => {
    setLoading(true);
    setStatusMsg(null);
    try {
      const data = await listDirectory(targetPath || currentPath);
      setDirContent(data);
      setCurrentPath(data.current_path);
    } catch (err: any) {
      setStatusMsg(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPath(currentWorkspace);
  }, [currentWorkspace]);

  const handleItemClick = async (item: FileItem) => {
    if (item.is_dir) {
      loadPath(item.path);
    } else {
      try {
        setLoading(true);
        const fileData = await readFile(item.path);
        setActiveFile(fileData);
      } catch (err: any) {
        alert(`Failed to read file: ${err.message}`);
      } finally {
        setLoading(false);
      }
    }
  };

  const handleSetWorkspace = async () => {
    try {
      const res = await setWorkspace(currentPath);
      if (res.success) {
        onWorkspaceChange(res.workspace);
        setStatusMsg('Active workspace updated!');
        setTimeout(() => setStatusMsg(null), 2500);
      }
    } catch (err: any) {
      setStatusMsg(`Failed: ${err.message}`);
    }
  };

  const handleCopy = () => {
    if (!activeFile) return;
    navigator.clipboard.writeText(activeFile.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isCurrentWorkspace = currentPath === currentWorkspace;

  // Format file size
  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const filteredItems = dirContent?.items.filter((i) => showHidden || !i.is_hidden) || [];

  return (
    <div className="flex flex-col h-[calc(100dvh-3.5rem-3.5rem)] bg-[#0d1117] text-gray-200">
      {/* Path Toolbar */}
      <div className="p-2.5 bg-[#161b22] border-b border-[#30363d] space-y-2">
        <div className="flex items-center justify-between gap-2">
          {/* Breadcrumbs */}
          <div className="flex items-center gap-1 text-xs font-mono overflow-x-auto whitespace-nowrap py-1 px-1 flex-1 no-scrollbar">
            <span
              onClick={() => loadPath('/')}
              className="cursor-pointer text-indigo-400 hover:underline"
            >
              /
            </span>
            {currentPath.split('/').filter(Boolean).map((part, idx, arr) => {
              const full = '/' + arr.slice(0, idx + 1).join('/');
              const isLast = idx === arr.length - 1;
              return (
                <React.Fragment key={full}>
                  <ChevronRight className="w-3 h-3 text-gray-500 shrink-0" />
                  <span
                    onClick={() => !isLast && loadPath(full)}
                    className={`cursor-pointer ${isLast ? 'text-white font-semibold' : 'text-gray-400 hover:text-white'}`}
                  >
                    {part}
                  </span>
                </React.Fragment>
              );
            })}
          </div>

          <button
            onClick={() => loadPath()}
            disabled={loading}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-[#21262d]"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Action Controls */}
        <div className="flex items-center justify-between text-xs pt-1">
          <div className="flex items-center gap-2">
            {dirContent?.parent_path && (
              <button
                onClick={() => loadPath(dirContent.parent_path!)}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#21262d] text-gray-300 hover:text-white border border-[#30363d]"
              >
                <ArrowUp className="w-3.5 h-3.5" /> Up
              </button>
            )}

            <button
              onClick={() => setShowHidden(!showHidden)}
              className={`px-2 py-1 rounded-lg text-[11px] border ${
                showHidden ? 'bg-indigo-950 text-indigo-300 border-indigo-700' : 'bg-[#21262d] text-gray-400 border-[#30363d]'
              }`}
            >
              {showHidden ? 'Hide dotfiles' : 'Show dotfiles'}
            </button>
          </div>

          <button
            onClick={handleSetWorkspace}
            disabled={isCurrentWorkspace}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all ${
              isCurrentWorkspace
                ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-700/60'
                : 'bg-indigo-600 hover:bg-indigo-500 text-white active:scale-95'
            }`}
          >
            {isCurrentWorkspace ? (
              <>
                <FolderCheck className="w-3.5 h-3.5 text-emerald-400" /> Current Workspace
              </>
            ) : (
              'Set as Workspace'
            )}
          </button>
        </div>

        {statusMsg && (
          <div className="text-[11px] text-emerald-400 font-medium py-0.5">
            {statusMsg}
          </div>
        )}
      </div>

      {/* Item List */}
      <div className="flex-1 overflow-y-auto divide-y divide-[#30363d]/40">
        {filteredItems.length === 0 ? (
          <div className="py-12 text-center text-xs text-gray-500">
            Empty directory
          </div>
        ) : (
          filteredItems.map((item) => {
            return (
              <div
                key={item.path}
                onClick={() => handleItemClick(item)}
                className="flex items-center justify-between px-3.5 py-2.5 hover:bg-[#161b22] active:bg-[#21262d] cursor-pointer transition-colors"
              >
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  {item.is_dir ? (
                    <Folder className="w-4 h-4 text-blue-400 shrink-0" />
                  ) : item.name.endsWith('.ts') || item.name.endsWith('.tsx') || item.name.endsWith('.js') || item.name.endsWith('.py') ? (
                    <FileCode className="w-4 h-4 text-amber-400 shrink-0" />
                  ) : item.name.endsWith('.md') || item.name.endsWith('.json') ? (
                    <FileText className="w-4 h-4 text-purple-400 shrink-0" />
                  ) : (
                    <File className="w-4 h-4 text-gray-400 shrink-0" />
                  )}
                  <span className={`text-xs truncate font-mono ${item.is_dir ? 'text-gray-200 font-medium' : 'text-gray-300'}`}>
                    {item.name}
                  </span>
                </div>

                <div className="flex items-center gap-3 shrink-0 text-[10px] text-gray-500 font-mono">
                  {!item.is_dir && <span>{formatSize(item.size)}</span>}
                  <ChevronRight className="w-3 h-3 text-gray-600" />
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* File Viewer Modal */}
      {activeFile && (
        <div className="fixed inset-0 z-50 flex flex-col bg-[#0d1117] safe-top safe-bottom">
          <div className="flex items-center justify-between px-3.5 py-2.5 bg-[#161b22] border-b border-[#30363d]">
            <div className="flex items-center gap-2 truncate">
              <FileText className="w-4 h-4 text-indigo-400 shrink-0" />
              <span className="text-xs font-mono font-semibold text-white truncate">
                {activeFile.name}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleCopy}
                className="flex items-center gap-1 px-2.5 py-1 rounded bg-[#21262d] text-gray-300 hover:text-white text-xs border border-[#30363d]"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'Copied' : 'Copy'}
              </button>
              <button
                onClick={() => setActiveFile(null)}
                className="p-1 rounded text-gray-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-auto p-3 font-mono text-[11px] leading-relaxed text-gray-300 whitespace-pre">
            {activeFile.content}
          </div>
        </div>
      )}
    </div>
  );
};

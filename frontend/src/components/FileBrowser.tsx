import React, { useState, useEffect } from 'react';
import {
  Folder,
  FolderOpen,
  File,
  ChevronRight,
  ChevronDown,
  ArrowUp,
  Check,
  Copy,
  X,
  RefreshCw,
  FolderCheck,
  FileCode,
  FileText,
  Pencil,
  Eye,
  Save,
  FilePlus,
  FolderPlus,
  WrapText
} from 'lucide-react';
import type { DirectoryContent, FileItem } from '../types';
import { listDirectory, readFile, saveFile, createFsEntry, setWorkspace } from '../api';

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
  const [expandedDirs, setExpandedDirs] = useState<Record<string, FileItem[]>>({});
  const [loading, setLoading] = useState(false);
  const [showHidden, setShowHidden] = useState(false);

  // Active File Viewer / Editor state
  const [activeFile, setActiveFile] = useState<{
    path: string;
    name: string;
    content: string;
    is_binary: boolean;
  } | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [wordWrap, setWordWrap] = useState(false);
  const [copied, setCopied] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const loadPath = async (targetPath?: string) => {
    setLoading(true);
    setStatusMsg(null);
    try {
      const data = await listDirectory(targetPath || currentPath);
      setDirContent(data);
      setCurrentPath(data.current_path);
      setExpandedDirs({});
    } catch (err: any) {
      setStatusMsg(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (currentWorkspace) {
      loadPath(currentWorkspace);
    }
  }, [currentWorkspace]);

  const toggleFolder = async (folderPath: string) => {
    if (expandedDirs[folderPath]) {
      const next = { ...expandedDirs };
      delete next[folderPath];
      setExpandedDirs(next);
      return;
    }
    try {
      const data = await listDirectory(folderPath);
      setExpandedDirs((prev) => ({ ...prev, [folderPath]: data.items }));
    } catch (err: any) {
      setStatusMsg(`Error: ${err.message}`);
    }
  };

  const openFile = async (filePath: string) => {
    try {
      setLoading(true);
      const fileData = await readFile(filePath);
      setActiveFile(fileData);
      setEditContent(fileData.content);
      setIsEditing(false);
      setSaveSuccess(false);
    } catch (err: any) {
      alert(`Failed to read file: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveFile = async () => {
    if (!activeFile || saving) return;
    setSaving(true);
    try {
      await saveFile(activeFile.path, editContent);
      setActiveFile({ ...activeFile, content: editContent });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (err: any) {
      alert(`Failed to save file: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleCreate = async (isDir: boolean) => {
    const label = isDir ? 'folder' : 'file';
    const name = window.prompt(`New ${label} name (inside ${currentPath.split('/').pop() || '/'}):`);
    if (!name || !name.trim()) return;
    const newPath = `${currentPath.replace(/\/$/, '')}/${name.trim()}`;
    try {
      await createFsEntry(newPath, isDir);
      await loadPath(currentPath);
      if (!isDir) {
        await openFile(newPath);
        setIsEditing(true);
      }
    } catch (err: any) {
      alert(`Failed to create ${label}: ${err.message}`);
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

  const handleCloseFile = () => {
    if (isEditing && editContent !== activeFile?.content) {
      if (!window.confirm('Discard unsaved changes?')) return;
    }
    setActiveFile(null);
    setIsEditing(false);
  };

  const handleCopy = () => {
    if (!activeFile) return;
    navigator.clipboard.writeText(isEditing ? editContent : activeFile.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isCurrentWorkspace = currentPath === currentWorkspace;
  const hasUnsavedChanges = Boolean(activeFile && editContent !== activeFile.content);

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getFileIcon = (name: string) => {
    if (/\.(ts|tsx|js|jsx|py|go|rs|java|c|cpp|sh)$/.test(name)) {
      return <FileCode className="w-4 h-4 text-warn shrink-0" />;
    }
    if (/\.(md|json|yaml|yml|toml|txt|css|html)$/.test(name)) {
      return <FileText className="w-4 h-4 text-accent shrink-0" />;
    }
    return <File className="w-4 h-4 text-ink-muted shrink-0" />;
  };

  const renderTree = (items: FileItem[], depth: number = 0): React.ReactNode => {
    const visible = items.filter((i) => showHidden || !i.is_hidden);
    return visible.map((item) => {
      const isExpanded = Boolean(expandedDirs[item.path]);
      const children = expandedDirs[item.path] || [];

      return (
        <div key={item.path}>
          <div
            onClick={() => (item.is_dir ? toggleFolder(item.path) : openFile(item.path))}
            onDoubleClick={() => item.is_dir && loadPath(item.path)}
            style={{ paddingLeft: `${12 + depth * 16}px` }}
            className="flex items-center justify-between pr-3 py-2 hover:bg-surface active:bg-surface-hover cursor-pointer transition-colors motion-reduce:transition-none border-b border-edge/25"
          >
            <div className="flex items-center gap-2 min-w-0 flex-1">
              {item.is_dir ? (
                <>
                  {isExpanded ? (
                    <ChevronDown className="w-3.5 h-3.5 text-ink-muted shrink-0" />
                  ) : (
                    <ChevronRight className="w-3.5 h-3.5 text-ink-subtle shrink-0" />
                  )}
                  {isExpanded ? (
                    <FolderOpen className="w-4 h-4 text-accent shrink-0" />
                  ) : (
                    <Folder className="w-4 h-4 text-accent shrink-0" />
                  )}
                </>
              ) : (
                <>
                  <span className="w-3.5 shrink-0" />
                  {getFileIcon(item.name)}
                </>
              )}
              <span
                className={`text-xs truncate font-mono ${
                  item.is_dir ? 'text-ink font-medium' : 'text-ink'
                }`}
              >
                {item.name}
              </span>
            </div>

            <div className="flex items-center gap-2 shrink-0 text-[10px] text-ink-subtle">
              {item.is_dir ? (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    loadPath(item.path);
                  }}
                  className="px-1.5 py-0.5 rounded bg-surface-hover hover:bg-edge text-ink-muted hover:text-ink text-[10px] transition-colors motion-reduce:transition-none"
                  title="Open folder as root"
                >
                  Open
                </button>
              ) : (
                <span className="tabular-nums">{formatSize(item.size)}</span>
              )}
            </div>
          </div>

          {item.is_dir && isExpanded && (
            <div className="bg-canvas/60">
              {children.length === 0 ? (
                <div
                  style={{ paddingLeft: `${28 + depth * 16}px` }}
                  className="py-1.5 text-[11px] text-ink-subtle italic font-mono"
                >
                  (empty)
                </div>
              ) : (
                renderTree(children, depth + 1)
              )}
            </div>
          )}
        </div>
      );
    });
  };

  const filteredRootItems = dirContent?.items.filter((i) => showHidden || !i.is_hidden) || [];
  const viewLines = activeFile ? activeFile.content.split('\n') : [];

  return (
    <div className="flex flex-col h-[calc(100dvh-3.5rem-3.5rem)] bg-canvas text-ink">
      {/* Explorer Header & Breadcrumbs */}
      <div className="p-2.5 bg-surface border-b border-edge space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1 text-xs font-mono overflow-x-auto whitespace-nowrap py-1 px-1 flex-1 no-scrollbar">
            <span
              onClick={() => loadPath('/')}
              className="cursor-pointer text-accent hover:underline"
            >
              /
            </span>
            {currentPath.split('/').filter(Boolean).map((part, idx, arr) => {
              const full = '/' + arr.slice(0, idx + 1).join('/');
              const isLast = idx === arr.length - 1;
              return (
                <React.Fragment key={full}>
                  <ChevronRight className="w-3 h-3 text-ink-subtle shrink-0" />
                  <span
                    onClick={() => !isLast && loadPath(full)}
                    className={`cursor-pointer ${
                      isLast ? 'text-ink font-semibold' : 'text-ink-muted hover:text-ink'
                    }`}
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
            className="p-1.5 rounded-lg text-ink-muted hover:text-ink hover:bg-surface-hover transition-colors motion-reduce:transition-none"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* IDE Action Toolbar */}
        <div className="flex items-center justify-between gap-1.5 text-xs pt-0.5 flex-wrap">
          <div className="flex items-center gap-1.5">
            {dirContent?.parent_path && (
              <button
                onClick={() => loadPath(dirContent.parent_path!)}
                className="flex items-center gap-1 px-2 py-1 rounded-lg bg-surface-hover text-ink-muted hover:text-ink border border-edge transition-colors motion-reduce:transition-none"
              >
                <ArrowUp className="w-3.5 h-3.5" />
              </button>
            )}

            <button
              onClick={() => handleCreate(false)}
              className="flex items-center gap-1 px-2 py-1 rounded-lg bg-surface-hover text-ink-muted hover:text-ink border border-edge transition-colors motion-reduce:transition-none"
              title="New File"
            >
              <FilePlus className="w-3.5 h-3.5 text-accent" />
              <span className="text-[11px]">File</span>
            </button>

            <button
              onClick={() => handleCreate(true)}
              className="flex items-center gap-1 px-2 py-1 rounded-lg bg-surface-hover text-ink-muted hover:text-ink border border-edge transition-colors motion-reduce:transition-none"
              title="New Folder"
            >
              <FolderPlus className="w-3.5 h-3.5 text-accent" />
              <span className="text-[11px]">Folder</span>
            </button>

            <button
              onClick={() => setShowHidden(!showHidden)}
              className={`px-2 py-1 rounded-lg text-[11px] border transition-colors motion-reduce:transition-none ${
                showHidden
                  ? 'bg-accent-dim text-accent border-accent/50'
                  : 'bg-surface-hover text-ink-muted border-edge'
              }`}
            >
              Dotfiles
            </button>
          </div>

          <button
            onClick={handleSetWorkspace}
            disabled={isCurrentWorkspace}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors motion-reduce:transition-none ${
              isCurrentWorkspace
                ? 'bg-ok/15 text-ok border border-ok/40'
                : 'bg-accent hover:bg-accent/90 text-sunk active:scale-95'
            }`}
          >
            {isCurrentWorkspace ? (
              <>
                <FolderCheck className="w-3.5 h-3.5 text-ok" /> Workspace
              </>
            ) : (
              'Set Workspace'
            )}
          </button>
        </div>

        {statusMsg && (
          <div className="text-[11px] text-ok font-medium py-0.5">
            {statusMsg}
          </div>
        )}
      </div>

      {/* Tree View */}
      <div className="flex-1 overflow-y-auto">
        {filteredRootItems.length === 0 ? (
          <div className="py-12 text-center text-xs text-ink-subtle">
            Empty directory
          </div>
        ) : (
          renderTree(dirContent?.items || [], 0)
        )}
      </div>

      {/* IDE File Viewer / Editor Modal */}
      {activeFile && (
        <div className="fixed inset-0 z-50 flex flex-col bg-canvas safe-top safe-bottom">
          {/* Editor Top Bar */}
          <div className="flex items-center justify-between px-3 py-2 bg-surface border-b border-edge gap-2">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              {getFileIcon(activeFile.name)}
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-mono font-semibold text-ink truncate">
                    {activeFile.name}
                  </span>
                  {hasUnsavedChanges && (
                    <span className="w-2 h-2 rounded-full bg-warn shrink-0" title="Unsaved changes" />
                  )}
                </div>
                <div className="text-[10px] font-mono text-ink-subtle truncate">
                  {activeFile.path.replace(/^\/home\/[^/]+/, '~')}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {!activeFile.is_binary && (
                <>
                  <button
                    onClick={() => setWordWrap(!wordWrap)}
                    className={`p-1.5 rounded-lg border text-xs transition-colors motion-reduce:transition-none ${
                      wordWrap
                        ? 'bg-accent-dim text-accent border-accent/50'
                        : 'bg-surface-hover text-ink-muted border-edge'
                    }`}
                    title="Toggle Word Wrap"
                  >
                    <WrapText className="w-3.5 h-3.5" />
                  </button>

                  <button
                    onClick={() => setIsEditing(!isEditing)}
                    className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors motion-reduce:transition-none ${
                      isEditing
                        ? 'bg-accent text-sunk border-accent'
                        : 'bg-surface-hover text-ink border-edge hover:bg-edge'
                    }`}
                  >
                    {isEditing ? (
                      <>
                        <Eye className="w-3.5 h-3.5" /> View
                      </>
                    ) : (
                      <>
                        <Pencil className="w-3.5 h-3.5" /> Edit
                      </>
                    )}
                  </button>

                  {isEditing && (
                    <button
                      onClick={handleSaveFile}
                      disabled={saving || !hasUnsavedChanges}
                      className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors motion-reduce:transition-none ${
                        saveSuccess
                          ? 'bg-ok text-sunk'
                          : hasUnsavedChanges
                            ? 'bg-ok hover:bg-ok/90 text-sunk active:scale-95'
                            : 'bg-surface-hover text-ink-subtle border border-edge'
                      }`}
                    >
                      <Save className="w-3.5 h-3.5" />
                      {saving ? 'Saving' : saveSuccess ? 'Saved' : 'Save'}
                    </button>
                  )}
                </>
              )}

              <button
                onClick={handleCopy}
                className="p-1.5 rounded-lg bg-surface-hover text-ink-muted hover:text-ink border border-edge transition-colors motion-reduce:transition-none"
                title="Copy content"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-ok" /> : <Copy className="w-3.5 h-3.5" />}
              </button>

              <button
                onClick={handleCloseFile}
                className="p-1.5 rounded-lg text-ink-muted hover:text-ink hover:bg-surface-hover transition-colors motion-reduce:transition-none"
                title="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Editor / Viewer Body */}
          {isEditing && !activeFile.is_binary ? (
            <textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Tab') {
                  e.preventDefault();
                  const start = e.currentTarget.selectionStart;
                  const end = e.currentTarget.selectionEnd;
                  const next = editContent.substring(0, start) + '  ' + editContent.substring(end);
                  setEditContent(next);
                  setTimeout(() => {
                    e.currentTarget.selectionStart = e.currentTarget.selectionEnd = start + 2;
                  }, 0);
                }
              }}
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              className={`flex-1 w-full p-3 bg-canvas text-ink font-mono text-[12px] leading-relaxed focus:outline-none resize-none ${
                wordWrap ? 'whitespace-pre-wrap' : 'whitespace-pre overflow-x-auto'
              }`}
            />
          ) : (
            <div className="flex-1 overflow-auto bg-canvas font-mono text-[11px] leading-relaxed">
              <div className="min-w-full inline-block py-2">
                {viewLines.map((line, i) => (
                  <div key={i} className="flex hover:bg-surface/80 px-2">
                    <span className="w-10 pr-3 text-right text-ink-subtle select-none shrink-0">
                      {i + 1}
                    </span>
                    <span
                      className={`text-ink flex-1 ${
                        wordWrap ? 'whitespace-pre-wrap break-all' : 'whitespace-pre'
                      }`}
                    >
                      {line || ' '}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

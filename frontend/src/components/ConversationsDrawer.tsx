import React, { useState } from 'react';
import { X, Search, Plus, MessageSquare, ArrowRight, Bot, Folder } from 'lucide-react';
import type { ConversationSummary } from '../types';

interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  conversations: ConversationSummary[];
  activeId: string | null;
  onSelectConversation: (id: string) => void;
  onNewSession: () => void;
}

function formatRelativeTime(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const diffSec = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffSec < 60) return 'just now';
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
    return `${Math.floor(diffSec / 86400)}d ago`;
  } catch {
    return dateStr;
  }
}

export const ConversationsDrawer: React.FC<DrawerProps> = ({
  isOpen,
  onClose,
  conversations,
  activeId,
  onSelectConversation,
  onNewSession,
}) => {
  const [query, setQuery] = useState('');

  if (!isOpen) return null;

  const filtered = conversations.filter((c) =>
    (c.title || '').toLowerCase().includes(query.toLowerCase()) ||
    (c.preview || '').toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-sunk/80 transition-opacity motion-reduce:transition-none"
        onClick={onClose}
      />

      {/* Drawer content */}
      <div className="relative w-4/5 max-w-xs h-full bg-surface border-r border-edge flex flex-col z-10 safe-top safe-bottom">
        {/* Drawer Header */}
        <div className="p-3.5 border-b border-edge flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bot className="w-5 h-5 text-accent" />
            <h2 className="font-semibold text-ink text-sm">Sessions</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-ink-muted hover:text-ink rounded-md hover:bg-surface-hover transition-colors motion-reduce:transition-none"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* New Session Button */}
        <div className="p-3">
          <button
            onClick={() => {
              onNewSession();
              onClose();
            }}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-3 bg-accent hover:bg-accent/90 active:bg-accent/80 text-sunk rounded-xl text-xs font-semibold active:scale-[0.98] transition-colors motion-reduce:transition-none"
          >
            <Plus className="w-4 h-4" />
            New Agent Task
          </button>
        </div>

        {/* Search */}
        <div className="px-3 pb-2">
          <div className="relative flex items-center">
            <Search className="w-4 h-4 absolute left-3 text-ink-muted" />
            <input
              type="text"
              placeholder="Search conversations..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-canvas border border-edge rounded-lg text-ink placeholder:text-ink-subtle focus:outline-none focus:border-accent"
            />
          </div>
        </div>

        {/* Conversation List */}
        <div className="flex-1 overflow-y-auto px-2 space-y-1.5 py-1">
          {filtered.length === 0 ? (
            <div className="text-center py-8 text-ink-subtle text-xs">
              No conversations found.
            </div>
          ) : (
            filtered.map((c) => {
              const isActive = c.conversation_id === activeId;
              return (
                <button
                  key={c.conversation_id}
                  onClick={() => {
                    onSelectConversation(c.conversation_id);
                    onClose();
                  }}
                  className={`w-full text-left p-2.5 rounded-xl transition-colors motion-reduce:transition-none border ${
                    isActive
                      ? 'bg-accent-dim/60 border-accent/50 text-ink'
                      : 'bg-canvas/60 hover:bg-surface-hover border-edge/60 text-ink-muted'
                  }`}
                >
                  <div className="flex items-start justify-between gap-1 mb-1">
                    <span className="font-medium text-xs truncate flex-1">
                      {c.title || 'Untitled Session'}
                    </span>
                    <span className="text-[10px] text-ink-muted shrink-0 font-mono">
                      {formatRelativeTime(c.last_modified_time)}
                    </span>
                  </div>

                  {c.preview && (
                    <p className="text-[11px] text-ink-muted line-clamp-2 leading-relaxed mb-1.5">
                      {c.preview}
                    </p>
                  )}

                  <div className="flex items-center justify-between text-[10px] text-ink-subtle gap-2">
                    <span className="flex items-center gap-1 tabular-nums shrink-0">
                      <MessageSquare className="w-3 h-3 text-ink-muted" />
                      {c.step_count} steps
                    </span>
                    {c.workspaces && c.workspaces.length > 0 && (
                      <span className="flex items-center gap-1 truncate font-mono text-accent/80">
                        <Folder className="w-3 h-3 shrink-0" />
                        <span className="truncate">{c.workspaces[0].split('/').filter(Boolean).pop() || c.workspaces[0]}</span>
                      </span>
                    )}
                    {isActive && (
                      <span className="text-accent font-semibold flex items-center gap-0.5 shrink-0">
                        Active <ArrowRight className="w-3 h-3" />
                      </span>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

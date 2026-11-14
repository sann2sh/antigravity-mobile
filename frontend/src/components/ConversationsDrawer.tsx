import React, { useState } from 'react';
import { X, Search, Plus, MessageSquare, ArrowRight, Bot } from 'lucide-react';
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
        className="fixed inset-0 bg-black/70 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Drawer content */}
      <div className="relative w-4/5 max-w-xs h-full bg-[#161b22] border-r border-[#30363d] shadow-2xl flex flex-col z-10 safe-top safe-bottom">
        {/* Drawer Header */}
        <div className="p-3.5 border-b border-[#30363d] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bot className="w-5 h-5 text-indigo-400" />
            <h2 className="font-semibold text-white text-sm">Sessions</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-white rounded-md hover:bg-[#21262d]"
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
            className="w-full flex items-center justify-center gap-2 py-2.5 px-3 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-lg shadow-indigo-600/20 active:scale-[0.98] transition-all"
          >
            <Plus className="w-4 h-4" />
            New Agent Task
          </button>
        </div>

        {/* Search */}
        <div className="px-3 pb-2">
          <div className="relative flex items-center">
            <Search className="w-4 h-4 absolute left-3 text-gray-400" />
            <input
              type="text"
              placeholder="Search conversations..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-[#0d1117] border border-[#30363d] rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
            />
          </div>
        </div>

        {/* Conversation List */}
        <div className="flex-1 overflow-y-auto px-2 space-y-1.5 py-1">
          {filtered.length === 0 ? (
            <div className="text-center py-8 text-gray-500 text-xs">
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
                  className={`w-full text-left p-2.5 rounded-xl transition-all border ${
                    isActive
                      ? 'bg-indigo-950/40 border-indigo-500/50 text-white'
                      : 'bg-[#0d1117]/60 hover:bg-[#21262d] border-[#30363d]/60 text-gray-300'
                  }`}
                >
                  <div className="flex items-start justify-between gap-1 mb-1">
                    <span className="font-medium text-xs truncate flex-1">
                      {c.title || 'Untitled Session'}
                    </span>
                    <span className="text-[10px] text-gray-400 shrink-0 font-mono">
                      {formatRelativeTime(c.last_modified_time)}
                    </span>
                  </div>

                  {c.preview && (
                    <p className="text-[11px] text-gray-400 line-clamp-2 leading-relaxed mb-1.5">
                      {c.preview}
                    </p>
                  )}

                  <div className="flex items-center justify-between text-[10px] text-gray-500">
                    <span className="flex items-center gap-1 font-mono">
                      <MessageSquare className="w-3 h-3 text-gray-400" />
                      {c.step_count} steps
                    </span>
                    {isActive && (
                      <span className="text-indigo-400 font-semibold flex items-center gap-0.5">
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

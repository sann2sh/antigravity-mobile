import React from 'react';
import { Bot, FolderTree, Terminal } from 'lucide-react';

export type NavTab = 'chat' | 'files' | 'terminal';

interface BottomNavProps {
  activeTab: NavTab;
  onTabChange: (tab: NavTab) => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({ activeTab, onTabChange }) => {
  const tabs = [
    { id: 'files' as NavTab, label: 'Files', icon: FolderTree },
    { id: 'chat' as NavTab, label: 'Agent', icon: Bot },
    { id: 'terminal' as NavTab, label: 'Terminal', icon: Terminal },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-30 bg-surface/95 backdrop-blur border-t border-edge safe-bottom">
      <div className="flex items-center justify-around h-14 max-w-md mx-auto">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`relative flex flex-col items-center justify-center flex-1 h-full py-1 transition-colors motion-reduce:transition-none active:scale-95 ${
                isActive ? 'text-accent font-semibold' : 'text-ink-muted hover:text-ink'
              }`}
            >
              <Icon className={`w-5 h-5 transition-transform motion-reduce:transition-none ${isActive ? 'scale-110' : ''}`} />
              <span className="text-[11px] mt-0.5">{tab.label}</span>
              {isActive && (
                <span className="absolute bottom-0 w-8 h-0.5 bg-accent rounded-full" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
};

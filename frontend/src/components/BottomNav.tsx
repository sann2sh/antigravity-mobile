import React from 'react';
import { Bot, FolderTree, FileText, Terminal } from 'lucide-react';

export type NavTab = 'chat' | 'files' | 'artifacts' | 'terminal';

interface BottomNavProps {
  activeTab: NavTab;
  onTabChange: (tab: NavTab) => void;
  artifactCount: number;
}

export const BottomNav: React.FC<BottomNavProps> = ({ activeTab, onTabChange, artifactCount }) => {
  const tabs = [
    { id: 'chat' as NavTab, label: 'Agent', icon: Bot },
    { id: 'files' as NavTab, label: 'Files', icon: FolderTree },
    {
      id: 'artifacts' as NavTab,
      label: 'Artifacts',
      icon: FileText,
      badge: artifactCount > 0 ? artifactCount : null,
    },
    { id: 'terminal' as NavTab, label: 'Terminal', icon: Terminal },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-30 bg-[#161b22]/95 backdrop-blur border-t border-[#30363d] safe-bottom">
      <div className="flex items-center justify-around h-14 max-w-md mx-auto">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`relative flex flex-col items-center justify-center flex-1 h-full py-1 transition-all active:scale-95 ${
                isActive ? 'text-indigo-400 font-semibold' : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              <div className="relative">
                <Icon className={`w-5 h-5 transition-transform ${isActive ? 'scale-110' : ''}`} />
                {tab.badge && (
                  <span className="absolute -top-1 -right-2 px-1 text-[10px] font-bold bg-purple-600 text-white rounded-full leading-none py-0.5">
                    {tab.badge}
                  </span>
                )}
              </div>
              <span className="text-[11px] mt-0.5">{tab.label}</span>
              {isActive && (
                <span className="absolute bottom-0 w-8 h-0.5 bg-indigo-500 rounded-full" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
};

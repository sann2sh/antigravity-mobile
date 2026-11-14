import React from 'react';
import { Menu, Folder, Wifi } from 'lucide-react';
import type { SystemStatus } from '../types';

interface HeaderProps {
  onOpenDrawer: () => void;
  systemStatus: SystemStatus | null;
  onNavigateFiles: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onOpenDrawer, systemStatus, onNavigateFiles }) => {
  const shortWorkspace = systemStatus?.active_workspace
    ? systemStatus.active_workspace.replace(/^\/home\/[^/]+/, '~')
    : '~/';

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between px-3.5 py-2.5 bg-[#161b22]/90 backdrop-blur border-b border-[#30363d] safe-top">
      <div className="flex items-center gap-2.5 overflow-hidden">
        <button
          onClick={onOpenDrawer}
          className="p-1.5 rounded-lg text-gray-300 hover:text-white hover:bg-[#21262d] active:scale-95 transition-all"
          aria-label="Open Sessions Menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        <button
          onClick={onNavigateFiles}
          className="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-mono bg-[#0d1117] text-gray-300 border border-[#30363d] hover:border-gray-500 active:bg-[#21262d] transition-all truncate max-w-[200px] sm:max-w-xs"
        >
          <Folder className="w-3.5 h-3.5 text-blue-400 shrink-0" />
          <span className="truncate">{shortWorkspace}</span>
        </button>
      </div>

      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5 px-2 py-1 rounded-full text-[11px] font-medium bg-[#1f242c] text-emerald-400 border border-[#238636]/40">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
          <Wifi className="w-3 h-3 text-emerald-400" />
          <span className="hidden xs:inline">
            {systemStatus?.tailscale_ip || systemStatus?.hostname || 'Online'}
          </span>
        </div>
      </div>
    </header>
  );
};

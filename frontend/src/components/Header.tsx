import React from 'react';
import { Menu, Folder } from 'lucide-react';
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
    <header className="sticky top-0 z-30 flex items-center justify-between px-3.5 py-2.5 bg-surface/90 backdrop-blur border-b border-edge safe-top">
      <div className="flex items-center gap-2.5 overflow-hidden">
        <button
          onClick={onOpenDrawer}
          className="p-1.5 rounded-lg text-ink-muted hover:text-ink hover:bg-surface-hover active:scale-95 transition-colors motion-reduce:transition-none"
          aria-label="Open Sessions Menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        <button
          onClick={onNavigateFiles}
          className="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-mono bg-canvas text-ink-muted border border-edge hover:border-ink-subtle active:bg-surface-hover transition-colors motion-reduce:transition-none truncate max-w-[200px] sm:max-w-xs"
        >
          <Folder className="w-3.5 h-3.5 text-accent shrink-0" />
          <span className="flex-1 min-w-0 overflow-hidden flex justify-end">
            <span className="whitespace-nowrap">{shortWorkspace}</span>
          </span>
        </button>
      </div>

      <div className="flex items-center gap-2">
        <div className="flex items-center px-2 py-1 rounded-full text-[11px] font-medium bg-surface-hover text-ok border border-ok/40">
          <span className="hidden xs:inline">
            {systemStatus?.tailscale_ip || systemStatus?.hostname || 'Online'}
          </span>
          <span className="xs:hidden">Online</span>
        </div>
      </div>
    </header>
  );
};

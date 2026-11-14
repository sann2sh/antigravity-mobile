import React, { useState, useEffect } from 'react';
import { Menu, Folder, Bell, BellOff } from 'lucide-react';
import type { SystemStatus } from '../types';
import { getVapidPublicKey, subscribePush, unsubscribePush } from '../api';

interface HeaderProps {
  onOpenDrawer: () => void;
  systemStatus: SystemStatus | null;
  onNavigateFiles: () => void;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const outputArray = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export const Header: React.FC<HeaderProps> = ({ onOpenDrawer, systemStatus, onNavigateFiles }) => {
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushNotice, setPushNotice] = useState<string | null>(null);

  const pushSupported =
    typeof window !== 'undefined' &&
    window.isSecureContext &&
    'Notification' in window &&
    'serviceWorker' in navigator &&
    'PushManager' in window;

  useEffect(() => {
    if (!pushSupported) return;
    let cancelled = false;
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => {
        if (!cancelled) {
          setPushEnabled(Boolean(sub) && Notification.permission === 'granted');
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [pushSupported]);

  useEffect(() => {
    if (!pushNotice) return;
    const timer = window.setTimeout(() => setPushNotice(null), 5000);
    return () => window.clearTimeout(timer);
  }, [pushNotice]);

  const handleTogglePush = async () => {
    if (!pushSupported) {
      setPushNotice('Web Push requires HTTPS (e.g. Tailscale Serve) and a supported browser.');
      return;
    }
    if (pushBusy) return;
    setPushBusy(true);
    setPushNotice(null);

    try {
      const reg = await navigator.serviceWorker.ready;
      if (pushEnabled) {
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          const endpoint = sub.endpoint;
          await sub.unsubscribe();
          await unsubscribePush(endpoint).catch(() => {});
        }
        setPushEnabled(false);
      } else {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
          setPushNotice('Notification permission is blocked in browser settings.');
          return;
        }
        const { public_key } = await getVapidPublicKey();
        let sub = await reg.pushManager.getSubscription();
        if (!sub) {
          sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(public_key),
          });
        }
        await subscribePush(sub.toJSON());
        setPushEnabled(true);
      }
    } catch (err: any) {
      setPushNotice(err?.message || 'Failed to update push notifications.');
    } finally {
      setPushBusy(false);
    }
  };

  const shortWorkspace = systemStatus?.active_workspace
    ? systemStatus.active_workspace.replace(/^\/home\/[^/]+/, '~')
    : '~/';

  const bellTitle = !pushSupported
    ? 'Web Push requires HTTPS (e.g. Tailscale Serve) for mobile push'
    : pushEnabled
      ? 'Disable push notifications'
      : 'Enable push notifications';

  return (
    <header className="sticky top-0 z-30 bg-surface/90 backdrop-blur border-b border-edge safe-top">
      <div className="flex items-center justify-between px-3.5 py-2.5">
        <div className="flex items-center gap-2.5 overflow-hidden">
          <button
            onClick={onOpenDrawer}
            className="flex items-center gap-1.5 p-1 rounded-lg text-ink-muted hover:text-ink hover:bg-surface-hover active:scale-95 transition-colors motion-reduce:transition-none"
            aria-label="Open Sessions Menu"
          >
            <img src="/icon-192.png" alt="Antigravity" className="w-6 h-6 rounded-md object-contain shrink-0" />
            <Menu className="w-4 h-4" />
          </button>

          <button
            onClick={onNavigateFiles}
            className="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-mono bg-canvas text-ink-muted border border-edge hover:border-ink-subtle active:bg-surface-hover transition-colors motion-reduce:transition-none truncate max-w-[180px] sm:max-w-xs"
          >
            <Folder className="w-3.5 h-3.5 text-accent shrink-0" />
            <span className="flex-1 min-w-0 overflow-hidden flex justify-end">
              <span className="whitespace-nowrap">{shortWorkspace}</span>
            </span>
          </button>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={handleTogglePush}
            disabled={pushBusy}
            title={bellTitle}
            aria-label={bellTitle}
            className={`p-1.5 rounded-lg hover:bg-surface-hover active:scale-95 transition-colors motion-reduce:transition-none disabled:opacity-50 ${
              pushEnabled ? 'text-accent' : 'text-ink-muted hover:text-ink'
            }`}
          >
            {pushEnabled ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
          </button>

          <div className="flex items-center px-2 py-1 rounded-full text-[11px] font-medium bg-surface-hover text-ok border border-ok/40">
            <span className="hidden xs:inline">
              {systemStatus?.tailscale_ip || systemStatus?.hostname || 'Online'}
            </span>
            <span className="xs:hidden">Online</span>
          </div>
        </div>
      </div>

      {pushNotice && (
        <div
          role="status"
          className="px-3.5 py-1.5 text-xs text-ink-muted bg-sunk border-t border-edge flex items-center justify-between gap-2"
        >
          <span>{pushNotice}</span>
          <button
            onClick={() => setPushNotice(null)}
            className="text-ink-subtle hover:text-ink shrink-0"
            aria-label="Dismiss notification message"
          >
            Dismiss
          </button>
        </div>
      )}
    </header>
  );
};

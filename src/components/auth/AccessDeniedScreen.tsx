import { ShieldOff } from 'lucide-react';
import { getDeviceId, getStoredDeviceName } from '@/lib/device-auth';

export function AccessDeniedScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background">
      <div className="max-w-sm w-full text-center space-y-4">
        <div className="inline-flex items-center justify-center h-14 w-14 rounded-full bg-destructive/10 text-destructive">
          <ShieldOff className="h-7 w-7" />
        </div>
        <div className="space-y-1">
          <h1 className="text-lg font-bold">Access Denied</h1>
          <p className="text-xs text-muted-foreground">
            This device has been deactivated by a dispatcher.
            Contact your administrator to restore access.
          </p>
        </div>
        <div className="rounded-md bg-card border border-border p-3 text-left text-[11px] space-y-1">
          <div className="flex justify-between gap-3">
            <span className="text-muted-foreground">Device</span>
            <span className="font-medium truncate">{getStoredDeviceName()}</span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-muted-foreground">ID</span>
            <span className="font-mono text-[10px] truncate">{getDeviceId().slice(0, 16)}…</span>
          </div>
        </div>
      </div>
    </div>
  );
}

import { useState } from 'react';
import { Truck, Users, ClipboardList } from 'lucide-react';
import { setStoredDeviceName } from '@/lib/device-auth';
import type { DeviceRole } from '@/lib/device-auth';

interface Props {
  onChoose: (role: DeviceRole) => void;
}

const ROLES: { role: DeviceRole; label: string; desc: string; Icon: typeof Truck }[] = [
  { role: 'dispatcher', label: 'Dispatcher', desc: 'Full access — routes, drivers, devices', Icon: ClipboardList },
  { role: 'salesperson', label: 'Salesperson', desc: 'View Inbox, History, Map (read-only)', Icon: Users },
  { role: 'driver', label: 'Driver', desc: 'View assigned route, location tracked', Icon: Truck },
];

export function RoleSelectScreen({ onChoose }: Props) {
  const [name, setName] = useState('');

  const handle = (role: DeviceRole) => {
    if (name.trim()) setStoredDeviceName(name.trim());
    onChoose(role);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background">
      <div className="w-full max-w-sm space-y-4">
        <div className="text-center space-y-1">
          <h1 className="text-xl font-bold font-mono text-primary tracking-tight">DISPATCHBUDDY</h1>
          <p className="text-xs text-muted-foreground">Set up this device</p>
        </div>

        <div className="space-y-1.5">
          <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
            Device Name (optional)
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. John's iPhone"
            className="w-full px-3 py-2 rounded-md text-sm bg-card border border-border focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        <div className="space-y-2">
          {ROLES.map(({ role, label, desc, Icon }) => (
            <button
              key={role}
              onClick={() => handle(role)}
              className="w-full flex items-start gap-3 p-3 rounded-md bg-card border border-border hover:border-primary hover:bg-primary/5 transition-colors text-left"
            >
              <Icon className="h-5 w-5 text-primary mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-semibold">{label}</p>
                <p className="text-[11px] text-muted-foreground">{desc}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

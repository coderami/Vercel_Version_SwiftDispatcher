import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Smartphone, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';

interface DeviceRow {
  id: string;
  device_id: string;
  name: string;
  role: 'dispatcher' | 'salesperson' | 'driver';
  is_active: boolean;
  driver_id: string | null;
  user_agent: string | null;
  last_seen: string;
  created_at: string;
}

interface DriverOption { id: string; name: string }

export function DeviceManagement() {
  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [drivers, setDrivers] = useState<DriverOption[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const [{ data: d }, { data: dr }] = await Promise.all([
      supabase.from('authorized_devices' as any).select('*').order('created_at', { ascending: false }),
      supabase.from('drivers').select('id, name').eq('is_active', true).order('name'),
    ]);
    setDevices((d as any) || []);
    setDrivers((dr as any) || []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const ch = supabase
      .channel('admin-devices')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'authorized_devices' }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const toggleActive = async (row: DeviceRow) => {
    const { error } = await supabase
      .from('authorized_devices' as any)
      .update({ is_active: !row.is_active } as any)
      .eq('id', row.id);
    if (error) { toast.error('Failed to update'); return; }
    toast.success(`${row.name}: ${!row.is_active ? 'Activated' : 'Deactivated'}`);
  };

  const setRole = async (row: DeviceRow, role: string) => {
    const { error } = await supabase
      .from('authorized_devices' as any)
      .update({ role } as any)
      .eq('id', row.id);
    if (error) toast.error('Failed to set role');
  };

  const setDriver = async (row: DeviceRow, driver_id: string | null) => {
    const { error } = await supabase
      .from('authorized_devices' as any)
      .update({ driver_id } as any)
      .eq('id', row.id);
    if (error) toast.error('Failed to link driver');
    else toast.success('Driver linked');
  };

  const remove = async (row: DeviceRow) => {
    if (!confirm(`Remove ${row.name}? They'll re-register on next visit.`)) return;
    await supabase.from('authorized_devices' as any).delete().eq('id', row.id);
    toast.success('Device removed');
  };

  if (loading) {
    return <div className="flex-1 flex items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>;
  }

  return (
    <div className="flex-1 overflow-y-auto p-3 space-y-2">
      {devices.length === 0 ? (
        <p className="text-center text-xs text-muted-foreground py-12">No devices registered yet.</p>
      ) : devices.map(row => (
        <div key={row.id} className={`p-3 rounded-md border ${row.is_active ? 'bg-card border-border' : 'bg-muted/40 border-border opacity-70'}`}>
          <div className="flex items-start gap-2">
            <Smartphone className="h-4 w-4 text-primary mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold truncate">{row.name}</p>
                {!row.is_active && <span className="text-[10px] font-bold text-destructive">BLOCKED</span>}
              </div>
              <p className="text-[10px] text-muted-foreground font-mono truncate">{row.device_id}</p>
              <p className="text-[10px] text-muted-foreground">
                Last seen {formatDistanceToNow(new Date(row.last_seen), { addSuffix: true })}
              </p>

              <div className="mt-2 grid grid-cols-2 gap-1.5">
                <select
                  value={row.role}
                  onChange={(e) => setRole(row, e.target.value)}
                  className="text-[11px] px-2 py-1 rounded bg-background border border-border"
                >
                  <option value="dispatcher">Dispatcher</option>
                  <option value="salesperson">Salesperson</option>
                  <option value="driver">Driver</option>
                </select>
                <select
                  value={row.driver_id || ''}
                  onChange={(e) => setDriver(row, e.target.value || null)}
                  disabled={row.role !== 'driver'}
                  className="text-[11px] px-2 py-1 rounded bg-background border border-border disabled:opacity-40"
                >
                  <option value="">— No driver —</option>
                  {drivers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>

              <div className="mt-2 flex items-center gap-2">
                <button
                  onClick={() => toggleActive(row)}
                  className={`flex-1 text-[11px] font-semibold px-2 py-1.5 rounded ${
                    row.is_active
                      ? 'bg-destructive/15 text-destructive hover:bg-destructive/25'
                      : 'bg-emerald-500/15 text-emerald-500 hover:bg-emerald-500/25'
                  }`}
                >
                  {row.is_active ? 'Deactivate (Kill)' : 'Activate'}
                </button>
                <button onClick={() => remove(row)} className="p-1.5 rounded hover:bg-muted" aria-label="Remove">
                  <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

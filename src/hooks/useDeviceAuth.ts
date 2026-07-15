import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  getDeviceId,
  getStoredRole,
  setStoredRole,
  registerOrFetchDevice,
  touchLastSeen,
  type DeviceRecord,
  type DeviceRole,
} from '@/lib/device-auth';

export interface DeviceAuthState {
  loading: boolean;
  deviceId: string;
  role: DeviceRole | null;
  device: DeviceRecord | null;
  /** Set the device's role locally + push to DB. */
  chooseRole: (role: DeviceRole) => Promise<void>;
  /** Force re-fetch the device row. */
  refresh: () => Promise<void>;
}

export function useDeviceAuth(): DeviceAuthState {
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<DeviceRole | null>(getStoredRole());
  const [device, setDevice] = useState<DeviceRecord | null>(null);
  const deviceId = getDeviceId();

  const refresh = useCallback(async () => {
    const currentRole = getStoredRole();
    if (!currentRole) {
      setLoading(false);
      return;
    }
    const rec = await registerOrFetchDevice(currentRole);
    setDevice(rec);
    setLoading(false);
  }, []);

  const chooseRole = useCallback(async (r: DeviceRole) => {
    setStoredRole(r);
    setRole(r);
    setLoading(true);
    const rec = await registerOrFetchDevice(r);
    setDevice(rec);
    setLoading(false);
  }, []);

  // initial mount: if a role exists, register
  useEffect(() => {
    refresh();
  }, [refresh]);

  // Realtime: react to kill-switch / role / driver_id changes on this device
  useEffect(() => {
    const channel = supabase
      .channel(`device-${deviceId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'authorized_devices', filter: `device_id=eq.${deviceId}` },
        (payload) => {
          setDevice(payload.new as any);
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [deviceId]);

  // Heartbeat every 60s so dispatcher sees who's alive
  useEffect(() => {
    if (!role) return;
    const t = setInterval(() => { touchLastSeen(); }, 60_000);
    return () => clearInterval(t);
  }, [role]);

  return { loading, deviceId, role, device, chooseRole, refresh };
}

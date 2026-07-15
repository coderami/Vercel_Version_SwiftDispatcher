import { supabase } from '@/integrations/supabase/client';

export type DeviceRole = 'dispatcher' | 'salesperson' | 'driver';

const DEVICE_ID_KEY = 'dispatchbuddy.deviceId';
const DEVICE_ROLE_KEY = 'dispatchbuddy.deviceRole';
const DEVICE_NAME_KEY = 'dispatchbuddy.deviceName';

function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return (crypto as any).randomUUID();
  }
  return 'd-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function getDeviceId(): string {
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = uuid();
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

export function getStoredRole(): DeviceRole | null {
  const r = localStorage.getItem(DEVICE_ROLE_KEY);
  return r === 'dispatcher' || r === 'salesperson' || r === 'driver' ? r : null;
}

export function setStoredRole(role: DeviceRole) {
  localStorage.setItem(DEVICE_ROLE_KEY, role);
}

export function getStoredDeviceName(): string {
  return localStorage.getItem(DEVICE_NAME_KEY) || defaultDeviceName();
}

export function setStoredDeviceName(name: string) {
  localStorage.setItem(DEVICE_NAME_KEY, name);
}

function defaultDeviceName(): string {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua)) return 'iPad';
  if (/Android/.test(ua)) return 'Android Device';
  if (/Mac/.test(ua)) return 'Mac';
  if (/Windows/.test(ua)) return 'Windows PC';
  return 'Device';
}

export interface DeviceRecord {
  id: string;
  device_id: string;
  name: string;
  role: DeviceRole;
  is_active: boolean;
  driver_id: string | null;
  user_agent: string | null;
  last_seen: string;
  created_at: string;
}

/** Upsert this device into authorized_devices on app load. Trust-on-first-use: created active. */
export async function registerOrFetchDevice(role: DeviceRole): Promise<DeviceRecord | null> {
  const device_id = getDeviceId();
  const name = getStoredDeviceName();
  const user_agent = navigator.userAgent.slice(0, 240);

  // Try fetch
  const { data: existing } = await supabase
    .from('authorized_devices' as any)
    .select('*')
    .eq('device_id', device_id)
    .maybeSingle();

  if (existing) {
    // touch last_seen + sync role (device chose role locally → propagate)
    const { data: updated } = await supabase
      .from('authorized_devices' as any)
      .update({ last_seen: new Date().toISOString(), role, user_agent } as any)
      .eq('device_id', device_id)
      .select()
      .single();
    return (updated as any) || (existing as any);
  }

  const { data: inserted, error } = await supabase
    .from('authorized_devices' as any)
    .insert({ device_id, name, role, user_agent, is_active: true } as any)
    .select()
    .single();
  if (error) {
    console.error('Device register error', error);
    return null;
  }
  return inserted as any;
}

export async function touchLastSeen() {
  const device_id = getDeviceId();
  await supabase
    .from('authorized_devices' as any)
    .update({ last_seen: new Date().toISOString() } as any)
    .eq('device_id', device_id);
}

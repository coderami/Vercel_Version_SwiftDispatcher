import { useEffect, useState } from 'react';
import { Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import { supabase } from '@/integrations/supabase/client';

interface DriverPos {
  driver_id: string;
  driver_name: string;
  lat: number;
  lng: number;
  recorded_at: string;
}

const driverIconCache = new Map<string, L.DivIcon>();
function driverIcon(initial: string): L.DivIcon {
  if (driverIconCache.has(initial)) return driverIconCache.get(initial)!;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
    <circle cx="16" cy="16" r="14" fill="hsl(142 76% 36%)" stroke="white" stroke-width="3"/>
    <text x="16" y="20" text-anchor="middle" font-size="13" font-weight="bold" fill="white" font-family="system-ui,sans-serif">${initial}</text>
  </svg>`;
  const icon = L.divIcon({ html: svg, className: '', iconSize: [32, 32], iconAnchor: [16, 16] });
  driverIconCache.set(initial, icon);
  return icon;
}

/** Live markers for any driver who has pinged in the last 5 minutes. */
export function LiveDriverMarkers() {
  const [positions, setPositions] = useState<Record<string, DriverPos>>({});

  // initial load + 60s refresh
  useEffect(() => {
    let alive = true;
    const load = async () => {
      const cutoff = new Date(Date.now() - 5 * 60_000).toISOString();
      const { data: locs } = await supabase
        .from('driver_locations' as any)
        .select('driver_id, lat, lng, recorded_at')
        .gte('recorded_at', cutoff)
        .order('recorded_at', { ascending: false });
      if (!locs || !alive) return;
      const { data: drs } = await supabase.from('drivers').select('id, name');
      const nameMap = new Map((drs || []).map((d: any) => [d.id, d.name]));
      const latest: Record<string, DriverPos> = {};
      for (const l of locs as any[]) {
        if (!latest[l.driver_id]) {
          latest[l.driver_id] = {
            driver_id: l.driver_id,
            driver_name: nameMap.get(l.driver_id) || 'Driver',
            lat: l.lat,
            lng: l.lng,
            recorded_at: l.recorded_at,
          };
        }
      }
      if (alive) setPositions(latest);
    };
    load();
    const t = setInterval(load, 60_000);

    // realtime: new inserts
    const ch = supabase
      .channel('live-drivers')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'driver_locations' }, async (p) => {
        const row = p.new as any;
        const { data: dr } = await supabase.from('drivers').select('name').eq('id', row.driver_id).maybeSingle();
        setPositions(prev => ({
          ...prev,
          [row.driver_id]: {
            driver_id: row.driver_id,
            driver_name: (dr as any)?.name || 'Driver',
            lat: row.lat,
            lng: row.lng,
            recorded_at: row.recorded_at,
          },
        }));
      })
      .subscribe();

    return () => { alive = false; clearInterval(t); supabase.removeChannel(ch); };
  }, []);

  return (
    <>
      {Object.values(positions).map(p => (
        <Marker key={p.driver_id} position={[p.lat, p.lng]} icon={driverIcon(p.driver_name[0]?.toUpperCase() || '?')}>
          <Popup>
            <div className="text-sm">
              <p className="font-semibold">{p.driver_name}</p>
              <p className="text-xs text-muted-foreground">
                {new Date(p.recorded_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          </Popup>
        </Marker>
      ))}
    </>
  );
}

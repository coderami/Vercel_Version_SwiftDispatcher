import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { CheckCircle2, MapPin, Loader2, LogOut } from 'lucide-react';
import { distanceMeters, GEOFENCE_RADIUS_M, GEOFENCE_DWELL_MS } from '@/lib/geofence';
import { toast } from 'sonner';
import { getDeviceId, getStoredDeviceName, setStoredRole } from '@/lib/device-auth';

interface Props {
  driverId: string;
  driverName: string;
  onRoleReset: () => void;
}

interface AssignedCard {
  id: string;
  client_name: string;
  address: string;
  invoice_number: string | null;
  type: 'invoice' | 'pickup';
  lat: number | null;
  lng: number | null;
  delivered_at: string | null;
  sort_order: number;
}

export function DriverApp({ driverId, driverName, onRoleReset }: Props) {
  const [cards, setCards] = useState<AssignedCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [position, setPosition] = useState<{ lat: number; lng: number; accuracy?: number } | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [routeActive, setRouteActive] = useState(false);

  // dwell timers: cardId -> { sinceMs, fired }
  const dwellRef = useRef<Record<string, { since: number }>>({});
  const lastPingRef = useRef<number>(0);

  // Load assigned cards + driver state
  const load = async () => {
    const [{ data: cardData }, { data: driverData }] = await Promise.all([
      supabase
        .from('invoice_cards')
        .select('id, client_name, address, invoice_number, type, lat, lng, delivered_at, sort_order')
        .eq('driver_id', driverId)
        .eq('location', 'active')
        .order('sort_order'),
      supabase.from('drivers').select('route_start_time').eq('id', driverId).maybeSingle(),
    ]);
    setCards((cardData as any) || []);
    setRouteActive(!!(driverData as any)?.route_start_time);
    setLoading(false);
  };

  useEffect(() => { load(); }, [driverId]);

  // Realtime subscription for the driver's cards
  useEffect(() => {
    const ch = supabase
      .channel(`driver-app-${driverId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'invoice_cards', filter: `driver_id=eq.${driverId}` },
        () => { load(); })
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'drivers', filter: `id=eq.${driverId}` },
        (p) => { setRouteActive(!!(p.new as any).route_start_time); })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [driverId]);

  // Geolocation watcher
  useEffect(() => {
    if (!('geolocation' in navigator)) {
      setGeoError('Geolocation not supported');
      return;
    }
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setGeoError(null);
        setPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy });
      },
      (err) => {
        setGeoError(err.message || 'Location unavailable');
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  // Geofence + ping to driver_locations
  useEffect(() => {
    if (!position) return;
    const now = Date.now();

    // 1) ping every 60s when route is active
    if (routeActive && now - lastPingRef.current > 60_000) {
      lastPingRef.current = now;
      supabase.from('driver_locations' as any).insert({
        driver_id: driverId,
        lat: position.lat,
        lng: position.lng,
        accuracy: position.accuracy ?? null,
      } as any);
    }

    // 2) geofence each undelivered card
    cards.forEach((c) => {
      if (c.delivered_at || c.lat == null || c.lng == null) {
        delete dwellRef.current[c.id];
        return;
      }
      const d = distanceMeters(position, { lat: c.lat, lng: c.lng });
      if (d <= GEOFENCE_RADIUS_M) {
        const entry = dwellRef.current[c.id];
        if (!entry) {
          dwellRef.current[c.id] = { since: now };
        } else if (now - entry.since >= GEOFENCE_DWELL_MS) {
          // FIRE: mark delivered
          delete dwellRef.current[c.id];
          (async () => {
            const { error } = await supabase
              .from('invoice_cards')
              .update({
                delivered_at: new Date().toISOString(),
                delivered_lat: position.lat,
                delivered_lng: position.lng,
              } as any)
              .eq('id', c.id)
              .is('delivered_at', null);
            if (!error) {
              toast.success(`Delivered: ${c.invoice_number ? `#${c.invoice_number}` : c.client_name}`);
              if ('vibrate' in navigator) navigator.vibrate?.(120);
            }
          })();
        }
      } else {
        delete dwellRef.current[c.id];
      }
    });
  }, [position, cards, routeActive, driverId]);

  const remaining = useMemo(() => cards.filter(c => !c.delivered_at).length, [cards]);

  const handleLogout = () => {
    setStoredRole('dispatcher'); // reset
    localStorage.removeItem('dispatchbuddy.deviceRole');
    onRoleReset();
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-background"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  return (
    <div className="min-h-screen flex flex-col bg-background select-none">
      <header className="flex items-center justify-between px-4 py-3 border-b border-border bg-card/50">
        <div>
          <h1 className="text-sm font-bold tracking-tight">{driverName}</h1>
          <p className="text-[10px] text-muted-foreground">{getStoredDeviceName()}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className={`px-2 py-1 rounded-full text-[10px] font-semibold ${routeActive ? 'bg-emerald-500/15 text-emerald-500' : 'bg-muted text-muted-foreground'}`}>
            {routeActive ? 'ON ROUTE' : 'IDLE'}
          </div>
          <button onClick={handleLogout} className="p-1.5 rounded-md hover:bg-muted" aria-label="Switch role">
            <LogOut className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
      </header>

      <div className="px-4 py-2 border-b border-border bg-card/30 flex items-center gap-2 text-[11px]">
        <MapPin className="h-3.5 w-3.5 text-primary" />
        {geoError ? (
          <span className="text-destructive">{geoError}</span>
        ) : position ? (
          <span className="text-muted-foreground">
            {position.lat.toFixed(5)}, {position.lng.toFixed(5)} · ±{Math.round(position.accuracy || 0)}m
          </span>
        ) : (
          <span className="text-muted-foreground">Acquiring GPS…</span>
        )}
        <span className="ml-auto font-semibold">{remaining} left</span>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {cards.length === 0 ? (
          <div className="text-center text-xs text-muted-foreground py-12">
            No stops assigned. Wait for dispatcher.
          </div>
        ) : cards.map((c, idx) => {
          const delivered = !!c.delivered_at;
          const dist = position && c.lat != null && c.lng != null
            ? distanceMeters(position, { lat: c.lat, lng: c.lng })
            : null;
          return (
            <div
              key={c.id}
              className={`p-3 rounded-md border transition-all ${
                delivered
                  ? 'bg-zinc-300/40 dark:bg-zinc-700/40 border-zinc-400/40 opacity-60 line-through'
                  : c.type === 'pickup'
                    ? 'bg-yellow-50 dark:bg-yellow-950/30 border-yellow-300/50'
                    : 'bg-card border-border'
              }`}
            >
              <div className="flex items-start gap-2">
                <div className={`h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                  delivered ? 'bg-zinc-500 text-white' : 'bg-primary text-primary-foreground'
                }`}>
                  {delivered ? <CheckCircle2 className="h-3.5 w-3.5" /> : idx + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{c.client_name}</p>
                  <p className="text-[11px] text-muted-foreground truncate">{c.address}</p>
                  <div className="flex items-center gap-2 mt-1 text-[10px]">
                    {c.invoice_number && (
                      <span className="text-muted-foreground">#{c.invoice_number}</span>
                    )}
                    {dist != null && !delivered && (
                      <span className={dist <= GEOFENCE_RADIUS_M ? 'text-emerald-500 font-semibold' : 'text-muted-foreground'}>
                        {dist < 1000 ? `${Math.round(dist)}m` : `${(dist / 1000).toFixed(1)}km`}
                      </span>
                    )}
                    {delivered && (
                      <span className="text-emerald-500 font-semibold">
                        ✓ {new Date(c.delivered_at!).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { Activity, Map as MapIcon, LogOut, Truck, CheckCircle2, Clock, MapPin, Package, FileText } from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { supabase } from '@/integrations/supabase/client';
import { useInvoices, type InvoiceRow } from '@/hooks/useInvoices';
import { LiveDriverMarkers } from '@/components/dispatcher/LiveDriverMarkers';
import { getStoredDeviceName } from '@/lib/device-auth';

interface Props {
  onRoleReset: () => void;
}

type Tab = 'runs' | 'map';

interface DriverRow {
  id: string;
  name: string;
  avatar: string;
  is_on_duty: boolean;
  is_active: boolean;
  route_start_time: string | null;
}

const TORONTO: [number, number] = [43.6532, -79.3832];

const stopIcon = (n: number, delivered: boolean) =>
  L.divIcon({
    html: `<div style="width:28px;height:38px;position:relative;">
      <svg xmlns="http://www.w3.org/2000/svg" width="28" height="38" viewBox="0 0 32 44">
        <path d="M16 0C7.2 0 0 7.2 0 16c0 12 16 28 16 28s16-16 16-28C32 7.2 24.8 0 16 0z" fill="${delivered ? 'hsl(142 71% 36%)' : 'hsl(217 91% 55%)'}"/>
        <circle cx="16" cy="16" r="10" fill="white"/>
      </svg>
      <span style="position:absolute;top:4px;left:0;right:0;text-align:center;font:700 11px system-ui;color:${delivered ? 'hsl(142 71% 30%)' : 'hsl(217 91% 40%)'};">${n}</span>
    </div>`,
    className: '',
    iconSize: [28, 38],
    iconAnchor: [14, 38],
  });

export function SalespersonApp({ onRoleReset }: Props) {
  const [tab, setTab] = useState<Tab>('runs');
  const [drivers, setDrivers] = useState<DriverRow[]>([]);
  const { invoices } = useInvoices(); // live via realtime

  // Load drivers + subscribe to changes (driver on/off duty, route start/end)
  useEffect(() => {
    let alive = true;
    const load = async () => {
      const { data } = await supabase
        .from('drivers')
        .select('id,name,avatar,is_on_duty,is_active,route_start_time')
        .eq('is_active', true)
        .order('created_at');
      if (alive && data) setDrivers(data as any);
    };
    load();
    const ch = supabase
      .channel('sales-drivers')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'drivers' }, () => load())
      .subscribe();
    return () => { alive = false; supabase.removeChannel(ch); };
  }, []);

  // Group active invoices by driver
  const byDriver = useMemo(() => {
    const map = new Map<string, InvoiceRow[]>();
    for (const c of invoices) {
      if (c.location !== 'active' || !c.driver_id) continue;
      if (!map.has(c.driver_id)) map.set(c.driver_id, []);
      map.get(c.driver_id)!.push(c);
    }
    for (const arr of map.values()) arr.sort((a, b) => a.sort_order - b.sort_order);
    return map;
  }, [invoices]);

  const activeDrivers = drivers.filter(d => d.is_on_duty && d.route_start_time);

  const handleLogout = () => {
    localStorage.removeItem('dispatchbuddy.deviceRole');
    onRoleReset();
  };

  return (
    <div className="flex flex-col h-screen bg-background select-none">
      <header className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-card/50">
        <div>
          <h1 className="text-sm font-bold font-mono text-primary tracking-tight">SALES VIEW</h1>
          <p className="text-[10px] text-muted-foreground">{getStoredDeviceName()} · read-only</p>
        </div>
        <button onClick={handleLogout} className="p-1.5 rounded-md hover:bg-muted" aria-label="Switch role">
          <LogOut className="h-4 w-4 text-muted-foreground" />
        </button>
      </header>

      <div className="flex border-b border-border">
        {([
          ['runs', Activity, 'Active Runs'],
          ['map', MapIcon, 'Live Map'],
        ] as const).map(([id, Icon, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-semibold transition-colors ${
              tab === id ? 'text-primary border-b-2 border-primary' : 'text-muted-foreground'
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      {tab === 'runs' ? (
        <ActiveRunsList drivers={activeDrivers} byDriver={byDriver} />
      ) : (
        <ReadOnlyLiveMap invoices={invoices} />
      )}
    </div>
  );
}

function ActiveRunsList({
  drivers,
  byDriver,
}: {
  drivers: DriverRow[];
  byDriver: Map<string, InvoiceRow[]>;
}) {
  if (drivers.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground p-8 text-center">
        <Truck className="h-8 w-8 mb-2 opacity-50" />
        <p className="text-xs">No active runs right now.</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-3 space-y-3">
      {drivers.map(d => {
        const cards = byDriver.get(d.id) || [];
        const delivered = cards.filter(c => !!(c as any).delivered_at).length;
        const start = d.route_start_time ? new Date(d.route_start_time) : null;
        return (
          <div key={d.id} className="rounded-lg border border-border bg-card overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2 bg-secondary/40 border-b border-border">
              <div className="h-8 w-8 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center">
                {(d.avatar || d.name[0] || '?').toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold truncate">{d.name}</p>
                <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {start ? `Started ${start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'On duty'}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[10px] text-muted-foreground">Stops</p>
                <p className="text-xs font-bold">
                  {delivered}<span className="text-muted-foreground">/{cards.length}</span>
                </p>
              </div>
            </div>
            <div className="p-2 space-y-1.5">
              {cards.length === 0 ? (
                <p className="text-[11px] text-muted-foreground italic px-1 py-2">No stops in this run.</p>
              ) : cards.map((c, idx) => {
                const isDelivered = !!(c as any).delivered_at;
                const isPickup = c.type === 'pickup';
                return (
                  <div
                    key={c.id}
                    className={`flex items-start gap-2 rounded-md border px-2 py-1.5 cursor-default ${
                      isDelivered
                        ? 'bg-muted/40 border-border opacity-70'
                        : isPickup
                          ? 'bg-yellow-50 dark:bg-yellow-950/30 border-yellow-300/50'
                          : 'bg-background border-border'
                    }`}
                  >
                    <div className={`h-5 w-5 shrink-0 rounded-full text-[10px] font-bold flex items-center justify-center ${
                      isDelivered ? 'bg-emerald-600 text-white' : 'bg-primary text-primary-foreground'
                    }`}>
                      {isDelivered ? <CheckCircle2 className="h-3 w-3" /> : idx + 1}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1">
                        {isPickup
                          ? <Package className="h-3 w-3 text-pickup shrink-0" />
                          : <FileText className="h-3 w-3 text-primary shrink-0" />}
                        <p className={`text-[11px] font-semibold truncate ${isDelivered ? 'line-through text-muted-foreground' : ''}`}>
                          {c.client_name}
                        </p>
                      </div>
                      <p className="text-[10px] text-muted-foreground truncate">{c.address}</p>
                      {c.invoice_number && (
                        <p className="text-[9px] font-mono text-muted-foreground">#{c.invoice_number}</p>
                      )}
                    </div>
                    {isDelivered && (
                      <span className="text-[9px] uppercase tracking-wide font-bold text-emerald-600 dark:text-emerald-400 shrink-0">
                        Delivered
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ReadOnlyLiveMap({ invoices }: { invoices: InvoiceRow[] }) {
  const activeWithCoords = invoices.filter(
    c => c.location === 'active' && c.lat != null && c.lng != null,
  );

  return (
    <div className="flex-1 relative">
      <MapContainer
        center={TORONTO}
        zoom={11}
        style={{ height: '100%', width: '100%' }}
        zoomControl={false}
        attributionControl={false}
      >
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <LiveDriverMarkers />
        {activeWithCoords.map((c, i) => {
          const delivered = !!(c as any).delivered_at;
          return (
            <Marker
              key={c.id}
              position={[c.lat as number, c.lng as number]}
              icon={stopIcon(i + 1, delivered)}
            >
              <Popup>
                <div className="text-xs">
                  <p className="font-semibold">{c.client_name}</p>
                  <p className="text-muted-foreground">{c.address}</p>
                  {c.invoice_number && <p className="font-mono">#{c.invoice_number}</p>}
                  <p className={`mt-1 font-bold ${delivered ? 'text-emerald-600' : 'text-primary'}`}>
                    {delivered ? 'Delivered' : 'En route'}
                  </p>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>
      <div className="absolute top-2 left-2 z-[400] bg-card/90 backdrop-blur rounded-md px-2 py-1 border border-border flex items-center gap-1.5 shadow">
        <MapPin className="h-3 w-3 text-primary" />
        <span className="text-[10px] font-semibold">Live · read-only</span>
      </div>
    </div>
  );
}

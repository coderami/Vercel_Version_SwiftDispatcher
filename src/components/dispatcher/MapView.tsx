import { useState, useEffect, useMemo, Component, type ReactNode } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Driver } from '@/types/dispatcher';

/* ── Error Boundary ─────────────────────────────────────── */

interface EBProps { children: ReactNode }
interface EBState { hasError: boolean }

class MapErrorBoundary extends Component<EBProps, EBState> {
  state: EBState = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex-1 flex items-center justify-center p-10 text-sm text-muted-foreground">
          Map view currently unavailable – Please check your internet or address data.
        </div>
      );
    }
    return this.props.children;
  }
}

/* ── Geocoding with cache ───────────────────────────────── */

const geoCache = new Map<string, [number, number] | null>();

async function geocode(address: string): Promise<[number, number] | null> {
  if (geoCache.has(address)) return geoCache.get(address)!;
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(address)}`,
    );
    const json = await res.json();
    if (json.length > 0) {
      const coord: [number, number] = [parseFloat(json[0].lat), parseFloat(json[0].lon)];
      geoCache.set(address, coord);
      return coord;
    }
  } catch { /* swallow */ }
  geoCache.set(address, null);
  return null;
}

/* ── Numbered SVG icon factory ──────────────────────────── */

const iconCache = new Map<string, L.DivIcon>();

function numberedIcon(seq: number): L.DivIcon {
  const key = `numbered-${seq}`;
  if (iconCache.has(key)) return iconCache.get(key)!;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="44" viewBox="0 0 32 44">
    <path d="M16 0C7.2 0 0 7.2 0 16c0 12 16 28 16 28s16-16 16-28C32 7.2 24.8 0 16 0z" fill="hsl(221,83%,53%)" />
    <circle cx="16" cy="16" r="10" fill="white"/>
    <text x="16" y="20" text-anchor="middle" font-size="12" font-weight="bold" fill="hsl(221,83%,53%)" font-family="system-ui,sans-serif">${seq}</text>
  </svg>`;
  const icon = L.divIcon({
    html: svg,
    className: '',
    iconSize: [32, 44],
    iconAnchor: [16, 44],
    popupAnchor: [0, -40],
  });
  iconCache.set(key, icon);
  return icon;
}

/* ── FitBounds helper ───────────────────────────────────── */

function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) {
      map.setView(points[0], 14);
    } else {
      map.fitBounds(L.latLngBounds(points.map(p => L.latLng(p[0], p[1]))), { padding: [40, 40] });
    }
  }, [points, map]);
  return null;
}

/* ── Marker type ────────────────────────────────────────── */

interface MarkerData {
  key: string;
  coord: [number, number];
  seq: number;
  clientName: string;
  invoiceNumber?: string;
}

/* ── Main Map component ─────────────────────────────────── */

interface MapTabProps {
  drivers?: Driver[];
}

export function MapTab({ drivers = [] }: MapTabProps) {
  const onDutyDrivers = useMemo(() => drivers.filter(d => d.isOnDuty), [drivers]);

  const [selected, setSelected] = useState<string>(() => {
    const first = drivers.filter(d => d.isOnDuty)[0];
    return first ? first.id : '';
  });
  const [markers, setMarkers] = useState<MarkerData[]>([]);

  // Auto-select first on-duty driver whenever drivers change
  useEffect(() => {
    if (onDutyDrivers.length > 0 && !onDutyDrivers.find(d => d.id === selected)) {
      setSelected(onDutyDrivers[0].id);
    }
    if (onDutyDrivers.length === 0) {
      setSelected('');
    }
  }, [onDutyDrivers, selected]);

  const activeDriver = useMemo(() => onDutyDrivers.find(d => d.id === selected), [onDutyDrivers, selected]);

  // Geocode active cards for the selected driver
  useEffect(() => {
    let cancelled = false;
    if (!activeDriver) { setMarkers([]); return; }

    (async () => {
      const results: MarkerData[] = [];
      for (let i = 0; i < activeDriver.activePath.length; i++) {
        if (cancelled) return;
        const c = activeDriver.activePath[i];
        const coord = await geocode(c.address);
        if (coord) {
          results.push({
            key: `${activeDriver.id}-${c.id}`,
            coord,
            seq: i + 1,
            clientName: c.clientName,
            invoiceNumber: c.invoiceNumber,
          });
        }
      }
      if (!cancelled) setMarkers(results);
    })();
    return () => { cancelled = true; };
  }, [activeDriver]);

  const points = markers.map(m => m.coord);

  if (onDutyDrivers.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-10 text-sm text-muted-foreground">
        Please toggle drivers 'On Duty' in the Drivers tab to view map data.
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Driver chips */}
      <div className="flex gap-2 px-3 py-2 overflow-x-auto border-b border-border bg-background shrink-0">
        {onDutyDrivers.map(d => (
          <button
            key={d.id}
            onClick={() => setSelected(d.id)}
            className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
              selected === d.id
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground'
            }`}
          >
            {d.name}
          </button>
        ))}
      </div>

      {/* Map */}
      <MapErrorBoundary>
        <MapContainer
          center={[40.7128, -74.006]}
          zoom={12}
          className="flex-1 z-0"
          style={{ minHeight: 300 }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <FitBounds points={points} />
          {markers.map(m => (
            <Marker key={m.key} position={m.coord} icon={numberedIcon(m.seq)}>
              <Popup>
                <div className="text-sm">
                  <p className="font-semibold">{m.clientName}</p>
                  {m.invoiceNumber && <p className="text-xs text-muted-foreground">#{m.invoiceNumber}</p>}
                  <p className="text-xs text-muted-foreground">Stop #{m.seq}</p>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </MapErrorBoundary>
    </div>
  );
}

export const MapView = MapTab;

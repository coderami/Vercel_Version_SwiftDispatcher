import { useState, useRef, Component, type ReactNode, useEffect, useMemo, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Camera, Search, MapPin, Loader2, Trash2, GripVertical, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useInvoices } from '@/hooks/useInvoices';
import {
  findInvoiceByNumber,
  fetchActiveForDriver,
  createMapPin,
} from '@/lib/dispatcher-api';
import { supabase } from '@/integrations/supabase/client';
import { BatchScanModal } from './BatchScanModal';
import { LiveDriverMarkers } from './LiveDriverMarkers';
import { sanitizeAddress, type RawScanResult } from '@/lib/address-utils';
export { sanitizeAddress };

const TORONTO: [number, number] = [43.6532, -79.3832];
const NOMINATIM_DELAY_MS = 1500;

const delay = (ms: number) => new Promise(resolve => window.setTimeout(resolve, ms));
let nextNominatimRequestAt = 0;

async function waitForNominatimSlot() {
  const now = Date.now();
  const waitMs = Math.max(0, nextNominatimRequestAt - now);
  nextNominatimRequestAt = Math.max(now, nextNominatimRequestAt) + NOMINATIM_DELAY_MS;
  if (waitMs > 0) await delay(waitMs);
}

/**
 * A pin lives ONLY in local React state until the user clicks Assign & Update.
 *  - cardId = null  → scanned/searched/clicked locally; no DB record yet
 *  - cardId set     → already exists in DB (e.g. via Retrieve)
 *  - pos    = null  → geocoder failed; user must tap the map to place it
 */
interface BatchPin {
  id: string;
  cardId: string | null;
  label: string;
  pos: [number, number] | null;
  invoiceNumber: string | null;
  isExisting: boolean; // belonged to this driver's active route when retrieved
}

/* ── Error Boundary ─── */
class MapErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(err: unknown) { console.error('[MapWorkspace]', err); }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex-1 flex items-center justify-center p-8 text-sm text-muted-foreground text-center">
          Map view is currently unavailable. Please check your connection.
        </div>
      );
    }
    return this.props.children;
  }
}

const numberedIcon = (n: number) =>
  L.divIcon({
    html: `<div style="position:relative;width:32px;height:44px;">
      <svg xmlns="http://www.w3.org/2000/svg" width="32" height="44" viewBox="0 0 32 44">
        <path d="M16 0C7.2 0 0 7.2 0 16c0 12 16 28 16 28s16-16 16-28C32 7.2 24.8 0 16 0z" fill="hsl(0,84%,55%)" />
        <circle cx="16" cy="16" r="10" fill="white"/>
      </svg>
      <span style="position:absolute;top:6px;left:0;right:0;text-align:center;font:700 12px system-ui;color:hsl(0,84%,40%);">${n}</span>
    </div>`,
    className: '',
    iconSize: [32, 44],
    iconAnchor: [16, 44],
  });

// Canadian postal code: A1A 1A1 (space optional)
const POSTAL_RE = /[A-Z][0-9][A-Z]\s?[0-9][A-Z][0-9]/i;
// GTA cities Nominatim disambiguates well enough on their own
const GTA_CITY_RE = /\b(toronto|mississauga|brampton|vaughan|markham|richmond hill|scarborough|etobicoke|north york|oakville|burlington|pickering|ajax|whitby|oshawa)\b/i;
const GTA_CITY_NAMES = 'toronto|mississauga|brampton|vaughan|markham|richmond hill|scarborough|etobicoke|north york|oakville|burlington|pickering|ajax|whitby|oshawa';
// Street suffixes / directionals stripped on the second-pass fallback
const STREET_SUFFIX_RE = /\b(AVE|AVENUE|ST|STREET|RD|ROAD|BLVD|BOULEVARD|DR|DRIVE|CRES|CRESCENT|CT|COURT|PL|PLACE|TER|TERRACE|WAY|LN|LANE|HWY|HIGHWAY|PKWY|PARKWAY|TRL|TRAIL|CIR|CIRCLE)\b/gi;
const DIRECTION_RE = /\b(NORTH|SOUTH|EAST|WEST|N|S|E|W|NE|NW|SE|SW)\b/gi;

/** Strip unit/suite noise from a query so Nominatim doesn't choke. */
function stripUnitNoise(s: string): string {
  return s
    .replace(/\b(UNIT|BAY|DOOR|RM|ROOM)\s*#?\s*[-]?\s*[A-Z]?\d+[A-Z]?\b/gi, ' ')
    .replace(/\b(SUITE|STE|APT|APARTMENT)\s*#?\s*[-]?\s*\d+[A-Z]?\b/gi, ' ')
    .replace(/#\s*\d+[A-Z]?\s*-\s*(?=\d)/g, '')
    .replace(/#\s*[A-Z]?\d+[A-Z]?\s*/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeNominatimQuery(query: string): string {
  let q = query
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s*,\s*/g, ', ')
    .replace(/\s+/g, ' ')
    .replace(/(?:,\s*){2,}/g, ', ')
    .replace(/^[,\s]+|[,\s]+$/g, '')
    .trim();

  const duplicateCityProvince = new RegExp(
    `\\b(${GTA_CITY_NAMES})\\b\\s*,\\s*(ON|Ontario)\\s*,\\s*\\1\\s*,\\s*\\2\\b`,
    'gi',
  );
  let previous = '';
  while (previous !== q) {
    previous = q;
    q = q.replace(duplicateCityProvince, '$1, $2');
  }
  return q;
}

/** Detect a two-word cross-street intersection like "Keele Wilson" (no digits). */
function asIntersectionQuery(clean: string): string | null {
  if (/\d/.test(clean)) return null;
  const tokens = clean.split(/\s+/).filter(Boolean);
  if (tokens.length !== 2) return null;
  const isWord = (w: string) => /^[A-Za-z][A-Za-z'.\-]{1,}$/.test(w);
  if (!tokens.every(isWord)) return null;
  return `${tokens[0]} St & ${tokens[1]} Ave, Toronto, ON`;
}

/** "Smart-Anchor": build the best Nominatim query for a GTA address. */
export function buildSmartQuery(raw: string): string {
  const cleaned = sanitizeAddress(raw);
  // Intersection shortcut (no numbers, two words)
  const intersection = asIntersectionQuery(cleaned);
  if (intersection) return intersection;
  // Strip unit noise for the query (we keep the original label for display)
  const clean = stripUnitNoise(cleaned);
  if (POSTAL_RE.test(clean)) {
    // Postal code present → trust it, don't force Toronto
    return normalizeNominatimQuery(/\bON\b|ontario/i.test(clean) ? clean : `${clean}, ON`);
  }
  if (GTA_CITY_RE.test(clean)) {
    return normalizeNominatimQuery(/\bON\b|ontario/i.test(clean) ? clean : `${clean}, ON`);
  }
  return normalizeNominatimQuery(`${clean}, Toronto, ON`);
}

/** Build the second-pass query: drop street suffix + directionals, keep number + name + postal. */
function buildSuffixStrippedQuery(raw: string): string | null {
  const cleaned = sanitizeAddress(raw);
  const postal = cleaned.match(POSTAL_RE)?.[0];
  if (!postal) return null;
  let q = stripUnitNoise(cleaned)
    .replace(POSTAL_RE, ' ')
    .replace(STREET_SUFFIX_RE, ' ')
    .replace(DIRECTION_RE, ' ')
    .replace(/\bON\b|ontario/gi, ' ')
    .replace(/[,\s]+/g, ' ')
    .trim();
  if (!q) return null;
  return `${q}, ${postal}, ON`;
}

/** Single Nominatim call. */
async function nominatim(query: string): Promise<[number, number] | null> {
  const finalQuery = normalizeNominatimQuery(query);
  const url = `https://nominatim.openstreetmap.org/search?${new URLSearchParams({
    format: 'json',
    limit: '1',
    countrycodes: 'ca',
    q: finalQuery,
  }).toString()}`;
  try {
    await waitForNominatimSlot();
    const r = await fetch(url);
    if (!r.ok) {
      console.warn(`[Geocode Debug] HTTP ${r.status} ${r.statusText} for query: ${finalQuery}`, { url });
      return null;
    }
    const j = await r.json();
    if (j.length > 0) return [parseFloat(j[0].lat), parseFloat(j[0].lon)];
    console.warn(`[Geocode Debug] No results (HTTP ${r.status}) for query: ${finalQuery}`, { url });
  } catch (e) { console.error('[Geocode Debug] Request failed for query:', finalQuery, { url }, e); }
  return null;
}

async function geocode(q: string): Promise<[number, number] | null> {
  const cleaned = sanitizeAddress(q);
  // Pass 1 — smart query
  const smart = buildSmartQuery(q);
  let hit = await nominatim(smart);
  if (hit) return hit;
  // Pass 1b — plain cleaned text
  if (cleaned !== smart) {
    hit = await nominatim(cleaned);
    if (hit) return hit;
  }
  // Pass 2 — strip street suffix + directionals (only if postal present)
  const suffixStripped = buildSuffixStrippedQuery(q);
  if (suffixStripped) {
    hit = await nominatim(suffixStripped);
    if (hit) return hit;
  }
  // Pass 3 — postal-code only last resort
  const postal = cleaned.match(POSTAL_RE)?.[0];
  if (postal) {
    hit = await nominatim(`${postal}, ON, Canada`);
    if (hit) return hit;
  }
  return null;
}

function FlyTo({ pos }: { pos: [number, number] | null }) {
  const map = useMap();
  useEffect(() => { if (pos) map.flyTo(pos, 16, { duration: 0.8 }); }, [pos, map]);
  return null;
}

function FitAll({ pins, trigger }: { pins: BatchPin[]; trigger: number }) {
  const map = useMap();
  useEffect(() => {
    const placed = pins.filter(p => p.pos) as (BatchPin & { pos: [number, number] })[];
    if (placed.length === 0) return;
    if (placed.length === 1) { map.flyTo(placed[0].pos, 15, { duration: 0.8 }); return; }
    const bounds = L.latLngBounds(placed.map(p => p.pos));
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trigger]);
  return null;
}

function ClickHandler({ onPick }: { onPick: (p: [number, number]) => void }) {
  useMapEvents({ click(e) { onPick([e.latlng.lat, e.latlng.lng]); } });
  return null;
}

const STREET_RE = /\b\d{1,6}\s+[A-Za-z0-9'.\-]+(?:\s+[A-Za-z0-9'.\-]+){0,5}\s+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Court|Ct|Crescent|Cres|Way|Place|Pl|Trail|Trl|Highway|Hwy|Parkway|Pkwy|Terrace|Ter)\b\.?/i;

const INVOICE_RE = /\b(?:INV|INVOICE|#)[\s:#-]*([A-Z0-9-]{3,})\b/i;


function extractInvoiceNumber(raw: string): string | null {
  const m = raw.match(INVOICE_RE);
  return m ? m[1].trim() : null;
}

// NOTE: The Map Tab's old Tesseract.js scanner (preprocessImage + CameraScanner
// + handleScan) has been removed. The Map Tab now uses the SAME BatchScanModal
// component as the Dispatch Tab — see <BatchScanModal mode="raw" /> below.

function BatchCard({
  pin, index, isExisting, onClick, onDelete, onEditSave,
}: {
  pin: BatchPin;
  index: number;
  isExisting: boolean;
  onClick: () => void;
  onDelete: () => void;
  onEditSave: (newLabel: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: pin.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(pin.label);
  const [holdProgress, setHoldProgress] = useState(0);
  const holdTimer = useRef<number | null>(null);
  const progressTimer = useRef<number | null>(null);

  const clearHold = () => {
    if (holdTimer.current) { window.clearTimeout(holdTimer.current); holdTimer.current = null; }
    if (progressTimer.current) { window.clearInterval(progressTimer.current); progressTimer.current = null; }
    setHoldProgress(0);
  };
  const startHold = () => {
    if (editing) return;
    clearHold();
    const start = Date.now();
    progressTimer.current = window.setInterval(() => {
      setHoldProgress(Math.min(100, ((Date.now() - start) / 3000) * 100));
    }, 50);
    holdTimer.current = window.setTimeout(() => {
      clearHold();
      setDraft(pin.label);
      setEditing(true);
      if (navigator.vibrate) navigator.vibrate(40);
    }, 3000);
  };

  const commit = () => {
    const v = draft.trim();
    setEditing(false);
    if (v && v !== pin.label) onEditSave(v);
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="relative flex items-center gap-2 p-2 rounded-md bg-background border border-border hover:border-primary/50 transition-colors overflow-hidden"
    >
      {holdProgress > 0 && !editing && (
        <div
          className="absolute left-0 top-0 bottom-0 bg-primary/15 pointer-events-none transition-[width] duration-75"
          style={{ width: `${holdProgress}%` }}
        />
      )}
      <button
        {...attributes}
        {...listeners}
        className="touch-none cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground"
        aria-label="Drag to reorder"
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <div className="flex items-center justify-center h-6 w-6 rounded-full bg-primary text-primary-foreground text-[11px] font-bold shrink-0">
        {index + 1}
      </div>
      <div className="flex-1 min-w-0">
        {editing ? (
          <input
            autoFocus
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); commit(); }
              if (e.key === 'Escape') { setEditing(false); setDraft(pin.label); }
            }}
            className="block w-full text-xs px-1.5 py-1 rounded bg-background border border-primary focus:outline-none"
          />
        ) : (
          <button
            onClick={onClick}
            onPointerDown={startHold}
            onPointerUp={clearHold}
            onPointerLeave={clearHold}
            onPointerCancel={clearHold}
            className="block w-full text-left text-xs truncate"
            title="Hold 3s to edit"
          >
            {pin.label}
          </button>
        )}
        <span
          className={`inline-block mt-0.5 px-1.5 py-0 rounded text-[9px] font-bold uppercase tracking-wide ${
            !pin.pos
              ? 'bg-destructive/15 text-destructive'
              : isExisting
                ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                : 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
          }`}
        >
          {!pin.pos ? 'No Location — Tap Map' : isExisting ? 'Already Active' : 'New / Pending'}
        </span>
      </div>
      <MapPin
        className={`h-3.5 w-3.5 shrink-0 ${pin.pos ? 'text-emerald-500' : 'text-destructive'}`}
        aria-label={pin.pos ? 'Pin on map' : 'No location'}
      />
      <button onClick={onDelete} className="text-muted-foreground hover:text-destructive p-1" aria-label="Remove">
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export function MapWorkspace() {
  const { invoices } = useInvoices();
  const [drivers, setDrivers] = useState<{ id: string; name: string; avatar: string }[]>([]);
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [scanned, setScanned] = useState('');
  // Batch is purely LOCAL state — no DB rows are created until Assign & Update.
  const [batch, setBatch] = useState<BatchPin[]>([]);
  const [flyTarget, setFlyTarget] = useState<[number, number] | null>(null);
  const [fitTrigger, setFitTrigger] = useState(0);
  const [searching, setSearching] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [resultFocused, setResultFocused] = useState(false);
  const [assigning, setAssigning] = useState(false);
  // Set true right before Retrieve mutates batch so the driver-change effect doesn't wipe it.
  const skipNextDriverClearRef = useRef(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
  );

  // Load on-duty drivers
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('drivers')
        .select('id,name,avatar')
        .eq('is_active', true)
        .eq('is_on_duty', true)
        .order('created_at');
      setDrivers((data || []) as any);
    })();
  }, []);

  // Clear batch whenever the selected driver changes (unless Retrieve just populated it)
  useEffect(() => {
    if (skipNextDriverClearRef.current) { skipNextDriverClearRef.current = false; return; }
    setBatch([]);
    setFlyTarget(null);
  }, [selectedDriverId]);

  /**
   * Geocode free-text (auto ", Toronto, ON") then append to the local batch.
   * If the geocoder fails, the pin is still added with pos=null so the user can
   * tap the map to drop it manually.
   */
  const resolveAddressToPin = useCallback(async (
    rawLabel: string,
    invoiceNumber: string | null,
  ): Promise<BatchPin> => {
    const label = rawLabel.trim();
    const pos = await geocode(label);
    const pin: BatchPin = {
      id: `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      cardId: null,
      label,
      pos,
      invoiceNumber,
      isExisting: false,
    };
    setBatch(prev => [...prev, pin]);
    setFitTrigger(t => t + 1);
    if (!pos) toast.warning('No location found — tap the map to place this pin');
    return pin;
  }, []);

  const handleSearch = async (q: string, sourceClear?: () => void) => {
    if (!q.trim()) return;
    const first = q.split('\n').find(l => l.trim() && !l.startsWith('---')) || q;
    setSearching(true);
    try {
      await resolveAddressToPin(first, extractInvoiceNumber(q));
      sourceClear?.();
    } finally {
      setSearching(false);
    }
  };

/**
   * Receives sanitized scan results from the SHARED BatchScanModal (same one
   * the Dispatch Tab uses) and adds each as a local batch pin.
   */
  const handleScanResults = useCallback(async (results: RawScanResult[]) => {
    setScanning(true);
    try {
      for (const r of results) {
        if (!r.address || r.address === 'Unknown') continue;
        await resolveAddressToPin(r.address, r.invoiceNumber || null);
      }
      // Mirror Dispatch behaviour: surface the latest raw address for review
      const latest = results[results.length - 1];
      if (latest) setScanned(latest.address);
    } finally {
      setScanning(false);
    }
  }, [resolveAddressToPin]);

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setBatch(prev => {
      const oldIdx = prev.findIndex(p => p.id === active.id);
      const newIdx = prev.findIndex(p => p.id === over.id);
      if (oldIdx < 0 || newIdx < 0) return prev;
      return arrayMove(prev, oldIdx, newIdx);
    });
  };

  const clearAll = () => {
    setBatch([]);
    setFlyTarget(null);
    toast.success('Workspace cleared');
  };

  /**
   * SELECT * FROM invoice_cards WHERE driver_id = X AND location = 'active'
   * Pins without lat/lng are still surfaced so the user can pin them manually.
   */
  const handleRetrieve = async () => {
    if (!selectedDriverId) { toast.error('Pick a driver first'); return; }
    // Coerce to numbers — Supabase may surface numerics as strings depending on the client
    const toPos = (lat: any, lng: any): [number, number] | null => {
      if (lat == null || lng == null) return null;
      const a = typeof lat === 'number' ? lat : parseFloat(lat);
      const b = typeof lng === 'number' ? lng : parseFloat(lng);
      return Number.isFinite(a) && Number.isFinite(b) ? [a, b] : null;
    };
    const labelFor = (r: any) =>
      r.invoice_number
        ? `${r.invoice_number} — ${r.address}`
        : `Manual Entry — ${r.address}`;
    // Optimistic from realtime cache
    const optimistic: BatchPin[] = invoices
      .filter(i => i.driver_id === selectedDriverId && i.location === 'active')
      .sort((a, b) => a.sort_order - b.sort_order)
      .map(r => ({
        id: r.id,
        cardId: r.id,
        label: labelFor(r),
        pos: toPos(r.lat, r.lng),
        invoiceNumber: r.invoice_number,
        isExisting: true,
      }));
    skipNextDriverClearRef.current = true;
    setBatch(optimistic);
    setFitTrigger(t => t + 1);
    try {
      const fresh = await fetchActiveForDriver(selectedDriverId);
      const pins: BatchPin[] = fresh.map((r: any) => ({
        id: r.id,
        cardId: r.id,
        label: labelFor(r),
        pos: toPos(r.lat, r.lng),
        invoiceNumber: r.invoice_number,
        isExisting: true,
      }));
      skipNextDriverClearRef.current = true;
      setBatch(pins);
      setFitTrigger(t => t + 1);
      const missing = pins.filter(p => !p.pos);
      toast.success(
        `Retrieved ${pins.length} active stop(s)` + (missing.length > 0 ? ` — geocoding ${missing.length}…` : ''),
      );
      // Auto-geocode any pin missing coords; pins "pop" onto the map as each one resolves.
      if (missing.length > 0) {
        let resolved = 0;
        for (const p of missing) {
          // Strip leading "INV — " prefix if present so the address geocodes cleanly
          const addrOnly = p.label.includes(' — ') ? p.label.split(' — ').slice(1).join(' — ') : p.label;
          const coord = await geocode(addrOnly);
          if (coord) {
            resolved++;
            skipNextDriverClearRef.current = true;
            setBatch(prev => prev.map(b => b.id === p.id ? { ...b, pos: coord } : b));
            // Persist back so future retrieves are instant
            if (p.cardId) {
              const { error } = await supabase.from('invoice_cards')
                .update({ lat: coord[0], lng: coord[1] } as any)
                .eq('id', p.cardId);
              if (error) console.error('[Geocode Debug] Failed to save coordinates:', p.cardId, error);
            }
            setFitTrigger(t => t + 1);
          }
        }
        if (resolved < missing.length) {
          toast.warning(`${missing.length - resolved} address(es) could not be geocoded — tap the map to pin manually`);
        }
      }
    } catch (e) {
      console.error(e);
      toast.error('Failed to retrieve route');
    }
  };

  /**
   * Only DB writer. For each batch pin (in order):
   *  - has cardId         → update driver/location/coords/sort_order/address
   *  - has invoice number → look up existing card; if found, update it
   *  - otherwise          → create a new map-pin card directly into the active route
   */
  const handleAssign = async () => {
    if (!selectedDriverId) { toast.error('Pick a driver first'); return; }
    if (batch.length === 0) { toast.error('No pins in batch'); return; }
    const missing = batch.filter(p => !p.pos);
    if (missing.length > 0) {
      toast.error(`${missing.length} pin(s) have no location — tap the map to place them`);
      return;
    }
    setAssigning(true);
    try {
      for (let idx = 0; idx < batch.length; idx++) {
        const p = batch[idx];
        const [lat, lng] = p.pos as [number, number];

        let cardId = p.cardId;
        if (!cardId && p.invoiceNumber) {
          const existing = await findInvoiceByNumber(p.invoiceNumber);
          if (existing) cardId = existing.id;
        }

        if (cardId) {
          await supabase.from('invoice_cards').update({
            driver_id: selectedDriverId,
            location: 'active',
            sort_order: idx,
            lat,
            lng,
            address: p.label,
          } as any).eq('id', cardId);
        } else {
          const created = await createMapPin(p.label, lat, lng);
          await supabase.from('invoice_cards').update({
            driver_id: selectedDriverId,
            location: 'active',
            sort_order: idx,
          } as any).eq('id', created.id);
        }
      }
      toast.success(`Synced ${batch.length} stop(s) to driver`);
      setBatch([]);
    } catch (e) {
      console.error(e);
      toast.error('Failed to assign');
    } finally {
      setAssigning(false);
    }
  };

  /** Place/move a pin via map click. If the latest pin is missing coords, fill it; else add a new local pin. */
  const handleMapClick = (pos: [number, number]) => {
    setBatch(prev => {
      const lastMissingIdx = [...prev].reverse().findIndex(p => !p.pos);
      if (lastMissingIdx >= 0) {
        const realIdx = prev.length - 1 - lastMissingIdx;
        const next = [...prev];
        next[realIdx] = { ...next[realIdx], pos };
        toast.success('Pin placed on map');
        return next;
      }
      toast.success('Pin dropped');
      return [...prev, {
        id: `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        cardId: null,
        label: `${pos[0].toFixed(5)}, ${pos[1].toFixed(5)}`,
        pos,
        invoiceNumber: null,
        isExisting: false,
      }];
    });
    setFitTrigger(t => t + 1);
  };

  return (
    <MapErrorBoundary>
      {/* Locked viewport: fills remaining space below the top nav, never lets the page scroll */}
      <div className="flex-1 min-h-0 flex flex-col-reverse md:flex-row overflow-hidden">
        {/* Left sidebar (desktop) / bottom sheet (mobile). Independently scrollable. */}
        <div className="md:w-[36%] md:max-w-md md:min-w-[300px] md:border-r md:border-t-0 border-t border-border bg-card/30 p-3 flex flex-col gap-3 overflow-y-auto h-1/2 md:h-full shrink-0">

          {/* Driver chips */}
          <div>
            <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Assign to driver</label>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {drivers.length === 0 ? (
                <p className="text-[11px] text-muted-foreground italic">No on-duty drivers.</p>
              ) : drivers.map(d => (
                <button
                  key={d.id}
                  onClick={() => setSelectedDriverId(d.id === selectedDriverId ? null : d.id)}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-colors ${
                    selectedDriverId === d.id
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background text-foreground border-border hover:border-primary/50'
                  }`}
                >
                  {d.avatar || d.name[0]} {d.name}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-1.5 mt-2">
              <button
                onClick={handleRetrieve}
                disabled={!selectedDriverId}
                className="flex items-center justify-center gap-1.5 px-2 py-2 rounded-md text-xs font-semibold bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors disabled:opacity-50"
              >
                Retrieve Route
              </button>
              <button
                onClick={handleAssign}
                disabled={!selectedDriverId || batch.length === 0 || assigning}
                className="flex items-center justify-center gap-1.5 px-2 py-2 rounded-md text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {assigning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                Assign & Sync
              </button>
            </div>
          </div>

          {/* Search */}
          <div>
            <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Search Address</label>
            <div className="flex gap-1.5 mt-1">
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSearch(search, () => setSearch(''))}
                placeholder="123 Main St, Toronto"
                className="flex-1 px-2.5 py-1.5 rounded-md text-xs bg-background border border-border focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <button
                onClick={() => handleSearch(search, () => setSearch(''))}
                disabled={searching}
                className="px-2.5 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {searching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>

          {/* Scanner */}
          <div>
            <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Scan Invoice</label>
            <button
              onClick={() => setShowCamera(true)}
              disabled={scanning}
              className="mt-1 w-full flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-md text-xs font-semibold bg-primary/10 text-primary hover:bg-primary/20 transition-colors disabled:opacity-50"
            >
              {scanning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
              {scanning ? 'Scanning…' : 'Open Camera'}
            </button>
          </div>

          {/* Result */}
          <div>
            <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Address Result (editable)</label>
            <textarea
              value={scanned}
              onChange={e => setScanned(e.target.value)}
              onFocus={() => setResultFocused(true)}
              onBlur={() => setTimeout(() => setResultFocused(false), 150)}
              placeholder="Scanned text appears here. Edit before adding."
              rows={4}
              className="mt-1 w-full px-2.5 py-1.5 rounded-md text-xs bg-background border border-border focus:outline-none focus:ring-1 focus:ring-primary resize-none font-mono"
            />
            {(resultFocused || scanned.trim()) && (
              <button
                onClick={() => handleSearch(scanned, () => setScanned(''))}
                disabled={!scanned.trim() || searching}
                className="mt-1.5 w-full flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-md text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {searching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MapPin className="h-3.5 w-3.5" />}
                Add to Batch
              </button>
            )}
          </div>

          {/* Current Batch */}
          <div className="border-t border-border pt-2">
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                Current Batch ({batch.length})
              </label>
              {batch.length > 0 && (
                <button onClick={clearAll} className="text-[10px] font-semibold text-destructive hover:underline">
                  Clear Workspace
                </button>
              )}
            </div>
            {batch.length === 0 ? (
              <p className="text-[11px] text-muted-foreground italic">No addresses yet.</p>
            ) : (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                <SortableContext items={batch.map(p => p.id)} strategy={verticalListSortingStrategy}>
                  <div className="flex flex-col gap-1.5">
                    {batch.map((pin, idx) => (
                      <BatchCard
                        key={pin.id}
                        pin={pin}
                        index={idx}
                        isExisting={pin.isExisting}
                        onClick={() => pin.pos && setFlyTarget(pin.pos)}
                        onDelete={() => setBatch(prev => prev.filter(p => p.id !== pin.id))}
                        onEditSave={async (newLabel) => {
                          const tid = toast.loading('Re-locating address…');
                          const c = await geocode(newLabel);
                          toast.dismiss(tid);
                          setBatch(prev => prev.map(p =>
                            p.id === pin.id ? { ...p, label: newLabel, pos: c ?? p.pos } : p,
                          ));
                          if (c) { setFlyTarget(c); toast.success('Address updated'); }
                          else toast.warning('No location found — tap the map to place this pin');
                        }}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            )}
          </div>
        </div>

        <div className="flex-1 relative h-1/2 md:h-full min-h-0">
          <MapContainer
            center={TORONTO}
            zoom={12}
            className="absolute inset-0 z-0"
            scrollWheelZoom
            touchZoom
          >
            <TileLayer
              attribution='&copy; OpenStreetMap'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <FlyTo pos={flyTarget} />
            <FitAll pins={batch} trigger={fitTrigger} />
            <ClickHandler onPick={handleMapClick} />
            {batch.map((pin, idx) => pin.pos && (
              <Marker
                key={pin.id}
                position={pin.pos}
                icon={numberedIcon(idx + 1)}
                draggable
                eventHandlers={{
                  click: () => pin.pos && setFlyTarget(pin.pos),
                  dragend: e => {
                    const { lat, lng } = e.target.getLatLng();
                    setBatch(prev => prev.map(p =>
                      p.id === pin.id ? { ...p, pos: [lat, lng] } : p,
                    ));
                  },
                }}
              />
            ))}
            <LiveDriverMarkers />
          </MapContainer>
        </div>
      </div>

      <BatchScanModal
        open={showCamera}
        onClose={() => setShowCamera(false)}
        mode="raw"
        onResults={handleScanResults}
      />
    </MapErrorBoundary>
  );
}

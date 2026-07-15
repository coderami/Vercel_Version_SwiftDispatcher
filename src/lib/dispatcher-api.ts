import { supabase } from '@/integrations/supabase/client';
import type { InvoiceCard, Driver, CompletedPath } from '@/types/dispatcher';

export async function fetchDrivers(): Promise<Driver[]> {
  const { data: dbDrivers, error: dErr } = await supabase
    .from('drivers')
    .select('*')
    .eq('is_active', true)
    .order('created_at');
  if (dErr) throw dErr;

  const { data: dbCards, error: cErr } = await supabase
    .from('invoice_cards')
    .select('*')
    .neq('location', 'inbox')
    .order('sort_order');
  if (cErr) throw cErr;

  return (dbDrivers || []).map(d => ({
    id: d.id,
    name: d.name,
    avatar: d.avatar || d.name[0],
    isOnDuty: d.is_on_duty !== false,
    routeStartTime: (d as any).route_start_time ? new Date((d as any).route_start_time) : null,
    activePath: (dbCards || [])
      .filter(c => c.driver_id === d.id && c.location === 'active')
      .map(mapCard),
    stagingArea: (dbCards || [])
      .filter(c => c.driver_id === d.id && c.location === 'staging')
      .map(mapCard),
  }));
}

export async function fetchInbox(): Promise<InvoiceCard[]> {
  const { data, error } = await supabase
    .from('invoice_cards')
    .select('*')
    .eq('location', 'inbox')
    .is('route_id', null)
    .order('sort_order');
  if (error) throw error;
  return (data || []).map(mapCard);
}

export async function fetchRoutes(): Promise<import('@/types/dispatcher').Route[]> {
  const { data: routes, error } = await supabase
    .from('routes' as any)
    .select('*')
    .order('created_at');
  if (error) throw error;

  const { data: cards } = await supabase
    .from('invoice_cards')
    .select('*')
    .not('route_id', 'is', null)
    .order('sort_order');

  return ((routes as any[]) || []).map(r => ({
    id: r.id,
    name: r.name,
    createdAt: new Date(r.created_at),
    cards: ((cards as any[]) || []).filter(c => c.route_id === r.id).map(mapCard),
  }));
}

export async function createRoute(name: string): Promise<import('@/types/dispatcher').Route> {
  const { data, error } = await supabase
    .from('routes' as any)
    .insert({ name } as any)
    .select()
    .single();
  if (error) throw error;
  return { id: (data as any).id, name: (data as any).name, createdAt: new Date((data as any).created_at), cards: [] };
}

export async function assignCardToRoute(cardId: string, routeId: string | null) {
  const { error } = await supabase
    .from('invoice_cards')
    .update({ route_id: routeId } as any)
    .eq('id', cardId);
  if (error) throw error;
}

/** Delete the route record; invoice_cards.route_id is cleared by ON DELETE SET NULL,
 *  so all linked invoices automatically return to the Inbox. */
export async function deleteRoute(routeId: string) {
  const { error } = await supabase
    .from('routes' as any)
    .delete()
    .eq('id', routeId);
  if (error) throw error;
}

/** Move every invoice linked to a route into a driver's lane (active or staging),
 *  then delete the route. Invoices are unpacked as individual cards. */
export async function unpackRouteToDriver(
  routeId: string,
  driverId: string,
  zone: 'active' | 'staging',
  startingSortOrder: number,
) {
  const { data: cards } = await supabase
    .from('invoice_cards')
    .select('id')
    .eq('route_id', routeId)
    .order('sort_order');
  const ids = (cards || []).map(c => c.id);

  await Promise.all(
    ids.map((id, idx) =>
      supabase
        .from('invoice_cards')
        .update({
          driver_id: driverId,
          location: zone,
          route_id: null,
          sort_order: startingSortOrder + idx,
        } as any)
        .eq('id', id),
    ),
  );

  await supabase.from('routes' as any).delete().eq('id', routeId);
  return ids;
}

export async function fetchHistory(): Promise<CompletedPath[]> {
  const { data, error } = await supabase
    .from('completed_paths')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(h => ({
    id: h.id,
    driverId: h.driver_id,
    driverName: h.driver_name,
    startTime: new Date(h.start_time),
    endTime: new Date(h.end_time),
    cards: (h.cards as any[]).map((c: any) => ({
      id: c.id,
      type: c.type,
      clientName: c.clientName,
      address: c.address,
      invoiceNumber: c.invoiceNumber,
      createdAt: new Date(c.createdAt),
    })),
  }));
}

export async function moveCard(
  cardId: string,
  targetLocation: 'inbox' | 'active' | 'staging',
  driverId: string | null,
  sortOrder: number
) {
  const { error } = await supabase
    .from('invoice_cards')
    .update({
      location: targetLocation,
      driver_id: driverId,
      sort_order: sortOrder,
    })
    .eq('id', cardId);
  if (error) throw error;
}

/** Persist sort_order for an ordered list of card ids in a driver's active path. */
export async function persistCardOrder(cardIds: string[]): Promise<void> {
  await Promise.all(
    cardIds.map((id, idx) =>
      supabase.from('invoice_cards').update({ sort_order: idx }).eq('id', id)
    )
  );
}

export async function addPickupCard(clientName: string, address: string): Promise<InvoiceCard> {
  const { data, error } = await supabase
    .from('invoice_cards')
    .insert({
      type: 'pickup',
      client_name: clientName,
      address,
      location: 'inbox',
    })
    .select()
    .single();
  if (error) throw error;
  return mapCard(data);
}

/** Check if an invoice number already exists in active cards or history. Returns location string or null. */
export async function checkDuplicateInvoice(invoiceNumber: string): Promise<string | null> {
  const normalized = invoiceNumber.trim().toLowerCase();
  if (!normalized) return null;

  // Check invoice_cards (inbox / active / staging)
  const { data: existing } = await supabase
    .from('invoice_cards')
    .select('invoice_number, location')
    .not('invoice_number', 'is', null);

  if (existing) {
    const match = existing.find(
      row => (row.invoice_number || '').trim().toLowerCase() === normalized
    );
    if (match) {
      const loc = match.location === 'active' ? 'Active' : match.location === 'staging' ? 'Staging' : 'Inbox';
      return loc;
    }
  }

  // Check completed_paths history (cards is jsonb array)
  const { data: history } = await supabase
    .from('completed_paths')
    .select('cards');

  if (history) {
    for (const row of history) {
      const cards = row.cards as any[];
      if (cards?.some((c: any) => (c.invoiceNumber || '').trim().toLowerCase() === normalized)) {
        return 'History';
      }
    }
  }

  return null;
}

export interface DuplicateResult {
  invoiceNumber: string;
  location: string;
}

/** Find an existing invoice card by invoice number (case-insensitive, trimmed). */
export async function findInvoiceByNumber(invoiceNumber: string): Promise<any | null> {
  const normalized = invoiceNumber.trim().toLowerCase();
  if (!normalized) return null;
  const { data } = await supabase
    .from('invoice_cards')
    .select('*')
    .not('invoice_number', 'is', null);
  return (data || []).find(
    (r: any) => (r.invoice_number || '').trim().toLowerCase() === normalized,
  ) || null;
}

/** Save coordinates onto an invoice card (used when pinned on the Map tab). */
export async function updateCardCoords(cardId: string, lat: number, lng: number) {
  const { error } = await supabase
    .from('invoice_cards')
    .update({ lat, lng } as any)
    .eq('id', cardId);
  if (error) throw error;
}

/** Assign a batch of cards to a driver as their active route in the given order. */
export async function assignBatchToDriver(
  driverId: string,
  items: { id: string; lat: number; lng: number }[],
) {
  await Promise.all(
    items.map((it, idx) =>
      supabase
        .from('invoice_cards')
        .update({
          driver_id: driverId,
          location: 'active' as const,
          sort_order: idx,
          lat: it.lat,
          lng: it.lng,
        } as any)
        .eq('id', it.id),
    ),
  );
}

/**
 * Smart batch sync:
 *  - "new" items (not currently active for this driver) → full update (driver, status=active, coords, sort_order)
 *  - "existing" items (already active for this driver)  → only update sort_order
 */
export async function syncBatchToDriver(
  driverId: string,
  items: { id: string; lat: number; lng: number; isExisting: boolean }[],
) {
  await Promise.all(
    items.map((it, idx) =>
      it.isExisting
        ? supabase.from('invoice_cards').update({ sort_order: idx } as any).eq('id', it.id)
        : supabase
            .from('invoice_cards')
            .update({
              driver_id: driverId,
              location: 'active' as const,
              sort_order: idx,
              lat: it.lat,
              lng: it.lng,
            } as any)
            .eq('id', it.id),
    ),
  );
}

/** Fetch active invoices currently assigned to a driver, in sort_order. */
export async function fetchActiveForDriver(driverId: string): Promise<any[]> {
  const { data, error } = await supabase
    .from('invoice_cards')
    .select('*')
    .eq('driver_id', driverId)
    .eq('location', 'active')
    .order('sort_order');
  if (error) throw error;
  return data || [];
}

/** Create a Map-only pin record (no scanned invoice number) so it is part of the unified data set. */
export async function createMapPin(address: string, lat: number, lng: number): Promise<any> {
  const { data, error } = await supabase
    .from('invoice_cards')
    .insert({
      type: 'pickup' as const,
      client_name: 'Map Pin',
      address,
      location: 'inbox' as const,
      lat,
      lng,
    } as any)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function addScannedCards(
  results: { clientName: string; address: string; invoiceNumber: string; isPickup?: boolean }[]
): Promise<{ added: InvoiceCard[]; duplicates: DuplicateResult[] }> {
  const duplicates: DuplicateResult[] = [];
  const toInsert: typeof results = [];

  // Check each result for duplicates
  for (const r of results) {
    const loc = await checkDuplicateInvoice(r.invoiceNumber);
    if (loc) {
      duplicates.push({ invoiceNumber: r.invoiceNumber, location: loc });
    } else {
      toInsert.push(r);
    }
  }

  if (toInsert.length === 0) {
    return { added: [], duplicates };
  }

  const inserts = toInsert.map(r => ({
    type: (r.isPickup ? 'pickup' : 'invoice') as 'invoice' | 'pickup',
    client_name: r.clientName,
    address: r.address,
    invoice_number: r.invoiceNumber,
    location: 'inbox' as const,
  }));
  const { data, error } = await supabase
    .from('invoice_cards')
    .insert(inserts)
    .select();
  if (error) throw error;
  return { added: (data || []).map(mapCard), duplicates };
}

export async function endPath(
  driverId: string,
  driverName: string,
  cards: InvoiceCard[],
  startTime: Date,
  endTime: Date,
) {
  // Archive to history with authoritative run start/end timestamps
  const { error: hErr } = await supabase.from('completed_paths').insert({
    driver_id: driverId,
    driver_name: driverName,
    start_time: startTime.toISOString(),
    end_time: endTime.toISOString(),
    cards: cards.map(c => ({
      id: c.id,
      type: c.type,
      clientName: c.clientName,
      address: c.address,
      invoiceNumber: c.invoiceNumber,
      createdAt: c.createdAt.toISOString(),
    })),
  });
  if (hErr) throw hErr;

  // Delete active cards
  const activeIds = cards.map(c => c.id);
  if (activeIds.length > 0) {
    const { error: dErr } = await supabase
      .from('invoice_cards')
      .delete()
      .in('id', activeIds);
    if (dErr) throw dErr;
  }

  // Promote staging to active
  const { error: uErr } = await supabase
    .from('invoice_cards')
    .update({ location: 'active' })
    .eq('driver_id', driverId)
    .eq('location', 'staging');
  if (uErr) throw uErr;
}

export async function scanInvoices(images: string[]): Promise<{ clientName: string; address: string; invoiceNumber: string; isPickup: boolean }[]> {
  const { data, error } = await supabase.functions.invoke('scan-invoice', {
    body: { images },
  });
  if (error) throw error;
  if (data?.error === 'rate_limit') throw new Error(data.message || 'Rate limited, try again shortly');
  if (data?.error) throw new Error(data.error);
  return (data.results || []).map((r: any) => ({
    clientName: r.client_name || 'Unknown',
    address: r.address || 'Unknown',
    invoiceNumber: r.invoice_number || `SCAN-${Date.now()}`,
    isPickup: r.is_pickup === true,
  }));
}

export async function deleteCard(cardId: string) {
  const { error } = await supabase
    .from('invoice_cards')
    .delete()
    .eq('id', cardId);
  if (error) throw error;
}

export async function restoreCard(card: InvoiceCard) {
  const { error } = await supabase
    .from('invoice_cards')
    .insert({
      id: card.id,
      type: card.type,
      client_name: card.clientName,
      address: card.address,
      invoice_number: card.invoiceNumber || null,
      location: 'inbox',
    });
  if (error) throw error;
}

function mapCard(row: any): InvoiceCard {
  return {
    id: row.id,
    type: row.type,
    clientName: row.client_name,
    address: row.address,
    invoiceNumber: row.invoice_number || undefined,
    createdAt: new Date(row.created_at),
    routeId: row.route_id ?? null,
  };
}

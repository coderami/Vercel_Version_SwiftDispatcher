import { useState, useCallback, useEffect, useRef } from 'react';
import {
  DndContext,
  DragOverlay,
  closestCorners,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import { Camera, Package, History, LayoutDashboard, Loader2, Users, BarChart3, Map as MapIcon, Smartphone, LogOut } from 'lucide-react';
import { DeviceManagement } from './DeviceManagement';
import { MapWorkspace } from './MapWorkspace';
import type { InvoiceCard, Driver, CompletedPath, Route } from '@/types/dispatcher';
import { InboxRow } from './InboxRow';
import { DriverLane } from './DriverLane';
import { RouteChip } from './RouteChip';
import { InvoiceCardItem } from './InvoiceCardItem';
import { QuickAddModal } from './QuickAddModal';
import { BatchScanModal } from './BatchScanModal';
import { HistoryView } from './HistoryView';
import { DriverManagement } from './DriverManagement';
import { ReportView } from './ReportView';

import { OffDutySection } from './OffDutySection';
import { TrashBin } from './TrashBin';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  fetchDrivers,
  fetchInbox,
  fetchHistory,
  fetchRoutes,
  createRoute,
  assignCardToRoute,
  deleteRoute,
  unpackRouteToDriver,
  moveCard,
  addPickupCard,
  endPath as apiEndPath,
  deleteCard,
  restoreCard,
  persistCardOrder,
} from '@/lib/dispatcher-api';
import { arrayMove } from '@dnd-kit/sortable';
import { NewRouteModal, DeleteRouteModal } from './RouteModals';

type Tab = 'dispatch' | 'history' | 'drivers' | 'report' | 'map' | 'devices';

export function DispatcherDashboard() {
  const [tab, setTab] = useState<Tab>('dispatch');
  const [inbox, setInbox] = useState<InvoiceCard[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [history, setHistory] = useState<CompletedPath[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [rawDrivers, setRawDrivers] = useState<any[]>([]);
  const [activeCard, setActiveCard] = useState<InvoiceCard | null>(null);
  const [activeRoute, setActiveRoute] = useState<Route | null>(null);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [showScan, setShowScan] = useState(false);
  const [showNewRoute, setShowNewRoute] = useState(false);
  const [routeToDelete, setRouteToDelete] = useState<Route | null>(null);
  const [loading, setLoading] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const [pendingRouteDrivers, setPendingRouteDrivers] = useState<Set<string>>(new Set());
  const lockDriver = (id: string) => setPendingRouteDrivers(p => { const n = new Set(p); n.add(id); return n; });
  const unlockDriver = (id: string) => setPendingRouteDrivers(p => { const n = new Set(p); n.delete(id); return n; });

  const loadData = useCallback(async () => {
    try {
      const [d, i, h, r, rawD] = await Promise.all([
        fetchDrivers(),
        fetchInbox(),
        fetchHistory(),
        fetchRoutes(),
        supabase.from('drivers').select('*').eq('is_active', true).order('created_at').then(r => r.data || []),
      ]);
      setDrivers(d);
      setInbox(i);
      setHistory(h);
      setRoutes(r);
      setRawDrivers(rawD);
    } catch (err) {
      console.error('Load error:', err);
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 500, tolerance: 15 } })
  );

  const findCard = useCallback((id: string): { card: InvoiceCard; source: string } | null => {
    const inboxCard = inbox.find(c => c.id === id);
    if (inboxCard) return { card: inboxCard, source: 'inbox' };
    for (const d of drivers) {
      const active = d.activePath.find(c => c.id === id);
      if (active) return { card: active, source: `driver-${d.id}-active` };
      const staged = d.stagingArea.find(c => c.id === id);
      if (staged) return { card: staged, source: `driver-${d.id}-staging` };
    }
    for (const r of routes) {
      const c = r.cards.find(x => x.id === id);
      if (c) return { card: c, source: `route-${r.id}` };
    }
    return null;
  }, [inbox, drivers, routes]);

  const removeCardFromSource = useCallback((cardId: string, source: string) => {
    if (source === 'inbox') {
      setInbox(prev => prev.filter(c => c.id !== cardId));
    } else if (source.startsWith('route-')) {
      const routeId = source.slice(6);
      setRoutes(prev => prev.map(r =>
        r.id === routeId ? { ...r, cards: r.cards.filter(c => c.id !== cardId) } : r
      ));
    } else {
      const lastDash = source.lastIndexOf('-');
      const zone = source.slice(lastDash + 1);
      const driverId = source.slice(7, lastDash);
      setDrivers(prev => prev.map(d => {
        if (d.id !== driverId) return d;
        return zone === 'active'
          ? { ...d, activePath: d.activePath.filter(c => c.id !== cardId) }
          : { ...d, stagingArea: d.stagingArea.filter(c => c.id !== cardId) };
      }));
    }
  }, []);

  const handleDragStart = (event: DragStartEvent) => {
    const id = event.active.id as string;
    if (id.startsWith('route-')) {
      const routeId = id.slice(6);
      const r = routes.find(x => x.id === routeId);
      if (r) {
        setActiveRoute(r);
        setIsDragging(true);
      }
      return;
    }
    const found = findCard(id);
    if (found) {
      setActiveCard(found.card);
      setIsDragging(true);
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const draggedRoute = activeRoute;
    setActiveCard(null);
    setActiveRoute(null);
    setIsDragging(false);
    const { active, over } = event;
    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    // ============ ROUTE CHIP DRAG ============
    if (activeId.startsWith('route-')) {
      const routeId = activeId.slice(6);
      const route = draggedRoute || routes.find(r => r.id === routeId);
      if (!route) return;

      // Resolve over target into a zone
      let target = overId;
      if (!target.startsWith('inbox') && !target.startsWith('driver-') && !target.startsWith('route-')) {
        const tCard = findCard(target);
        if (tCard) target = tCard.source;
        else return;
      }

      // Route → driver lane (active or staging) → unpack
      if (target.startsWith('driver-') && (target.endsWith('-active') || target.endsWith('-staging'))) {
        const lastDash = target.lastIndexOf('-');
        const zone = target.slice(lastDash + 1) as 'active' | 'staging';
        const driverId = target.slice(7, lastDash);
        const driver = drivers.find(d => d.id === driverId);
        if (!driver) return;

        const start = zone === 'active' ? driver.activePath.length : driver.stagingArea.length;

        // Optimistic: move cards from route → driver zone
        setRoutes(prev => prev.filter(r => r.id !== routeId));
        setDrivers(prev => prev.map(d => {
          if (d.id !== driverId) return d;
          return zone === 'active'
            ? { ...d, activePath: [...d.activePath, ...route.cards] }
            : { ...d, stagingArea: [...d.stagingArea, ...route.cards] };
        }));

        try {
          await unpackRouteToDriver(routeId, driverId, zone, start);
          toast.success(`${route.cards.length} stop(s) added to ${driver.name}`);
        } catch (err) {
          console.error('Unpack route error:', err);
          toast.error('Failed to assign route');
          loadData();
        }
        return;
      }

      // Otherwise: no-op (routes stay in inbox)
      return;
    }

    // ============ INVOICE CARD DRAG ============
    const cardId = activeId;
    const found = findCard(cardId);
    if (!found) return;

    // Handle trash drop
    if (overId === 'trash') {
      removeCardFromSource(cardId, found.source);
      const deletedCard = found.card;
      try {
        await deleteCard(cardId);
        toast('Invoice deleted', {
          action: {
            label: 'Undo',
            onClick: async () => {
              try {
                await restoreCard(deletedCard);
                setInbox(prev => [...prev, deletedCard]);
                toast.success('Invoice restored');
              } catch {
                toast.error('Failed to restore');
                loadData();
              }
            },
          },
        });
      } catch (err) {
        console.error('Delete error:', err);
        toast.error('Failed to delete invoice');
        loadData();
      }
      return;
    }

    // Drop onto a Route Chip → assign card to that route
    if (overId.startsWith('route-')) {
      const routeId = overId.slice(6);
      if (found.card.routeId === routeId) return;

      // Optimistic: remove from source, add into route
      removeCardFromSource(cardId, found.source);
      const updatedCard = { ...found.card, routeId };
      setRoutes(prev => prev.map(r =>
        r.id === routeId ? { ...r, cards: [...r.cards, updatedCard] } : r
      ));

      try {
        // Ensure DB sees the card as inbox + linked to the route
        await moveCard(cardId, 'inbox', null, 0);
        await assignCardToRoute(cardId, routeId);
      } catch (err) {
        console.error('Assign to route error:', err);
        toast.error('Failed to add to route');
        loadData();
      }
      return;
    }

    let target = overId;
    let overCardId: string | null = null;
    if (!target.startsWith('inbox') && !target.startsWith('driver-')) {
      const targetCard = findCard(target);
      if (targetCard) {
        overCardId = target;
        target = targetCard.source;
      } else return;
    }

    // Same-zone reorder (active list)
    if (found.source === target && overCardId && overCardId !== cardId) {
      if (target.startsWith('driver-') && target.endsWith('-active')) {
        const driverId = target.slice(7, target.lastIndexOf('-'));
        const driver = drivers.find(d => d.id === driverId);
        if (!driver) return;
        const oldIdx = driver.activePath.findIndex(c => c.id === cardId);
        const newIdx = driver.activePath.findIndex(c => c.id === overCardId);
        if (oldIdx === -1 || newIdx === -1 || oldIdx === newIdx) return;
        const reordered = arrayMove(driver.activePath, oldIdx, newIdx);
        setDrivers(prev => prev.map(d => d.id === driverId ? { ...d, activePath: reordered } : d));
        try {
          await persistCardOrder(reordered.map(c => c.id));
        } catch (err) {
          console.error('Reorder error:', err);
          toast.error('Failed to save order');
          loadData();
        }
        return;
      }
      // Same zone but not active list — no-op
      return;
    }

    if (found.source === target) return;

    // Optimistic UI update
    removeCardFromSource(cardId, found.source);

    let targetLocation: 'inbox' | 'active' | 'staging' = 'inbox';
    let driverId: string | null = null;
    let nextSortOrder = 0;

    if (target === 'inbox') {
      setInbox(prev => [...prev, { ...found.card, routeId: null }]);
    } else {
      const lastDash = target.lastIndexOf('-');
      const zone = target.slice(lastDash + 1) as 'active' | 'staging';
      driverId = target.slice(7, lastDash);
      targetLocation = zone;
      const driver = drivers.find(d => d.id === driverId);
      // Auto-assign next position in sequence when added to active
      if (zone === 'active' && driver) {
        nextSortOrder = driver.activePath.length;
      }
      setDrivers(prev => prev.map(d => {
        if (d.id !== driverId) return d;
        return zone === 'active'
          ? { ...d, activePath: [...d.activePath, found.card] }
          : { ...d, stagingArea: [...d.stagingArea, found.card] };
      }));
    }

    try {
      // Moving anywhere clears any route link on the card
      await assignCardToRoute(cardId, null);
      await moveCard(cardId, targetLocation, driverId, nextSortOrder);
    } catch (err) {
      console.error('Move error:', err);
      toast.error('Failed to move card');
      loadData();
    }
  };

  const handleStartRoute = async (driverId: string) => {
    const driver = drivers.find(d => d.id === driverId);
    if (!driver) return;
    // Run-locking: refuse if a run is already active locally or operation in-flight
    if (driver.routeStartTime !== null) {
      toast.error('A run is already active for this driver');
      return;
    }
    if (pendingRouteDrivers.has(driverId)) return;
    // Need at least one card in active or staging
    if (driver.activePath.length === 0 && driver.stagingArea.length === 0) return;

    lockDriver(driverId);
    const now = new Date();

    try {
      // Atomic claim: only succeeds if route_start_time is NULL in DB (no overlap possible)
      const { data, error: driverErr } = await supabase
        .from('drivers')
        .update({ route_start_time: now.toISOString() } as any)
        .eq('id', driverId)
        .is('route_start_time', null)
        .select('id');
      if (driverErr) throw driverErr;
      if (!data || data.length === 0) {
        toast.error('Cannot start — previous run has not been ended');
        await loadData();
        return;
      }

      // DB confirmed → update local state
      setDrivers(prev => prev.map(d => d.id === driverId ? { ...d, routeStartTime: now } : d));
      const totalStops = driver.activePath.length + driver.stagingArea.length;
      toast.success(`${driver.name}'s route started — ${totalStops} stop(s)`);
    } catch (err) {
      console.error('Start route error:', err);
      toast.error('Failed to start route');
      loadData();
    } finally {
      unlockDriver(driverId);
    }
  };

  const handleEndRoute = async (driverId: string) => {
    const driver = drivers.find(d => d.id === driverId);
    if (!driver) return;
    if (!driver.routeStartTime) {
      toast.error('No active run to end');
      return;
    }
    if (pendingRouteDrivers.has(driverId)) return;

    lockDriver(driverId);
    // Atomic timestamping: capture end timestamp NOW, before any UI mutation
    const endTime = new Date();
    const startTime = driver.routeStartTime;
    const activeCards = driver.activePath;
    const stagingCards = driver.stagingArea;

    try {
      // 1. Persist end-of-run to DB FIRST (before clearing local state)
      if (activeCards.length > 0) {
        await apiEndPath(driverId, driver.name, activeCards, startTime, endTime);
      } else if (stagingCards.length > 0) {
        const { error } = await supabase
          .from('invoice_cards')
          .update({ location: 'active' as const })
          .eq('driver_id', driverId)
          .eq('location', 'staging' as const);
        if (error) throw error;
      }

      // 2. Atomic release of the driver's run lock — only clears if currently locked to OUR start time
      const { error: driverErr } = await supabase
        .from('drivers')
        .update({ route_start_time: null } as any)
        .eq('id', driverId)
        .eq('route_start_time', startTime.toISOString());
      if (driverErr) throw driverErr;

      // 3. ONLY after DB success — clear local 'Active Run' state for a fresh next session
      setDrivers(prev => prev.map(d => {
        if (d.id !== driverId) return d;
        return { ...d, activePath: [...stagingCards], stagingArea: [], routeStartTime: null };
      }));

      const h = await fetchHistory();
      setHistory(h);
      const archivedCount = activeCards.length;
      if (archivedCount > 0) {
        toast.success(`${driver.name}'s route completed — ${archivedCount} stop(s) archived`);
      } else {
        toast.success(`${driver.name}'s route ended`);
      }
    } catch (err) {
      console.error('End route error:', err);
      toast.error('Failed to end route');
      loadData();
    } finally {
      unlockDriver(driverId);
    }
  };

  const handleQuickAdd = async (clientName: string, address: string) => {
    try {
      const card = await addPickupCard(clientName, address);
      setInbox(prev => [...prev, card]);
      toast.success('Pick-up added to inbox');
    } catch (err) {
      console.error('Quick add error:', err);
      toast.error('Failed to add pick-up');
    }
  };

  const handleScanned = (cards: InvoiceCard[]) => {
    setInbox(prev => [...prev, ...cards]);
  };

  const handleCreateRoute = async (name: string) => {
    try {
      const r = await createRoute(name);
      setRoutes(prev => [...prev, r]);
      toast.success(`Route "${name}" created`);
    } catch (err) {
      console.error('Create route error:', err);
      toast.error('Failed to create route');
    }
  };

  const handleConfirmDeleteRoute = async () => {
    const route = routeToDelete;
    if (!route) return;
    // Optimistic: return invoices to inbox, drop the route
    setRoutes(prev => prev.filter(r => r.id !== route.id));
    setInbox(prev => [
      ...prev,
      ...route.cards.map(c => ({ ...c, routeId: null })),
    ]);
    try {
      await deleteRoute(route.id);
      toast.success(
        `Route deleted — ${route.cards.length} ${route.cards.length === 1 ? 'invoice' : 'invoices'} returned to Inbox`
      );
    } catch (err) {
      console.error('Delete route error:', err);
      toast.error('Failed to delete route');
      loadData();
    }
  };

  const handleUnpackRoute = async (route: Route) => {
    // Move all cards back to inbox (locally), delete route in DB (ON DELETE SET NULL clears route_id)
    setRoutes(prev => prev.filter(r => r.id !== route.id));
    setInbox(prev => [...prev, ...route.cards.map(c => ({ ...c, routeId: null }))]);
    try {
      await deleteRoute(route.id);
      toast.success(`Unpacked "${route.name}" — ${route.cards.length} ${route.cards.length === 1 ? 'invoice' : 'invoices'} returned to Inbox`);
    } catch (err) {
      console.error('Unpack error:', err);
      toast.error('Failed to unpack route');
      loadData();
    }
  };

  const handleRemoveCardFromRoute = async (card: InvoiceCard, route: Route) => {
    // Optimistic: pop from route, push to inbox
    setRoutes(prev => prev.map(r =>
      r.id === route.id ? { ...r, cards: r.cards.filter(c => c.id !== card.id) } : r
    ));
    setInbox(prev => [...prev, { ...card, routeId: null }]);
    try {
      await assignCardToRoute(card.id, null);
      const label = card.invoiceNumber ? `#${card.invoiceNumber}` : card.clientName;
      toast.success(`${label} removed from ${route.name}`);
    } catch (err) {
      console.error('Remove from route error:', err);
      toast.error('Failed to remove from route');
      loadData();
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-background">
      <header className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-card/50">
        <h1 className="text-sm font-bold font-mono text-primary tracking-tight">DISPATCH</h1>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setShowScan(true)}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[11px] font-semibold bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
          >
            <Camera className="h-3.5 w-3.5" />
            Scan
          </button>
          <button
            onClick={() => setShowQuickAdd(true)}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[11px] font-semibold bg-pickup/10 text-pickup hover:bg-pickup/20 transition-colors"
          >
            <Package className="h-3.5 w-3.5" />
            Pick-up
          </button>
          <button
            onClick={() => { localStorage.removeItem('dispatchbuddy.deviceRole'); window.location.reload(); }}
            className="p-1.5 rounded-md hover:bg-muted"
            aria-label="Switch role"
            title="Switch role"
          >
            <LogOut className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        </div>
      </header>

      <div className="flex border-b border-border">
        <button
          onClick={() => setTab('dispatch')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-semibold transition-colors ${
            tab === 'dispatch' ? 'text-primary border-b-2 border-primary' : 'text-muted-foreground'
          }`}
        >
          <LayoutDashboard className="h-3.5 w-3.5" />
          Dispatch
        </button>
        <button
          onClick={() => setTab('drivers')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-semibold transition-colors ${
            tab === 'drivers' ? 'text-primary border-b-2 border-primary' : 'text-muted-foreground'
          }`}
        >
          <Users className="h-3.5 w-3.5" />
          Drivers
        </button>
        <button
          onClick={() => setTab('history')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-semibold transition-colors ${
            tab === 'history' ? 'text-primary border-b-2 border-primary' : 'text-muted-foreground'
          }`}
        >
          <History className="h-3.5 w-3.5" />
          History
        </button>
        <button
          onClick={() => setTab('report')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-semibold transition-colors ${
            tab === 'report' ? 'text-primary border-b-2 border-primary' : 'text-muted-foreground'
          }`}
        >
          <BarChart3 className="h-3.5 w-3.5" />
          Report
        </button>
        <button
          onClick={() => setTab('map')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-semibold transition-colors ${
            tab === 'map' ? 'text-primary border-b-2 border-primary' : 'text-muted-foreground'
          }`}
        >
          <MapIcon className="h-3.5 w-3.5" />
          Map
        </button>
        <button
          onClick={() => setTab('devices')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-semibold transition-colors ${
            tab === 'devices' ? 'text-primary border-b-2 border-primary' : 'text-muted-foreground'
          }`}
        >
          <Smartphone className="h-3.5 w-3.5" />
          Devices
        </button>
      </div>

      {tab === 'dispatch' ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <InboxRow
            cards={inbox}
            routes={routes}
            onNewRoute={() => setShowNewRoute(true)}
            onDeleteRoute={(r) => setRouteToDelete(r)}
            onUnpackRoute={handleUnpackRoute}
            onRemoveCardFromRoute={handleRemoveCardFromRoute}
          />
          <div className="flex-1 overflow-x-auto overflow-y-auto">
            {/* On Duty Drivers */}
            <div className="flex gap-2 p-3 min-h-full">
              {drivers.filter(d => d.isOnDuty).map(driver => (
                <DriverLane key={driver.id} driver={driver} onStartRoute={handleStartRoute} onEndRoute={handleEndRoute} isPending={pendingRouteDrivers.has(driver.id)} />
              ))}
            </div>
            {/* Off Duty Drivers (collapsed section) */}
            {drivers.some(d => !d.isOnDuty) && (
              <OffDutySection drivers={drivers.filter(d => !d.isOnDuty)} onStartRoute={handleStartRoute} onEndRoute={handleEndRoute} />
            )}
          </div>
          <DragOverlay>
            {activeCard ? (
              <InvoiceCardItem card={activeCard} overlay />
            ) : activeRoute ? (
              <div style={{ width: 220 }}>
                <RouteChip route={activeRoute} onDelete={() => {}} overlay />
              </div>
            ) : null}
          </DragOverlay>
          <TrashBin visible={isDragging} />
        </DndContext>
      ) : tab === 'drivers' ? (
        <DriverManagement drivers={rawDrivers} onDriversChanged={loadData} />
      ) : tab === 'history' ? (
        <HistoryView history={history} />
      ) : tab === 'report' ? (
        <ReportView />
      ) : tab === 'devices' ? (
        <DeviceManagement />
      ) : (
        <MapWorkspace />
      )}

      <QuickAddModal open={showQuickAdd} onClose={() => setShowQuickAdd(false)} onAdd={handleQuickAdd} />
      <BatchScanModal open={showScan} onClose={() => setShowScan(false)} onScanned={handleScanned} />
      <NewRouteModal open={showNewRoute} onClose={() => setShowNewRoute(false)} onCreate={handleCreateRoute} />
      <DeleteRouteModal
        open={!!routeToDelete}
        routeName={routeToDelete?.name || ''}
        invoiceCount={routeToDelete?.cards.length || 0}
        onClose={() => setRouteToDelete(null)}
        onConfirm={handleConfirmDeleteRoute}
      />
    </div>
  );
}

import { useState, useEffect, useRef } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Play, Square, ChevronDown, ChevronUp } from 'lucide-react';
import type { Driver, InvoiceCard } from '@/types/dispatcher';
import { InvoiceCardItem } from './InvoiceCardItem';


interface Props {
  driver: Driver;
  onStartRoute: (driverId: string) => void;
  onEndRoute: (driverId: string) => void;
  isPending?: boolean;
}

function DropZone({ id, label, cards, isDotted, scrollable, showIndex }: { id: string; label: string; cards: InvoiceCard[]; isDotted?: boolean; scrollable?: boolean; showIndex?: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id });

  return (
    <div className="flex flex-col">
      {label && (
        <p className={`text-[10px] uppercase tracking-widest font-semibold mb-1.5 px-1 ${isDotted ? 'text-staging' : 'text-muted-foreground'}`}>
          {label}
        </p>
      )}
      <div
        ref={setNodeRef}
        className={`
          rounded-md py-2 px-[15px] transition-all duration-200
          ${scrollable ? 'max-h-[350px] overflow-y-auto overscroll-contain active-scrollbar snap-y snap-mandatory touch-pan-y [scrollbar-gutter:stable]' : 'min-h-[80px]'}
          ${isDotted
            ? `border-2 border-dashed border-staging ${isOver ? 'border-primary bg-primary/5' : ''}`
            : `border border-border bg-card/40 ${isOver ? 'border-primary bg-primary/5' : ''}`
          }
        `}
      >
        <SortableContext items={cards.map(c => c.id)} strategy={verticalListSortingStrategy}>
          <div className={`flex flex-col gap-1.5 ${scrollable ? 'pr-[15px]' : ''}`}>
            {cards.map((card, idx) => (
              <div key={card.id} className="snap-start">
                <InvoiceCardItem card={card} touchAction="pan-y" indexNumber={showIndex ? idx + 1 : undefined} />
              </div>
            ))}
          </div>
        </SortableContext>
        {cards.length === 0 && (
          <p className="text-[10px] text-muted-foreground/50 text-center py-4">
            Drop here
          </p>
        )}
      </div>
    </div>
  );
}

function LiveTimer({ startTime }: { startTime: Date }) {
  const [elapsed, setElapsed] = useState('00:00');
  const intervalRef = useRef<ReturnType<typeof setInterval>>();

  useEffect(() => {
    const tick = () => {
      const diff = Math.floor((Date.now() - startTime.getTime()) / 1000);
      const h = Math.floor(diff / 3600);
      const m = Math.floor((diff % 3600) / 60);
      const s = diff % 60;
      setElapsed(
        h > 0
          ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
          : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
      );
    };
    tick();
    intervalRef.current = setInterval(tick, 1000);
    return () => clearInterval(intervalRef.current);
  }, [startTime]);

  return (
    <span className="text-[10px] font-mono text-primary tabular-nums">{elapsed}</span>
  );
}

export function DriverLane({ driver, onStartRoute, onEndRoute, isPending = false }: Props) {
  const isRouteActive = driver.routeStartTime !== null;
  const hasCards = driver.activePath.length > 0 || driver.stagingArea.length > 0;
  const [stagingExpanded, setStagingExpanded] = useState(true);

  const handleToggle = () => {
    if (isPending) return;
    if (isRouteActive) {
      onEndRoute(driver.id);
    } else {
      if (!hasCards) return;
      onStartRoute(driver.id);
    }
  };

  const canToggle = !isPending && (isRouteActive || hasCards);

  return (
    <div className={`flex flex-col bg-lane rounded-lg border min-w-[220px] w-[220px] shrink-0 transition-all duration-300 ${
      isRouteActive ? 'border-primary/40 shadow-[0_0_12px_hsl(var(--primary)/0.15)]' : 'border-border'
    }`}>
      {/* Driver Header */}
      <div className="flex items-center gap-2 px-[15px] py-2.5 border-b border-border">
        <div className="h-7 w-7 rounded-full bg-primary/20 flex items-center justify-center text-primary text-xs font-bold">
          {driver.avatar}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">{driver.name}</p>
          <p className="text-[10px] text-muted-foreground">
            {driver.activePath.length} active · {driver.stagingArea.length} staged
          </p>
        </div>
      </div>

      {/* Start/End Route Toggle */}
      <div className="px-[15px] pt-2">
        <button
          onClick={handleToggle}
          disabled={!canToggle}
          className={`w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-xs font-semibold transition-colors
            disabled:opacity-30 disabled:cursor-not-allowed
            ${isRouteActive
              ? 'bg-destructive/10 text-destructive hover:bg-destructive/20'
              : 'bg-primary/10 text-primary hover:bg-primary/20'
            }`}
        >
          {isRouteActive ? (
            <>
              <Square className="h-3 w-3" />
              End Route
            </>
          ) : (
            <>
              <Play className="h-3 w-3" />
              Start Route
            </>
          )}
        </button>
        {driver.routeStartTime && (
          <div className="flex items-center justify-center mt-1">
            <LiveTimer startTime={driver.routeStartTime} />
          </div>
        )}
      </div>

      {/* Zones — flex column, no fixed/absolute. Active list on top, staging below. */}
      <div className="flex flex-col gap-3 px-[15px] py-2 flex-1 min-h-0">
        {/* Active Path — top priority */}
        <div className="flex-1 min-h-0 flex flex-col">
          <DropZone
            id={`driver-${driver.id}-active`}
            label="▶ Current Path"
            cards={driver.activePath}
            scrollable
            showIndex
          />
        </div>

        {/* Collapsible Staging Area — capped at 40vh, internal scroll, with top margin for separation */}
        <div className="flex flex-col shrink-0 mt-[10px]" style={{ maxHeight: '40vh' }}>
          <button
            type="button"
            onClick={() => setStagingExpanded(e => !e)}
            className="sticky top-0 z-10 flex items-center justify-between gap-1 px-1 py-1 mb-1 bg-lane text-staging hover:opacity-80 transition-opacity"
          >
            <span className="text-[10px] uppercase tracking-widest font-semibold">
              ⏭ Staging — {driver.stagingArea.length} {driver.stagingArea.length === 1 ? 'Item' : 'Items'}
            </span>
            {stagingExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
          {stagingExpanded && (
            <div className="overflow-y-auto overscroll-contain active-scrollbar [scrollbar-gutter:stable] min-h-0">
              <DropZone
                id={`driver-${driver.id}-staging`}
                label=""
                cards={driver.stagingArea}
                isDotted
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

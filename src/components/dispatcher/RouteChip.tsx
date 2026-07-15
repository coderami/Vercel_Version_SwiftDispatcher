import { useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { useSortable, SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Route as RouteIcon, ChevronDown, ChevronUp, Trash2, FileText, Package, PackageOpen, X } from 'lucide-react';
import type { Route, InvoiceCard } from '@/types/dispatcher';

interface Props {
  route: Route;
  onDelete: (route: Route) => void;
  onUnpack?: (route: Route) => void;
  onRemoveCard?: (card: InvoiceCard, route: Route) => void;
  overlay?: boolean;
}

export function RouteChip({ route, onDelete, onUnpack, onRemoveCard, overlay }: Props) {
  const [expanded, setExpanded] = useState(false);
  const dragId = `route-${route.id}`;

  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: dragId, data: { route } });

  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: dragId });

  const setNodeRef = (el: HTMLDivElement | null) => {
    if (!overlay) {
      setDragRef(el);
      setDropRef(el);
    }
  };

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    touchAction: overlay ? undefined : 'pan-x' as const,
  };

  const count = route.cards.length;

  return (
    <div
      ref={setNodeRef}
      style={overlay ? undefined : style}
      className={`
        relative rounded-md border-2 border-dashed select-none
        transition-all duration-200
        ${isOver ? 'border-primary bg-primary/10' : 'border-primary/60 bg-primary/5'}
        ${overlay ? 'shadow-xl ring-2 ring-primary/40 rotate-2 scale-105' : ''}
        ${isDragging ? 'scale-105 shadow-lg' : ''}
      `}
    >
      <div className="flex items-stretch">
        <div
          {...(overlay ? {} : attributes)}
          {...(overlay ? {} : listeners)}
          className="flex items-center gap-2 px-3 py-2.5 flex-1 min-w-0 cursor-grab active:cursor-grabbing"
        >
          <RouteIcon className="h-4 w-4 text-primary shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold text-foreground truncate">{route.name}</p>
            <p className="text-[10px] text-muted-foreground">
              Route · {count} {count === 1 ? 'invoice' : 'invoices'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-0.5 px-1.5">
          {count > 0 && onUnpack && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onUnpack(route); }}
              onPointerDown={(e) => e.stopPropagation()}
              className="h-7 w-7 inline-flex items-center justify-center rounded text-primary/80 hover:text-primary hover:bg-primary/10"
              aria-label="Unpack route to inbox"
              title="Unpack to Inbox"
            >
              <PackageOpen className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setExpanded(v => !v); }}
            onPointerDown={(e) => e.stopPropagation()}
            className="h-7 w-7 inline-flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-foreground/5"
            aria-label={expanded ? 'Collapse route' : 'Expand route'}
          >
            {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onDelete(route); }}
            onPointerDown={(e) => e.stopPropagation()}
            className="h-7 w-7 inline-flex items-center justify-center rounded text-destructive/80 hover:text-destructive hover:bg-destructive/10"
            aria-label="Delete route"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {expanded && !overlay && (
        <div className="border-t border-primary/20 px-2 py-2 flex flex-col gap-1 bg-background/40 rounded-b-md">
          {count === 0 && (
            <p className="text-[10px] text-muted-foreground italic px-1 py-1">
              Drop invoices here to add them
            </p>
          )}
          <SortableContext items={route.cards.map(c => c.id)} strategy={verticalListSortingStrategy}>
            {route.cards.map(card => (
              <RouteCardItem
                key={card.id}
                card={card}
                onRemove={onRemoveCard ? () => onRemoveCard(card, route) : undefined}
              />
            ))}
          </SortableContext>
        </div>
      )}
    </div>
  );
}

function RouteCardItem({ card, onRemove }: { card: InvoiceCard; onRemove?: () => void }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: card.id, data: { card } });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    touchAction: 'pan-x' as const,
  };

  const isPickup = card.type === 'pickup';

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-start gap-1.5 rounded px-2 py-1.5 border select-none ${
        isPickup ? 'bg-pickup/10 border-pickup/30' : 'bg-card border-border'
      } ${isDragging ? 'shadow-md ring-1 ring-primary/30' : ''}`}
    >
      <div
        {...attributes}
        {...listeners}
        className="flex items-start gap-1.5 flex-1 min-w-0 cursor-grab active:cursor-grabbing"
      >
        {isPickup ? (
          <Package className="h-3 w-3 text-pickup mt-0.5 shrink-0" />
        ) : (
          <FileText className="h-3 w-3 text-primary mt-0.5 shrink-0" />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold text-foreground truncate">{card.clientName}</p>
          <p className="text-[9px] text-muted-foreground truncate">{card.address}</p>
        </div>
      </div>
      {onRemove && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          onPointerDown={(e) => e.stopPropagation()}
          className="h-5 w-5 inline-flex items-center justify-center rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 shrink-0"
          aria-label="Remove from route"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

import { useDroppable } from '@dnd-kit/core';
import { SortableContext, horizontalListSortingStrategy } from '@dnd-kit/sortable';
import { Inbox, Plus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { InvoiceCard, Route } from '@/types/dispatcher';
import { InvoiceCardItem } from './InvoiceCardItem';
import { RouteChip } from './RouteChip';

interface Props {
  cards: InvoiceCard[];
  routes: Route[];
  onNewRoute: () => void;
  onDeleteRoute: (route: Route) => void;
  onUnpackRoute: (route: Route) => void;
  onRemoveCardFromRoute: (card: InvoiceCard, route: Route) => void;
}

export function InboxRow({ cards, routes, onNewRoute, onDeleteRoute, onUnpackRoute, onRemoveCardFromRoute }: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: 'inbox' });
  const [pulse, setPulse] = useState(false);
  const totalCount = cards.length + routes.reduce((s, r) => s + r.cards.length, 0);
  const prevCount = useRef(totalCount);

  useEffect(() => {
    if (totalCount > prevCount.current) {
      setPulse(true);
      const t = setTimeout(() => setPulse(false), 1000);
      return () => clearTimeout(t);
    }
    prevCount.current = totalCount;
  }, [totalCount]);

  const isEmpty = cards.length === 0 && routes.length === 0;

  // Combine sortable IDs so dnd-kit treats them in one horizontal list
  const sortableIds = [
    ...routes.map(r => `route-${r.id}`),
    ...cards.map(c => c.id),
  ];

  return (
    <div className="border-b border-border bg-secondary/30">
      <div className="flex items-center gap-2 px-4 pt-3 pb-1">
        <Inbox className="h-4 w-4 text-primary" />
        <span className="text-xs font-semibold text-foreground uppercase tracking-wider">Inbox</span>
        <span
          className={`
            inline-flex items-center justify-center min-w-[22px] h-5 px-1.5 rounded-full text-[11px] font-bold transition-colors
            ${isEmpty
              ? 'bg-muted text-muted-foreground'
              : 'bg-primary text-primary-foreground'}
            ${pulse ? 'animate-[pulse_1s_ease-in-out_1]' : ''}
          `}
        >
          {totalCount}
        </span>
        <button
          type="button"
          onClick={onNewRoute}
          className="ml-auto inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-semibold bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
        >
          <Plus className="h-3 w-3" />
          New Route
        </button>
      </div>
      <div
        ref={setNodeRef}
        className={`
          flex flex-nowrap gap-2 overflow-x-scroll px-4 pb-5 min-h-[72px] items-start
          snap-x snap-mandatory
          transition-colors
          inbox-scrollbar
          ${isOver ? 'bg-primary/5' : ''}
        `}
      >
        <SortableContext items={sortableIds} strategy={horizontalListSortingStrategy}>
          {routes.map(route => (
            <div key={`route-${route.id}`} className="shrink-0 min-w-[220px] w-[220px] snap-start">
              <RouteChip
                route={route}
                onDelete={onDeleteRoute}
                onUnpack={onUnpackRoute}
                onRemoveCard={onRemoveCardFromRoute}
              />
            </div>
          ))}
          {cards.map(card => (
            <div key={card.id} className="shrink-0 min-w-[200px] w-[200px] snap-start">
              <InvoiceCardItem card={card} />
            </div>
          ))}
        </SortableContext>
        {isEmpty && (
          <div className="flex items-center justify-center w-full text-muted-foreground text-xs py-4">
            No unassigned invoices
          </div>
        )}
      </div>
    </div>
  );
}

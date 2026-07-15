import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { FileText, Package } from 'lucide-react';
import type { InvoiceCard } from '@/types/dispatcher';

interface Props {
  card: InvoiceCard;
  overlay?: boolean;
  touchAction?: 'auto' | 'pan-x' | 'pan-y';
  indexNumber?: number;
}

export function InvoiceCardItem({ card, overlay, touchAction = 'pan-x', indexNumber }: Props) {
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
    touchAction: overlay ? undefined : touchAction,
  };

  const isPickup = card.type === 'pickup';

  return (
    <div
      ref={overlay ? undefined : setNodeRef}
      style={overlay ? undefined : style}
      {...(overlay ? {} : attributes)}
      {...(overlay ? {} : listeners)}
      className={`
        relative rounded-md border px-3 py-2.5 select-none
        transition-transform duration-200 ease-out
        ${isPickup
          ? 'bg-pickup/10 border-pickup/30'
          : 'bg-card border-border'
        }
        ${overlay ? 'shadow-xl ring-2 ring-primary/40 rotate-2 scale-105' : ''}
        ${isDragging ? 'scale-105 shadow-lg ring-2 ring-primary/30' : ''}
      `}
    >
      {indexNumber !== undefined && (
        <div className="absolute -top-1.5 -left-1.5 h-5 w-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center shadow-md ring-2 ring-background">
          {indexNumber}
        </div>
      )}
      <div className="flex items-start gap-2">
        {isPickup ? (
          <Package className="h-3.5 w-3.5 text-pickup mt-0.5 shrink-0" />
        ) : (
          <FileText className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-foreground truncate">{card.clientName}</p>
          <p className="text-[10px] text-muted-foreground truncate">{card.address}</p>
          {card.invoiceNumber && (
            <p className="text-[10px] font-mono text-muted-foreground mt-0.5">#{card.invoiceNumber}</p>
          )}
        </div>
      </div>
    </div>
  );
}

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { Driver } from '@/types/dispatcher';
import { DriverLane } from './DriverLane';

interface Props {
  drivers: Driver[];
  onStartRoute: (driverId: string) => void;
  onEndRoute: (driverId: string) => void;
}

export function OffDutySection({ drivers, onStartRoute, onEndRoute }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border-t border-border mx-3 mb-3">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 w-full py-2 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-0' : '-rotate-90'}`} />
        Off Duty Drivers ({drivers.length})
      </button>
      {open && (
        <div className="flex gap-2 pb-3 overflow-x-auto">
          {drivers.map(driver => (
            <div key={driver.id} className="opacity-50 grayscale">
              <DriverLane driver={driver} onStartRoute={onStartRoute} onEndRoute={onEndRoute} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

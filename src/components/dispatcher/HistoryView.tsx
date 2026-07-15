import { useState, useMemo, useEffect, useCallback } from 'react';
import { Search, Clock, ChevronDown, ChevronRight, User } from 'lucide-react';
import { Input } from '@/components/ui/input';
import type { CompletedPath } from '@/types/dispatcher';
import { format, isToday, isYesterday } from 'date-fns';

interface Props {
  history: CompletedPath[];
}

interface DriverGroup {
  driverName: string;
  driverId: string;
  entries: CompletedPath[];
  totalInvoices: number;
}

interface DateGroup {
  label: string;
  dateKey: string;
  drivers: DriverGroup[];
  totalDeliveries: number;
}

function formatDateLabel(date: Date): string {
  if (isToday(date)) return `Today — ${format(date, 'EEEE, MMMM d')}`;
  if (isYesterday(date)) return `Yesterday — ${format(date, 'EEEE, MMMM d')}`;
  return format(date, 'EEEE, MMMM d, yyyy');
}

function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-yellow-300/80 text-foreground rounded-sm px-0.5">{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  );
}

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export function HistoryView({ history }: Props) {
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const [collapsedDates, setCollapsedDates] = useState<Set<string>>(new Set());
  const [collapsedDrivers, setCollapsedDrivers] = useState<Set<string>>(new Set());

  const isSearching = debouncedSearch.length > 0;
  const q = debouncedSearch.toLowerCase();

  const filtered = useMemo(() => {
    if (!q) return history;
    return history.filter(entry =>
      entry.driverName.toLowerCase().includes(q) ||
      entry.cards.some(c =>
        c.clientName.toLowerCase().includes(q) ||
        c.invoiceNumber?.toLowerCase().includes(q)
      )
    );
  }, [history, q]);

  const groups: DateGroup[] = useMemo(() => {
    const dateMap = new Map<string, CompletedPath[]>();
    for (const entry of filtered) {
      const key = format(entry.endTime, 'yyyy-MM-dd');
      if (!dateMap.has(key)) dateMap.set(key, []);
      dateMap.get(key)!.push(entry);
    }
    return Array.from(dateMap.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([dateKey, entries]) => {
        const driverMap = new Map<string, CompletedPath[]>();
        for (const e of entries) {
          if (!driverMap.has(e.driverId)) driverMap.set(e.driverId, []);
          driverMap.get(e.driverId)!.push(e);
        }
        const drivers: DriverGroup[] = Array.from(driverMap.entries()).map(([driverId, dEntries]) => ({
          driverId,
          driverName: dEntries[0].driverName,
          entries: dEntries,
          totalInvoices: dEntries.reduce((sum, e) => sum + e.cards.length, 0),
        }));
        return {
          dateKey,
          label: formatDateLabel(entries[0].endTime),
          drivers,
          totalDeliveries: entries.length,
        };
      });
  }, [filtered]);

  // When searching, auto-expand everything; when cleared, reset to defaults
  useEffect(() => {
    if (isSearching) {
      setCollapsedDates(new Set());
      setCollapsedDrivers(new Set());
    } else {
      // Reset: collapse all except first (today)
      setCollapsedDates(new Set());
      setCollapsedDrivers(new Set());
    }
  }, [isSearching]);

  const isDateOpen = (dateKey: string, index: number) => {
    if (isSearching) return true;
    if (collapsedDates.has(dateKey)) return false;
    if (collapsedDates.size === 0 && index > 0) return false;
    return true;
  };

  const isDriverOpen = (driverKey: string) => {
    if (isSearching) return true;
    return !collapsedDrivers.has(driverKey);
  };

  const toggleDate = (dateKey: string, index: number) => {
    if (isSearching) return;
    setCollapsedDates(prev => {
      const next = new Set(prev);
      if (prev.size === 0) {
        groups.forEach((g, i) => { if (i > 0) next.add(g.dateKey); });
      }
      if (next.has(dateKey)) next.delete(dateKey);
      else next.add(dateKey);
      return next;
    });
  };

  const toggleDriver = (key: string) => {
    if (isSearching) return;
    setCollapsedDrivers(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const cardMatchesSearch = (card: { clientName: string; invoiceNumber?: string }) => {
    if (!q) return true;
    return card.clientName.toLowerCase().includes(q) || card.invoiceNumber?.toLowerCase().includes(q);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-border">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search by invoice #, client, or driver..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-8 bg-secondary border-border text-foreground text-xs h-8"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto active-scrollbar">
        {groups.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Clock className="h-8 w-8 mb-2 opacity-30" />
            {isSearching ? (
              <p className="text-xs text-center px-4">
                No invoices or customers found for "<span className="font-semibold text-foreground">{debouncedSearch}</span>"
              </p>
            ) : (
              <p className="text-xs">No history yet</p>
            )}
          </div>
        ) : (
          <div className="flex flex-col">
            {groups.map((group, groupIndex) => {
              const dateOpen = isDateOpen(group.dateKey, groupIndex);
              return (
                <div key={group.dateKey}>
                  <button
                    onClick={() => toggleDate(group.dateKey, groupIndex)}
                    className="sticky top-0 z-10 w-full flex items-center justify-between gap-2 px-4 py-2.5 bg-secondary border-b border-border cursor-pointer hover:bg-secondary/80 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      {dateOpen
                        ? <ChevronDown className="h-4 w-4 text-primary" />
                        : <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      }
                      <span className="text-xs font-bold text-foreground">{group.label}</span>
                    </div>
                    <span className="text-[10px] font-semibold text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                      {group.totalDeliveries} {group.totalDeliveries === 1 ? 'Delivery' : 'Deliveries'}
                    </span>
                  </button>

                  {dateOpen && (
                    <div className="flex flex-col">
                      {group.drivers.map((driver) => {
                        const driverKey = `${group.dateKey}-${driver.driverId}`;
                        const driverOpen = isDriverOpen(driverKey);
                        return (
                          <div key={driverKey}>
                            <button
                              onClick={() => toggleDriver(driverKey)}
                              className="w-full flex items-center justify-between gap-2 px-4 py-2 bg-muted/60 border-b border-border/50 cursor-pointer hover:bg-muted/80 transition-colors"
                            >
                              <div className="flex items-center gap-2">
                                {driverOpen
                                  ? <ChevronDown className="h-3.5 w-3.5 text-primary" />
                                  : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                                }
                                <div className="h-6 w-6 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
                                  <User className="h-3 w-3 text-primary" />
                                </div>
                                <span className="text-[11px] font-bold text-foreground uppercase tracking-wide">
                                  {isSearching ? highlightMatch(driver.driverName, debouncedSearch) : driver.driverName}
                                </span>
                              </div>
                              <span className="text-[10px] font-semibold text-muted-foreground">
                                {driver.totalInvoices} {driver.totalInvoices === 1 ? 'Invoice' : 'Invoices'}
                              </span>
                            </button>

                            {driverOpen && (
                              <div className="ml-6 border-l-2 border-primary/30">
                                {driver.entries.map((entry, ei) => {
                                  const visibleCards = entry.cards.filter(card => !isSearching || cardMatchesSearch(card));
                                  if (visibleCards.length === 0) return null;
                                  return (
                                    <div key={entry.id} className={ei > 0 ? 'mt-3 border-t-2 border-border/60' : ''}>
                                      {/* Run Header: Start / End time */}
                                      <div className="flex items-center px-4 py-2 bg-primary/10 border-b border-primary/30">
                                        <span className="text-[10px] font-bold text-foreground uppercase tracking-wide">
                                          Start: {format(entry.startTime, 'HH:mm')} - End: {format(entry.endTime, 'HH:mm')}
                                        </span>
                                      </div>
                                      {/* Run Body: invoice list */}
                                      {visibleCards.map((card, ci) => (
                                        <div
                                          key={`${entry.id}-${card.id}`}
                                          className={`flex items-center justify-between px-4 py-2 border-b border-border/30 ${
                                            ci % 2 === 0 ? 'bg-card' : 'bg-card/70'
                                          }`}
                                        >
                                          <span className="text-[11px] text-foreground truncate flex-1 min-w-0">
                                            {isSearching ? highlightMatch(card.clientName, debouncedSearch) : card.clientName}
                                          </span>
                                          <span className="text-[10px] font-mono text-muted-foreground shrink-0 ml-3">
                                            {isSearching && card.invoiceNumber
                                              ? highlightMatch(card.invoiceNumber, debouncedSearch)
                                              : (card.invoiceNumber || '—')}
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

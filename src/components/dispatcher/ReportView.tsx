import { useState, useEffect, useMemo } from 'react';
import { format, subDays, startOfDay, endOfDay, startOfMonth, endOfMonth, subMonths, eachDayOfInterval } from 'date-fns';
import { Loader2, CalendarIcon, TrendingUp, TrendingDown } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, CartesianGrid } from 'recharts';
import { cn } from '@/lib/utils';

interface CompletedPathRow {
  id: string;
  driver_id: string;
  driver_name: string;
  start_time: string;
  end_time: string;
  cards: any;
  created_at: string;
}

interface DriverOption {
  id: string;
  name: string;
}

export function ReportView() {
  const [loading, setLoading] = useState(true);
  const [allPaths, setAllPaths] = useState<CompletedPathRow[]>([]);
  const [drivers, setDrivers] = useState<DriverOption[]>([]);

  // Custom deep dive state
  const [fromDate, setFromDate] = useState<Date>(subDays(new Date(), 7));
  const [toDate, setToDate] = useState<Date>(new Date());
  const [selectedDriver, setSelectedDriver] = useState<string>('all');

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [pathsRes, driversRes] = await Promise.all([
        supabase.from('completed_paths').select('*').order('created_at', { ascending: false }),
        supabase.from('drivers').select('id, name').eq('is_active', true).order('name'),
      ]);
      setAllPaths(pathsRes.data || []);
      setDrivers((driversRes.data || []).map(d => ({ id: d.id, name: d.name })));
    } catch {
      console.error('Failed to load report data');
    } finally {
      setLoading(false);
    }
  }

  // --- Section 1: Yesterday ---
  const yesterday = useMemo(() => {
    const now = new Date();
    const yStart = startOfDay(subDays(now, 1));
    const yEnd = endOfDay(subDays(now, 1));
    const paths = allPaths.filter(p => {
      const t = new Date(p.end_time);
      return t >= yStart && t <= yEnd;
    });
    const totalInvoices = paths.reduce((sum, p) => sum + (Array.isArray(p.cards) ? p.cards.length : 0), 0);
    const totalHours = paths.reduce((sum, p) => {
      const start = new Date(p.start_time).getTime();
      const end = new Date(p.end_time).getTime();
      return sum + (end - start) / 3600000;
    }, 0);
    return { totalInvoices, totalHours: Math.round(totalHours * 10) / 10, date: yStart };
  }, [allPaths]);

  // --- Section 2: Last Month ---
  const lastMonth = useMemo(() => {
    const now = new Date();
    const prevMonth = subMonths(now, 1);
    const mStart = startOfMonth(prevMonth);
    const mEnd = endOfMonth(prevMonth);
    const paths = allPaths.filter(p => {
      const t = new Date(p.end_time);
      return t >= mStart && t <= mEnd;
    });
    const totalInvoices = paths.reduce((sum, p) => sum + (Array.isArray(p.cards) ? p.cards.length : 0), 0);

    // Previous month for comparison
    const prev2 = subMonths(now, 2);
    const p2Start = startOfMonth(prev2);
    const p2End = endOfMonth(prev2);
    const prevPaths = allPaths.filter(p => {
      const t = new Date(p.end_time);
      return t >= p2Start && t <= p2End;
    });
    const prevInvoices = prevPaths.reduce((sum, p) => sum + (Array.isArray(p.cards) ? p.cards.length : 0), 0);

    const comparison = prevInvoices > 0
      ? Math.round(((totalInvoices - prevInvoices) / prevInvoices) * 100)
      : null;

    return { totalInvoices, comparison, startDate: mStart, endDate: mEnd };
  }, [allPaths]);

  // --- Section 3: Custom Deep Dive ---
  const customData = useMemo(() => {
    const fStart = startOfDay(fromDate);
    const fEnd = endOfDay(toDate);
    let paths = allPaths.filter(p => {
      const t = new Date(p.end_time);
      return t >= fStart && t <= fEnd;
    });
    if (selectedDriver !== 'all') {
      paths = paths.filter(p => p.driver_id === selectedDriver);
    }

    const totalInvoices = paths.reduce((sum, p) => sum + (Array.isArray(p.cards) ? p.cards.length : 0), 0);
    const totalHours = paths.reduce((sum, p) => {
      const start = new Date(p.start_time).getTime();
      const end = new Date(p.end_time).getTime();
      return sum + (end - start) / 3600000;
    }, 0);

    // Chart data: invoices per day
    const days = eachDayOfInterval({ start: fStart, end: fEnd });
    const chartData = days.map(day => {
      const dayStart = startOfDay(day);
      const dayEnd = endOfDay(day);
      const dayPaths = paths.filter(p => {
        const t = new Date(p.end_time);
        return t >= dayStart && t <= dayEnd;
      });
      const count = dayPaths.reduce((s, p) => s + (Array.isArray(p.cards) ? p.cards.length : 0), 0);
      return { date: format(day, 'MMM d'), invoices: count };
    });

    return { totalInvoices, totalHours: Math.round(totalHours * 10) / 10, chartData };
  }, [allPaths, fromDate, toDate, selectedDriver]);

  if (loading) {
    return (
      <div className="flex items-center justify-center flex-1">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const chartConfig = {
    invoices: { label: 'Invoices', color: 'hsl(var(--primary))' },
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-5">
      {/* Section 1: Yesterday */}
      <div>
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
          Yesterday — {format(yesterday.date, 'MMMM d, yyyy')}
        </h2>
        <div className="grid grid-cols-2 gap-3">
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-extrabold text-foreground">{yesterday.totalInvoices}</p>
              <p className="text-[11px] text-muted-foreground mt-1">Total Delivered</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-extrabold text-foreground">{yesterday.totalHours}h</p>
              <p className="text-[11px] text-muted-foreground mt-1">Delivery Hours</p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Section 2: Last Month */}
      <div>
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
          Last Month — {format(lastMonth.startDate, 'MMM d')} – {format(lastMonth.endDate, 'MMM d, yyyy')}
        </h2>
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-3xl font-extrabold text-foreground">{lastMonth.totalInvoices}</p>
              <p className="text-[11px] text-muted-foreground mt-1">Total Invoices Delivered</p>
            </div>
            {lastMonth.comparison !== null && (
              <div className={cn(
                'flex items-center gap-1 text-sm font-bold',
                lastMonth.comparison >= 0 ? 'text-primary' : 'text-destructive'
              )}>
                {lastMonth.comparison >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                {lastMonth.comparison >= 0 ? '+' : ''}{lastMonth.comparison}%
                <span className="text-[10px] font-normal text-muted-foreground ml-1">vs prev</span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Section 3: Custom Deep Dive */}
      <div>
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
          Custom Deep Dive
        </h2>
        <Card>
          <CardContent className="p-4 space-y-4">
            {/* Filters */}
            <div className="flex flex-wrap gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="text-xs gap-1.5">
                    <CalendarIcon className="h-3 w-3" />
                    {format(fromDate, 'MMM d')}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={fromDate} onSelect={d => d && setFromDate(d)} className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
              <span className="text-xs text-muted-foreground self-center">to</span>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="text-xs gap-1.5">
                    <CalendarIcon className="h-3 w-3" />
                    {format(toDate, 'MMM d')}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={toDate} onSelect={d => d && setToDate(d)} className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
              <Select value={selectedDriver} onValueChange={setSelectedDriver}>
                <SelectTrigger className="w-[130px] h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Drivers</SelectItem>
                  {drivers.map(d => (
                    <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Summary */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-md bg-muted/50 p-3 text-center">
                <p className="text-2xl font-extrabold text-foreground">{customData.totalInvoices}</p>
                <p className="text-[10px] text-muted-foreground">Invoices</p>
              </div>
              <div className="rounded-md bg-muted/50 p-3 text-center">
                <p className="text-2xl font-extrabold text-foreground">{customData.totalHours}h</p>
                <p className="text-[10px] text-muted-foreground">Delivery Time</p>
              </div>
            </div>

            {/* Chart */}
            <ChartContainer config={chartConfig} className="aspect-[2/1] w-full">
              <BarChart data={customData.chartData} margin={{ top: 5, right: 5, bottom: 5, left: -10 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} className="text-muted-foreground" />
                <YAxis allowDecimals={false} tick={{ fontSize: 10 }} className="text-muted-foreground" />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="invoices" fill="var(--color-invoices)" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface InvoiceRow {
  id: string;
  type: 'invoice' | 'pickup';
  client_name: string;
  address: string;
  invoice_number: string | null;
  location: 'inbox' | 'active' | 'staging';
  driver_id: string | null;
  sort_order: number;
  lat: number | null;
  lng: number | null;
  created_at: string;
}

/**
 * Single source of truth for invoice_cards. Subscribes to realtime changes
 * so any tab using this hook stays in sync automatically.
 */
export function useInvoices() {
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const { data, error } = await supabase
      .from('invoice_cards')
      .select('*')
      .order('sort_order');
    if (!error && data) setInvoices(data as unknown as InvoiceRow[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
    const channel = supabase
      .channel('invoice_cards_sync')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'invoice_cards' },
        () => refresh(),
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [refresh]);

  return { invoices, loading, refresh };
}

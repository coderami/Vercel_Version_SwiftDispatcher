CREATE TABLE public.routes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.routes TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.routes TO authenticated;
GRANT ALL ON public.routes TO service_role;

ALTER TABLE public.routes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all on routes" ON public.routes FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.invoice_cards
  ADD COLUMN route_id uuid REFERENCES public.routes(id) ON DELETE SET NULL;

CREATE INDEX idx_invoice_cards_route_id ON public.invoice_cards(route_id);
CREATE TABLE public.authorized_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id text NOT NULL UNIQUE,
  name text NOT NULL DEFAULT 'Unnamed Device',
  role text NOT NULL DEFAULT 'dispatcher' CHECK (role IN ('dispatcher','salesperson','driver')),
  is_active boolean NOT NULL DEFAULT true,
  driver_id uuid REFERENCES public.drivers(id) ON DELETE SET NULL,
  user_agent text,
  last_seen timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.authorized_devices TO anon, authenticated;
GRANT ALL ON public.authorized_devices TO service_role;
ALTER TABLE public.authorized_devices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all on authorized_devices" ON public.authorized_devices FOR ALL USING (true) WITH CHECK (true);
ALTER PUBLICATION supabase_realtime ADD TABLE public.authorized_devices;

CREATE TABLE public.driver_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  accuracy double precision,
  recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX driver_locations_driver_recorded_idx ON public.driver_locations(driver_id, recorded_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.driver_locations TO anon, authenticated;
GRANT ALL ON public.driver_locations TO service_role;
ALTER TABLE public.driver_locations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all on driver_locations" ON public.driver_locations FOR ALL USING (true) WITH CHECK (true);
ALTER PUBLICATION supabase_realtime ADD TABLE public.driver_locations;

ALTER TABLE public.invoice_cards
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz,
  ADD COLUMN IF NOT EXISTS delivered_lat double precision,
  ADD COLUMN IF NOT EXISTS delivered_lng double precision;
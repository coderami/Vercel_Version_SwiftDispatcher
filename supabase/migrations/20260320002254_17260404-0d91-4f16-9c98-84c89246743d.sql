-- Create enum for card types
CREATE TYPE public.card_type AS ENUM ('invoice', 'pickup');

-- Create enum for card location
CREATE TYPE public.card_location AS ENUM ('inbox', 'active', 'staging');

-- Create drivers table
CREATE TABLE public.drivers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  avatar TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create invoice_cards table
CREATE TABLE public.invoice_cards (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  type card_type NOT NULL DEFAULT 'invoice',
  client_name TEXT NOT NULL,
  address TEXT NOT NULL,
  invoice_number TEXT,
  location card_location NOT NULL DEFAULT 'inbox',
  driver_id UUID REFERENCES public.drivers(id) ON DELETE SET NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create completed_paths table (history)
CREATE TABLE public.completed_paths (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  driver_id UUID NOT NULL REFERENCES public.drivers(id),
  driver_name TEXT NOT NULL,
  start_time TIMESTAMP WITH TIME ZONE NOT NULL,
  end_time TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  cards JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.completed_paths ENABLE ROW LEVEL SECURITY;

-- Allow all operations (dispatcher console, no per-user auth needed)
CREATE POLICY "Allow all on drivers" ON public.drivers FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on invoice_cards" ON public.invoice_cards FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on completed_paths" ON public.completed_paths FOR ALL USING (true) WITH CHECK (true);

-- Insert default drivers
INSERT INTO public.drivers (name, avatar) VALUES ('Carlos', 'C'), ('Sara', 'S');

-- Add indexes
CREATE INDEX idx_invoice_cards_location ON public.invoice_cards(location);
CREATE INDEX idx_invoice_cards_driver ON public.invoice_cards(driver_id);
CREATE INDEX idx_completed_paths_driver ON public.completed_paths(driver_id);
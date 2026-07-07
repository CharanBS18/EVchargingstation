
-- 1. Add 'operator' to app_role enum (additive, no impact on existing roles)
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'operator';

-- 2. station_operators mapping table
CREATE TABLE IF NOT EXISTS public.station_operators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  station_id UUID NOT NULL REFERENCES public.stations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (station_id, user_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.station_operators TO authenticated;
GRANT ALL ON public.station_operators TO service_role;

ALTER TABLE public.station_operators ENABLE ROW LEVEL SECURITY;

-- Operator can read their own assignments; admins manage all
CREATE POLICY "Operators read own assignments" ON public.station_operators
FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins manage assignments" ON public.station_operators
FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 3. Allow operators to read bookings & chargers for their stations, and update booking status + charger status
CREATE POLICY "Operators read assigned-station bookings" ON public.bookings
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.station_operators so
    WHERE so.user_id = auth.uid() AND so.station_id = bookings.station_id
  )
);

CREATE POLICY "Operators update assigned-station bookings" ON public.bookings
FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.station_operators so
    WHERE so.user_id = auth.uid() AND so.station_id = bookings.station_id
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.station_operators so
    WHERE so.user_id = auth.uid() AND so.station_id = bookings.station_id
  )
);

CREATE POLICY "Operators update assigned-station chargers" ON public.chargers
FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.station_operators so
    WHERE so.user_id = auth.uid() AND so.station_id = chargers.station_id
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.station_operators so
    WHERE so.user_id = auth.uid() AND so.station_id = chargers.station_id
  )
);

-- 4. Enable realtime on chargers (safe if already added)
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chargers;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

ALTER TABLE public.chargers REPLICA IDENTITY FULL;

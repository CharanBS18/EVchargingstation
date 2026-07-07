CREATE OR REPLACE FUNCTION public.check_booking_conflict(_charger_id uuid, _starts_at timestamptz, _ends_at timestamptz)
RETURNS TABLE(starts_at timestamptz, ends_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT b.starts_at, b.ends_at
  FROM public.bookings b
  WHERE b.charger_id = _charger_id
    AND b.status IN ('confirmed','in_progress')
    AND b.starts_at < _ends_at
    AND b.ends_at > _starts_at
  ORDER BY b.starts_at
  LIMIT 1
$$;

GRANT EXECUTE ON FUNCTION public.check_booking_conflict(uuid, timestamptz, timestamptz) TO authenticated;
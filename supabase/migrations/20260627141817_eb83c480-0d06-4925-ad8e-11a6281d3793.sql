INSERT INTO public.station_operators (user_id, station_id)
SELECT ur.user_id, s.id
FROM public.user_roles ur
CROSS JOIN public.stations s
WHERE ur.role = 'operator'
  AND NOT EXISTS (
    SELECT 1
    FROM public.station_operators so
    WHERE so.user_id = ur.user_id
      AND so.station_id = s.id
  );
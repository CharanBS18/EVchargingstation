REVOKE EXECUTE ON FUNCTION public.check_booking_conflict(uuid, timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_booking_conflict(uuid, timestamptz, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;
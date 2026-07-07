
-- Move btree_gist out of public per linter (functions/operators stay usable)
-- (Postgres allows ALTER EXTENSION SET SCHEMA for relocatable extensions.)
CREATE SCHEMA IF NOT EXISTS extensions;
DO $$ BEGIN
  BEGIN
    ALTER EXTENSION btree_gist SET SCHEMA extensions;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
END $$;

-- Revoke direct EXECUTE on security-definer helpers
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_premium(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;

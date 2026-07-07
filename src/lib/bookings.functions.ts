import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const Input = z.object({
  charger_id: z.string().uuid(),
  starts_at: z.string().datetime(),
  ends_at: z.string().datetime(),
});

export const checkBookingConflict = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => Input.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin.rpc("check_booking_conflict", {
      _charger_id: data.charger_id,
      _starts_at: data.starts_at,
      _ends_at: data.ends_at,
    });
    if (error) throw new Error(error.message);
    const conflict = Array.isArray(rows) ? rows[0] : null;
    return conflict
      ? { starts_at: conflict.starts_at as string, ends_at: conflict.ends_at as string }
      : null;
  });

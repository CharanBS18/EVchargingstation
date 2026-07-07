import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { timingSafeEqualString } from "@/lib/crypto-utils";

function getAdminCreds() {
  const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    throw new Error("Admin credentials are not configured. Set ADMIN_EMAIL and ADMIN_PASSWORD environment variables.");
  }
  return { ADMIN_EMAIL, ADMIN_PASSWORD };
}


/** Grants admin role to the special admin email on demand. Idempotent. */
export const ensureAdminAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { ADMIN_EMAIL } = getAdminCreds();
    const email = (context.claims as any)?.email as string | undefined;
    const isSpecialAdmin = email?.toLowerCase() === ADMIN_EMAIL;

    // Check existing role
    const { data: existing } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();

    if (existing) return { isAdmin: true };

    if (!isSpecialAdmin) return { isAdmin: false };

    // Grant admin via service role
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: context.userId, role: "admin" })
      .select()
      .maybeSingle();

    return { isAdmin: true };
  });

/** Verifies the admin-entered secret key matches the configured ADMIN_SECRET_KEY. */
export const verifyAdminSecretKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ secret: z.string().min(1) }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: role } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!role) throw new Error("Forbidden");

    const expected = process.env.ADMIN_SECRET_KEY;
    if (!expected) throw new Error("Admin secret key not configured");

    if (!timingSafeEqualString(data.secret, expected)) {
      throw new Error("Invalid admin secret key");
    }
    return { ok: true };
  });

/** One-shot: creates the designated admin auth user if missing. Idempotent and locked to the special admin email/password. */
export const bootstrapAdminAccount = createServerFn({ method: "POST" }).handler(async () => {
  const { ADMIN_EMAIL, ADMIN_PASSWORD } = getAdminCreds();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  // Check if user already exists
  const { data: list } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
  const existing = list?.users?.find((u) => u.email?.toLowerCase() === ADMIN_EMAIL);
  if (existing) {
    const { error } = await supabaseAdmin.auth.admin.updateUserById(existing.id, {
      password: ADMIN_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: "Admin" },
    });
    if (error) throw new Error(error.message);
    return { created: false, updated: true, userId: existing.id };
  }

  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: "Admin" },
  });
  if (error) throw new Error(error.message);
  return { created: true, userId: data.user?.id };
});

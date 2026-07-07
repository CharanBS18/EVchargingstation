// Local replacement for @lovable.dev/cloud-auth-js.
// Delegates OAuth directly to Supabase so the app runs without any Lovable-hosted broker.
import { supabase } from "../supabase/client";

type SignInOptions = {
  redirect_uri?: string;
  extraParams?: Record<string, string>;
};

type SupportedProvider = "google" | "apple" | "microsoft" | "lovable";

export const lovable = {
  auth: {
    signInWithOAuth: async (provider: SupportedProvider, opts?: SignInOptions) => {
      // "lovable" is not a real Supabase provider; map to google as a safe default.
      const supaProvider = (provider === "lovable" ? "google" : provider) as
        | "google"
        | "apple"
        | "azure";
      const mapped = provider === "microsoft" ? "azure" : supaProvider;
      const redirectTo =
        opts?.redirect_uri ??
        (typeof window !== "undefined" ? window.location.origin : undefined);
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: mapped,
        options: { redirectTo, queryParams: opts?.extraParams },
      });
      if (error) return { error };
      return { redirected: true, url: data?.url };
    },
  },
};

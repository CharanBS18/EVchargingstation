import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import evLogo from "@/assets/ev-logo.png.asset.json";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { bootstrapAdminAccount } from "@/lib/admin.functions";


const ADMIN_EMAIL = "charanasadmin@gmail.com";

async function destinationForUser(userId: string): Promise<"/dashboard" | "/operator" | "/admin"> {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const roles = (data ?? []).map((r: any) => r.role);
  if (roles.includes("admin")) return "/admin";
  if (roles.includes("operator")) return "/operator";
  return "/dashboard";
}

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — EV ChargeHub" },
      { name: "description", content: "Sign in or create your EV ChargeHub account to reserve EV charging slots across India." },
      { property: "og:title", content: "Sign in — EV ChargeHub" },
      { property: "og:description", content: "Sign in or create an account to book EV charging across India." },
      { property: "og:type", content: "website" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [signupRole, setSignupRole] = useState<"user" | "operator">("user");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) return;
      const dest = await destinationForUser(data.session.user.id);
      navigate({ to: dest });
    });
  }, [navigate]);

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    let { error, data } = await supabase.auth.signInWithPassword({ email, password });
    if (error && email.toLowerCase() === ADMIN_EMAIL) {
      try {
        await bootstrapAdminAccount();
        const retry = await supabase.auth.signInWithPassword({ email, password });
        error = retry.error;
        data = retry.data;
      } catch (e: any) {
        // fall through with original error
      }
    }
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Welcome back");
    const dest = data?.user ? await destinationForUser(data.user.id) : "/dashboard";
    navigate({ to: dest });
  }


  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/dashboard`,
        data: { full_name: name, phone, requested_role: signupRole },
      },
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    if (signupRole === "operator") {
      toast.success("Account created. Your operator request is pending admin approval.");
    } else {
      toast.success("Account created. Check your email if confirmation is required.");
    }
    navigate({ to: "/dashboard" });
  }


  return (
    <div className="relative grid min-h-screen place-items-center px-4 aurora-bg">
      <div className="absolute inset-0 -z-10 gradient-grid opacity-50" />
      <div className="w-full max-w-md animate-fade-in">
        <Link to="/" className="mb-6 flex items-center justify-center gap-3">
          <motion.span
            initial={{ scale: 0.5, opacity: 0, rotate: -12 }}
            animate={{ scale: 1, opacity: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 200, damping: 14 }}
            className="grid h-12 w-12 place-items-center rounded-2xl bg-primary p-2 shadow-[0_12px_30px_-10px_oklch(0.58_0.22_295_/_0.6)]"
          >
            <img src={evLogo.url} alt="" className="h-full w-full object-contain invert" />
          </motion.span>
          <span className="font-display text-xl font-semibold tracking-tight">EV ChargeHub</span>
        </Link>
        <h1 className="mb-4 text-center font-display text-2xl font-semibold text-foreground">Sign in to EV ChargeHub</h1>
        <div className="rounded-2xl border border-border/60 bg-card/80 shadow-sm backdrop-blur">
          <div className="glass rounded-2xl p-6">
            <Tabs defaultValue="signin">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="signin">Sign in</TabsTrigger>
                <TabsTrigger value="signup">Create account</TabsTrigger>
              </TabsList>

              <TabsContent value="signin" className="mt-6">
                <div className="flex justify-center">
                  <div className="cobra-card">
                    <p className="cobra-title">Sign In</p>
                    <form className="cobra-form" onSubmit={handleSignIn}>
                      <input
                        className="cobra-input"
                        type="email"
                        placeholder="Email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                      />
                      <input
                        className="cobra-input"
                        type="password"
                        placeholder="Password"
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                      />
                      <span className="cobra-link">Forgot Password ?</span>
                      <button type="submit" className="cobra-btn" disabled={busy}>
                        {busy ? "Signing in…" : "Sign In"}
                      </button>
                    </form>
                    <div className="cobra-foot">
                      <small>Don&apos;t have an account?</small>
                      <a onClick={() => (document.querySelector('[value="signup"]') as HTMLElement)?.click()}>Sign up</a>
                    </div>
                  </div>
                </div>
              </TabsContent>



              <TabsContent value="signup" className="mt-6">
                <form onSubmit={handleSignUp} className="space-y-4">
                  <div className="space-y-2">
                    <Label>I want to sign up as</Label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setSignupRole("user")}
                        className={`rounded-lg border px-3 py-2 text-sm transition ${signupRole === "user" ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground"}`}
                      >
                        EV Driver
                      </button>
                      <button
                        type="button"
                        onClick={() => setSignupRole("operator")}
                        className={`rounded-lg border px-3 py-2 text-sm transition ${signupRole === "operator" ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground"}`}
                      >
                        Station Operator
                      </button>
                    </div>
                    {signupRole === "operator" && (
                      <p className="text-xs text-muted-foreground">Operator accounts require admin approval before access is granted.</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="name">Full name</Label>
                    <Input id="name" required value={name} onChange={(e) => setName(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone">Phone</Label>
                    <Input id="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email2">Email</Label>
                    <Input id="email2" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password2">Password</Label>
                    <Input id="password2" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
                  </div>
            <Button type="submit" className="w-full glow-primary shine" disabled={busy}>{busy ? "Creating…" : "Create account"}</Button>
          </form>
        </TabsContent>
      </Tabs>

      <p className="mt-6 text-center text-xs text-muted-foreground">
        By continuing, you agree to our Terms and Privacy Policy.
      </p>
          </div>
        </div>
      </div>
    </div>
  );
}

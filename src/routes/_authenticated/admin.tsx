import { createFileRoute, Outlet, Link, redirect, useRouterState } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { ensureAdminAccess, verifyAdminSecretKey, bootstrapAdminAccount } from "@/lib/admin.functions";
import { isNativeApp } from "@/lib/platform";
import { Users, MapPin, CreditCard, Calendar, MessageCircle, BarChart3, ArrowLeft, ShieldCheck, LifeBuoy } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

const ADMIN_NAV = [
  { to: "/admin", label: "Overview", icon: BarChart3, exact: true },
  { to: "/admin/users", label: "Users", icon: Users },
  { to: "/admin/operators", label: "Operators", icon: ShieldCheck },
  { to: "/admin/stations", label: "Stations", icon: MapPin },
  { to: "/admin/bookings", label: "Bookings", icon: Calendar },
  { to: "/admin/payments", label: "Payments", icon: CreditCard },
  { to: "/admin/chatbot", label: "Chatbot", icon: MessageCircle },
  { to: "/admin/helpline", label: "Helpline", icon: LifeBuoy },
];


const WEBHOOK_SESSION_KEY = "admin_secret_verified";

export const Route = createFileRoute("/_authenticated/admin")({
  ssr: false,
  beforeLoad: async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) throw redirect({ to: "/auth" });
    // Admin dashboard is web-only; redirect away inside the native app
    if (isNativeApp()) throw redirect({ to: "/dashboard" });
    // Auto-grant admin role to the designated admin email; returns isAdmin
    let isAdmin = false;
    try {
      const res = await ensureAdminAccess();
      isAdmin = res.isAdmin;
    } catch {
      isAdmin = false;
    }
    if (!isAdmin) throw redirect({ to: "/dashboard" });
  },
  component: AdminLayout,
});

function AdminLayout() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [verified, setVerified] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return sessionStorage.getItem(WEBHOOK_SESSION_KEY) === "1";
  });

  if (!verified) {
    return <WebhookGate onVerified={() => {
      sessionStorage.setItem(WEBHOOK_SESSION_KEY, "1");
      setVerified(true);
    }} />;
  }

  return (
    <div className="min-h-[calc(100vh-57px)]">
      <div className="border-b border-border bg-card/40">
        <div className="mx-auto flex max-w-7xl items-center gap-2 overflow-x-auto px-4 py-3 md:px-8">
          <Link to="/dashboard" className="mr-2 inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="mr-1 h-4 w-4" /> App
          </Link>
          {ADMIN_NAV.map((n) => {
            const Icon = n.icon;
            const active = n.exact ? path === n.to : path.startsWith(n.to);
            return (
              <Link key={n.to} to={n.to}
                className={"inline-flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm transition-colors " +
                  (active ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-secondary hover:text-foreground")}>
                <Icon className="h-4 w-4" /> {n.label}
              </Link>
            );
          })}
        </div>
      </div>
      <Outlet />
    </div>
  );
}

function WebhookGate({ onVerified }: { onVerified: () => void }) {
  const verify = useServerFn(verifyAdminSecretKey);
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await verify({ data: { secret } });
      toast.success("Verified — welcome, admin");
      onVerified();
    } catch (err: any) {
      toast.error(err?.message || "Invalid admin secret key");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-[calc(100vh-57px)] place-items-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <CardTitle>Admin verification</CardTitle>
          </div>
          <p className="text-sm text-muted-foreground">
            Enter the admin secret key to unlock the admin dashboard for this session.
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="secret">Admin secret key</Label>
              <Input id="secret" type="password" value={secret} onChange={(e) => setSecret(e.target.value)} required autoFocus />
            </div>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "Verifying…" : "Unlock admin"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

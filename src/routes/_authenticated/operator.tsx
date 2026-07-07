import { createFileRoute, Outlet, Link, redirect, useRouterState, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Zap, QrCode, LayoutDashboard, LogOut } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/operator")({
  ssr: false,
  beforeLoad: async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) throw redirect({ to: "/operator/login" });
    const { data: isOperator } = await supabase.rpc("has_role", { _user_id: u.user.id, _role: "operator" });
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: u.user.id, _role: "admin" });
    if (!isOperator && !isAdmin) {
      throw redirect({ to: "/operator/login" });
    }
  },
  component: OperatorLayout,
});

const NAV = [
  { to: "/operator", label: "Live status", icon: LayoutDashboard, exact: true },
  { to: "/operator/scan", label: "Scan QR", icon: QrCode },
];

function OperatorLayout() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();

  async function signOut() {
    await supabase.auth.signOut();
    toast.success("Signed out");
    navigate({ to: "/operator/login" });
  }

  return (
    <div className="min-h-[calc(100vh-57px)]">
      <div className="border-b border-border bg-card/40">
        <div className="mx-auto flex max-w-6xl items-center gap-2 overflow-x-auto px-4 py-3 md:px-8">
          <div className="mr-3 inline-flex items-center gap-2 font-display font-semibold">
            <Zap className="h-4 w-4 text-primary" /> Operator
          </div>
          {NAV.map((n) => {
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
          <div className="ml-auto">
            <Button variant="ghost" size="sm" onClick={signOut}><LogOut className="mr-1 h-4 w-4" /> Sign out</Button>
          </div>
        </div>
      </div>
      <Outlet />
    </div>
  );
}

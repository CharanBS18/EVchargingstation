import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import {
  LayoutDashboard, Map, Calendar, Car, CreditCard, User,
  Shield, LogOut, Menu, Bell, LifeBuoy,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import { isNativeApp } from "@/lib/platform";
import { Chatbot } from "@/components/Chatbot";
import evLogo from "@/assets/ev-logo.png.asset.json";

const FULL_NAV = [
  { to: "/dashboard", label: "Home", icon: LayoutDashboard },
  { to: "/map", label: "Find Stations", icon: Map },
  { to: "/bookings", label: "Bookings", icon: Calendar },
  { to: "/vehicles", label: "Vehicles", icon: Car },
  { to: "/subscription", label: "Subscription", icon: CreditCard },
  { to: "/profile", label: "Profile", icon: User },
] as const;

const OPERATOR_NAV = [
  { to: "/operator", label: "Console", icon: Shield },
  { to: "/helpline", label: "Helpline", icon: LifeBuoy },
  { to: "/profile", label: "Profile", icon: User },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const location = useRouterState({ select: (s) => s.location.pathname });
  const [isAdmin, setIsAdmin] = useState(false);
  const [isOperator, setIsOperator] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const native = isNativeApp();

  useEffect(() => {
    (async () => {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) return;
      setSignedIn(true);
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.user.id);
      const roles = (data ?? []).map((r: any) => r.role);
      setIsAdmin(roles.includes("admin"));
      setIsOperator(roles.includes("operator"));
    })();
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const NAV = isOperator && !isAdmin ? OPERATOR_NAV : FULL_NAV;
  const isAdminRoute = location.startsWith("/admin");

  const SidebarBody = (
    <div className="flex h-full flex-col">
      <Link to="/dashboard" className="flex items-center gap-2 px-6 py-5">
        <span className="grid h-10 w-10 place-items-center rounded-2xl bg-primary p-1.5">
          <img src={evLogo.url} alt="EV ChargeHub" className="h-full w-full object-contain invert" />
        </span>
        <span className="font-display text-lg font-semibold">EV ChargeHub</span>
      </Link>
      <nav className="flex-1 space-y-1 px-3">
        {NAV.map((item) => {
          const Icon = item.icon;
          const active = location.startsWith(item.to);
          return (
            <Link
              key={item.to}
              to={item.to}
              className={
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors " +
                (active
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground")
              }
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
        {isAdmin && !native && (
          <Link to="/admin" className="mt-4 flex items-center gap-3 rounded-lg border border-accent/30 px-3 py-2 text-sm text-accent transition-colors hover:bg-accent/10">
            <Shield className="h-4 w-4" /> Admin
          </Link>
        )}
        {isOperator && (
          <Link to="/operator" className="mt-2 flex items-center gap-3 rounded-lg border border-primary/30 px-3 py-2 text-sm text-primary transition-colors hover:bg-primary/10">
            <Shield className="h-4 w-4" /> Operator console
          </Link>
        )}
      </nav>
      {signedIn && (
        <div className="border-t border-border p-3">
          <Button variant="ghost" className="w-full justify-start" onClick={signOut}>
            <LogOut className="mr-2 h-4 w-4" /> Sign out
          </Button>
        </div>
      )}
    </div>
  );

  // Admin keeps sidebar layout
  if (isAdminRoute) {
    return (
      <div className="flex min-h-screen bg-background">
        <aside className="hidden w-64 shrink-0 border-r border-border bg-sidebar md:flex md:flex-col">
          {SidebarBody}
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center justify-between border-b border-border bg-background/80 px-4 py-3 backdrop-blur md:px-8">
            <div className="md:hidden">
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label="Open navigation menu"><Menu className="h-5 w-5" /></Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-72 p-0">{SidebarBody}</SheetContent>
              </Sheet>
            </div>
            <div className="md:hidden">
              <Link to="/dashboard" className="font-display text-base font-semibold">EV ChargeHub</Link>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <Button variant="ghost" size="icon" aria-label="View notifications"><Bell className="h-5 w-5" /></Button>
            </div>
          </header>
          <main className="flex-1">{children}</main>
        </div>
        <Chatbot />
      </div>
    );
  }

  // Website layout for all other routes
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center gap-4 px-4 md:px-8">
          <Link to="/dashboard" className="flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-2xl bg-primary p-1.5 shadow-sm">
              <img src={evLogo.url} alt="" className="h-full w-full object-contain invert" />
            </span>
            <span className="font-display text-lg font-semibold tracking-tight">EV ChargeHub</span>
          </Link>

          <nav aria-label="Primary" className="ml-6 hidden items-center gap-1 lg:flex">
            {NAV.map((item) => {
              const Icon = item.icon;
              const active = item.to === "/dashboard"
                ? location === "/dashboard"
                : location.startsWith(item.to);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={
                    "flex items-center gap-2 rounded-full px-3 py-2 text-sm font-medium transition-colors " +
                    (active
                      ? "bg-primary/15 text-primary"
                      : "text-muted-foreground hover:bg-secondary hover:text-foreground")
                  }
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            {isAdmin && !native && (
              <Link
                to="/admin"
                className="hidden items-center gap-1.5 rounded-full border border-accent/30 px-3 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent/10 md:inline-flex"
              >
                <Shield className="h-3.5 w-3.5" /> Admin
              </Link>
            )}
            <Button variant="ghost" size="icon" aria-label="Notifications" className="rounded-full">
              <Bell className="h-5 w-5" />
            </Button>
            {signedIn ? (
              <Button variant="ghost" size="sm" onClick={signOut} className="hidden md:inline-flex">
                <LogOut className="mr-2 h-4 w-4" /> Sign out
              </Button>
            ) : (
              <Button asChild size="sm" className="hidden md:inline-flex">
                <Link to="/auth">Sign in</Link>
              </Button>
            )}
            <div className="lg:hidden">
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label="Open menu" className="rounded-full">
                    <Menu className="h-5 w-5" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-72 p-0">{SidebarBody}</SheetContent>
              </Sheet>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <div className="mx-auto w-full max-w-7xl px-4 py-6 md:px-8 md:py-10">
          {children}
        </div>
      </main>

      <footer className="border-t border-border/60 bg-background">
        <div className="mx-auto flex w-full max-w-7xl flex-col items-start justify-between gap-4 px-4 py-8 md:flex-row md:items-center md:px-8">
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-xl bg-primary p-1.5">
              <img src={evLogo.url} alt="" className="h-full w-full object-contain invert" />
            </span>
            <span className="font-display text-sm font-semibold">EV ChargeHub</span>
            <span className="ml-2 text-xs text-muted-foreground">© {new Date().getFullYear()}</span>
          </div>
          <nav aria-label="Footer" className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
            <Link to="/map" className="hover:text-foreground">Find Stations</Link>
            <Link to="/subscription" className="hover:text-foreground">Subscription</Link>
            <Link to="/helpline" className="hover:text-foreground">Helpline</Link>
            <Link to="/profile" className="hover:text-foreground">Account</Link>
          </nav>
        </div>
      </footer>

      <Chatbot />
    </div>
  );
}

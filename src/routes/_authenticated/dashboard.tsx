import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Zap, Calendar, Car, CreditCard, Star, MapPin, Navigation, Trash2, Search, BatteryCharging } from "lucide-react";
import { inr } from "@/lib/geo";
import { Skeleton } from "@/components/ui/skeleton";
import evLogo from "@/assets/ev-logo.png.asset.json";


function MiniQr({ value }: { value: string }) {
  const [src, setSrc] = useState<string>("");
  useEffect(() => {
    import("qrcode").then(({ default: QRCode }) =>
      QRCode.toDataURL(value, { width: 160, margin: 1, color: { dark: "#000000", light: "#ffffff" } })
    ).then(setSrc).catch(() => setSrc(""));
  }, [value]);
  if (!src) return <div className="h-16 w-16 animate-pulse rounded bg-muted" />;
  return <img src={src} alt={`QR ${value}`} className="h-16 w-16 shrink-0 rounded bg-white p-1" title={value} />;
}

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — EV ChargeHub" },
      { name: "description", content: "Your EV ChargeHub dashboard: upcoming bookings, active subscription, and saved vehicles at a glance." },
      { name: "robots", content: "noindex,follow" },
      { property: "og:title", content: "Dashboard — EV ChargeHub" },
      { property: "og:description", content: "Your bookings, subscription, and vehicles at a glance." },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const qc = useQueryClient();
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1_000);
    return () => clearInterval(id);
  }, []);
  const { data: me, isLoading } = useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error("no user");
      const [{ data: profile }, { data: sub }, { data: bookings }, { data: vehicles }, { data: favorites }] =
        await Promise.all([
          supabase.from("profiles").select("*").eq("id", user.user.id).maybeSingle(),
          supabase.from("subscriptions").select("*, plans(*)").eq("user_id", user.user.id).eq("status","active").gt("expires_at", new Date().toISOString()).maybeSingle(),
          supabase.from("bookings").select("*, stations(name, city, address, lat, lng), chargers(label, power_kw)").eq("user_id", user.user.id).eq("hidden_from_recent", false).order("starts_at",{ascending:false}).limit(5),
          supabase.from("vehicles").select("*").eq("user_id", user.user.id),
          supabase.from("favorites").select("station_id, stations(*)").eq("user_id", user.user.id).limit(4),
        ]);
      return { user: user.user, profile, sub, bookings: bookings ?? [], vehicles: vehicles ?? [], favorites: favorites ?? [] };
    },
  });

  const next = me?.bookings.find((b: any) => b.status === "confirmed" && new Date(b.starts_at) > new Date());

  const hide = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("bookings").update({ hidden_from_recent: true }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["me"] }); toast.success("Removed from recent"); },
    onError: (e: any) => toast.error(e.message ?? "Failed to remove"),
  });

  if (isLoading) return (
    <div className="relative mx-auto max-w-7xl space-y-6 p-4 md:p-8">
      <div className="space-y-3">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-48" />
      </div>
      <div className="grid gap-4 md:grid-cols-4">
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <Skeleton className="h-80 lg:col-span-2" />
        <Skeleton className="h-80" />
      </div>
    </div>
  );

  const firstName = me?.profile?.full_name?.split(" ")[0] ?? "there";
  const today = new Date();
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() + i - 3);
    return d;
  });
  const tints = ["bg-[var(--tint-peach)]", "bg-[var(--tint-sky)]", "bg-[var(--tint-pink)]", "bg-[var(--tint-mint)]"];

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5 p-4 sm:p-6">
      {/* Greeting */}
      <div className="flex items-center justify-between gap-3 animate-fade-in">
        <div className="neumorph-sm grid h-11 w-11 shrink-0 place-items-center text-primary font-semibold">
          {firstName.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1 text-center">
          <p className="truncate font-display text-base font-semibold leading-tight">Hello, {firstName}</p>
          <p className="text-xs text-muted-foreground">{today.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}</p>
        </div>
        <Link to="/map" aria-label="Search" className="neumorph-sm neumorph-pressable grid h-11 w-11 shrink-0 place-items-center text-foreground">
          <Search className="h-4 w-4" />
        </Link>
      </div>

      {/* Bento grid */}
      <div className="grid grid-cols-3 gap-3 animate-fade-in">
        {/* Hero tile — spans 2 cols, 2 rows */}
        <Link
          to="/map"
          className="neumorph relative col-span-2 row-span-2 block overflow-hidden p-5 text-foreground"
          style={{ background: "var(--hero-violet)" }}
        >
          <div className="relative z-10 max-w-[70%]">
            <h2 className="font-display text-[26px] font-extrabold leading-[1.05] tracking-tight">
              Charge<br/>nearby
            </h2>
            <p className="mt-2 text-[12px] font-medium text-foreground/80">A station in under 60s</p>
            <span className="mt-3 inline-flex items-center gap-1 rounded-full bg-[var(--ink-pill)] px-3 py-1.5 text-[11px] font-semibold text-white">
              <MapPin className="h-3 w-3" /> Open map
            </span>
          </div>
          <img
            src={evLogo.url}
            alt=""
            className="pointer-events-none absolute -right-3 -bottom-3 h-32 w-32 object-contain opacity-90"
            style={{ filter: "drop-shadow(0 8px 16px rgba(0,0,0,0.15))" }}
          />
          <span className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-[var(--tint-peach)] opacity-60" />
        </Link>

        {/* Subscription tile */}
        <Link to="/subscription" className="neumorph-sm flex flex-col justify-between p-3" style={{ background: "var(--tint-sky)" }}>
          <CreditCard className="h-5 w-5 text-foreground/70" />
          <div>
            <p className="text-[10px] uppercase tracking-wide text-foreground/60">Plan</p>
            <p className="truncate font-display text-sm font-bold">{me?.sub ? (me.sub as any).plans.name : "Free"}</p>
          </div>
        </Link>

        {/* Bookings count */}
        <Link to="/bookings" className="neumorph-sm flex flex-col justify-between p-3" style={{ background: "var(--tint-peach)" }}>
          <Calendar className="h-5 w-5 text-foreground/70" />
          <div>
            <p className="text-[10px] uppercase tracking-wide text-foreground/60">Bookings</p>
            <p className="font-display text-lg font-extrabold leading-none">{me?.bookings.length ?? 0}</p>
          </div>
        </Link>

        {/* Vehicles */}
        <Link to="/vehicles" className="neumorph-sm flex items-center gap-2 p-3" style={{ background: "var(--tint-pink)" }}>
          <Car className="h-5 w-5 text-foreground/70" />
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-wide text-foreground/60">Cars</p>
            <p className="font-display text-base font-extrabold leading-none">{me?.vehicles.length ?? 0}</p>
          </div>
        </Link>

        {/* Favorites */}
        <Link to="/map" className="neumorph-sm flex items-center gap-2 p-3" style={{ background: "var(--tint-mint)" }}>
          <Star className="h-5 w-5 text-foreground/70" />
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-wide text-foreground/60">Saved</p>
            <p className="font-display text-base font-extrabold leading-none">{me?.favorites.length ?? 0}</p>
          </div>
        </Link>

        {/* Quick action */}
        <Link to="/helpline" className="neumorph-sm flex items-center gap-2 p-3">
          <Zap className="h-5 w-5 text-primary" />
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-wide text-foreground/60">Help</p>
            <p className="font-display text-xs font-bold">SOS</p>
          </div>
        </Link>
      </div>

      {/* Day pills */}
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 pt-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {days.map((d) => {
          const isToday = d.toDateString() === today.toDateString();
          return (
            <div
              key={d.toISOString()}
              className={
                "flex h-16 w-12 shrink-0 flex-col items-center justify-center rounded-full text-[11px] transition-all " +
                (isToday
                  ? "bg-[var(--ink-pill)] text-white shadow-md"
                  : "neumorph-sm text-foreground")
              }
            >
              <span className="opacity-70">{d.toLocaleDateString("en-IN", { weekday: "short" }).slice(0,3)}</span>
              <span className="text-sm font-bold">{d.getDate()}</span>
            </div>
          );
        })}
      </div>


      {/* Recent bookings header */}
      <div className="flex items-end justify-between pt-1">
        <h3 className="font-display text-xl font-bold">Recent bookings</h3>
        {next && (
          <span className="text-[11px] font-medium text-muted-foreground">
            Next · {new Date(next.starts_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
          </span>
        )}
      </div>

      {/* Bookings */}
      {(me?.bookings.length ?? 0) === 0 ? (
        <EmptyState
          title="No bookings yet"
          body={me?.sub ? "Reserve your first slot from the map." : "Subscribe to Premium to start booking slots."}
          cta={me?.sub
            ? { to: "/map", label: "Find a charger" }
            : { to: "/subscription", label: "Go Premium" }}
        />
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {me?.bookings.slice(0, 4).map((b: any, idx: number) => {
            const station = b.stations;
            const now = Date.now();
            const starts = new Date(b.starts_at).getTime();
            const ends = new Date(b.ends_at).getTime();
            let badgeLabel: string = b.status;
            let badgeVariant: "default" | "secondary" | "destructive" = "default";
            if (b.status === "cancelled") badgeVariant = "destructive";
            else if (now >= ends) { badgeLabel = "expired"; badgeVariant = "secondary"; }
            else if (now >= starts) { badgeLabel = "charging"; }
            else if (b.status === "completed") badgeVariant = "secondary";
            const durationMin = Math.max(0, Math.round((ends - starts) / 60000));
            const navUrl = station?.lat && station?.lng
              ? `https://www.google.com/maps/dir/?api=1&destination=${station.lat},${station.lng}&travelmode=driving&dir_action=navigate`
              : null;
            return (
              <div key={b.id} className={"neumorph-sm relative flex min-h-[160px] flex-col justify-between p-4 " + tints[idx % tints.length]}>
                <div>
                  <span className="inline-flex rounded-full bg-white/70 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-foreground/80">
                    {badgeLabel}
                  </span>
                  <p className="mt-2 line-clamp-2 font-display text-[15px] font-bold leading-tight">{station?.name}</p>
                  <p className="mt-1 text-[11px] text-foreground/70">
                    {new Date(b.starts_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                    <br />
                    {new Date(b.starts_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })} · {durationMin}m
                  </p>
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-foreground/70">
                    <BatteryCharging className="h-3 w-3" /> {b.chargers?.power_kw ?? "—"}kW
                  </span>
                  <div className="flex items-center gap-1">
                    {navUrl && (
                      <a href={navUrl} target="_blank" rel="noopener noreferrer" aria-label="Navigate"
                         className="grid h-7 w-7 place-items-center rounded-full bg-[var(--ink-pill)] text-white">
                        <Navigation className="h-3 w-3" />
                      </a>
                    )}
                    {(b.status === "cancelled" || now >= ends) && (
                      <button onClick={() => hide.mutate(b.id)} disabled={hide.isPending} aria-label="Remove"
                        className="grid h-7 w-7 place-items-center rounded-full bg-white/70 text-foreground/70">
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </div>
                <Badge variant={badgeVariant} className="sr-only">{badgeLabel}</Badge>
              </div>
            );
          })}
        </div>
      )}

      {/* Favorites */}
      {(me?.favorites.length ?? 0) > 0 && (
        <div className="space-y-2 pt-1">
          <h3 className="font-display text-xl font-bold">Favorite stations</h3>
          <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {me?.favorites.map((f: any) => (
              <Link key={f.station_id} to="/stations/$stationId" params={{ stationId: f.station_id }}
                className="neumorph-sm min-w-[160px] shrink-0 p-3">
                <p className="truncate text-sm font-semibold">{f.stations.name}</p>
                <p className="truncate text-xs text-muted-foreground">{f.stations.city}</p>
              </Link>
            ))}

          </div>
        </div>
      )}
    </div>
  );
}

function MiniKpi({ icon: Icon, label, tint }: { icon: any; label: string; tint: string }) {
  return (
    <div className={"neumorph-sm flex flex-col items-center justify-center gap-1 py-3 " + tint}>
      <Icon className="h-4 w-4 text-foreground/70" />
      <span className="truncate text-[11px] font-bold">{label}</span>
    </div>
  );
}



function KpiCard({ icon: Icon, label, value, sub, accent }: { icon: any; label: string; value: string; sub?: string; accent?: "primary" | "muted" }) {
  return (
    <Card className="card-lift overflow-hidden border-border/70 bg-card/70 backdrop-blur">
      <CardContent className="relative pt-6">
        {accent === "primary" && (
          <span className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-primary/20 blur-2xl" />
        )}
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">{label}</p>
          <span className={"grid h-8 w-8 place-items-center rounded-lg " + (accent === "primary" ? "bg-primary/15 text-primary" : "bg-secondary text-muted-foreground")}>
            <Icon className="h-4 w-4" />
          </span>
        </div>
        <p className={"mt-2 font-display text-2xl font-semibold " + (accent === "primary" ? "text-gradient-primary" : "")}>{value}</p>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function EmptyState({ title, body, cta }: { title: string; body: string; cta: { to: string; label: string } }) {
  return (
    <div className="rounded-xl border border-dashed border-border p-8 text-center">
      <Zap className="mx-auto h-8 w-8 text-muted-foreground" />
      <p className="mt-2 font-medium">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{body}</p>
      <Button asChild className="mt-4"><Link to={cta.to as any}>{cta.label}</Link></Button>
    </div>
  );
}

function formatHMS(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

export { inr };

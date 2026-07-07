import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Zap, QrCode, Radio } from "lucide-react";

export const Route = createFileRoute("/_authenticated/operator/")({
  head: () => ({ meta: [{ title: "Live Status — Operator" }] }),
  component: OperatorHome,
});

type ChargerRow = {
  id: string;
  label: string;
  connector: string;
  power_kw: number;
  status: string;
  station_id: string;
};

function statusColor(s: string) {
  switch (s) {
    case "available": return "bg-emerald-500/15 text-emerald-500 border-emerald-500/30";
    case "occupied": return "bg-amber-500/15 text-amber-500 border-amber-500/30";
    case "maintenance": return "bg-blue-500/15 text-blue-500 border-blue-500/30";
    case "offline": return "bg-zinc-500/15 text-zinc-400 border-zinc-500/30";
    default: return "bg-secondary text-foreground";
  }
}

function OperatorHome() {
  const qc = useQueryClient();

  const { data: assignments = [] } = useQuery({
    queryKey: ["operator-stations"],
    queryFn: async () => {
      const { data } = await supabase
        .from("station_operators")
        .select("station_id, stations(id, name, city, address)")
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const stationIds = assignments.map((a: any) => a.station_id);

  const { data: chargers = [], isLoading } = useQuery({
    queryKey: ["operator-chargers", stationIds.join(",")],
    enabled: stationIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("chargers")
        .select("id, label, connector, power_kw, status, station_id")
        .in("station_id", stationIds)
        .order("label");
      return (data ?? []) as ChargerRow[];
    },
  });

  // Realtime subscription on chargers
  useEffect(() => {
    if (stationIds.length === 0) return;
    const channel = supabase
      .channel("operator-chargers")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "chargers" },
        () => qc.invalidateQueries({ queryKey: ["operator-chargers"] }),
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [stationIds.join(","), qc]);

  // Pending bookings at assigned stations (next 24h)
  const { data: upcoming = [] } = useQuery({
    queryKey: ["operator-upcoming", stationIds.join(",")],
    enabled: stationIds.length > 0,
    queryFn: async () => {
      const now = new Date();
      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      const { data } = await supabase
        .from("bookings")
        .select("id, qr_code, status, starts_at, ends_at, station_id, charger_id")
        .in("station_id", stationIds)
        .in("status", ["confirmed", "in_progress"])
        .gte("ends_at", now.toISOString())
        .lte("starts_at", tomorrow.toISOString())
        .order("starts_at");
      return data ?? [];
    },
  });

  if (assignments.length === 0) {
    return (
      <div className="mx-auto max-w-3xl p-8 text-center">
        <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary"><Zap className="h-7 w-7" /></div>
        <h1 className="font-display text-2xl font-semibold">No stations assigned yet</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Your account is approved as an operator, but no stations have been assigned. Please contact your admin.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl p-4 md:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold">Live charger status</h1>
          <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
            <Radio className="h-3 w-3 animate-pulse text-emerald-500" /> Realtime · {assignments.length} station{assignments.length > 1 ? "s" : ""}
          </p>
        </div>
        <Link to="/operator/scan"><Button className="glow-primary"><QrCode className="mr-1 h-4 w-4" /> Scan booking QR</Button></Link>
      </div>

      <div className="mt-6 space-y-6">
        {assignments.map((a: any) => {
          const stationChargers = chargers.filter((c) => c.station_id === a.station_id);
          return (
            <Card key={a.station_id} className="p-4">
              <div className="mb-3">
                <h2 className="font-display text-lg font-semibold">{a.stations?.name}</h2>
                <p className="text-xs text-muted-foreground">{a.stations?.address}, {a.stations?.city}</p>
              </div>
              {isLoading ? (
                <p className="text-sm text-muted-foreground">Loading chargers…</p>
              ) : stationChargers.length === 0 ? (
                <p className="text-sm text-muted-foreground">No chargers configured.</p>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
                  {stationChargers.map((c) => (
                    <div key={c.id} className="rounded-lg border border-border bg-card/30 p-3">
                      <div className="flex items-center justify-between">
                        <div className="font-medium">{c.label}</div>
                        <Badge variant="outline" className={statusColor(c.status)}>{c.status}</Badge>
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">{c.connector} · {c.power_kw} kW</div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          );
        })}
      </div>

      <Card className="mt-6 p-4">
        <h2 className="mb-3 font-display text-lg font-semibold">Upcoming bookings (24h)</h2>
        {upcoming.length === 0 ? (
          <p className="text-sm text-muted-foreground">No upcoming bookings.</p>
        ) : (
          <div className="divide-y divide-border">
            {upcoming.map((b: any) => (
              <div key={b.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <div>
                  <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{b.qr_code}</code>
                  <span className="ml-2 text-muted-foreground">
                    {new Date(b.starts_at).toLocaleString([], { dateStyle: "short", timeStyle: "short" })} → {new Date(b.ends_at).toLocaleTimeString([], { timeStyle: "short" })}
                  </span>
                </div>
                <Badge variant="outline">{b.status}</Badge>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ClientOnly } from "@tanstack/react-router";
import { StationMap, type StationMarker } from "@/components/StationMap";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { distanceKm } from "@/lib/geo";
import { Link } from "@tanstack/react-router";
import { MapPin, Zap } from "lucide-react";
import { JugglerLoader } from "@/components/JugglerLoader";

export const Route = createFileRoute("/_authenticated/map")({
  head: () => ({
    meta: [
      { title: "Live charger map — EV ChargeHub" },
      { name: "description", content: "Browse live EV charging stations on an interactive map of India with real-time availability, connector type, and power." },
      { name: "robots", content: "noindex,follow" },
      { property: "og:title", content: "Live charger map — EV ChargeHub" },
      { property: "og:description", content: "Browse live EV chargers across India on an interactive map." },
    ],
  }),
  component: MapPage,
});

type Row = {
  id: string;
  name: string;
  operator: string;
  city: string;
  state: string;
  lat: number;
  lng: number;
  chargers: { id: string; connector: string; power_kw: number; status: string }[];
};

function MapPage() {
  const [me, setMe] = useState<{ lat: number; lng: number } | null>(null);
  const [q, setQ] = useState("");
  const [city, setCity] = useState<string>("all");
  const [connector, setConnector] = useState<string>("all");

  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (p) => setMe({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => {},
      { timeout: 5000 },
    );
  }, []);

  const { data: rows = [] } = useQuery({
    queryKey: ["stations-with-chargers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stations")
        .select("id,name,operator,city,state,lat,lng,chargers(id,connector,power_kw,status)")
        .eq("is_active", true);
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (city !== "all" && r.city !== city) return false;
      if (q && !`${r.name} ${r.operator} ${r.city}`.toLowerCase().includes(q.toLowerCase())) return false;
      if (connector !== "all" && !r.chargers.some((c) => c.connector === connector)) return false;
      return true;
    });
  }, [rows, q, city, connector]);

  const markers: StationMarker[] = filtered.map((r) => ({
    id: r.id, name: r.name, operator: r.operator, city: r.city, lat: r.lat, lng: r.lng,
    available: r.chargers.filter((c) => c.status === "available").length,
    total: r.chargers.length,
  }));

  const cities = useMemo(() => Array.from(new Set(rows.map((r) => r.city))).sort(), [rows]);

  const list = useMemo(() => {
    return filtered
      .map((r) => ({ ...r, km: me ? distanceKm(me, r) : 0 }))
      .sort((a, b) => a.km - b.km)
      .slice(0, 40);
  }, [filtered, me]);

  return (
    <div className="grid h-full min-h-0 grid-cols-1 grid-rows-[minmax(0,48%)_minmax(0,1fr)] md:grid-cols-[380px_1fr] md:grid-rows-1">
      <div className="z-10 flex min-h-0 flex-col overflow-hidden border-r border-border bg-background">
        <div className="shrink-0 space-y-2 border-b border-border p-4">
          <Input placeholder="Search station, operator, city" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="flex gap-2">
            <Select value={city} onValueChange={setCity}>
              <SelectTrigger><SelectValue placeholder="City" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All cities</SelectItem>
                {cities.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={connector} onValueChange={setConnector}>
              <SelectTrigger><SelectValue placeholder="Connector" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All connectors</SelectItem>
                {["CCS2","CHAdeMO","Type2","Bharat_AC_001","Bharat_DC_001","GBT"].map((c) =>
                  <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" size="sm" className="w-full"
            onClick={() => navigator.geolocation?.getCurrentPosition((p) => setMe({ lat: p.coords.latitude, lng: p.coords.longitude }))}>
            <MapPin className="mr-2 h-4 w-4" /> Use my location
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto pb-24 md:pb-0">
          {list.map((s) => {
            const avail = s.chargers.filter((c) => c.status === "available").length;
            return (
              <Link key={s.id} to="/stations/$stationId" params={{ stationId: s.id }}
                className="block border-b border-border p-4 transition-colors hover:bg-secondary">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{s.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{s.operator} · {s.city}</p>
                  </div>
                  {me && <span className="text-xs text-muted-foreground">{s.km.toFixed(1)} km</span>}
                </div>
                <div className="mt-2 flex items-center gap-2 text-xs">
                  <span className="rounded-full bg-primary/15 px-2 py-0.5 font-medium text-primary">
                    <Zap className="-mt-0.5 mr-1 inline h-3 w-3" />{avail}/{s.chargers.length} free
                  </span>
                  {Array.from(new Set(s.chargers.map((c) => c.connector))).slice(0, 3).map((c) =>
                    <span key={c} className="rounded-full bg-secondary px-2 py-0.5 text-muted-foreground">{c}</span>)}
                </div>
              </Link>
            );
          })}
        </div>
      </div>
      <div className="relative z-0 min-h-0 overflow-hidden p-3 md:p-5">
        <div className="neumorph relative h-full w-full overflow-hidden rounded-[2rem]">
          <ClientOnly fallback={<div className="grid h-full place-items-center text-muted-foreground"><JugglerLoader /></div>}>
            <StationMap stations={markers} userLocation={me} />
          </ClientOnly>
        </div>
      </div>

    </div>
  );
}

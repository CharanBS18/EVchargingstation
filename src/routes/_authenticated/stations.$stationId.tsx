import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Star, Navigation, ArrowLeft, Phone, Clock, Zap } from "lucide-react";
import { toast } from "sonner";
import { BookingDialog } from "@/components/BookingDialog";
import { Skeleton } from "@/components/ui/skeleton";
import { JugglerLoader } from "@/components/JugglerLoader";

export const Route = createFileRoute("/_authenticated/stations/$stationId")({
  head: ({ params }) => ({
    meta: [
      { title: `Station ${params.stationId.slice(0, 8)} — EV ChargeHub` },
      { name: "description", content: `Details, chargers, and reviews for station ${params.stationId.slice(0, 8)} on EV ChargeHub. Reserve a bay in seconds.` },
      { name: "robots", content: "noindex,follow" },
      { property: "og:title", content: `Station ${params.stationId.slice(0, 8)} — EV ChargeHub` },
      { property: "og:description", content: "Station details, chargers, and reviews on EV ChargeHub." },
    ],
  }),
  component: StationPage,
});

function StationPage() {
  const { stationId } = Route.useParams();
  const qc = useQueryClient();
  const [bookingChargerId, setBookingChargerId] = useState<string | null>(null);
  const [premium, setPremium] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) return;
      const { data } = await supabase.from("subscriptions").select("id")
        .eq("user_id", user.user.id).eq("status","active").gt("expires_at", new Date().toISOString()).maybeSingle();
      setPremium(!!data);
    })();
  }, []);

  const { data: station, isLoading } = useQuery({
    queryKey: ["station", stationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stations")
        .select("*, chargers(*), reviews(rating, comment, created_at, user_id)")
        .eq("id", stationId).maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  const { data: fav } = useQuery({
    queryKey: ["fav", stationId],
    queryFn: async () => {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) return false;
      const { data } = await supabase.from("favorites").select("station_id")
        .eq("user_id", user.user.id).eq("station_id", stationId).maybeSingle();
      return !!data;
    },
  });

  const toggleFav = useMutation({
    mutationFn: async () => {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error("Sign in required");
      if (fav) {
        await supabase.from("favorites").delete().eq("user_id", user.user.id).eq("station_id", stationId);
      } else {
        await supabase.from("favorites").insert({ user_id: user.user.id, station_id: stationId });
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["fav", stationId] }); },
  });

  useEffect(() => {
    const ch = supabase.channel("station-" + stationId)
      .on("postgres_changes", { event: "*", schema: "public", table: "chargers", filter: `station_id=eq.${stationId}` },
        () => qc.invalidateQueries({ queryKey: ["station", stationId] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [stationId, qc]);

  if (isLoading || !station) return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-8">
      <Skeleton className="h-4 w-32" />
      <div className="space-y-3">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-4 w-1/2" />
        <div className="flex gap-2">
          <Skeleton className="h-6 w-16" />
          <Skeleton className="h-6 w-20" />
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>
      <Skeleton className="h-64" />
    </div>
  );

  const avgRating = station.reviews?.length
    ? (station.reviews.reduce((s: number, r: any) => s + r.rating, 0) / station.reviews.length).toFixed(1)
    : null;

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-8">
      <Link to="/map" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="mr-1 h-4 w-4" /> Back to map
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold">{station.name}</h1>
          <p className="text-muted-foreground">{station.operator} · {station.address}, {station.city}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {avgRating && <Badge variant="secondary">★ {avgRating} ({station.reviews.length})</Badge>}
            {station.amenities?.map((a: string) => <Badge key={a} variant="outline">{a}</Badge>)}
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => toggleFav.mutate()}>
            <Star className={"mr-2 h-4 w-4 " + (fav ? "fill-primary text-primary" : "")} />
            {fav ? "Saved" : "Save"}
          </Button>
          <Button asChild variant="outline">
            <a target="_blank" rel="noreferrer"
              href={`https://www.google.com/maps/dir/?api=1&destination=${station.lat},${station.lng}&travelmode=driving&dir_action=navigate`}>
              <Navigation className="mr-2 h-4 w-4" /> Navigate
            </a>
          </Button>
        </div>
      </header>

      <div className="grid gap-4 md:grid-cols-3">
        <Info icon={Clock} label="Hours" value={station.opening_hours} />
        <Info icon={Phone} label="Phone" value={station.phone || "—"} />
        <Info icon={Zap} label="Chargers" value={`${station.chargers.length} units`} />
      </div>

      <Card>
        <CardHeader><CardTitle>Chargers</CardTitle></CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-2">
            {station.chargers.map((c: any) => {
              const tone = c.status === "available" ? "bg-success/15 text-success border-success/30" :
                c.status === "occupied" ? "bg-warning/15 text-warning border-warning/30" :
                "bg-muted text-muted-foreground border-border";
              return (
                <div key={c.id} className="flex items-center justify-between rounded-lg border border-border bg-card p-4">
                  <div>
                    <p className="font-medium">{c.label} · {c.connector}</p>
                    <p className="text-xs text-muted-foreground">{c.power_kw} kW · ₹{c.price_per_kwh}/kWh</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={"rounded-full border px-2 py-0.5 text-xs " + tone}>{c.status}</span>
                    <Button size="sm" disabled={c.status !== "available"}
                      onClick={() => premium ? setBookingChargerId(c.id) : (window.location.href = "/subscription")}>
                      {premium ? "Book" : "Premium"}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {bookingChargerId && (
        <BookingDialog chargerId={bookingChargerId} stationId={station.id}
          onClose={() => setBookingChargerId(null)}
          onBooked={() => { setBookingChargerId(null); toast.success("Booking confirmed"); }} />
      )}
    </div>
  );
}

function Info({ icon: Icon, label, value }: any) {
  return (
    <Card><CardContent className="flex items-center gap-3 pt-6">
      <Icon className="h-5 w-5 text-primary" />
      <div><p className="text-xs text-muted-foreground">{label}</p><p className="font-medium">{value}</p></div>
    </CardContent></Card>
  );
}

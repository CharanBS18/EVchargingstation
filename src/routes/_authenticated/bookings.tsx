import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar, Navigation, X, Download } from "lucide-react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";

function BookingQr({ value }: { value: string }) {
  const [src, setSrc] = useState<string>("");
  useEffect(() => {
    import("qrcode").then(({ default: QRCode }) =>
      QRCode.toDataURL(value, { width: 220, margin: 1, color: { dark: "#000000", light: "#ffffff" } })
    ).then(setSrc).catch(() => setSrc(""));
  }, [value]);
  if (!src) return <div className="h-[180px] w-[180px] animate-pulse rounded bg-muted" />;
  return (
    <div className="flex flex-col items-center gap-2">
      <img src={src} alt={`Booking QR ${value}`} className="h-44 w-44 rounded bg-white p-2" />
      <a href={src} download={`booking-${value}.png`} className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
        <Download className="h-3 w-3" /> Download
      </a>
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/bookings")({
  head: () => ({
    meta: [
      { title: "My bookings — EV ChargeHub" },
      { name: "description", content: "Review, manage, and cancel your EV charging slot reservations across India." },
      { name: "robots", content: "noindex,follow" },
      { property: "og:title", content: "My bookings — EV ChargeHub" },
      { property: "og:description", content: "Manage your EV charging slot reservations." },
    ],
  }),
  component: BookingsPage,
});

function BookingsPage() {
  const qc = useQueryClient();
  const { data: bookings = [], isLoading } = useQuery({
    queryKey: ["bookings"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const { data } = await supabase.from("bookings")
        .select("*, stations(name, city, address, lat, lng), chargers(label, connector, power_kw)")
        .eq("user_id", u.user!.id).order("starts_at", { ascending: false });
      return data ?? [];
    },
  });

  const cancel = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("bookings").update({ status: "cancelled" }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["bookings"] }); toast.success("Booking cancelled"); },
  });

  if (isLoading) return (
    <div className="mx-auto max-w-4xl space-y-4 p-4 md:p-8">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-32" />
      <Skeleton className="h-32" />
      <Skeleton className="h-32" />
    </div>
  );

  if (bookings.length === 0) {
    return (
      <div className="mx-auto max-w-3xl p-8">
        <h1 className="font-display text-3xl font-semibold">My bookings</h1>
        <Card className="mt-6"><CardContent className="p-12 text-center">
          <Calendar className="mx-auto h-10 w-10 text-muted-foreground" />
          <p className="mt-3 font-medium">No bookings yet</p>
          <p className="text-sm text-muted-foreground">Reserve your first slot from the map.</p>
          <Button asChild className="mt-4"><Link to="/map">Find chargers</Link></Button>
        </CardContent></Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4 md:p-8">
      <h1 className="font-display text-3xl font-semibold">My bookings</h1>
      {bookings.map((b: any) => {
        const upcoming = new Date(b.starts_at) > new Date() && b.status === "confirmed";
        const station = b.stations;
        const navUrl = station?.lat && station?.lng
          ? `https://www.google.com/maps/dir/?api=1&destination=${station.lat},${station.lng}&travelmode=driving&dir_action=navigate`
          : station?.address
            ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(station.address)}&travelmode=driving&dir_action=navigate`
            : null;
        return (
          <Card key={b.id}>
            <CardHeader className="flex flex-row items-start justify-between gap-3 pb-2">
              <div>
                <CardTitle className="text-base">{b.stations?.name}</CardTitle>
                <p className="text-sm text-muted-foreground">{b.stations?.address}</p>
              </div>
              <Badge variant={b.status === "cancelled" ? "destructive" : b.status === "completed" ? "secondary" : "default"}>{b.status}</Badge>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm md:grid-cols-3">
              <div><span className="text-muted-foreground">When · </span>{new Date(b.starts_at).toLocaleString("en-IN")}</div>
              <div><span className="text-muted-foreground">Charger · </span>{b.chargers?.label} {b.chargers?.connector} {b.chargers?.power_kw}kW</div>
              <div><span className="text-muted-foreground">QR · </span><code className="rounded bg-muted px-1.5 py-0.5">{b.qr_code}</code></div>
              {b.status !== "cancelled" && b.status !== "completed" && (
                <div className="md:col-span-3 flex flex-col items-center gap-2 rounded-lg border border-border bg-muted/30 p-4">
                  <p className="text-xs text-muted-foreground">Show this QR at the station</p>
                  <BookingQr value={b.qr_code} />
                </div>
              )}
              <div className="md:col-span-3 flex flex-wrap gap-2">
                {navUrl && (
                  <Button asChild variant="outline" size="sm">
                    <a href={navUrl} target="_blank" rel="noopener noreferrer">
                      <Navigation className="mr-1 h-3 w-3" /> Navigate
                    </a>
                  </Button>
                )}
                {upcoming && (
                  <Button variant="outline" size="sm" onClick={() => cancel.mutate(b.id)}>
                    <X className="mr-1 h-3 w-3" /> Cancel
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

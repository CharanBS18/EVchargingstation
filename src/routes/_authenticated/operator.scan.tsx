import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { QrCode, Camera, CheckCircle2, PlayCircle, X, Plus } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/operator/scan")({
  head: () => ({ meta: [{ title: "Scan QR — Operator" }] }),
  component: ScanPage,
});

type Booking = {
  id: string;
  qr_code: string;
  status: string;
  starts_at: string;
  ends_at: string;
  station_id: string;
  charger_id: string;
  user_id: string;
  stations?: { name: string } | null;
  chargers?: { label: string; status: string } | null;
};

function ScanPage() {
  const [manualCode, setManualCode] = useState("");
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [scannerOn, setScannerOn] = useState(false);
  const [, setTick] = useState(0);
  const scannerRef = useRef<any>(null);
  const bookingsRef = useRef<Booking[]>([]);
  const containerId = "qr-scanner-container";

  useEffect(() => { bookingsRef.current = bookings; }, [bookings]);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const lookupBusyRef = useRef(false);
  async function lookup(code: string) {
    const trimmed = code.trim();
    if (!trimmed) return;
    if (lookupBusyRef.current) return;
    if (bookingsRef.current.some((b) => b.qr_code === trimmed)) {
      // silently ignore duplicate decodes from the live scanner
      return;
    }
    lookupBusyRef.current = true;
    const { data, error } = await supabase
      .from("bookings")
      .select("id, qr_code, status, starts_at, ends_at, station_id, charger_id, user_id, stations(name), chargers(label, status)")
      .eq("qr_code", trimmed)
      .maybeSingle();
    lookupBusyRef.current = false;
    if (error) return toast.error(error.message);
    if (!data) return toast.error("No booking found for this QR (or not in your assigned stations).");
    setBookings((prev) => [data as any, ...prev]);
    setManualCode("");
    toast.success(`Booking added · ${data.status}`);
    // auto-stop the camera after a successful scan so the operator can act;
    // they press "Scan another" to add the next booking below.
    if (scannerRef.current) {
      try { await scannerRef.current.stop(); await scannerRef.current.clear(); } catch {}
      scannerRef.current = null;
      setScannerOn(false);
    }
  }

  async function startScanner() {
    setScannerOn(true);
    try {
      const { Html5Qrcode } = await import("html5-qrcode");
      await new Promise((r) => setTimeout(r, 50));
      const instance = new Html5Qrcode(containerId);
      scannerRef.current = instance;
      await instance.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 240, height: 240 } },
        (decoded) => { lookup(decoded); },
        () => {},
      );
    } catch (err: any) {
      toast.error(err?.message || "Could not start camera. Try the manual code entry below.");
      setScannerOn(false);
    }
  }

  async function stopScanner() {
    const inst = scannerRef.current;
    scannerRef.current = null;
    setScannerOn(false);
    if (inst) {
      try { await inst.stop(); await inst.clear(); } catch {}
    }
  }

  useEffect(() => () => { stopScanner(); }, []);

  async function refreshBooking(id: string) {
    const { data } = await supabase
      .from("bookings")
      .select("id, qr_code, status, starts_at, ends_at, station_id, charger_id, user_id, stations(name), chargers(label, status)")
      .eq("id", id)
      .maybeSingle();
    if (data) setBookings((prev) => prev.map((b) => (b.id === id ? (data as any) : b)));
  }

  async function transition(booking: Booking, next: "in_progress" | "completed") {
    setBusyId(booking.id);
    const bRes = await supabase.from("bookings").update({ status: next }).eq("id", booking.id);
    let cRes: any = { error: null };
    if (next === "in_progress") {
      cRes = await supabase.from("chargers").update({ status: "occupied" }).eq("id", booking.charger_id);
    } else if (next === "completed") {
      cRes = await supabase.from("chargers").update({ status: "available" }).eq("id", booking.charger_id);
    }
    setBusyId(null);
    const err = bRes.error || cRes.error;
    if (err) return toast.error(err.message);
    toast.success(next === "in_progress" ? "Session started" : "Session completed");
    refreshBooking(booking.id);
  }

  function removeBooking(id: string) {
    setBookings((prev) => prev.filter((b) => b.id !== id));
  }

  return (
    <div className="mx-auto max-w-2xl p-4 md:p-8">
      <div className="mb-4">
        <h1 className="font-display text-3xl font-semibold">Scan booking QR</h1>
        <p className="mt-1 text-sm text-muted-foreground">Scan multiple customers — each booking stays in the list until you complete or dismiss it.</p>
      </div>

      <Card className="p-4">
        {!scannerOn ? (
          <div className="text-center">
            <div className="mx-auto mb-3 grid h-16 w-16 place-items-center rounded-2xl bg-primary/15 text-primary"><QrCode className="h-8 w-8" /></div>
            <p className="text-sm text-muted-foreground">Use your device camera to scan, or paste the code below.</p>
            <Button className="mt-4 glow-primary" onClick={startScanner}>
              <Camera className="mr-1 h-4 w-4" /> {bookings.length > 0 ? "Scan another" : "Start camera"}
            </Button>
          </div>
        ) : (
          <div>
            <div id={containerId} className="overflow-hidden rounded-xl bg-black" />
            <Button variant="outline" className="mt-3 w-full" onClick={stopScanner}>Stop camera</Button>
          </div>
        )}

        <div className="mt-4 border-t border-border pt-4">
          <label className="text-xs text-muted-foreground">Enter code manually</label>
          <div className="mt-1 flex gap-2">
            <Input value={manualCode} onChange={(e) => setManualCode(e.target.value)} placeholder="e.g. 3f8a9c2b1d4e6f70" />
            <Button onClick={() => lookup(manualCode)} disabled={!manualCode.trim()}>
              <Plus className="mr-1 h-4 w-4" /> Add
            </Button>
          </div>
        </div>
      </Card>

      {bookings.length > 0 && (
        <div className="mt-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold">Active bookings ({bookings.length})</h2>
          </div>
          {bookings.map((booking) => {
            const isOvertime =
              booking.status !== "completed" &&
              booking.status !== "cancelled" &&
              Date.now() > new Date(booking.ends_at).getTime();
            return (
            <Card
              key={booking.id}
              className={`p-5 ${isOvertime ? "border-destructive bg-destructive/10" : ""}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-xs text-muted-foreground">QR code</div>
                  <code className="text-sm">{booking.qr_code}</code>
                </div>
                <div className="flex items-center gap-2">
                  {isOvertime ? (
                    <Badge variant="destructive">Expired</Badge>
                  ) : (
                    <Badge variant="outline" className="capitalize">{booking.status.replace("_", " ")}</Badge>
                  )}
                  <Button size="icon" variant="ghost" onClick={() => removeBooking(booking.id)} title="Dismiss">
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="mt-4 grid gap-2 text-sm">
                <div><span className="text-muted-foreground">Station: </span>{booking.stations?.name ?? booking.station_id}</div>
                <div><span className="text-muted-foreground">Charger: </span>{booking.chargers?.label ?? booking.charger_id} <span className="text-muted-foreground">({booking.chargers?.status})</span></div>
                <div>
                  <span className="text-muted-foreground">Window: </span>
                  {new Date(booking.starts_at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}
                  {" → "}
                  {new Date(booking.ends_at).toLocaleTimeString([], { timeStyle: "short" })}
                </div>
                {(() => {
                  if (booking.status === "cancelled" || booking.status === "completed") return null;
                  const now = Date.now();
                  const starts = new Date(booking.starts_at).getTime();
                  const ends = new Date(booking.ends_at).getTime();
                  let label = "";
                  let tone = "text-primary";
                  if (now < starts) label = `Starts in ${formatHMS(starts - now)}`;
                  else if (now < ends) label = `Charging · ${formatHMS(ends - now)} left`;
                  else { label = `Overtime · ${formatHMS(now - ends)} past end`; tone = "text-destructive"; }
                  return (
                    <div className={`rounded-md border border-border bg-muted/30 p-2 font-mono text-sm ${tone}`}>
                      ⏱ {label}
                    </div>
                  );
                })()}
              </div>

              <div className="mt-5 flex flex-wrap gap-2">
                {booking.status === "confirmed" && (
                  <Button onClick={() => transition(booking, "in_progress")} disabled={busyId === booking.id} className="glow-primary">
                    <PlayCircle className="mr-1 h-4 w-4" /> Start session
                  </Button>
                )}
                {booking.status === "in_progress" && (
                  <Button onClick={() => transition(booking, "completed")} disabled={busyId === booking.id} className="glow-primary">
                    <CheckCircle2 className="mr-1 h-4 w-4" /> Complete session
                  </Button>
                )}
                {(booking.status === "completed" || booking.status === "cancelled") && (
                  <p className="text-sm text-muted-foreground">No actions available for {booking.status} bookings.</p>
                )}
              </div>
            </Card>
            );
          })}
        </div>
      )}
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

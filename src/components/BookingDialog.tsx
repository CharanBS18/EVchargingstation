import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { checkBookingConflict } from "@/lib/bookings.functions";
import { toast } from "sonner";

function toLocalInputValue(date: Date, part: "date" | "time") {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return part === "date" ? local.toISOString().slice(0, 10) : local.toISOString().slice(11, 16);
}

export function BookingDialog({
  chargerId, stationId, onClose, onBooked,
}: { chargerId: string; stationId: string; onClose: () => void; onBooked: () => void }) {
  const qc = useQueryClient();
  const today = new Date();
  const checkConflict = useServerFn(checkBookingConflict);
  const [date, setDate] = useState(() => toLocalInputValue(today, "date"));
  const [time, setTime] = useState(() => toLocalInputValue(new Date(Date.now() + 30 * 60_000), "time"));
  const [duration, setDuration] = useState("60");
  const [vehicleId, setVehicleId] = useState<string>("");
  const [formError, setFormError] = useState<string | null>(null);

  const { data: vehicles = [] } = useQuery({
    queryKey: ["vehicles-mini"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const { data } = await supabase.from("vehicles").select("id,make,model").eq("user_id", u.user!.id);
      return data ?? [];
    },
  });

  useEffect(() => { if (vehicles[0] && !vehicleId) setVehicleId(vehicles[0].id); }, [vehicles, vehicleId]);
  useEffect(() => { setFormError(null); }, [date, time, duration, vehicleId]);

  const book = useMutation({
    mutationFn: async () => {
      setFormError(null);
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Sign in required");
      const mins = Number(duration);
      if (!Number.isFinite(mins) || mins < 5 || mins > 480) throw new Error("Duration must be 5–480 minutes.");
      const starts = new Date(`${date}T${time}:00`);
      const ends = new Date(starts.getTime() + mins * 60_000);

      // Check if THIS user already has an overlapping booking on any charger
      const { data: ownOverlap } = await supabase
        .from("bookings")
        .select("starts_at,ends_at")
        .eq("user_id", u.user.id)
        .in("status", ["confirmed", "in_progress"])
        .lt("starts_at", ends.toISOString())
        .gt("ends_at", starts.toISOString())
        .order("starts_at", { ascending: true })
        .limit(1);
      const ownRow = Array.isArray(ownOverlap) ? ownOverlap[0] : null;
      if (ownRow) {
        const s = new Date(ownRow.starts_at);
        const e = new Date(ownRow.ends_at);
        const fmt = (d: Date) => d.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
        throw new Error(`SLOT_TAKEN::You have already booked a slot from ${fmt(s)} to ${fmt(e)}. You can book another slot after ${fmt(e)}.`);
      }

      // Pre-check for overlapping bookings (uses SECURITY DEFINER fn so it sees other users' bookings)
      const conflict = await checkConflict({
        data: {
          charger_id: chargerId,
          starts_at: starts.toISOString(),
          ends_at: ends.toISOString(),
        },
      });

      if (conflict) {
        const s = new Date(conflict.starts_at);
        const e = new Date(conflict.ends_at);
        const fmt = (d: Date) => d.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
        throw new Error(`SLOT_TAKEN::Someone has already booked this charger from ${fmt(s)} to ${fmt(e)}. Please pick a time after ${fmt(e)}.`);
      }

      if (starts.getTime() <= Date.now()) {
        // Try to surface the latest still-active booking on this charger so the
        // user knows when they can next book, instead of a generic "future" error.
        const { data: latest } = await supabase
          .from("bookings")
          .select("starts_at,ends_at")
          .eq("charger_id", chargerId)
          .in("status", ["confirmed", "in_progress"])
          .gt("ends_at", new Date().toISOString())
          .order("ends_at", { ascending: false })
          .limit(1);
        const latestRow = Array.isArray(latest) ? latest[0] : null;
        if (latestRow) {
          const s = new Date(latestRow.starts_at);
          const e = new Date(latestRow.ends_at);
          const fmt = (d: Date) => d.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
          throw new Error(`SLOT_TAKEN::Someone has already booked this charger from ${fmt(s)} to ${fmt(e)}. Please pick a time after ${fmt(e)}.`);
        }
        throw new Error("Please pick a future start time.");
      }


      const { error } = await supabase.from("bookings").insert({
        user_id: u.user.id,
        charger_id: chargerId,
        station_id: stationId,
        vehicle_id: vehicleId || null,
        starts_at: starts.toISOString(),
        ends_at: ends.toISOString(),
        status: "confirmed",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bookings"] });
      qc.invalidateQueries({ queryKey: ["me"] });
      onBooked();
    },
    onError: (e: any) => {
      const msg = String(e?.message ?? e);
      let cleanMessage = msg;
      if (msg.startsWith("SLOT_TAKEN::")) {
        cleanMessage = msg.replace("SLOT_TAKEN::", "");
        toast.error(cleanMessage, { duration: 6000 });
      } else if (msg.includes("conflicting") || msg.includes("exclude") || msg.includes("overlap")) {
        cleanMessage = "That slot overlaps with an existing booking. Pick another time.";
        toast.error(cleanMessage);
      } else if (msg.includes("violates row-level security")) {
        cleanMessage = "Premium subscription required to book.";
        toast.error(cleanMessage);
      } else toast.error(cleanMessage);
      setFormError(cleanMessage);
    },
  });

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="border-border/70 backdrop-blur-xl">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">
            Book this <span className="text-gradient-primary">charger</span>
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Date</Label>
              <Input type="date" value={date} min={today.toISOString().slice(0,10)} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Start time</Label>
              <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Duration (minutes)</Label>
            <div className="flex gap-2">
              <Select value={["15","30","45","60","90","120","180","240"].includes(duration) ? duration : "custom"} onValueChange={(v) => { if (v !== "custom") setDuration(v); else setDuration(""); }}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["15","30","45","60","90","120","180","240"].map((m) => <SelectItem key={m} value={m}>{m} min</SelectItem>)}
                  <SelectItem value="custom">Custom…</SelectItem>
                </SelectContent>
              </Select>
              <Input
                type="number"
                min={5}
                max={480}
                step={5}
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                placeholder="e.g. 75"
              />
            </div>
            <p className="text-xs text-muted-foreground">Between 5 and 480 minutes.</p>
          </div>

          {formError && (
            <div className="animate-fade-in rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {formError}
            </div>
          )}

          <div className="space-y-1">
            <Label>Vehicle</Label>
            <Select value={vehicleId} onValueChange={setVehicleId}>
              <SelectTrigger><SelectValue placeholder="Select a vehicle" /></SelectTrigger>
              <SelectContent>
                {vehicles.map((v: any) => <SelectItem key={v.id} value={v.id}>{v.make} {v.model}</SelectItem>)}
              </SelectContent>
            </Select>
            {vehicles.length === 0 && <p className="text-xs text-muted-foreground">Add a vehicle in <a className="underline" href="/vehicles">Vehicles</a> for receipts.</p>}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => book.mutate()} disabled={book.isPending} className="glow-primary shine">
            {book.isPending ? "Booking…" : "Confirm booking"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Plus, Trash2, Zap } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

export const Route = createFileRoute("/_authenticated/admin/stations")({
  head: () => ({ meta: [{ title: "Stations — Admin" }] }),
  component: AdminStations,
});

const CONNECTORS = ["CCS2", "CHAdeMO", "Type2", "Bharat_AC_001", "Bharat_DC_001", "GBT"] as const;

type ChargerDraft = { label: string; connector: typeof CONNECTORS[number]; power_kw: string; price_per_kwh: string; price_na: boolean };

const stationSchema = z.object({
  name: z.string().trim().min(2).max(120),
  operator: z.string().trim().min(2).max(120),
  address: z.string().trim().min(3).max(255),
  city: z.string().trim().min(2).max(80),
  state: z.string().trim().min(2).max(80),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  phone: z.string().trim().max(20).optional().or(z.literal("")),
  opening_hours: z.string().trim().max(80).optional().or(z.literal("")),
  amenities: z.string().max(255).optional().or(z.literal("")),
  description: z.string().max(1000).optional().or(z.literal("")),
});

function AdminStations() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["admin-stations"],
    queryFn: async () => {
      const { data } = await supabase
        .from("stations")
        .select("id, name, operator, city, is_active, chargers(id, status)")
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  async function toggleActive(id: string, next: boolean) {
    const { error } = await supabase.from("stations").update({ is_active: next }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success(next ? "Station activated" : "Station deactivated");
    qc.invalidateQueries({ queryKey: ["admin-stations"] });
  }

  async function removeStation(id: string) {
    if (!confirm("Delete this station and all its chargers?")) return;
    const { error } = await supabase.from("stations").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Station deleted");
    qc.invalidateQueries({ queryKey: ["admin-stations"] });
  }

  return (
    <div className="mx-auto max-w-6xl p-4 md:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold">Stations</h1>
          <p className="mt-1 text-sm text-muted-foreground">Add, edit and manage charging stations.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-1 h-4 w-4" /> Add station</Button>
          </DialogTrigger>
          <AddStationDialog onDone={() => { setOpen(false); qc.invalidateQueries({ queryKey: ["admin-stations"] }); }} />
        </Dialog>
      </div>

      <Card className="mt-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead><TableHead>Operator</TableHead><TableHead>City</TableHead>
              <TableHead>Chargers</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground">Loading…</TableCell></TableRow>}
            {!isLoading && rows.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground">No stations yet. Click "Add station" to create one.</TableCell></TableRow>}
            {rows.map((r: any) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.name}</TableCell>
                <TableCell>{r.operator}</TableCell>
                <TableCell>{r.city}</TableCell>
                <TableCell>{r.chargers.filter((c: any) => c.status === "available").length}/{r.chargers.length}</TableCell>
                <TableCell>{r.is_active ? <Badge>Active</Badge> : <Badge variant="secondary">Off</Badge>}</TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="ghost" onClick={() => toggleActive(r.id, !r.is_active)}>{r.is_active ? "Deactivate" : "Activate"}</Button>
                  <Button size="sm" variant="ghost" className="text-destructive" onClick={() => removeStation(r.id)}><Trash2 className="h-4 w-4" /></Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

function AddStationDialog({ onDone }: { onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    name: "", operator: "", address: "", city: "", state: "",
    lat: "", lng: "", phone: "", opening_hours: "24x7",
    amenities: "", description: "",
  });
  const [chargers, setChargers] = useState<ChargerDraft[]>([
    { label: "C1", connector: "CCS2", power_kw: "60", price_per_kwh: "18", price_na: false },
  ]);

  function update<K extends keyof typeof form>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function updateCharger(i: number, patch: Partial<ChargerDraft>) {
    setChargers((cs) => cs.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  }

  function togglePriceNA(i: number) {
    setChargers((cs) =>
      cs.map((c, idx) => {
        if (idx !== i) return c;
        if (c.price_na) return { ...c, price_na: false, price_per_kwh: "" };
        return { ...c, price_na: true, price_per_kwh: "N/A" };
      }),
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const parsed = stationSchema.parse({
        ...form,
        lat: parseFloat(form.lat),
        lng: parseFloat(form.lng),
      });

      const amenities = (parsed.amenities ?? "").split(",").map((s) => s.trim()).filter(Boolean);

      const { data: station, error } = await supabase
        .from("stations")
        .insert({
          name: parsed.name,
          operator: parsed.operator,
          address: parsed.address,
          city: parsed.city,
          state: parsed.state,
          lat: parsed.lat,
          lng: parsed.lng,
          phone: parsed.phone || null,
          opening_hours: parsed.opening_hours || "24x7",
          amenities,
          description: parsed.description || null,
        })
        .select("id")
        .single();
      if (error) throw error;

      const validChargers = chargers
        .filter((c) => c.label.trim() && parseFloat(c.power_kw) > 0)
        .map((c) => ({
          station_id: station!.id,
          label: c.label.trim(),
          connector: c.connector,
          power_kw: parseFloat(c.power_kw),
          price_per_kwh: c.price_na ? null : parseFloat(c.price_per_kwh || "18"),
        }));

      if (validChargers.length) {
        const { error: cerr } = await supabase.from("chargers").insert(validChargers);
        if (cerr) throw cerr;
      }

      toast.success("Station added");
      onDone();
    } catch (err: any) {
      toast.error(err?.message || "Failed to add station");
    } finally {
      setBusy(false);
    }
  }

  return (
    <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
      <DialogHeader><DialogTitle>Add charging station</DialogTitle></DialogHeader>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name *"><Input value={form.name} onChange={(e) => update("name", e.target.value)} required /></Field>
          <Field label="Operator *"><Input value={form.operator} onChange={(e) => update("operator", e.target.value)} required /></Field>
          <Field label="Address *" className="sm:col-span-2"><Input value={form.address} onChange={(e) => update("address", e.target.value)} required /></Field>
          <Field label="City *"><Input value={form.city} onChange={(e) => update("city", e.target.value)} required /></Field>
          <Field label="State *"><Input value={form.state} onChange={(e) => update("state", e.target.value)} required /></Field>
          <Field label="Latitude *"><Input type="number" step="any" value={form.lat} onChange={(e) => update("lat", e.target.value)} required /></Field>
          <Field label="Longitude *"><Input type="number" step="any" value={form.lng} onChange={(e) => update("lng", e.target.value)} required /></Field>
          <Field label="Phone"><Input value={form.phone} onChange={(e) => update("phone", e.target.value)} /></Field>
          <Field label="Opening hours"><Input value={form.opening_hours} onChange={(e) => update("opening_hours", e.target.value)} /></Field>
          <Field label="Amenities (comma-separated)" className="sm:col-span-2"><Input value={form.amenities} onChange={(e) => update("amenities", e.target.value)} placeholder="restroom, cafe, parking" /></Field>
          <Field label="Description" className="sm:col-span-2"><Textarea rows={3} value={form.description} onChange={(e) => update("description", e.target.value)} /></Field>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <Label className="flex items-center gap-1"><Zap className="h-4 w-4 text-primary" /> Chargers</Label>
            <Button type="button" size="sm" variant="outline" onClick={() => setChargers((cs) => [...cs, { label: `C${cs.length + 1}`, connector: "CCS2", power_kw: "60", price_per_kwh: "18", price_na: false }])}>
              <Plus className="mr-1 h-3 w-3" /> Add charger
            </Button>
          </div>
          <div className="space-y-2">
            {chargers.map((c, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 rounded-lg border border-border bg-card/30 p-2">
                <Input className="col-span-3" placeholder="Label" value={c.label} onChange={(e) => updateCharger(i, { label: e.target.value })} />
                <Select value={c.connector} onValueChange={(v) => updateCharger(i, { connector: v as any })}>
                  <SelectTrigger className="col-span-4"><SelectValue /></SelectTrigger>
                  <SelectContent>{CONNECTORS.map((k) => <SelectItem key={k} value={k}>{k}</SelectItem>)}</SelectContent>
                </Select>
                <Input className="col-span-2" type="number" step="0.1" placeholder="kW" value={c.power_kw} onChange={(e) => updateCharger(i, { power_kw: e.target.value })} />
                <div className="col-span-2 flex items-center gap-1">
                  <Input
                    className="flex-1"
                    type={c.price_na ? "text" : "number"}
                    step={c.price_na ? undefined : "0.01"}
                    placeholder="₹/kWh"
                    value={c.price_per_kwh}
                    disabled={c.price_na}
                    onChange={(e) => updateCharger(i, { price_per_kwh: e.target.value, price_na: false })}
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant={c.price_na ? "default" : "outline"}
                    className="h-9 px-2 text-xs"
                    onClick={() => togglePriceNA(i)}
                  >
                    N/A
                  </Button>
                </div>
                <Button type="button" size="icon" variant="ghost" className="col-span-1 text-destructive" onClick={() => setChargers((cs) => cs.filter((_, idx) => idx !== i))}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </div>

        <DialogFooter>
          <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Create station"}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={"space-y-1 " + (className ?? "")}>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

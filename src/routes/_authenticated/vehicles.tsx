import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Trash2, Plus, Car } from "lucide-react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/vehicles")({
  head: () => ({
    meta: [
      { title: "My vehicles — EV ChargeHub" },
      { name: "description", content: "Add your EVs and connector types so EV ChargeHub can match you to compatible charging stations." },
      { name: "robots", content: "noindex,follow" },
      { property: "og:title", content: "My vehicles — EV ChargeHub" },
      { property: "og:description", content: "Manage your EVs and connector preferences." },
    ],
  }),
  component: VehiclesPage,
});

const CONNECTORS = ["CCS2","CHAdeMO","Type2","Bharat_AC_001","Bharat_DC_001","GBT"] as const;

function VehiclesPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ make: "", model: "", battery_kwh: "40", connector: "CCS2", registration: "" });

  const { data: vehicles = [], isLoading } = useQuery({
    queryKey: ["vehicles"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const { data } = await supabase.from("vehicles").select("*").eq("user_id", u.user!.id).order("created_at",{ascending:false});
      return data ?? [];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("vehicles").insert({
        user_id: u.user!.id, make: form.make, model: form.model,
        battery_kwh: Number(form.battery_kwh),
        connector: form.connector as any, registration: form.registration || null,
        is_primary: vehicles.length === 0,
      });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["vehicles"] }); setOpen(false); toast.success("Vehicle added"); },
    onError: (e: any) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("vehicles").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["vehicles"] }),
  });

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-8">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-3xl font-semibold">My vehicles</h1>
        <Button onClick={() => setOpen(true)}><Plus className="mr-2 h-4 w-4" /> Add vehicle</Button>
      </div>

      {isLoading ? (
        <div className="grid gap-3 md:grid-cols-2">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      ) : vehicles.length === 0 ? (
        <Card><CardContent className="p-12 text-center">
          <Car className="mx-auto h-10 w-10 text-muted-foreground" />
          <p className="mt-3 font-medium">No vehicles yet</p>
          <p className="text-sm text-muted-foreground">Add your EV to get matched chargers and receipts.</p>
        </CardContent></Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {vehicles.map((v: any) => (
            <Card key={v.id}>
              <CardContent className="flex items-center justify-between p-5">
                <div>
                  <p className="font-semibold">{v.make} {v.model}</p>
                  <p className="text-xs text-muted-foreground">{v.battery_kwh} kWh · {v.connector} · {v.registration || "No reg."}</p>
                </div>
                <Button variant="ghost" size="icon" onClick={() => del.mutate(v.id)}><Trash2 className="h-4 w-4" /></Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add a vehicle</DialogTitle></DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Make</Label><Input value={form.make} onChange={(e) => setForm({...form, make: e.target.value})} placeholder="Tata" /></div>
              <div><Label>Model</Label><Input value={form.model} onChange={(e) => setForm({...form, model: e.target.value})} placeholder="Nexon EV" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Battery (kWh)</Label><Input type="number" value={form.battery_kwh} onChange={(e) => setForm({...form, battery_kwh: e.target.value})} /></div>
              <div><Label>Connector</Label>
                <Select value={form.connector} onValueChange={(v) => setForm({...form, connector: v})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{CONNECTORS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div><Label>Registration (optional)</Label><Input value={form.registration} onChange={(e) => setForm({...form, registration: e.target.value})} placeholder="KA-01-AB-1234" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => create.mutate()} disabled={create.isPending || !form.make || !form.model}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

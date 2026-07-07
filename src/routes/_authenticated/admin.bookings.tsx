import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, Ban } from "lucide-react";
import { toast } from "sonner";
import { downloadCSV } from "@/lib/csv";

export const Route = createFileRoute("/_authenticated/admin/bookings")({
  head: () => ({ meta: [{ title: "Bookings — Admin" }] }),
  component: AdminBookings,
});

const STATUSES = ["all", "pending", "confirmed", "in_progress", "completed", "cancelled", "no_show"] as const;

function AdminBookings() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<(typeof STATUSES)[number]>("all");

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["admin-bookings"],
    queryFn: async () => {
      const { data: bookings } = await supabase.from("bookings")
        .select("id, user_id, status, starts_at, ends_at, qr_code, stations(name, city), chargers(label)")
        .order("starts_at", { ascending: false }).limit(500);
      const list = bookings ?? [];
      const userIds = Array.from(new Set(list.map((b: any) => b.user_id).filter(Boolean)));
      let profilesById: Record<string, { full_name: string | null; phone: string | null }> = {};
      if (userIds.length) {
        const { data: profs } = await supabase.from("profiles").select("id, full_name, phone").in("id", userIds);
        profilesById = Object.fromEntries((profs ?? []).map((p: any) => [p.id, p]));
      }
      return list.map((b: any) => ({ ...b, profile: profilesById[b.user_id] ?? null }));
    },
  });

  const cancel = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("bookings").update({ status: "cancelled" }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Booking cancelled"); qc.invalidateQueries({ queryKey: ["admin-bookings"] }); },
    onError: (e: any) => toast.error(e.message ?? "Failed to cancel"),
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r: any) => {
      if (status !== "all" && r.status !== status) return false;
      if (!q) return true;
      return (
        (r.profile?.full_name ?? "").toLowerCase().includes(q) ||
        (r.profile?.phone ?? "").toLowerCase().includes(q) ||
        (r.stations?.name ?? "").toLowerCase().includes(q) ||
        (r.stations?.city ?? "").toLowerCase().includes(q) ||
        (r.qr_code ?? "").toLowerCase().includes(q)
      );
    });
  }, [rows, search, status]);

  function exportCSV() {
    const data = filtered.map((r: any) => ({
      booking_id: r.id,
      user: r.profile?.full_name ?? "",
      phone: r.profile?.phone ?? "",
      station: r.stations?.name ?? "",
      city: r.stations?.city ?? "",
      charger: r.chargers?.label ?? "",
      starts_at: r.starts_at,
      ends_at: r.ends_at,
      status: r.status,
      qr_code: r.qr_code ?? "",
    }));
    downloadCSV(`bookings-${new Date().toISOString().slice(0, 10)}.csv`, data);
  }

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    rows.forEach((r: any) => { c[r.status] = (c[r.status] ?? 0) + 1; });
    return c;
  }, [rows]);

  return (
    <div className="mx-auto max-w-7xl p-4 md:p-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold">Bookings</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {rows.length} total · {counts.confirmed ?? 0} confirmed · {counts.completed ?? 0} completed · {counts.cancelled ?? 0} cancelled
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={exportCSV} disabled={!filtered.length}>
          <Download className="mr-1 h-4 w-4" /> Export CSV
        </Button>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Input placeholder="Search user, station, QR…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" />
        <Select value={status} onValueChange={(v) => setStatus(v as any)}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s} className="capitalize">{s.replace("_", " ")}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      <Card className="mt-4 overflow-x-auto">
        <Table>
          <TableHeader><TableRow>
            <TableHead>User</TableHead><TableHead>Station</TableHead><TableHead>Charger</TableHead>
            <TableHead>When</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {isLoading && <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground">Loading…</TableCell></TableRow>}
            {!isLoading && filtered.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground">No bookings match your filters.</TableCell></TableRow>}
            {filtered.map((r: any) => (
              <TableRow key={r.id}>
                <TableCell>
                  <div className="font-medium">{r.profile?.full_name ?? "—"}</div>
                  <div className="text-xs text-muted-foreground">{r.profile?.phone ?? ""}</div>
                </TableCell>
                <TableCell>
                  <div>{r.stations?.name}</div>
                  <div className="text-xs text-muted-foreground">{r.stations?.city}</div>
                </TableCell>
                <TableCell>{r.chargers?.label}</TableCell>
                <TableCell className="text-sm">{new Date(r.starts_at).toLocaleString("en-IN")}</TableCell>
                <TableCell><Badge variant={r.status === "cancelled" || r.status === "no_show" ? "destructive" : "default"} className="capitalize">{r.status.replace("_", " ")}</Badge></TableCell>
                <TableCell className="text-right">
                  {["pending", "confirmed"].includes(r.status) ? (
                    <Button size="sm" variant="ghost" className="text-destructive"
                      disabled={cancel.isPending && cancel.variables === r.id}
                      onClick={() => { if (confirm("Cancel this booking?")) cancel.mutate(r.id); }}>
                      <Ban className="mr-1 h-3 w-3" /> Cancel
                    </Button>
                  ) : <span className="text-xs text-muted-foreground">—</span>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

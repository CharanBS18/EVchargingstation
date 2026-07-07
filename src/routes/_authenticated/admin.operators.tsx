import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, UserPlus, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { grantOperatorRole, revokeOperatorRole } from "@/lib/operators.functions";

export const Route = createFileRoute("/_authenticated/admin/operators")({
  head: () => ({ meta: [{ title: "Operators — Admin" }] }),
  component: AdminOperators,
});

function AdminOperators() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");

  // Only users who requested operator access OR are already operators
  const { data: profiles = [] } = useQuery({
    queryKey: ["admin-operator-profiles"],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, phone, requested_role")
        .eq("requested_role", "operator")
        .order("created_at", { ascending: false })
        .limit(500);
      return data ?? [];
    },
  });

  const { data: roles = [] } = useQuery({
    queryKey: ["admin-all-roles"],
    queryFn: async () => {
      const { data } = await supabase.from("user_roles").select("user_id, role");
      return data ?? [];
    },
  });

  const { data: stations = [] } = useQuery({
    queryKey: ["admin-all-stations-mini"],
    queryFn: async () => {
      const { data } = await supabase.from("stations").select("id, name, city").order("name");
      return data ?? [];
    },
  });

  const { data: assignments = [] } = useQuery({
    queryKey: ["admin-station-operators"],
    queryFn: async () => {
      const { data } = await supabase
        .from("station_operators")
        .select("id, user_id, station_id, created_at, stations(name)")
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const operatorIds = useMemo(() => new Set(roles.filter((r: any) => r.role === "operator").map((r: any) => r.user_id)), [roles]);

  async function grantOperator(userId: string) {
    try {
      await grantOperatorRole({ data: { userId } });
      toast.success("Operator role granted");
      qc.invalidateQueries({ queryKey: ["admin-all-roles"] });
    } catch (e: any) {
      toast.error(e.message ?? "Failed to grant");
    }
  }

  async function revokeOperator(userId: string) {
    if (!confirm("Revoke operator role from this user?")) return;
    try {
      await revokeOperatorRole({ data: { userId } });
      toast.success("Operator role revoked");
      qc.invalidateQueries({ queryKey: ["admin-all-roles"] });
    } catch (e: any) {
      toast.error(e.message ?? "Failed to revoke");
    }
  }

  async function assign(userId: string, stationId: string) {
    if (!stationId) return;
    const { error } = await supabase.from("station_operators").insert({ user_id: userId, station_id: stationId });
    if (error) return toast.error(error.message);
    toast.success("Station assigned");
    qc.invalidateQueries({ queryKey: ["admin-station-operators"] });
  }

  async function unassign(id: string) {
    const { error } = await supabase.from("station_operators").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Assignment removed");
    qc.invalidateQueries({ queryKey: ["admin-station-operators"] });
  }

  const filtered = profiles.filter((p: any) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (p.full_name ?? "").toLowerCase().includes(q) || (p.phone ?? "").toLowerCase().includes(q) || p.id.toLowerCase().includes(q);
  });

  return (
    <div className="mx-auto max-w-6xl p-4 md:p-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold">Operators</h1>
          <p className="mt-1 text-sm text-muted-foreground">Approve operator signups and assign them to stations.</p>
        </div>
        <Input className="max-w-xs" placeholder="Search by name, phone, or user id" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <Card className="mt-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Assigned stations</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((p: any) => {
              const isOp = operatorIds.has(p.id);
              const userAssignments = assignments.filter((a: any) => a.user_id === p.id);
              return (
                <TableRow key={p.id}>
                  <TableCell>
                    <div className="font-medium">{p.full_name || "—"}</div>
                    <div className="text-xs text-muted-foreground">{p.phone || p.id.slice(0, 8)}</div>
                  </TableCell>
                  <TableCell>
                    {isOp ? <Badge className="bg-emerald-500/20 text-emerald-500 hover:bg-emerald-500/30"><ShieldCheck className="mr-1 h-3 w-3" />Operator</Badge> : <Badge variant="outline">User</Badge>}
                  </TableCell>
                  <TableCell>
                    {userAssignments.length === 0 ? (
                      <span className="text-xs text-muted-foreground">None</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {userAssignments.map((a: any) => (
                          <Badge key={a.id} variant="secondary" className="gap-1">
                            {a.stations?.name}
                            <button onClick={() => unassign(a.id)} className="ml-1 opacity-60 hover:opacity-100"><Trash2 className="h-3 w-3" /></button>
                          </Badge>
                        ))}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      {isOp && (() => {
                        const available = stations.filter((s: any) => !userAssignments.some((a: any) => a.station_id === s.id));
                        return (
                          <Select onValueChange={(v) => assign(p.id, v)} disabled={available.length === 0}>
                            <SelectTrigger className="w-48"><SelectValue placeholder={available.length === 0 ? "All stations assigned" : "Assign station…"} /></SelectTrigger>
                            <SelectContent>
                              {available.map((s: any) => (
                                <SelectItem key={s.id} value={s.id}>{s.name} · {s.city}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        );
                      })()}
                      {isOp ? (
                        <Button size="sm" variant="ghost" className="text-emerald-500" disabled>
                          <ShieldCheck className="mr-1 h-4 w-4" /> Operator granted
                        </Button>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => grantOperator(p.id)}><UserPlus className="mr-1 h-4 w-4" /> Grant operator</Button>
                      )}
                      {isOp && (
                        <Button size="sm" variant="destructive" onClick={() => revokeOperator(p.id)}>
                          <Trash2 className="mr-1 h-4 w-4" /> Remove operator
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
            {filtered.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-sm text-muted-foreground">No users found.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

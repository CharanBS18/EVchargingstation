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
import { Download } from "lucide-react";
import { toast } from "sonner";
import { downloadCSV } from "@/lib/csv";

export const Route = createFileRoute("/_authenticated/admin/users")({
  head: () => ({ meta: [{ title: "Users — Admin" }] }),
  component: AdminUsers,
});

function AdminUsers() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [type, setType] = useState<"all" | "paid" | "free">("all");

  const { data: rows = [] } = useQuery({
    queryKey: ["admin-users"],
    queryFn: async () => {
      const [{ data: profiles }, { data: subs }, { data: roles }] = await Promise.all([
        supabase.from("profiles").select("id, full_name, phone, created_at").order("created_at", { ascending: false }).limit(500),
        supabase.from("subscriptions").select("user_id, status, expires_at").eq("status", "active"),
        supabase.from("user_roles").select("user_id, role").in("role", ["operator", "admin"]),
      ]);
      const now = Date.now();
      const paid = new Set(
        (subs ?? [])
          .filter((s: any) => s.expires_at && new Date(s.expires_at).getTime() > now)
          .map((s: any) => s.user_id),
      );
      const staff = new Set((roles ?? []).map((r: any) => r.user_id));
      return (profiles ?? [])
        .filter((p: any) => !staff.has(p.id))
        .map((p: any) => ({ ...p, type: paid.has(p.id) ? "paid" : "free" }));
    },
  });

  const remove = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase
        .from("subscriptions")
        .update({ status: "cancelled", expires_at: new Date().toISOString() })
        .eq("user_id", userId)
        .eq("status", "active");
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Subscription removed");
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      qc.invalidateQueries({ queryKey: ["subscription"] });
      qc.invalidateQueries({ queryKey: ["is-premium"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to remove subscription"),
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r: any) => {
      if (type !== "all" && r.type !== type) return false;
      if (!q) return true;
      return (r.full_name ?? "").toLowerCase().includes(q) || (r.phone ?? "").toLowerCase().includes(q);
    });
  }, [rows, search, type]);

  function exportCSV() {
    const data = filtered.map((r: any) => ({
      user_id: r.id,
      full_name: r.full_name ?? "",
      phone: r.phone ?? "",
      type: r.type,
      joined_at: r.created_at,
    }));
    downloadCSV(`users-${new Date().toISOString().slice(0, 10)}.csv`, data);
  }

  const paidCount = rows.filter((r: any) => r.type === "paid").length;

  return (
    <div className="mx-auto max-w-6xl p-4 md:p-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold">Users</h1>
          <p className="mt-1 text-sm text-muted-foreground">{rows.length} total · {paidCount} premium</p>
        </div>
        <Button variant="outline" size="sm" onClick={exportCSV} disabled={!filtered.length}>
          <Download className="mr-1 h-4 w-4" /> Export CSV
        </Button>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Input placeholder="Search name or phone…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" />
        <Select value={type} onValueChange={(v) => setType(v as any)}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All users</SelectItem>
            <SelectItem value="paid">Premium</SelectItem>
            <SelectItem value="free">Free</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card className="mt-4 overflow-x-auto">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Name</TableHead><TableHead>Phone</TableHead><TableHead>Type</TableHead>
            <TableHead>Joined</TableHead><TableHead className="text-right">Actions</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {filtered.map((r: any) => (
              <TableRow key={r.id}>
                <TableCell>{r.full_name || "—"}</TableCell>
                <TableCell>{r.phone || "—"}</TableCell>
                <TableCell>
                  <Badge variant={r.type === "paid" ? "default" : "secondary"} className="capitalize">{r.type}</Badge>
                </TableCell>
                <TableCell>{new Date(r.created_at).toLocaleDateString("en-IN")}</TableCell>
                <TableCell className="text-right">
                  {r.type === "paid" ? (
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={remove.isPending && remove.variables === r.id}
                      onClick={() => {
                        if (confirm(`Remove subscription for ${r.full_name || "this user"}?`)) remove.mutate(r.id);
                      }}
                    >
                      Remove subscription
                    </Button>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

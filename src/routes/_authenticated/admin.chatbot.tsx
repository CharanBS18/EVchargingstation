import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/chatbot")({
  head: () => ({ meta: [{ title: "Chatbot — Admin" }] }),
  component: AdminChat,
});

const STATUSES = ["all", "open", "in_progress", "resolved", "closed"] as const;

function AdminChat() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<(typeof STATUSES)[number]>("all");

  const { data: tickets = [], isLoading } = useQuery({
    queryKey: ["admin-tickets"],
    queryFn: async () => {
      const { data: rows } = await supabase.from("support_tickets")
        .select("id, subject, body, status, created_at, user_id")
        .order("created_at", { ascending: false }).limit(200);
      const list = rows ?? [];
      const userIds = Array.from(new Set(list.map((t: any) => t.user_id).filter(Boolean)));
      let profilesById: Record<string, string> = {};
      if (userIds.length) {
        const { data: profs } = await supabase.from("profiles")
          .select("id, full_name").in("id", userIds);
        profilesById = Object.fromEntries((profs ?? []).map((p: any) => [p.id, p.full_name]));
      }
      return list.map((t: any) => ({ ...t, full_name: profilesById[t.user_id] ?? "user" }));
    },
  });

  type TicketStatus = "open" | "in_progress" | "resolved" | "closed";
  const setStatusMut = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: TicketStatus }) => {
      const { error } = await supabase.from("support_tickets").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Ticket updated"); qc.invalidateQueries({ queryKey: ["admin-tickets"] }); },
    onError: (e: any) => toast.error(e.message ?? "Failed to update"),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("support_tickets").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Ticket deleted"); qc.invalidateQueries({ queryKey: ["admin-tickets"] }); },
    onError: (e: any) => toast.error(e.message ?? "Failed to delete"),
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tickets.filter((t: any) => {
      if (status !== "all" && t.status !== status) return false;
      if (!q) return true;
      return (t.subject ?? "").toLowerCase().includes(q) || (t.body ?? "").toLowerCase().includes(q) || (t.full_name ?? "").toLowerCase().includes(q);
    });
  }, [tickets, search, status]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    tickets.forEach((t: any) => { c[t.status] = (c[t.status] ?? 0) + 1; });
    return c;
  }, [tickets]);

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4 md:p-8">
      <div>
        <h1 className="font-display text-3xl font-semibold">Chatbot escalations</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {counts.open ?? 0} open · {counts.in_progress ?? 0} in progress · {counts.resolved ?? 0} resolved · {counts.closed ?? 0} closed
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Input placeholder="Search subject, body, user…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" />
        <Select value={status} onValueChange={(v) => setStatus(v as any)}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s} className="capitalize">{s.replace("_", " ")}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : filtered.length === 0 ? (
        <p className="text-muted-foreground">No tickets match your filters.</p>
      ) : filtered.map((t: any) => (
        <Card key={t.id}>
          <CardHeader className="flex flex-row items-start justify-between gap-3 pb-2">
            <div>
              <CardTitle className="text-base">{t.subject}</CardTitle>
              <p className="text-xs text-muted-foreground">From {t.full_name} · {new Date(t.created_at).toLocaleString("en-IN")}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={t.status === "resolved" || t.status === "closed" ? "secondary" : "default"} className="capitalize">{t.status.replace("_", " ")}</Badge>
              {t.status === "open" && (
                <Button size="sm" variant="outline" disabled={setStatusMut.isPending}
                  onClick={() => setStatusMut.mutate({ id: t.id, status: "in_progress" })}>
                  <Loader2 className="mr-1 h-3 w-3" /> In progress
                </Button>
              )}
              {(t.status === "open" || t.status === "in_progress") && (
                <Button size="sm" disabled={setStatusMut.isPending}
                  onClick={() => setStatusMut.mutate({ id: t.id, status: "resolved" })}>
                  <CheckCircle2 className="mr-1 h-3 w-3" /> Resolve
                </Button>
              )}
              {t.status === "resolved" && (
                <Button size="sm" variant="outline" disabled={setStatusMut.isPending}
                  onClick={() => setStatusMut.mutate({ id: t.id, status: "closed" })}>
                  Close
                </Button>
              )}
              <Button size="icon" variant="ghost"
                onClick={() => { if (confirm("Delete this ticket?")) del.mutate(t.id); }}
                disabled={del.isPending} aria-label="Delete ticket">
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          </CardHeader>
          <CardContent><p className="text-sm whitespace-pre-wrap">{t.body}</p></CardContent>
        </Card>
      ))}
    </div>
  );
}

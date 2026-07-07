import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download } from "lucide-react";
import { inr } from "@/lib/geo";
import { downloadCSV } from "@/lib/csv";

export const Route = createFileRoute("/_authenticated/admin/payments")({
  head: () => ({ meta: [{ title: "Payments — Admin" }] }),
  component: AdminPayments,
});

const STATUSES = ["all", "created", "captured", "failed", "refunded"] as const;

function AdminPayments() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<(typeof STATUSES)[number]>("all");

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["admin-payments"],
    queryFn: async () => {
      const { data } = await supabase.from("payments")
        .select("id, amount_inr, gst_inr, status, invoice_no, razorpay_order_id, razorpay_payment_id, created_at, plans(name)")
        .order("created_at", { ascending: false }).limit(500);
      return data ?? [];
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r: any) => {
      if (status !== "all" && r.status !== status) return false;
      if (!q) return true;
      return (
        (r.invoice_no ?? "").toLowerCase().includes(q) ||
        (r.razorpay_order_id ?? "").toLowerCase().includes(q) ||
        (r.razorpay_payment_id ?? "").toLowerCase().includes(q) ||
        (r.plans?.name ?? "").toLowerCase().includes(q)
      );
    });
  }, [rows, search, status]);

  const totals = useMemo(() => {
    const captured = filtered.filter((r: any) => r.status === "captured");
    const gross = captured.reduce((s: number, r: any) => s + Number(r.amount_inr || 0), 0);
    const gst = captured.reduce((s: number, r: any) => s + Number(r.gst_inr || 0), 0);
    return { gross, gst, net: gross - gst, count: captured.length };
  }, [filtered]);

  function exportCSV() {
    const data = filtered.map((r: any) => ({
      invoice_no: r.invoice_no ?? "",
      plan: r.plans?.name ?? "",
      amount_inr: r.amount_inr,
      gst_inr: r.gst_inr,
      status: r.status,
      razorpay_order_id: r.razorpay_order_id ?? "",
      razorpay_payment_id: r.razorpay_payment_id ?? "",
      created_at: r.created_at,
    }));
    downloadCSV(`payments-${new Date().toISOString().slice(0, 10)}.csv`, data);
  }

  return (
    <div className="mx-auto max-w-7xl p-4 md:p-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="font-display text-3xl font-semibold">Payments</h1>
        <Button variant="outline" size="sm" onClick={exportCSV} disabled={!filtered.length}>
          <Download className="mr-1 h-4 w-4" /> Export CSV
        </Button>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-4">
        <Kpi label="Captured payments" value={String(totals.count)} />
        <Kpi label="Gross revenue" value={inr(totals.gross)} />
        <Kpi label="GST collected" value={inr(totals.gst)} />
        <Kpi label="Net revenue" value={inr(totals.net)} />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Input placeholder="Search invoice, Razorpay ID, plan…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" />
        <Select value={status} onValueChange={(v) => setStatus(v as any)}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      <Card className="mt-4 overflow-x-auto">
        <Table>
          <TableHeader><TableRow><TableHead>Invoice</TableHead><TableHead>Plan</TableHead><TableHead>Amount</TableHead><TableHead>GST</TableHead><TableHead>Razorpay</TableHead><TableHead>Status</TableHead><TableHead>Date</TableHead></TableRow></TableHeader>
          <TableBody>
            {isLoading && <TableRow><TableCell colSpan={7} className="text-center text-sm text-muted-foreground">Loading…</TableCell></TableRow>}
            {!isLoading && filtered.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-sm text-muted-foreground">No payments match your filters.</TableCell></TableRow>}
            {filtered.map((r: any) => (
              <TableRow key={r.id}>
                <TableCell className="font-mono text-xs">{r.invoice_no || "—"}</TableCell>
                <TableCell>{r.plans?.name}</TableCell>
                <TableCell>{inr(r.amount_inr)}</TableCell>
                <TableCell>{inr(r.gst_inr)}</TableCell>
                <TableCell className="font-mono text-xs">{r.razorpay_payment_id || r.razorpay_order_id}</TableCell>
                <TableCell><Badge variant={r.status === "captured" ? "default" : r.status === "failed" ? "destructive" : "secondary"}>{r.status}</Badge></TableCell>
                <TableCell>{new Date(r.created_at).toLocaleDateString("en-IN")}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <Card><CardContent className="pt-6">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-xl font-semibold">{value}</p>
    </CardContent></Card>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  PieChart, Pie, Cell, Legend, LineChart, Line,
} from "recharts";
import { inr } from "@/lib/geo";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/admin/")({
  head: () => ({ meta: [{ title: "Admin — EV ChargeHub" }] }),
  component: AdminOverview,
});

const PIE_COLORS = ["oklch(0.82 0.21 145)", "oklch(0.72 0.18 245)", "oklch(0.78 0.18 60)", "oklch(0.7 0.2 25)", "oklch(0.65 0.05 245)", "oklch(0.55 0.04 245)"];

function AdminOverview() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ["admin-stats"],
    queryFn: async () => {
      const since30 = new Date(Date.now() - 30 * 86400_000).toISOString();
      const [users, premium, bookingsAll, bookings30, revenue, stations, tickets, payments] = await Promise.all([
        supabase.from("profiles").select("id", { count: "exact", head: true }),
        supabase.from("subscriptions").select("id", { count: "exact", head: true }).eq("status","active").gt("expires_at", new Date().toISOString()),
        supabase.from("bookings").select("status"),
        supabase.from("bookings").select("created_at, status").gte("created_at", since30),
        supabase.from("payments").select("amount_inr").eq("status","captured"),
        supabase.from("stations").select("id", { count: "exact", head: true }),
        supabase.from("support_tickets").select("id", { count: "exact", head: true }).eq("status","open"),
        supabase.from("payments").select("amount_inr, created_at, status").eq("status","captured").order("created_at").limit(2000),
      ]);
      const totalRev = (revenue.data ?? []).reduce((s, r: any) => s + Number(r.amount_inr), 0);

      // Last 14 days revenue
      const days = Array.from({ length: 14 }).map((_, i) => {
        const d = new Date(); d.setDate(d.getDate() - (13 - i));
        return d.toISOString().slice(0, 10);
      });
      const series = days.map((day) => ({
        day: day.slice(5),
        revenue: (payments.data ?? []).filter((p: any) => p.created_at.slice(0,10) === day).reduce((s: number, r: any) => s + Number(r.amount_inr), 0),
      }));

      // Last 14 days bookings
      const bookingSeries = days.map((day) => ({
        day: day.slice(5),
        bookings: (bookings30.data ?? []).filter((b: any) => b.created_at.slice(0,10) === day).length,
      }));

      // Booking status breakdown
      const statusMap: Record<string, number> = {};
      (bookingsAll.data ?? []).forEach((b: any) => { statusMap[b.status] = (statusMap[b.status] ?? 0) + 1; });
      const statusPie = Object.entries(statusMap).map(([name, value]) => ({ name, value }));

      return {
        users: users.count ?? 0,
        premium: premium.count ?? 0,
        bookings: (bookingsAll.data ?? []).length,
        stations: stations.count ?? 0,
        tickets: tickets.count ?? 0,
        revenue: totalRev,
        series,
        bookingSeries,
        statusPie,
      };
    },
  });

  if (isLoading) return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-8">
      <Skeleton className="h-8 w-48" />
      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-28" />)}
      </div>
      <Skeleton className="h-96" />
    </div>
  );

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-8">
      <h1 className="font-display text-3xl font-semibold">Admin overview</h1>
      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
        <Stat label="Users" value={String(stats?.users ?? "—")} />
        <Stat label="Premium" value={String(stats?.premium ?? "—")} />
        <Stat label="Stations" value={String(stats?.stations ?? "—")} />
        <Stat label="Bookings" value={String(stats?.bookings ?? "—")} />
        <Stat label="Open tickets" value={String(stats?.tickets ?? "—")} />
        <Stat label="Revenue" value={stats ? inr(stats.revenue) : "—"} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Revenue — last 14 days</CardTitle></CardHeader>
          <CardContent>
            <div className="h-72">
              <ResponsiveContainer>
                <BarChart data={stats?.series ?? []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.32 0.03 245)" />
                  <XAxis dataKey="day" stroke="oklch(0.72 0.02 240)" />
                  <YAxis stroke="oklch(0.72 0.02 240)" />
                  <Tooltip contentStyle={{ background: "oklch(0.22 0.035 245)", border: "1px solid oklch(0.32 0.03 245)" }} />
                  <Bar dataKey="revenue" fill="oklch(0.82 0.21 145)" radius={[6,6,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Bookings — last 14 days</CardTitle></CardHeader>
          <CardContent>
            <div className="h-72">
              <ResponsiveContainer>
                <LineChart data={stats?.bookingSeries ?? []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.32 0.03 245)" />
                  <XAxis dataKey="day" stroke="oklch(0.72 0.02 240)" />
                  <YAxis stroke="oklch(0.72 0.02 240)" allowDecimals={false} />
                  <Tooltip contentStyle={{ background: "oklch(0.22 0.035 245)", border: "1px solid oklch(0.32 0.03 245)" }} />
                  <Line type="monotone" dataKey="bookings" stroke="oklch(0.72 0.18 245)" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Bookings by status</CardTitle></CardHeader>
        <CardContent>
          <div className="h-72">
            <ResponsiveContainer>
              <PieChart>
                <Pie data={stats?.statusPie ?? []} dataKey="value" nameKey="name" outerRadius={100} label>
                  {(stats?.statusPie ?? []).map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Legend />
                <Tooltip contentStyle={{ background: "oklch(0.22 0.035 245)", border: "1px solid oklch(0.32 0.03 245)" }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card><CardContent className="pt-6">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-2xl font-semibold">{value}</p>
    </CardContent></Card>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, Crown, Wrench } from "lucide-react";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({
    meta: [
      { title: "My profile — EV ChargeHub" },
      { name: "description", content: "Update your EV ChargeHub profile, contact details, and account preferences." },
      { name: "robots", content: "noindex,follow" },
      { property: "og:title", content: "My profile — EV ChargeHub" },
      { property: "og:description", content: "Update your EV ChargeHub account details." },
    ],
  }),
  component: ProfilePage,
});

function ProfilePage() {
  const [profile, setProfile] = useState<{ id?: string; full_name: string; phone: string; avatar_url: string }>({
    full_name: "", phone: "", avatar_url: "",
  });
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [isPremium, setIsPremium] = useState(false);
  const [roles, setRoles] = useState<string[]>([]);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      setEmail(u.user.email ?? "");
      const [{ data }, { data: sub }, { data: r }] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", u.user.id).maybeSingle(),
        supabase
          .from("subscriptions")
          .select("id")
          .eq("user_id", u.user.id)
          .eq("status", "active")
          .gt("expires_at", new Date().toISOString())
          .maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", u.user.id),
      ]);
      if (data) setProfile({
        id: data.id, full_name: data.full_name ?? "", phone: data.phone ?? "", avatar_url: data.avatar_url ?? "",
      });
      setIsPremium(!!sub);
      setRoles((r ?? []).map((x: any) => x.role));
    })();
  }, []);

  async function save() {
    setBusy(true);
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("profiles").upsert({
      id: u.user!.id, full_name: profile.full_name, phone: profile.phone, avatar_url: profile.avatar_url || null,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Profile updated");
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4 md:p-8">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-display text-3xl font-semibold">Profile</h1>
        {roles.includes("admin") && (
          <Badge className="bg-amber-500/20 text-amber-500 hover:bg-amber-500/30"><Crown className="mr-1 h-3 w-3" /> Admin</Badge>
        )}
        {roles.includes("operator") && (
          <Badge className="bg-emerald-500/20 text-emerald-500 hover:bg-emerald-500/30"><ShieldCheck className="mr-1 h-3 w-3" /> Operator</Badge>
        )}
        {isPremium && (
          <Badge className="bg-primary/20 text-primary hover:bg-primary/30"><Wrench className="mr-1 h-3 w-3" /> Premium</Badge>
        )}
      </div>
      <Card className="relative overflow-hidden">
        {isPremium && <span className="premium-ribbon" aria-label="Premium account" />}
        <CardHeader><CardTitle>Account</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1"><Label>Email</Label><Input value={email} disabled /></div>
          <div className="space-y-1"><Label>Full name</Label>
            <Input value={profile.full_name} onChange={(e) => setProfile({...profile, full_name: e.target.value})} />
          </div>
          <div className="space-y-1"><Label>Phone</Label>
            <Input value={profile.phone} onChange={(e) => setProfile({...profile, phone: e.target.value})} />
          </div>
          <Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
        </CardContent>
      </Card>
    </div>
  );
}

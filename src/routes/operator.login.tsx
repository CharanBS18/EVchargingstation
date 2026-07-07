import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Zap, Hourglass, LogOut } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/operator/login")({
  head: () => ({ meta: [{ title: "Operator Login — ChargeHub" }] }),
  component: OperatorLogin,
});

async function checkRole(userId: string): Promise<"operator" | "admin" | "pending"> {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const roles = (data ?? []).map((r: any) => r.role);
  if (roles.includes("admin")) return "admin";
  if (roles.includes("operator")) return "operator";
  return "pending";
}

function OperatorLogin() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);

  // On mount: if already signed in, route appropriately
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) return;
      const role = await checkRole(data.user.id);
      if (role === "operator" || role === "admin") {
        navigate({ to: "/operator" });
      } else {
        setPendingUserId(data.user.id);
      }
    })();
  }, [navigate]);

  // Poll for approval while pending
  useEffect(() => {
    if (!pendingUserId) return;
    const tick = async () => {
      const role = await checkRole(pendingUserId);
      if (role === "operator" || role === "admin") {
        toast.success("You've been approved as an operator");
        navigate({ to: "/operator" });
      }
    };
    const id = setInterval(tick, 4000);
    return () => clearInterval(id);
  }, [pendingUserId, navigate]);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) return toast.error(error.message);
    const role = await checkRole(data.user!.id);
    if (role === "operator" || role === "admin") {
      toast.success("Signed in");
      navigate({ to: "/operator" });
    } else {
      setPendingUserId(data.user!.id);
    }
  }

  async function signUp(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/operator/login`,
        data: { full_name: name, requested_role: "operator" },
      },
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    if (data.user) setPendingUserId(data.user.id);
    toast.success("Request submitted");
  }

  async function signOut() {
    await supabase.auth.signOut();
    setPendingUserId(null);
    toast.success("Signed out");
  }

  if (pendingUserId) {
    return (
      <div className="grid min-h-screen place-items-center bg-gradient-to-br from-background via-background to-primary/5 p-4">
        <Card className="w-full max-w-md border-border/70 backdrop-blur-xl">
          <CardHeader className="text-center">
            <div className="mx-auto mb-2 grid h-14 w-14 place-items-center rounded-2xl bg-amber-500/15 text-amber-500">
              <Hourglass className="h-7 w-7 animate-pulse" />
            </div>
            <CardTitle className="font-display text-2xl">Waiting for approval</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-center">
            <p className="text-sm text-muted-foreground">
              Your operator request has been submitted. An admin needs to assign you as an operator before you can access the console.
            </p>
            <p className="text-xs text-muted-foreground">
              You can close this tab — when you return after approval, you'll be taken to your dashboard automatically.
            </p>
            <div className="rounded-lg bg-secondary/40 p-3 text-xs text-muted-foreground">
              Checking for approval every few seconds…
            </div>
            <Button variant="ghost" size="sm" onClick={signOut} className="w-full">
              <LogOut className="mr-1 h-4 w-4" /> Sign out
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="grid min-h-screen place-items-center bg-gradient-to-br from-background via-background to-primary/5 p-4">
      <Card className="w-full max-w-md border-border/70 backdrop-blur-xl">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 grid h-12 w-12 place-items-center rounded-2xl bg-primary/15 text-primary">
            <Zap className="h-6 w-6" />
          </div>
          <CardTitle className="font-display text-2xl">Operator Console</CardTitle>
          <p className="text-sm text-muted-foreground">For station staff only</p>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="signin">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="signin">Sign in</TabsTrigger>
              <TabsTrigger value="signup">Request access</TabsTrigger>
            </TabsList>
            <TabsContent value="signin" className="pt-4">
              <form onSubmit={signIn} className="space-y-3">
                <div className="space-y-1"><Label>Email</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
                <div className="space-y-1"><Label>Password</Label><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></div>
                <Button type="submit" className="w-full" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</Button>
              </form>
            </TabsContent>
            <TabsContent value="signup" className="pt-4">
              <form onSubmit={signUp} className="space-y-3">
                <div className="space-y-1"><Label>Full name</Label><Input value={name} onChange={(e) => setName(e.target.value)} required /></div>
                <div className="space-y-1"><Label>Email</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
                <div className="space-y-1"><Label>Password</Label><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} /></div>
                <Button type="submit" className="w-full" disabled={busy}>{busy ? "Requesting…" : "Request operator access"}</Button>
                <p className="text-xs text-muted-foreground">After signup, an admin must grant you the operator role and assign you to a station.</p>
              </form>
            </TabsContent>
          </Tabs>
          <p className="mt-4 text-center text-xs text-muted-foreground">
            Looking for the user app? <Link to="/auth" className="text-primary underline">User sign in</Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

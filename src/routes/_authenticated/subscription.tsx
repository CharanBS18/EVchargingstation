import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check, ShieldCheck, Zap } from "lucide-react";
import { inr } from "@/lib/geo";
import { toast } from "sonner";
import { createOrder, verifyPayment, getRazorpayKeyId } from "@/lib/razorpay.functions";
import { SubscriptionScreen } from "@/components/SubscriptionScreen";
import { JugglerLoader } from "@/components/JugglerLoader";

export const Route = createFileRoute("/_authenticated/subscription")({
  head: () => ({
    meta: [
      { title: "Premium subscription — EV ChargeHub" },
      { name: "description", content: "Upgrade to EV ChargeHub Premium for priority slots, longer reservations, and unlimited bookings — ₹999/month." },
      { name: "robots", content: "noindex,follow" },
      { property: "og:title", content: "Premium subscription — EV ChargeHub" },
      { property: "og:description", content: "Priority slots, longer reservations, and unlimited bookings." },
    ],
  }),
  component: SubscriptionPage,
});

declare global { interface Window { Razorpay: any } }

function loadRazorpay(): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window === "undefined") return resolve(false);
    if (window.Razorpay) return resolve(true);
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}

const premiumFeatures = [
  { icon: <Check className="h-5 w-5 text-primary" />, text: "Book charging slots at any station" },
  { icon: <Zap className="h-5 w-5 text-primary" />, text: "Priority access during peak hours" },
  { icon: <Check className="h-5 w-5 text-primary" />, text: "Real-time availability & alerts" },
  { icon: <Check className="h-5 w-5 text-primary" />, text: "Save favorite stations & vehicles" },
];

function SubscriptionPage() {
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);

  const { data: plans = [], isLoading: plansLoading } = useQuery({
    queryKey: ["plans"],
    queryFn: async () => {
      const { data } = await supabase.from("plans").select("*").eq("is_active", true).order("price_inr");
      return data ?? [];
    },
  });

  const { data: sub } = useQuery({
    queryKey: ["my-sub"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const { data } = await supabase.from("subscriptions").select("*, plans(*)")
        .eq("user_id", u.user!.id).eq("status","active").gt("expires_at", new Date().toISOString()).maybeSingle();
      return data;
    },
  });

  async function subscribe(planId: string) {
    setBusy(planId);
    try {
      const loaded = await loadRazorpay();
      if (!loaded) throw new Error("Razorpay SDK could not load");

      const [{ keyId }, order] = await Promise.all([
        getRazorpayKeyId(),
        createOrder({ data: { planId } }),
      ]);
      const { data: u } = await supabase.auth.getUser();

      const rzp = new window.Razorpay({
        key: keyId,
        order_id: order.razorpayOrderId,
        amount: order.amountPaise,
        currency: "INR",
        name: "EV ChargeHub",
        description: `${order.planName} subscription`,
        prefill: { email: u.user?.email, name: u.user?.user_metadata?.full_name },
        theme: { color: "#22c55e" },
        handler: async (resp: any) => {
          try {
            await verifyPayment({ data: {
              razorpay_order_id: resp.razorpay_order_id,
              razorpay_payment_id: resp.razorpay_payment_id,
              razorpay_signature: resp.razorpay_signature,
            }});
            toast.success("Payment verified — Premium activated");
            qc.invalidateQueries({ queryKey: ["my-sub"] });
            qc.invalidateQueries({ queryKey: ["me"] });
          } catch (e: any) { toast.error(e.message || "Verification failed"); }
          finally { setBusy(null); }
        },
        modal: { ondismiss: () => setBusy(null) },
      });
      rzp.open();
    } catch (e: any) {
      toast.error(e.message || "Could not start checkout");
      setBusy(null);
    }
  }

  const pricingOptions = plans.map((p: any) => ({
    id: p.id,
    price: inr(p.price_inr),
    period: p.interval === "yearly" ? "Annually" : "Monthly",
    badge: p.interval === "yearly" ? "Best value" : "",
  }));

  const defaultPlanId = plans.find((p: any) => p.interval === "yearly")?.id ?? (plans[0]?.id);

  return (
    <div className="mx-auto flex max-w-5xl flex-col items-center gap-8 p-4 md:p-8">
      <div className="text-center">
        <ShieldCheck className="mx-auto h-10 w-10 text-primary" />
        <h1 className="mt-3 font-display text-4xl font-semibold">Go Premium</h1>
        <p className="mt-2 text-muted-foreground">Unlock booking and priority access at every station.</p>
      </div>

      {sub && (
        <Card className="w-full border-primary/40">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-6">
            <div>
              <Badge>Active</Badge>
              <p className="mt-2 text-lg font-semibold">{(sub as any).plans.name} plan</p>
              <p className="text-sm text-muted-foreground">Expires {new Date((sub as any).expires_at).toLocaleDateString("en-IN")}</p>
            </div>
            <Zap className="h-10 w-10 text-primary" />
          </CardContent>
        </Card>
      )}

      {!sub && pricingOptions.length > 0 && (
        <SubscriptionScreen
          backgroundImageSrc="https://images.unsplash.com/photo-1593941707882-a5bba14938c7?q=80&w=2072&auto=format&fit=crop"
          appName="EV ChargeHub"
          planType="Premium"
          features={premiumFeatures}
          pricingOptions={pricingOptions}
          defaultPlanId={defaultPlanId}
          subscribeButtonText="Subscribe now"
          footerText="Includes 18% GST. Powered by Razorpay. Cancel anytime."
          busy={!!busy}
          onSubscribe={subscribe}
        />
      )}

      {!sub && pricingOptions.length === 0 && (
        <Card className="w-full">
          <CardContent className="p-6 text-center text-muted-foreground">
            No plans available right now. Please check back later.
          </CardContent>
        </Card>
      )}

      {sub && (
        <p className="text-center text-sm text-muted-foreground">
          Plan options will be available again after your current subscription expires on {new Date((sub as any).expires_at).toLocaleDateString("en-IN")}.
        </p>
      )}
    </div>
  );
}

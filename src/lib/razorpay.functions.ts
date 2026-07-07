import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { hmacSha256Hex, timingSafeEqualString } from "@/lib/crypto-utils";

/** Public: expose the Razorpay Key ID so the browser checkout SDK can use it. */
export const getRazorpayKeyId = createServerFn({ method: "GET" }).handler(async () => {
  const keyId = process.env.RAZORPAY_KEY_ID;
  if (!keyId) throw new Error("Razorpay not configured");
  return { keyId };
});

/** Create a Razorpay order. Backend reads plan price from DB — frontend amount is NEVER trusted. */
export const createOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ planId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keyId || !keySecret) throw new Error("Razorpay not configured");

    // Always price from DB
    const { data: plan, error: planErr } = await context.supabase
      .from("plans")
      .select("id, name, price_inr, interval")
      .eq("id", data.planId)
      .eq("is_active", true)
      .maybeSingle();
    if (planErr || !plan) throw new Error("Plan not found");

    const amountPaise = Math.round(Number(plan.price_inr) * 100);
    const receipt = `sub_${Date.now()}_${context.userId.slice(0, 8)}`;

    const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
    const orderRes = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Basic ${auth}` },
      body: JSON.stringify({
        amount: amountPaise,
        currency: "INR",
        receipt,
        notes: { user_id: context.userId, plan_id: plan.id, plan_code: plan.interval },
      }),
    });
    if (!orderRes.ok) {
      const t = await orderRes.text();
      throw new Error(`Razorpay order failed: ${t}`);
    }
    const order = (await orderRes.json()) as { id: string; amount: number; currency: string };

    // Store the pending payment row keyed by the order id (unique).
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: insErr } = await supabaseAdmin.from("payments").insert({
      user_id: context.userId,
      plan_id: plan.id,
      amount_inr: plan.price_inr,
      gst_inr: Number((Number(plan.price_inr) * 18 / 118).toFixed(2)), // price is GST-inclusive
      razorpay_order_id: order.id,
      status: "created",
    });
    if (insErr) throw new Error(insErr.message);

    return {
      razorpayOrderId: order.id,
      amountPaise: order.amount,
      currency: order.currency,
      planName: plan.name,
    };
  });

/** Verify Razorpay signature, then activate subscription with exact 1mo/1yr expiry. */
export const verifyPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    razorpay_order_id: z.string(),
    razorpay_payment_id: z.string(),
    razorpay_signature: z.string(),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keySecret) throw new Error("Razorpay not configured");

    const expected = await hmacSha256Hex(
      keySecret,
      `${data.razorpay_order_id}|${data.razorpay_payment_id}`,
    );

    if (!timingSafeEqualString(expected, data.razorpay_signature)) {
      throw new Error("Invalid payment signature");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Look up the order — verify it belongs to this user
    const { data: payment, error: payErr } = await supabaseAdmin
      .from("payments")
      .select("id, user_id, plan_id, amount_inr, status")
      .eq("razorpay_order_id", data.razorpay_order_id)
      .maybeSingle();
    if (payErr || !payment) throw new Error("Payment record not found");
    if (payment.user_id !== context.userId) throw new Error("Forbidden");
    if (payment.status === "captured") return { ok: true, alreadyActive: true };

    if (!payment.plan_id) throw new Error("Payment is missing plan");
    // Read plan interval to compute expiry
    const { data: plan } = await supabaseAdmin
      .from("plans")
      .select("interval")
      .eq("id", payment.plan_id)
      .maybeSingle();
    if (!plan) throw new Error("Plan not found");

    const now = new Date();
    const expires = new Date(now);
    if (plan.interval === "yearly") expires.setFullYear(expires.getFullYear() + 1);
    else expires.setMonth(expires.getMonth() + 1);

    const invoiceNo = `INV-${now.getFullYear()}${String(now.getMonth()+1).padStart(2,"0")}-${data.razorpay_payment_id.slice(-6).toUpperCase()}`;

    // Create the subscription
    const { data: sub, error: subErr } = await supabaseAdmin.from("subscriptions").insert({
      user_id: payment.user_id,
      plan_id: payment.plan_id,
      status: "active",
      starts_at: now.toISOString(),
      expires_at: expires.toISOString(),
    }).select("id").single();
    if (subErr) throw new Error(subErr.message);

    // Mark payment captured
    await supabaseAdmin.from("payments")
      .update({
        razorpay_payment_id: data.razorpay_payment_id,
        razorpay_signature: data.razorpay_signature,
        status: "captured",
        subscription_id: sub.id,
        invoice_no: invoiceNo,
      })
      .eq("id", payment.id);

    // In-app notification
    await supabaseAdmin.from("notifications").insert({
      user_id: payment.user_id,
      title: "Premium activated",
      body: `Your subscription is now active until ${expires.toLocaleDateString("en-IN")}.`,
      link: "/subscription",
    });

    return { ok: true, invoiceNo, expiresAt: expires.toISOString() };
  });

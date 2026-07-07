import { createFileRoute } from "@tanstack/react-router";
import { hmacSha256Hex, timingSafeEqualString } from "@/lib/crypto-utils";

export const Route = createFileRoute("/api/public/webhooks/razorpay")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
        if (!secret) return new Response("Webhook secret not configured", { status: 500 });
        const signature = request.headers.get("x-razorpay-signature") ?? "";
        const body = await request.text();
        const expected = await hmacSha256Hex(secret, body);
        if (!timingSafeEqualString(signature, expected)) {
          return new Response("Invalid signature", { status: 401 });
        }

        const event = JSON.parse(body) as {
          event: string;
          payload?: { payment?: { entity?: { order_id?: string; id?: string; status?: string } } };
        };

        const orderId = event.payload?.payment?.entity?.order_id;
        if (!orderId) return new Response("ok");

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        if (event.event === "payment.captured" || event.event === "payment.authorized") {
          // Idempotent: only update if still in 'created' state
          await supabaseAdmin.from("payments")
            .update({
              status: "captured",
              razorpay_payment_id: event.payload!.payment!.entity!.id ?? null,
            })
            .eq("razorpay_order_id", orderId)
            .eq("status", "created");
        } else if (event.event === "payment.failed") {
          await supabaseAdmin.from("payments")
            .update({ status: "failed" })
            .eq("razorpay_order_id", orderId);
        }

        return new Response("ok");
      },
    },
  },
});

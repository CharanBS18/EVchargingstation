import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

const SYSTEM = `You are the EV ChargeHub assistant for an EV charging-station booking platform in India.
You help users with: finding chargers, booking slots, subscription plans (Monthly ₹999, Yearly ₹9999),
payment questions (Razorpay), connector types (CCS2, CHAdeMO, Type2), and navigation.
Be concise, friendly, and use INR. Only Premium users can book slots.

Refund / cancellation policy — ALWAYS state this clearly when a user asks to cancel their subscription or requests a refund:
"We provide a full refund for subscription cancellations."
After stating the policy, tell the user to tap the "Raise a ticket" button shown below your message so the admin team can process their request. Do not claim the ticket is already created — the user must click the button.

IMPORTANT: When (and ONLY when) the user actually needs human escalation — refund, cancellation, payment dispute, chargeback, or explicit request to talk to a human/agent — append the exact marker token [[RAISE_TICKET]] on a new line at the very end of your reply. Never include this marker for general questions, greetings, or info queries.


If the user is angry, has a payment dispute, or asks for a refund/cancellation, advise them the request is escalated to support.
Never invent station availability — direct them to the live Map page for real-time status.`;

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { messages } = (await request.json()) as { messages?: UIMessage[] };
        if (!Array.isArray(messages)) return new Response("messages required", { status: 400 });
        // Configurable AI provider:
        //  - Set AI_PROVIDER=openai (default) + OPENAI_API_KEY for OpenAI
        //  - Set AI_PROVIDER=lovable + LOVABLE_API_KEY for Lovable AI Gateway
        //  - Any OpenAI-compatible endpoint via AI_BASE_URL + AI_API_KEY
        const provider = (process.env.AI_PROVIDER ?? "openai").toLowerCase();
        const isLovable = provider === "lovable";
        const key = process.env.AI_API_KEY
          ?? (isLovable ? process.env.LOVABLE_API_KEY : process.env.OPENAI_API_KEY);
        const baseURL = process.env.AI_BASE_URL
          ?? (isLovable ? "https://ai.gateway.lovable.dev/v1" : "https://api.openai.com/v1");
        const model = process.env.AI_MODEL
          ?? (isLovable ? "google/gemini-3-flash-preview" : "gpt-4o-mini");
        if (!key) return new Response(`Missing AI credentials (set ${isLovable ? "LOVABLE_API_KEY" : "OPENAI_API_KEY"})`, { status: 500 });

        const gateway = createOpenAICompatible({
          name: "chat",
          baseURL,
          headers: isLovable
            ? { "Lovable-API-Key": key, "X-Lovable-AIG-SDK": "vercel-ai-sdk" }
            : { Authorization: `Bearer ${key}` },
        });

        const result = streamText({
          model: gateway(model),
          system: SYSTEM,
          messages: await convertToModelMessages(messages),
        });
        return result.toUIMessageStreamResponse({ originalMessages: messages });
      },
    },
  },
});

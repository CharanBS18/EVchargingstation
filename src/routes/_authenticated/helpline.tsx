import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Send, LifeBuoy, Bot, UserCog, ChevronLeft } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/helpline")({
  head: () => ({
    meta: [
      { title: "Helpline — EV ChargeHub support" },
      { name: "description", content: "Chat with the EV ChargeHub support team for help with bookings, payments, and charger issues." },
      { name: "robots", content: "noindex,follow" },
      { property: "og:title", content: "Helpline — EV ChargeHub" },
      { property: "og:description", content: "Live chat with the EV ChargeHub support team." },
    ],
  }),
  component: HelplinePage,
});

type Msg = {
  id: string;
  user_id: string;
  sender: "user" | "admin";
  content: string;
  created_at: string;
};

type BotMsg = { id: string; from: "bot" | "user"; text: string };

// Pretrained FAQ options (like Blinkit/Zomato automated support)
const FAQS: { q: string; a: string }[] = [
  {
    q: "How do I book a charging slot?",
    a: "Open the Map page, choose a station, pick an available time slot, and confirm. Only Premium members can book slots.",
  },
  {
    q: "What are the subscription plans?",
    a: "We offer Monthly at ₹999 and Yearly at ₹9999. Premium unlocks slot booking and priority support.",
  },
  {
    q: "Payment failed / not reflecting",
    a: "Razorpay usually settles within 5–10 minutes. If the amount was deducted but Premium is not active, wait 10 minutes then refresh. Still stuck? Connect with our team below.",
  },
  {
    q: "Which connectors are supported?",
    a: "We support CCS2, CHAdeMO and Type2 connectors. Each station card shows the connector type and live availability.",
  },
  {
    q: "How do I cancel my subscription?",
    a: "Open the chatbot (bottom right) and type 'cancel subscription'. Note: only 70% is refunded — the remaining 30% covers GST and platform maintenance.",
  },
];

function HelplinePage() {
  const qc = useQueryClient();
  const [userId, setUserId] = useState<string | null>(null);
  const [mode, setMode] = useState<"bot" | "admin">("bot");
  const [botLog, setBotLog] = useState<BotMsg[]>([
    {
      id: "greet",
      from: "bot",
      text: "Hi! I'm ChargeBot 🤖 — pick a topic below and I'll try to help. If you still need a human, you can connect with our team.",
    },
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
  }, []);

  const { data: messages = [] } = useQuery({
    queryKey: ["helpline", userId],
    enabled: !!userId && mode === "admin",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("helpline_messages")
        .select("id, user_id, sender, content, created_at")
        .eq("user_id", userId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Msg[];
    },
  });

  useEffect(() => {
    if (!userId || mode !== "admin") return;
    const ch = supabase
      .channel(`helpline-${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "helpline_messages", filter: `user_id=eq.${userId}` },
        () => qc.invalidateQueries({ queryKey: ["helpline", userId] }),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [userId, qc, mode]);

  useEffect(() => {
    if (!userId || messages.length === 0) return;
    supabase
      .from("helpline_messages")
      .update({ read_by_user: true })
      .eq("user_id", userId)
      .eq("sender", "admin")
      .eq("read_by_user", false)
      .then(() => {});
  }, [messages, userId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, botLog.length, mode]);

  function pickFaq(idx: number) {
    const f = FAQS[idx];
    setBotLog((l) => [
      ...l,
      { id: `u-${Date.now()}`, from: "user", text: f.q },
      { id: `b-${Date.now() + 1}`, from: "bot", text: f.a },
    ]);
  }

  async function sendToAdmin(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || !userId || sending) return;
    const content = input.trim();
    setInput("");
    setSending(true);
    const { error } = await supabase.from("helpline_messages").insert({
      user_id: userId, sender: "user", content, read_by_admin: false, read_by_user: true,
    });
    setSending(false);
    if (error) { toast.error(error.message); setInput(content); return; }
    qc.invalidateQueries({ queryKey: ["helpline", userId] });
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 md:p-8">
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-lg bg-primary/15 text-primary">
          <LifeBuoy className="h-5 w-5" />
        </span>
        <div className="flex-1">
          <h1 className="font-display text-2xl font-semibold">Helpline</h1>
          <p className="text-sm text-muted-foreground">
            {mode === "bot"
              ? "Tap a topic below — our assistant will answer instantly."
              : "You're now chatting with our team. Replies usually within a few hours."}
          </p>
        </div>
        {mode === "admin" && (
          <Button variant="outline" size="sm" onClick={() => setMode("bot")} className="gap-1.5">
            <ChevronLeft className="h-4 w-4" /> Back to assistant
          </Button>
        )}
      </div>

      <Card className="flex h-[65vh] flex-col overflow-hidden">
        <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
          {mode === "bot" ? (
            <>
              {botLog.map((m) => (
                <div key={m.id} className={m.from === "user" ? "ml-auto max-w-[80%]" : "mr-auto max-w-[85%]"}>
                  <div className={"rounded-2xl px-3 py-2 text-sm " + (m.from === "user" ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground")}>
                    {m.from === "bot" && (
                      <span className="mr-1 inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        <Bot className="h-3 w-3" /> ChargeBot
                      </span>
                    )}
                    <div>{m.text}</div>
                  </div>
                </div>
              ))}

              <div className="pt-2">
                <p className="mb-2 text-xs font-medium text-muted-foreground">Common questions</p>
                <div className="flex flex-wrap gap-2">
                  {FAQS.map((f, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => pickFaq(i)}
                      className="rounded-full border border-border bg-background px-3 py-1.5 text-xs hover:bg-secondary"
                    >
                      {f.q}
                    </button>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <>
              {messages.length === 0 && (
                <p className="text-sm text-muted-foreground">You're connected. Describe your issue and a team member will respond here.</p>
              )}
              {messages.map((m) => (
                <div key={m.id} className={m.sender === "user" ? "ml-auto max-w-[80%]" : "mr-auto max-w-[80%]"}>
                  <div className={"rounded-2xl px-3 py-2 text-sm " + (m.sender === "user" ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground")}>
                    {m.content}
                  </div>
                  <p className={"mt-1 text-[10px] text-muted-foreground " + (m.sender === "user" ? "text-right" : "")}>
                    {m.sender === "admin" ? "Team · " : ""}{new Date(m.created_at).toLocaleString("en-IN")}
                  </p>
                </div>
              ))}
            </>
          )}
        </div>

        {mode === "bot" ? (
          <div className="border-t border-border p-3">
            <Button onClick={() => setMode("admin")} variant="default" className="w-full gap-2">
              <UserCog className="h-4 w-4" /> Didn't help? Connect with our team
            </Button>
          </div>
        ) : (
          <form onSubmit={sendToAdmin} className="flex items-center gap-2 border-t border-border p-3">
            <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Type your message…" disabled={sending} />
            <Button type="submit" size="icon" disabled={sending || !input.trim()}><Send className="h-4 w-4" /></Button>
          </form>
        )}
      </Card>
    </div>
  );
}

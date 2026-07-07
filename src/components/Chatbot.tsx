import { useState } from "react";
import { MessageCircle, X, Send, LifeBuoy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const ESCALATE_RE = /((cancel|remove|delete|stop|end|terminate|deactivate)\s*(my)?\s*(subscription|premium|plan|membership)|(remove|cancel|stop)\s*(my)?\s*premium|unsubscribe|downgrade|refund|chargeback|dispute|escalate|talk to (a )?human|speak to (an? )?(agent|admin|human))/i;

async function raiseTicket(text: string) {
  const { data: u } = await supabase.auth.getUser();
  const user = u?.user;
  if (!user) throw new Error("Please sign in first");
  const { data: profile } = await supabase
    .from("profiles").select("full_name, phone").eq("id", user.id).maybeSingle();
  const name = profile?.full_name || user.email || "Unknown user";
  const subject = /refund|chargeback|dispute/i.test(text)
    ? `Refund request from ${name}`
    : /cancel|remove|delete|stop|end|terminate|deactivate|unsubscribe|downgrade/i.test(text)
    ? `Subscription cancellation request from ${name}`
    : `Escalation from ${name}`;
  const body = `User: ${name}\nUser ID: ${user.id}\nEmail: ${user.email ?? "—"}\nPhone: ${profile?.phone ?? "—"}\n\nMessage:\n"${text}"\n\nRaised from chatbot. Please review and take action.`;
  const { error } = await supabase.from("support_tickets").insert({
    user_id: user.id, subject, body, source: "chatbot", status: "open",
  });
  if (error) throw error;
}

export function Chatbot({ contained = false }: { contained?: boolean } = {}) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  // Map of assistant message id -> ticket state
  const [tickets, setTickets] = useState<Record<string, "idle" | "loading" | "sent">>({});

  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({ api: "/api/chat" }),
  });
  const busy = status === "submitted" || status === "streaming";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || busy) return;
    const text = input.trim();
    setInput("");
    const result: any = await sendMessage({ text });
  }

  const RAISE_MARKER = "[[RAISE_TICKET]]";

  // Show the ticket button only when the BOT decides escalation is needed
  // (it appends [[RAISE_TICKET]] to its reply). Prevents users from spamming tickets.
  function shouldShowTicketButton(idx: number) {
    const m = messages[idx];
    if (m.role !== "assistant") return null;
    const text = m.parts.map((p) => (p.type === "text" ? p.text : "")).join("");
    if (!text.includes(RAISE_MARKER)) return null;
    const prev = messages[idx - 1];
    const prevText = prev?.role === "user"
      ? prev.parts.map((p) => (p.type === "text" ? p.text : "")).join("")
      : text;
    return prevText;
  }



  async function handleRaise(messageId: string, triggerText: string) {
    setTickets((s) => ({ ...s, [messageId]: "loading" }));
    try {
      await raiseTicket(triggerText);
      setTickets((s) => ({ ...s, [messageId]: "sent" }));
      toast.success("Ticket raised. Our team has been notified.");
    } catch (e: any) {
      setTickets((s) => ({ ...s, [messageId]: "idle" }));
      toast.error(e?.message ?? "Failed to raise ticket");
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={
          (contained ? "absolute" : "fixed") +
          " bottom-24 right-5 z-40 grid h-12 w-12 place-items-center rounded-full bg-primary text-primary-foreground shadow-lg glow-primary transition-transform hover:scale-105"
        }
        aria-label="Open chat"
      >
        {open ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
      </button>
      {open && (
        <div
          className={
            (contained ? "absolute" : "fixed") +
            " bottom-40 right-4 z-40 flex h-[480px] w-[320px] max-h-[calc(100%-11rem)] max-w-[calc(100%-2rem)] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
          }
        >
          <div className="border-b border-border bg-secondary px-4 py-3">
            <p className="font-semibold">ChargeHub Assistant</p>
            <p className="text-xs text-muted-foreground">Ask about bookings, plans, or stations.</p>
          </div>
          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {messages.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Hi! I can help you find chargers, plan a booking, or explain Premium. What do you need?
              </p>
            )}
            {messages.map((m, idx) => {
              const rawText = m.parts.map((p) => (p.type === "text" ? p.text : "")).join("");
              const text = rawText.replace(RAISE_MARKER, "").trim();
              const trigger = shouldShowTicketButton(idx);
              const ticketState = tickets[m.id] ?? "idle";
              return (
                <div key={m.id} className={m.role === "user" ? "ml-auto max-w-[85%]" : "mr-auto max-w-[85%]"}>
                  <div
                    className={
                      "rounded-2xl px-3 py-2 text-sm " +
                      (m.role === "user" ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground")
                    }
                  >
                    {text}
                  </div>

                  {trigger && (
                    <div className="mt-2">
                      <Button
                        size="sm"
                        variant={ticketState === "sent" ? "secondary" : "default"}
                        disabled={ticketState !== "idle"}
                        onClick={() => handleRaise(m.id, trigger)}
                        className="gap-1.5"
                      >
                        {ticketState === "sent" ? (
                          <><Check className="h-3.5 w-3.5" /> Ticket raised</>
                        ) : ticketState === "loading" ? (
                          <>Raising…</>
                        ) : (
                          <><LifeBuoy className="h-3.5 w-3.5" /> Raise a ticket</>
                        )}
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
            {busy && <div className="text-xs text-muted-foreground">Thinking…</div>}
          </div>
          <form onSubmit={submit} className="flex items-center gap-2 border-t border-border p-3">
            <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Type a message…" disabled={busy} />
            <Button type="submit" size="icon" disabled={busy || !input.trim()} aria-label="Send message"><Send className="h-4 w-4" /></Button>
          </form>
        </div>
      )}
    </>
  );
}

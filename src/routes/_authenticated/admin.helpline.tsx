import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Send, LifeBuoy } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/helpline")({
  head: () => ({ meta: [{ title: "Helpline — Admin" }] }),
  component: AdminHelpline,
});

type Msg = {
  id: string;
  user_id: string;
  sender: "user" | "admin";
  content: string;
  read_by_admin: boolean;
  read_by_user: boolean;
  created_at: string;
};

function AdminHelpline() {
  const qc = useQueryClient();
  const [activeUserId, setActiveUserId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: messages = [] } = useQuery({
    queryKey: ["admin-helpline"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("helpline_messages")
        .select("id, user_id, sender, content, read_by_admin, read_by_user, created_at")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Msg[];
    },
  });

  // Group by user
  const threads = useMemo(() => {
    const map = new Map<string, { lastAt: string; lastText: string; unread: number; total: number }>();
    for (const m of messages) {
      const t = map.get(m.user_id) ?? { lastAt: m.created_at, lastText: m.content, unread: 0, total: 0 };
      t.total += 1;
      if (m.created_at >= t.lastAt) { t.lastAt = m.created_at; t.lastText = m.content; }
      if (m.sender === "user" && !m.read_by_admin) t.unread += 1;
      map.set(m.user_id, t);
    }
    return Array.from(map.entries()).sort((a, b) => (a[1].lastAt < b[1].lastAt ? 1 : -1));
  }, [messages]);

  const userIds = useMemo(() => threads.map(([id]) => id), [threads]);

  const { data: profiles = {} } = useQuery({
    queryKey: ["helpline-profiles", userIds.join(",")],
    enabled: userIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id, full_name, phone").in("id", userIds);
      return Object.fromEntries((data ?? []).map((p: any) => [p.id, p]));
    },
  });

  // Default thread
  useEffect(() => {
    if (!activeUserId && threads.length > 0) setActiveUserId(threads[0][0]);
  }, [threads, activeUserId]);

  // Realtime
  useEffect(() => {
    const ch = supabase
      .channel("admin-helpline")
      .on("postgres_changes", { event: "*", schema: "public", table: "helpline_messages" },
        () => qc.invalidateQueries({ queryKey: ["admin-helpline"] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  const active = useMemo(() => messages.filter((m) => m.user_id === activeUserId), [messages, activeUserId]);

  // Mark user messages as read by admin when opening thread
  useEffect(() => {
    if (!activeUserId) return;
    supabase.from("helpline_messages").update({ read_by_admin: true })
      .eq("user_id", activeUserId).eq("sender", "user").eq("read_by_admin", false)
      .then(() => qc.invalidateQueries({ queryKey: ["admin-helpline"] }));
  }, [activeUserId, qc]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [active.length, activeUserId]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || !activeUserId || sending) return;
    const content = input.trim();
    setInput("");
    setSending(true);
    const { error } = await supabase.from("helpline_messages").insert({
      user_id: activeUserId, sender: "admin", content, read_by_admin: true, read_by_user: false,
    });
    setSending(false);
    if (error) { toast.error(error.message); setInput(content); return; }
    qc.invalidateQueries({ queryKey: ["admin-helpline"] });
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 md:p-8">
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-lg bg-primary/15 text-primary">
          <LifeBuoy className="h-5 w-5" />
        </span>
        <div>
          <h1 className="font-display text-2xl font-semibold">Helpline</h1>
          <p className="text-sm text-muted-foreground">Direct conversations with users.</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-[280px_1fr]">
        <Card className="h-[70vh] overflow-y-auto p-2">
          {threads.length === 0 && (
            <p className="p-3 text-sm text-muted-foreground">No conversations yet.</p>
          )}
          {threads.map(([uid, t]) => {
            const p: any = (profiles as any)[uid];
            const active = uid === activeUserId;
            return (
              <button key={uid} type="button" onClick={() => setActiveUserId(uid)}
                className={"flex w-full flex-col gap-1 rounded-lg px-3 py-2 text-left transition-colors " +
                  (active ? "bg-primary/15" : "hover:bg-secondary")}>
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium">{p?.full_name ?? "User"}</span>
                  {t.unread > 0 && <Badge className="h-5 px-1.5 text-[10px]">{t.unread}</Badge>}
                </div>
                <p className="line-clamp-1 text-xs text-muted-foreground">{t.lastText}</p>
                <p className="text-[10px] text-muted-foreground">{new Date(t.lastAt).toLocaleString("en-IN")}</p>
              </button>
            );
          })}
        </Card>

        <Card className="flex h-[70vh] flex-col overflow-hidden">
          {!activeUserId ? (
            <div className="grid flex-1 place-items-center text-sm text-muted-foreground">Select a conversation</div>
          ) : (
            <>
              <div className="border-b border-border px-4 py-3">
                <p className="text-sm font-medium">{(profiles as any)[activeUserId]?.full_name ?? "User"}</p>
                <p className="text-xs text-muted-foreground">{(profiles as any)[activeUserId]?.phone ?? "—"}</p>
              </div>
              <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
                {active.map((m) => (
                  <div key={m.id} className={m.sender === "admin" ? "ml-auto max-w-[80%]" : "mr-auto max-w-[80%]"}>
                    <div className={"rounded-2xl px-3 py-2 text-sm " + (m.sender === "admin" ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground")}>
                      {m.content}
                    </div>
                    <p className={"mt-1 text-[10px] text-muted-foreground " + (m.sender === "admin" ? "text-right" : "")}>
                      {new Date(m.created_at).toLocaleString("en-IN")}
                    </p>
                  </div>
                ))}
              </div>
              <form onSubmit={send} className="flex items-center gap-2 border-t border-border p-3">
                <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Reply to user…" disabled={sending} />
                <Button type="submit" size="icon" disabled={sending || !input.trim()}><Send className="h-4 w-4" /></Button>
              </form>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}

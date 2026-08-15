"use client";

import { useRef, useState } from "react";
import { useFinance } from "@/components/providers";
import { Badge, Button, Card, PageHeader, Skeleton, TextInput } from "@/components/ui";

type Msg = { id: number; role: "user" | "bot"; text: string };
type Draft = {
  type: "income" | "expense" | "transfer";
  amount: number | null;
  minAmount: number | null;
  maxAmount: number | null;
  categoryName: string | null;
  date: string;
  note: string;
  estimated: boolean;
  confidence: number;
};

const QUICK = [
  "📊 Hisobot",
  "📅 Reja va prognoz",
  "💳 Hisoblar",
  "📌 Majburiy to'lovlar",
  "💰 Kutilayotgan daromadlar",
  "🎯 Budjet",
  "📋 Qarzdorlik",
  "🏆 Maqsadlar",
  "🔔 Eslatmalar",
];

export default function BotPage() {
  const { state, loading, refresh } = useFinance();
  const [messages, setMessages] = useState<Msg[]>([
    {
      id: 1,
      role: "bot",
      text: "Salom 👋\n\nMen tezkor moliya yordamchingizman. Tabiiy tilda yozing:\n\n„150 ming ovqatga ketdi“\n„1,5 mln maosh keldi“\n„2.5 mln ijara to'ladim“\n\nYoki tezkor buyruqlardan foydalaning.",
    },
  ]);
  const [input, setInput] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const counter = useRef(2);

  if (loading && !state) return <Skeleton className="h-96 w-full" />;

  async function send(text: string, confirm?: Record<string, unknown> | null) {
    const value = text.trim();
    if (!value && !confirm) return;
    setMessages((prev) => [...prev, { id: counter.current++, role: "user", text: value || "✅ Ha, qo'sh" }]);
    setInput("");
    setDraft(null);
    setBusy(true);
    try {
      const res = await fetch("/api/bot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: value, confirm }),
      });
      const reply = (await res.json()) as { text: string; draft?: Draft };
      setMessages((prev) => [...prev, { id: counter.current++, role: "bot", text: reply.text }]);
      if (reply.draft) setDraft(reply.draft);
      if (confirm) await refresh();
    } catch {
      setMessages((prev) => [...prev, { id: counter.current++, role: "bot", text: "⚠️ Ulanish xatosi." }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="animate-fade-up space-y-4">
      <PageHeader title="🤖 Bot konsol" subtitle="Telegram bot mantiqi — bir xil backend" action={<Badge tone="accent">POST /api/bot</Badge>} />

      <Card padded={false} className="overflow-hidden">
        <div className="flex max-h-[56dvh] flex-col">
          <div className="flex-1 space-y-3 overflow-y-auto overscroll-contain p-3.5 sm:p-4">
            {messages.map((m) => (
              <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`animate-pop max-w-[88%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed sm:max-w-[80%] sm:px-4 sm:text-[13.5px] ${
                    m.role === "user" ? "bg-primary text-primary-fg" : "border border-line bg-surface-2 text-fg"
                  }`}
                >
                  {m.text}
                </div>
              </div>
            ))}
            {busy ? (
              <div className="flex justify-start">
                <div className="animate-shimmer rounded-2xl border border-line bg-surface-2 px-4 py-2.5 text-[13px] text-muted">yozilmoqda…</div>
              </div>
            ) : null}
          </div>

          {draft ? (
            <div className="border-t border-line bg-surface-2 p-3.5 sm:p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">Tasdiqlash</p>
              <p className="mt-1 text-[13px] leading-snug">
                {draft.type === "income" ? "Kirim" : draft.type === "transfer" ? "Transfer" : "Chiqim"} ·{" "}
                {draft.amount?.toLocaleString("ru-RU")} · {draft.categoryName ?? "kategoriya yo‘q"}
              </p>
              <div className="mt-3 flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="positive"
                  onClick={() => send("ha", { ...draft, note: draft.note || draft.categoryName || "operatsiya" })}
                >
                  ✅ Ha, qo‘sh
                </Button>
                <Button type="button" size="sm" variant="secondary" onClick={() => setDraft(null)}>
                  Bekor qilish
                </Button>
              </div>
            </div>
          ) : null}

          <div className="border-t border-line bg-surface p-3.5 sm:p-4">
            <div className="no-scrollbar -mx-1 mb-3 flex gap-2 overflow-x-auto px-1 pb-0.5">
              {QUICK.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => send(q)}
                  className="min-h-9 shrink-0 touch-manipulation whitespace-nowrap rounded-full border border-line bg-surface-2 px-3 text-[11.5px] font-medium text-fg-soft transition-colors hover:border-accent hover:text-accent-text active:bg-surface-3"
                >
                  {q}
                </button>
              ))}
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void send(input);
              }}
              className="flex gap-2"
            >
              <TextInput value={input} onChange={(e) => setInput(e.target.value)} placeholder="150 ming ovqatga ketdi" className="min-w-0 flex-1" />
              <Button type="submit" disabled={busy || !input.trim()} className="shrink-0">
                Yuborish
              </Button>
            </form>
          </div>
        </div>
      </Card>

      <Card>
        <p className="mb-2 text-[15px] font-semibold">Bot imkoniyatlari</p>
        <div className="grid gap-2 text-[12.5px] leading-snug text-muted sm:grid-cols-2">
          <p>➕ Kirim, ➖ chiqim, ↔️ transfer — tezkor</p>
          <p>📊 Hisobot: bugun va oy ko‘rsatkichlari</p>
          <p>📅 Reja va prognoz: safe-to-spend, xavf</p>
          <p>🔔 Eslatmalar: to‘lov, budjet, xavf</p>
          <p>🧠 Tabiiy tilda summa va kategoriya</p>
          <p>📱 Mini App bilan bir xil baza</p>
        </div>
      </Card>
    </div>
  );
}

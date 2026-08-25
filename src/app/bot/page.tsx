"use client";

import { useRef, useState } from "react";
import { useFinance } from "@/components/providers";
import { Button, Card, Skeleton, TextInput } from "@/components/ui";
import { ERRORS } from "@/lib/copy";
import { BUTTON, startNew } from "@/lib/bot-copy";
import { formatAmount } from "@/lib/money";

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
  accountId?: number;
  toAccountId?: number;
};

const BOT_CONSOLE_ENABLED = process.env.NODE_ENV !== "production";
const BOT_USERNAME = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME;

const QUICK = [
  "📊 Hisobot",
  "📅 Reja",
  "💳 Hisoblar",
  "📌 To‘lovlar",
  "💵 Kutilayotgan daromad",
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
      // The console must open with the SAME first message Telegram sends.
      text: startNew(null),
    },
  ]);
  const [input, setInput] = useState("");
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [busy, setBusy] = useState(false);
  const counter = useRef(2);

  if (!BOT_CONSOLE_ENABLED) {
    const botUrl = BOT_USERNAME ? `https://t.me/${BOT_USERNAME.replace(/^@/, "")}` : null;
    return (
      <div className="animate-fade-up space-y-4">
        <Card className="module-card">
          <p className="text-[15px] font-semibold">Bot Telegram ichida ishlaydi</p>
          <p className="mt-2 text-[13px] leading-relaxed text-muted">
Botga Telegram chatidan /start, /report, /forecast yoki /help yuboring. Operatsiyalar Mini App bilan bir xil bazaga yoziladi.
          </p>
          {botUrl ? (
            <a
              href={botUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-4 inline-flex min-h-11 items-center justify-center rounded-full bg-primary px-4 text-sm font-semibold text-primary-fg"
            >
              Telegram botni ochish
            </a>
          ) : (
            <p className="mt-4 rounded-xl bg-warning-soft px-3 py-2 text-[12px] text-warning-text">
              Bot havolasi hozircha mavjud emas.
            </p>
          )}
        </Card>
        <Card className="module-card">
          <p className="mb-2 text-[15px] font-semibold">Botda nima bor</p>
          <p className="text-[13px] leading-7 text-muted">{BUTTON.income} · {BUTTON.expense} · {BUTTON.transfer}</p>
          <p className="text-[13px] leading-7 text-muted">/start · /report · /forecast · /help</p>
        </Card>
      </div>
    );
  }

  if (loading && !state) return <Skeleton className="h-96 w-full" />;

  async function send(text: string, confirm?: Record<string, unknown> | null) {
    const value = text.trim();
    if (!value && !confirm) return;
    setMessages((prev) => [...prev, { id: counter.current++, role: "user", text: value || "✅ Tasdiqlash" }]);
    setInput("");
    setDrafts([]);
    setBusy(true);
    try {
      const res = await fetch("/api/bot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: value, confirm }),
      });
      const reply = (await res.json()) as { text: string; draft?: Draft; drafts?: Draft[] };
      setMessages((prev) => [...prev, { id: counter.current++, role: "bot", text: reply.text }]);
      if (reply.drafts?.length) setDrafts(reply.drafts);
      else if (reply.draft) setDrafts([reply.draft]);
      if (confirm) await refresh();
    } catch {
      setMessages((prev) => [...prev, { id: counter.current++, role: "bot", text: ERRORS.connection }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="animate-fade-up space-y-4">
      <Card padded={false} className="module-card overflow-hidden">
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
                <div className="animate-shimmer rounded-2xl border border-line bg-surface-2 px-4 py-2.5 text-[13px] text-muted">Yuklanmoqda…</div>
              </div>
            ) : null}
          </div>

          {drafts.length ? (
            <div className="border-t border-line bg-surface-2 p-3.5 sm:p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
                {drafts.length > 1 ? `${drafts.length} ta operatsiya` : "Tasdiqlash"}
              </p>
              <div className="mt-1 space-y-1">
                {drafts.map((d, i) => (
                  <p key={i} className="text-[13px] leading-snug">
                    {drafts.length > 1 ? `${i + 1}. ` : ""}
                    {d.type === "income" ? "➕ Daromad" : d.type === "transfer" ? "↔️ Transfer" : "➖ Xarajat"} ·{" "}
                    {d.amount === null ? "—" : formatAmount(d.amount)} · {d.categoryName ?? "kategoriya yo‘q"} · {d.date}
                  </p>
                ))}
              </div>
              <div className="mt-3 flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="positive"
                  onClick={() =>
                    send("ha", {
                      drafts: drafts.map((d) => ({ ...d, note: d.note || d.categoryName || "operatsiya" })),
                    })
                  }
                >
                  ✅ Tasdiqlash
                </Button>
                <Button type="button" size="sm" variant="secondary" onClick={() => setDrafts([])}>
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

      <Card className="module-card">
        <p className="mb-2 text-[15px] font-semibold">Botda nima bor</p>
        <div className="grid grid-cols-1 gap-2 text-[12.5px] leading-snug text-muted sm:grid-cols-2">
          <p>{BUTTON.income} · {BUTTON.expense} · {BUTTON.transfer}</p>
          <p>✍️ Operatsiyani o‘z so‘zingiz bilan yozish</p>
          <p>📊 /report — bugun va bu oy</p>
          <p>📅 /forecast — kelayotgan to‘lovlar</p>
        </div>
      </Card>
    </div>
  );
}

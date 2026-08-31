import { roundMoney } from "./money";
import type { PaymentSchedule, ScheduleItem } from "./payment-schedule-parser";

/**
 * Deterministic `/kredit` format. It intentionally accepts only complete,
 * auditable allocations; ambiguous bank PDFs/images stay in preview until a
 * future local document parser can produce this same shape.
 *
 * /kredit Uzum Bank
 * 2026-09-07 | 2358493.53 | 2061808.60 | 296684.93 | 0
 */
export function parseCreditCommand(text: string): { schedule: PaymentSchedule | null; error: string | null } {
  const source = text.trim().replace(/^\/kredit(?:@[a-z0-9_]+)?\s*/i, "");
  const lines = source.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length < 3) return { schedule: null, error: null };
  const name = lines[0].slice(0, 120);
  const items: ScheduleItem[] = [];
  for (const [offset, line] of lines.slice(1).entries()) {
    const values = line.split("|").map((value) => value.trim().replace(/\s/g, "").replace(",", "."));
    if (values.length < 4 || values.length > 5 || !/^\d{4}-\d{2}-\d{2}$/.test(values[0])) {
      return { schedule: null, error: "Har qator: sana | jami | asosiy qism | foiz | komissiya bo‘lishi kerak." };
    }
    const date = new Date(`${values[0]}T00:00:00Z`);
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== values[0]) return { schedule: null, error: `${offset + 1}-to‘lov sanasi noto‘g‘ri.` };
    const nums = values.slice(1).map(Number);
    if (nums.some((value) => !Number.isFinite(value) || value < 0)) return { schedule: null, error: `${offset + 1}-to‘lov summasi noto‘g‘ri.` };
    const [amount, principalAmount, interestAmount, feeAmount = 0] = nums;
    if (amount <= 0 || roundMoney(principalAmount + interestAmount + feeAmount) !== roundMoney(amount)) {
      return { schedule: null, error: `${offset + 1}-to‘lovda asosiy qism + foiz + komissiya jami summaga teng bo‘lishi kerak.` };
    }
    items.push({ index: offset + 1, date: values[0], amount: roundMoney(amount), principalAmount: roundMoney(principalAmount), interestAmount: roundMoney(interestAmount), feeAmount: roundMoney(feeAmount), rawSegment: line });
  }
  if (new Set(items.map((item) => item.date)).size !== items.length) return { schedule: null, error: "Bir sana ikki marta berilgan." };
  items.sort((a, b) => a.date.localeCompare(b.date));
  return { schedule: { type: "payment-schedule", name, items, totalAmount: roundMoney(items.reduce((sum, item) => sum + item.amount, 0)), rawInput: text }, error: null };
}

export const CREDIT_COMMAND_HELP = [
  "📋 Kredit importi",
  "",
  "PDF, Excel, CSV, rasm yoki jadval matnini yuborish keyingi bosqichda shu buyruqqa ulanadi. Hozir AI ishlatmasdan, aniq jadvalni shu formatda yuboring:",
  "",
  "/kredit Uzum Bank",
  "2026-09-07 | 2358493.53 | 2061808.60 | 296684.93 | 0",
  "2026-10-07 | 2358493.53 | 2179749.93 | 178743.60 | 0",
  "",
  "Tartib: sana | jami | asosiy qism | foiz | komissiya.",
  "Avval preview chiqadi; tasdiqlamaguningizcha hech narsa saqlanmaydi.",
].join("\n");

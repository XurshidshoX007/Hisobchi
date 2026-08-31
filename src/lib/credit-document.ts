import { unzipSync } from "fflate";
import { telegramApi } from "./telegram";
import { telegramBotToken } from "./env";
import { roundMoney } from "./money";
import type { PaymentSchedule, ScheduleItem } from "./payment-schedule-parser";

const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;
const decoder = new TextDecoder("utf-8");

type TelegramFile = { file_path?: string; file_size?: number };

export type CreditDocument = { fileId: string; fileName?: string; mimeType?: string };

export async function downloadCreditDocument(file: CreditDocument, context: { requestId: string; userId: number | null }): Promise<Buffer | null> {
  const token = telegramBotToken();
  if (!token) return null;
  const info = await telegramApi<TelegramFile>("getFile", { file_id: file.fileId }, context, { timeoutMs: 10_000 });
  if (!info.ok || !info.result?.file_path || (info.result.file_size ?? 0) > MAX_DOCUMENT_BYTES) return null;
  try {
    const response = await fetch(`https://api.telegram.org/file/bot${token}/${info.result.file_path}`, { signal: AbortSignal.timeout(20_000), cache: "no-store" });
    if (!response.ok || Number(response.headers.get("content-length") ?? 0) > MAX_DOCUMENT_BYTES) return null;
    const data = Buffer.from(await response.arrayBuffer());
    return data.byteLength <= MAX_DOCUMENT_BYTES ? data : null;
  } catch {
    return null;
  }
}

function xmlText(xml: string): string {
  return xml
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&#(?:x([\da-f]+)|(\d+));/gi, (_, hex, dec) => String.fromCodePoint(Number.parseInt(hex || dec, hex ? 16 : 10)))
    .replace(/\s+/g, " ").trim();
}

function zipEntries(bytes: Buffer): Record<string, Uint8Array> | null {
  try { return unzipSync(bytes); } catch { return null; }
}

function docxText(bytes: Buffer): string | null {
  const entries = zipEntries(bytes);
  const source = entries?.["word/document.xml"];
  if (!source) return null;
  return decoder.decode(source)
    .replace(/<w:tr\b[^>]*>/g, "\n")
    .replace(/<w:tc\b[^>]*>/g, " | ")
    .replace(/<w:p\b[^>]*>/g, "\n")
    .replace(/<w:tab\b[^>]*\/>/g, " | ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+\|\s+/g, " | ")
    .replace(/[ \t]+\n/g, "\n");
}

function columnIndex(ref: string): number {
  return ref.replace(/\d/g, "").split("").reduce((value, char) => value * 26 + char.charCodeAt(0) - 64, 0);
}

function xlsxText(bytes: Buffer): string | null {
  const entries = zipEntries(bytes);
  if (!entries) return null;
  const sharedXml = entries["xl/sharedStrings.xml"] ? decoder.decode(entries["xl/sharedStrings.xml"]) : "";
  const shared = [...sharedXml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map((match) => xmlText(match[1]));
  const sheets = Object.entries(entries).filter(([name]) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name)).sort(([a], [b]) => a.localeCompare(b));
  const lines: string[] = [];
  for (const [, data] of sheets.slice(0, 3)) {
    const xml = decoder.decode(data);
    for (const rowMatch of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
      const cells: Array<{ col: number; value: string }> = [];
      for (const cell of rowMatch[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
        const attrs = cell[1]; const content = cell[2];
        const ref = attrs.match(/\br="([A-Z]+\d+)"/)?.[1] ?? "A1";
        const raw = content.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? content.match(/<t[^>]*>([\s\S]*?)<\/t>/)?.[1] ?? "";
        const value = /\bt="s"/.test(attrs) ? shared[Number(raw)] ?? "" : xmlText(raw);
        if (value) cells.push({ col: columnIndex(ref), value });
      }
      const line = cells.sort((a, b) => a.col - b.col).map((cell) => cell.value).join(" | ");
      if (line) lines.push(line);
    }
  }
  return lines.join("\n") || null;
}

async function pdfText(bytes: Buffer): Promise<string | null> {
  try {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), disableWorker: true } as Parameters<typeof pdfjs.getDocument>[0]).promise;
    const lines: string[] = [];
    for (let pageNo = 1; pageNo <= Math.min(doc.numPages, 20); pageNo++) {
      const page = await doc.getPage(pageNo);
      const content = await page.getTextContent();
      const byY = new Map<number, Array<{ x: number; value: string }>>();
      for (const item of content.items as Array<{ str?: string; transform?: number[] }>) {
        if (!item.str?.trim()) continue;
        const y = Math.round((item.transform?.[5] ?? 0) / 2) * 2;
        byY.set(y, [...(byY.get(y) ?? []), { x: item.transform?.[4] ?? 0, value: item.str }]);
      }
      for (const [, row] of [...byY.entries()].sort((a, b) => b[0] - a[0])) lines.push(row.sort((a, b) => a.x - b.x).map((item) => item.value).join(" "));
    }
    return lines.join("\n") || null;
  } catch { return null; }
}

export async function extractCreditDocumentText(bytes: Buffer, fileName = "", mimeType = ""): Promise<string | null> {
  const lower = `${fileName} ${mimeType}`.toLowerCase();
  if (bytes.subarray(0, 5).toString("ascii") === "%PDF-" || lower.includes("pdf")) return pdfText(bytes);
  if (/\.docx(?:\s|$)/.test(lower) || lower.includes("wordprocessingml")) return docxText(bytes);
  if (/\.xlsx(?:\s|$)/.test(lower) || lower.includes("spreadsheetml")) return xlsxText(bytes);
  if (/\.(?:csv|txt)(?:\s|$)/.test(lower) || mimeType.startsWith("text/")) return decoder.decode(bytes);
  return null;
}

function parseMoney(value: string): number | null {
  const normalized = value.trim().replace(/\u00a0/g, " ").replace(/\s/g, "").replace(/\.(?=\d{3}(?:\D|$))/g, "").replace(",", ".");
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
  const amount = Number(normalized);
  return Number.isFinite(amount) && amount >= 0 ? roundMoney(amount) : null;
}

function parseDate(value: string): string | null {
  const iso = value.match(/\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  const dot = value.match(/\b(\d{1,2})[./-](\d{1,2})[./-](20\d{2})\b/);
  return dot ? `${dot[3]}-${dot[2].padStart(2, "0")}-${dot[1].padStart(2, "0")}` : null;
}

/** Extract only rows whose three components reconcile exactly; never guess. */
export function parseCreditDocumentText(text: string, name = "Kredit"): PaymentSchedule | null {
  const items: ScheduleItem[] = [];
  for (const line of text.split(/\r?\n/)) {
    const date = parseDate(line);
    if (!date) continue;
    const withoutDate = line.replace(/\b(?:20\d{2})[-/.]\d{1,2}[-/.]\d{1,2}\b|\b\d{1,2}[./-]\d{1,2}[./-]20\d{2}\b/, " ");
    const values = [...withoutDate.matchAll(/\d[\d\s.,]*/g)].map((match) => parseMoney(match[0])).filter((value): value is number => value !== null);
    if (values.length < 3) continue;
    const [amount, principalAmount, interestAmount, feeAmount = 0] = values;
    if (amount <= 0 || roundMoney(principalAmount + interestAmount + feeAmount) !== amount) continue;
    items.push({ index: items.length + 1, date, amount, principalAmount, interestAmount, feeAmount, rawSegment: line });
  }
  if (items.length < 2 || new Set(items.map((item) => item.date)).size !== items.length) return null;
  items.sort((a, b) => a.date.localeCompare(b.date));
  return { type: "payment-schedule", name: name.replace(/\.[^.]+$/, "").slice(0, 120) || "Kredit", items, totalAmount: roundMoney(items.reduce((sum, item) => sum + item.amount, 0)), rawInput: text };
}

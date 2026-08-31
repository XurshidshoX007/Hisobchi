import { deflateRawSync } from "node:zlib";
import type { AppState } from "./types";
import { todayISO } from "./money";

type Cell = string | number | null | undefined;
type SheetDefinition = { name: string; rows: Cell[][]; widths: number[]; moneyColumns?: number[] };

const CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function xml(value: Cell): string {
  return String(value ?? "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function columnName(index: number): string {
  let result = "";
  let value = index + 1;
  while (value > 0) {
    const remainder = (value - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    value = Math.floor((value - 1) / 26);
  }
  return result;
}

function worksheetXml(definition: SheetDefinition): string {
  const maxRow = definition.rows.length;
  const maxColumn = Math.max(...definition.rows.map((row) => row.length), 1);
  const widths = definition.widths
    .map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`)
    .join("");
  const rows = definition.rows
    .map((row, rowIndex) => {
      const cells = row
        .map((value, columnIndex) => {
          const reference = `${columnName(columnIndex)}${rowIndex + 1}`;
          const style = rowIndex === 0 ? " s=\"1\"" : definition.moneyColumns?.includes(columnIndex) && typeof value === "number" ? " s=\"2\"" : "";
          if (typeof value === "number" && Number.isFinite(value)) return `<c r="${reference}"${style}><v>${value}</v></c>`;
          return `<c r="${reference}" t="inlineStr"${style}><is><t xml:space="preserve">${xml(value)}</t></is></c>`;
        })
        .join("");
      return `<row r="${rowIndex + 1}">${cells}</row>`;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
  <cols>${widths}</cols>
  <sheetData>${rows}</sheetData>
  <autoFilter ref="A1:${columnName(maxColumn - 1)}${maxRow}"/>
</worksheet>`;
}

function crc32(bytes: Buffer): number {
  let value = 0xffffffff;
  for (const byte of bytes) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit += 1) value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
  }
  return (value ^ 0xffffffff) >>> 0;
}

/** Minimal ZIP writer for the Office Open XML package. No reader/parser is
 * shipped: exports only create files from our own trusted ledger data. */
function zip(parts: Array<{ path: string; content: string }>): Buffer {
  const local: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;

  for (const part of parts) {
    const name = Buffer.from(part.path, "utf8");
    const raw = Buffer.from(part.content, "utf8");
    const compressed = deflateRawSync(raw);
    const checksum = crc32(raw);
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0x0800, 6);
    localHeader.writeUInt16LE(8, 8);
    localHeader.writeUInt32LE(checksum, 14);
    localHeader.writeUInt32LE(compressed.length, 18);
    localHeader.writeUInt32LE(raw.length, 22);
    localHeader.writeUInt16LE(name.length, 26);
    localHeader.writeUInt16LE(0, 28);
    local.push(localHeader, name, compressed);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0x0800, 8);
    centralHeader.writeUInt16LE(8, 10);
    centralHeader.writeUInt32LE(checksum, 16);
    centralHeader.writeUInt32LE(compressed.length, 20);
    centralHeader.writeUInt32LE(raw.length, 24);
    centralHeader.writeUInt16LE(name.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);
    central.push(centralHeader, name);
    offset += localHeader.length + name.length + compressed.length;
  }

  const centralBytes = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(parts.length, 8);
  end.writeUInt16LE(parts.length, 10);
  end.writeUInt32LE(centralBytes.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, centralBytes, end]);
}

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <numFmts count="1"><numFmt numFmtId="164" formatCode="#\,##0.00"/></numFmts>
  <fonts count="2"><font><sz val="11"/><name val="Aptos"/></font><font><b/><color rgb="FF16181E"/><sz val="11"/><name val="Aptos"/></font></fonts>
  <fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF5B544"/><bgColor indexed="64"/></patternFill></fill></fills>
  <borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs>
</styleSheet>`;

function typeLabel(type: string): string {
  return type === "income" ? "Daromad" : type === "expense" ? "Xarajat" : "Transfer";
}

/** Builds an actual .xlsx workbook entirely from the current authenticated
 * user's already-projected state. It never accepts uploaded spreadsheet data. */
export function buildFinanceXlsx(state: AppState): { body: Buffer; filename: string; contentType: string } {
  const operations: Cell[][] = [
    ["Sana", "Turi", "Summa", "Valyuta", "Kategoriya", "Hisob", "Qabul qiluvchi hisob", "Izoh", "Manba"],
    ...state.transactions
      .filter((transaction) => !transaction.isDeleted)
      .sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id)
      .map((transaction) => [
        transaction.date,
        typeLabel(transaction.type),
        transaction.amount,
        transaction.currency ?? state.user.currency,
        transaction.categoryName ?? "—",
        transaction.accountName,
        transaction.toAccountName ?? "—",
        transaction.note ?? "",
        transaction.source === "bot" ? "Telegram bot" : "Mini App",
      ]),
  ];
  const accounts: Cell[][] = [
    ["Hisob", "Turi", "Boshlang‘ich balans", "Joriy balans", "Valyuta", "Holat", "Kirim", "Chiqim", "Operatsiyalar"],
    ...state.accounts.map((account) => [
      account.name,
      account.type,
      account.initialBalance,
      account.currentBalance,
      account.currency,
      account.isActive ? "Faol" : "Yopiq",
      account.inflow,
      account.outflow,
      account.txCount,
    ]),
  ];
  const overview: Cell[][] = [
    ["Hisobchi eksporti", ""],
    ["Foydalanuvchi", state.user.firstName],
    ["Yaratilgan sana", todayISO()],
    ["Operatsiyalar", operations.length - 1],
    ["Hisoblar", accounts.length - 1],
  ];
  const sheets: SheetDefinition[] = [
    { name: "Operatsiyalar", rows: operations, widths: [13, 14, 16, 11, 20, 20, 22, 36, 16], moneyColumns: [2] },
    { name: "Hisoblar", rows: accounts, widths: [22, 16, 18, 18, 11, 12, 16, 16, 14], moneyColumns: [2, 3, 6, 7] },
    { name: "Ma’lumot", rows: overview, widths: [22, 30] },
  ];
  const sheetParts = sheets.map((sheet, index) => ({ path: `xl/worksheets/sheet${index + 1}.xml`, content: worksheetXml(sheet) }));
  const workbookSheets = sheets.map((sheet, index) => `<sheet name="${xml(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join("");
  const workbookRelationships = sheets.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join("");
  const contentOverrides = sheets.map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("");

  const body = zip([
    { path: "[Content_Types].xml", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${contentOverrides}</Types>` },
    { path: "_rels/.rels", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
    { path: "xl/workbook.xml", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${workbookSheets}</sheets></workbook>` },
    { path: "xl/_rels/workbook.xml.rels", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${workbookRelationships}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
    { path: "xl/styles.xml", content: STYLES },
    ...sheetParts,
  ]);
  return { body, filename: `hisobchi-eksport-${todayISO()}.xlsx`, contentType: CONTENT_TYPE };
}

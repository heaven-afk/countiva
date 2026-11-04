import * as XLSX from "xlsx";
import type { ImportTable } from "./record-import";
export function readSpreadsheet(
  buffer: ArrayBuffer,
  sheetIndex = 0,
): ImportTable {
  const book = XLSX.read(buffer, {
    type: "array",
    sheetRows: 1002,
    cellDates: false,
    cellFormula: true,
    dateNF: "yyyy-mm-dd",
  });
  if (!book.SheetNames.length || book.SheetNames.length > 20)
    throw new Error("Use a workbook with 1–20 worksheets.");
  const sheet = book.Sheets[book.SheetNames[sheetIndex]];
  if (!sheet) throw new Error("Choose a worksheet.");
  const range = XLSX.utils.decode_range(
    sheet["!fullref"] || sheet["!ref"] || "A1",
  );
  if (range.e.r - range.s.r > 1000 || range.e.c - range.s.c > 29)
    throw new Error(
      "Use a worksheet with up to 1,000 data rows and 30 columns.",
    );
  for (const key of Object.keys(sheet)) {
    if (!key.startsWith("!") && sheet[key]?.f)
      throw new Error(
        "The worksheet contains formulas. Paste values into a new sheet before importing financial records.",
      );
  }
  const data = XLSX.utils.sheet_to_json<string[]>(sheet, {
    header: 1,
    raw: false,
    defval: "",
    blankrows: false,
    dateNF: "yyyy-mm-dd",
  });
  if (data.length < 2)
    throw new Error(
      "The worksheet needs a header row and at least one data row.",
    );
  return {
    headers: data[0].map(String),
    rows: data.slice(1).map((row) => row.map((value) => String(value ?? ""))),
    sheetNames: book.SheetNames,
  };
}
if (typeof self !== "undefined")
  self.addEventListener(
    "message",
    (event: MessageEvent<{ buffer: ArrayBuffer; sheetIndex: number }>) => {
      try {
        self.postMessage({
          ok: true,
          table: readSpreadsheet(event.data.buffer, event.data.sheetIndex),
        });
      } catch (error) {
        self.postMessage({ ok: false, error: (error as Error).message });
      }
    },
  );

"use client";
import Skeleton from "./skeleton";
import { useRef, useState } from "react";
import { Download, FileSpreadsheet, ImagePlus, Upload } from "lucide-react";
import {
  applyRecordImport,
  csvExport,
  importFields,
  importTemplate,
  parseCSV,
  recordExport,
  suggestMapping,
  validateImport,
  type ColumnMap,
  type ImportKind,
  type ImportTable,
} from "../lib/record-import";
import type { State } from "../lib/domain";
function download(name: string, body: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([body], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function spreadsheet(
  buffer: ArrayBuffer,
  sheetIndex: number,
): Promise<ImportTable> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL("../lib/import-worker.ts", import.meta.url),
      { type: "module" },
    );
    const timer = setTimeout(() => {
      worker.terminate();
      reject(
        new Error(
          "The workbook took too long to read. Export that worksheet as CSV and try again.",
        ),
      );
    }, 15000);
    worker.onmessage = (event) => {
      clearTimeout(timer);
      worker.terminate();
      event.data.ok
        ? resolve(event.data.table)
        : reject(new Error(event.data.error));
    };
    worker.onerror = () => {
      clearTimeout(timer);
      worker.terminate();
      reject(new Error("Could not read this workbook. Try a CSV export."));
    };
    worker.postMessage({ buffer, sheetIndex });
  });
}
export default function RecordImports({
  businessId,
  state,
  canImport,
  onImport,
  onPhoto,
}: {
  businessId: string;
  state: State;
  canImport: boolean;
  onImport: (change: (state: State) => Promise<State>) => Promise<void>;
  onPhoto: () => void;
}) {
  const [kind, setKind] = useState<ImportKind>("inventory"),
    [table, setTable] = useState<ImportTable | null>(null),
    [mapping, setMapping] = useState<ColumnMap>({}),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [existing, setExisting] = useState<"skip" | "receive">("skip"),
    [page, setPage] = useState(0),
    [sheet, setSheet] = useState(0);
  const input = useRef<HTMLInputElement>(null),
    buffer = useRef<ArrayBuffer | null>(null);
  const [reviewed, setReviewed] = useState(false),
    [batchReference, setBatchReference] = useState("");
  const validation = table
    ? validateImport(table, mapping, kind, state)
    : { rows: [], errors: [] };
  const reset = () => {
    setTable(null);
    setMapping({});
    setMessage("");
    setReviewed(false);
    setPage(0);
    buffer.current = null;
  };
  async function load(file: File) {
    reset();
    setBusy(true);
    try {
      if (file.size > 5 * 1024 * 1024)
        throw new Error("Choose a file under 5 MB.");
      const extension = file.name.split(".").pop()?.toLowerCase();
      let result: ImportTable;
      if (extension === "csv" || extension === "tsv") {
        result = parseCSV(await file.text());
      } else if (extension === "xls" || extension === "xlsx") {
        buffer.current = await file.arrayBuffer();
        result = await spreadsheet(buffer.current, 0);
      } else
        throw new Error(
          "Choose a CSV, TSV, XLS or XLSX file. Use the photo option for stock pictures.",
        );
      setTable(result);
      setMapping(suggestMapping(result.headers, kind));
      setBatchReference(file.name);
      setSheet(0);
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }
  async function changeSheet(index: number) {
    if (!buffer.current) return;
    setBusy(true);
    try {
      const result = await spreadsheet(buffer.current, index);
      setTable(result);
      setMapping(suggestMapping(result.headers, kind));
      setSheet(index);
      setReviewed(false);
      setPage(0);
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function commit() {
    if (!table || !canImport || validation.errors.length || !reviewed) return;
    setBusy(true);
    setMessage("");
    try {
      let summary = { added: 0, skipped: 0 };
      await onImport(async (latest) => {
        const check = validateImport(table, mapping, kind, latest);
        if (check.errors.length) throw new Error(check.errors[0]);
        const result = await applyRecordImport(
          latest,
          check.rows,
          kind,
          businessId,
          existing,
          batchReference,
        );
        summary = result;
        return result.state;
      });
      setMessage(
        `${summary.added} records imported; ${summary.skipped} existing records skipped. Changes are saved on this device and will sync online.`,
      );
      setTable(null);
      setReviewed(false);
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function exportFile(format: "csv" | "xlsx") {
    setBusy(true);
    try {
      const rows = recordExport(state, kind);
      if (format === "csv")
        download(
          `countiva-${kind}.csv`,
          csvExport(rows),
          "text/csv;charset=utf-8",
        );
      else {
        const XLSX = await import("xlsx");
        const book = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), kind);
        const data = XLSX.write(book, { bookType: "xlsx", type: "array" });
        download(
          `countiva-${kind}.xlsx`,
          data,
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        );
      }
    } catch {
      setMessage("Could not export these records. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel imports-panel">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">BRING YOUR RECORDS TOGETHER</span>
          <h2>Import & export</h2>
          <p>
            Preview and check every import before it changes your business
            records.
          </p>
        </div>
        <FileSpreadsheet size={25} />
      </div>
      <div className="imports-body">
        <div className="import-toolbar">
          <label>
            Record type
            <select
              value={kind}
              onChange={(e) => {
                reset();
                setKind(e.target.value as ImportKind);
              }}
            >
              <option value="inventory">Products & stock</option>
              <option value="sales">Historical sales</option>
              <option value="repayments">Customer repayments</option>
            </select>
          </label>
          <div className="import-actions">
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => void exportFile("csv")}
            >
              <Download size={16} />
              Export CSV
            </button>
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => void exportFile("xlsx")}
            >
              Export Excel
            </button>
          </div>
        </div>
        <p className="form-note">
          {kind === "inventory"
            ? "New products use the quantities in your file as opening stock. Existing products are skipped unless you explicitly choose to receive more stock."
            : kind === "sales"
              ? "Historical sales are imported with a matching stock offset, so they do not reduce your current stock count. Import the catalogue first. Use the same unique reference for every line in one sale."
              : "Import the original sales first. Each repayment needs its own unique reference and the original sale reference; overpayments are rejected."}{" "}
          Dates use ISO format and Africa/Lagos time. Prices are in naira.
          Maximum 1,000 rows / 5 MB.
        </p>
        <div className="import-actions">
          <button
            className="button primary"
            disabled={!canImport || busy}
            onClick={() => input.current?.click()}
          >
            <Upload size={17} />
            {busy ? "Working…" : "Choose CSV or Excel"}
          </button>
          <input
            ref={input}
            type="file"
            className="sr-only"
            accept=".csv,.tsv,.xls,.xlsx"
            onChange={(e) => {
              if (e.target.files?.[0]) void load(e.target.files[0]);
            }}
          />
          <button
            className="button secondary"
            disabled={!canImport || busy}
            onClick={onPhoto}
          >
            <ImagePlus size={17} />
            Import stock from photo
          </button>
          <button
            className="text-button"
            onClick={() =>
              download(
                `countiva-${kind}-template.csv`,
                csvExport([importTemplate(kind)]),
                "text/csv;charset=utf-8",
              )
            }
          >
            Download column template
          </button>
        </div>
        {!canImport && (
          <p className="form-note">
            Only an owner or manager with an active workspace can import
            records. You can still export your saved records.
          </p>
        )}
        {table && (
          <div className="import-review">
            <h3>1. Match your columns</h3>
            {table.sheetNames && (
              <label>
                Worksheet
                <select
                  value={sheet}
                  onChange={(e) => void changeSheet(+e.target.value)}
                >
                  {table.sheetNames.map((name, index) => (
                    <option key={name} value={index}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <div className="form-grid">
              {importFields(kind).map(([key, label, required]) => (
                <label key={key}>
                  {label}
                  {required ? " *" : " (optional)"}
                  <select
                    value={mapping[key] ?? -1}
                    onChange={(e) => {
                      setMapping({ ...mapping, [key]: +e.target.value });
                      setReviewed(false);
                    }}
                  >
                    <option value={-1}>Choose column</option>
                    {table.headers.map((name, index) => (
                      <option key={index} value={index}>
                        {name || `Column ${index + 1}`}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
            {kind === "inventory" && (
              <div className="form-grid">
                <label>
                  Products already in the catalogue
                  <select
                    value={existing}
                    onChange={(e) => {
                      setExisting(e.target.value as "skip" | "receive");
                      setReviewed(false);
                    }}
                  >
                    <option value="skip">Skip existing products</option>
                    <option value="receive">
                      Add these quantities to existing stock
                    </option>
                  </select>
                </label>
                <label>
                  Import reference
                  <input
                    value={batchReference}
                    onChange={(e) => {
                      setBatchReference(e.target.value);
                      setReviewed(false);
                    }}
                    maxLength={150}
                  />
                  <small>
                    Reuse a reference to avoid duplicates. Use a new reference
                    for a genuinely new delivery.
                  </small>
                </label>
              </div>
            )}
            <h3>2. Review the file</h3>
            <p className="form-note">
              {table.rows.length} rows · Edit cells below if needed, or correct
              the source file. Existing product prices are preserved.
            </p>
            {validation.errors.length > 0 && (
              <div className="banner error" role="alert">
                <div>
                  <strong>{validation.errors.length} issues to fix</strong>
                  <ul>
                    {validation.errors.slice(0, 8).map((text, index) => (
                      <li key={index}>{text}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
            <div className="table-wrap import-preview">
              <table>
                <thead>
                  <tr>
                    <th>Row</th>
                    {table.headers.map((h, i) => (
                      <th key={i}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {table.rows
                    .slice(page * 20, (page + 1) * 20)
                    .map((row, index) => (
                      <tr key={page * 20 + index}>
                        <td>{page * 20 + index + 2}</td>
                        {table.headers.map((_, col) => (
                          <td key={col}>
                            <input
                              aria-label={`Row ${page * 20 + index + 2}, ${table.headers[col]}`}
                              value={row[col] || ""}
                              onChange={(e) => {
                                const next = table.rows.map((r) => [...r]);
                                next[page * 20 + index][col] = e.target.value;
                                setTable({ ...table, rows: next });
                                setReviewed(false);
                              }}
                            />
                          </td>
                        ))}
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            <div className="import-pagination">
              <button
                className="button secondary"
                disabled={!page}
                onClick={() => setPage(page - 1)}
              >
                Previous
              </button>
              <span>
                Page {page + 1} of {Math.ceil(table.rows.length / 20)}
              </span>
              <button
                className="button secondary"
                disabled={(page + 1) * 20 >= table.rows.length}
                onClick={() => setPage(page + 1)}
              >
                Next
              </button>
            </div>
            <label className="check-label">
              <input
                type="checkbox"
                checked={reviewed}
                onChange={(e) => setReviewed(e.target.checked)}
              />
              I have checked the quantities, prices, dates and credit balances.
            </label>
            <button
              className="button primary"
              disabled={
                busy ||
                !canImport ||
                !reviewed ||
                !!validation.errors.length ||
                !validation.rows.length ||
                (kind === "inventory" && !batchReference.trim())
              }
              onClick={() => void commit()}
            >
              Confirm & import {validation.rows.length} rows
            </button>
          </div>
        )}
        {busy && <Skeleton compact label="Processing your file" />}
        {message && (
          <p className="banner" role="status">
            {message}
          </p>
        )}
      </div>
    </section>
  );
}

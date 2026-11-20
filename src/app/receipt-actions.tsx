"use client";
import { useEffect, useRef, useState } from "react";
import { Download, Printer } from "lucide-react";

export default function ReceiptActions({
  reference,
  disabled,
  onClose,
}: {
  reference: string;
  disabled: boolean;
  onClose: () => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState("");
  const [printFile, setPrintFile] = useState<File | null>(null);
  const [format, setFormat] = useState<"thermal" | "a4">("thermal");
  useEffect(() => {
    setPrintFile(null);
  }, [reference, disabled]);
  async function download(forPrint = false) {
    if (downloading || disabled) return;
    setDownloading(true);
    setError("");
    try {
      const receipt = container.current
        ?.closest(".receipt")
        ?.querySelector<HTMLElement>(".receipt-document");
      if (!receipt) throw new Error("Open a receipt before downloading.");
      const { downloadReceipt } = await import("../lib/receipt-export");
      await downloadReceipt(
        receipt,
        reference,
        format,
        forPrint ? setPrintFile : undefined,
      );
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Couldn’t download the receipt. Please try again.",
      );
    } finally {
      setDownloading(false);
    }
  }
  function print() {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone;
    if (standalone) void download(true);
    else window.print();
  }
  async function sharePrintFile() {
    if (!printFile) return;
    try {
      if (navigator.canShare?.({ files: [printFile] })) {
        // A second tap preserves the user gesture required by mobile share sheets.
        await navigator.share({
          files: [printFile],
          title: `Receipt ${reference}`,
        });
      } else {
        const url = URL.createObjectURL(printFile);
        const link = document.createElement("a");
        link.href = url;
        link.download = printFile.name;
        document.body.append(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
        setError("Open the downloaded PDF and choose Print from its menu.");
      }
    } catch (failure) {
      if (!(failure instanceof DOMException && failure.name === "AbortError"))
        setError(
          "Print options could not open. Download the PDF, then open it and choose Print.",
        );
    }
  }
  return (
    <div ref={container}>
      <label className="receipt-pdf-format">
        Download paper size
        <select
          value={format}
          disabled={disabled || downloading}
          onChange={(e) => {
            setFormat(e.target.value as "thermal" | "a4");
            setPrintFile(null);
          }}
        >
          <option value="thermal">Receipt size (58 / 80 mm)</option>
          <option value="a4">A4 · centred receipt</option>
        </select>
      </label>
      <div className="receipt-actions">
        <button
          type="button"
          className="button secondary"
          disabled={downloading}
          onClick={onClose}
        >
          Close
        </button>
        <button
          type="button"
          className="button secondary"
          disabled={disabled || downloading}
          onClick={print}
        >
          <Printer size={16} /> Print receipt
        </button>
        <button
          type="button"
          className="button primary"
          disabled={disabled || downloading}
          onClick={() => void download()}
        >
          <Download size={16} />
          {downloading ? "Preparing PDF…" : "Download PDF"}
        </button>
      </div>
      {printFile && (
        <div className="receipt-print-ready" role="status">
          <p>
            Your receipt PDF is ready. Open the options and choose Print. If
            Print is unavailable, save the PDF and print it from Files or your
            PDF viewer.
          </p>
          <button
            type="button"
            className="button primary"
            onClick={() => void sharePrintFile()}
          >
            Open print / share options
          </button>
        </div>
      )}
      {error && (
        <p className="banner receipt-export-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

"use client";
import { useRef, useState } from "react";
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
  async function download() {
    if (downloading || disabled) return;
    setDownloading(true);
    setError("");
    try {
      const receipt = container.current
        ?.closest(".receipt")
        ?.querySelector<HTMLElement>(".receipt-document");
      if (!receipt) throw new Error("Open a receipt before downloading.");
      const { downloadReceipt } = await import("../lib/receipt-export");
      await downloadReceipt(receipt, reference);
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
  return (
    <div ref={container}>
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
          onClick={() => window.print()}
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
      {error && (
        <p className="banner receipt-export-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

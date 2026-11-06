"use client";
import { useEffect, useRef, useState } from "react";
import { Pencil, RefreshCw, Save } from "lucide-react";
import { getSupabase } from "../lib/supabase";
import { phoneInput } from "../lib/input-format";
import type { Sale } from "../lib/domain";
import {
  parseReceiptDetails,
  type ReceiptDetails,
  type SavedReceiptDetails,
} from "../lib/receipt-details";
import Skeleton from "./skeleton";

export default function ReceiptEditor({
  businessId,
  sale,
  onPrepare,
  onSaved,
  onEditingChange,
}: {
  businessId: string;
  sale: Sale;
  onPrepare: () => Promise<void>;
  onSaved: (sale: Sale) => void;
  onEditingChange: (editing: boolean) => void;
}) {
  const [open, setOpen] = useState(false),
    [loading, setLoading] = useState(false),
    [saving, setSaving] = useState(false),
    [message, setMessage] = useState(""),
    [saved, setSaved] = useState<SavedReceiptDetails | null>(null),
    [draft, setDraft] = useState<ReceiptDetails>(() =>
      parseReceiptDetails(sale.receiptDetails || {}, sale),
    );
  const form = useRef<HTMLFormElement>(null),
    version = useRef(0);
  useEffect(
    () => () => {
      version.current++;
      onEditingChange(false);
    },
    [onEditingChange],
  );
  useEffect(() => {
    if (open && !loading && saved?.canEdit)
      form.current?.querySelector<HTMLInputElement>("input")?.focus();
  }, [open, loading, saved?.canEdit]);
  async function load() {
    const revision = ++version.current;
    setLoading(true);
    setSaved(null);
    setMessage("");
    try {
      if (!navigator.onLine)
        throw new Error(
          "Connect to the internet to save receipt changes across your devices.",
        );
      await onPrepare();
      const client = getSupabase();
      if (!client) throw new Error("Account services are unavailable.");
      const result = await client.rpc("get_sale_receipt", {
        bid: businessId,
        sale_ref: sale.id,
      });
      if (result.error) throw result.error;
      if (revision !== version.current) return;
      setSaved(result.data);
      setDraft(parseReceiptDetails(result.data.details || {}, sale));
      if (!result.data.canEdit)
        setMessage(
          "Editing requires active access and the business owner, a manager, or the person who recorded this sale.",
        );
    } catch (e) {
      if (revision === version.current)
        setMessage(
          (e as { code?: string }).code === "PGRST202"
            ? "Receipt editing is being set up. Please try again later."
            : (e as Error).message,
        );
    } finally {
      if (revision === version.current) setLoading(false);
    }
  }
  function begin() {
    setOpen(true);
    onEditingChange(true);
    void load();
  }
  function close() {
    version.current++;
    setOpen(false);
    onEditingChange(false);
    setMessage("");
  }
  function updateItem(
    index: number,
    change: Partial<ReceiptDetails["items"][number]>,
  ) {
    setDraft((current) => {
      const old = current.items.find((item) => item.lineIndex === index) || {
        lineIndex: index,
        productId: sale.lines[index].productId,
        description: "",
        identifierType: "none" as const,
        identifiers: [],
      };
      return {
        ...current,
        items: [
          ...current.items.filter((item) => item.lineIndex !== index),
          { ...old, ...change },
        ].sort((a, b) => a.lineIndex - b.lineIndex),
      };
    });
  }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!saved?.canEdit || saving) return;
    setSaving(true);
    setMessage("");
    try {
      if (!navigator.onLine)
        throw new Error(
          "Connect to the internet to save these receipt changes.",
        );
      const clean = parseReceiptDetails(
        {
          ...draft,
          items: draft.items
            .map((item) => ({
              ...item,
              identifiers:
                item.identifierType === "none"
                  ? []
                  : item.identifiers
                      .map((value) => value.trim())
                      .filter(Boolean),
            }))
            .filter(
              (item) => item.description.trim() || item.identifiers.length,
            ),
        },
        sale,
      );
      const result = await getSupabase()!.rpc("update_sale_receipt", {
        bid: businessId,
        sale_ref: sale.id,
        expected_revision: saved.revision,
        details: clean,
      });
      if (result.error) throw result.error;
      onSaved({
        ...sale,
        receiptDetails: result.data.details,
        receiptRevision: result.data.revision,
        receiptUpdatedAt: result.data.updatedAt,
        sync: "synced",
      });
      setSaved(result.data);
      setOpen(false);
      onEditingChange(false);
      setMessage(
        "Receipt details saved. Print or save the updated copy below.",
      );
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="receipt-editor">
      {!open ? (
        <button type="button" className="button secondary" onClick={begin}>
          <Pencil size={16} />
          Edit receipt details
        </button>
      ) : (
        <section aria-label="Edit receipt details">
          <div className="receipt-editor-heading">
            <div>
              <h3>Edit receipt details</h3>
              <p>
                Add customer details, descriptions and optional IMEI or serial
                numbers. Sales figures and credit records retain their original
                values.
              </p>
            </div>
            <button
              type="button"
              className="button secondary"
              disabled={saving}
              onClick={close}
            >
              Cancel
            </button>
          </div>
          {loading && <Skeleton compact label="Loading the saved receipt" />}
          <form ref={form} onSubmit={submit}>
            <fieldset disabled={loading || saving || !saved?.canEdit}>
              <legend>Customer & receipt information</legend>
              <div className="receipt-editor-fields">
                <label>
                  Customer name on receipt
                  <input
                    maxLength={300}
                    value={draft.customerName}
                    onChange={(e) =>
                      setDraft({ ...draft, customerName: e.target.value })
                    }
                  />
                  <small>
                    Leave blank to use the customer recorded on the sale.
                  </small>
                </label>
                <label>
                  Customer phone · optional
                  <input
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    maxLength={40}
                    value={draft.customerPhone}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        customerPhone: phoneInput(e.target.value),
                      })
                    }
                  />
                </label>
                <label>
                  Order / job reference · optional
                  <input
                    maxLength={80}
                    value={draft.reference}
                    onChange={(e) =>
                      setDraft({ ...draft, reference: e.target.value })
                    }
                  />
                  <small>The original receipt reference is retained.</small>
                </label>
              </div>
              <label>
                Receipt description / note · optional
                <textarea
                  rows={3}
                  maxLength={1000}
                  value={draft.description}
                  onChange={(e) =>
                    setDraft({ ...draft, description: e.target.value })
                  }
                />
              </label>
              <h4>Item details</h4>
              <p className="form-note">
                Choose the identifier that suits each item. These fields appear
                on the receipt; they do not track individual inventory units.
              </p>
              {sale.lines.map((line, index) => {
                const item = draft.items.find(
                  (entry) => entry.lineIndex === index,
                );
                const kind = item?.identifierType || "none";
                return (
                  <div className="receipt-editor-item" key={index}>
                    <strong>{line.name}</strong>
                    <small>
                      {line.quantity} {line.unit}
                    </small>
                    <label>
                      Item description · optional
                      <textarea
                        rows={2}
                        maxLength={500}
                        value={item?.description || ""}
                        onChange={(e) =>
                          updateItem(index, { description: e.target.value })
                        }
                      />
                    </label>
                    <div className="receipt-editor-fields">
                      <label>
                        Identifier type
                        <select
                          value={kind}
                          onChange={(e) =>
                            updateItem(index, {
                              identifierType: e.target.value as
                                "none" | "imei" | "serial",
                            })
                          }
                        >
                          <option value="none">No identifier needed</option>
                          <option value="imei">
                            IMEI · phones / cellular devices
                          </option>
                          <option value="serial">
                            Serial number · other numbered stock
                          </option>
                        </select>
                      </label>
                      {kind !== "none" && (
                        <label>
                          {kind === "imei" ? "IMEI numbers" : "Serial numbers"}{" "}
                          · optional
                          <textarea
                            rows={3}
                            maxLength={10100}
                            inputMode={kind === "imei" ? "numeric" : "text"}
                            value={(item?.identifiers || []).join("\n")}
                            onChange={(e) =>
                              updateItem(index, {
                                identifiers: (kind === "imei"
                                  ? e.target.value.replace(/[^\d\n]/g, "")
                                  : e.target.value
                                ).split("\n"),
                              })
                            }
                          />
                          <small>
                            {kind === "imei"
                              ? "Exactly 15 digits per IMEI."
                              : "Letters, numbers and punctuation are supported."}{" "}
                            Enter one per line, up to 100 per item.
                          </small>
                        </label>
                      )}
                    </div>
                  </div>
                );
              })}
              <button type="submit" className="button primary">
                <Save size={16} />
                {saving ? "Saving receipt…" : "Save receipt details"}
              </button>
            </fieldset>
          </form>
          <div className="receipt-editor-reload">
            <button
              type="button"
              className="text-button"
              disabled={loading || saving}
              onClick={() => void load()}
            >
              <RefreshCw size={15} />
              Reload latest receipt
            </button>
            <small>Reloading discards unsaved field changes.</small>
          </div>
          {saved?.history.length ? (
            <details className="receipt-edit-history">
              <summary>
                Receipt edit history · revision {saved.revision}
              </summary>
              {saved.history.map((entry) => (
                <p key={entry.revision}>
                  Revision {entry.revision} · {entry.editorName}
                  <small>
                    {new Date(entry.editedAt).toLocaleString("en-NG", {
                      timeZone: "Africa/Lagos",
                    })}
                  </small>
                </p>
              ))}
            </details>
          ) : null}
        </section>
      )}
      {message && (
        <p className="banner" role="status">
          {message}
        </p>
      )}
    </div>
  );
}

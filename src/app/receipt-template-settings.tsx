"use client";
import { useState } from "react";
import { Lock, Check } from "lucide-react";
import type { Workspace } from "../lib/contracts";
import type { Sale, State } from "../lib/domain";
import type { ReceiptTemplate } from "../lib/plans";
import { getSupabase } from "../lib/supabase";
import useEntitlements from "./use-entitlements";
import ReceiptDocument from "./receipt-document";
const templates = [
  {
    id: "classic",
    name: "Classic",
    description: "Centred branding and familiar itemised totals.",
  },
  {
    id: "minimal",
    name: "Minimal",
    description: "A clean, left-aligned receipt with plenty of breathing room.",
  },
  {
    id: "ledger",
    name: "Ledger",
    description: "Structured details and fine ruled rows.",
  },
  {
    id: "bold",
    name: "Signature",
    description: "A strong merchant heading and a clear total band.",
  },
] as const;
export default function ReceiptTemplateSettings({
  workspace,
  onSaved,
}: {
  workspace: Workspace;
  onSaved: (workspace: Workspace) => void;
}) {
  const { entitlements } = useEntitlements(workspace.id);
  const [selected, setSelected] = useState<ReceiptTemplate>(
      workspace.receipt_template || "classic",
    ),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const sample: Sale = {
    id: "00000000-0000-4000-8000-000000000001",
    createdAt: new Date().toISOString(),
    lines: [
      {
        productId: "preview",
        name: "Example product",
        quantity: 2,
        unit: "units",
        price: 250000,
        cost: 150000,
      },
    ],
    total: 500000,
    paid: 500000,
    method: "Cash",
    customer: "Preview customer",
    sync: "synced",
  };
  const state: State = {
    products: [],
    sales: [sample],
    payments: [],
    movements: [],
  };
  async function save() {
    if (workspace.role !== "owner") return;
    setBusy(true);
    try {
      const { data, error } = await getSupabase()!.rpc(
        "update_business_settings",
        {
          bid: workspace.id,
          details: {
            name: workspace.name,
            business_type: workspace.business_type || "Retail shop",
            phone: workspace.phone || "",
            address: workspace.address || "",
            receipt_footer:
              workspace.receipt_footer || "Thank you for shopping with us.",
            receipt_width: workspace.receipt_width || 80,
            logo_url: workspace.logo_url || "",
            receipt_template: selected,
          },
        },
      );
      if (error) throw error;
      onSaved({ ...data, role: workspace.role });
      setMessage(
        "Receipt template saved. Previous receipts keep their original design.",
      );
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="settings-section receipt-template-settings">
      <h3>Receipt templates</h3>
      <p>
        Starter includes Classic and Minimal. Growth includes all four designs.
        Each completed sale keeps its original template and business details.
      </p>
      <div className="receipt-template-options">
        {templates.map((template) => {
          const allowed = entitlements?.receiptTemplates.includes(template.id);
          return (
            <button
              key={template.id}
              className={`receipt-template-choice ${selected === template.id ? "selected" : ""}`}
              aria-pressed={selected === template.id}
              onClick={() => setSelected(template.id)}
            >
              <span>
                {template.name}
                {!allowed && <Lock size={14} />}
              </span>
              <small>{template.description}</small>
              {allowed && <Check size={16} />}
            </button>
          );
        })}
      </div>
      <div className="receipt-design-preview">
        <ReceiptDocument
          sale={sample}
          state={state}
          workspace={workspace}
          template={selected}
          preview
        />
      </div>
      <button
        className="button primary"
        disabled={
          busy ||
          workspace.role !== "owner" ||
          !entitlements?.receiptTemplates.includes(selected)
        }
        onClick={() => void save()}
      >
        {busy ? "Saving…" : "Use this template"}
      </button>
      {!entitlements?.receiptTemplates.includes(selected) && (
        <p className="form-note">
          This template needs Growth. You can preview it here and change plans
          in Subscription.
        </p>
      )}
      {message && (
        <p role="status" className="banner">
          {message}
        </p>
      )}
    </section>
  );
}

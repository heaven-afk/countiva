"use client";
import { useEffect, useRef, useState } from "react";
import { Building2, Copy, RefreshCw } from "lucide-react";
import {
  paymentDate,
  paymentRpc,
  type ManualPayment,
} from "../lib/manual-payments";
import { formatNaira } from "../lib/plans";
import Skeleton from "./skeleton";
export default function ManualPaymentCheckout({
  businessId,
  request,
  onChanged,
}: {
  businessId: string;
  request: ManualPayment | null;
  onChanged: () => void;
}) {
  const [items, setItems] = useState<ManualPayment[] | null>(null);
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const revision = useRef(0);
  const statusSnapshot = useRef("");
  async function load() {
    const current = ++revision.current;
    try {
      const result = await paymentRpc<ManualPayment[]>(
        "business_manual_payments",
        { bid: businessId },
      );
      if (current !== revision.current) return;
      setItems(result);
      setError("");
      const snapshot = result
        .map((item) => `${item.id}:${item.status}`)
        .join("|");
      if (statusSnapshot.current && statusSnapshot.current !== snapshot)
        onChanged();
      statusSnapshot.current = snapshot;
    } catch (e) {
      if (current === revision.current) setError((e as Error).message);
    }
  }
  useEffect(() => {
    setItems(null);
    void load();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 30000);
    return () => {
      revision.current++;
      clearInterval(timer);
    };
  }, [businessId, request?.id]);
  const active =
    items?.find((p) => p.status === "submitted") ||
    items?.find(
      (p) =>
        p.status === "quoted" &&
        new Date(p.quote_expires_at).getTime() > Date.now(),
    ) ||
    items?.find((p) => p.status === "quoted") ||
    (request && !items ? request : null);
  const expired =
    active?.status === "quoted" &&
    new Date(active.quote_expires_at).getTime() <= Date.now();
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    if (request) {
      panel.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      panel.current?.focus({ preventScroll: true });
    }
  }, [request?.id]);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!active || busy) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await paymentRpc("submit_manual_payment", {
        request_ref: active.id,
        payer_name: form.get("sender"),
        payer_reference: form.get("reference"),
      });
      setMessage(
        "Transfer submitted. Your access changes after Countiva verifies the bank credit.",
      );
      await load();
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function cancel() {
    if (!active || busy) return;
    setBusy(true);
    setError("");
    try {
      await paymentRpc("cancel_manual_payment", { request_ref: active.id });
      await load();
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setMessage("Copied.");
    } catch {
      setError(
        "Copy is unavailable here. Select and copy the number manually.",
      );
    }
  }
  return (
    <section
      className="panel manual-checkout"
      id="bank-transfer"
      ref={panel}
      tabIndex={-1}
      aria-labelledby="transfer-title"
    >
      <div className="panel-heading">
        <div>
          <span className="eyebrow">PAY DIRECTLY · VERIFIED BY COUNTIVA</span>
          <h2 id="transfer-title">Bank transfer</h2>
          <p>
            Choose a plan above to get payment instructions. Access is not
            activated by a payment screenshot.
          </p>
        </div>
        <button
          className="button secondary"
          onClick={() => {
            void load();
            onChanged();
          }}
        >
          <RefreshCw size={16} /> Refresh
        </button>
      </div>
      <div className="manual-payment-body">
        {error && (
          <p className="banner error" role="alert">
            {error}
          </p>
        )}
        {message && (
          <p className="banner" role="status">
            {message}
          </p>
        )}
        {!items && !error && !request && (
          <Skeleton compact label="Loading transfer requests" />
        )}
        {active && (
          <article className="transfer-instructions">
            <div className="transfer-amount">
              <Building2 size={24} />
              <div>
                <span>
                  {active.tier} ·{" "}
                  {active.months === 12 ? "12 months" : "1 month"}
                </span>
                <strong>{formatNaira(active.amount / 100)}</strong>
              </div>
              <span className="badge">
                {active.status === "submitted"
                  ? "Awaiting review"
                  : "Payment instructions"}
              </span>
            </div>
            {active.status === "quoted" ? (
              <>
                {expired && (
                  <p className="banner error" role="alert">
                    These payment instructions have expired. Do not make a new
                    transfer against them. If you already paid, submit your
                    transfer details below; otherwise cancel the instructions
                    and choose a plan again.
                  </p>
                )}
                <dl className="transfer-bank-details">
                  <div>
                    <dt>Bank</dt>
                    <dd>{active.bank_details.bankName}</dd>
                  </div>
                  <div>
                    <dt>Account name</dt>
                    <dd>{active.bank_details.accountName}</dd>
                  </div>
                  <div>
                    <dt>Account number</dt>
                    <dd>
                      {active.bank_details.accountNumber}{" "}
                      <button
                        className="icon-button"
                        aria-label="Copy account number"
                        onClick={() =>
                          void copy(active.bank_details.accountNumber)
                        }
                      >
                        <Copy size={16} />
                      </button>
                    </dd>
                  </div>
                  <div>
                    <dt>Countiva reference</dt>
                    <dd>
                      {active.id}{" "}
                      <button
                        className="icon-button"
                        aria-label="Copy payment reference"
                        onClick={() => void copy(active.id)}
                      >
                        <Copy size={16} />
                      </button>
                    </dd>
                  </div>
                </dl>
                <p>
                  {expired ? "Original quoted amount: " : "Transfer exactly "}
                  {formatNaira(active.amount / 100)}.{" "}
                  {!expired &&
                    "Confirm the receiving name in your banking app and include the Countiva reference in your narration."}{" "}
                  Instructions {expired ? "expired" : "are valid until"}{" "}
                  {paymentDate(active.quote_expires_at)} (Lagos).
                </p>
                <form className="transfer-form" onSubmit={submit}>
                  <label>
                    Sender’s account name
                    <input
                      name="sender"
                      autoComplete="name"
                      minLength={2}
                      maxLength={120}
                      required
                    />
                  </label>
                  <label>
                    Bank transaction reference
                    <input
                      name="reference"
                      minLength={3}
                      maxLength={100}
                      required
                      aria-describedby="transfer-ref-help"
                    />
                    <small id="transfer-ref-help">
                      Enter the reference from your bank’s completed transfer.
                    </small>
                  </label>
                  <label className="transfer-checkbox">
                    <input type="checkbox" required /> I have completed this
                    transfer.
                  </label>
                  <div className="transfer-actions">
                    <button className="button primary" disabled={busy}>
                      {busy ? "Submitting…" : "I’ve paid · submit for review"}
                    </button>
                    <button
                      type="button"
                      className="button secondary"
                      onClick={() => void cancel()}
                      disabled={busy}
                    >
                      Cancel instructions · I haven’t paid
                    </button>
                  </div>
                </form>
              </>
            ) : (
              <p>
                We have received your payment details, not yet confirmed your
                funds. Please do not pay again. Countiva will verify the bank
                credit and update this request. Existing access continues until
                its current expiry.
              </p>
            )}
          </article>
        )}
        {!!items?.length && (
          <div className="transfer-history">
            <h3>Your transfer requests</h3>
            {items
              .filter((p) => p.status !== "quoted" && p.status !== "cancelled")
              .map((p) => (
                <article key={p.id}>
                  <div>
                    <strong>
                      {p.tier} · {formatNaira(p.amount / 100)}
                    </strong>
                    <span
                      className={`badge ${p.status === "approved" ? "green" : ""}`}
                    >
                      {p.status === "submitted" ? "Awaiting review" : p.status}
                    </span>
                  </div>
                  <p>
                    {paymentDate(p.submitted_at || p.created_at)} · {p.months}{" "}
                    month{p.months > 1 ? "s" : ""}
                  </p>
                  {p.review_note && <p>Countiva: {p.review_note}</p>}
                  {p.status === "approved" && (
                    <p>
                      Payment verified. Refresh your subscription status to see
                      the current and next access periods.
                    </p>
                  )}
                  {p.status === "rejected" && (
                    <p>
                      No access was added. If your account was debited, contact
                      Countiva with this request reference: {p.id}. Rejection
                      does not issue a bank refund.
                    </p>
                  )}
                </article>
              ))}
          </div>
        )}
      </div>
    </section>
  );
}

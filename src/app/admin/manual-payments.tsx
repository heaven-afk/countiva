"use client";
import { useEffect, useRef, useState } from "react";
import { Banknote, RefreshCw, ArrowRight, CheckCircle2 } from "lucide-react";
import {
  paymentDate,
  paymentRpc,
  type ManualPayment,
} from "../../lib/manual-payments";
import { formatNaira } from "../../lib/plans";
import { toKobo } from "../../lib/domain";
import Skeleton from "../skeleton";
type Queue = { requests: ManualPayment[]; total: number };
export default function AdminManualPayments({
  onChanged,
}: {
  onChanged: () => void;
}) {
  const [data, setData] = useState<Queue | null>(null);
  const [filter, setFilter] = useState("submitted"),
    [offset, setOffset] = useState(0);
  const [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const [selected, setSelected] = useState<ManualPayment | null>(null);
  const [busy, setBusy] = useState(false),
    [reviewError, setReviewError] = useState("");
  const [decision, setDecision] = useState("approve");
  const dialog = useRef<HTMLDialogElement>(null),
    revision = useRef(0),
    lock = useRef(false);
  async function load() {
    const current = ++revision.current;
    try {
      const result = await paymentRpc<Queue>("platform_manual_payments", {
        status_filter: filter,
        offset_rows: offset,
      });
      if (current === revision.current) {
        setData(result);
        setError("");
      }
    } catch (e) {
      if (current === revision.current) setError((e as Error).message);
    }
  }
  useEffect(() => {
    setData(null);
    void load();
    const timer = setInterval(() => {
      if (!dialog.current?.open && document.visibilityState === "visible")
        void load();
    }, 30000);
    return () => {
      revision.current++;
      clearInterval(timer);
    };
  }, [filter, offset]);
  async function review(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || lock.current) return;
    const form = new FormData(event.currentTarget);
    lock.current = true;
    setBusy(true);
    setReviewError("");
    try {
      await paymentRpc("review_manual_payment", {
        request_ref: selected.id,
        decision,
        received_amount:
          decision === "approve" ? toKobo(String(form.get("amount"))) : 0,
        bank_ref: String(form.get("bankReference") || ""),
        review_reason: String(form.get("note")),
        credit_confirmed: form.get("confirmed") === "on",
        bank_credited_at: form.get("creditedAt")
          ? new Date(`${String(form.get("creditedAt"))}:00+01:00`).toISOString()
          : null,
      });
      dialog.current?.close();
      setSelected(null);
      setMessage(
        decision === "approve"
          ? "Payment verified and subscription period added. The review is recorded in the payment audit."
          : "Request rejected. No subscription was added and no bank refund was issued.",
      );
      await load();
      onChanged();
    } catch (e) {
      setReviewError((e as Error).message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <section
      className="panel admin-operations"
      id="admin-payments"
      aria-labelledby="payment-queue-title"
    >
      <div className="panel-heading">
        <div>
          <span className="eyebrow">REVENUE OPERATIONS</span>
          <h2 id="payment-queue-title">Bank transfers</h2>
          <p>
            Verify money in the receiving bank account before adding paid
            access.
          </p>
        </div>
        <button className="button secondary" onClick={() => void load()}>
          <RefreshCw size={16} /> Refresh
        </button>
      </div>
      <div className="admin-operations-body">
        <div className="payment-queue-toolbar">
          <label>
            Show requests
            <select
              value={filter}
              onChange={(e) => {
                setFilter(e.target.value);
                setOffset(0);
              }}
            >
              <option value="submitted">Awaiting verification</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="all">All submitted requests</option>
            </select>
          </label>
          <span>{data?.total ?? "—"} matching requests</span>
        </div>
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
        {!data && !error ? (
          <Skeleton label="Loading transfer requests" />
        ) : (
          <div className="admin-payment-grid">
            {data?.requests.map((item) => (
              <article className="admin-payment-card" key={item.id}>
                <div className="payment-card-top">
                  <span className="admin-payment-icon">
                    <Banknote size={22} />
                  </span>
                  <span
                    className={`badge ${item.status === "approved" ? "green" : ""}`}
                  >
                    {item.status === "submitted" ? "Needs review" : item.status}
                  </span>
                </div>
                <h3>{item.business_name}</h3>
                <p>{item.owner_email}</p>
                <strong className="payment-card-amount">
                  {formatNaira(item.amount / 100)}
                </strong>
                <p>
                  {item.tier} · {item.months} month{item.months > 1 ? "s" : ""}
                </p>
                <dl>
                  <div>
                    <dt>Sender</dt>
                    <dd>{item.sender_name}</dd>
                  </div>
                  <div>
                    <dt>Customer’s bank reference</dt>
                    <dd>{item.transfer_reference}</dd>
                  </div>
                  <div>
                    <dt>Submitted</dt>
                    <dd>{paymentDate(item.submitted_at || item.created_at)}</dd>
                  </div>
                </dl>
                {item.review_note && <p>Review: {item.review_note}</p>}
                {item.status === "submitted" && (
                  <button
                    className="button primary full"
                    onClick={() => {
                      setSelected(item);
                      setDecision("approve");
                      setReviewError("");
                      dialog.current?.showModal();
                    }}
                  >
                    Review transfer <ArrowRight size={16} />
                  </button>
                )}
              </article>
            ))}
          </div>
        )}
        {data && !data.requests.length && (
          <div className="admin-empty">
            <CheckCircle2 size={28} />
            <h3>You’re all caught up.</h3>
            <p>
              No transfers match this filter. New submissions appear here and in
              your admin alerts.
            </p>
          </div>
        )}
        {data && data.total > 25 && (
          <div className="transfer-actions">
            <button
              className="button secondary"
              disabled={!offset}
              onClick={() => setOffset(Math.max(0, offset - 25))}
            >
              Previous
            </button>
            <span>
              {offset + 1}–{Math.min(offset + 25, data.total)} of {data.total}
            </span>
            <button
              className="button secondary"
              disabled={offset + 25 >= data.total}
              onClick={() => setOffset(offset + 25)}
            >
              Next
            </button>
          </div>
        )}
      </div>
      <dialog
        ref={dialog}
        className="admin-review-dialog"
        aria-labelledby="review-title"
        onCancel={(e) => {
          if (busy) e.preventDefault();
        }}
      >
        {selected && (
          <form onSubmit={review} key={selected.id}>
            <span className="eyebrow">MANUAL PAYMENT REVIEW</span>
            <h2 id="review-title">{selected.business_name}</h2>
            <p className="payment-card-amount">
              {formatNaira(selected.amount / 100)}
            </p>
            <p>
              {selected.tier} · {selected.months} month
              {selected.months > 1 ? "s" : ""} · {selected.owner_email}
            </p>
            <p>
              Sender: {selected.sender_name}
              <br />
              Customer reference: {selected.transfer_reference}
            </p>
            <p>
              Receiving account: {selected.bank_details.bankName} ·{" "}
              {selected.bank_details.accountName} ·{" "}
              {selected.bank_details.accountNumber}
            </p>
            {reviewError && (
              <p className="banner error" role="alert">
                {reviewError}
              </p>
            )}
            <fieldset disabled={busy}>
              <label>
                Review decision
                <select
                  value={decision}
                  onChange={(e) => setDecision(e.target.value)}
                >
                  <option value="approve">Approve verified bank credit</option>
                  <option value="reject">Reject request</option>
                </select>
              </label>
              {decision === "approve" ? (
                <>
                  <label>
                    Amount received in bank (₦)
                    <input
                      name="amount"
                      inputMode="decimal"
                      type="number"
                      step="0.01"
                      min="0.01"
                      required
                      aria-describedby="received-amount-help"
                    />
                    <small id="received-amount-help">
                      Enter the credit shown in your bank. It must match{" "}
                      {formatNaira(selected.amount / 100)}.
                    </small>
                  </label>
                  <label>
                    Actual bank transaction reference
                    <input
                      name="bankReference"
                      minLength={6}
                      maxLength={100}
                      required
                      autoComplete="off"
                    />
                  </label>
                  {selected.promotion_ends_at && (
                    <label>
                      Bank credit date and time · Lagos
                      <input
                        type="datetime-local"
                        name="creditedAt"
                        required
                        step="60"
                      />
                      <small>
                        Hot Deal payment must arrive before{" "}
                        {paymentDate(selected.promotion_ends_at)}.
                      </small>
                    </label>
                  )}
                  <label className="transfer-checkbox">
                    <input name="confirmed" type="checkbox" required /> I
                    verified the credit in the receiving bank account, not only
                    a screenshot or customer message.
                  </label>
                  <p>
                    Approval adds paid time after existing paid or granted
                    access. It does not remove an administrative pause.
                  </p>
                </>
              ) : (
                <p>
                  Reject only after checking the transfer. Rejection does not
                  refund money; resolve any received or unmatched payment
                  separately.
                </p>
              )}
              <label>
                Review note · shown to the business owner
                <textarea name="note" minLength={5} maxLength={500} required />
              </label>
              <div className="transfer-actions">
                <button className="button primary">
                  {busy
                    ? "Saving review…"
                    : decision === "approve"
                      ? "Confirm approval"
                      : "Confirm rejection"}
                </button>
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => dialog.current?.close()}
                >
                  Cancel
                </button>
              </div>
            </fieldset>
          </form>
        )}
      </dialog>
    </section>
  );
}

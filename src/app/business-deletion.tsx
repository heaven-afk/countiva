"use client";
import { useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import { getSupabase } from "../lib/supabase";
import { authenticatedFetch } from "../lib/api-client";
import { clearBusinessData } from "../lib/storage";

export default function BusinessDeletion({
  businessId,
  name,
  admin = false,
  disabled = false,
  onDeleted,
}: {
  businessId: string;
  name: string;
  admin?: boolean;
  disabled?: boolean;
  onDeleted?: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const lock = useRef(false);
  const [confirmation, setConfirmation] = useState(""),
    [permanent, setPermanent] = useState(false),
    [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [deleted, setDeleted] = useState(false);
  async function remove(event: React.FormEvent) {
    event.preventDefault();
    if (lock.current || confirmation !== name || !permanent) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      if (!navigator.onLine)
        throw new Error("Connect to the internet before deleting a business.");
      if (admin)
        await authenticatedFetch("/api/admin/operations", {
          action: "deleteBusiness",
          businessId,
          confirmationName: confirmation,
          permanent,
          reason,
        });
      else {
        const client = getSupabase();
        if (!client)
          throw new Error(
            "Please sign in again before deleting this business.",
          );
        const result = await client.rpc("delete_business", {
          bid: businessId,
          confirmation_name: confirmation,
          permanent,
        });
        if (result.error) throw new Error(result.error.message);
      }
      await clearBusinessData(businessId).catch(() => {});
      setDeleted(true);
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "The business could not be deleted. Try again.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <section className="business-deletion">
      <h3>Delete business permanently</h3>
      <p>
        {admin
          ? "Remove this business as a platform administrator. A deletion reason is required and the action is logged."
          : "Only the business owner can delete this workspace. Export any records you need before continuing."}
      </p>
      <button
        type="button"
        className="button business-delete-confirm"
        disabled={disabled || deleted}
        onClick={() => {
          setConfirmation("");
          setPermanent(false);
          setReason("");
          setError("");
          dialog.current?.showModal();
        }}
      >
        <Trash2 size={16} /> Delete business
      </button>
      <dialog
        ref={dialog}
        className="business-delete-dialog"
        aria-labelledby={`delete-title-${businessId}`}
        onCancel={(e) => {
          if (busy || deleted) e.preventDefault();
        }}
      >
        {deleted ? (
          <div role="status">
            <h2 id={`delete-title-${businessId}`}>
              Business permanently deleted
            </h2>
            <p>
              {name} has been removed. Its cloud records cannot be restored
              through Countiva.
            </p>
            <button
              type="button"
              className="button primary"
              onClick={() => {
                dialog.current?.close();
                if (admin) onDeleted?.();
                else
                  window.location.replace(
                    "/workspace?choose=business&deleted=1",
                  );
              }}
            >
              {admin ? "Return to admin" : "Return to businesses"}
            </button>
          </div>
        ) : (
          <form className="settings-form" onSubmit={remove}>
            <h2 id={`delete-title-${businessId}`}>
              Permanently delete {name}?
            </h2>
            <p className="deletion-warning">
              This cannot be undone. There is no undo button or recovery option.
            </p>
            <ul>
              <li>
                Inventory, stock history, sales, customer balances and receipts
                will be removed from this business.
              </li>
              <li>
                Reports, invitations, reminders and all staff access to this
                business will be removed.
              </li>
              <li>
                Business subscription access ends. This action does not issue a
                refund.
              </li>
            </ul>
            <p>
              Your Countiva sign-in account and other businesses are kept.
              Previously downloaded exports are separate copies.
            </p>
            <p>
              A minimal deletion audit and checkout reference are retained for
              verification. They cannot restore the business.
            </p>
            {admin && (
              <label>
                Admin deletion reason
                <textarea
                  required
                  minLength={10}
                  maxLength={500}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  disabled={busy}
                />
              </label>
            )}
            <label>
              Type the exact business name: <strong>{name}</strong>
              <input
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
                autoComplete="off"
                required
                disabled={busy}
              />
            </label>
            <label className="check-label">
              <input
                type="checkbox"
                checked={permanent}
                onChange={(e) => setPermanent(e.target.checked)}
                required
                disabled={busy}
              />{" "}
              I understand this permanently deletes the business and its
              records.
            </label>
            {error && (
              <p role="alert" className="deletion-warning">
                {error}
              </p>
            )}
            <div className="business-delete-actions">
              <button
                type="button"
                className="button secondary"
                disabled={busy}
                onClick={() => dialog.current?.close()}
              >
                Keep business
              </button>
              <button
                className="button business-delete-confirm"
                disabled={busy || confirmation !== name || !permanent}
              >
                {busy ? "Deleting business…" : "Permanently delete business"}
              </button>
            </div>
          </form>
        )}
      </dialog>
    </section>
  );
}

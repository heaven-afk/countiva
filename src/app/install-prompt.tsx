"use client";
import { useEffect, useState } from "react";
import { Bell, Download, Share2, X } from "lucide-react";
import { useAppInstall } from "./app-install-provider";
const dismissalKey = "countiva-install-reminder-until";
export default function InstallPrompt({
  dismissible = false,
}: {
  dismissible?: boolean;
}) {
  const { ready, installed, isIOS, canPrompt, install } = useAppInstall();
  const [dismissed, setDismissed] = useState(false),
    [instructions, setInstructions] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  useEffect(() => {
    if (dismissible)
      try {
        setDismissed(
          Number(localStorage.getItem(dismissalKey) || 0) > Date.now(),
        );
      } catch {}
  }, [dismissible]);
  if (!ready || installed || (dismissible && dismissed)) return null;
  async function start() {
    setBusy(true);
    setMessage("");
    try {
      if (!canPrompt) {
        setInstructions((open) => !open);
        return;
      }
      const outcome = await install();
      if (outcome === "instructions") setInstructions(true);
      else if (outcome === "accepted")
        setMessage(
          "Installation accepted. Open Countiva from your device’s apps, then allow reminders in Notifications.",
        );
      else
        setMessage(
          "You can install later. Use the browser menu or this card when you are ready.",
        );
    } catch {
      setInstructions(true);
      setMessage(
        "The install window could not open. Follow the browser steps below.",
      );
    } finally {
      setBusy(false);
    }
  }
  function dismiss() {
    setDismissed(true);
    try {
      localStorage.setItem(dismissalKey, String(Date.now() + 7 * 86400000));
    } catch {}
  }
  return (
    <aside className="app-install-card" aria-label="Install Countiva">
      <div className="app-install-symbol">
        <Download size={23} />
        <Bell size={12} />
      </div>
      <div className="app-install-content">
        <h3>
          {isIOS
            ? "Install Countiva to receive reminders"
            : "Keep Countiva one tap away"}
        </h3>
        <p>
          {isIOS
            ? "On iPhone and iPad, reminders need the Home Screen app. Add Countiva, open it from its icon, then allow notifications."
            : "Install Countiva for quick access to your business. Supported desktop and Android browsers can also receive reminders without installing."}
        </p>
        <div className="app-install-actions">
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            aria-expanded={!canPrompt ? instructions : undefined}
            onClick={() => void start()}
          >
            <Download size={16} />
            {busy
              ? "Opening install…"
              : canPrompt
                ? "Install Countiva"
                : "How to install"}
          </button>
          {isIOS && <span>iOS / iPadOS 16.4 or later</span>}
        </div>
        {instructions && (
          <div className="app-install-instructions">
            <h4>
              {isIOS
                ? "Add Countiva to your Home Screen"
                : "Install from your browser"}
            </h4>
            {isIOS ? (
              <ol>
                <li>
                  Open Countiva in Safari. Tap <Share2 size={14} /> Share; it
                  may be inside the More menu.
                </li>
                <li>
                  Choose <strong>Add to Home Screen</strong>. Keep{" "}
                  <strong>Open as Web App</strong> enabled if shown, then tap{" "}
                  <strong>Add</strong>.
                </li>
                <li>
                  Open Countiva from the new icon. Go to{" "}
                  <strong>Notifications</strong>, turn on reminders and choose{" "}
                  <strong>Allow</strong> when asked.
                </li>
              </ol>
            ) : (
              <ol>
                <li>
                  In Chrome or Edge, open the browser menu and choose{" "}
                  <strong>Install Countiva</strong> or{" "}
                  <strong>Install app</strong> when available.
                </li>
                <li>
                  On Safari for Mac, choose <strong>File → Add to Dock</strong>{" "}
                  if available. On iPhone or iPad, use Safari’s{" "}
                  <strong>Share → Add to Home Screen</strong>.
                </li>
                <li>
                  If installation is unavailable, keep using Countiva in your
                  browser. Enable reminders in <strong>Notifications</strong> if
                  your browser supports them.
                </li>
              </ol>
            )}
          </div>
        )}
        {message && <p role="status">{message}</p>}
      </div>
      {dismissible && (
        <button
          type="button"
          className="app-install-dismiss"
          aria-label="Remind me about installation in a week"
          onClick={dismiss}
        >
          <X size={18} />
        </button>
      )}
    </aside>
  );
}

"use client";
import { useEffect, useState } from "react";
import { authenticatedFetch } from "../../lib/api-client";
import type { PlatformRole } from "../../lib/contracts";
type Health = {
  config: {
    aiKey: boolean;
    aiModel: string;
    serverKey: boolean;
    bachsKey: boolean;
    bachsWebhook: boolean;
    bachsAccount: boolean;
    push: boolean;
    scheduler: boolean;
  };
  probe: { ok: boolean; message: string; model?: string } | null;
};
export default function ServiceHealth({ role }: { role: PlatformRole }) {
  const [health, setHealth] = useState<Health | null>(null),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  async function load(probeAI = false) {
    setBusy(true);
    setMessage("");
    try {
      setHealth(
        await authenticatedFetch("/api/admin/operations", {
          action: "health",
          probeAI,
        }),
      );
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  return (
    <section className="panel admin-operations" id="admin-services">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">SERVICE READINESS</span>
          <h2>AI, payments & notifications</h2>
          <p>
            Configuration checks show whether values exist. Test the AI
            connection to verify an actual provider response.
          </p>
        </div>
        <button
          className="button secondary"
          disabled={busy}
          onClick={() => void load()}
        >
          Refresh services
        </button>
      </div>
      <div className="admin-operations-body">
        {health && (
          <>
            <div className="service-status-grid">
              {[
                ["AI provider key", health.config.aiKey],
                ["Server services", health.config.serverKey],
                ["Bachs checkout key", health.config.bachsKey],
                ["Bachs webhook signature secret", health.config.bachsWebhook],
                ["Bachs account restriction", health.config.bachsAccount],
                ["Web Push keys", health.config.push],
                ["Scheduler secret", health.config.scheduler],
              ].map(([label, ready]) => (
                <div className="service-status" key={String(label)}>
                  <strong>{label}</strong>
                  <span className={`badge ${ready ? "green" : "amber"}`}>
                    {ready ? "Configured" : "Missing"}
                  </span>
                </div>
              ))}
            </div>
            <p>
              AI model: <strong>{health.config.aiModel}</strong>
            </p>
            <button
              className="button primary"
              disabled={busy || role === "viewer"}
              onClick={() => void load(true)}
            >
              {busy ? "Checking…" : "Test AI connection"}
            </button>
            {health.probe && (
              <p className="banner" role="status">
                {health.probe.ok ? "Connected · " : ""}
                {health.probe.message}
                {health.probe.model && ` Model: ${health.probe.model}`}
              </p>
            )}
            <h3>Connect your Bachs account</h3>
            <p>
              Use your Bachs merchant account to create the server API key and
              webhook signing secret. Store them in hosting settings as
              BACHS_API_KEY and BACHS_WEBHOOK_SECRET; add BACHS_ACCOUNT_ID to
              restrict events to your account. Keep these values out of browser
              code and support messages.
            </p>
            <p>
              Webhook endpoint:{" "}
              <span>https://www.countiva.shop/api/billing/webhook</span>
            </p>
            <p className="form-note">
              Bachs must send the signed checkout/payment events to this
              endpoint. Existing orders are activated only after the server
              verifies the amount, currency and payment status.
            </p>
          </>
        )}
        {message && (
          <p className="banner" role="status">
            {message}
          </p>
        )}
      </div>
    </section>
  );
}

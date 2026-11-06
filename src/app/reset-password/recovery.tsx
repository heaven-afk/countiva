"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, KeyRound } from "lucide-react";
import Brand from "../brand";
import ThemeControl from "../theme-control";
import PasswordField from "../password-field";
import Skeleton from "../skeleton";
import AuthNotice from "../auth-notice";
import { getRecoverySupabase } from "../../lib/supabase";
import {
  authErrorMessage,
  INVALID_RECOVERY,
  parseRecoveryLink,
  passwordResetUrl,
  RECOVERY_MARKER,
  RECOVERY_WINDOW_MS,
  verifyRecovery,
} from "../../lib/auth-recovery";
export default function PasswordRecovery() {
  const [stage, setStage] = useState<
      "loading" | "request" | "ready" | "sent" | "done"
    >("loading"),
    [password, setPassword] = useState(""),
    [confirmation, setConfirmation] = useState(""),
    [email, setEmail] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [signedOut, setSignedOut] = useState(false);
  const client = getRecoverySupabase(),
    verification = useRef<Promise<string> | null>(null);
  useEffect(() => {
    let alive = true;
    if (!client) {
      setError("Account services are unavailable. Please try again later.");
      setStage("request");
      return;
    }
    if (!verification.current) {
      const link = parseRecoveryLink(new URL(window.location.href));
      let marker: { userId: string; expiresAt: number } | null = null;
      try {
        marker = JSON.parse(sessionStorage.getItem(RECOVERY_MARKER) || "null");
      } catch {}
      if (link.kind === "empty" && !marker) {
        setStage("request");
        return;
      }
      verification.current = verifyRecovery(client.auth, link, marker);
    }
    verification.current
      .then((userId) => {
        if (!alive) return;
        try {
          sessionStorage.setItem(
            RECOVERY_MARKER,
            JSON.stringify({
              userId,
              expiresAt: Date.now() + RECOVERY_WINDOW_MS,
            }),
          );
        } catch {}
        window.history.replaceState(null, "", "/reset-password");
        setStage("ready");
      })
      .catch(() => {
        if (!alive) return;
        try {
          sessionStorage.removeItem(RECOVERY_MARKER);
        } catch {}
        window.history.replaceState(null, "", "/reset-password");
        setError(INVALID_RECOVERY);
        setStage("request");
      });
    return () => {
      alive = false;
    };
  }, [client]);
  async function requestLink(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!client || busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await client.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: passwordResetUrl(
          window.location.origin,
          process.env.NEXT_PUBLIC_APP_URL,
          process.env.NODE_ENV === "production",
        ),
      });
      if (result.error) throw result.error;
      setStage("sent");
    } catch (e) {
      setError(authErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function finishSignOut() {
    if (!client) return;
    const result = await client.auth.signOut({ scope: "local" });
    if (result.error)
      throw new Error(
        "Your password is saved, but sign-out did not finish. Choose Finish sign out to retry.",
      );
    try {
      localStorage.removeItem("shopilot-authorised-business-v1");
    } catch {}
    setSignedOut(true);
  }
  async function retrySignOut() {
    setBusy(true);
    setError("");
    try {
      await finishSignOut();
    } catch (e) {
      setError(authErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function savePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!client || busy || stage !== "ready") return;
    setError("");
    if (password.length < 8) {
      setError("Use at least 8 characters for your new password.");
      return;
    }
    if (password !== confirmation) {
      setError("The passwords don’t match. Enter the same new password twice.");
      return;
    }
    setBusy(true);
    try {
      const result = await client.auth.updateUser({ password });
      if (result.error) throw result.error;
      try {
        sessionStorage.removeItem(RECOVERY_MARKER);
      } catch {}
      setPassword("");
      setConfirmation("");
      setStage("done");
      await finishSignOut();
    } catch (e) {
      setError(authErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="password-recovery-page">
      <header>
        <Brand />
        <ThemeControl />
      </header>
      <section className="password-recovery-card">
        <span className="recovery-symbol">
          <KeyRound size={25} />
        </span>
        <span className="eyebrow">YOUR ACCOUNT, BACK IN YOUR HANDS</span>
        <h1>
          {stage === "loading"
            ? "Checking your reset link"
            : stage === "ready"
              ? "Choose a new password"
              : stage === "sent"
                ? "Check your inbox"
                : stage === "done"
                  ? "Password updated"
                  : "Reset your password"}
        </h1>
        {error && <AuthNotice>{error}</AuthNotice>}
        {stage === "loading" ? (
          <Skeleton compact label="Verifying your password reset link" />
        ) : stage === "ready" ? (
          <>
            <p>Choose a unique password, then sign in again with it.</p>
            <form onSubmit={savePassword}>
              <PasswordField
                id="new-recovery-password"
                label="New password"
                creating
                value={password}
                onChange={setPassword}
              />
              <PasswordField
                id="repeat-recovery-password"
                name="confirmPassword"
                label="Confirm new password"
                confirm
                value={confirmation}
                onChange={setConfirmation}
              />
              <button className="button primary full" disabled={busy}>
                {busy ? "Updating password…" : "Update password"}
              </button>
            </form>
          </>
        ) : stage === "sent" ? (
          <>
            <AuthNotice tone="info">
              If an account exists for that email, a reset link is on its way.
              Check your inbox and spam folder.
            </AuthNotice>
            <p>Use the newest reset email.</p>
            <button
              className="button secondary full"
              onClick={() => {
                setError("");
                setStage("request");
              }}
            >
              Send another link
            </button>
          </>
        ) : stage === "done" ? (
          <>
            <p>Your new password is saved.</p>
            {signedOut ? (
              <a className="button primary full" href="/login">
                Sign in with your new password
              </a>
            ) : (
              <button
                className="button primary full"
                disabled={busy}
                onClick={() => void retrySignOut()}
              >
                Finish sign out
              </button>
            )}
          </>
        ) : (
          <>
            <p>Enter your account email and we’ll send a fresh reset link.</p>
            <form onSubmit={requestLink}>
              <label htmlFor="reset-account-email">
                Account email
                <input
                  id="reset-account-email"
                  type="email"
                  required
                  autoComplete="email"
                  maxLength={254}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
              <button
                className="button primary full"
                disabled={busy || !client}
              >
                {busy ? "Sending link…" : "Send reset link"}
              </button>
            </form>
          </>
        )}
        {stage !== "done" && (
          <a className="text-button recovery-back" href="/login">
            <ArrowLeft size={16} />
            Back to sign in
          </a>
        )}
      </section>
    </main>
  );
}

"use client";
import { useEffect, useState } from "react";
import { ShieldCheck, ArrowRight } from "lucide-react";
import { getSupabase } from "../../../lib/supabase";
import AdminBrand from "../admin-brand";
import ThemeControl from "../../theme-control";
export default function AdminLogin() {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    const client = getSupabase();
    void client?.auth.getSession().then(async ({ data }) => {
      if (!data.session) return;
      const access = await client.rpc("platform_access");
      if (active && access.data) window.location.replace("/admin");
    });
    return () => {
      active = false;
    };
  }, []);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      const client = getSupabase();
      if (!client)
        throw new Error(
          "Account services are unavailable. Please retry shortly.",
        );
      const signed = await client.auth.signInWithPassword({
        email: String(form.get("email")).trim(),
        password: String(form.get("password")),
      });
      if (signed.error)
        throw new Error(
          "Could not sign in. Check your email and password, and confirm your email address.",
        );
      const access = await client.rpc("platform_access");
      if (access.error || !access.data) {
        await client.auth.signOut({ scope: "local" });
        throw new Error(
          "This account is not authorised for Countiva Admin. Use your business sign-in instead.",
        );
      }
      window.location.replace("/admin");
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <main className="admin-login">
      <header>
        <AdminBrand />
        <ThemeControl />
      </header>
      <div className="admin-login-grid">
        <section className="admin-login-intro">
          <span className="eyebrow">YOUR OPERATIONS DESK</span>
          <h1>
            A clear view.
            <br />A confident next move.
          </h1>
          <p>
            Review payments, manage subscriptions and keep an eye on Countiva
            from one private workspace.
          </p>
          <span className="admin-private-note">
            <ShieldCheck size={20} /> For authorised platform administrators
            only
          </span>
        </section>
        <section className="panel admin-login-form">
          <ShieldCheck size={30} />
          <h2>Welcome back.</h2>
          <p>Sign in with your authorised administrator account.</p>
          {error && (
            <p className="banner error" role="alert">
              {error}
            </p>
          )}
          <form onSubmit={submit}>
            <label>
              Administrator email
              <input
                name="email"
                type="email"
                autoComplete="username"
                required
                maxLength={254}
              />
            </label>
            <label>
              Password
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                minLength={8}
                required
              />
            </label>
            <a href="/reset-password">Forgot your password?</a>
            <button className="button primary" disabled={busy}>
              {busy ? "Checking access…" : "Sign in to Admin"}
              <ArrowRight size={17} />
            </button>
          </form>
          <a href="/login">Business account? Sign in here</a>
        </section>
      </div>
    </main>
  );
}

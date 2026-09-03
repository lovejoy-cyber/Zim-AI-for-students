import { useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../lib/auth";

export function LoginPage() {
  const { session } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (session) return <Navigate to="/" replace />;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setSubmitting(false);
    if (error) setError(error.message);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-ink px-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <p className="eyebrow text-gold/80">Embassy of Zimbabwe · Algeria</p>
          <h1 className="mt-2 font-display text-2xl text-white">ZimStudent AI Command Centre</h1>
          <p className="mt-1 text-sm text-white/50">Staff sign-in</p>
        </div>

        <form onSubmit={handleSubmit} className="ledger-card space-y-4 p-6">
          <div>
            <label htmlFor="email" className="mb-1 block text-sm font-medium text-slate-text">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-seal border border-paper-line px-3 py-2 text-sm focus:border-petrol"
              placeholder="officer@embassy.gov.zw"
            />
          </div>
          <div>
            <label htmlFor="password" className="mb-1 block text-sm font-medium text-slate-text">
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-seal border border-paper-line px-3 py-2 text-sm focus:border-petrol"
            />
          </div>

          {error && <p className="text-sm text-status-danger">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-seal bg-ink py-2.5 text-sm font-medium text-white transition-colors hover:bg-ink-light disabled:opacity-60"
          >
            {submitting ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-white/40">
          Accounts are provisioned by an admin. Contact your system administrator if you need access.
        </p>
      </div>
    </div>
  );
}

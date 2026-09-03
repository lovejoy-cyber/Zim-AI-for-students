import { useState } from "react";
import { sendOtp, verifyOtp, setToken } from "../lib/api";

export function LoginPage({ onLoggedIn }: { onLoggedIn: () => void }) {
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function handleSendCode() {
    setLoading(true);
    setError(null);
    try {
      const { message } = await sendOtp(phone);
      setNotice(message);
      setStep("code");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify() {
    setLoading(true);
    setError(null);
    try {
      const { token } = await verifyOtp(phone, code);
      setToken(token);
      onLoggedIn();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col justify-center bg-ink px-6 py-10">
      <div className="mx-auto w-full max-w-sm">
        <div className="mb-8 text-center">
          <p className="eyebrow text-gold/80">Embassy of Zimbabwe · Algeria</p>
          <h1 className="mt-2 font-display text-2xl text-white">ZimStudent</h1>
          <p className="mt-1 text-sm text-white/50">My Account</p>
        </div>

        <div className="ledger-card p-6">
          {step === "phone" ? (
            <>
              <label htmlFor="phone" className="mb-1 block text-sm font-medium">
                WhatsApp number
              </label>
              <p className="mb-3 text-xs text-slate-muted">
                The same number you use to message the Embassy. We'll send a login code there.
              </p>
              <input
                id="phone"
                type="tel"
                inputMode="numeric"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="213551234567"
                className="tap-target w-full rounded-seal border border-paper-line px-3 py-2 text-base focus:border-petrol"
              />
              {error && <p className="mt-2 text-sm text-status-danger">{error}</p>}
              <button
                onClick={() => void handleSendCode()}
                disabled={loading || !phone.trim()}
                className="tap-target mt-4 w-full rounded-seal bg-ink text-sm font-medium text-white hover:bg-ink-light disabled:opacity-60"
              >
                {loading ? "Sending…" : "Send login code"}
              </button>
            </>
          ) : (
            <>
              <label htmlFor="code" className="mb-1 block text-sm font-medium">
                Enter the 6-digit code
              </label>
              {notice && <p className="mb-3 text-xs text-slate-muted">{notice}</p>}
              <input
                id="code"
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="123456"
                className="tap-target w-full rounded-seal border border-paper-line px-3 py-2 text-center text-2xl tracking-[0.5em] focus:border-petrol"
              />
              {error && <p className="mt-2 text-sm text-status-danger">{error}</p>}
              <button
                onClick={() => void handleVerify()}
                disabled={loading || code.length !== 6}
                className="tap-target mt-4 w-full rounded-seal bg-ink text-sm font-medium text-white hover:bg-ink-light disabled:opacity-60"
              >
                {loading ? "Checking…" : "Log in"}
              </button>
              <button
                onClick={() => {
                  setStep("phone");
                  setCode("");
                  setError(null);
                }}
                className="mt-3 w-full text-center text-xs text-slate-muted underline"
              >
                Use a different number
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

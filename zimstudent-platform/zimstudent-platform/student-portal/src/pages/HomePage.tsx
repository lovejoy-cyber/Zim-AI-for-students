import { useEffect, useRef, useState } from "react";
import { LogOut, Upload } from "lucide-react";
import { getMe, submitDocument, clearToken, type MeResponse } from "../lib/api";
import { DocStatusBadge, DecisionBadge } from "../components/Badge";

export function HomePage({ onLoggedOut }: { onLoggedOut: () => void }) {
  const [data, setData] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const me = await getMe();
      setData(me);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function handleLogout() {
    clearToken();
    onLoggedOut();
  }

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    setLastResult(null);
    try {
      const base64 = await fileToBase64(file);
      const { document } = await submitDocument(base64, file.type);
      setLastResult(
        `Received your ${document.doc_type.replace(/_/g, " ")}. ${document.ai_summary ?? ""} Status: ${
          document.status === "needs_review" ? "under review by staff" : "processed"
        }.`,
      );
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center text-slate-muted">Loading your account…</div>;
  }

  if (error && !data) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-status-danger">{error}</p>
        <button onClick={handleLogout} className="text-sm text-petrol underline">
          Log in again
        </button>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="min-h-screen bg-paper pb-24">
      <header className="bg-ink px-5 py-6 text-white">
        <div className="flex items-start justify-between">
          <div>
            <p className="eyebrow text-gold/80">ZimStudent</p>
            <h1 className="mt-1 font-display text-xl">{data.profile.full_name}</h1>
            <p className="font-mono text-xs text-white/50">{data.profile.student_id}</p>
          </div>
          <button onClick={handleLogout} className="tap-target flex items-center gap-1 px-2 text-xs text-white/60">
            <LogOut size={14} /> Log out
          </button>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <InfoTile label="Program" value={data.profile.program ?? "—"} />
          <InfoTile label="GPA" value={data.profile.current_gpa != null ? String(data.profile.current_gpa) : "—"} mono />
        </div>
      </header>

      <main className="space-y-6 px-5 py-6">
        {data.action_needed.length > 0 && (
          <section className="rounded-seal border border-status-warning/40 bg-status-warningBg p-4">
            <p className="text-sm font-semibold text-status-warning">Action needed</p>
            <ul className="mt-2 space-y-1 text-sm">
              {data.action_needed.map((a, i) => (
                <li key={i}>{a.description}</li>
              ))}
            </ul>
          </section>
        )}

        <section>
          <p className="eyebrow mb-2">Submit a document</p>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,application/pdf"
            capture="environment"
            onChange={(e) => void handleFileSelected(e)}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="tap-target flex w-full items-center justify-center gap-2 rounded-seal bg-petrol text-sm font-medium text-white hover:bg-petrol-dark disabled:opacity-60"
          >
            <Upload size={16} />
            {uploading ? "Reading document…" : "Take a photo or choose a file"}
          </button>
          {lastResult && <p className="mt-2 text-sm text-status-success">{lastResult}</p>}
          {error && <p className="mt-2 text-sm text-status-danger">{error}</p>}
          <p className="mt-2 text-xs text-slate-muted">
            Transcripts, enrollment certificates, bank statements, ID — photo or PDF.
          </p>
        </section>

        <section>
          <p className="eyebrow mb-2">Stipend status</p>
          {data.stipend_history.length === 0 ? (
            <p className="ledger-card p-4 text-sm text-slate-muted">No stipend case on file yet.</p>
          ) : (
            <div className="ledger-card divide-y divide-paper-line">
              {data.stipend_history.map((d, i) => (
                <div key={i} className="flex items-center justify-between p-3">
                  <span className="text-sm">{d.term}</span>
                  <DecisionBadge value={d.human_decision} />
                </div>
              ))}
            </div>
          )}
        </section>

        <section>
          <p className="eyebrow mb-2">My documents</p>
          {data.documents.length === 0 ? (
            <p className="ledger-card p-4 text-sm text-slate-muted">Nothing submitted yet.</p>
          ) : (
            <div className="ledger-card divide-y divide-paper-line">
              {data.documents.map((d) => (
                <div key={d.document_id} className="p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium capitalize">{d.doc_type.replace(/_/g, " ")}</span>
                    <DocStatusBadge value={d.status} />
                  </div>
                  {d.ai_summary && <p className="mt-1 text-xs text-slate-muted">{d.ai_summary}</p>}
                  <p className="mt-1 text-xs text-slate-muted">
                    {new Date(d.submitted_at).toLocaleDateString()}
                    {d.expiry_date && ` · expires ${d.expiry_date}`}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function InfoTile({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-seal bg-white/5 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-white/50">{label}</p>
      <p className={`text-sm ${mono ? "font-mono" : ""}`}>{value}</p>
    </div>
  );
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1] ?? "");
    };
    reader.onerror = () => reject(new Error("Could not read the selected file."));
    reader.readAsDataURL(file);
  });
}

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { resolveWelfareEvent } from "../lib/api";
import type { WelfareEvent, Severity } from "../lib/types";

const SEVERITY_ORDER: Severity[] = ["critical", "high", "medium", "low", "info"];
const SEVERITY_COLUMN_STYLE: Record<Severity, string> = {
  critical: "border-ink",
  high: "border-status-danger",
  medium: "border-status-warning",
  low: "border-status-success",
  info: "border-status-info",
};

export function WelfareBoardPage() {
  const [events, setEvents] = useState<WelfareEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    void loadEvents();
  }, []);

  async function loadEvents() {
    setLoading(true);
    const { data, error } = await supabase
      .from("welfare_events")
      .select("*, student:student_profiles(full_name)")
      .eq("resolved", false)
      .order("detected_at", { ascending: false });
    if (error) console.error(error);
    setEvents((data as WelfareEvent[]) ?? []);
    setLoading(false);
  }

  async function handleResolve(eventId: string) {
    if (!note.trim()) return;
    setSubmitting(true);
    try {
      await resolveWelfareEvent({ event_id: eventId, resolution_note: note.trim() });
      setResolvingId(null);
      setNote("");
      await loadEvents();
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <p className="text-slate-muted">Loading the welfare board…</p>;

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">Duty of care</p>
        <h2 className="mt-1 font-display text-2xl">Welfare Board</h2>
        <p className="text-sm text-slate-muted">{events.length} open flag(s) across the register.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3 xl:grid-cols-5">
        {SEVERITY_ORDER.map((severity) => {
          const columnEvents = events.filter((e) => e.severity === severity);
          return (
            <div key={severity} className={`border-t-4 ${SEVERITY_COLUMN_STYLE[severity]} ledger-card`}>
              <div className="flex items-center justify-between px-4 py-3">
                <span className="text-sm font-semibold capitalize">{severity}</span>
                <span className="font-mono text-xs text-slate-muted">{columnEvents.length}</span>
              </div>
              <div className="space-y-3 border-t border-paper-line p-3">
                {columnEvents.length === 0 && <p className="px-1 py-2 text-xs text-slate-muted">Nothing here.</p>}
                {columnEvents.map((e) => (
                  <div key={e.event_id} className="rounded-seal border border-paper-line bg-paper p-3">
                    <Link
                      to={`/students/${e.student_id}`}
                      className="text-sm font-medium text-petrol hover:underline"
                    >
                      {e.student?.full_name ?? e.student_id}
                    </Link>
                    <p className="mt-1 text-xs capitalize text-slate-muted">{e.event_type.replace(/_/g, " ")}</p>
                    <p className="mt-1 text-sm">{e.description}</p>
                    <p className="mt-1 text-xs text-slate-muted">{new Date(e.detected_at).toLocaleDateString()}</p>

                    {resolvingId === e.event_id ? (
                      <div className="mt-2 space-y-2">
                        <textarea
                          value={note}
                          onChange={(ev) => setNote(ev.target.value)}
                          rows={2}
                          placeholder="How was this resolved?"
                          className="w-full rounded-seal border border-paper-line px-2 py-1 text-xs focus:border-petrol"
                        />
                        <div className="flex gap-2">
                          <button
                            disabled={submitting || !note.trim()}
                            onClick={() => void handleResolve(e.event_id)}
                            className="rounded-seal bg-status-success px-2.5 py-1 text-xs font-medium text-white disabled:opacity-60"
                          >
                            Confirm resolved
                          </button>
                          <button
                            onClick={() => {
                              setResolvingId(null);
                              setNote("");
                            }}
                            className="text-xs text-slate-muted underline"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => setResolvingId(e.event_id)}
                        className="mt-2 text-xs font-medium text-petrol underline"
                      >
                        Mark resolved
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

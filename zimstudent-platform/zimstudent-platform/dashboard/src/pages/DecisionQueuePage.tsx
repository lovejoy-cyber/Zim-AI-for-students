import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { recordStipendDecision } from "../lib/api";
import { DecisionBadge } from "../components/Badge";
import type { StipendDecision } from "../lib/types";

export function DecisionQueuePage() {
  const [decisions, setDecisions] = useState<StipendDecision[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    void loadQueue();
  }, []);

  async function loadQueue() {
    setLoading(true);
    const { data, error } = await supabase
      .from("stipend_decisions")
      .select("*, student:student_profiles(full_name, program, degree_level)")
      .eq("human_decision", "pending")
      .order("ai_confidence", { ascending: true }); // lowest-confidence cases first — they need the most attention

    if (error) console.error(error);
    setDecisions((data as StipendDecision[]) ?? []);
    setSelectedId((data as StipendDecision[])?.[0]?.decision_id ?? null);
    setLoading(false);
  }

  const selected = decisions.find((d) => d.decision_id === selectedId) ?? null;

  async function handleDecide(value: "approve" | "conditional" | "reject") {
    if (!selected) return;
    const isOverride = selected.ai_recommendation && value !== selected.ai_recommendation;
    if (isOverride && !comment.trim()) {
      setActionError("A comment is required when your decision differs from the AI recommendation.");
      return;
    }

    setSubmitting(true);
    setActionError(null);
    try {
      await recordStipendDecision({
        decision_id: selected.decision_id,
        human_decision: value,
        human_comment: comment.trim() || undefined,
      });
      setComment("");
      await loadQueue();
    } catch (err) {
      setActionError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <p className="text-slate-muted">Loading the decision queue…</p>;

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">Case management</p>
        <h2 className="mt-1 font-display text-2xl">Decision Queue</h2>
        <p className="text-sm text-slate-muted">{decisions.length} case(s) awaiting a human decision.</p>
      </div>

      {decisions.length === 0 ? (
        <div className="ledger-card p-8 text-center text-slate-muted">
          The queue is empty — every stipend case has a recorded decision.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[380px_1fr]">
          <div className="ledger-card divide-y divide-paper-line overflow-hidden">
            {decisions.map((d) => (
              <button
                key={d.decision_id}
                onClick={() => {
                  setSelectedId(d.decision_id);
                  setComment("");
                  setActionError(null);
                }}
                className={`block w-full px-4 py-3 text-left transition-colors ${
                  d.decision_id === selectedId ? "bg-gold-soft/60" : "hover:bg-paper"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{d.student?.full_name ?? d.student_id}</span>
                  <DecisionBadge value={d.human_decision} />
                </div>
                <div className="mt-1 flex items-center justify-between text-xs text-slate-muted">
                  <span>{d.term}</span>
                  <span>
                    AI: <span className="capitalize">{d.ai_recommendation ?? "—"}</span> ·{" "}
                    {d.ai_confidence != null ? `${Math.round(d.ai_confidence * 100)}%` : "—"}
                  </span>
                </div>
              </button>
            ))}
          </div>

          {selected && (
            <div className="ledger-card p-6">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-display text-lg">{selected.student?.full_name ?? selected.student_id}</h3>
                  <p className="text-sm text-slate-muted">
                    {selected.student?.program} · {selected.student?.degree_level} · Term {selected.term}
                  </p>
                </div>
                <div className="text-right">
                  <p className="eyebrow">AI recommendation</p>
                  <p className="font-display text-lg capitalize">{selected.ai_recommendation ?? "—"}</p>
                  <p className="text-xs text-slate-muted">
                    Confidence: {selected.ai_confidence != null ? `${Math.round(selected.ai_confidence * 100)}%` : "—"}
                  </p>
                </div>
              </div>

              <p className="mt-4 text-sm">{selected.ai_reasoning_summary}</p>

              <div className="mt-5">
                <p className="eyebrow mb-2">Evidence</p>
                <ul className="space-y-2">
                  {(selected.ai_evidence ?? []).map((ev, i) => (
                    <li key={i} className="rounded-seal border border-paper-line bg-paper px-3 py-2 text-sm">
                      <p>{ev.claim}</p>
                      <p className="mt-1 text-xs text-slate-muted">
                        {ev.excerpt_summary} — <span className="font-mono">doc {ev.source_document_id.slice(0, 8)}</span>
                      </p>
                    </li>
                  ))}
                  {(!selected.ai_evidence || selected.ai_evidence.length === 0) && (
                    <li className="text-sm text-slate-muted">No evidence attached.</li>
                  )}
                </ul>
              </div>

              <div className="mt-6 border-t border-paper-line pt-5">
                <label htmlFor="comment" className="mb-1 block text-sm font-medium">
                  Comment {selected.ai_recommendation && "(required if you override the AI recommendation)"}
                </label>
                <textarea
                  id="comment"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  rows={2}
                  className="w-full rounded-seal border border-paper-line px-3 py-2 text-sm focus:border-petrol"
                  placeholder="Reasoning for your decision…"
                />

                {actionError && <p className="mt-2 text-sm text-status-danger">{actionError}</p>}

                <div className="mt-4 flex gap-3">
                  <button
                    disabled={submitting}
                    onClick={() => void handleDecide("approve")}
                    className="rounded-seal bg-status-success px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
                  >
                    Approve
                  </button>
                  <button
                    disabled={submitting}
                    onClick={() => void handleDecide("conditional")}
                    className="rounded-seal bg-status-warning px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
                  >
                    Mark conditional
                  </button>
                  <button
                    disabled={submitting}
                    onClick={() => void handleDecide("reject")}
                    className="rounded-seal bg-status-danger px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
                  >
                    Reject
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { RiskBadge, DecisionBadge, DocStatusBadge } from "../components/Badge";
import type { StudentProfile, DocumentRecord, StipendDecision, WelfareEvent, AuditLogEntry } from "../lib/types";

type Tab = "overview" | "documents" | "stipend" | "welfare" | "audit";

export function StudentProfilePage() {
  const { studentId } = useParams<{ studentId: string }>();
  const [tab, setTab] = useState<Tab>("overview");
  const [student, setStudent] = useState<StudentProfile | null>(null);
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [decisions, setDecisions] = useState<StipendDecision[]>([]);
  const [welfare, setWelfare] = useState<WelfareEvent[]>([]);
  const [audit, setAudit] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (studentId) void loadAll(studentId);
  }, [studentId]);

  async function loadAll(id: string) {
    setLoading(true);
    const [{ data: s }, { data: docs }, { data: dec }, { data: wel }] = await Promise.all([
      supabase.from("student_profiles").select("*").eq("student_id", id).maybeSingle(),
      supabase.from("document_records").select("*").eq("student_id", id).order("submitted_at", { ascending: false }),
      supabase.from("stipend_decisions").select("*").eq("student_id", id).order("created_at", { ascending: false }),
      supabase.from("welfare_events").select("*").eq("student_id", id).order("detected_at", { ascending: false }),
    ]);

    setStudent(s as StudentProfile);
    setDocuments((docs as DocumentRecord[]) ?? []);
    setDecisions((dec as StipendDecision[]) ?? []);
    setWelfare((wel as WelfareEvent[]) ?? []);

    const entityIds = [
      id,
      ...(docs ?? []).map((d) => d.document_id),
      ...(dec ?? []).map((d) => d.decision_id),
      ...(wel ?? []).map((w) => w.event_id),
    ];
    const { data: auditRows } = await supabase
      .from("audit_log")
      .select("*")
      .in("entity_id", entityIds)
      .order("created_at", { ascending: false })
      .limit(100);
    setAudit((auditRows as AuditLogEntry[]) ?? []);

    setLoading(false);
  }

  if (loading || !student) return <p className="text-slate-muted">Loading student record…</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <p className="eyebrow">Student Register</p>
          <h2 className="mt-1 font-display text-2xl">{student.full_name}</h2>
          <p className="font-mono text-xs text-slate-muted">{student.student_id}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="capitalize text-sm text-slate-muted">{student.status}</span>
          <RiskBadge value={student.risk_level} />
        </div>
      </div>

      <div className="flex gap-1 border-b border-paper-line">
        {(
          [
            ["overview", "Overview"],
            ["documents", `Documents (${documents.length})`],
            ["stipend", `Stipend History (${decisions.length})`],
            ["welfare", `Welfare (${welfare.filter((w) => !w.resolved).length} open)`],
            ["audit", "Audit Log"],
          ] as [Tab, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm ${
              tab === key ? "border-petrol text-petrol" : "border-transparent text-slate-muted hover:text-slate-text"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="ledger-card grid grid-cols-2 gap-x-8 gap-y-4 p-6 text-sm md:grid-cols-3">
          <Field label="University" value={student.university} />
          <Field label="Program" value={student.program} />
          <Field label="Degree level" value={student.degree_level} />
          <Field label="Current GPA" value={student.current_gpa != null ? String(student.current_gpa) : null} mono />
          <Field label="Grading scale note" value={student.grading_scale_note} />
          <Field label="Sponsorship" value={student.sponsorship_type} />
          <Field label="WhatsApp" value={student.phone_whatsapp} mono />
          <Field label="Email" value={student.email} />
          <Field label="Residence city" value={student.residence_city} />
          <Field
            label="Last contact"
            value={student.last_contact_at ? new Date(student.last_contact_at).toLocaleString() : "Never"}
          />
        </div>
      )}

      {tab === "documents" && (
        <div className="ledger-card divide-y divide-paper-line">
          {documents.length === 0 && <p className="p-6 text-sm text-slate-muted">No documents on file yet.</p>}
          {documents.map((d) => (
            <div key={d.document_id} className="p-4">
              <div className="flex items-center justify-between">
                <span className="font-medium capitalize">{d.doc_type.replace(/_/g, " ")}</span>
                <DocStatusBadge value={d.status} />
              </div>
              <p className="mt-1 text-sm text-slate-muted">{d.ai_summary}</p>
              <div className="mt-2 flex flex-wrap gap-x-4 text-xs text-slate-muted">
                <span>Submitted {new Date(d.submitted_at).toLocaleDateString()}</span>
                <span>Via {d.source_channel}</span>
                {d.ocr_confidence != null && <span>Confidence {Math.round(d.ocr_confidence * 100)}%</span>}
                {d.expiry_date && <span>Expires {d.expiry_date}</span>}
              </div>
              {d.anomaly_flags.length > 0 && (
                <p className="mt-1 text-xs text-status-danger">Flags: {d.anomaly_flags.join(", ")}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {tab === "stipend" && (
        <div className="ledger-card divide-y divide-paper-line">
          {decisions.length === 0 && <p className="p-6 text-sm text-slate-muted">No stipend cases yet.</p>}
          {decisions.map((d) => (
            <div key={d.decision_id} className="flex items-center justify-between p-4">
              <div>
                <p className="font-medium">{d.term}</p>
                <p className="text-xs text-slate-muted">
                  AI: <span className="capitalize">{d.ai_recommendation ?? "—"}</span>
                  {d.override_flag && " · overridden by staff"}
                </p>
                {d.human_comment && <p className="mt-1 text-xs italic text-slate-muted">"{d.human_comment}"</p>}
              </div>
              <DecisionBadge value={d.human_decision} />
            </div>
          ))}
        </div>
      )}

      {tab === "welfare" && (
        <div className="ledger-card divide-y divide-paper-line">
          {welfare.length === 0 && <p className="p-6 text-sm text-slate-muted">No welfare events recorded.</p>}
          {welfare.map((w) => (
            <div key={w.event_id} className="p-4">
              <div className="flex items-center justify-between">
                <span className="font-medium capitalize">{w.event_type.replace(/_/g, " ")}</span>
                <span className={`text-xs ${w.resolved ? "text-status-success" : "text-status-warning"}`}>
                  {w.resolved ? "Resolved" : "Open"}
                </span>
              </div>
              <p className="mt-1 text-sm">{w.description}</p>
              <p className="mt-1 text-xs text-slate-muted">{new Date(w.detected_at).toLocaleString()}</p>
              {w.resolution_note && <p className="mt-1 text-xs italic text-slate-muted">Resolved: {w.resolution_note}</p>}
            </div>
          ))}
        </div>
      )}

      {tab === "audit" && (
        <div className="ledger-card p-4">
          <p className="mb-3 text-xs text-slate-muted">
            Every entry below is chained to the one before it — tampering with any past record breaks every hash
            that follows.
          </p>
          <ol className="relative space-y-4 border-l border-paper-line pl-5">
            {audit.map((a) => (
              <li key={a.log_id} className="relative">
                <span className="absolute -left-[23px] top-1 h-2.5 w-2.5 rounded-full bg-gold" />
                <p className="text-sm">
                  <span className="font-medium">{a.action.replace(/_/g, " ")}</span> on {a.entity_type} by{" "}
                  <span className="font-mono text-xs">{a.actor}</span>
                </p>
                <p className="text-xs text-slate-muted">{new Date(a.created_at).toLocaleString()}</p>
              </li>
            ))}
            {audit.length === 0 && <p className="text-sm text-slate-muted">No audit entries yet.</p>}
          </ol>
        </div>
      )}
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string | null; mono?: boolean }) {
  return (
    <div>
      <p className="eyebrow">{label}</p>
      <p className={mono ? "font-mono text-sm" : "text-sm"}>{value ?? "—"}</p>
    </div>
  );
}

import { supabase } from "./supabaseClient";

const FUNCTIONS_BASE = import.meta.env.VITE_SUPABASE_FUNCTIONS_URL as string; // e.g. https://<ref>.functions.supabase.co

async function authedPost<T>(path: string, body: unknown): Promise<T> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new Error("Not signed in.");

  const res = await fetch(`${FUNCTIONS_BASE}/${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  const json = await res.json();
  if (!res.ok) {
    throw new Error(json?.error ?? `Request to ${path} failed (${res.status})`);
  }
  return json as T;
}

export function recordStipendDecision(input: {
  decision_id: string;
  human_decision: "approve" | "conditional" | "reject";
  human_comment?: string;
  stipend_amount?: number;
}) {
  return authedPost<{ decision: unknown }>("record-decision", input);
}

export function resolveWelfareEvent(input: { event_id: string; resolution_note: string }) {
  return authedPost<{ event: unknown; new_risk_level: string }>("resolve-welfare-event", input);
}

export function generateReport(input: {
  period_start: string;
  period_end: string;
  report_type?: "full" | "stipend_only" | "welfare_only";
}) {
  return authedPost<{ report_markdown: string; stats: unknown }>("generate-report", input);
}

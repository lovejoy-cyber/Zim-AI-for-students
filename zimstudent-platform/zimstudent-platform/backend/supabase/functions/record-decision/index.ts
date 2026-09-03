// POST /record-decision
// Auth: Authorization: Bearer <staff member's Supabase session access_token>
// Body: { decision_id: string, human_decision: "approve"|"conditional"|"reject",
//         human_comment?: string, stipend_amount?: number }
//
// This is the ONLY way a stipend_decisions row ever leaves human_decision =
// 'pending'. Enforces: read_only accounts cannot decide; overriding the AI
// recommendation requires a comment; every call writes a hash-chained audit
// entry naming the actual staff member, not just "system".

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { writeAuditLog } from "../_shared/audit.ts";
import { verifyStaff, AuthError } from "../_shared/verifyStaff.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const staff = await verifyStaff(req, supabase);

    if (staff.role === "read_only") {
      return json({ error: "Read-only accounts cannot record decisions." }, 403);
    }

    const { decision_id, human_decision, human_comment, stipend_amount } = await req.json();

    if (!decision_id || !human_decision) {
      return json({ error: "decision_id and human_decision are required" }, 400);
    }
    if (!["approve", "conditional", "reject"].includes(human_decision)) {
      return json({ error: "human_decision must be one of: approve, conditional, reject" }, 400);
    }

    const { data: existing, error: fetchErr } = await supabase
      .from("stipend_decisions")
      .select("*")
      .eq("decision_id", decision_id)
      .maybeSingle();
    if (fetchErr) throw fetchErr;
    if (!existing) return json({ error: "decision not found" }, 404);

    const isOverride = Boolean(existing.ai_recommendation) && human_decision !== existing.ai_recommendation;
    if (isOverride && !human_comment) {
      return json({ error: "A comment is required when your decision differs from the AI recommendation." }, 400);
    }

    const { data: updated, error: updateErr } = await supabase
      .from("stipend_decisions")
      .update({
        human_decision,
        human_officer_id: staff.staff_id,
        human_comment: human_comment ?? null,
        override_flag: isOverride,
        stipend_amount: stipend_amount ?? existing.stipend_amount,
        decided_at: new Date().toISOString(),
      })
      .eq("decision_id", decision_id)
      .select()
      .single();
    if (updateErr) throw updateErr;

    await writeAuditLog(supabase, {
      entity_type: "StipendDecision",
      entity_id: decision_id,
      action: isOverride ? "overridden" : "human_decided",
      actor: `user:${staff.staff_id}`,
      before_state: existing,
      after_state: updated,
    });

    await notifyStudentIfPossible(supabase, existing.student_id, human_decision, existing.term);

    return json({ decision: updated });
  } catch (err) {
    if (err instanceof AuthError) return json({ error: err.message }, 401);
    console.error("record-decision error:", err);
    return json({ error: (err as Error).message ?? String(err) }, 500);
  }
});

// Best-effort WhatsApp notification. Free-text messages only deliver
// reliably within the 24h window after the student's last inbound message —
// for older conversations, swap this for an approved "stipend_decision"
// message template (Section 7.2 of the spec) via the templates endpoint.
async function notifyStudentIfPossible(supabase: any, studentId: string, decision: string, term: string) {
  try {
    const { data: student } = await supabase
      .from("student_profiles")
      .select("phone_whatsapp")
      .eq("student_id", studentId)
      .maybeSingle();
    if (!student?.phone_whatsapp) return;

    const token = Deno.env.get("WHATSAPP_TOKEN");
    const phoneNumberId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");
    if (!token || !phoneNumberId) return;

    await fetch(`https://graph.facebook.com/v20.0/${phoneNumberId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: student.phone_whatsapp,
        type: "text",
        text: { body: `Your stipend status for ${term} has been updated: ${decision.toUpperCase()}. Reply "status" anytime for details.` },
      }),
    });
  } catch (e) {
    console.error("Notification attempt failed (non-fatal):", e);
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

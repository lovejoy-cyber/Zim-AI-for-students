// POST /resolve-welfare-event
// Auth: Authorization: Bearer <staff member's Supabase session access_token>
// Body: { event_id: string, resolution_note: string }

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
      return json({ error: "Read-only accounts cannot resolve welfare events." }, 403);
    }

    const { event_id, resolution_note } = await req.json();
    if (!event_id || !resolution_note) {
      return json({ error: "event_id and resolution_note are required" }, 400);
    }

    const { data: existing, error: fetchErr } = await supabase
      .from("welfare_events")
      .select("*")
      .eq("event_id", event_id)
      .maybeSingle();
    if (fetchErr) throw fetchErr;
    if (!existing) return json({ error: "welfare event not found" }, 404);

    const { data: updated, error: updateErr } = await supabase
      .from("welfare_events")
      .update({
        resolved: true,
        resolution_note,
        resolved_at: new Date().toISOString(),
        resolved_by: staff.staff_id,
      })
      .eq("event_id", event_id)
      .select()
      .single();
    if (updateErr) throw updateErr;

    await writeAuditLog(supabase, {
      entity_type: "WelfareEvent",
      entity_id: event_id,
      action: "human_decided",
      actor: `user:${staff.staff_id}`,
      before_state: existing,
      after_state: updated,
    });

    // Recompute this student's overall risk level from remaining open events.
    const { data: openEvents } = await supabase
      .from("welfare_events")
      .select("severity")
      .eq("student_id", existing.student_id)
      .eq("resolved", false);

    const riskLevel = computeRiskLevel(openEvents ?? []);
    await supabase.from("student_profiles").update({ risk_level: riskLevel }).eq("student_id", existing.student_id);

    return json({ event: updated, new_risk_level: riskLevel });
  } catch (err) {
    if (err instanceof AuthError) return json({ error: err.message }, 401);
    console.error("resolve-welfare-event error:", err);
    return json({ error: (err as Error).message ?? String(err) }, 500);
  }
});

function computeRiskLevel(events: { severity: string }[]): string {
  if (events.some((e) => e.severity === "critical")) return "critical";
  if (events.some((e) => e.severity === "high")) return "high";
  if (events.filter((e) => e.severity === "medium").length >= 2) return "high";
  if (events.some((e) => e.severity === "medium")) return "medium";
  if (events.some((e) => e.severity === "low")) return "low";
  return "none";
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

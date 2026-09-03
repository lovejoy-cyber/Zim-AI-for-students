// POST /welfare-scan  (call this on a schedule - see README for cron setup)
//
// Scans all active students for silence, document expiry, and academic risk
// patterns, asks Claude to flag them, writes welfare_events, and recomputes
// each flagged student's risk_level.

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { callClaudeJSON } from "../_shared/claude.ts";
import { writeAuditLog } from "../_shared/audit.ts";

const WELFARE_SYSTEM_PROMPT = `You are a welfare-monitoring assistant for embassy staff overseeing
Zimbabwean students in Algeria. You run periodically over a batch of
students, NOT per individual message.

You will be given a JSON object: { students: [...], silence_threshold_days }
Each student has: student_id, last_contact_date, current_gpa,
upcoming_expiries (array of {doc_type, expiry_date}).

Your task, per student:
1. Flag "silence_alert" if last_contact_date is more than
   silence_threshold_days in the past (or null/never contacted).
2. Flag "document_expiry" for any upcoming_expiries within 30 days.
3. Flag "academic_risk" only if current_gpa is clearly low (below 10/20) -
   you do not have full GPA trend history in this batch, so be conservative.
4. Do NOT speculate about a student's personal circumstances beyond what
   the data shows - describe the pattern factually (e.g. "no contact in
   62 days") rather than guessing a cause.
5. Assign a severity: info, low, medium, high, critical. Reserve "critical"
   for combinations of multiple serious flags on the same student.

Respond ONLY with this exact JSON structure, no other commentary:
{
  "flagged_students": [
    {
      "student_id": "...",
      "flags": [
        {"event_type": "silence_alert|document_expiry|academic_risk", "severity": "...", "description": "..."}
      ]
    }
  ]
}

If a student has no flags, omit them from flagged_students entirely.`;

const SILENCE_THRESHOLD_DAYS = Number(Deno.env.get("SILENCE_THRESHOLD_DAYS") ?? "60");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: students, error: studentsErr } = await supabase
      .from("student_profiles")
      .select("student_id, full_name, last_contact_at, current_gpa")
      .eq("status", "active");
    if (studentsErr) throw studentsErr;
    if (!students || students.length === 0) return json({ flagged: 0 });

    const in30Days = new Date();
    in30Days.setDate(in30Days.getDate() + 30);

    const { data: expiries } = await supabase
      .from("document_records")
      .select("student_id, doc_type, expiry_date")
      .not("expiry_date", "is", null)
      .gte("expiry_date", new Date().toISOString().slice(0, 10))
      .lte("expiry_date", in30Days.toISOString().slice(0, 10));

    const batch = students.map((s) => ({
      student_id: s.student_id,
      last_contact_date: s.last_contact_at,
      current_gpa: s.current_gpa,
      upcoming_expiries: (expiries ?? [])
        .filter((e) => e.student_id === s.student_id)
        .map((e) => ({ doc_type: e.doc_type, expiry_date: e.expiry_date })),
    }));

    const result = await callClaudeJSON({
      system: WELFARE_SYSTEM_PROMPT,
      content: [
        {
          type: "text",
          text: JSON.stringify({ students: batch, silence_threshold_days: SILENCE_THRESHOLD_DAYS }, null, 2),
        },
      ],
      maxTokens: 4000,
    });

    const flaggedStudents: any[] = result.flagged_students ?? [];
    let insertedCount = 0;

    for (const entry of flaggedStudents) {
      for (const flag of entry.flags ?? []) {
        const { data: event, error: insertErr } = await supabase
          .from("welfare_events")
          .insert({
            student_id: entry.student_id,
            event_type: flag.event_type,
            severity: flag.severity,
            description: flag.description,
            detected_by: "system",
          })
          .select()
          .single();

        if (insertErr) {
          console.error("welfare_events insert failed:", insertErr);
          continue;
        }
        insertedCount++;

        await writeAuditLog(supabase, {
          entity_type: "WelfareEvent",
          entity_id: event.event_id,
          action: "ai_recommended",
          actor: "system:welfare-monitoring-agent",
          after_state: event,
        });
      }

      const { data: openEvents } = await supabase
        .from("welfare_events")
        .select("severity")
        .eq("student_id", entry.student_id)
        .eq("resolved", false);

      const riskLevel = computeRiskLevel(openEvents ?? []);
      await supabase.from("student_profiles").update({ risk_level: riskLevel }).eq("student_id", entry.student_id);
    }

    return json({ students_scanned: students.length, events_flagged: insertedCount });
  } catch (err) {
    console.error("welfare-scan error:", err);
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

// POST /generate-report
// Auth: Authorization: Bearer <staff member's Supabase session access_token>
// Body: { period_start: "YYYY-MM-DD", period_end: "YYYY-MM-DD", report_type?: "full"|"stipend_only"|"welfare_only" }
//
// Aggregates real numbers from the database (never invents figures), then
// asks Claude to draft the executive summary and narrative sections around
// them. Returns both the markdown and the raw stats so the dashboard can
// also render its own charts from the same numbers.

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { callClaudeText } from "../_shared/claude.ts";
import { verifyStaff, AuthError } from "../_shared/verifyStaff.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const REPORT_SYSTEM_PROMPT = `You are a reporting assistant for embassy leadership. You will be given
aggregated statistics (JSON) for a specified period: student snapshot,
stipend activity, welfare event counts, and operational metrics. All
numbers are already computed and verified - never invent or adjust any
figure, only narrate what is given.

Your task:
1. Write a concise EXECUTIVE SUMMARY (4-6 sentences) suitable for the
   Ambassador - plain language, no jargon, lead with the headline numbers.
2. Organize the rest into clear sections: Stipend Activity, Welfare & Duty
   of Care, Operational Efficiency.
3. Use markdown tables for the numeric breakdowns given to you.
4. Keep tone factual and professional - this may be read by Ministry
   officials.
5. Do not mention or speculate about any individual student - this report
   only contains aggregate statistics.

Respond in clean Markdown only (no preamble, no code fences), ready for
direct conversion to PDF/Word.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    await verifyStaff(req, supabase); // any active staff role (including read_only) may generate reports

    const { period_start, period_end, report_type } = await req.json();
    if (!period_start || !period_end) {
      return json({ error: "period_start and period_end (YYYY-MM-DD) are required" }, 400);
    }

    const { data: decisions } = await supabase
      .from("stipend_decisions")
      .select("human_decision, stipend_amount, decided_at")
      .gte("decided_at", period_start)
      .lte("decided_at", period_end);

    const stipendCounts = countBy(decisions ?? [], "human_decision");
    const totalDisbursed = (decisions ?? []).reduce((sum, d) => sum + (Number(d.stipend_amount) || 0), 0);

    const { data: welfareEvents } = await supabase
      .from("welfare_events")
      .select("severity, resolved, detected_at")
      .gte("detected_at", period_start)
      .lte("detected_at", period_end);

    const welfareCounts = countBy(welfareEvents ?? [], "severity");
    const openWelfare = (welfareEvents ?? []).filter((e) => !e.resolved).length;

    const { data: docs } = await supabase
      .from("document_records")
      .select("submitted_at, processed_at")
      .gte("submitted_at", period_start)
      .lte("submitted_at", period_end)
      .not("processed_at", "is", null);

    const avgProcessingMinutes = averageProcessingMinutes(docs ?? []);

    const { count: totalStudents } = await supabase
      .from("student_profiles")
      .select("*", { count: "exact", head: true });
    const { count: activeStudents } = await supabase
      .from("student_profiles")
      .select("*", { count: "exact", head: true })
      .eq("status", "active");

    const stats = {
      period: { start: period_start, end: period_end },
      report_type: report_type ?? "full",
      student_snapshot: { total_students: totalStudents ?? 0, active_students: activeStudents ?? 0 },
      stipend_activity: { counts_by_decision: stipendCounts, total_disbursed: totalDisbursed },
      welfare: { counts_by_severity: welfareCounts, open_unresolved: openWelfare },
      operational: { documents_processed: (docs ?? []).length, avg_processing_minutes: avgProcessingMinutes },
    };

    const reportMarkdown = await callClaudeText({
      system: REPORT_SYSTEM_PROMPT,
      content: [{ type: "text", text: JSON.stringify(stats, null, 2) }],
      maxTokens: 2500,
    });

    return json({ report_markdown: reportMarkdown, stats });
  } catch (err) {
    if (err instanceof AuthError) return json({ error: err.message }, 401);
    console.error("generate-report error:", err);
    return json({ error: (err as Error).message ?? String(err) }, 500);
  }
});

function countBy(rows: Record<string, unknown>[], key: string): Record<string, number> {
  return rows.reduce((acc: Record<string, number>, row) => {
    const k = String(row[key] ?? "unknown");
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});
}

function averageProcessingMinutes(docs: { submitted_at: string; processed_at: string }[]): number | null {
  if (docs.length === 0) return null;
  const totalMinutes = docs.reduce((sum, d) => {
    const diffMs = new Date(d.processed_at).getTime() - new Date(d.submitted_at).getTime();
    return sum + diffMs / 60000;
  }, 0);
  return Math.round((totalMinutes / docs.length) * 10) / 10;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

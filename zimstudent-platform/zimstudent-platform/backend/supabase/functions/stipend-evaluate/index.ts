// POST /stipend-evaluate
// Body: { student_id: string, term: string }
//
// Gathers a student's processed documents + term criteria + decision history,
// asks Claude for a recommendation with cited evidence, and writes it to
// stipend_decisions with human_decision = 'pending'. A human officer must
// still approve/override before anything is final (see the staff dashboard).

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { callClaudeJSON } from "../_shared/claude.ts";
import { writeAuditLog } from "../_shared/audit.ts";

const STIPEND_SYSTEM_PROMPT = `You are a decision-support assistant for embassy staff evaluating student
stipend eligibility. You do NOT make the final decision - a human officer
always does. Your job is to produce a clear, evidence-based RECOMMENDATION.

You will be given, as JSON:
- student_profile_summary (program, degree level, current GPA)
- term
- criteria (min_gpa, required_doc_types)
- documents: processed documents relevant to this student, each with a
  document_id, doc_type, extracted_fields, ai_summary, anomaly_flags
- prior_decisions: the student's stipend decision history

Your task:
1. Check completeness: are all of criteria.required_doc_types present among
   the given documents?
2. Check academic standing: does current_gpa (or the GPA in the relevant
   transcript's extracted_fields) meet or exceed criteria.min_gpa?
3. Check enrollment status via any attestation_inscription document.
4. Check for anomaly_flags on any of the documents.
5. Produce ONE of: "approve", "conditional", "reject"
   - approve: all criteria clearly met, no anomalies
   - conditional: minor gaps (specify exactly what is missing or borderline)
   - reject: clear failure of criteria, or a significant anomaly/inconsistency
   - Never recommend "reject" solely because of incomplete documents if the
     student simply hasn't had a chance to submit them yet - use
     "conditional" and say exactly what's needed instead.
6. For every claim, cite the specific document_id it comes from and give a
   short PARAPHRASED (never verbatim-quoted) description of what that
   document shows.
7. Give a confidence score (0.0-1.0) reflecting how clear-cut this case is.

Respond ONLY with this exact JSON structure, no other commentary:
{
  "recommendation": "approve | conditional | reject",
  "confidence": 0.0,
  "evidence": [
    {"claim": "...", "source_document_id": "...", "excerpt_summary": "..."}
  ],
  "reasoning_summary": "...",
  "missing_or_needed": [ ... ]
}`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { student_id, term } = await req.json();
    if (!student_id || !term) return json({ error: "student_id and term are required" }, 400);

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: student, error: studentErr } = await supabase
      .from("student_profiles")
      .select("*")
      .eq("student_id", student_id)
      .maybeSingle();
    if (studentErr) throw studentErr;
    if (!student) return json({ error: `student_id ${student_id} not found` }, 404);

    const { data: documents, error: docsErr } = await supabase
      .from("document_records")
      .select("document_id, doc_type, extracted_fields, ai_summary, anomaly_flags, status")
      .eq("student_id", student_id)
      .in("status", ["processed", "needs_review"]);
    if (docsErr) throw docsErr;

    const { data: criteria } = await supabase
      .from("stipend_criteria")
      .select("*")
      .eq("term", term)
      .maybeSingle();

    const activeCriteria = criteria ?? {
      min_gpa: 10.0,
      required_doc_types: ["transcript", "attestation_inscription"],
    };

    const { data: history } = await supabase
      .from("stipend_decisions")
      .select("term, human_decision, ai_recommendation")
      .eq("student_id", student_id)
      .order("created_at", { ascending: false })
      .limit(5);

    const userPayload = {
      student_profile_summary: {
        full_name: student.full_name,
        program: student.program,
        degree_level: student.degree_level,
        current_gpa: student.current_gpa,
      },
      term,
      criteria: {
        min_gpa: activeCriteria.min_gpa,
        required_doc_types: activeCriteria.required_doc_types,
      },
      documents: documents ?? [],
      prior_decisions: history ?? [],
    };

    const recommendation = await callClaudeJSON({
      system: STIPEND_SYSTEM_PROMPT,
      content: [{ type: "text", text: JSON.stringify(userPayload, null, 2) }],
      maxTokens: 2000,
    });

    const { data: decision, error: upsertErr } = await supabase
      .from("stipend_decisions")
      .upsert(
        {
          student_id,
          term,
          ai_recommendation: recommendation.recommendation,
          ai_confidence: recommendation.confidence,
          ai_evidence: recommendation.evidence,
          ai_reasoning_summary: recommendation.reasoning_summary,
          human_decision: "pending",
          override_flag: false,
        },
        { onConflict: "student_id,term" },
      )
      .select()
      .single();
    if (upsertErr) throw upsertErr;

    await writeAuditLog(supabase, {
      entity_type: "StipendDecision",
      entity_id: decision.decision_id,
      action: "ai_recommended",
      actor: "system:stipend-evaluation-agent",
      after_state: decision,
    });

    return json({ decision, missing_or_needed: recommendation.missing_or_needed ?? [] }, 200);
  } catch (err) {
    console.error("stipend-evaluate error:", err);
    return json({ error: (err as Error).message ?? String(err) }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

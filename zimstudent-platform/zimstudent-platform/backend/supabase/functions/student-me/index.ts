// GET /student-me
// Auth: Authorization: Bearer <student session token from verify-otp>
//
// Read-only summary a student sees in the portal: their own profile,
// documents, stipend decisions, and any open welfare events they should
// know about. Everything is scoped to their own student_id only — there is
// no way for this token to read another student's data.

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { extractStudentId, StudentAuthError } from "../_shared/studentAuth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const studentId = await extractStudentId(req);
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const [{ data: profile }, { data: documents }, { data: decisions }, { data: welfare }] = await Promise.all([
      supabase.from("student_profiles").select("*").eq("student_id", studentId).maybeSingle(),
      supabase
        .from("document_records")
        .select("document_id, doc_type, status, ai_summary, submitted_at, expiry_date")
        .eq("student_id", studentId)
        .order("submitted_at", { ascending: false }),
      supabase
        .from("stipend_decisions")
        .select("term, human_decision, decided_at")
        .eq("student_id", studentId)
        .order("created_at", { ascending: false }),
      supabase
        .from("welfare_events")
        .select("event_type, description, detected_at")
        .eq("student_id", studentId)
        .eq("resolved", false)
        .in("event_type", ["document_expiry"]), // only surface actionable ones to the student, not internal risk flags
    ]);

    if (!profile) return json({ error: "Student profile not found." }, 404);

    return json({
      profile: {
        full_name: profile.full_name,
        student_id: profile.student_id,
        university: profile.university,
        program: profile.program,
        degree_level: profile.degree_level,
        current_gpa: profile.current_gpa,
        status: profile.status,
      },
      documents: documents ?? [],
      stipend_history: decisions ?? [],
      action_needed: welfare ?? [],
    });
  } catch (err) {
    if (err instanceof StudentAuthError) return json({ error: err.message }, 401);
    console.error("student-me error:", err);
    return json({ error: (err as Error).message ?? String(err) }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

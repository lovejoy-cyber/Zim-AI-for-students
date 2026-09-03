// POST /verify-otp
// Body: { phone: string, code: string }
// Returns: { token, student_id } on success — the token is a signed,
// self-contained student session (see _shared/studentAuth.ts), used as a
// Bearer token on student-me and student-submit-document.

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { sha256 } from "../_shared/audit.ts";
import { signStudentToken } from "../_shared/studentAuth.ts";

const MAX_ATTEMPTS = 5;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { phone, code } = await req.json();
    if (!phone || !code) return json({ error: "phone and code are required" }, 400);
    const normalizedPhone = String(phone).replace(/[^0-9]/g, "");

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: otpRow, error: fetchErr } = await supabase
      .from("student_otp_codes")
      .select("*")
      .eq("phone", normalizedPhone)
      .eq("consumed", false)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (fetchErr) throw fetchErr;

    if (!otpRow) return json({ error: "No active code for this number. Request a new one." }, 400);
    if (new Date(otpRow.expires_at).getTime() < Date.now()) {
      return json({ error: "That code has expired. Request a new one." }, 400);
    }
    if (otpRow.attempts >= MAX_ATTEMPTS) {
      return json({ error: "Too many incorrect attempts. Request a new code." }, 429);
    }

    const codeHash = await sha256(String(code));
    if (codeHash !== otpRow.code_hash) {
      await supabase
        .from("student_otp_codes")
        .update({ attempts: otpRow.attempts + 1 })
        .eq("id", otpRow.id);
      return json({ error: "Incorrect code." }, 400);
    }

    await supabase.from("student_otp_codes").update({ consumed: true }).eq("id", otpRow.id);

    const { data: student, error: studentErr } = await supabase
      .from("student_profiles")
      .select("student_id")
      .eq("phone_whatsapp", normalizedPhone)
      .maybeSingle();
    if (studentErr) throw studentErr;
    if (!student) return json({ error: "No student profile found for this number." }, 404);

    const token = await signStudentToken(student.student_id);
    return json({ token, student_id: student.student_id });
  } catch (err) {
    console.error("verify-otp error:", err);
    return json({ error: (err as Error).message ?? String(err) }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

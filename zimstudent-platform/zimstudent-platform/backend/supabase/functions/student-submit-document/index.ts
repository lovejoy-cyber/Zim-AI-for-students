// POST /student-submit-document
// Auth: Authorization: Bearer <student session token from verify-otp>
// Body: { file_base64: string, media_type: string }
//
// The portal's equivalent of sending a photo over WhatsApp — verifies the
// student's own token (so they can only ever submit as themselves), then
// forwards straight into the same document-ingest pipeline WhatsApp uses.

import { extractStudentId, StudentAuthError } from "../_shared/studentAuth.ts";
import { corsHeaders } from "../_shared/cors.ts";

const DOCUMENT_INGEST_URL = Deno.env.get("DOCUMENT_INGEST_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const studentId = await extractStudentId(req);
    const { file_base64, media_type } = await req.json();
    if (!file_base64 || !media_type) {
      return json({ error: "file_base64 and media_type are required" }, 400);
    }

    const ingestRes = await fetch(DOCUMENT_INGEST_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({
        student_id: studentId,
        file_base64,
        media_type,
        source_channel: "portal",
      }),
    });

    const ingestData = await ingestRes.json();
    if (!ingestRes.ok) return json({ error: ingestData.error ?? "Document processing failed." }, 502);

    return json({ document: ingestData.document });
  } catch (err) {
    if (err instanceof StudentAuthError) return json({ error: err.message }, 401);
    console.error("student-submit-document error:", err);
    return json({ error: (err as Error).message ?? String(err) }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

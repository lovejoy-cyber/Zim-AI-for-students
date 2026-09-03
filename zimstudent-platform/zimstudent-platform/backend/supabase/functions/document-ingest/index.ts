// POST /document-ingest
// Body: { student_id: string, file_base64: string, media_type: string, source_channel?: string }
//
// Pipeline: store raw file -> Claude multimodal extraction -> write DocumentRecord
// -> touch student profile -> hash-chained audit log entry.

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { callClaudeJSON } from "../_shared/claude.ts";
import { writeAuditLog } from "../_shared/audit.ts";

const EXTRACTION_SYSTEM_PROMPT = `You are a document understanding assistant for the Zimbabwe Embassy in Algeria's
student administration system. You will be shown an image or PDF of a student
document (transcript, enrollment certificate, bank statement, ID/passport, or
other). The document may be in English, French, or Arabic.

Your task:
1. Identify the document type from this list: transcript, attestation_inscription,
   bank_statement, id_card, passport, medical, insurance, residence_permit, other.
2. Extract the following fields where present, using the ORIGINAL language values
   but also provide an English translation for narrative/summary fields:
   - full_name
   - university_or_institution
   - program_or_degree
   - term_or_period
   - grade_or_gpa (note the grading scale, e.g. "/20")
   - document_date
   - expiry_date (if applicable, format YYYY-MM-DD, else null)
   - document_reference_or_stamp_number (if visible)
3. Note your OCR confidence (0.0-1.0) based on image clarity and legibility.
4. Flag any anomaly you notice (e.g., mismatched name, unusual formatting,
   signs of tampering, missing official stamp) as an array of short strings
   — note the observation factually, do not accuse.
5. Write a 2-3 sentence plain-language summary in English of what this
   document shows.

Respond ONLY with this exact JSON structure, no other commentary:
{
  "doc_type": "...",
  "language_detected": "...",
  "extracted_fields": { ... },
  "ocr_confidence": 0.0,
  "anomaly_flags": [ ... ],
  "ai_summary": "..."
}

If the image is unreadable or not a recognizable document, set doc_type to
"other", ocr_confidence to a low value, and explain why in ai_summary.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { student_id, file_base64, media_type, source_channel } = await req.json();

    if (!student_id || !file_base64 || !media_type) {
      return json({ error: "student_id, file_base64, and media_type are required" }, 400);
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // 1. Confirm the student exists
    const { data: student, error: studentErr } = await supabase
      .from("student_profiles")
      .select("student_id")
      .eq("student_id", student_id)
      .maybeSingle();
    if (studentErr) throw studentErr;
    if (!student) return json({ error: `student_id ${student_id} not found` }, 404);

    // 2. Store the raw file in the 'documents' Storage bucket
    const ext = (media_type.split("/")[1] ?? "bin").split(";")[0];
    const storagePath = `${student_id}/${crypto.randomUUID()}.${ext}`;
    const bytes = base64ToBytes(file_base64);

    const { error: uploadErr } = await supabase.storage
      .from("documents")
      .upload(storagePath, bytes, { contentType: media_type, upsert: false });
    if (uploadErr) throw uploadErr;

    // 3. Claude multimodal extraction
    const extraction = await callClaudeJSON({
      system: EXTRACTION_SYSTEM_PROMPT,
      content: [
        { type: "image", source: { type: "base64", media_type, data: file_base64 } },
        { type: "text", text: "Extract this document per your instructions. Respond with JSON only." },
      ],
    });

    const hasAnomalies = Array.isArray(extraction.anomaly_flags) && extraction.anomaly_flags.length > 0;
    const lowConfidence = (extraction.ocr_confidence ?? 0) < 0.6;
    const status = hasAnomalies || lowConfidence ? "needs_review" : "processed";

    // 4. Insert the document record
    const { data: doc, error: insertErr } = await supabase
      .from("document_records")
      .insert({
        student_id,
        source_channel: source_channel ?? "portal",
        raw_file_path: storagePath,
        doc_type: extraction.doc_type ?? "other",
        language_detected: extraction.language_detected ?? null,
        ocr_confidence: extraction.ocr_confidence ?? null,
        extracted_fields: extraction.extracted_fields ?? {},
        ai_summary: extraction.ai_summary ?? null,
        anomaly_flags: extraction.anomaly_flags ?? [],
        status,
        expiry_date: extraction.extracted_fields?.expiry_date || null,
        processed_at: new Date().toISOString(),
      })
      .select()
      .single();
    if (insertErr) throw insertErr;

    // 5. Touch the student's profile
    await supabase
      .from("student_profiles")
      .update({ updated_at: new Date().toISOString() })
      .eq("student_id", student_id);

    // 6. Immutable audit trail
    await writeAuditLog(supabase, {
      entity_type: "DocumentRecord",
      entity_id: doc.document_id,
      action: "ai_processed",
      actor: "system:document-ingest-agent",
      after_state: doc,
    });

    return json({ document: doc }, 200);
  } catch (err) {
    console.error("document-ingest error:", err);
    return json({ error: (err as Error).message ?? String(err) }, 500);
  }
});

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

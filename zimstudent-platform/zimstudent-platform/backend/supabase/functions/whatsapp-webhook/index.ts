// GET  /whatsapp-webhook -> Meta's webhook verification handshake
// POST /whatsapp-webhook -> incoming messages/media from students
//
// Flow:
//   - Unknown phone number -> auto-register a minimal student_profile
//   - Image/PDF received   -> download from WhatsApp, forward to document-ingest,
//                              reply with the AI summary
//   - Text "status"        -> reply with latest stipend decision status
//   - Text "help"          -> flag for staff follow-up
//   - Anything else        -> short menu reminder
//
// Note: free-text replies here are allowed because they occur inside the
// 24-hour customer-service window after an inbound message. PROACTIVE
// messages (expiry reminders, welfare check-ins) must use pre-approved
// WhatsApp message templates instead - see README "WhatsApp templates".

import { createClient } from "npm:@supabase/supabase-js@2";

const VERIFY_TOKEN = Deno.env.get("WHATSAPP_VERIFY_TOKEN")!;
const WHATSAPP_TOKEN = Deno.env.get("WHATSAPP_TOKEN")!;
const PHONE_NUMBER_ID = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID")!;
const GRAPH_VERSION = "v20.0";
const DOCUMENT_INGEST_URL = Deno.env.get("DOCUMENT_INGEST_URL")!; // full https URL of the deployed document-ingest function
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, SERVICE_ROLE_KEY);

Deno.serve(async (req) => {
  const url = new URL(req.url);

  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      return new Response(challenge ?? "", { status: 200 });
    }
    return new Response("Forbidden", { status: 403 });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const payload = await req.json();
    const value = payload?.entry?.[0]?.changes?.[0]?.value;
    const message = value?.messages?.[0];

    if (!message) {
      // Delivery/read status callbacks land here too - just acknowledge.
      return new Response("ok", { status: 200 });
    }

    const from = message.from as string;
    const waProfileName = value?.contacts?.[0]?.profile?.name ?? "";

    let { data: student, error: findErr } = await supabase
      .from("student_profiles")
      .select("*")
      .eq("phone_whatsapp", from)
      .maybeSingle();
    if (findErr) throw findErr;

    if (!student) {
      const generatedId = `ZW-DZ-${new Date().getFullYear()}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
      const { data: created, error: createErr } = await supabase
        .from("student_profiles")
        .insert({
          student_id: generatedId,
          full_name: waProfileName || "Unregistered Student",
          phone_whatsapp: from,
          status: "active",
        })
        .select()
        .single();
      if (createErr) throw createErr;
      student = created;

      await sendText(
        from,
        `Welcome to ZimStudent Assistant 👋 We've created your profile (ref: ${generatedId}). ` +
          `A staff member will follow up to confirm your details. You can send documents ` +
          `(transcripts, enrollment certificates, bank statements, ID) any time as a photo or PDF.`,
      );
    }

    await supabase
      .from("student_profiles")
      .update({ last_contact_at: new Date().toISOString() })
      .eq("student_id", student.student_id);

    if (message.type === "image" || message.type === "document") {
      await handleMediaMessage(message, student.student_id, from);
      return new Response("ok", { status: 200 });
    }

    if (message.type === "text") {
      await handleTextMessage(message.text?.body ?? "", student, from);
      return new Response("ok", { status: 200 });
    }

    await sendText(from, `We received your message but can currently only process text, photos, and PDF documents.`);
    return new Response("ok", { status: 200 });
  } catch (err) {
    // Always return 200 to Meta so it doesn't hammer retries; the real error
    // is logged server-side for staff/devs to investigate.
    console.error("whatsapp-webhook error:", err);
    return new Response("ok", { status: 200 });
  }
});

async function handleMediaMessage(message: any, studentId: string, from: string) {
  const mediaId = message.image?.id ?? message.document?.id;
  if (!mediaId) {
    await sendText(from, `⚠️ We couldn't read that file. Could you resend it as a photo or PDF?`);
    return;
  }

  await sendText(from, `✅ Got it! Reading your document now, one moment...`);

  const { base64, mimeType } = await downloadMedia(mediaId);

  const ingestRes = await fetch(DOCUMENT_INGEST_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({
      student_id: studentId,
      file_base64: base64,
      media_type: mimeType,
      source_channel: "whatsapp",
    }),
  });

  if (!ingestRes.ok) {
    await sendText(from, `⚠️ We couldn't process that document. Could you resend a clearer photo?`);
    return;
  }

  const { document: doc } = await ingestRes.json();
  const readableType = (doc.doc_type ?? "document").replace(/_/g, " ");
  const statusLine = doc.status === "needs_review" ? "under review by staff" : "processed";

  await sendText(from, `✅ Received your ${readableType}.\n${doc.ai_summary ?? ""}\nStatus: ${statusLine}.`);
}

async function handleTextMessage(rawText: string, student: any, from: string) {
  const text = rawText.trim().toLowerCase();

  if (["status", "check status", "2"].includes(text)) {
    const { data: latest } = await supabase
      .from("stipend_decisions")
      .select("term, human_decision, ai_recommendation")
      .eq("student_id", student.student_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!latest) {
      await sendText(from, `We don't have a stipend case on file for you yet. Once your documents are submitted, we'll begin processing.`);
    } else {
      const statusText =
        latest.human_decision === "pending"
          ? `under review (initial read: ${latest.ai_recommendation})`
          : latest.human_decision.toUpperCase();
      await sendText(from, `📋 Status for ${latest.term}: ${statusText}`);
    }
    return;
  }

  if (["talk to staff", "help", "4"].includes(text)) {
    await supabase.from("welfare_events").insert({
      student_id: student.student_id,
      event_type: "manual_note",
      severity: "info",
      description: "Student requested to speak with staff via WhatsApp.",
      detected_by: "system",
    });
    await sendText(from, `A staff member will reach out to you here on WhatsApp shortly.`);
    return;
  }

  await sendText(
    from,
    `Hi ${(student.full_name ?? "").split(" ")[0] || "there"} 👋\n` +
      `Send a photo or PDF anytime to submit a document.\nOr reply:\n"status" - check your stipend status\n"help" - talk to a staff member`,
  );
}

async function downloadMedia(mediaId: string): Promise<{ base64: string; mimeType: string }> {
  const metaRes = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${mediaId}`, {
    headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` },
  });
  if (!metaRes.ok) throw new Error(`Failed to resolve media metadata: ${await metaRes.text()}`);
  const meta = await metaRes.json();

  const fileRes = await fetch(meta.url, { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` } });
  if (!fileRes.ok) throw new Error(`Failed to download media file: ${fileRes.status}`);

  const buf = new Uint8Array(await fileRes.arrayBuffer());
  let binary = "";
  for (let i = 0; i < buf.length; i++) binary += String.fromCharCode(buf[i]);

  return { base64: btoa(binary), mimeType: meta.mime_type };
}

async function sendText(to: string, body: string) {
  const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${PHONE_NUMBER_ID}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${WHATSAPP_TOKEN}`,
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body },
    }),
  });
  if (!res.ok) console.error("WhatsApp send failed:", await res.text());
}

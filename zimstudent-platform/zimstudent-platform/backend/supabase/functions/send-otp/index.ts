// POST /send-otp
// Body: { phone: string }   e.g. "213551234567" — same digits-only format
// WhatsApp sends as the "from" field, no leading "+".
//
// Generates a 6-digit code, stores its SHA-256 hash with a 10-minute expiry,
// and delivers it over WhatsApp — the student's existing channel, so the
// portal needs no separate SMS provider or cost.
//
// Deliberately does NOT reveal whether a phone number is registered (avoids
// leaking which numbers exist in the system) — it always returns the same
// generic response, but only actually sends a code if a matching student
// exists.

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { sha256 } from "../_shared/audit.ts";

const WHATSAPP_TOKEN = Deno.env.get("WHATSAPP_TOKEN")!;
const PHONE_NUMBER_ID = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID")!;
const GRAPH_VERSION = "v20.0";
const OTP_TTL_MINUTES = 10;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { phone } = await req.json();
    if (!phone || typeof phone !== "string") {
      return json({ error: "phone is required" }, 400);
    }
    const normalizedPhone = phone.replace(/[^0-9]/g, "");

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: student } = await supabase
      .from("student_profiles")
      .select("student_id")
      .eq("phone_whatsapp", normalizedPhone)
      .maybeSingle();

    if (student) {
      const code = String(Math.floor(100000 + Math.random() * 900000));
      const codeHash = await sha256(code);
      const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000).toISOString();

      const { error: insertErr } = await supabase.from("student_otp_codes").insert({
        phone: normalizedPhone,
        code_hash: codeHash,
        expires_at: expiresAt,
      });
      if (insertErr) throw insertErr;

      await sendWhatsAppText(
        normalizedPhone,
        `Your ZimStudent portal login code is ${code}. It expires in ${OTP_TTL_MINUTES} minutes. Don't share this code with anyone.`,
      );
    }

    // Same response whether or not the number is registered.
    return json({ message: "If that WhatsApp number is registered, a login code has been sent." });
  } catch (err) {
    console.error("send-otp error:", err);
    return json({ error: (err as Error).message ?? String(err) }, 500);
  }
});

async function sendWhatsAppText(to: string, body: string) {
  const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${PHONE_NUMBER_ID}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${WHATSAPP_TOKEN}` },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body },
    }),
  });
  if (!res.ok) console.error("WhatsApp OTP send failed:", await res.text());
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

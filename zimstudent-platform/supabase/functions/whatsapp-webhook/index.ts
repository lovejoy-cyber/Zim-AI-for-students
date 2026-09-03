import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

serve(async (req) => {
  const url = new URL(req.url);

  // 1. Meta Webhook Verification (GET)
  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    const expectedToken = Deno.env.get("META_VERIFY_TOKEN");

    if (mode === "subscribe" && token === expectedToken) {
      return new Response(challenge, {
        status: 200,
        headers: { "Content-Type": "text/plain" },
      });
    }
    return new Response("Forbidden", { status: 403 });
  }

  // 2. Incoming WhatsApp Messages (POST)
  if (req.method === "POST") {
    try {
      const body = await req.json();
      console.log("Incoming WhatsApp Payload:", JSON.stringify(body, null, 2));

      return new Response(JSON.stringify({ status: "EVENT_RECEIVED" }), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), { status: 400 });
    }
  }

  return new Response("Method Not Allowed", { status: 405 });
});
// Shared helper for calling the Anthropic Messages API from Supabase Edge Functions (Deno).
//
// Model choice:
//   - "claude-sonnet-5"        -> extraction & reasoning agents (document understanding, stipend evaluation)
//   - "claude-haiku-4-5-20251001" -> cheap/fast agents (lightweight classification, welfare batch scans)
// Override via the CLAUDE_MODEL secret if you want to swap models without redeploying.

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const DEFAULT_MODEL = Deno.env.get("CLAUDE_MODEL") ?? "claude-sonnet-5";

export type ContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; source: { type: "base64"; media_type: string; data: string } };

interface CallClaudeOpts {
  system: string;
  content: ContentBlock[] | string;
  maxTokens?: number;
  model?: string;
}

/**
 * Calls Claude and parses the response as JSON. Assumes the system prompt
 * instructs the model to respond with JSON ONLY (all of this project's
 * agent prompts do). Strips stray markdown code fences defensively.
 */
export async function callClaudeJSON(opts: CallClaudeOpts): Promise<any> {
  if (!ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not set. Run: supabase secrets set ANTHROPIC_API_KEY=sk-ant-...");
  }

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: opts.model ?? DEFAULT_MODEL,
      max_tokens: opts.maxTokens ?? 1500,
      system: opts.system,
      messages: [{ role: "user", content: opts.content }],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Claude API error ${res.status}: ${errText}`);
  }

  const data = await res.json();
  const textBlock = (data.content ?? []).find((b: any) => b.type === "text");
  if (!textBlock) {
    throw new Error("Claude response contained no text block to parse.");
  }

  const cleaned = textBlock.text.replace(/```json/g, "").replace(/```/g, "").trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    throw new Error(`Failed to parse Claude JSON output. Raw (truncated): ${cleaned.slice(0, 500)}`);
  }
}

/**
 * Calls Claude and returns the raw text response (no JSON parsing). Used by
 * agents whose output is meant to be prose/markdown, like the report agent.
 */
export async function callClaudeText(opts: CallClaudeOpts): Promise<string> {
  if (!ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not set. Run: supabase secrets set ANTHROPIC_API_KEY=sk-ant-...");
  }

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: opts.model ?? DEFAULT_MODEL,
      max_tokens: opts.maxTokens ?? 2000,
      system: opts.system,
      messages: [{ role: "user", content: opts.content }],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Claude API error ${res.status}: ${errText}`);
  }

  const data = await res.json();
  const textBlock = (data.content ?? []).find((b: any) => b.type === "text");
  if (!textBlock) {
    throw new Error("Claude response contained no text block.");
  }
  return textBlock.text.trim();
}

// Writes tamper-evident, hash-chained audit log entries.
//
// Each entry's hash is computed from: the previous entry's hash + this
// entry's own fields. If anyone edits a past row directly in the database,
// every subsequent entry_hash stops matching what a recomputation would
// produce — making tampering detectable (see verify-audit-chain.ts).

import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

interface AuditEntryInput {
  entity_type: string;
  entity_id: string;
  action: string;
  actor: string; // e.g. "system:stipend-evaluation-agent" or "user:<staff_id>"
  before_state?: unknown;
  after_state?: unknown;
}

export async function writeAuditLog(supabase: SupabaseClient, entry: AuditEntryInput): Promise<void> {
  const { data: prev } = await supabase
    .from("audit_log")
    .select("entry_hash")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const prevHash = prev?.entry_hash ?? "genesis";

  const beforeHash = entry.before_state ? await sha256(JSON.stringify(entry.before_state)) : null;
  const afterHash = entry.after_state ? await sha256(JSON.stringify(entry.after_state)) : null;

  const payload = [prevHash, entry.entity_type, entry.entity_id, entry.action, entry.actor, beforeHash, afterHash].join("|");
  const entryHash = await sha256(payload);

  const { error } = await supabase.from("audit_log").insert({
    entity_type: entry.entity_type,
    entity_id: entry.entity_id,
    action: entry.action,
    actor: entry.actor,
    before_state_hash: beforeHash,
    after_state_hash: afterHash,
    prev_hash: prevHash,
    entry_hash: entryHash,
  });

  if (error) throw error;
}

export async function sha256(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

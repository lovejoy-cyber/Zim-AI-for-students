// Verifies that a request comes from an authenticated, active staff member,
// and returns their staff_id/role/name. Used by any Edge Function the staff
// dashboard calls directly (as opposed to internal service-to-service calls
// like whatsapp-webhook -> document-ingest, which use the service role key).

import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export class AuthError extends Error {}

export interface StaffContext {
  staff_id: string;
  role: "admin" | "officer" | "read_only";
  name: string;
}

export async function verifyStaff(req: Request, adminClient: SupabaseClient): Promise<StaffContext> {
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) throw new AuthError("Missing Authorization bearer token.");

  const { data: userData, error: userErr } = await adminClient.auth.getUser(token);
  if (userErr || !userData?.user) throw new AuthError("Invalid or expired session token.");

  const { data: staff, error: staffErr } = await adminClient
    .from("staff_users")
    .select("staff_id, role, name, active")
    .eq("auth_user_id", userData.user.id)
    .maybeSingle();

  if (staffErr) throw staffErr;
  if (!staff || !staff.active) throw new AuthError("No active staff record is linked to this account.");

  return { staff_id: staff.staff_id, role: staff.role, name: staff.name };
}

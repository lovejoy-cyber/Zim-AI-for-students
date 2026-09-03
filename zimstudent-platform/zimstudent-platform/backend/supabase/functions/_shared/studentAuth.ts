// Students don't have Supabase Auth accounts, so they can't use Supabase's
// session JWTs the way staff do. Instead, after a successful OTP check
// (see verify-otp), we hand them a small self-contained signed token:
//
//   base64url(payload_json) + "." + base64url(HMAC-SHA256(payload_json))
//
// It's deliberately simple (no external JWT library, no extra npm install)
// but gives the same two guarantees a JWT would: the payload can't be
// forged without STUDENT_TOKEN_SECRET, and it carries its own expiry.

const STUDENT_TOKEN_SECRET = Deno.env.get("STUDENT_TOKEN_SECRET")!;
const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

export class StudentAuthError extends Error {}

interface StudentTokenPayload {
  student_id: string;
  exp: number; // unix seconds
}

export async function signStudentToken(studentId: string): Promise<string> {
  const payload: StudentTokenPayload = {
    student_id: studentId,
    exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS,
  };
  const payloadB64 = base64url(JSON.stringify(payload));
  const signature = await hmac(payloadB64);
  return `${payloadB64}.${signature}`;
}

export async function verifyStudentToken(token: string): Promise<string> {
  const [payloadB64, signature] = token.split(".");
  if (!payloadB64 || !signature) throw new StudentAuthError("Malformed token.");

  const expectedSignature = await hmac(payloadB64);
  if (signature !== expectedSignature) throw new StudentAuthError("Invalid token signature.");

  const payload: StudentTokenPayload = JSON.parse(atob(payloadB64));
  if (payload.exp < Math.floor(Date.now() / 1000)) throw new StudentAuthError("Session expired — please log in again.");

  return payload.student_id;
}

export async function extractStudentId(req: Request): Promise<string> {
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) throw new StudentAuthError("Missing Authorization bearer token.");
  return verifyStudentToken(token);
}

async function hmac(input: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(STUDENT_TOKEN_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(input));
  return base64url(String.fromCharCode(...new Uint8Array(sig)));
}

function base64url(input: string): string {
  return btoa(input).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const FUNCTIONS_BASE = import.meta.env.VITE_SUPABASE_FUNCTIONS_URL as string;
const TOKEN_KEY = "zimstudent_portal_token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

async function post<T>(path: string, body: unknown, authed = false): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (authed) {
    const token = getToken();
    if (!token) throw new Error("Not logged in.");
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${FUNCTIONS_BASE}/${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error ?? `Request to ${path} failed (${res.status})`);
  return json as T;
}

export function sendOtp(phone: string) {
  return post<{ message: string }>("send-otp", { phone });
}

export function verifyOtp(phone: string, code: string) {
  return post<{ token: string; student_id: string }>("verify-otp", { phone, code });
}

export interface MeResponse {
  profile: {
    full_name: string;
    student_id: string;
    university: string | null;
    program: string | null;
    degree_level: string | null;
    current_gpa: number | null;
    status: string;
  };
  documents: {
    document_id: string;
    doc_type: string;
    status: string;
    ai_summary: string | null;
    submitted_at: string;
    expiry_date: string | null;
  }[];
  stipend_history: { term: string; human_decision: string; decided_at: string | null }[];
  action_needed: { event_type: string; description: string; detected_at: string }[];
}

export function getMe() {
  return post<MeResponse>("student-me", {}, true);
}

export function submitDocument(fileBase64: string, mediaType: string) {
  return post<{ document: MeResponse["documents"][number] }>(
    "student-submit-document",
    { file_base64: fileBase64, media_type: mediaType },
    true,
  );
}

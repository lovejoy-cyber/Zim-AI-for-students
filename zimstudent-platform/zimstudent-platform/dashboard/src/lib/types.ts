export type StudentStatus = "active" | "graduated" | "withdrawn" | "suspended" | "unreachable";
export type RiskLevel = "none" | "low" | "medium" | "high" | "critical";
export type DocType =
  | "transcript"
  | "attestation_inscription"
  | "bank_statement"
  | "id_card"
  | "passport"
  | "medical"
  | "insurance"
  | "residence_permit"
  | "other";
export type DocStatus = "received" | "processing" | "processed" | "needs_review" | "rejected";
export type DecisionValue = "approve" | "conditional" | "reject" | "pending";
export type WelfareEventType =
  | "silence_alert"
  | "document_expiry"
  | "academic_risk"
  | "health_flag"
  | "housing_issue"
  | "manual_note";
export type Severity = "info" | "low" | "medium" | "high" | "critical";
export type StaffRole = "admin" | "officer" | "read_only";

export interface StudentProfile {
  student_id: string;
  full_name: string;
  date_of_birth: string | null;
  phone_whatsapp: string | null;
  email: string | null;
  sponsorship_type: string | null;
  university: string | null;
  program: string | null;
  degree_level: string | null;
  enrollment_year: number | null;
  expected_graduation: string | null;
  current_gpa: number | null;
  grading_scale_note: string | null;
  residence_city: string | null;
  status: StudentStatus;
  risk_level: RiskLevel;
  assigned_officer_id: string | null;
  last_contact_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface DocumentRecord {
  document_id: string;
  student_id: string;
  source_channel: string;
  raw_file_path: string;
  doc_type: DocType;
  language_detected: string | null;
  ocr_confidence: number | null;
  extracted_fields: Record<string, unknown> | null;
  ai_summary: string | null;
  anomaly_flags: string[];
  status: DocStatus;
  expiry_date: string | null;
  submitted_at: string;
  processed_at: string | null;
}

export interface StipendEvidence {
  claim: string;
  source_document_id: string;
  excerpt_summary: string;
}

export interface StipendDecision {
  decision_id: string;
  student_id: string;
  term: string;
  ai_recommendation: "approve" | "conditional" | "reject" | null;
  ai_confidence: number | null;
  ai_evidence: StipendEvidence[] | null;
  ai_reasoning_summary: string | null;
  human_decision: DecisionValue;
  human_officer_id: string | null;
  human_comment: string | null;
  override_flag: boolean;
  stipend_amount: number | null;
  disbursement_status: string;
  created_at: string;
  decided_at: string | null;
  // joined at query time
  student?: Pick<StudentProfile, "full_name" | "program" | "degree_level">;
}

export interface WelfareEvent {
  event_id: string;
  student_id: string;
  event_type: WelfareEventType;
  severity: Severity;
  description: string;
  detected_by: "system" | "staff";
  detected_at: string;
  resolved: boolean;
  resolution_note: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  student?: Pick<StudentProfile, "full_name">;
}

export interface AuditLogEntry {
  log_id: string;
  entity_type: string;
  entity_id: string;
  action: string;
  actor: string;
  before_state_hash: string | null;
  after_state_hash: string | null;
  prev_hash: string;
  entry_hash: string;
  created_at: string;
}

export interface StaffUser {
  staff_id: string;
  auth_user_id: string | null;
  name: string;
  email: string;
  role: StaffRole;
  active: boolean;
}

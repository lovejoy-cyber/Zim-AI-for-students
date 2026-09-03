-- ============================================================================
-- ZimStudent AI Command Platform — Initial Schema
-- Target: Supabase (Postgres)
-- ============================================================================

create extension if not exists pgcrypto;

-- ============================================================================
-- STAFF USERS
-- ============================================================================
create table staff_users (
  staff_id uuid primary key default gen_random_uuid(),
  auth_user_id uuid references auth.users(id) on delete set null,
  name text not null,
  email text unique not null,
  role text not null check (role in ('admin', 'officer', 'read_only')),
  active boolean not null default true,
  last_login timestamptz,
  created_at timestamptz not null default now()
);

-- ============================================================================
-- STUDENT PROFILES (the "Digital Twin")
-- ============================================================================
create table student_profiles (
  student_id text primary key,                    -- e.g. 'ZW-DZ-2026-00147'
  full_name text not null,
  date_of_birth date,
  national_id_zw text,                             -- consider Supabase Vault / column encryption in production
  passport_number text,
  phone_whatsapp text unique,
  email text,
  sponsorship_type text check (sponsorship_type in ('government_scholarship','self_sponsored','other')),
  university text,
  program text,
  degree_level text check (degree_level in ('L1','L2','L3','Master','PhD')),
  enrollment_year int,
  expected_graduation date,
  current_gpa numeric(4,2),
  grading_scale_note text,
  residence_city text,
  residence_address text,
  status text not null default 'active' check (status in ('active','graduated','withdrawn','suspended','unreachable')),
  risk_level text not null default 'none' check (risk_level in ('none','low','medium','high','critical')),
  assigned_officer_id uuid references staff_users(staff_id),
  last_contact_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_student_profiles_status on student_profiles(status);
create index idx_student_profiles_risk on student_profiles(risk_level);

-- ============================================================================
-- DOCUMENT RECORDS
-- ============================================================================
create table document_records (
  document_id uuid primary key default gen_random_uuid(),
  student_id text not null references student_profiles(student_id) on delete cascade,
  source_channel text not null check (source_channel in ('whatsapp','portal','email','browser_extension')),
  raw_file_path text not null,   -- path inside the 'documents' Storage bucket
  doc_type text check (doc_type in ('transcript','attestation_inscription','bank_statement','id_card','passport','medical','insurance','residence_permit','other')),
  language_detected text,
  ocr_confidence numeric(3,2),
  extracted_fields jsonb,
  ai_summary text,
  anomaly_flags text[] not null default '{}',
  status text not null default 'received' check (status in ('received','processing','processed','needs_review','rejected')),
  expiry_date date,
  submitted_at timestamptz not null default now(),
  processed_at timestamptz
);

create index idx_documents_student on document_records(student_id);
create index idx_documents_status on document_records(status);
create index idx_documents_expiry on document_records(expiry_date);

-- ============================================================================
-- STIPEND CRITERIA (configurable per term, so the agent isn't hardcoded)
-- ============================================================================
create table stipend_criteria (
  term text primary key,
  min_gpa numeric(4,2) not null default 10.00,
  required_doc_types text[] not null default array['transcript','attestation_inscription'],
  notes text
);

-- ============================================================================
-- STIPEND DECISIONS
-- ============================================================================
create table stipend_decisions (
  decision_id uuid primary key default gen_random_uuid(),
  student_id text not null references student_profiles(student_id) on delete cascade,
  term text not null,
  ai_recommendation text check (ai_recommendation in ('approve','conditional','reject')),
  ai_confidence numeric(3,2),
  ai_evidence jsonb,
  ai_reasoning_summary text,
  human_decision text not null default 'pending' check (human_decision in ('approve','conditional','reject','pending')),
  human_officer_id uuid references staff_users(staff_id),
  human_comment text,
  override_flag boolean not null default false,
  stipend_amount numeric(10,2),
  disbursement_status text default 'pending' check (disbursement_status in ('pending','sent','confirmed')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  unique (student_id, term)
);

create index idx_stipend_student on stipend_decisions(student_id);
create index idx_stipend_status on stipend_decisions(human_decision);

-- ============================================================================
-- WELFARE EVENTS
-- ============================================================================
create table welfare_events (
  event_id uuid primary key default gen_random_uuid(),
  student_id text not null references student_profiles(student_id) on delete cascade,
  event_type text not null check (event_type in ('silence_alert','document_expiry','academic_risk','health_flag','housing_issue','manual_note')),
  severity text not null check (severity in ('info','low','medium','high','critical')),
  description text not null,
  detected_by text not null check (detected_by in ('system','staff')),
  detected_at timestamptz not null default now(),
  resolved boolean not null default false,
  resolution_note text,
  resolved_at timestamptz,
  resolved_by uuid references staff_users(staff_id)
);

create index idx_welfare_student on welfare_events(student_id);
create index idx_welfare_resolved on welfare_events(resolved);
create index idx_welfare_severity on welfare_events(severity);

-- ============================================================================
-- AUDIT LOG — append-only, hash-chained
-- Hash chaining is computed in application code (see _shared/audit.ts) using
-- Web Crypto (SHA-256), so it works identically whether the function runs
-- locally or deployed. This table only ever accepts INSERTs.
-- ============================================================================
create table audit_log (
  log_id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id text not null,
  action text not null,
  actor text not null,
  before_state_hash text,
  after_state_hash text,
  prev_hash text not null,
  entry_hash text not null,
  created_at timestamptz not null default now()
);

create index idx_audit_entity on audit_log(entity_type, entity_id);
create index idx_audit_created on audit_log(created_at);

-- Hard guardrail: nobody (not even authenticated staff) can UPDATE or DELETE
-- audit rows. Only INSERT is possible, and only Edge Functions (service_role)
-- perform inserts in practice.
revoke update, delete on audit_log from authenticated, anon;

-- ============================================================================
-- ROW LEVEL SECURITY
-- Edge Functions use the service_role key and bypass RLS entirely (by design
-- — students never touch the database directly, only through functions).
-- RLS below protects the staff-facing web dashboard, which connects as an
-- authenticated Supabase user.
-- ============================================================================
alter table student_profiles enable row level security;
alter table document_records enable row level security;
alter table stipend_decisions enable row level security;
alter table welfare_events enable row level security;
alter table audit_log enable row level security;
alter table staff_users enable row level security;

create or replace function current_staff_role() returns text
language sql stable as $$
  select role from staff_users where auth_user_id = auth.uid() and active = true limit 1;
$$;

create policy "staff read student_profiles" on student_profiles
  for select using (current_staff_role() is not null);
create policy "staff write student_profiles" on student_profiles
  for all using (current_staff_role() in ('admin','officer'))
  with check (current_staff_role() in ('admin','officer'));

create policy "staff read document_records" on document_records
  for select using (current_staff_role() is not null);
create policy "staff write document_records" on document_records
  for all using (current_staff_role() in ('admin','officer'))
  with check (current_staff_role() in ('admin','officer'));

create policy "staff read stipend_decisions" on stipend_decisions
  for select using (current_staff_role() is not null);
create policy "staff write stipend_decisions" on stipend_decisions
  for all using (current_staff_role() in ('admin','officer'))
  with check (current_staff_role() in ('admin','officer'));

create policy "staff read welfare_events" on welfare_events
  for select using (current_staff_role() is not null);
create policy "staff write welfare_events" on welfare_events
  for all using (current_staff_role() in ('admin','officer'))
  with check (current_staff_role() in ('admin','officer'));

create policy "staff read audit_log" on audit_log
  for select using (current_staff_role() is not null);
create policy "inserts allowed on audit_log" on audit_log
  for insert with check (true);

create policy "admin manages staff_users" on staff_users
  for all using (current_staff_role() = 'admin')
  with check (current_staff_role() = 'admin');
create policy "staff reads own record" on staff_users
  for select using (auth_user_id = auth.uid());

-- ============================================================================
-- SEED: default stipend criteria for a starter term (edit as needed)
-- ============================================================================
insert into stipend_criteria (term, min_gpa, required_doc_types, notes)
values ('2026-S1', 10.00, array['transcript','attestation_inscription'], 'Default MVP criteria — adjust per Ministry guidance.');

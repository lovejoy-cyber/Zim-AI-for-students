-- ============================================================================
-- Student portal login — WhatsApp-delivered OTP codes
-- Students don't get Supabase Auth accounts (they're identified by phone
-- number in student_profiles); instead they log into the portal with a
-- short-lived code sent to the same WhatsApp number they already use.
-- Only Edge Functions (service_role) ever touch this table.
-- ============================================================================

create table student_otp_codes (
  id uuid primary key default gen_random_uuid(),
  phone text not null,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts int not null default 0,
  consumed boolean not null default false,
  created_at timestamptz not null default now()
);

create index idx_otp_phone on student_otp_codes(phone);
create index idx_otp_expires on student_otp_codes(expires_at);

alter table student_otp_codes enable row level security;
-- No policies -> only service_role (which bypasses RLS) can touch this table.
-- Students and staff alike have zero direct access, by design.

-- Custom ENUM types
CREATE TYPE staff_role AS ENUM ('admin', 'reviewer', 'auditor');
CREATE TYPE document_status AS ENUM ('pending', 'extracted', 'failed', 'flagged');
CREATE TYPE decision_type AS ENUM ('approved', 'rejected', 'more_info_required');
CREATE TYPE welfare_status AS ENUM ('open', 'resolved', 'escalated');

-- 1. STAFF USERS TABLE
CREATE TABLE public.staff_users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL UNIQUE,
    role staff_role NOT NULL DEFAULT 'reviewer',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. STUDENT PROFILES TABLE
CREATE TABLE public.student_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone_number TEXT NOT NULL UNIQUE,
    full_name TEXT,
    gpa NUMERIC(3, 2),
    last_active_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. DOCUMENT RECORDS TABLE
CREATE TABLE public.document_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES public.student_profiles(id) ON DELETE CASCADE,
    storage_path TEXT NOT NULL,
    status document_status NOT NULL DEFAULT 'pending',
    extracted_data JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. STIPEND DECISIONS TABLE
CREATE TABLE public.stipend_decisions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES public.student_profiles(id) ON DELETE CASCADE,
    document_id UUID REFERENCES public.document_records(id),
    ai_recommendation decision_type,
    ai_evidence TEXT,
    final_decision decision_type,
    staff_id UUID REFERENCES public.staff_users(id),
    decision_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. WELFARE EVENTS TABLE
CREATE TABLE public.welfare_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES public.student_profiles(id) ON DELETE CASCADE,
    risk_type TEXT NOT NULL,
    status welfare_status NOT NULL DEFAULT 'open',
    details JSONB,
    resolved_by UUID REFERENCES public.staff_users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. IMMUTABLE AUDIT LOG TABLE
CREATE TABLE public.audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    action TEXT NOT NULL,
    actor_id TEXT NOT NULL,
    payload JSONB,
    previous_hash TEXT,
    hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS Configuration
ALTER TABLE public.staff_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stipend_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.welfare_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- Staff Read Policies
CREATE POLICY "Staff read access on staff_users" ON public.staff_users FOR SELECT TO authenticated USING (true);
CREATE POLICY "Staff read access on student_profiles" ON public.student_profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Staff read access on document_records" ON public.document_records FOR SELECT TO authenticated USING (true);
CREATE POLICY "Staff read access on stipend_decisions" ON public.stipend_decisions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Staff read access on welfare_events" ON public.welfare_events FOR SELECT TO authenticated USING (true);
CREATE POLICY "Staff read access on audit_log" ON public.audit_log FOR SELECT TO authenticated USING (true);

-- Revoke mutation rights on audit log
REVOKE UPDATE, DELETE ON public.audit_log FROM public, anon, authenticated, service_role;
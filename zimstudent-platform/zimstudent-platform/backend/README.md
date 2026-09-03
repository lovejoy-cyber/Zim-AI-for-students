# ZimStudent AI Command Platform — Backend

A working implementation of the document-intake, stipend-evaluation, and
welfare-monitoring agents from the platform spec, built on **Supabase**
(Postgres + Storage + Edge Functions) instead of Firebase — chosen so the
audit log and stipend-decision data get real foreign keys, transactions,
and Row-Level Security rather than a document store, and so you're not
putting every project on the same vendor.

## Why Supabase over Firebase here specifically
- **Postgres, not Firestore** — the audit log's hash-chain and the
  `unique(student_id, term)` constraint on stipend decisions are natural
  relational-integrity guarantees that are awkward to enforce in Firestore.
- **Row-Level Security** built into the database itself, not just app-layer
  rules — a second line of defense if a staff dashboard bug ever tried to
  over-fetch.
- **Edge Functions run on Deno**, so calling the Anthropic API and the
  WhatsApp Graph API is just `fetch()` — no SDK lock-in.
- Still effectively "no server to manage" — same operational simplicity
  you got from Firebase on AZSA/DiasporaLink/the embassy PWA.

## Project layout
```
supabase/
  migrations/0001_init.sql        -- full schema, RLS policies, audit guardrails
  functions/
    _shared/
      cors.ts                     -- CORS headers
      claude.ts                   -- Anthropic API caller (JSON-mode)
      audit.ts                    -- hash-chained audit log writer
    document-ingest/index.ts      -- OCR/extraction agent
    stipend-evaluate/index.ts     -- stipend recommendation agent
    welfare-scan/index.ts         -- scheduled welfare-flagging agent
    whatsapp-webhook/index.ts     -- WhatsApp Business Cloud API entry point
    record-decision/index.ts      -- staff-authenticated: finalizes a stipend decision
    resolve-welfare-event/index.ts -- staff-authenticated: resolves a welfare flag
    generate-report/index.ts      -- staff-authenticated: drafts the executive report
.env.example                      -- all required environment variables
```

## 1. Create the Supabase project
```bash
npm install -g supabase
supabase login
supabase projects create zimstudent-ai --org-id <your-org-id>
supabase link --project-ref <your-project-ref>
```

## 2. Run the migrations
```bash
supabase db push
```
This creates every table in Section 4 of the spec, the append-only audit
log (UPDATE/DELETE revoked at the grant level), RLS policies keyed off a
`staff_users.role` lookup, and the `student_otp_codes` table used for
portal login.

## 3. Create the Storage bucket
In the Supabase dashboard: **Storage → New bucket → `documents`** (keep it
**private**, not public — files are served through signed URLs from your
staff dashboard, never directly).

## 4. Set secrets
```bash
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
supabase secrets set SUPABASE_URL=https://<ref>.supabase.co
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
supabase secrets set WHATSAPP_TOKEN=<whatsapp-token>
supabase secrets set WHATSAPP_PHONE_NUMBER_ID=<phone-number-id>
supabase secrets set WHATSAPP_VERIFY_TOKEN=<any-random-string-you-choose>
supabase secrets set SILENCE_THRESHOLD_DAYS=60
supabase secrets set STUDENT_TOKEN_SECRET=$(openssl rand -hex 32)
```

## 5. Deploy the functions
```bash
supabase functions deploy document-ingest
supabase functions deploy stipend-evaluate
supabase functions deploy welfare-scan
supabase functions deploy whatsapp-webhook
supabase functions deploy record-decision
supabase functions deploy resolve-welfare-event
supabase functions deploy generate-report
supabase functions deploy send-otp
supabase functions deploy verify-otp
supabase functions deploy student-me
supabase functions deploy student-submit-document
```
Copy the deployed `document-ingest` URL and set it as a secret so the
WhatsApp webhook can call it internally:
```bash
supabase secrets set DOCUMENT_INGEST_URL=https://<ref>.functions.supabase.co/document-ingest
```

## 6. Connect WhatsApp (Meta for Developers)
1. Create an app at developers.facebook.com → add the **WhatsApp** product.
2. Under **API Setup**, grab a permanent access token and your phone number ID.
3. Under **Configuration → Webhook**, set:
   - Callback URL: `https://<ref>.functions.supabase.co/whatsapp-webhook`
   - Verify token: the same string you set as `WHATSAPP_VERIFY_TOKEN`
   - Subscribe to the `messages` field.
4. Send a test WhatsApp message to your business number — you should get
   an auto-registration reply within a couple of seconds.

**Important:** the webhook's free-text replies only work within the 24-hour
customer-service window after a student messages first. Any message you
want to send *proactively* (expiry reminders, welfare check-ins — the
templates listed in Section 7.2 of the spec) must go through Meta's
message-template approval process first. That's a separate `send-template`
function you'll want to add once your templates are approved — happy to
build that next.

## 7. Schedule the welfare scan
Supabase doesn't run cron for you by default. Two easy options:
- **pg_cron** (Postgres extension, runs inside your DB):
  ```sql
  select cron.schedule(
    'daily-welfare-scan',
    '0 6 * * *', -- 6am daily
    $$
    select net.http_post(
      url := 'https://<ref>.functions.supabase.co/welfare-scan',
      headers := jsonb_build_object('Authorization', 'Bearer <service-role-key>')
    );
    $$
  );
  ```
- **External scheduler** (simplest for MVP): a free cron service like
  cron-job.org hitting the `welfare-scan` URL daily with the service-role
  key as a Bearer token.

## 8. Test the pipeline manually
```bash
# Create a test student directly (normally WhatsApp registration does this)
curl -X POST "https://<ref>.supabase.co/rest/v1/student_profiles" \
  -H "apikey: <service-role-key>" -H "Authorization: Bearer <service-role-key>" \
  -H "Content-Type: application/json" \
  -d '{"student_id":"ZW-DZ-2026-TEST01","full_name":"Test Student","program":"Aeronautical Engineering","degree_level":"L3","current_gpa":14.2}'

# Ingest a document (base64-encode a sample transcript image first)
curl -X POST "https://<ref>.functions.supabase.co/document-ingest" \
  -H "Authorization: Bearer <service-role-key>" -H "Content-Type: application/json" \
  -d "{\"student_id\":\"ZW-DZ-2026-TEST01\",\"file_base64\":\"$(base64 -w0 sample_transcript.jpg)\",\"media_type\":\"image/jpeg\",\"source_channel\":\"portal\"}"

# Run a stipend evaluation
curl -X POST "https://<ref>.functions.supabase.co/stipend-evaluate" \
  -H "Authorization: Bearer <service-role-key>" -H "Content-Type: application/json" \
  -d '{"student_id":"ZW-DZ-2026-TEST01","term":"2026-S1"}'

# Run a welfare scan
curl -X POST "https://<ref>.functions.supabase.co/welfare-scan" \
  -H "Authorization: Bearer <service-role-key>"
```

## Student portal login flow (OTP over WhatsApp)
Students don't get Supabase Auth accounts — they're identified purely by
`phone_whatsapp` on `student_profiles`. Login works like this:
1. Portal calls `POST /send-otp { phone }` → a 6-digit code is generated,
   hashed, stored with a 10-minute expiry, and sent as a WhatsApp text.
2. Portal calls `POST /verify-otp { phone, code }` → on success, returns a
   signed session token (HMAC-SHA256, 7-day expiry — see
   `_shared/studentAuth.ts`), not a Supabase Auth session.
3. The portal sends that token as `Authorization: Bearer <token>` to
   `student-me` and `student-submit-document`, which verify it themselves.

**Important limitation:** step 1 sends the code as a free-text WhatsApp
message, which Meta only delivers reliably within the 24-hour window after
the student's last inbound message. For students who haven't messaged
recently, the code may not arrive. The correct fix is registering an
**Authentication-category message template** with Meta (a purpose-built
template type for OTPs, typically approved faster than marketing
templates) and switching `send-otp` to use it — flagged here rather than
silently shipped as fully reliable.

## Verifying audit log integrity
Because each entry stores `prev_hash` and `entry_hash`, you can detect
tampering by recomputing the chain and comparing:
```sql
select log_id, entity_type, action, entry_hash, prev_hash
from audit_log
order by created_at asc;
```
A small verification script (recompute each `entry_hash` from
`prev_hash|entity_type|entity_id|action|actor|before_state_hash|after_state_hash`
using SHA-256 and compare) is a natural addition once you're ready — ask
and I'll add it as a scheduled integrity-check function.

## What's not built yet
- **WhatsApp template-based proactive messaging** (expiry reminders,
  welfare check-ins, and reliable OTP delivery — see the limitation above)
  — needs Meta template approval first; `record-decision` and `send-otp`
  currently send best-effort free-text instead.
- **Browser extension** (Phase 2 of the spec).
- **Audit-chain integrity verifier** as a callable function (the manual SQL
  version above works today; automating the hash recomputation is the
  natural next step).

The staff Command Centre React dashboard (`../dashboard`) and the student
portal (`../student-portal`) are both built and call these functions
directly.

# ZimStudent AI Command Platform

Two deployable pieces, built to work together:

```
backend/         Supabase project — database, storage, and 11 Edge Functions
                  (AI agents + staff-authenticated actions + student portal auth)
dashboard/        React + Tailwind staff Command Centre
student-portal/   React + Tailwind mobile-first student self-service portal
```

## Deploy order
1. **`backend/`** first — follow `backend/README.md` end to end: create the
   Supabase project, run both migrations, create the `documents` Storage
   bucket, set secrets (including `STUDENT_TOKEN_SECRET`), deploy all 11
   functions, connect WhatsApp.
2. **`dashboard/`** — staff-facing. Follow `dashboard/README.md`: install,
   point its `.env` at the same Supabase project, create your first staff
   account, then `npm run dev` or deploy `dist/`.
3. **`student-portal/`** — student-facing. Follow `student-portal/README.md`:
   install, point its `.env` at your deployed functions URL, deploy `dist/`
   separately (different domain/subdomain than the staff dashboard).

## What you get end-to-end
- A student messages your WhatsApp Business number → gets auto-registered
  → sends a photo of a transcript → Claude reads it, classifies it,
  extracts GPA/program/dates, flags anomalies → student gets an instant
  WhatsApp confirmation.
- An officer opens the Command Centre's **Decision Queue**, sees Claude's
  Approve/Conditional/Reject recommendation with cited evidence, and
  approves or overrides it (a comment is required on override) — this is
  the only way a decision becomes final, and it's always logged.
- A **welfare scan** runs on a schedule, flags silence/expiry/academic-risk
  patterns, and staff resolve them from the **Welfare Board**, which
  recomputes the student's risk level automatically.
- An officer generates a **Report** for the Ambassador — Claude drafts the
  narrative around numbers pulled straight from the database, never
  invented ones.
- Every AI recommendation and every human decision is written to a
  **hash-chained audit log**, visible per-student as a timeline in the
  Student Profile page.
- A student can also log into the **student portal** on the web: a WhatsApp-
  delivered login code, then a simple mobile page showing their stipend
  status and letting them submit documents without opening WhatsApp.

## Honest status
This was written carefully but not executed — the sandbox this was built
in has no network access, so `npm install`, `supabase db push`, and
`supabase functions deploy` have not actually been run against a live
project. Walk through both READMEs' setup steps in order, and use the
`curl` examples in `backend/README.md` to sanity-check each function
before pointing real student data at it.

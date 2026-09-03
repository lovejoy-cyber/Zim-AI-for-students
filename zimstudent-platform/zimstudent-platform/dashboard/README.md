# ZimStudent AI — Command Centre (Staff Dashboard)

A React + TypeScript + Tailwind staff dashboard that talks directly to the
`zimstudent-backend` Supabase project — the Decision Queue, Student Register,
Welfare Board, and Reports screens from the platform spec (Section 11),
fully wired up, not mockups.

## Design notes
This is an internal case-management tool, not a marketing site, so the
visual language leans into "diplomatic ledger" rather than typical SaaS:
- **Ink navy** sidebar (`#12172A`) + **warm paper** canvas (`#F7F6F2`) —
  calm, high-contrast for long reading sessions.
- **Muted gold** (`#C89B3C`) as the one accent, used sparingly (active nav,
  eyebrow labels) — a nod to an official seal, not the literal flag yellow.
- Decision/risk/severity badges use a squared "seal" shape
  (`.seal-badge` in `index.css`) and the audit log tab renders as a
  hash-linked timeline — both deliberately echo the hash-chained audit
  model running underneath, so the UI hints at the guarantee it's making.
- Serif (`Source Serif 4`) for headings only; `Inter` for all dense UI/data;
  `IBM Plex Mono` for IDs, GPAs, and hashes — keeps the record-keeping feel
  without sacrificing table legibility.

## Prerequisites
- The `zimstudent-backend` project already deployed (migration run, Edge
  Functions deployed) — see its own README.
- Node.js 18+.

## 1. Install
```bash
npm install
```

## 2. Configure environment
```bash
cp .env.example .env
# fill in VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY (Project Settings -> API),
# and VITE_SUPABASE_FUNCTIONS_URL
```

## 3. Create your first staff account
Staff sign in with Supabase Auth (email/password), but access is gated by a
matching row in `staff_users` with `auth_user_id` pointing at that login.

```sql
-- 1. Create the auth user first via the Supabase dashboard
--    (Authentication -> Users -> Add user), or supabase.auth.admin.createUser.
-- 2. Then link it:
insert into staff_users (auth_user_id, name, email, role)
values ('<the-auth-user-uuid>', 'Your Name', 'you@embassy.gov.zw', 'admin');
```
Without this row, a person can log in but the dashboard shows "No staff
record is linked to this account" instead of any data — this is
intentional (see `RequireStaff` in `src/lib/auth.tsx`).

## 4. Run locally
```bash
npm run dev
```

## 5. Build & deploy
```bash
npm run build
```
Deploy the `dist/` folder to Cloudflare Pages (matches your DiasporaLink
setup) or any static host. Set the same three `VITE_*` variables as build
environment variables on the host.

## What each page does
| Page | Route | Talks to |
|---|---|---|
| Overview | `/` | Direct Supabase queries (RLS-scoped) |
| Decision Queue | `/decisions` | Reads via Supabase; writes via `record-decision` Edge Function |
| Student Register | `/students` | Direct Supabase queries |
| Student Profile | `/students/:id` | Direct Supabase queries (documents, stipend history, welfare, audit trail) |
| Welfare Board | `/welfare` | Reads via Supabase; resolves via `resolve-welfare-event` Edge Function |
| Reports | `/reports` | Calls `generate-report` Edge Function |

Direct reads use the signed-in user's session, so Postgres RLS (defined in
the backend migration) is the real gatekeeper — a `read_only` account can
browse everything here but the two write actions (deciding a case,
resolving a welfare event) are blocked server-side in the Edge Functions,
not just hidden in the UI.

## Not built yet
- Student-facing web portal (Section 8.1 of the spec) — this dashboard is
  staff-only.
- Admin settings screen for managing `staff_users` / `stipend_criteria` —
  for now, manage those directly in the Supabase table editor or via SQL.
- Browser extension (Phase 2).

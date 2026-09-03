# ZimStudent — Student Portal

A mobile-first web app for students: log in with a WhatsApp-delivered code,
check stipend status, and submit documents without needing to message the
WhatsApp number directly (useful when a student wants to submit from a
laptop, or attach a file already saved on their device).

This app never touches Supabase directly and holds no database credentials
— it only calls four backend Edge Functions (`send-otp`, `verify-otp`,
`student-me`, `student-submit-document`), each of which enforces that a
student can only ever act as themselves.

## Prerequisites
- `../backend` deployed, including the `send-otp` / `verify-otp` /
  `student-me` / `student-submit-document` functions and the
  `student_otp_codes` migration.
- The student must already exist in `student_profiles` (i.e. they've
  messaged the WhatsApp number at least once — that's what creates their
  record) before they can log into the portal.

## Setup
```bash
npm install
cp .env.example .env
# set VITE_SUPABASE_FUNCTIONS_URL to your deployed functions URL
npm run dev
```

## Build & deploy
```bash
npm run build
```
Deploy `dist/` to Cloudflare Pages or any static host, same as the staff
dashboard, and set `VITE_SUPABASE_FUNCTIONS_URL` as a build environment
variable there.

## Known limitation (read before relying on this for real students)
Login codes are sent as a free-text WhatsApp message, which Meta only
delivers reliably within 24 hours of the student's last inbound message.
A student who hasn't messaged the embassy WhatsApp number recently may not
receive their code. The real fix is an Authentication-category WhatsApp
message template (see `../backend/README.md`) — flagged clearly rather
than silently assumed to always work.

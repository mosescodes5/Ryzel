# Relay — monorepo, ready for Vercel

Everything in one place: Next.js frontend (`ryzel-site/`) + FastAPI backend
(`ryzel-api/`), wired together with `vercel.json` at this root via
Vercel's Services feature — one Vercel project, one domain, one deploy.

## Quick start

```bash
cd ryzel-site && npm install
cd ../ryzel-api && pip install -r requirements.txt --break-system-packages
```

Then fill in real values (see below) before running anything.

## Before it actually works

1. **Supabase**: create a project, run `ryzel-api/supabase_schema.sql` in
   the SQL editor, grab your URL / anon key / JWT secret / pooled DB
   connection string from Project Settings.
2. **Env files**: `cp .env.example .env` in `ryzel-api/`, `cp .env.example
   .env.local` in `ryzel-site/` — fill in the real Supabase values in both.
3. **Run it**: two terminals — `python -m uvicorn app.main:app --port 8811`
   in `ryzel-api/`, `npm run dev` in `ryzel-site/`. Visit `localhost:3000`.

Full walkthrough (Supabase dashboard steps + VS Code steps in order) is in
the conversation this came from — `VERCEL_DEPLOY.md` here covers the Vercel
side specifically: folder layout, what `vercel.json` does, which env vars go
where.

## Deploying

Push this whole folder to a GitHub repo, import it in Vercel, set the env
vars from both `.env` files in Vercel's Project Settings (one place, even
though they serve two services), deploy. Details in `VERCEL_DEPLOY.md`.

## What's real vs what needs your input

Everything here was tested — backend auth/wallet/order flow via `TestClient`
with a hand-crafted Supabase-shaped JWT (including forged-token rejection and
cross-user isolation checks), frontend build+lint clean, `npm install`
confirmed working from this exact folder structure. What's still on you:
real Supabase project, real Korapay keys, a real SMS provider (currently
`PROVIDER=mock`), and an actual `vercel deploy` to confirm the Services
routing end-to-end — that part I couldn't test without Vercel account access.

# Deploying Inboxora (Neon Postgres + Vercel)

Inboxora runs locally on SQLite. Production uses Neon Postgres.
Prisma does not allow the datasource `provider` to come from an
environment variable, so the switch is one manual line change,
documented here. Nothing in this file has been run yet — it is the
checklist for the first deploy.

## What you need first

- A GitHub repo containing this `app/` folder.
- A Neon project (free tier is fine) and its Postgres connection string.
- A Vercel project connected to the repo.
- Env vars set in Vercel (names below; values only in Vercel, never in git).

## Step 1 — Switch Prisma to Postgres

In `prisma/schema.prisma`, change the datasource block:

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

The schema was written to work on both databases (statuses are
plain strings, no scalar lists or Json columns), so nothing else
changes. Optional, for Neon: add `directUrl = env("DIRECT_URL")`
under `url` and set `DIRECT_URL` to Neon's direct (non-pooler)
connection string — `prisma db push` prefers a direct connection.

Local development keeps working either way: with the provider set
to `postgresql`, local dev needs a Postgres `DATABASE_URL`; to go
back to SQLite locally, flip the line back. Do not commit the flip
until you are ready to deploy.

## Step 2 — Create the database tables

There is no migration history yet (the app was built with
`prisma db push` on SQLite), so for a fresh Neon database the
honest path is `db push`, not `migrate deploy`:

```bash
DATABASE_URL="<neon connection string>" npx prisma db push
```

Once the schema stabilises, switch to real migrations
(`prisma migrate dev` locally, `prisma migrate deploy` in CI/Vercel)
and drop `db push`.

## Step 3 — Seed the demo account (once)

```bash
DATABASE_URL="<neon connection string>" npx prisma db seed
```

This creates the demo login (`demo@example.com` /
`demo-password-123`) with simulated chats. The landing page's
"Try the demo" button signs in with this account, so the demo
does not work until the seed has run.

## Step 4 — Vercel settings

Environment variables (Production):

| Name | Notes |
| --- | --- |
| `DATABASE_URL` | Neon connection string |
| `DIRECT_URL` | Optional, only if you added `directUrl` in Step 1 |
| `AUTH_SECRET` | Long random string, e.g. `openssl rand -hex 32`. Also keys the encryption of stored WhatsApp tokens — rotating it means saved tokens must be re-entered |
| `APP_URL` | The public Vercel URL, e.g. `https://inboxora.vercel.app` |
| `LLM_PROVIDER` | Optional: `groq` (default), `mistral`, `openrouter`, `pollinations` |
| `LLM_API_KEY` | Optional: free no-card key (Groq recommended). Without it the app runs in clearly labelled demo AI mode |
| `LLM_MODEL` | Optional model override; required for OpenRouter |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Optional: without them, password-reset and invite links are printed to the server log instead of emailed |

Build Command override (Settings → Build & Development):

```
npm run build:vercel
```

That script runs `prisma generate`, then `prisma db push` with
one retry after 30 seconds (Neon cold starts and advisory-lock
timeouts are the usual first-deploy failure), then `next build`.
`DATABASE_URL` must be set before the first build, because the
push runs at build time.

## Step 5 — Verify

1. Open `/api/health` — expect `{"database":"up","status":"ok"}`.
2. Open the landing page and click "Try the demo" — expect the
   seeded inbox with demo chats.
3. Open a chat, click "Draft with AI" — in demo AI mode the draft
   quotes the FAQ entry and shows its source.

## What is NOT part of this deploy

- Live WhatsApp sending. That needs Meta business verification
  (business documents, a website, a number not already on the
  WhatsApp app) and is switched on separately. The Connect
  WhatsApp screen only stores the credentials, encrypted.
- Real billing. Pricing in the app is demo pricing.
- `.env` and `prisma/dev.db` must never be uploaded — `.gitignore`
  already excludes them, plus `node_modules/` and `.next/`.

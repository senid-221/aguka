# Extension modules

Additive modules layered on the WhatsApp agent core. Each is reachable through a route or the admin
console; none of them replace the original pipeline.

## Security, admin and retention

- `lib/security/rate-limiter.ts` — per-user sliding-window limiter plus a daily token budget, read
  from `MAX_MESSAGES_PER_MINUTE_PER_USER` and `MAX_DAILY_AI_TOKENS_PER_USER`. **Still not called from
  the webhook**: to enable it, invoke `usageLimiter.check(user.id)` before `executeAgent` and
  `usageLimiter.recordTokens(...)` after.
- `lib/security/admin-auth.ts` + `POST /api/admin/login` — HS256 admin bearer tokens, required by
  every `/api/admin/*` route. `ADMIN_JWT_SECRET` has no default, so login stays disabled until it is set.
- `lib/maintenance/retention.ts` + `POST /api/admin/maintenance` — 30-day media retention sweep and
  queue drain.
- `scripts/run-extension-tests.ts` — run with `npx tsx scripts/run-extension-tests.ts`.

## Commercial layer and Road Safety Academy

- `lib/db/store.ts` — atomic, versioned JSON snapshot plus a private proofs directory under
  `AGUKA_DATA_DIR`, so users, entitlements, trial grants, orders, receipts, curriculum and audit
  entries survive a restart.
- `lib/db/prisma-readiness.ts` — reports whether Prisma is installed and migrations applied, which is
  what `/api/ready` publishes instead of claiming a database connection.
- `lib/services/catalog.ts` — the service definitions behind the WhatsApp menu: code, bilingual name,
  agent, visibility, price, billing period, trial hours and usage caps. Seeded only into an empty table.
- `lib/services/selection.ts` + `lib/whatsapp/inbound.ts` — first-message menu, keyword/number/name
  matching, the remembered pick, and the payment and status commands.
- `lib/services/entitlements.ts` — trial window from the recorded activation time, one trial per
  person, usage caps, and the bilingual reply that states the price before anything else.
- `lib/payments/orders.ts`, `adapters.ts`, `image-forensics.ts` — idempotent orders with unique
  references, receipt storage outside the web root with duplicate detection, optional OCR, provider
  reconciliation, and the `PAYMENT_WEBHOOK_SECRET` HMAC gate.
- `lib/road-safety/content-pack.ts`, `academy.ts`, `whatsapp-flow.ts` — cited bilingual curriculum,
  server-side exam scoring with per-question corrections and explanations, progress tracking, and the
  lesson/sign/practice/exam commands.
- `app/api/services`, `app/api/road-safety/*`, `app/api/payments/*`, `app/api/admin/{services,
  road-safety,payments,entitlements,audit}` — the routes for the above.
- `components/screens/{services-pricing,road-safety-admin,payments-review,access-audit}-screen.tsx` +
  `components/layout/admin-gate.tsx` + `lib/client/admin-session.ts` — the admin surfaces, with the
  bearer token kept in `sessionStorage` only.
- `prisma/migrations/20261021000000_commercial_and_road_safety/` — the PostgreSQL tables for the same
  domain. Prisma itself is not a dependency yet, so this SQL is not applied by the running build.

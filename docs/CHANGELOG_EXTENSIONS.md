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

## Background queue on Redis

- `lib/queue/redis-connection.ts` — resolves the BullMQ endpoint from `REDIS_URL` (`redis://` or
  `rediss://`) or the `UPSTASH_REDIS_TCP_*` fields. It rejects the value shipped in `.env.example`,
  rejects an Upstash REST (`https://`) URL, percent-decodes credentials, and only ever hands out a
  credential-free `host:port (tls)` label for logs and the dashboard.
- `lib/queue/jobs.ts` — the job handlers both engines share: a Mifotra crawl, the media retention
  sweep, and job alerts, which reports that no `JOB_ALERTS` opt-in store exists instead of returning a
  made-up recipient count. An unknown job name completes with `NO_HANDLER` and count 0.
- `lib/queue/redis-queue.ts` — one `IQueueService` over two engines. BullMQ owns jobs, attempts,
  exponential backoff and completion retention when an endpoint resolves; otherwise the same handlers
  run in this process. Every job is mirrored into the durable store, and a Redis enqueue that fails is
  marked `REDIS_ENQUEUE_FAILED` rather than executed somewhere else. `QUEUE_INLINE_WORKER`,
  `QUEUE_NAME`, `QUEUE_CONCURRENCY` and `QUEUE_SKIP_VERSION_CHECK` control the engine.
- `scripts/worker.ts` + `npm run worker` — the standalone BullMQ worker with bounded SIGTERM shutdown,
  for an always-on host instead of a serverless function.
- Removed `lib/queue/worker.ts`, whose canned "processed" counts (142 alerts, 18 media tasks) were the
  last simulated numbers in the queue path.

## Image requests and provider errors

- `lib/ai/bilingual-router.ts` — `requestsImageProduction()` recognises wording that asks for a photo
  to be created, retouched, background-stripped, resized or cropped, and `executeAgent` answers it with
  a bilingual refusal **before** the entitlement gate and **before** any model call. The refusal
  consumes no trial use, records `IMAGE_PRODUCTION_UNAVAILABLE` with `modelUsed: capability-gate`, and
  does not depend on the selected service, because no agent in this build produces an image file.
- The same file stopped appending the provider's raw error to the WhatsApp reply. A wrong
  `GEMINI_MODEL`, a key whose project cannot reach it, or a quota rejection used to be texted to the
  person as `… (404 NOT_FOUND: Model "…" not found)`; the reply now stays the honest
  "could not reach the AI provider" notice while the real reason is logged as `AI_GENERATION_FAILED`
  with the model, agent and conversation.
- `lib/services/catalog.ts` — the `PHOTO_EDITING` service is listed in the WhatsApp menu as *Photo
  Standards Guidance / Amabwiriza y'ifoto* instead of *Photo Editing*, which promised work the service
  does not do. Its code is unchanged so existing selections and orders keep resolving.
- Test `test-image-production-refusal` runs both a Kinyarwanda and an English edit request through the
  live inbound pipeline and asserts the refusal, the language, the absence of provider error text, and
  that a standards question is *not* refused.

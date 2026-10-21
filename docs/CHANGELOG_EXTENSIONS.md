# Additive extensions (no existing files modified)

- `lib/security/rate-limiter.ts` — per-user sliding-window limiter + daily token budget (uses existing env limits). Not yet called from the webhook; to enable, call `usageLimiter.check(user.id)` before `executeAgent` and `usageLimiter.recordTokens(...)` after.
- `lib/security/admin-auth.ts` + `POST /api/admin/login` — HS256 admin tokens.
- `lib/maintenance/retention.ts` + `POST /api/admin/maintenance` (Bearer token) — 30-day media retention sweep and queue drain.
- `scripts/run-extension-tests.ts` — run with `npx tsx scripts/run-extension-tests.ts`.

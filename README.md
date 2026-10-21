# Aguka AI

**Bilingual (Kinyarwanda & English) WhatsApp AI agent platform for Rwanda.**

Aguka AI connects to the WhatsApp Business Cloud API and routes each incoming message to a
specialised agent: job discovery, career and CV support, a coding assistant, an image studio, a
study tutor, and an employment marketplace. An admin console provides live monitoring, a webhook
simulator, consent management, and an automated test suite.

---

## Modules

| Module | What it does |
| --- | --- |
| **Jobs Discovery** | Verified listings from MIFOTRA e-recruitment, Job in Rwanda and remote tech sources, normalised into one shape. No generated listings. |
| **Career Assistant** | Bilingual CV building, cover letters and interview coaching; applications require explicit user consent. |
| **Coding Agent** | Scaffolded microservices, debugging and architecture maps produced in an isolated prompt context, without shell access. |
| **Passport & Photo Studio** | Biometric 35×45 mm passport checks and CV portrait work, with a 30-day media retention sweep. |
| **Study Tutor** | STEM and language explanations in Kinyarwanda or English, plus quizzes. |
| **Employment Marketplace** | Rwandan worker profiles, vacancies and explainable match scores. |
| **Users & Consent** | DPPA consent records and per-user data controls. |

## Architecture

```
WhatsApp user → Meta Cloud API webhook → Next.js route handler
    → signature check + event deduplication
    → bilingual router (language detection → agent selection)
    → Gemini provider adapter
    → reply via Meta Cloud API (or simulated store)
```

- **Ingress & validation** — `app/api/whatsapp/webhook/route.ts` verifies the Meta `X-Hub-Signature-256`
  HMAC whenever `WHATSAPP_APP_SECRET` is set, and skips already-processed event IDs. Unsigned
  requests are only accepted while that secret is absent, so configure it before going live.
- **Routing** — `lib/ai/bilingual-router.ts` detects Kinyarwanda vs English and selects the agent.
- **Provider layer** — `lib/ai/provider-adapter.ts` calls Google Gemini through `@google/genai`;
  `lib/ai/prompt-security.ts` shields against prompt injection and redacts secrets from output.
- **Queue** — `lib/queue/redis-queue.ts` keeps jobs, retries and scheduled tasks in process memory.
  When `REDIS_URL` is set it reports a `Redis BullMQ` mode label, but no Redis client connects; a
  real deployment should replace this with an actual BullMQ worker.
- **Data** — `lib/db/repository.ts` is backed by `lib/db/mock-data.ts`, including webhook event
  deduplication via `isMessageAlreadyProcessed`. The normalised PostgreSQL models live in
  `prisma/schema.prisma` with initial migration SQL in `prisma/migrations/`.
- **Limits** — `lib/security/rate-limiter.ts` implements a per-user sliding window and a daily AI
  token budget, but the webhook does not call it yet: enforce it by invoking `usageLimiter.check()`
  before `executeAgent` and `usageLimiter.recordTokens()` after, as described in
  [`docs/CHANGELOG_EXTENSIONS.md`](docs/CHANGELOG_EXTENSIONS.md). `lib/security/admin-auth.ts`
  issues HS256 tokens protecting `POST /api/admin/maintenance`.

> The repository has no runtime dependency on Postgres, Redis or S3 clients. It boots and completes
> end-to-end conversations with only a Gemini key — or with none, using the mock provider fallback.
> To persist to PostgreSQL, add `prisma` and `@prisma/client`, point `DATABASE_URL` at your
> database and apply `prisma/migrations/`.

## Requirements

Node.js 20 or newer.

## Quick start

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open http://localhost:3000 for the admin console. With no credentials configured, the gateway
reports simulated mode and the AI layer uses the mock fallback, so every screen is explorable.

## Configuration

All variables are documented in [`.env.example`](.env.example) and validated at startup by
`lib/config/index.ts`, which reports warnings rather than throwing when a service is absent.

| Variable | Purpose |
| --- | --- |
| `GEMINI_API_KEY` | Google Gemini key for live AI responses. |
| `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_APP_SECRET` | Meta Cloud API credentials; required for live send and webhook signature verification. |
| `WHATSAPP_VERIFY_TOKEN` | Must match the token entered in Meta's webhook configuration. |
| `DATABASE_URL`, `REDIS_URL` | Opt-in PostgreSQL and Redis backends. |
| `ADMIN_JWT_SECRET`, `ADMIN_DEFAULT_EMAIL`, `ADMIN_DEFAULT_PASSWORD` | Admin login used by `POST /api/admin/login`. |
| `MAX_MESSAGES_PER_MINUTE_PER_USER`, `MAX_DAILY_AI_TOKENS_PER_USER` | Rate and budget limits read by `UsageLimiter`; enforcement still needs wiring. |

Replace the placeholder secrets in `.env.example` before using them anywhere real, and never commit
`.env.local` — `.gitignore` already excludes `.env*`.

## WhatsApp setup

1. In [developers.facebook.com](https://developers.facebook.com), open your app and add the WhatsApp product.
2. Copy the phone number ID, app secret, and a permanent System User access token from Business Settings.
3. Set the callback URL to `https://<your-domain>/api/whatsapp/webhook` and use the same value for
   `WHATSAPP_VERIFY_TOKEN`.
4. Subscribe the webhook to the `messages` field.

For testing without Meta credentials, use the **Live WhatsApp Simulator** screen, which posts real
webhook payloads to the same endpoints.

## API routes

| Route | Method | Function |
| --- | --- | --- |
| `/api/whatsapp/webhook` | GET, POST | Meta subscription handshake and signed inbound messages. |
| `/api/whatsapp/simulate` | POST | Inject a test message through the full pipeline. |
| `/api/jobs`, `/api/marketplace`, `/api/study`, `/api/coding`, `/api/media`, `/api/users` | GET, POST | Console data feeds and module actions. |
| `/api/agents`, `/api/conversations` | GET | Agent registry and conversation history. |
| `/api/admin/login` | POST | Issue an admin bearer token. |
| `/api/admin/maintenance` | POST | Retention sweep and queue drain; requires a bearer token. |
| `/api/health`, `/api/ready`, `/api/tests` | GET | Liveness, readiness and the automated suite. |

## Tests

```bash
npm test
npx tsx scripts/run-extension-tests.ts
```

Coverage includes the webhook challenge, invalid-token rejection, HMAC signature verification,
event deduplication idempotency, Kinyarwanda/English detection, agent intent routing, prompt
injection resistance, secret redaction, and job match explainability. The same suite runs from the
**Run Test Suite** button in the console topbar.

## Database

`prisma/schema.prisma` defines 27 models spanning users, conversations and memory, jobs and
applications, marketplace profiles and matches, media and image tasks, coding projects, study
sessions and quizzes, agent runs and tool calls, webhook events, scheduled tasks, admin users,
audit logs and usage records.

## Build & deploy

```bash
npm run build
npm run start
```

A production container can start from `node:20-alpine`, run `npm ci --omit=dev`, build, expose port
3000 and launch `npm run start`. Health checks should probe `/api/health` and `/api/ready`.

## Further reading

- [Setup guide](docs/SETUP_GUIDE.md) — architecture detail, Meta and migration walkthroughs.
- [Extension changelog](docs/CHANGELOG_EXTENSIONS.md) — how the security, admin and retention modules attach.

---

Powered by IRAGUHA Vincent

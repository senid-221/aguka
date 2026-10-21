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
| **Jobs Discovery** | Registered boards (MIFOTRA e-recruitment, Job in Rwanda, a remote feed) and one normalised listing shape. No live crawler is wired yet, so the pool starts empty and grows only through `POST /api/jobs` with a real `sourceUrl`. Nothing is invented. |
| **Career Assistant** | Bilingual CV, cover letter and interview coaching text through the AI model; applications require explicit user consent. |
| **Coding Agent** | Scaffolds, debugging and architecture explanations returned as text by Gemini through `POST /api/coding`. There is no execution sandbox. |
| **Passport & Photo Studio** | Written guidance on the 35×45 mm Rwandan passport standard and CV portraits. Image editing does not run here; a 30-day retention sweep marks expired media records. |
| **Study Tutor** | STEM and language explanations in Kinyarwanda or English, plus generated quizzes through `POST /api/study`. |
| **Employment Marketplace** | Worker profiles, vacancies and match scores computed from stored skills, location and experience. |
| **Users & Consent** | DPPA consent records and per-user data controls. |

## Architecture

```
WhatsApp user → Meta Cloud API webhook → Next.js route handler
    → signature check + event deduplication
    → bilingual router (language detection → agent selection)
    → Gemini provider adapter
    → reply via Meta Cloud API, or a NOT_CONFIGURED result when credentials are absent
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
- **Data** — `lib/db/repository.ts` is an in-memory store that starts empty: no users, conversations,
  jobs, profiles or agent runs exist until real traffic or an explicit API call creates them, and
  everything clears on restart. Webhook deduplication uses `isMessageAlreadyProcessed`. The
  normalised PostgreSQL models live in `prisma/schema.prisma` with initial migration SQL in
  `prisma/migrations/`.
- **Limits** — `lib/security/rate-limiter.ts` implements a per-user sliding window and a daily AI
  token budget, but the webhook does not call it yet: enforce it by invoking `usageLimiter.check()`
  before `executeAgent` and `usageLimiter.recordTokens()` after, as described in
  [`docs/CHANGELOG_EXTENSIONS.md`](docs/CHANGELOG_EXTENSIONS.md). `lib/security/admin-auth.ts`
  issues HS256 tokens protecting `POST /api/admin/maintenance`.

> The repository has no runtime dependency on Postgres, Redis or S3 clients. With a Gemini key and
> Meta credentials it answers and delivers for real; without them every screen shows an honest empty
> or not-configured state rather than sample data. To persist to PostgreSQL, add `prisma` and
> `@prisma/client`, point `DATABASE_URL` at your database and apply `prisma/migrations/`.

## Requirements

Node.js 20 or newer.

## Quick start

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open http://localhost:3000 for the admin console. With no credentials configured it starts empty and
every screen says so: agents reply with an "AI provider not configured" notice, the gateway reports
`NOT_CONFIGURED` instead of delivering, and admin login is disabled until `ADMIN_JWT_SECRET` is set.

## Configuration

All variables are documented in [`.env.example`](.env.example) and validated at startup by
`lib/config/index.ts`, which reports warnings rather than throwing when a service is absent.

| Variable | Purpose |
| --- | --- |
| `GEMINI_API_KEY` | Google Gemini key for live AI responses. Without it no reply text is generated. |
| `GEMINI_MODEL` | Model id sent to Gemini; defaults to `gemini-2.5-flash`. |
| `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_APP_SECRET` | Meta Cloud API credentials; required for live send and webhook signature verification. |
| `WHATSAPP_VERIFY_TOKEN` | Must match the token entered in Meta's webhook configuration. No default ships with the code, so the handshake fails until you set it. |
| `DATABASE_URL`, `REDIS_URL` | Opt-in PostgreSQL and Redis backends. |
| `ADMIN_JWT_SECRET`, `ADMIN_DEFAULT_EMAIL`, `ADMIN_DEFAULT_PASSWORD` | Admin login used by `POST /api/admin/login`. All three are required; there is no fallback secret or demo account. |
| `MAX_MESSAGES_PER_MINUTE_PER_USER`, `MAX_DAILY_AI_TOKENS_PER_USER` | Rate and budget limits read by `UsageLimiter`; enforcement still needs wiring. |

Replace the placeholder secrets in `.env.example` before using them anywhere real, and never commit
`.env.local` — `.gitignore` already excludes `.env*`.

## WhatsApp setup

1. In [developers.facebook.com](https://developers.facebook.com), open your app and add the WhatsApp product.
2. Copy the phone number ID, app secret, and a permanent System User access token from Business Settings.
3. Set the callback URL to `https://<your-domain>/api/whatsapp/webhook` and use the same value for
   `WHATSAPP_VERIFY_TOKEN`.
4. Subscribe the webhook to the `messages` field.

For testing without Meta credentials, use the **WhatsApp Simulator** screen. It builds a real webhook
payload and runs it through the same pipeline locally — it never dispatches anything to Meta or to a
phone number, and the screen labels the result as a local payload preview.

## API routes

| Route | Method | Function |
| --- | --- | --- |
| `/api/whatsapp/webhook` | GET, POST | Meta subscription handshake and signed inbound messages. |
| `/api/whatsapp/simulate` | POST | Inject a test message through the full pipeline. |
| `/api/jobs`, `/api/marketplace`, `/api/study`, `/api/coding`, `/api/media`, `/api/users` | GET, POST | Console data feeds and module actions. |
| `/api/agents`, `/api/conversations` | GET | Recorded agent runs and conversation history. |
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
injection resistance, secret redaction, marketplace matching driven only by stored records, the AI
provider contract, and the queue lifecycle. The same suite runs from the **Run Test Suite** button in
the console topbar.

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

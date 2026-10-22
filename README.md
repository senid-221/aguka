# Aguka AI

**Bilingual (Kinyarwanda & English) WhatsApp AI agent platform for Rwanda.**

Aguka AI connects to the WhatsApp Business Cloud API and routes each incoming message to a
specialised agent: job discovery, career and CV support, a coding assistant, an image studio, a
study tutor, an employment marketplace and a Rwandan road safety academy. New arrivals choose a
service from an administrator-configured menu, get a 24-hour free trial on it, and pay through
mobile money when the trial ends. An admin console provides live monitoring, a webhook simulator,
consent management, pricing and curriculum control, payment review and an automated test suite.

---

## Modules

| Module | What it does |
| --- | --- |
| **Jobs Discovery** | Registered boards (MIFOTRA e-recruitment, Job in Rwanda, a remote feed) and one normalised listing shape. No live crawler is wired yet, so the pool starts empty and grows only through `POST /api/jobs` with a real `sourceUrl`. Nothing is invented. |
| **Career Assistant** | Bilingual CV, cover letter and interview coaching text through the AI model; applications require explicit user consent. |
| **Coding Agent** | Scaffolds, debugging and architecture explanations returned as text by Gemini through `POST /api/coding`. There is no execution sandbox. |
| **Passport & Photo Studio** | Written guidance on the 35×45 mm Rwandan passport standard and CV portraits, plus — when `OPENAI_API_KEY` or `GEMINI_API_KEY` is set — a real render: the image is produced by that provider, cropped to the exact 35:45 ratio with `sharp`, stored privately under `AGUKA_DATA_DIR` and delivered back on WhatsApp as an image message. A photo sent with a caption asking for it to be retouched is used as the reference. With no image key configured the request is refused before any model call and nothing is charged; a 30-day retention sweep (`IMAGE_RETENTION_DAYS`) deletes the expired file. |
| **Study Tutor** | STEM and language explanations in Kinyarwanda or English, plus generated quizzes through `POST /api/study`. |
| **Employment Marketplace** | Worker profiles, vacancies and match scores computed from stored skills, location and experience. |
| **Road Safety Academy** | Bilingual lessons, road signs, traffic rules, practice questions and timed mock exams scored server-side, with a correction and explanation for every question and per-learner progress. Curriculum content carries the gazette or service page it was taken from. |
| **Services & Access** | The catalogue behind the first WhatsApp message: an administrator enables each service, sets price, billing period, trial length and usage caps, and picks the agent it routes to. |
| **MoMo Payments** | Payment orders, receipt-screenshot upload with duplicate detection, provider reconciliation when configured, and an admin review queue that is the only thing that can unlock access by default. |
| **Users & Consent** | DPPA consent records and per-user data controls. |

## Architecture

```
WhatsApp user → Meta Cloud API webhook → Next.js route handler
    → signature check + event deduplication
    → service selection gate (menu on first message, remembered pick after that)
    → entitlement check (trial window, usage caps, payment state)
    → bilingual router (language detection → agent selection)
    → Gemini provider adapter, or the image studio when the request is a photo
    → reply via Meta Cloud API (text, or an uploaded image for a rendered photo)
    → a NOT_CONFIGURED result when credentials are absent
```

- **Ingress & validation** — `app/api/whatsapp/webhook/route.ts` verifies the Meta `X-Hub-Signature-256`
  HMAC whenever `WHATSAPP_APP_SECRET` is set, and skips already-processed event IDs. Unsigned
  requests are only accepted while that secret is absent, so configure it before going live.
- **Service selection** — `lib/whatsapp/inbound.ts` handles the conversation before routing: a user
  with no recorded service gets the numbered menu built from `listMenuServices()`, a reply of `3` or
  of the service name stores that choice on the user, and `menu` / `hitamo` reopens it. The pick then
  decides which agent answers, so routing never depends on guessing intent from the first message.
- **Entitlements** — `lib/services/entitlements.ts` starts a trial clock at the recorded activation
  time, allows it once per person across their accounts, and on expiry returns a reply that states
  the price and the payment instructions before anything else. Free services and services whose
  `chargeEnabled` is off are never blocked, so a catalogue entry cannot bill a real person by accident.
- **Routing** — `lib/ai/bilingual-router.ts` detects Kinyarwanda vs English and selects the agent.
- **Provider layer** — `lib/ai/provider-adapter.ts` generates every text reply through a chain: Gemini
  first via `@google/genai`, and OpenAI as the rescue when Gemini is rate-limited, times out, blocks the
  answer or returns nothing. Two attempts per provider inside a 12-second budget, immediate handover for
  a dead key or wrong model id, and an honest refusal — with no usage charged — when both are down.
  `lib/ai/prompt-security.ts` shields against prompt injection and redacts secrets from output.
- **Image studio** — `lib/images/provider.ts` resolves which image model to use (OpenAI `gpt-image-1`
  preferred, Gemini `gemini-2.5-flash-image` as fallback, refusal when neither key exists), and
  `lib/images/studio.ts` turns the result into a 35:45 JPEG through `sharp`, stores it with
  `durableStore.saveBinary` under `AGUKA_DATA_DIR` and records a `MediaTask`. `lib/images/spec.ts`
  holds the size and retention maths so health reporting never loads `sharp`. The bytes are only ever
  read back by the token-gated `/api/admin/media/image` route or attached to a WhatsApp message; a
  render that the provider fails is logged, answered with a plain-language apology and is not counted
  against the user's usage.
- **Queue** — `lib/queue/redis-queue.ts` runs BullMQ against `REDIS_URL` (or the Upstash TCP fields
  resolved by `lib/queue/redis-connection.ts`) and stores jobs, retries and backoff in Redis. With no
  endpoint it executes the same handlers in this process, so local development still drains the queue
  while `/api/health` says which engine is in charge. Job bodies are handled by `lib/queue/jobs.ts`;
  an unregistered job name completes with a `NO_HANDLER` note instead of inventing work, and a Redis
  enqueue that fails is recorded as failed rather than quietly run elsewhere. Run `npm run worker` on
  an always-on host for the standalone worker; serverless hosts need `QUEUE_INLINE_WORKER=false`.
- **Data** — `lib/db/repository.ts` starts empty: no users, conversations, jobs, profiles, orders or
  exam attempts exist until real traffic or an explicit API call creates them. `lib/db/store.ts`
  writes the operational records to an atomic, versioned JSON snapshot under `AGUKA_DATA_DIR` (default
  `.aguka-data/`), so they survive a restart; the queue mirror is written there too, while actual job
  execution lives in Redis once `REDIS_URL` is set. Webhook
  deduplication uses `isMessageAlreadyProcessed`. The normalised PostgreSQL models live in
  `prisma/schema.prisma` with migration SQL in `prisma/migrations/`.
- **Limits** — `lib/security/rate-limiter.ts` implements a per-user sliding window and a daily AI
  token budget, but the webhook does not call it yet: enforce it by invoking `usageLimiter.check()`
  before `executeAgent` and `usageLimiter.recordTokens()` after, as described in
  [`docs/CHANGELOG_EXTENSIONS.md`](docs/CHANGELOG_EXTENSIONS.md). `lib/security/admin-auth.ts`
  issues HS256 tokens protecting every `/api/admin/*` route and `POST /api/admin/maintenance`.

> The repository has no runtime dependency on Postgres or S3 clients, and `bullmq`/`ioredis` open no
> connection until `REDIS_URL` resolves to a real endpoint. `sharp` is the only native module and is
> used solely by the image studio; the rest of the platform runs without it. With an AI key and
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
**Services & Pricing**, **Road Safety Curriculum**, **MoMo Payment Review** and **Access & Audit**
appear in the sidebar and each asks for an administrator session before showing data. Operational records are
written to `AGUKA_DATA_DIR` (default `.aguka-data/`, created on first save and git-ignored).

## Configuration

All variables are documented in [`.env.example`](.env.example) and validated at startup by
`lib/config/index.ts`, which reports warnings rather than throwing when a service is absent.

| Variable | Purpose |
| --- | --- |
| `GEMINI_API_KEY` | Primary text provider and image fallback. Without either key no reply text is generated; the person is told so and no usage is charged. |
| `GEMINI_MODEL` | Model id sent to Gemini; defaults to `gemini-2.5-flash`. |
| `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_APP_SECRET` | Meta Cloud API credentials; required for live send and webhook signature verification. |
| `WHATSAPP_VERIFY_TOKEN` | Must match the token entered in Meta's webhook configuration. No default ships with the code, so the handshake fails until you set it. |
| `ADMIN_JWT_SECRET`, `ADMIN_DEFAULT_EMAIL`, `ADMIN_DEFAULT_PASSWORD` | Admin login used by `POST /api/admin/login`. All three are required; there is no fallback secret or demo account. |
| `AGUKA_DATA_DIR` | Where the durable snapshot and the private receipt-proof directory live. Default `.aguka-data/`, git-ignored. Needs a persistent volume in production. |
| `MOMO_PAYEE_NAME`, `MOMO_PAYEE_CODE` | The payee shown in the mobile money instructions sent to users. |
| `MOMO_VERIFY_API_URL`, `MOMO_VERIFY_API_TOKEN` | Operator-owned transaction-status endpoint. Unset, no payment is ever verified by code and every order waits for an administrator. |
| `PAYMENT_WEBHOOK_SECRET` | Shared secret with the payment provider. Unset, `POST /api/payments/webhook` answers 503 and accepts nothing. |
| `PAYMENT_AUTO_VERIFY` | `true` lets a correctly signed provider webhook unlock a service on its own. Requires the reconciliation endpoint above. |
| `OPENAI_API_KEY`, `OPENAI_VISION_MODEL`, `OPENAI_TEXT_MODEL` | Receipt-screenshot text reading, and the rescue provider behind Gemini for every reply. Proofs are still hash- and metadata-checked without it. |
| `OPENAI_IMAGE_MODEL`, `GEMINI_IMAGE_MODEL` | Image studio model ids. The studio reuses the API key above — with neither key present, photo requests are refused in code and nothing is rendered. |
| `PASSPORT_PHOTO_WIDTH`, `IMAGE_RETENTION_DAYS` | Rendered passport width in pixels (height follows the 35:45 ratio) and how long the stored JPEG is kept before the retention sweep deletes it. Defaults: 700 px, 30 days. |
| `REDIS_URL` | BullMQ queue backend. `rediss://` for a hosted TLS endpoint (Upstash needs its **TCP proxy**, not the REST URL); unset keeps jobs in-process. |
| `UPSTASH_REDIS_TCP_HOST`, `UPSTASH_REDIS_TOKEN` | Alternative to `REDIS_URL` when the Upstash token cannot be embedded in a URL. |
| `QUEUE_NAME`, `QUEUE_CONCURRENCY`, `QUEUE_INLINE_WORKER`, `QUEUE_SKIP_VERSION_CHECK` | Queue name, worker parallelism, whether the web process also executes jobs, and a workaround for proxies that forbid `INFO`. |
| `DATABASE_URL` | Opt-in PostgreSQL backend for the Prisma schema; no client is installed yet. |
| `MAX_MESSAGES_PER_MINUTE_PER_USER`, `MAX_DAILY_AI_TOKENS_PER_USER` | Rate and budget limits read by `UsageLimiter`; enforcement still needs wiring. |

Prices, trial length, usage caps and which services appear in the WhatsApp menu are not environment
variables — an administrator sets them per service in **Services & Pricing**.

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
| `/api/services` | GET | The enabled services currently offered in the WhatsApp menu. |
| `/api/road-safety/catalog` | GET | Published lessons, road signs and practice questions. |
| `/api/road-safety/exam` | POST | Start or answer a mock/practice attempt; scoring is server-side. |
| `/api/payments/order` | POST | Create a mobile money order for a service. |
| `/api/payments/proof` | POST | Upload the receipt screenshot against an order. |
| `/api/payments/webhook` | POST | Provider confirmation; requires `PAYMENT_WEBHOOK_SECRET` and a valid HMAC. |
| `/api/admin/login` | POST | Issue an admin bearer token. |
| `/api/admin/services` | GET, POST, PATCH, DELETE | Price, trial, cap, agent and menu visibility per service. |
| `/api/admin/road-safety` | GET, POST | Curriculum, road sign and question management. |
| `/api/admin/payments` | GET, POST | Review queue: verify, reject, reconcile. |
| `/api/admin/payments/image` | GET | Serve a stored proof to the reviewer, token-gated. |
| `/api/admin/media/image` | GET | Serve one stored studio photo to the console, token-gated; 410 once retention deleted it. |
| `/api/admin/entitlements` | GET, POST | Live access list, manual grant, revocation. |
| `/api/admin/audit` | GET | Who changed what, including every access decision. |
| `/api/admin/maintenance` | POST | Retention sweep and queue drain. |
| `/api/health`, `/api/ready`, `/api/tests` | GET | Liveness, readiness (including store mode) and the automated suite. |

Every `/api/admin/*` route except `/api/admin/login` rejects a request without a valid bearer token.

## Tests

```bash
npm test
npx tsx scripts/run-extension-tests.ts
```

33 checks cover the webhook challenge, invalid-token rejection, HMAC signature verification, event
deduplication idempotency, Kinyarwanda/English detection, agent intent routing, prompt injection
resistance, secret redaction, marketplace matching driven only by stored records, the AI provider
contract, the text provider chain — a rate limit retried once, a dead model id or blocked answer
handed to the rescue provider at once, an outage across both reported without leaking a key, and a
server with no key refusing honestly in the language written — the queue lifecycle and the BullMQ
endpoint rules — TLS from `rediss://`, the shipped
example value and an Upstash REST URL both refused — and the new engines: trial granted once per person and never
re-trialled, expiry and usage caps blocking with the price stated first, the dynamic menu and the
remembered pick, idempotent payment orders, duplicate receipt detection, unlock only on an
identified confirmation, reconciliation leaving an unknown payment locked, unsigned webhook
rejection, an already-paid user never being sold a second order, replies staying in the language the
person last wrote in, the image studio: with no image key a request to generate or retouch a photo is
refused in code before any model call — no usage charged, no provider error or key leaked, and the
reply still carries the passport standards — the provider pick prefers OpenAI and falls back to
Gemini, the output contract (35:45 geometry, configurable width, retention clamped to a sane range),
the retention sweep actually deleting the expired file, and the WhatsApp image payload with its
upload guards. The suite scrubs every provider credential before it runs, so it can never spend money
or post to a live number. Server-side exam scoring with corrections, and users,
orders, proofs and exam attempts surviving a restart round out the list. The same suite runs from the **Run Test Suite**
button in the console topbar.

## Database

`prisma/schema.prisma` defines the normalized PostgreSQL models spanning users, conversations and
memory, jobs and applications, marketplace profiles and matches, media and image tasks, coding
projects, study sessions and quizzes, agent runs and tool calls, webhook events, scheduled tasks,
admin users, audit logs and usage records, plus the commercial and academy tables added by
`prisma/migrations/20261021000000_commercial_and_road_safety/`: service catalogue, entitlements,
trial grants, payment orders, payment proofs, road safety modules, lessons, signs, questions,
citations, exam templates, exam attempts and lesson progress. `lib/db/prisma-readiness.ts` reports
whether Prisma is installed and whether those migrations have been applied, so `/api/ready` states
`productionDatabase` honestly instead of claiming a connection it does not have.

## Build & deploy

```bash
npm run build
npm run start
```

A production container installs every dependency, builds, then drops the dev tooling, because
`next build` needs Tailwind and TypeScript while `next start` does not:

```dockerfile
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev
EXPOSE 3000
CMD ["npm", "start"]
```

Health checks should probe `/api/health` and `/api/ready`. Mount a persistent volume at
`AGUKA_DATA_DIR` (default `.aguka-data/`) — it holds real user records, entitlements, payment orders
and receipt screenshots, and is git-ignored. Never serve that directory over HTTP: proofs are read
only through the token-gated `/api/admin/payments/image` route, studio photos only through
`/api/admin/media/image`. Alpine images need the `libvips` runtime sharp links against
(`RUN apk add --no-cache vips-dev`) if you want the studio to render.

Before the platform charges anyone, confirm all of these:

1. `ADMIN_JWT_SECRET`, `ADMIN_DEFAULT_EMAIL`, `ADMIN_DEFAULT_PASSWORD` set → admin login works.
2. `WHATSAPP_APP_SECRET` set → unsigned webhook POSTs are rejected.
3. In **Services & Pricing**, each service you intend to bill has `chargeEnabled` on, a price, a
   billing period and a trial length. Charging stays off until you turn it on.
4. `MOMO_PAYEE_NAME` / `MOMO_PAYEE_CODE` point at the account that actually receives the money.
5. `PAYMENT_WEBHOOK_SECRET` set and, if you want confirmations to unlock access without you,
   `MOMO_VERIFY_API_URL` / `MOMO_VERIFY_API_TOKEN` aligned with your provider's real field names and
   `PAYMENT_AUTO_VERIFY=true`. Leave it false and the review queue decides.
6. `/api/ready` reports the persistence and payment modes you expect.
7. If a billed service uses the studio, `OPENAI_IMAGE_MODEL` / `GEMINI_IMAGE_MODEL` and the matching
   key are set — each render costs real provider money, and `/api/health` names the provider it will
   call. Set `IMAGE_RETENTION_DAYS` to the shortest period your DPPA purposes note can defend.

## Further reading

- [Setup guide](docs/SETUP_GUIDE.md) — architecture detail, Meta and migration walkthroughs.
- [Extension changelog](docs/CHANGELOG_EXTENSIONS.md) — how the security, admin and retention modules attach.

---

Powered by IRAGUHA Vincent

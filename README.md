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
| **Passport & Photo Studio** | Written guidance on the 35×45 mm Rwandan passport standard and CV portraits. Image editing does not run here; a 30-day retention sweep marks expired media records. |
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
    → Gemini provider adapter
    → reply via Meta Cloud API, or a NOT_CONFIGURED result when credentials are absent
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
- **Provider layer** — `lib/ai/provider-adapter.ts` calls Google Gemini through `@google/genai`;
  `lib/ai/prompt-security.ts` shields against prompt injection and redacts secrets from output.
- **Queue** — `lib/queue/redis-queue.ts` keeps jobs, retries and scheduled tasks in process memory.
  When `REDIS_URL` is set it reports a `Redis BullMQ` mode label, but no Redis client connects; a
  real deployment should replace this with an actual BullMQ worker.
- **Data** — `lib/db/repository.ts` starts empty: no users, conversations, jobs, profiles, orders or
  exam attempts exist until real traffic or an explicit API call creates them. `lib/db/store.ts`
  writes the operational records to an atomic, versioned JSON snapshot under `AGUKA_DATA_DIR` (default
  `.aguka-data/`), so they survive a restart; the queue and in-flight agent runs do not. Webhook
  deduplication uses `isMessageAlreadyProcessed`. The normalised PostgreSQL models live in
  `prisma/schema.prisma` with migration SQL in `prisma/migrations/`.
- **Limits** — `lib/security/rate-limiter.ts` implements a per-user sliding window and a daily AI
  token budget, but the webhook does not call it yet: enforce it by invoking `usageLimiter.check()`
  before `executeAgent` and `usageLimiter.recordTokens()` after, as described in
  [`docs/CHANGELOG_EXTENSIONS.md`](docs/CHANGELOG_EXTENSIONS.md). `lib/security/admin-auth.ts`
  issues HS256 tokens protecting every `/api/admin/*` route and `POST /api/admin/maintenance`.

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
**Services & Pricing**, **Road Safety Curriculum**, **MoMo Payment Review** and **Access & Audit**
appear in the sidebar and each asks for an administrator session before showing data. Operational records are
written to `AGUKA_DATA_DIR` (default `.aguka-data/`, created on first save and git-ignored).

## Configuration

All variables are documented in [`.env.example`](.env.example) and validated at startup by
`lib/config/index.ts`, which reports warnings rather than throwing when a service is absent.

| Variable | Purpose |
| --- | --- |
| `GEMINI_API_KEY` | Google Gemini key for live AI responses. Without it no reply text is generated. |
| `GEMINI_MODEL` | Model id sent to Gemini; defaults to `gemini-2.5-flash`. |
| `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_APP_SECRET` | Meta Cloud API credentials; required for live send and webhook signature verification. |
| `WHATSAPP_VERIFY_TOKEN` | Must match the token entered in Meta's webhook configuration. No default ships with the code, so the handshake fails until you set it. |
| `ADMIN_JWT_SECRET`, `ADMIN_DEFAULT_EMAIL`, `ADMIN_DEFAULT_PASSWORD` | Admin login used by `POST /api/admin/login`. All three are required; there is no fallback secret or demo account. |
| `AGUKA_DATA_DIR` | Where the durable snapshot and the private receipt-proof directory live. Default `.aguka-data/`, git-ignored. Needs a persistent volume in production. |
| `MOMO_PAYEE_NAME`, `MOMO_PAYEE_CODE` | The payee shown in the mobile money instructions sent to users. |
| `MOMO_VERIFY_API_URL`, `MOMO_VERIFY_API_TOKEN` | Operator-owned transaction-status endpoint. Unset, no payment is ever verified by code and every order waits for an administrator. |
| `PAYMENT_WEBHOOK_SECRET` | Shared secret with the payment provider. Unset, `POST /api/payments/webhook` answers 503 and accepts nothing. |
| `PAYMENT_AUTO_VERIFY` | `true` lets a correctly signed provider webhook unlock a service on its own. Requires the reconciliation endpoint above. |
| `OPENAI_API_KEY`, `OPENAI_VISION_MODEL` | Optional receipt-screenshot text reading. Proofs are still hash- and metadata-checked without it. |
| `DATABASE_URL`, `REDIS_URL` | Opt-in PostgreSQL and Redis backends. |
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

25 checks cover the webhook challenge, invalid-token rejection, HMAC signature verification, event
deduplication idempotency, Kinyarwanda/English detection, agent intent routing, prompt injection
resistance, secret redaction, marketplace matching driven only by stored records, the AI provider
contract, the queue lifecycle, and the new engines: trial granted once per person and never
re-trialled, expiry and usage caps blocking with the price stated first, the dynamic menu and the
remembered pick, idempotent payment orders, duplicate receipt detection, unlock only on an
identified confirmation, reconciliation leaving an unknown payment locked, unsigned webhook
rejection, an already-paid user never being sold a second order, replies staying in the language the
person last wrote in, server-side exam scoring with corrections, and users, orders, proofs and exam
attempts surviving a restart. The same suite runs from the **Run Test Suite** button in the console topbar.

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
only through the token-gated `/api/admin/payments/image` route.

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

## Further reading

- [Setup guide](docs/SETUP_GUIDE.md) — architecture detail, Meta and migration walkthroughs.
- [Extension changelog](docs/CHANGELOG_EXTENSIONS.md) — how the security, admin and retention modules attach.

---

Powered by IRAGUHA Vincent

# Aguka AI — WhatsApp Agent Platform Setup Guide
**Bilingual (Kinyarwanda & English) AI Assistant for Rwanda**

---

## 1. System Architecture Overview

- **Ingress**: WhatsApp Mobile User ➔ Meta Cloud API Webhook ➔ Next.js Gateway
- **Reliability & Queue**: BullMQ on Redis whenever `REDIS_URL` resolves to a real endpoint; the same
  job handlers run in this process when it does not, and `/api/health` reports which engine is live
- **AI Orchestrator**: Bilingual Router with Kinyarwanda & English detection, Gemini model selection (`GEMINI_MODEL`, default `gemini-2.5-flash`), prompt-injection shielding, secret redaction, and two real tool calls (`search_verified_jobs`, `query_talent_marketplace`)
- **Core Modules**:
  1. **Job Finder**: Job in Rwanda cards and We Work Remotely category feeds are crawled for real; MIFOTRA publishes no readable feed, so the crawl reports that reason instead of inventing listings (see 5.3). The pool starts empty until a crawl runs.
  2. **Career Assistant**: bilingual CV, cover letter and interview-prep text from the model; explicit application consent required
  3. **Coding Agent**: scaffolds, debugging and architecture explanations returned as text. There is no execution sandbox and submitted code is never run.
  4. **Passport & Image Studio**: written guidance on the 35x45mm passport standard, and — when `OPENAI_API_KEY` or `GEMINI_API_KEY` is configured — a real render cropped to 35:45 with `sharp`, stored privately under `AGUKA_DATA_DIR` and delivered as a WhatsApp image. Model ids are `OPENAI_IMAGE_MODEL` and `GEMINI_IMAGE_MODEL`. Without an image key the request is refused in code before any model call. A retention sweep deletes expired photo files.
  5. **Bilingual Study Tutor**: STEM and language explanations in Kinyarwanda and English, plus generated quizzes
  6. **Employment Marketplace**: worker profiles, vacancies and match scores computed from stored skills, location and experience
  7. **Road Safety Academy**: bilingual lessons, road signs, practice questions and mock exams scored server-side, with progress tracking and an admin curriculum editor
  8. **Services & Access**: the catalogue behind the first WhatsApp message, the 24-hour trial window and per-service pricing
  9. **MoMo Payments**: orders, receipt proofs, provider reconciliation and an administrator review queue

---

## 2. First Message, Service Menu and Trials

**Menu.** `lib/whatsapp/inbound.ts` answers before the router when the user has no recorded service.
The seven service definitions in `lib/services/catalog.ts` are written in on the first inbound message
only if the catalogue is empty (`ensureCatalogSeeded()` — configuration, never user data), each with
`isFree: true`, price 0 and `chargeEnabled: false`, so nothing bills anyone until a price is confirmed.
`buildServiceMenu()` then lists every service with `isEnabled` and `showInWhatsAppMenu` in `sortOrder`
order, in the language detected in the message. The reply is both a WhatsApp interactive list (when the
gateway is live) and a numbered text fallback. A user can answer with the number, the name, or a
keyword; `matchServiceFromReply()` resolves it, `applySelection()` stores the code on the user and the
conversation, starts the trial, and routes every later message to that service's agent. `menu`,
`hitamo`, `services`, `start` and similar words reopen the list at any time.

**Trial.** Activation time is recorded on the grant, not inferred. `lib/services/entitlements.ts`
gives `trialHours` of access (24 by default), one trial per person across every account tied to the
same WhatsApp identity, then blocks with a reply that states the price and the payment instructions
first. `trialUsageLimit` caps messages during the trial (0 = unlimited); `paidUsageLimit` caps them
after payment. `isFree` or `chargeEnabled = false` means the service is never blocked.

**Enable charging.** Services & Pricing screen, or `PATCH /api/admin/services` with
`{ "code": "ROAD_SAFETY", "chargeEnabled": true, "price": 5000, "currency": "RWF", "billingPeriod": "MONTHLY", "trialHours": 24 }`.
Pricing is validated server-side (`validatePricing`) and every change is written to the audit trail.

---

## 3. Road Safety Academy Content

`lib/road-safety/content-pack.ts` holds the curriculum as a versioned pack (`CONTENT_PACK_VERSION`).
Nothing is inserted until an administrator clicks **Import curriculum pack** in the Road Safety
Curriculum screen (`POST /api/admin/road-safety` with `action: IMPORT_PACK`), and the import is
per-record idempotent: a module or lesson that already exists is skipped, so an edited page is never
overwritten. The import writes an audit entry with the counts.

- Every lesson, sign and question carries `citations` naming the instrument it came from — Law
  N° 014/2026, Decree N° 85/01 of 2002, Order N° 25/01 of 2015, Order N° 066/01 of 2024, the RURA
  passenger regulations, and Rwanda National Police / IremboGov service pages — each with a URL and
  the date it was read (`REVIEW_DATE`).
- `UNVERIFIED_TOPICS` lists what could not be confirmed in those instruments, such as mobile phone
  use while driving. It is taught as *not verified* and never becomes a marked answer.
- Scoring is server-side (`gradeAttempt`): the learner sees the chosen option, the correct option and
  the bilingual explanation for every question, whether they passed against the template's
  `passPercent`, and their running progress per module.
- Fines, fees, licence categories and speed limits change. Re-check them against the gazette copies
  listed in the pack before each term and update through **Road Safety Curriculum**; the screen shows
  the review date so stale pages are visible.

---

## 4. Payments: Development Adapter and Live Path

`lib/payments/adapters.ts` holds the only external calls in the money path.

| Mode | Condition | Behaviour |
| --- | --- | --- |
| **Development adapter (default)** | no `MOMO_VERIFY_API_URL` / `MOMO_VERIFY_API_TOKEN` | Makes no network call and reports `configured: false`. An order can never be marked verified by code, so it waits in the admin review queue. |
| **Reconciliation** | both set | POSTs `{ reference, amount, currency, payerPhone }` and reads back `status`, `transactionId`, `amount`. Those field names are a neutral contract: align them with your provider's real schema before trusting the result. A `PENDING` or unknown response leaves the order locked. |
| **Provider webhook** | `PAYMENT_WEBHOOK_SECRET` set | `POST /api/payments/webhook` accepts only an `X-Hub-Signature-256` / `X-Aguka-Signature` HMAC matching the raw body, compared with `timingSafeEqual`. Without the secret the route answers 503. |
| **Auto-unlock** | `PAYMENT_AUTO_VERIFY=true` **and** reconciliation configured | A confirmed webhook grants the entitlement. Off by default, so the review queue is the source of truth. |
| **Receipt OCR** | `OPENAI_API_KEY` set | Reads text out of the uploaded screenshot to compare against the order. Without it the image is still hashed, de-duplicated and metadata-checked, and an administrator decides. |

Payment orders carry a unique reference and grant nothing on creation; the same `idempotencyKey`
returns the same order instead of opening a second one. Proofs upload to `AGUKA_DATA_DIR/proofs`,
outside the web root, and are read back only through the token-gated admin image route. A
re-uploaded identical image is detected by hash and flagged rather than accepted twice, and access
unlocks only on an identified confirmation of a receipt.

---

## 5. Meta WhatsApp Cloud API Setup

1. **Meta for Developers**: Go to [developers.facebook.com](https://developers.facebook.com) and create or select your App.
2. **Add WhatsApp Product**: Navigate to **WhatsApp > API Setup**.
3. **Copy Credentials**:
   - `WHATSAPP_PHONE_NUMBER_ID`
   - `WHATSAPP_ACCESS_TOKEN` (Create a permanent System User Token under Business Settings)
   - `WHATSAPP_APP_SECRET` (Under App Settings > Basic)
4. **Configure Webhook**:
   - In WhatsApp > Configuration, click **Edit Webhook URL**:
     - **Callback URL**: `https://<YOUR_DEPLOYED_DOMAIN>/api/whatsapp/webhook`
     - **Verify Token**: any random string you choose, set identically as `WHATSAPP_VERIFY_TOKEN`.
       The code ships no default, so the handshake is rejected until you set it.
   - Subscribe to the **`messages`** webhook field.
5. **Interactive Testing Without Credentials**:
   - The **WhatsApp Simulator** screen runs a message through the real router, security checks and AI
     call path locally and shows the payload it *would* send. It never dispatches to Meta or to a
     phone number, and the delivery result is labelled `dispatched: false`.
   - Without `GEMINI_API_KEY` the agents reply with an "AI provider not configured" notice instead of
     a scripted answer.
   - A reply of "could not reach the AI provider" is usually the model id, not the network. The server
     logs `AI_GENERATION_FAILED` with the provider's own message and **Settings** shows the active
     model. `404 NOT_FOUND: Model "…" not found` means `GEMINI_MODEL` names a model that key or its
     project cannot use: list what the key can reach from
     `https://generativelanguage.googleapis.com/v1beta/models`, then set `GEMINI_MODEL` to one of
     those, or issue the key in a project with the Generative Language API enabled. The provider's raw
     error text stays in the log — it is never sent to the person on WhatsApp.
   - Asking the assistant to make or retouch a photo goes to the **image studio** (section 5.1). With
     no image key configured it is refused in code before the model call, in the language written, and
     no trial use is spent; the reply still carries the passport standards.

### 5.1 Image Studio: keys, cost and privacy

`lib/images/provider.ts` picks the model, `lib/images/studio.ts` crops and stores the result.

| Condition | What happens to a photo request |
| --- | --- |
| `OPENAI_API_KEY` set | Renders with `OPENAI_IMAGE_MODEL` (default `gpt-image-1`) — generation from a description, or an edit with the uploaded photo as the reference. |
| No OpenAI key, `GEMINI_API_KEY` set | Renders with `GEMINI_IMAGE_MODEL` (default `gemini-2.5-flash-image`) through `generateContent`. |
| Neither key | Refused before any call: `IMAGE_STUDIO_NOT_CONFIGURED`, usage untouched, and the person gets the written 35×45 mm standards instead. |

- **Cost.** Every render is a paid image API call, unlike a text reply. `consumeUsage()` runs only
  after a successful image, so a provider failure logs `IMAGE_STUDIO_FAILED` and is not billed to the
  user's quota. Keep the studio off the free services you bill for until you have priced it.
- **Geometry.** Output is cropped with `sharp` to exactly 35:45 at `PASSPORT_PHOTO_WIDTH` px
  (default 700, so 700×900). Passport standards are printed size, not pixels — the JPEG is a correct
  ratio a printer can scale, not a guarantee that a submission portal accepts it.
- **Privacy.** Bytes go through `durableStore.saveBinary` into the private binary directory under
  `AGUKA_DATA_DIR` — outside the web root, never in the JSON snapshot — and are read back only by the
  token-gated `/api/admin/media/image` route or attached to the WhatsApp message. The uploaded photo
  used as a retouch reference is **not** stored — the task records
  `input:person-uploaded-photo-not-stored`. A description-only request is prompted as a synthetic
  portrait, never a likeness of a real individual.
- **Retention.** `IMAGE_RETENTION_DAYS` (default 30) is written onto the task; the sweep in
  `lib/maintenance/retention.ts` deletes the file and rewrites the record as `purged:<key>`, so the
  admin screen says the photo is gone instead of showing a broken thumbnail. Set it to the shortest
  period your DPPA purposes note can defend.
- **Delivery.** The rendered JPEG is uploaded to Meta (`POST /{phoneNumberId}/media`, 5 MB cap) and
  sent as a WhatsApp `image` message. If the upload fails the person still gets the text answer with
  a plain note that the file could not be attached, and the server logs `IMAGE_DELIVERY_FAILED`.

### 5.2 Text providers: Gemini first, OpenAI as the rescue

`lib/ai/provider-adapter.ts` owns every text reply — the WhatsApp assistant, the coding
route and the study route all call `generateText()`. The chain is rebuilt per request from
the keys that are actually set, so fixing the environment takes effect without a restart.

| Condition | What happens to a reply |
| --- | --- |
| `GEMINI_API_KEY` + `OPENAI_API_KEY` | Gemini answers first. A 429, timeout, dropped connection, blocked candidate or empty answer is retried once on Gemini, then the same prompt goes to OpenAI (`OPENAI_TEXT_MODEL`, default `gpt-4o`). |
| `GEMINI_API_KEY` only | Gemini answers, retried once. Config validation warns that there is no rescue: a bad minute from one provider is the whole outage. |
| `OPENAI_API_KEY` only | OpenAI answers first and is retried once. |
| Neither | No call is made. The person gets the not-configured notice naming both variables, `modelUsed` is `not-configured`, and no usage is charged. |

- **Budget.** Two attempts per provider, a 12-second ceiling for the whole chain and a
  20-second cap on any single HTTP call. That is deliberate: the `@google/genai` SDK retries
  a 429 five times with up to a 60-second delay by default, which held the Meta webhook open
  long past the host timeout and is why the service looked like it answered only every other
  message. `lib/gemini.ts` sets `retryOptions: { attempts: 1 }` so retry belongs to the chain.
- **Fail fast on the failures that will not heal.** A 401, 403, 404 or 451 — dead key, wrong
  model id — goes to the rescue provider immediately instead of spending the retry budget. A
  safety block or an empty candidate does the same: it is that provider's judgement of that
  prompt, not a blip.
- **What the person sees.** Nothing about the provider. A total outage is
  `AI_UNAVAILABLE` in the language written: no answer, nothing counted against usage, try
  again in a moment. The attempt lines (provider, model, outcome, status, first 160 characters
  of the provider message, secrets redacted) are logged under `AI_GENERATION_FAILED` with the
  chain order, and a rescue answer is logged as `AI_PROVIDER_FELLED_BACK` at warn level.
- **Where to look.** `/api/health` and `/api/ready` report `textChain` — order,
  `rescueConfigured`, `attemptsPerProvider`, `budgetMs` — and the admin Settings screen shows
  the same as a Text Providers panel with the live chain (`gemini-2.5-flash → gpt-4o`) on the
  dashboard. If that panel says *No rescue provider*, `OPENAI_API_KEY` is missing or is still
  the `.env.example` placeholder, which is rejected on purpose.
- **Cost.** Gemini carries the traffic; OpenAI is only billed for the replies Gemini could
  not give, which is also the record of how often the primary is failing.

---

### 5.3 Job board discovery: what is crawled, and what is honestly refused

The Job Finder answers only from listings a crawl actually stored. `lib/jobs/crawler.ts` reads each
registered board with the connector for its page shape, and `POST /api/jobs` with
`{ "action": "CRAWL_SOURCE", "sourceCode": "JOB_IN_RWANDA" }` runs one board on demand — that request
needs an administrator bearer token because it makes outbound calls and writes to the store.

| Board | How it is read today |
| --- | --- |
| **Job in Rwanda** (`JOB_IN_RWANDA`) | `/jobs/all` renders its job cards server-side, so the crawler reads the card page: title, employer, location, the `DD-MM-YYYY` published and deadline dates the board prints, seniority and one ≤320-character excerpt. A posting whose deadline has passed is stored as `EXPIRED` and left out of the active count. |
| **Global Remote Tech for Africa** (`REMOTE_TECH`) | We Work Remotely publishes official category RSS feeds; `<item>` blocks give title, employer (split from a `Employer: Title` heading), salary range, region and category. |
| **MIFOTRA** (`MIFOTRA`) | Not readable, and the crawl says so. The e-recruitment portal returns an empty JavaScript shell to a client that does not execute scripts and publishes no RSS or Atom feed, no sitemap and no documented listings API. Reaching its listings would mean reverse-engineering a private government endpoint, which this platform will not do. The board is recorded `WARNING` / `NO_PUBLIC_FEED` with that reason, and **zero listings are invented to fill it**. If the ministry ever publishes a feed, `JOB_FEED_URL_MIFOTRA=<url>` makes the next crawl use it. |
| Any other registered code | Reports *no reader for its page shape yet*; `JOB_FEED_URL_<CODE>` points it at a feed it does publish. |
| Any board whose `JOB_FEED_URL_<CODE>` is a web page | `NO_PUBLIC_FEED` with *"answered 200 but is not an RSS or Atom document … not to a page"*. A mistyped override is a configuration fault to report, and must never be allowed to show a board as healthy-and-empty. Pointing `JOB_FEED_URL_MIFOTRA` at the portal home page is that mistake, and the crawl now says so. |

- **Storage policy.** Only what the board itself printed is kept — plus the link back. Full
  advertisement text is never republished, and `normalizeJobListing()` throws for any row whose
  `sourceUrl` is not a real `http…` address, so a reply can always send the person to the source. A row
  that cannot be grounded is dropped and counted in the board's note, never guessed at.
- **Re-crawling is idempotent.** A listing is keyed on the board's own posting id (the feed `guid` or the
  card's slug), so the hourly pass refreshes `lastVerifiedAt` instead of storing the same job twice. A
  job posted in two categories of the same feed collapses to one row.
- **Schedule.** `scripts/worker.ts` → `lib/jobs/schedule.ts` crawls every board on start and then every
  `JOB_CRAWL_INTERVAL_MINUTES` (default 60). A tick that arrives while a crawl is still running is
  skipped rather than queued, so one slow board cannot pile up processes. `0` turns the schedule off and
  leaves the console button. `JOB_CRAWL_TIMEOUT_MS` (default 15000) bounds one board, and
  `JOB_CRAWL_MAX_LISTINGS` (default 60) bounds how many rows are taken from it.
- **Where to look.** The **Jobs Discovery** screen lists each board with its last outcome, the board's own
  note and a *Crawl now* button; **System Settings** shows the schedule, caps and per-board state; and
  `/api/ready` returns the same as `checks.jobDiscovery`, including `SCHEDULED` or `MANUAL_ONLY`.
- **Etiquette.** Requests carry an identifying `User-Agent` (`AgukaAIJobDiscovery/1.0`), go only to pages
  the board publishes for readers, and stay inside the interval and cap above. Check a board's terms
  before lowering `JOB_CRAWL_INTERVAL_MINUTES`.

---

## 6. Persistence, Database & Migrations

Two layers, reported separately by `/api/ready`:

**Durable file store (active now).** `lib/db/store.ts` serializes users, service selections,
entitlements, trial grants, payment orders, receipt proofs, road safety content and audit entries into
an atomic, versioned snapshot (`repository-snapshot.json`) under `AGUKA_DATA_DIR`, default
`.aguka-data/`, written through a temp file and `renameSync`. Receipt proofs and studio renders are
stored as binaries in the private `AGUKA_DATA_DIR/proofs` directory, never inside the snapshot and
never under `public/`. This survives a restart;
in-flight agent runs do not, and queue jobs survive it only once BullMQ has a Redis to live in. Point
`AGUKA_DATA_DIR` at a persistent volume, keep it out
of version control (`.gitignore` already excludes it), and back it up — it holds personal data, so a
DPPA deletion request has to reach it.

**PostgreSQL (production target, not wired).** `prisma/schema.prisma` defines the normalized schema and
`prisma/migrations/20261020000000_init` plus
`prisma/migrations/20261021000000_commercial_and_road_safety` contain the SQL. **Prisma is not a
dependency of this project yet**, so `npx prisma migrate deploy` alone will not work:

```bash
npm install -D prisma
npm install @prisma/client
export DATABASE_URL="postgresql://user:password@localhost:5432/aguka_db?schema=public"
npx prisma migrate deploy
npx prisma generate
```

On Windows, stop the running server before `prisma generate` — the dev server locks the query-engine
DLL and generation fails. Installing Prisma is not enough: `lib/db/repository.ts` still has to be
switched from the JSON store to Prisma calls, and `/api/ready` will keep reporting the file store until
that happens.

### Redis & BullMQ (opt-in)

`bullmq` and `ioredis` are dependencies, but no connection is opened until `lib/queue/redis-connection.ts`
resolves a real endpoint. Two ways to give it one:

**A single URL** — `redis://` for a local server, `rediss://` (double s) for anything hosted, because
providers only accept TLS:

```bash
REDIS_URL="rediss://default:<token>@<host>:6379"        # Upstash TCP proxy, Railway, Redis Cloud…
REDIS_URL="redis://:<password>@127.0.0.1:6379"          # Memurai / WSL2 / VPS Redis
```

**Upstash fields** — use these when the token contains a `/` or `:` and cannot sit in a URL:

```bash
UPSTASH_REDIS_TCP_HOST="<your-proxy-host>.upstash.io"
UPSTASH_REDIS_TOKEN="<token>"
```

Upstash needs its **TCP port enabled**: open the database in the console → *Settings* → *TCP port
(Redis protocol)*, and copy the proxy host it shows. Its REST endpoint (`https://…upstash.io` plus
`UPSTASH_REDIS_REST_TOKEN`) cannot run BullMQ, and `/api/ready` refuses an `https://` `REDIS_URL`
rather than pretending to connect. Because BullMQ keeps polling Redis even when the queue is idle, a
pay-as-you-go Upstash database bills continuously — move to a fixed plan before enabling it in
production.

Then restart and check the engine:

```bash
curl http://localhost:3000/api/health   # redisQueue.mode → "Redis BullMQ · <host>:6379 (tls) …"
curl http://localhost:3000/api/ready    # checks.queue → PASS with pendingJobs and activeWorkers
```

Unset, `mode` stays `In-Process Resilient Queue` and jobs execute inside the web process; set but
unreachable, `/api/ready` answers 503 with `… · UNREACHABLE` and failed enqueues are recorded as
`REDIS_ENQUEUE_FAILED` instead of being silently dropped.

**Who executes the jobs.** Outside production the web process attaches a worker automatically, so
local development drains the queue by itself. On serverless hosting set
`QUEUE_INLINE_WORKER=false` and run the worker on an always-on host:

```bash
npm run worker        # scripts/worker.ts — BullMQ worker with Ctrl+C / SIGTERM shutdown
```

Keep that worker pointed at a real database rather than the file store: with
`AGUKA_DATA_DIR` snapshot JSON, the web server and the worker are two writers racing on one file.
`QUEUE_CONCURRENCY` (default 5) sets how many jobs one worker runs at once, `QUEUE_NAME` (default
`aguka-jobs`) is the BullMQ queue, and `QUEUE_SKIP_VERSION_CHECK=true` is for proxies that forbid the
`INFO` command BullMQ probes the Redis version with.

---

## 7. Running Automated Tests

Run the built-in test suite either through the Admin Topbar (**Run Test Suite**) or via the API:
```bash
npm test
curl -X GET http://localhost:3000/api/tests
```
`npm test` writes to a separate `.aguka-test-data` directory so the suite can never touch live records;
delete it between runs for a clean slate.

Tests verified:
- Webhook GET subscription challenge verification and invalid-token rejection
- POST Meta HMAC-SHA256 signature check
- Event deduplication idempotency
- Bilingual language detection (Kinyarwanda & English)
- Specialized multi-agent intent routing
- Prompt injection resistance & secret credential redaction
- Marketplace matching driven only by stored records, with full explainability on every match
- AI provider contract (Gemini primary, no mock fallback) and its honest failure mode with no key
- Text provider chain against injected providers: a rate limit retried once on the same provider, a
  dead model id or a blocked answer handed to the rescue immediately without burning the budget, an
  outage across both throwing with a redacted four-line attempt summary, the order Gemini → OpenAI,
  a rescue only when a real key exists, and the retry budget kept inside what a user will wait
- The rescue provider over a stubbed HTTP transport (nothing leaves the machine): a 429 retried once
  then reported as an outage, a successful answer keeping its token count and sending the system
  instruction plus the JSON format, and a server with no key at all refusing in both languages
  without naming a credential, an endpoint or charging usage
- Image studio with no provider key: photo request refused in code before entitlements and before any
  model call, in the language the person wrote, with no provider error text in the reply, no usage
  charged, and an uploaded photo plus a caption not filed as a payment proof
- Image provider selection (OpenAI preferred, Gemini fallback, refusal with neither) and the output
  contract: 35:45 geometry, configurable width, retention clamped to a defensible range
- Retention sweep deleting the expired photo file, not just the record
- WhatsApp image payload shape, caption cap, and the upload guards that refuse missing credentials or
  zero-byte images
- Queue enqueue and processing lifecycle, configuration parsing, logger redaction
- BullMQ endpoint resolution: TLS from `rediss://`, credentials kept out of the reported label,
  percent-decoded userinfo, the shipped `.env.example` value and an Upstash REST URL both rejected
- 24-hour trial granted once and never re-trialled for the same person
- Trial expiry and usage caps blocking access, with the price stated first
- First WhatsApp message receiving the dynamic menu and the pick being remembered
- Payment order idempotency, unique reference, and granting nothing on creation
- Receipt screenshot stored outside the web root and a re-upload flagged
- Unlock requiring an identified confirmation of a receipt
- Reconciliation leaving an unknown payment locked
- Provider webhook rejecting unsigned and unknown references
- An already-paid user never being sold a new order, and one-word commands answering in the
  language the person last wrote in
- Mock exam scored server-side with corrections and explanations
- Users, orders, proofs and exam attempts persisting across a restart
- Job board crawl against a stubbed transport (no request leaves the machine, so the suite can never
  hammer a real site): a feed listing stored with the employer split from the title, the salary range, the
  board's own category and a markup-free excerpt after double-escaped entities are decoded; a re-crawl that
  refreshes the two known rows and stores none; a card page read with its day-first `DD-MM-YYYY` deadline,
  with the expired posting marked `EXPIRED` and excluded from the active count; a board with no public feed
  reporting its reason, storing nothing and flipping to a real crawl once `JOB_FEED_URL_<CODE>` is set; a
  board answering 500 storing nothing; and a row with no `sourceUrl` refused by the zero-hallucination gate

---

## 8. Docker & Render Deployment

### Production Build
```bash
npm run build
npm run start
```

### Dockerfile
`next build` needs the dev dependencies (Tailwind, TypeScript), `next start` does not, so install
everything, build, then prune:
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

`sharp` normally ships a prebuilt binary, so this works as-is. If the studio logs
`IMAGE_CROP_FAILED` on an Alpine host, install the runtime library it links against:
`RUN apk add --no-cache vips-dev`.

Mount a persistent volume at the `AGUKA_DATA_DIR` path and pass the environment variables from
`.env.example` through your platform's secret store. On Render or similar, set
`MOMO_PAYEE_NAME` / `MOMO_PAYEE_CODE` before any paid service is enabled; leave
`PAYMENT_AUTO_VERIFY=false` until the provider's real reconciliation schema and webhook secret are in
place.

### Going live checklist
1. Admin login works (`ADMIN_JWT_SECRET` + credentials) and every `/api/admin/*` route rejects a request with no token.
2. `WHATSAPP_APP_SECRET` set, so unsigned webhooks are rejected; Meta handshake verified with your own `WHATSAPP_VERIFY_TOKEN`.
3. Services & Pricing reviewed: `chargeEnabled`, price, currency, billing period, trial hours and usage caps per service; nothing bills a person until you switch it on.
4. Menu order and visibility confirmed by sending a first message to the number.
5. `MOMO_PAYEE_CODE` receives money; `PAYMENT_WEBHOOK_SECRET` shared with the provider; review queue exercised end to end (order → proof → verify → access → expiry → payment → re-access).
6. Road safety citations re-checked against the current gazette and `REVIEW_DATE` updated.
7. `/api/ready` and `/api/health` green, `npm test` at 34/34, and `AGUKA_DATA_DIR` on a backed-up volume.
8. If scheduled jobs matter to you: `REDIS_URL` resolves (the health endpoint names the engine), the
   worker runs somewhere always-on, and `QUEUE_INLINE_WORKER=false` on serverless so a frozen function
   cannot hold a half-finished job.
9. If the studio is enabled for a paid service: `/api/health` names the provider and model it will
   call, `IMAGE_RETENTION_DAYS` is the shortest period your DPPA purposes note can defend, and you have
   priced the per-render API cost into the service. A rendered photo is a real image of a real person
   sitting on your volume — the sweep, the backup and the deletion request all have to reach it.
10. Settings shows **Rescue armed** with the chain you expect (`gemini-2.5-flash → gpt-4o`). If it
    says *No rescue provider*, set `OPENAI_API_KEY`: one provider means every 429 or slow minute from
    that API is an outage for the person on WhatsApp. After a day of live traffic, grep the log for
    `AI_PROVIDER_FELLED_BACK` — the rate at which the rescue answers is how often the primary is
    failing, and a chain that never falls back is also worth checking.
11. Job boards: run a crawl from the Jobs screen and check each board's note. `/api/ready` reports
    `SCHEDULED` only if the worker will crawl on the `JOB_CRAWL_INTERVAL_MINUTES` you are comfortable
    asking of those sites — and if MIFOTRA still says *No public feed*, decide whether to ask the ministry
    for a feed you may read, or to leave the refusal visible. Job Finder replies must keep sending people
    to the board's own link.

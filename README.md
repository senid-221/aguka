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
| **Jobs Discovery** | Real crawlers read the boards as they publish: Job in Rwanda renders server-side job cards and We Work Remotely (the `REMOTE_TECH` board) publishes category RSS feeds. MIFOTRA's e-recruitment portal is a JavaScript shell with no feed, sitemap or documented API, so the crawl reports that reason instead of inventing listings — set `JOB_FEED_URL_MIFOTRA` when the ministry provides one. Only what the board itself printed is stored (title, employer, location, dates, a ≤320-character excerpt and the link back), a row with no link back is refused, and re-crawling refreshes a posting instead of duplicating it. |
| **Career Assistant** | Bilingual CV, cover letter and interview coaching text through the AI model; applications require explicit user consent. |
| **Coding Agent** | Scaffolds, debugging and architecture explanations returned as text by Gemini through `POST /api/coding`. There is no execution sandbox. |
| **Passport & Photo Studio** | Written guidance on the 35×45 mm Rwandan passport standard and CV portraits, plus — when `OPENAI_API_KEY` or `GEMINI_API_KEY` is set — a real render: the image is produced by that provider, cropped to the exact 35:45 ratio with `sharp`, stored privately under `AGUKA_DATA_DIR` and delivered back on WhatsApp as an image message. A photo sent with a caption asking for it to be retouched is used as the reference. With no image key configured the request is refused before any model call and nothing is charged; a 30-day retention sweep (`IMAGE_RETENTION_DAYS`) deletes the expired file. |
| **Study Tutor** | STEM and language explanations in Kinyarwanda or English, plus generated quizzes through `POST /api/study`. |
| **Employment Marketplace** | Worker profiles, vacancies and match scores computed from stored skills, location and experience. |
| **Road Safety Academy** | Bilingual lessons, road signs, practice sets, learn mode and timed mock exams scored server-side, with a correction and explanation for every question and per-learner progress. New questions are generated from a registry of rules that each cite a gazette or service page, and a verification gate holds anything it cannot defend in a review queue instead of publishing it — the AI never supplies a speed limit, penalty or sign meaning of its own. Every paper is labelled a practice simulation, never the official examination. Difficulty adapts to the learner's own accuracy and timing, and each finished paper ends with a six-part report. The same engine answers on WhatsApp: the letters and numbers a learner types map server-side, the mark is never taken from anything the model said, and the tutor answers questions about that person's own graded paper — the option they actually typed, the key, the explanation on file and its legal review date — read back from the store rather than recollected. |
| **Services & Access** | The catalogue behind the first WhatsApp message: an administrator enables each service, sets price, billing period, trial length and usage caps, and picks the agent it routes to. |
| **MoMo Payments** | Payment orders, receipt-screenshot upload with duplicate detection, provider reconciliation when configured, and an admin review queue that is the only thing that can unlock access by default. |
| **Users & Consent** | DPPA consent records and per-user data controls. |

## Architecture

```
WhatsApp user → Meta Cloud API webhook → Next.js route handler
    → signature check + event deduplication
    → read receipt + "typing…" indicator on the inbound message id
    → service selection gate (menu on first message, remembered pick after that)
    → entitlement check (trial window, usage caps, payment state)
    → bilingual router (language detection → agent selection)
    → whole-backend data snapshot read from the store, attached to the prompt
    → Gemini provider adapter, or the image studio when the request is a photo
    → reply via Meta Cloud API (text, or an uploaded image for a rendered photo)
    → a NOT_CONFIGURED result when credentials are absent
```

- **Ingress & validation** — `app/api/whatsapp/webhook/route.ts` verifies the Meta `X-Hub-Signature-256`
  HMAC whenever `WHATSAPP_APP_SECRET` is set, and skips already-processed event IDs. Unsigned
  requests are only accepted while that secret is absent, so configure it before going live.
- **Presence** — `lib/whatsapp/gateway.ts` marks the inbound message read and starts a typing indicator
  before any slow work begins, so the person sees two blue ticks and "typing…" while the agent reads
  the store. The indicator is refreshed every 20 seconds (Meta dismisses it after ~25) and stops the
  moment the reply is sent or the turn throws. Every failure mode is deliberately non-fatal: with no
  credentials nothing is sent and the result says `NOT_CONFIGURED`, and a Meta rejection is logged as
  `WHATSAPP_PRESENCE_FAILED` with its reason — the person still gets the answer. Typing indicators
  need Graph v22.0 or newer; `WHATSAPP_GRAPH_VERSION` selects the version and defaults to `v23.0`. The
  payload has not been exercised against a live Meta number from this repository — the tests only
  assert it against a stubbed transport — so confirm the ticks and the indicator on your own test
  number before relying on it.
- **Grounding** — `lib/ai/platform-context.ts` builds one snapshot for **every** agent turn: the live
  service catalogue, this deployment's runtime capabilities, the person's own account, entitlement and
  latest payment order, verified listings and board health, the talent marketplace, this person's own
  study, coding and photo rows, road-safety totals and their own paper, and the recent conversation.
  Rows belonging to another user are never in it, and the shared rules tell the model not to claim the
  platform has nothing when the snapshot lists something. Previously only three of the eight agents
  received any data at all, which is why a tutor could say it had nothing that did exist.
- **Service selection** — `lib/whatsapp/inbound.ts` handles the conversation before routing: a user
  with no recorded service gets the numbered menu built from `listMenuServices()`, a reply of `3` or
  of the service name stores that choice on the user, and `menu` / `hitamo` reopens it. The pick then
  decides which agent answers, so routing never depends on guessing intent from the first message.
- **Entitlements** — `lib/services/entitlements.ts` starts a trial clock at the recorded activation
  time, allows it once per person across their accounts, and on expiry returns a reply that states
  the price and the payment instructions before anything else. Free services and services whose
  `chargeEnabled` is off are never blocked, so a catalogue entry cannot bill a real person by accident.
- **Routing** — `lib/ai/bilingual-router.ts` detects Kinyarwanda vs English and selects the agent.
- **Reasoning layers** — four gates sit on top of the chain, all decided in code rather than by asking
  the model to behave:
  - `lib/ai/research.ts` — the research gate. A turn is grounded in a live Google Search only when the
    person asked for a lookup, the answer is a fact that changes (price, rate, deadline, weather), or the
    store genuinely holds nothing on the subject (a job seeker with `Verified listings: NONE` gets a real
    search, not an apology). Their own records never trigger it, and the Road Safety Academy never does:
    a traffic rule may only come from the verified registry, not from a page that states a wrong limit.
    The pages the provider actually read are printed after the answer as `Sources:` / `Inkomoko:`; when
    the lookup was requested but failed, the reply says the search did not run instead of reading as if
    it had.
  - `lib/ai/intent.ts` — category routing. A free-text message whose words match nothing, or match two
    categories at once, is classified by the model instead of falling through to the default agent. A
    menu pick, a short reply, a confident keyword match and the academy are never re-routed (an open exam
    paper is stateful), and a model that names a category this build does not have is refused — the
    keyword routing answers and the refusal is recorded.
  - `lib/ai/memory.ts` — durable memory. After an answered turn, validated facts about that person
    ("district=Huye", "trade=plumbing") are written into their own conversation and read back into every
    later prompt. Secret-looking keys, digit strings long enough to be a phone or card number and values
    over 120 characters are dropped, four facts per turn and sixteen per person at most, and one person's
    notes never appear in another's snapshot. `AI_MEMORY_EXTRACT=false` turns it off.
  - `lib/ai/variety.ts` — the repetition gate. Each agent answers at its own sampling temperature, the
    slice of stored listings shown rotates as the conversation continues instead of repeating the first
    five forever, and a reply whose wording matches what this person was already told is re-asked exactly
    once with the facts held still. If it still repeats, the first answer is kept — the same good reply
    beats an error message.
  Search grounding itself lives in `lib/ai/provider-adapter.ts`: a searched turn is handed only to a
  provider that can browse (Gemini with `google_search`, or OpenAI when `OPENAI_SEARCH_MODEL` names a
  search-capable model), and the citation lists from the two transports are normalised into the same
  shape. `AI_WEB_SEARCH=false` disables lookups without touching ordinary replies.
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
  The worker also owns the job-board schedule: it crawls every registered board on start and then every
  `JOB_CRAWL_INTERVAL_MINUTES` (default 60, `0` turns the schedule off and leaves the console button).
- **Job discovery** — `lib/jobs/feed.ts` fetches a board within `JOB_CRAWL_TIMEOUT_MS` and a byte cap,
  then parses RSS 2.0 `<item>` and Atom `<entry>` shapes without an XML dependency. `lib/jobs/connectors/`
  holds one reader per board shape: server-side job cards (Job in Rwanda, including its day-first
  `DD-MM-YYYY` deadlines), official category feeds (We Work Remotely) and MIFOTRA, which declares why it
  cannot be read and accepts a `JOB_FEED_URL_MIFOTRA` override. `lib/jobs/crawler.ts` orchestrates a
  source: normalise → refuse anything with no link back → collapse duplicate postings → upsert by the
  board's own posting id → record the board's health, timing, active count and the board's own words for
  a failure. Expired postings are stored as `EXPIRED` and excluded from the active count.
- **Searching the pool** — `lib/jobs/query.ts` decides what a question is really asking. Every word of it
  must be answered somewhere in a listing (a title hit outweighs a description one), one Kinyarwanda word is
  answered by any of the English wordings the boards publish (`mudasobwa` → IT, software, developer — not all
  of them at once), Rwandan district names are kept as places, a two-letter word must be the whole word rather
  than a fragment of another, and a closed vacancy or an unregistered board is never returned as work. When
  nothing answers the question, the reply says so instead of showing unrelated postings.
- **Cold servers** — `lib/jobs/lazy-crawl.ts` reads the boards inside the turn that needs them. A serverless
  host cannot run `npm run worker`, so every new instance started with an empty pool and told the first job
  seeker of the day that nothing was stored. One attempt per process per cooldown, a wall-clock budget so a
  slow board cannot hold the reply hostage, and the reason for whatever came back is recorded on the agent
  run, reported by `/api/ready` and shown on the Jobs screen. `JOB_ON_DEMAND_CRAWL=false` leaves the pool to
  the worker and the buttons.
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
| `WHATSAPP_GRAPH_VERSION` | Graph API version for every outbound call, including the read receipt and typing indicator. Defaults to `v23.0`; typing indicators need `v22.0` or newer, and a malformed value falls back to the default. |
| `ADMIN_JWT_SECRET`, `ADMIN_DEFAULT_EMAIL`, `ADMIN_DEFAULT_PASSWORD` | Admin login used by `POST /api/admin/login`. All three are required; there is no fallback secret or demo account. |
| `AGUKA_DATA_DIR` | Where the durable snapshot and the private receipt-proof directory live. Default `.aguka-data/`, git-ignored. Needs a persistent volume in production. |
| `MOMO_PAYEE_NAME`, `MOMO_PAYEE_CODE` | The payee shown in the mobile money instructions sent to users. |
| `MOMO_VERIFY_API_URL`, `MOMO_VERIFY_API_TOKEN` | Operator-owned transaction-status endpoint. Unset, no payment is ever verified by code and every order waits for an administrator. |
| `PAYMENT_WEBHOOK_SECRET` | Shared secret with the payment provider. Unset, `POST /api/payments/webhook` answers 503 and accepts nothing. |
| `PAYMENT_AUTO_VERIFY` | `true` lets a correctly signed provider webhook unlock a service on its own. Requires the reconciliation endpoint above. |
| `OPENAI_API_KEY`, `OPENAI_VISION_MODEL`, `OPENAI_TEXT_MODEL` | Receipt-screenshot text reading, and the rescue provider behind Gemini for every reply. Proofs are still hash- and metadata-checked without it. |
| `AI_WEB_SEARCH` | Whether a turn may be grounded in a live Google Search. On unless `false`/`0`/`off`/`no`; Google bills per search, so this is the cost switch. Ordinary replies are unaffected. |
| `OPENAI_SEARCH_MODEL` | The OpenAI model allowed to browse (e.g. a search-capable `gpt-4o` variant). Unset, OpenAI is skipped for searched turns and only Gemini answers them — a model that cannot browse must not return remembered text labelled as researched. |
| `AI_MEMORY_EXTRACT` | Whether durable facts about a person are extracted from an answered turn. On unless `false`/`0`/`off`/`no`. Each extraction is one extra small JSON call per substantive message. |
| `OPENAI_IMAGE_MODEL`, `GEMINI_IMAGE_MODEL` | Image studio model ids. The studio reuses the API key above — with neither key present, photo requests are refused in code and nothing is rendered. |
| `PASSPORT_PHOTO_WIDTH`, `IMAGE_RETENTION_DAYS` | Rendered passport width in pixels (height follows the 35:45 ratio) and how long the stored JPEG is kept before the retention sweep deletes it. Defaults: 700 px, 30 days. |
| `REDIS_URL` | BullMQ queue backend. `rediss://` for a hosted TLS endpoint (Upstash needs its **TCP proxy**, not the REST URL); unset keeps jobs in-process. |
| `UPSTASH_REDIS_TCP_HOST`, `UPSTASH_REDIS_TOKEN` | Alternative to `REDIS_URL` when the Upstash token cannot be embedded in a URL. |
| `QUEUE_NAME`, `QUEUE_CONCURRENCY`, `QUEUE_INLINE_WORKER`, `QUEUE_SKIP_VERSION_CHECK` | Queue name, worker parallelism, whether the web process also executes jobs, and a workaround for proxies that forbid `INFO`. |
| `DATABASE_URL` | Opt-in PostgreSQL backend for the Prisma schema; no client is installed yet. |
| `JOB_FEED_URL_<BOARD_CODE>` | Point a board at the feed it publishes, e.g. `JOB_FEED_URL_MIFOTRA`. Without it MIFOTRA reports that it has no readable public feed, and any other board reports it has no reader yet. Set it to a web page by mistake and the crawl says *not an RSS or Atom document* instead of reporting a healthy board with zero listings. |
| `JOB_CRAWL_INTERVAL_MINUTES` | How often the worker re-reads every board. Default 60; `0` switches the schedule off and leaves only the Jobs screen button. |
| `JOB_CRAWL_MAX_LISTINGS` | Ceiling on rows taken from one board per crawl. Default 60. |
| `JOB_CRAWL_TIMEOUT_MS` | How long one board may take to answer before the crawl records a failure and moves on. Default 15000. |
| `JOB_ON_DEMAND_CRAWL` | Whether a job question that finds the pool empty reads the boards itself before the answer is written. Default on. |
| `JOB_ON_DEMAND_BUDGET_MS` | How long that answer waits for the boards; boards that finish are already stored and the rest keep reading. Default 12000. |
| `JOB_ON_DEMAND_COOLDOWN_MS` | How long one process waits before attempting the boards again after an attempt. Default 300000. |
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
5. Send a message to the test number and watch for two effects before the reply arrives: the message
   is marked read, and WhatsApp shows "typing…". If the indicator never appears, check
   `WHATSAPP_GRAPH_VERSION` — versions below `v22.0` predate the typing indicator, so the ticks can
   arrive while the indicator never shows (Meta's exact behaviour on an older version has not been
   confirmed from this repository). A failure to set either is logged as `WHATSAPP_PRESENCE_FAILED`
   on the server and never costs the person their answer.

For testing without Meta credentials, use the **WhatsApp Simulator** screen. It builds a real webhook
payload and runs it through the same pipeline locally — it never dispatches anything to Meta or to a
phone number, and the screen labels the result as a local payload preview.

## API routes

| Route | Method | Function |
| --- | --- | --- |
| `/api/whatsapp/webhook` | GET, POST | Meta subscription handshake and signed inbound messages. |
| `/api/whatsapp/simulate` | POST | Inject a test message through the full pipeline. Needs an administrator token: the number becomes a real user record. |
| `/api/jobs` | GET, POST | Stored listings and board health. Both verbs need an administrator token — learners reach listings through the WhatsApp agent tool, and a crawl makes outbound requests and writes to the store. |
| `/api/marketplace`, `/api/study`, `/api/coding`, `/api/media`, `/api/users` | GET, POST | Console data feeds and module actions. Every one of these carries someone's profile, photo, lesson or message history, so both verbs require an administrator token. |
| `/api/agents`, `/api/conversations` | GET | Recorded agent runs and conversation history; administrator token. |
| `/api/services` | GET | The enabled services currently offered in the WhatsApp menu. |
| `/api/road-safety/catalog` | GET | Published lessons, road signs and practice questions. |
| `/api/road-safety/exam` | POST | Start, answer, resume, submit, review, report or report an inaccuracy on a learner's own attempt; the timer, the answer set and the score are server-side. |
| `/api/payments/order` | POST | Create a mobile money order for a service. |
| `/api/payments/proof` | POST | Upload the receipt screenshot against an order. |
| `/api/payments/webhook` | POST | Provider confirmation; requires `PAYMENT_WEBHOOK_SECRET` and a valid HMAC. |
| `/api/admin/login` | POST | Issue an admin bearer token. |
| `/api/admin/services` | GET, POST, PATCH, DELETE | Price, trial, cap, agent and menu visibility per service. |
| `/api/admin/road-safety` | GET, POST | Curriculum, road signs and exam papers, plus the academy controls: `SAVE_SETTINGS`, `REVIEW_APPROVE`, `REVIEW_REJECT`, `GENERATE_BATCH`, the review queue, the approved-source ledger and generation-run monitoring. |
| `/api/admin/payments` | GET, POST | Review queue: verify, reject, reconcile. |
| `/api/admin/payments/image` | GET | Serve a stored proof to the reviewer, token-gated. |
| `/api/admin/media/image` | GET | Serve one stored studio photo to the console, token-gated; 410 once retention deleted it. |
| `/api/admin/entitlements` | GET, POST | Live access list, manual grant, revocation. |
| `/api/admin/audit` | GET | Who changed what, including every access decision. |
| `/api/admin/maintenance` | POST | Retention sweep and queue drain. |
| `/api/health`, `/api/ready` | GET | Liveness and readiness, including store mode. Public so a deployment probe can read them; they carry configuration facts, never records. |
| `/api/tests` | GET | The automated suite. Needs an administrator token so no anonymous visitor can trigger a platform exercise. |

Every `/api/admin/*` route except `/api/admin/login` rejects a request without a valid bearer token,
and so does `POST /api/jobs`.

## Tests

```bash
npm test
npx tsx scripts/run-extension-tests.ts
```

51 checks cover the webhook challenge, invalid-token rejection, HMAC signature verification, event
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
orders, proofs and exam attempts surviving a restart, and job discovery against a stubbed transport: a
feed listing stored with the employer split from the title, the salary, the board category and markup-free
excerpt, a re-crawl that refreshes instead of duplicating, a card page read with its day-first deadline and
an expired posting marked expired, an unreadable board reporting its reason and storing nothing until
`JOB_FEED_URL_<CODE>` is set, an override that points at a page reporting that it is not a feed, a board
that answers 500 storing nothing, and a row with no link back refused. The Road Safety Academy checks
cover the verified-rule registry, generation that is gated before it can publish, adaptive difficulty
built from a learner's own answers and timings, fresh sets with exact and near-duplicate detection,
deterministic option shuffling that keeps the key correct, the server timer with autosave and
auto-submit, strict papers that withhold the key until submission, the six-part report and the tutor
grounding built from the learner's actual paper, learner inaccuracy reports draining the review queue,
and the administrator controls — approving an ungrounded item refused before the row is written, a
rejection that needs a written reason, out-of-range settings clamped on save, and a batch with no
provider recorded as blocked with nothing published. Presence and grounding add the rest: the read
receipt and typing payload with its Graph version floor, honoured override and malformed-value
fallback, the offline path that makes zero HTTP calls and answers `NOT_CONFIGURED`, a live call that
posts the receipt to the phone number ID, a Meta rejection returned as a failure with its reason
instead of thrown, the refresh interval kept inside Meta's ~25-second window, and an ordinary
tutoring turn that must see the live catalogue, board health and this person's own study and coding
rows while a second person's project never appears in the same snapshot. The reasoning layers add four
more: the research gate — an explicit lookup, a fact that changes and a subject with nothing stored each
say search, while the person's own records, the academy and a platform that already holds the answer say
no, and a provider that cannot browse is skipped rather than answering from memory — model-decided
categories with a fabricated category refused and the keyword routing kept, per-person memory with
secret-shaped values refused and one person's note never reaching another's prompt, and the repetition
gate rewriting a reply that matches what this person already saw while holding the facts still. Every one
of those turns runs against a stubbed OpenAI transport: **no Google search, memory write or rewrite has
ever been billed from this repository**, because no provider key is set here. Confirm one searched reply,
one remembered fact and one rewritten answer on a deployed server with a real key before treating them as
proven, exactly as with the presence layer above.
The suite never touches the network — the boards are answered by a stub — so it cannot hammer a real site.
The same suite runs from the **Run Test Suite**
button in the console topbar.

## Database

`prisma/schema.prisma` defines the normalized PostgreSQL models spanning users, conversations and
memory, jobs and applications, marketplace profiles and matches, media and image tasks, coding
projects, study sessions and quizzes, agent runs and tool calls, webhook events, scheduled tasks,
admin users, audit logs and usage records, plus the commercial and academy tables added by
`prisma/migrations/20261021000000_commercial_and_road_safety/`: service catalogue, entitlements,
trial grants, payment orders, payment proofs, road safety modules, lessons, signs, questions,
citations, exam templates, exam attempts and lesson progress — and the exam-engine columns and tables
added by `prisma/migrations/20261022000000_road_safety_exam_engine/` (rule links, multi-answer keys,
fingerprints, hold reasons, learner reports, autosave and server timer on attempts, strict papers,
`QuestionGenerationRun`, `RoadSafetySettings`). `lib/db/prisma-readiness.ts` reports whether Prisma is
installed and whether those migrations have been applied, so `/api/ready` states `productionDatabase`
honestly instead of claiming a connection it does not have. Neither academy migration has been run
from this development machine — no PostgreSQL instance was reachable — so until
`npx prisma migrate deploy` succeeds on the host, the file-backed store under `AGUKA_DATA_DIR` is what
the running application actually reads and writes.

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
8. The crawl asks the boards on their own public pages, stores a snippet and always answers with the
   link back. Check each board's terms before lowering `JOB_CRAWL_INTERVAL_MINUTES` below the default
   hour, and set `JOB_FEED_URL_MIFOTRA` if the ministry publishes a feed you are permitted to read.

## Further reading

- [Setup guide](docs/SETUP_GUIDE.md) — architecture detail, Meta and migration walkthroughs.
- [Extension changelog](docs/CHANGELOG_EXTENSIONS.md) — how the security, admin and retention modules attach.

---

Powered by IRAGUHA Vincent

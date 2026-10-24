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
- `lib/maintenance/retention.ts` + `POST /api/admin/maintenance` — retention sweep that deletes expired
  receipt and studio-photo files as well as flagging the records, plus queue drain.
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
  Superseded below once a real render path existed: the refusal now happens only when no image
  provider is configured, and the order of the gates changed.

## Real image production

- `lib/ai/bilingual-router.ts` — `requestsImageProduction()` is now a deterministic gate rather than a
  phrase list. Live traffic showed two ways past it: Kinyarwanda conjugates the verb into the request
  (`unkore ifoto`, `ukureho background`), and English slips an article between verb and noun
  (`remove **the** background`) — the second one filed a retouch request as a payment receipt. Markers
  are now compiled into patterns whose word gaps accept articles and possessives, a Kinyarwanda rule
  matches a picture token plus a production stem (`koresh*` is stripped first so "nkoresha" is not
  read as "nkore"), and the negatives are pinned: a passport-standards question, `nikora iki ku ifoto`
  and `how do I make images responsive in CSS?` must stay unrouted through this gate.
- `lib/whatsapp/inbound.ts` — an uploaded photo's caption is the message just written, so it sets the
  reply language instead of a preference stored by an earlier turn.

- `lib/images/provider.ts` — `resolveImageCapability()` picks OpenAI (`OPENAI_IMAGE_MODEL`, default
  `gpt-image-1`) when a usable key is present and falls back to Gemini
  (`GEMINI_IMAGE_MODEL`, default `gemini-2.5-flash-image`); with neither it returns
  `configured: false` and the reason. `usableKey()` rejects the shipped `.env.example` placeholders so
  a copied file cannot silently enable paid calls. `requestImage()` has a 75-second timeout, caps a
  reference image at 8 MB and logs `IMAGE_GENERATION_FAILED` with the provider's message instead of
  forwarding it.
- `lib/images/spec.ts` — the 35:45 maths (`passportWidthPx`, `passportHeightPx`,
  `imageRetentionDays`, all clamped) split out of the studio so `lib/db/repository.ts` can report
  health without loading `sharp`, and so the repository→studio→repository cycle stays closed.
- `lib/images/studio.ts` — `runImageStudio()` renders, crops with `sharp` (a failure logs
  `IMAGE_CROP_FAILED` rather than shipping the provider's own aspect ratio), writes the JPEG through
  `durableStore.saveBinary`, records a `MediaTask` with the retention window and returns an
  `ImageAttachment`. A text-only request is prompted as a synthetic portrait, explicitly *never a
  likeness of a real individual*; a retouch keeps the identity of the person in the reference photo,
  and the reference itself is never written to disk — the task records
  `input:person-uploaded-photo-not-stored`.
- `lib/ai/bilingual-router.ts` — image production is now step 3, **after** the entitlement gate, so a
  locked account cannot spend a render. Three outcomes: no provider → `IMAGE_STUDIO_NOT_CONFIGURED`
  with the standards guidance and zero usage; provider failure → `IMAGE_STUDIO_FAILED`, a run recorded
  as `FAILED` with a redacted trace, apology in the writer's language, no usage consumed; success →
  usage consumed, `IMAGE_STUDIO_PRODUCED` recorded with the `image_studio_render` tool trace, and the
  attachment returned on `AgentExecutionResult.image`.
- `lib/whatsapp/inbound.ts` — `handleIncomingImage()` now reads the inbound caption: a caption that
  asks for production retouches the uploaded photo through the studio (capability gate, then access
  gate, then render), anything else keeps the existing payment-proof flow. Proof uploads are
  unchanged.
- `lib/whatsapp/gateway.ts` — the outgoing union gained `type: 'image'`; `uploadWhatsAppMedia()`
  posts to `/{phoneNumberId}/media` behind guards for missing credentials, zero bytes and Meta's 5 MB
  image cap, and `buildImageMessage()` caps the caption at 1024 characters.
- `app/api/whatsapp/webhook/route.ts` — reads the stored bytes back and sends an image message. If the
  upload fails the person still receives the text answer with a plain note that the file could not be
  attached, and `IMAGE_DELIVERY_FAILED` is logged. `POST /api/whatsapp/simulate` accepts
  `imageBase64` + `imageCaption` for the same path and returns only the attachment metadata — the
  response never carries image bytes.
- `app/api/admin/media/image/route.ts` — `GET ?taskId=` streams one stored render to an authenticated
  administrator (Bearer token, so the console fetches it through `adminBlobUrl` and shows an object
  URL rather than a public link). `410` once retention deleted the file, `404` for a task with no
  output. **Media** shows a *View photo* button only when a file exists, and says `purged` or
  *no output* otherwise instead of a broken thumbnail.
- `lib/maintenance/retention.ts` — the sweep now deletes the expired file
  (`durableStore.deleteBinary`) and rewrites `processedUrl` as `purged:<key>`; the report distinguishes
  records flagged from files actually removed.
- `lib/db/repository.ts`, `app/api/ready/route.ts`, `lib/config/index.ts`,
  `components/screens/settings-screen.tsx` — `/api/health` publishes
  `imageStudio { configured, provider, mode, model, output, retentionDays }`, and **Settings** shows
  which provider a render would use. `/api/ready` reports the studio as `PASS` or `NOT_CONFIGURED`
  without gating readiness: an unconfigured studio must not turn a working WhatsApp deployment into a
  503.
- `package.json` — `sharp` is now a declared runtime dependency (previously it was only reachable
  through a transitive install). The WhatsApp menu label stays *Photo Standards Guidance /
  Amabwiriza y'ifoto*: whether the service can also render depends on server keys an administrator may
  not have set, and a label promising a photo that the server then refuses would be the worse error.
  Rename it in **Services & Pricing** once the studio is confirmed live on that deployment.
- Tests `test-image-studio-gate`, `test-image-provider-selection`, `test-image-output-contract`,
  `test-media-retention-deletes-files` and `test-image-delivery-payload` (the suite stood at 31 checks
  once these were added). The checks
  that could reach a provider or Meta run inside `withEnv()`, which removes `OPENAI_API_KEY`,
  `GEMINI_API_KEY` and the WhatsApp credentials for the duration and restores them after, so the suite
  cannot spend money or post to a live number from a developer's real `.env`; provider selection is
  asserted against an injected env object, never the process one.

## Text provider chain: Gemini first, OpenAI as the rescue

The symptom was a service that answered for a while and then replied that it could not reply.
One provider, no retry, no handover, and an empty or blocked candidate accepted as a success —
plus the Gemini SDK's own retry policy (five attempts, up to a 60-second delay) holding the
Meta webhook open past the host timeout, so the failure the person saw was a stall.

- `lib/ai/provider-adapter.ts` — `runTextChain()` asks each provider in order, retrying only a
  `transient` outcome (408/425/429/500/502/503/504/529, a dropped fetch, a timeout) once with
  jittered backoff, and moving to the rescue immediately for `permanent` (401/403/404/451),
  `blocked` or `empty`. `classifyStatus()`/`classifyThrown()` make that decision from the SDK's
  error as well as from a status code, so a "Please retry in 4.9s" is honoured instead of
  guessed. Two attempts per provider, a 12-second chain budget, 20 seconds on any single call.
  Every attempt is recorded as one redacted line (`provider:model #n outcome (status): message`)
  and `AllTextProvidersFailed` carries them; `fellBack` is true only when a *different* provider
  answered, so a retry that lands on Gemini is not reported as a rescue.
- `lib/ai/provider-adapter.ts` — `OpenAITextProvider` posts to the chat completions endpoint with
  `OPENAI_TEXT_MODEL` (default `gpt-4o`), sends the system instruction as a `system` message, uses
  `response_format: {type:'json_object'}` when the caller wants JSON, aborts at 20 seconds, keeps
  the provider's token usage, and refuses the `.env.example` placeholders. `getTextProviders()`
  is rebuilt per call from the keys that exist, so an operator who fixes the environment does not
  need a restart.
- `lib/gemini.ts` — the client now sets `httpOptions.timeout` and
  `retryOptions: { attempts: 1 }`. Retry belongs to the chain; the SDK's default was the reason a
  single blip could cost a minute. `geminiApiKey()` is exported and shared, rejecting the shipped
  placeholders and `MY_GEMINI_API_KEY`.
- `lib/ai/bilingual-router.ts`, `app/api/coding/route.ts`, `app/api/study/route.ts` — all three
  call `generateText()` instead of one provider object. A rescue answer is labelled
  `<model> (rescue)` on the run record. When the chain is not configured the reply names both
  variables; when every provider failed the reply says no answer arrived *and nothing was counted
  against your usage*, in the language the person wrote in. Provider error text stays in
  `AI_GENERATION_FAILED` / `AI_PROVIDER_FELLED_BACK` logs with the chain order and the attempt
  lines — it is never forwarded to WhatsApp, and usage is consumed only on `COMPLETED`.
- `lib/db/repository.ts`, `lib/types/index.ts`, `app/api/ready/route.ts`, `lib/config/index.ts`,
  `components/screens/settings-screen.tsx`, `components/screens/overview-dashboard.tsx` — health
  publishes `textChain { configured, order, rescueConfigured, attemptsPerProvider, budgetMs }`,
  `/api/ready` carries it in the AI check, and **Settings** gained a Text Providers panel showing
  who answers, who is the rescue and whether the rescue is armed at all. The dashboard tile prints
  the live chain (`gemini-2.5-flash → gpt-4o`). Configuration validation warns when only one text
  provider is configured: a server with no rescue has one bad API away from looking broken.
- Tests `test-text-provider-chain` and `test-text-rescue-and-honest-refusal` (33 checks total).
  Chain mechanics run against injected scripted providers — no network. The HTTP path uses a
  stubbed `fetch` scoped to `api.openai.com` (anything else falls through to the real client) to
  prove a 429 is retried once and then reported as an outage, and that a successful rescue keeps
  its token count and sends the system message plus the JSON format. Chain *shape* is asserted
  against a scrubbed copy of the environment, so a key in a developer's real `.env` cannot change
  the verdict, and the keyless turn runs inside `withEnv()`. Nothing in the suite reaches a
  provider or a live number.
- Not yet proven here: a real paid rescue call. This machine has no `OPENAI_API_KEY` or
  `GEMINI_API_KEY`, so the chain is verified against stubbed HTTP and scripted providers only.
  Check `AI_PROVIDER_FELLED_BACK` in the server log after deploy to confirm the handover works
  against the live APIs.

## Job board discovery: real crawls, honest refusals

The Jobs screen used to say *No crawl wired yet* and the listing pool stayed empty. Boards are now read
for real, and a board that cannot be read says why instead of being filled with invented postings.

- `lib/jobs/feed.ts` — the transport and the parser. `fetchDocument()` aborts at `JOB_CRAWL_TIMEOUT_MS`
  (default 15000), caps the reply at 2 MB, and sends an identifying `AgukaAIJobDiscovery/1.0` User-Agent;
  a non-2xx answer becomes a `SourceFetchError` carrying the board's own status, so the failure the admin
  reads is the failure that happened. `parseFeed()` handles RSS 2.0 `<item>` and Atom `<entry>` without an
  XML dependency, merges the block's attributes, and keeps `guid`/`url` as the posting id. `stripTags()`
  decodes entities *before* removing markup — feed bodies arrive escaped, some of them twice (`&amp;nbsp;`) —
  and repeats until the text settles, so no escaped tag or `&nbsp;` survives into a stored excerpt.
  `toIsoDate()` reads day-first `DD-MM-YYYY` because that is what Rwandan boards print.
- `lib/jobs/connectors/` — one reader per page shape. `base-connector.ts` adds the `JOB_FEED_URL_<CODE>`
  operator override and derives health from the last real attempt. `feed-connector.ts` splits
  `Employer: Title` headings, pulls the salary range and the board's category, and stores a
  ≤320-character excerpt rather than the advertisement. `jobinrwanda-connector.ts` reads the server-rendered
  cards on `/jobs/all`, keeps the seniority line and the badge as data, and refuses a page that yields no
  cards. `mifotra-connector.ts` states the refusal: the portal answers an empty JavaScript shell and
  publishes no feed, sitemap or documented listings API, so reaching it would mean reverse-engineering a
  private government endpoint. It throws `CONFIG`, which the crawler records as `NO_PUBLIC_FEED`, and it
  crawls the moment `JOB_FEED_URL_MIFOTRA` is set.
- `lib/jobs/crawler.ts` — `crawlSource()` normalises every raw row through `normalizeJobListing()`, which
  throws on a row with no `http…` `sourceUrl`: an ungroundable listing is dropped and counted, never
  invented. Duplicate postings collapse, each surviving row upserts on the board's own posting id so an
  hourly pass refreshes rather than duplicates, and `finish()` writes health status, timing, active count
  and a note that explains the gap between rows read and rows stored. `crawlAllSources()` takes an
  `onResult` callback so a slow board cannot hide the results already collected.
- `lib/db/repository.ts`, `lib/types/index.ts` — `recordSourceCrawl()`, `countActiveJobsForSource()` and
  `upsertCrawledJob()` sit behind a `JobCrawlStore` interface so the crawler never imports the repository.
  Board identity comes from the program and crawl history from disk: `hydrateState()` overlays stored
  health, timing and notes onto the declared boards, and `lastCrawlStatus`/`lastCrawlNote` are new optional
  fields — no Prisma migration, because nothing writes to the SQL tables yet. Expired postings are stored
  as `EXPIRED` and excluded from the active count.
- `lib/jobs/normalizer.ts` — deadlines now go through `toIsoDate()`, and the board's own categories are
  merged into `tags` instead of being dropped on the floor.
- `lib/jobs/schedule.ts`, `scripts/worker.ts` — the worker crawls every board on start and again every
  `JOB_CRAWL_INTERVAL_MINUTES` (default 60, `0` = button only), logs each board as it finishes, and skips a
  tick that arrives while a crawl is still running. The schedule lives in its own module so it can be
  started and stopped without a Redis connection.
- `app/api/jobs/route.ts`, `lib/queue/jobs.ts` — `POST /api/jobs` is now administrator-gated, because it
  makes outbound requests and writes to the store; `CRAWL_SOURCE` returns the full result and
  `CRAWL_JOB_SOURCES` is the queue-side name for the whole sweep. `GET` also returns the live crawl
  configuration so the screen can state the schedule it is actually running.
- `app/api/ready/route.ts`, `lib/config/index.ts` — `jobDiscoveryConfig()` publishes interval, timeout,
  per-board cap and every `JOB_FEED_URL_*` override; `/api/ready` adds a `jobDiscovery` check reporting
  `SCHEDULED` or `MANUAL_ONLY` plus each board's health and last note.
- `components/screens/jobs-screen.tsx`, `settings-screen.tsx`, `overview-dashboard.tsx`,
  `agents-screen.tsx`, `coding-screen.tsx` — Jobs gained an `AdminGate`, a *Crawl now* button per board,
  the board's own note under its card and a result banner with real counts; Settings gained a Job Board
  Discovery panel; the Overview board list shows last-crawled time and note. Copy that promised a crawler
  which did not exist is gone.
- Test `test-job-board-crawler` (the suite's 34th check) runs entirely against a stubbed transport that
  answers with saved feed and card-page fixtures, so the suite cannot touch a real board. It asserts
  the employer
  split, salary, category and markup-free excerpt of a feed row; `0 new / 2 refreshed` on the second pass;
  a day-first deadline parsed and an expired posting excluded from the active count; MIFOTRA refusing and
  storing nothing until its override is set; a board answering 500 storing nothing; and the ungrounded row
  throwing.
- Live proof on this machine: one sweep stored 60 Job in Rwanda cards and 56 We Work Remotely feed rows,
  the second sweep refreshed all 116 and added nothing, and the scratch store reopened in a new process
  with every listing and every board note intact. MIFOTRA reported `NO_PUBLIC_FEED` in both runs.
- Not yet proven here: the schedule running inside the deployed worker. `npm run worker` refuses to start
  without a `REDIS_URL`, and this machine has none, so `startJobSourceSchedule()` was exercised directly
  — startup sweep plus a 60-second tick — and not through a hosted BullMQ process. Confirm the
  `crawl(startup)` and `crawl(timer)` lines in the worker log after deploy.

## A feed override that pointed at a page passed as a healthy board

Checked against the live deployment after the crawler shipped. `/api/ready` reported
`feedOverrides: { MIFOTRA: "https://recruitment.mifotra.gov.rw/" }` — the portal's home page, not a feed.
Reproduced locally against that exact value: the crawl returned `OK` / `0 listings read from
https://recruitment.mifotra.gov.rw in 463ms` and recorded the board `HEALTHY`. The one thing the refusal
exists to say — that this board cannot be read — had been replaced by a green tick next to an empty list.

- `lib/jobs/feed.ts` — `looksLikeFeed()` recognises only an RSS, Atom or RDF root in the first 2 KiB of the
  document. A page mentioning the word "feed" in its markup does not count.
- `lib/jobs/connectors/feed-connector.ts` — when a configured target yields no items **and** is not a feed
  document, `fetchRawJobs()` throws `CONFIG` naming the URL and the status it answered with, instead of
  returning an empty list. `failureKind()` maps that to `NO_PUBLIC_FEED`, so an operator's typo reads as a
  configuration fault to fix, never as a board with nothing on it. A genuinely empty `<rss>` document still
  crawls `OK` with zero rows — that distinction is what the check preserves.
- The MIFOTRA refusal note now reads
  `https://recruitment.mifotra.gov.rw/ answered 200 but is not an RSS or Atom document, so it has no
  listings this platform can read. Set JOB_FEED_URL_MIFOTRA to the feed address the board publishes, not to
  a page.` The board stays `WARNING` either way. The board name is left out of the note because every
  surface that shows it already labels the board — the Jobs banner renders `MIFOTRA E-Recruitment Portal:`
  in front of the note, so a note that began with the same name printed it twice.
- `test-job-board-crawler` (still the suite's 34th check) now crawls the portal home page through the stub
  and asserts `NO_PUBLIC_FEED`, zero rows read, no new row in the store, `WARNING` health, and — the other
  half — that the empty design-category feed still counts as a successful read.
- Action for the deployment: clear `JOB_FEED_URL_MIFOTRA` on the host (or set it to a real feed if the
  ministry publishes one). Until then Jobs shows MIFOTRA refusing, which is the truth, rather than the
  old misleading green state the pre-fix build would have produced.

## Personal data routes closed to everyone but an administrator

The audit that opened the production programme found the console's data feeds wide open. Live probes
against the deployed build answered `200` for `GET /api/users`, `/api/conversations`, `/api/media`,
`/api/coding`, `/api/jobs` and `/api/agents` with no token at all, and `POST /api/users` would run
`EXPORT_DATA` or `DELETE_DATA` for any `userId` handed to it. Authorization had been treated as a UI
concern — the screens were hidden behind a sidebar entry, the routes underneath were not.

- `app/api/users`, `app/api/conversations`, `app/api/media`, `app/api/marketplace`, `app/api/jobs`,
  `app/api/agents`, `app/api/tests`, `app/api/coding`, `app/api/study`,
  `app/api/whatsapp/simulate` — every verb on each now starts with `requireAdmin(request)` and answers
  `401 {"error":"Unauthorized"}` before reading the store, parsing a body, or reaching a provider. The
  rule applied is the one the data forces: a route that returns or changes another person's profile,
  conversation, receipt, portrait or lesson is an administrator endpoint. `POST /api/coding` and
  `POST /api/study` also spend provider tokens and file the result against a `userId` from the request,
  and `POST /api/whatsapp/simulate` creates a real user record from any phone number it is given.
- Still public, deliberately: `/api/health` and `/api/ready` (configuration facts for a deployment
  probe), `/api/services` and `/api/road-safety/*` (the catalogue and the learner's own exam attempt,
  which checks ownership and entitlement server-side), `/api/payments/order`, `/api/payments/proof`
  (a payer submits a receipt against their own number; an admin session is the alternative, not the
  requirement), and both Meta webhooks, which authenticate by signature and token instead of session.
- `lib/client/admin-session.ts` was already attaching the bearer token for the Jobs screen. The
  remaining console screens — users and consent, conversations, coding, study, media, marketplace,
  agents, overview and the test-suite modal — now go through `adminFetch` too, so the token travels
  with each request and a `401` clears the stale session everywhere at once. Each screen shows the
  `AdminGate` sign-in card, and a refusal states what was refused instead of looking like an empty store.
- `test-dashboard-route-authorization` is the suite's 35th check. It calls all fifteen guarded handlers
  twice — no token, then a token signed with a different secret — and asserts `401` with the plain
  `Unauthorized` body both times. When `ADMIN_JWT_SECRET` is present it also issues a genuine session and
  requires `GET /api/users` to answer `200`, so the gate is proven open and shut, not merely shut. The
  `POST` bodies it sends are intentionally invalid: if a guard ever regresses, the route answers `400`
  before it can spend a token, crawl a board, or write a record.
- Verified locally over HTTP, not only in-process: all ten routes returned `401 {"error":"Unauthorized"}`
  to an anonymous `GET`, all seven write routes returned `401` to an anonymous `POST`, and
  `/api/health`, `/api/services` and `/api/road-safety/catalog` stayed reachable. The suite passes 35/35
  with and without an admin secret, `tsc --noEmit` and `eslint` are clean, and `next build` succeeds.
- Not yet proven from this machine: the signed-in dashboard in a real browser, because that needs the
  deployment's admin credentials. Open the console, sign in on any gated screen, and confirm each list
  loads. `/api/tests` is now gated, so the suite is reachable only from the signed-in modal.

## Road Safety Academy: an exam engine that cannot invent the law

The academy used to answer a learner with whatever the bank already held, which meant "Mpa ikizamini
gishya" produced the same questions in a different order and the model was never asked for anything.
Building the requested exam engine risked the opposite failure: a language model confidently inventing
a speed limit, a fine, or the meaning of a sign. The module is therefore built around a registry and a
gate, not around a prompt.

- `lib/road-safety/verified-facts.ts` holds every rule the academy is willing to teach, one row per
  rule, each with the instrument and article it came from, its `legalBasis`, a numeric value and unit
  where the rule has one, and its citation. Rules that were searched for and not found are kept with
  `generationAllowed: false` — the gap is documented, and no question may be built on it. The source
  ledger (`lib/road-safety/settings.ts`) records what each reference permits: quizblog.rw is stored as
  `DISCOVERY_REFERENCE_ONLY` with `automatedAccess: NOT_PERMITTED`, because inspected on 2026-10-22 it
  serves the same single-page shell on every path including `/robots.txt`, states no crawl policy, and
  exposes no readable question text without running its own JavaScript. Nothing was harvested from it
  and no wording was copied; it told us which topics and formats learners expect, and the law itself
  comes from the gazette copies.
- `lib/road-safety/generator.ts` asks the text chain for questions built from named registry rows only,
  and `lib/road-safety/verification.ts` decides publication. The answer must match the rule's number
  and unit, the item must cite a source, carry a `legalVerifiedAt` date and link to a registry row, and
  it must survive fingerprint and token-set duplicate checks against the whole bank. Anything else is
  stored `NEEDS_REVIEW` with the reason written on it. `publicationBlockers()` is the same function the
  administrator's approve button calls, so a human cannot publish what the machine refused, and the
  check runs **before** the row is written — an earlier version refused after saving, which would have
  left the item published while reporting a refusal.
- Learner-facing: `LEARN`, `PRACTICE` and `MOCK_EXAM` on `POST /api/road-safety/exam`, with the clock
  (`deadlineAt`), autosaved answers, auto-submission and grading all server-side; option order is
  shuffled per attempt with a key derived from `sha256(attemptId|questionId)`, so the correct answer
  stays correct while the letter changes; difficulty moves with the learner's own accuracy and response
  time; a fresh set avoids what that learner already answered; `REPORT` returns the six-part post-paper
  report and `REPORT_ISSUE` files an inaccuracy report that pulls the item out of papers and into the
  review queue. `lib/road-safety/tutor-context.ts` grounds the conversational agent in the learner's
  own last finished paper, their weak topics, the cited rule and the sign register, so "Kuki igisubizo
  cyanjye kitari cyo?" is answered about the question they actually missed — and says so plainly when
  there is no paper on record. All history is keyed by `userId`.
- Every paper, reply and screen labels the test a practice simulation. The instruments give the theory
  test 60 marks and a 60 % pass mark; none states a duration, so `exam.mockMinutes` is an Aguka setting
  and no template claims the official examination's format, length or pass mark.
- Console: the Road Safety screen gained **Review queue** (hold reasons, unresolved learner reports,
  publish / reject-with-written-reason / correct) and **Controls & monitoring** (refresh interval,
  languages, generation limits and token budget, paper sizes, the approved-source ledger with
  permission / robots / automated-access / reuse columns, a grounded batch runner, and a generation-run
  table showing provider, model, tokens, latency and the failure reason). The question editor now links
  an item to registry rules and stamps its legal review date, which is what makes an administrator
  authoring a question able to publish it at all. `contentRefreshDays` is a live rule, not decoration:
  published content past it is counted as overdue.
- Persistence: `prisma/schema.prisma` gained the academy's real shape and
  `prisma/migrations/20261022000000_road_safety_exam_engine/migration.sql` is the additive SQL for it,
  checked against `prisma migrate diff` output. **It has not been applied**: no PostgreSQL was
  reachable from this machine, so the file-backed store under `AGUKA_DATA_DIR` remains what the running
  app reads. Run `npx prisma migrate deploy` and `npx prisma migrate status` on the host before
  trusting the live tables. `npx prisma` on PATH resolves to the 8.0.0 release candidate, whose command
  surface differs — use the pinned `npx --yes prisma@6.19.3`.
- Tests: the suite is at 45. New checks cover the registry and the gate, generation that cannot publish
  what it cannot defend, adaptive difficulty, fresh sets with duplicate detection, the timer with
  autosave and auto-submit, strict papers withholding the key until submission, the six-part report,
  tutor grounding, learner reports draining the queue, and the admin controls — approve-before-grounding
  refused, reject-without-reason refused, out-of-range settings clamped, and a batch with no provider
  recorded as `NO_PROVIDER` with nothing published. `test-road-safety-admin-controls` asserts the whole
  admin read shape the two new tabs render from. `GET`/`POST /api/admin/road-safety` were added to the
  authorization check, which had never covered the curriculum-writing route. The batch test deletes and
  restores `GEMINI_API_KEY`/`OPENAI_API_KEY` around the call, so it stays hermetic on a machine that has
  keys and on one that has none.
- Not proven from this machine, and not claimed: a provider has never been paid to generate an academy
  question here, so the happy path of real generated wording is unverified end to end; the two new tabs
  have not been driven in a signed-in browser (form-filling needs an interactive approval this run
  could not get), so their layout is verified by `tsc`, by the route contract in test 45, and by a clean
  Next.js compile of the screen, not by an eye on the page; there is still no administrator path to
  upload a photographed sign, so `RoadSign.imageKey` stays empty and no sign-identification question can
  be published; French is not implemented, because no suitable configured provider path exists yet; and
  the learner exam route still identifies the learner from the `userId`/phone in the request body, which
  is an ownership check, not authentication.

## WhatsApp presence, and an agent that can see the whole backend

Reported in Kinyarwanda: *"kosora ku mikorere ya whatsapp yerekane ko yakiriye utumwa, ko irimo
igaragaze ko irimo kwandika kandi uyihuze na backend yose kuburyo itazajya ivuga ko ntacyo ifite kandi
gihari"* — show that a message was received, show that it is being typed, and connect the agent to the
whole backend so it never claims it has nothing when the data exists. Two separate defects were behind
it, and one of them was worse than it looked.

- `lib/whatsapp/gateway.ts` now builds the Graph URL from `whatsappGraphVersion()` instead of three
  hardcoded `v21.0` literals, defaulting to `v23.0` and honouring `WHATSAPP_GRAPH_VERSION`. It accepts
  only a well-formed `vN.M`, so a malformed override falls back rather than producing a URL Meta will
  not recognise. Typing indicators need v22.0 or newer, which the version floor encodes as a test.
- `markWhatsAppMessageRead(messageId, { typing })` posts `status: read` with
  `typing_indicator: { type: 'text' }` for the inbound `wamid`, and `beginWhatsAppTyping()` starts that
  immediately and repeats it every 20 seconds, because Meta dismisses the indicator after roughly 25 and
  a long generation would otherwise leave the person staring at nothing. Presence is deliberately
  unable to cost anyone their answer: with no credentials the call makes zero HTTP requests and reports
  `NOT_CONFIGURED`, and a Meta rejection resolves as `{ ok: false }` carrying the provider's own reason,
  logged as `WHATSAPP_PRESENCE_FAILED` and never thrown. The webhook fires it off and carries on.
- **The real defect was in the prompt, not the gateway.** `executeAgent` assembled platform data for
  only three of the eight agent types, so a `STUDY_TUTOR`, `CODING_AGENT`, `CAREER_ASSISTANT` or
  `ROUTER` turn reached the model with an empty data block — and conversation history was never in the
  prompt at all, an audit defect from earlier in this programme. An agent asked about a service, a
  listing, a photo or a payment it had been told nothing about could only say it had nothing. That was
  true even when the row existed.
- `lib/ai/platform-context.ts` replaces that with one snapshot for every turn: live catalogue, runtime
  capability facts (provider chain order, whether WhatsApp and the studio are configured, the manual
  payment rule), this person's account / entitlement / latest payment order, verified listings with
  board health, the talent marketplace, this person's own study, coding and photo rows, road-safety
  content totals with their own progress and open paper, and the last six messages plus stored memories.
  Each block records a tool call, so the Agents screen trace is the truth about what the model was
  shown. `PLATFORM_DATA_RULES` goes into the system prompt with it and says, in terms, that the snapshot
  is the only source of facts, that a section reading NONE or NOT CONFIGURED must be reported plainly
  with the nearest real alternative offered, and that nothing may be invented.
- Isolation is enforced in code rather than by wording: `getStudySessions()`, `getCodingTasks()` and
  `getMediaTasks()` return every user's rows, so the snapshot filters on `userId` before it formats
  anything. The marketplace block prints titles and districts only — never another person's name or
  phone number.
- `app/api/whatsapp/webhook/route.ts` was restructured at the same time, which closed a pre-existing
  bug: `markMessageProcessed(id)` ran *before* the message was handled, so any throw lost the message
  for good. Each message now goes through an async `processInboundMessage()` whose `finally` stops the
  typing heartbeat, and the id is only burned once the handler has run.
- Tests: the suite is at 47. `test-whatsapp-read-receipt-and-typing` asserts the payload shape, the
  version floor, an honoured override and a malformed one, the no-credentials path making zero requests,
  a live call hitting `<phoneNumberId>/messages`, a 400 `(#131000)` returned as a failure with its
  reason, and the refresh staying inside the 25-second window. It runs with `WHATSAPP_*` scrubbed and a
  stubbed `globalThis.fetch`, so nothing can reach Meta or a real number.
  `test-agent-grounded-in-whole-backend` creates two people, gives each a coding project, and requires
  the tutoring turn to name every live menu service, the board status, the published-content totals, the
  latest payment order and this person's own rows — while the other person's project title never appears.
- Still not proven, and not claimed: **the typing-indicator contract was never checked against Meta's
  documentation during this session** — web access was unavailable — so the payload rests on the model's
  knowledge of the Cloud API and must be confirmed against the current reference and, above all, against
  a real test number before anyone relies on seeing "typing…". No credentials exist on this machine, so
  no live send, receipt or indicator has ever been made from it. What the suite proves is the shape, the
  guards and the offline behaviour; the visual result on a phone is still an unverified claim.

## Research, category routing, per-person memory and reply variety

The complaint this closes was that the assistant "answers the same thing, does not think, and does not
look anything up". Each of those is now a server-side gate rather than an instruction in a prompt,
because a model that is only *asked* to research, vary or remember either does not, or says it did.

- `lib/ai/provider-adapter.ts` grew the transport for a searched turn. `GenerateOptions.search` puts
  `google_search` in the Gemini `generateContent` config and reads the returned
  `groundingMetadata.groundingChunks[].web` into `{ title, url }` sources plus the queries actually
  run; the OpenAI transport reads the same shape out of `choices[0].message.annotations[].url_citation`
  and answers on `OPENAI_SEARCH_MODEL` — a model the operator has named as search-capable — with the
  sampling temperature removed, because a browsed answer is not a creative-writing task. A searched
  turn is never handed to a provider that cannot browse: `runTextChain` skips it with
  `skipped — no web search capability` in the attempt log instead of letting remembered text arrive
  labelled as research. `chainSummary()` now reports `webSearchConfigured` and `webSearchProvider`,
  and `AI_WEB_SEARCH=false` disables lookups without touching ordinary replies, since Google bills per
  search.
- `lib/ai/research.ts` is the gate. `needsWebSearch(message, agentType, snapshot)` decides from the
  message and from what the snapshot actually holds: an explicit lookup, a fact that changes over time,
  or a subject with nothing stored says search; the person's own records, the Road Safety Academy and
  a platform that already holds the answer say no, each with a recorded reason. The academy is excluded
  on purpose — a web page stating a wrong speed limit is worse than no answer, so Rwandan traffic law
  may only come from the verified registry. When a search was requested and did not happen, the reply
  carries `SEARCH_UNAVAILABLE` instead of reading as if it had been checked; pages that were read are
  printed as `Sources:` / `Inkomoko:`, capped at three, URLs exactly as the provider returned them.
- `lib/ai/intent.ts` decides *which* agent answers when the words do not. `classifyIntent` now returns
  how many categories the keywords pointed at, and exactly one is the only confident answer: zero or
  several triggers `classifyAgentWithModel`, whose reply counts only if it names one of the eight
  agents this build has (`parseAgentChoice` folds `study tutor` and `Image-Studio` into the enum, and
  refuses anything else). A menu pick is never overridden — that is the person naming their own
  category, and the service they were just charged for — nor is a reply under eight characters, nor
  the academy, whose open exam paper is stateful and would be lost mid-paper. Every failure keeps the
  keyword routing.
- `lib/ai/memory.ts` + `repo.rememberInConversation()` give each person a memory that outlives the
  last six messages. After an answered turn one JSON call extracts durable facts, and the shape is
  validated in code: `snake_case` keys, values clipped to 120 characters, four per turn and sixteen per
  person, and a refusal of anything secret-shaped — a key matching token/password/api/key/pin/card, a
  value matching a provider-token or JWT shape, or a value containing seven or more consecutive
  digits, which is where a phone number, an ID number and a card number all live. A memory written
  wrong follows a person forever, so a memory that fails to write is the acceptable error. Facts are
  stored on the conversation, so they are read back into that person's later prompts and into nobody
  else's; `AI_MEMORY_EXTRACT=false` turns the feature off.
- `lib/ai/variety.ts` is the anti-repetition layer, which is half of the complaint. `SAMPLING_BY_AGENT`
  gives each agent its own temperature (0.3 where a wrong figure costs someone, 0.85 for coaching that
  reads badly when it is rote). `pickWindow()` rotates which stored listings reach the model, offset by
  the number of assistant replies already in the conversation — no extra state, and it survives a
  restart — so a fourth "shaka akazi" shows the next slice instead of the same five rows while forty
  more sit in the store, and the snapshot now says how many are stored in total. `isRepeatOf()` compares
  a finished answer with the last two this person saw (Jaccard over word sets, so a reshuffled reply is
  still caught) and, at 0.72 overlap or more, the turn is re-asked exactly once with the earlier answer
  in front of the model and the facts pinned; if the second attempt still matches or fails, the first
  answer is kept.
- `lib/ai/bilingual-router.ts` runs them in order: entitlement gate, image-production gate, category
  classification, the academy's deterministic flow, the whole-backend snapshot, then the research gate
  and the answer. Routing traces, the `web_research`, `rewrite_repeat` and `remember_person_facts`
  traces all land on the agent run, so the Agents screen shows what actually happened.
- Capability is reported, not assumed: `getSystemHealth().reasoning` carries
  `webSearchConfigured`, `webSearchProvider`, `memoryExtraction`, `categoryRouting` and
  `repeatRewrite`; `/api/ready` nests it under `aiProvider`, the Settings screen shows a *Research,
  Routing & Memory* panel, `getEnvPresence()` lists `AI_WEB_SEARCH`, `OPENAI_SEARCH_MODEL` and
  `AI_MEMORY_EXTRACT`, and the capability block inside every prompt tells the model whether it can
  search on this server — so it cannot promise a lookup it does not have.
- Tests: the suite is at 51. `test-agent-researches-when-it-has-no-answer` proves the gate both ways,
  that a browse-less provider is skipped for a searched turn and that a chain with only one refuses
  rather than guessing, then drives a full agent turn through a stubbed OpenAI transport and requires
  the citation URL to arrive in the reply. `test-agent-category-decided-not-only-matched` routes an
  unmatched message to `CAREER_ASSISTANT` and requires a model that invents `MOTIVATIONAL_SPEAKER` to be
  refused with the keyword agent still answering. `test-agent-remembers-each-person-apart` writes
  district and trade, refuses the phone number in the same payload, and requires the next snapshot of a
  *different* person to contain neither. `test-agent-does-not-answer-the-same-twice` seeds a prior
  assistant reply, requires the rewrite call to carry it and the new answer to be sent, and requires a
  model that can only repeat to leave the first answer intact rather than erroring. All four run against
  a stubbed `globalThis.fetch` with `GEMINI_API_KEY` scrubbed: nothing is billed and no key in the
  operator's shell is used.
- Still not proven, and not claimed: **no search, memory write or rewrite has ever been billed from
  this machine**, because no provider key exists here. The tests prove the gates, the payloads, the
  refusal paths and the wiring — not that Google returns usable pages for a Rwandan query, not that a
  search-capable OpenAI model id is current, and not that a real model varies its wording enough to
  clear the threshold on the first try. Confirm one searched reply, one remembered fact and one
  rewritten answer on a deployed server, and read the three traces on the Agents screen, before
  repeating this as working behaviour. A turn can also now make up to four sequential model calls, so
  latency on a slow provider is worth watching on a real number.

## A job question that found nothing: words that match, and boards read when asked

Reported from the deployed server: no verified listing appeared, and the search was not answering the
words people typed. Two separate defects, one of them infrastructure.

- Infrastructure: the store is a per-process memory pool backed by a JSON snapshot, and a serverless host
  has neither a writable disk nor a worker process, so **every cold instance started with zero listings**.
  The boards were readable; nobody had read them in that instance.
- `lib/jobs/lazy-crawl.ts` (new) — `ensureJobListings()` runs the crawl inside the turn that needs the
  pool, once per process: skipped when a crawl this fresh already left active verified listings, skipped
  again until `JOB_ON_DEMAND_COOLDOWN_MS` (default 300000) has passed since an attempt, joined when an
  attempt is already in flight, and waited on only until `JOB_ON_DEMAND_BUDGET_MS` (default 12000) so a
  slow board cannot hold a reply hostage — boards that finished are stored and the rest keep reading. A
  board's failure never reaches the person: the promise is caught, the outcome is `{ ran, reason, gained,
  boardsRead, budgetHit }`, logged as `JOB_ON_DEMAND_CRAWL`, recorded on the agent run and returned to the
  Jobs screen as `boardRead`. `JOB_ON_DEMAND_CRAWL=false` switches it off, and `/api/ready` reports
  `ON_DEMAND` when the schedule is off but this is on.
- `lib/ai/bilingual-router.ts` — step 5a, before the platform snapshot is built, so rows read this second
  are in the answer this second. Triggered by `agentType === JOB_FINDER` or `wantsWork()` on the message,
  and emits a `refresh_job_boards` tool trace with the plain-words reason.
- `app/api/jobs/route.ts` — `GET` calls the same guard, which is why the dashboard stops showing an empty
  table on a cold instance, and `POST { action: "CRAWL_ALL" }` adds the **Read All Boards** button beside
  the per-board ones in `components/screens/jobs-screen.tsx`.
- `lib/jobs/query.ts` (new) — the words of the message decide the answer. `splitSearchTerms()` cuts the
  message into words, `INTENT_WORDS` drops the asking itself in both languages (`akazi`, `ndashaka`, `gukora`,
  `muri`, `job`, `vacancy`), `termGroups()` attaches the English wordings a Kinyarwanda word is answered by
  (`mudasobwa` → IT, software, developer, programmer) to **that word only**, so one question never demands all
  five at once, `PLACE_WORDS` keeps Rwandan districts as places, `containsTerm()` requires a two- or
  three-letter word to be the whole word (`it` must not answer "administration"), `scoreListing()` requires
  **every** word to be answered somewhere and weights title 6, employer 4, tags 3, location/requirements 2,
  description 1, and `selectListingsForQuery()` reports `no-words` / `every-word` / `one-word` /
  `nothing-matched` so an unrelated pool is described as *the nearest open ones, not a match* instead of being
  presented as answers.
- `lib/db/repository.ts` — `getJobs()` uses it: an unknown `sourceCode` returns nothing instead of every
  board, `activeOnly: true` hides what the board marked `EXPIRED`, what `isExpired` and what is past its
  stated deadline, and the survivors are ranked by score, then soonest deadline, then newest. `AppRepository`
  is exported so a check can query a private store without touching the live one.
- `lib/ai/platform-context.ts` — `jobsBlock()` now narrows the pool with the message plus the remembered
  facts about that person, asks only for active verified listings, and prints the matched/mismatched note
  above instead of a silent list.
- Tests: the suite is at 54. `test-jobs-search-answers-every-word`,
  `test-jobs-search-excludes-closed-and-unknown-board` (a throwaway `new AppRepository()`, so no row is
  written to the live store) and `test-jobs-boards-read-on-demand` (cold, cooldown, already-fresh,
  switched-off and budget-exceeded paths). A job question can now make the process read the public boards,
  so `runPlatformTestSuiteAsync()` pins `JOB_ON_DEMAND_CRAWL=false` for the whole run and resets the
  process guards around it; a tripwire that replaced `globalThis.fetch` with a throwing stub counted
  **zero** network attempts across all 54 checks. One bug the suite itself found: the budget timer was
  `unref()`'d, so a crawl holding no socket let the process exit silently with the reply still waiting —
  it is a ref'd timer cleared on settlement now, and `npm test` finished in 1.3s instead of never.
- Proven here, against the real boards, in a throwaway data directory and a real browser: one cold process
  read Job in Rwanda and We Work Remotely in 7.0s and stored **113 verified listings** (59 + 54, MIFOTRA
  refused with its usual reason); opening the Jobs screen on a server with an empty store filled the table
  with those 113 without anyone pressing a button; `Read All Boards` re-read both feeds and reported
  `0 new and 113 already-known`, listing MIFOTRA as unreadable rather than as a healthy empty board; the
  console box `developer kigali` returned the one Kigali developer posting, `mudasobwa` returned 26 IT and
  software postings and `hydrography` returned the honest no-match row. Through the simulator's real inbound
  pipeline, `Ndashaka akazi ka developer muri Kigali` routed to `JOB_FINDER` and recorded
  `refresh_job_boards → 113 already stored from a crawl this fresh (4ms)` plus
  `search_verified_jobs(words:["developer","kigali"], storedVerified:113, matched:1, mode:"every-word")`.
- Still not proven, and not claimed: it has not run on the **deployed host**, and no model-written job reply
  was produced here because this machine has no provider key — the turn ends at `not-configured` after the
  tools have run. After deploying, ask one WhatsApp message for work, read `refresh_job_boards` and
  `search_verified_jobs` on the Agents run, `JOB_ON_DEMAND_CRAWL` in the server log, and confirm the reply
  itself quotes listings with working links before saying job search works in production. On a host with
  `npm run worker` the on-demand path should never fire; if it does, the schedule is off or the store is not
  durable.

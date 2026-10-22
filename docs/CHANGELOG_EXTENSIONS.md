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
  `MIFOTRA E-Recruitment Portal: https://recruitment.mifotra.gov.rw/ answered 200 but is not an RSS or Atom
  document, so it has no listings this platform can read. Set JOB_FEED_URL_MIFOTRA to the feed address the
  board publishes, not to a page.` The board stays `WARNING` either way.
- `test-job-board-crawler` (still the suite's 34th check) now crawls the portal home page through the stub
  and asserts `NO_PUBLIC_FEED`, zero rows read, no new row in the store, `WARNING` health, and — the other
  half — that the empty design-category feed still counts as a successful read.
- Action for the deployment: clear `JOB_FEED_URL_MIFOTRA` on the host (or set it to a real feed if the
  ministry publishes one). Until then Jobs shows MIFOTRA refusing, which is the truth, rather than the
  old misleading green state the pre-fix build would have produced.

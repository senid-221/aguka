# Aguka AI — WhatsApp Agent Platform Setup Guide
**Bilingual (Kinyarwanda & English) AI Assistant for Rwanda**

---

## 1. System Architecture Overview

- **Ingress**: WhatsApp Mobile User ➔ Meta Cloud API Webhook ➔ Next.js Gateway
- **Reliability & Queue**: in-process queue with BullMQ-style semantics; no Redis client is installed, so queued work does not survive a restart
- **AI Orchestrator**: Bilingual Router with Kinyarwanda & English detection, Gemini model selection (`GEMINI_MODEL`, default `gemini-2.5-flash`), prompt-injection shielding, secret redaction, and two real tool calls (`search_verified_jobs`, `query_talent_marketplace`)
- **Core Modules**:
  1. **Job Finder**: boards are registered (MIFOTRA, Job in Rwanda, remote) but no live crawler runs yet; listings appear only after a real crawl or a manual `POST /api/jobs` with a source URL. Zero invented listings.
  2. **Career Assistant**: bilingual CV, cover letter and interview-prep text from the model; explicit application consent required
  3. **Coding Agent**: scaffolds, debugging and architecture explanations returned as text. There is no execution sandbox and submitted code is never run.
  4. **Passport & Image Studio**: written guidance on the 35x45mm passport standard; no image editing runs in this service. A retention sweep flags expired media records.
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

---

## 6. Persistence, Database & Migrations

Two layers, reported separately by `/api/ready`:

**Durable file store (active now).** `lib/db/store.ts` serializes users, service selections,
entitlements, trial grants, payment orders, receipt proofs, road safety content and audit entries into
an atomic, versioned snapshot (`repository-snapshot.json`) under `AGUKA_DATA_DIR`, default
`.aguka-data/`, written through a temp file and `renameSync`. Proofs are stored as binaries in
`AGUKA_DATA_DIR/proofs`, never inside the snapshot and never under `public/`. This survives a restart;
the queue and in-flight agent runs do not. Point `AGUKA_DATA_DIR` at a persistent volume, keep it out
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
- AI provider contract (Gemini only) and its honest failure mode with no key
- Queue enqueue and processing lifecycle, configuration parsing, logger redaction
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
7. `/api/ready` and `/api/health` green, `npm test` at 24/24, and `AGUKA_DATA_DIR` on a backed-up volume.

# Aguka AI — WhatsApp Agent Platform Setup Guide
**Bilingual (Kinyarwanda & English) AI Assistant for Rwanda**

---

## 1. System Architecture Overview

- **Ingress**: WhatsApp Mobile User ➔ Meta Cloud API Webhook ➔ Next.js Gateway
- **Reliability & Queue**: in-process queue with BullMQ-style semantics; no Redis client is installed, so nothing survives a restart
- **AI Orchestrator**: Bilingual Router with Kinyarwanda & English detection, Gemini model selection (`GEMINI_MODEL`, default `gemini-2.5-flash`), prompt-injection shielding, secret redaction, and two real tool calls (`search_verified_jobs`, `query_talent_marketplace`)
- **Core Modules**:
  1. **Job Finder**: boards are registered (MIFOTRA, Job in Rwanda, remote) but no live crawler runs yet; listings appear only after a real crawl or a manual `POST /api/jobs` with a source URL. Zero invented listings.
  2. **Career Assistant**: bilingual CV, cover letter and interview-prep text from the model; explicit application consent required
  3. **Coding Agent**: scaffolds, debugging and architecture explanations returned as text. There is no execution sandbox and submitted code is never run.
  4. **Passport & Image Studio**: written guidance on the 35x45mm passport standard; no image editing runs in this service. A retention sweep flags expired media records.
  5. **Bilingual Study Tutor**: STEM and language explanations in Kinyarwanda and English, plus generated quizzes
  6. **Employment Marketplace**: worker profiles, vacancies and match scores computed from stored skills, location and experience

---

## 2. Meta WhatsApp Cloud API Setup

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

## 3. Database & Migrations

`prisma/schema.prisma` defines the normalized PostgreSQL schema and `prisma/migrations/20261020000000_init/migration.sql`
contains the initial SQL. **Prisma is not a dependency of this project yet**, so `npx prisma migrate deploy`
alone will not work. To apply the schema:

```bash
# Install Prisma (once)
npm install -D prisma
npm install @prisma/client

# Point at your database
export DATABASE_URL="postgresql://user:password@localhost:5432/aguka_db?schema=public"

npx prisma migrate deploy
npx prisma generate
```

Until then `lib/db/repository.ts` keeps everything in process memory and the console reports
`In-Memory Store`.

---

## 4. Running Automated Tests

Run the built-in test suite either through the Admin Topbar (**Run Test Suite**) or via the API:
```bash
curl -X GET http://localhost:3000/api/tests
```
Tests verified:
- Webhook GET subscription challenge verification and invalid-token rejection
- POST Meta HMAC-SHA256 signature check
- Event deduplication idempotency
- Bilingual language detection (Kinyarwanda & English)
- Specialized multi-agent intent routing
- Prompt injection resistance & secret credential redaction
- Marketplace matching driven only by stored records, with full explainability on every match
- AI provider contract (Gemini only) and its honest failure mode with no key
- Queue enqueue and processing lifecycle

---

## 5. Docker & Render Deployment

### Production Build
```bash
npm run build
npm run start
```

### Dockerfile
```dockerfile
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

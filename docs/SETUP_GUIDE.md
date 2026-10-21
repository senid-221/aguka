# Aguka AI — Enterprise WhatsApp Agent Platform Setup Guide
**Bilingual (Kinyarwanda & English) AI Assistant for Rwanda & Global Scaling**

---

## 1. System Architecture Overview

As illustrated in the system architecture diagrams:
- **Ingress**: WhatsApp Mobile User ➔ Meta Cloud API Webhook ➔ Next.js Gateway
- **Reliability & Queue**: Redis + BullMQ (asynchronous job queue, exponential retries, event deduplication)
- **AI Orchestrator**: Bilingual Router with Kinyarwanda & English detection, Gemini 3.8-Flash model selection, prompt-injection shielding, secret redaction, and tool-call execution
- **Core Modules**:
  1. **Job Finder**: Verified connectors for MIFOTRA e-recruitment, Job in Rwanda, and remote tech jobs (zero hallucinated listings)
  2. **Career Assistant**: Bilingual CV builder, cover letter generator, interview coach (explicit application consent required)
  3. **Coding Agent & Isolated Sandbox**: Scaffold microservices, debug code, and map system architecture without production shell access
  4. **Passport & Image Studio**: Biometric 35x45mm passport verification, CV portrait enhancement, 30-day retention cleanup
  5. **Bilingual Study Tutor**: STEM and language concept explanations in intuitive Kinyarwanda and English, interactive quizzes
  6. **Employment Marketplace**: Local Rwandan talent profiles, vacancies, and transparent explainable matching scores

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
     - **Verify Token**: `aguka_rwanda_webhook_secret_token_2026`
   - Subscribe to the **`messages`** webhook field.
5. **Interactive Live Testing Without Credentials**:
   - Use the built-in **Live WhatsApp Simulator & Webhook Inspector** in the Aguka AI Admin Dashboard. It sends real webhook payloads to the API endpoints and processes them identically to Meta!

---

## 3. Database & Migrations

The platform includes a normalized PostgreSQL schema and Prisma migrations:
- **Schema**: `prisma/schema.prisma`
- **Initial Migration SQL**: `prisma/migrations/20261020000000_init/migration.sql`

To apply to PostgreSQL:
```bash
# Set your DATABASE_URL in .env
export DATABASE_URL="postgresql://user:password@localhost:5432/aguka_db?schema=public"

# Deploy migrations
npx prisma migrate deploy
```

---

## 4. Running Automated Tests

Run the built-in test suite either through the Admin Topbar (**Run Test Suite**) or via the API:
```bash
curl -X GET http://localhost:3000/api/tests
```
Tests verified:
- Webhook GET subscription challenge verification
- Invalid token rejection
- POST Meta HMAC-SHA256 signature check
- Event deduplication idempotency
- Bilingual language detection (Kinyarwanda & English)
- Specialized multi-agent intent routing
- Prompt injection resistance & secret credential redaction
- Job matching score explainability & non-discrimination

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

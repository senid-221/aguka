-- Aguka AI — commercial layer + Road Safety Academy
-- Mirrors prisma/schema.prisma. Written by hand because this repository has no
-- Prisma CLI or PostgreSQL server installed; run `prisma migrate deploy`
-- against the real database before relying on it in production.

ALTER TYPE "AgentType" ADD VALUE IF NOT EXISTS 'ROAD_SAFETY_ACADEMY';

CREATE TYPE "Currency" AS ENUM ('RWF', 'USD', 'EUR');
CREATE TYPE "BillingPeriod" AS ENUM ('PER_USE', 'DAILY', 'WEEKLY', 'MONTHLY');
CREATE TYPE "EntitlementStatus" AS ENUM ('NONE', 'TRIAL', 'ACTIVE', 'EXPIRED');
CREATE TYPE "PaymentOrderStatus" AS ENUM ('AWAITING_PROOF', 'PROOF_UPLOADED', 'UNDER_REVIEW', 'VERIFIED', 'REJECTED', 'EXPIRED');
CREATE TYPE "PaymentVerificationSource" AS ENUM ('MANUAL_ADMIN', 'PAYMENT_PROVIDER_API');
CREATE TYPE "RiskBand" AS ENUM ('LOW', 'MEDIUM', 'HIGH');
CREATE TYPE "ProofReviewStatus" AS ENUM ('UNREVIEWED', 'ACCEPTED', 'FLAGGED');
CREATE TYPE "PublishStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');
CREATE TYPE "RoadSignCategory" AS ENUM ('WARNING', 'PROHIBITORY', 'MANDATORY', 'DANGER', 'INFORMATION', 'SERVICE');
CREATE TYPE "QuestionDifficulty" AS ENUM ('EASY', 'MEDIUM', 'HARD');
CREATE TYPE "ExamKind" AS ENUM ('PRACTICE', 'MOCK_EXAM');
CREATE TYPE "AuditActorRole" AS ENUM ('ADMIN', 'SYSTEM', 'USER');

ALTER TABLE "User" ADD COLUMN "selectedServiceCode" TEXT;
ALTER TABLE "User" ADD COLUMN "serviceSelectedAt" TIMESTAMP(3);

ALTER TABLE "Conversation" ADD COLUMN "activeServiceCode" TEXT;
ALTER TABLE "Conversation" ADD COLUMN "menuSentAt" TIMESTAMP(3);

-- ---------------------------------------------------------------------------
-- Services, entitlements, trials
-- ---------------------------------------------------------------------------

CREATE TABLE "ServiceDefinition" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL UNIQUE,
    "nameEn" TEXT NOT NULL,
    "nameRw" TEXT NOT NULL,
    "descriptionEn" TEXT NOT NULL DEFAULT '',
    "descriptionRw" TEXT NOT NULL DEFAULT '',
    "agentType" "AgentType" NOT NULL DEFAULT 'ROUTER',
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "showInWhatsAppMenu" BOOLEAN NOT NULL DEFAULT true,
    "isFree" BOOLEAN NOT NULL DEFAULT true,
    "chargeEnabled" BOOLEAN NOT NULL DEFAULT false,
    "price" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "currency" "Currency" NOT NULL DEFAULT 'RWF',
    "billingPeriod" "BillingPeriod" NOT NULL DEFAULT 'MONTHLY',
    "trialHours" INTEGER NOT NULL DEFAULT 24,
    "trialUsageLimit" INTEGER NOT NULL DEFAULT 0,
    "paidUsageLimit" INTEGER NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 100,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ServiceDefinition_price_non_negative" CHECK ("price" >= 0),
    CONSTRAINT "ServiceDefinition_trial_hours_range" CHECK ("trialHours" >= 0 AND "trialHours" <= 744)
);

CREATE INDEX "ServiceDefinition_isEnabled_showInWhatsAppMenu_idx" ON "ServiceDefinition"("isEnabled", "showInWhatsAppMenu");

CREATE TABLE "Entitlement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
    "serviceCode" TEXT NOT NULL REFERENCES "ServiceDefinition"("code") ON DELETE RESTRICT,
    "status" "EntitlementStatus" NOT NULL DEFAULT 'NONE',
    "trialStartsAt" TIMESTAMP(3),
    "trialExpiresAt" TIMESTAMP(3),
    "paidUntil" TIMESTAMP(3),
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "usageLimit" INTEGER,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE ("userId", "serviceCode")
);

CREATE INDEX "Entitlement_serviceCode_status_idx" ON "Entitlement"("serviceCode", "status");

-- Append-only: a row here is what prevents a second free trial for the same person.
CREATE TABLE "TrialGrant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
    "serviceCode" TEXT NOT NULL,
    "identityKey" TEXT NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL
);

CREATE INDEX "TrialGrant_userId_serviceCode_idx" ON "TrialGrant"("userId", "serviceCode");
CREATE INDEX "TrialGrant_identityKey_serviceCode_idx" ON "TrialGrant"("identityKey", "serviceCode");

-- ---------------------------------------------------------------------------
-- Payments
-- ---------------------------------------------------------------------------

CREATE TABLE "PaymentOrder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reference" TEXT NOT NULL UNIQUE,
    "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
    "serviceCode" TEXT NOT NULL REFERENCES "ServiceDefinition"("code") ON DELETE RESTRICT,
    "userPhone" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" "Currency" NOT NULL DEFAULT 'RWF',
    "billingPeriod" "BillingPeriod" NOT NULL DEFAULT 'MONTHLY',
    "payeeName" TEXT NOT NULL,
    "payeeMomoCode" TEXT NOT NULL,
    "status" "PaymentOrderStatus" NOT NULL DEFAULT 'AWAITING_PROOF',
    "idempotencyKey" TEXT UNIQUE,
    "riskBand" "RiskBand",
    "verificationSource" "PaymentVerificationSource",
    "verifiedBy" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "providerTransactionId" TEXT,
    "rejectionReason" TEXT,
    "grantedEntitlementUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PaymentOrder_amount_non_negative" CHECK ("amount" >= 0)
);

CREATE INDEX "PaymentOrder_userId_serviceCode_idx" ON "PaymentOrder"("userId", "serviceCode");
CREATE INDEX "PaymentOrder_status_idx" ON "PaymentOrder"("status");

-- Receipt bytes are stored on disk outside the web root; only metadata lives here.
CREATE TABLE "PaymentProof" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL REFERENCES "PaymentOrder"("id") ON DELETE CASCADE,
    "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
    "reference" TEXT NOT NULL,
    "uploadedBy" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL UNIQUE,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "duplicateProofIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "signals" JSONB NOT NULL,
    "riskScore" INTEGER NOT NULL DEFAULT 0,
    "riskBand" "RiskBand" NOT NULL DEFAULT 'LOW',
    "ocr" JSONB NOT NULL,
    "reviewStatus" "ProofReviewStatus" NOT NULL DEFAULT 'UNREVIEWED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "PaymentProof_sha256_idx" ON "PaymentProof"("sha256");
CREATE INDEX "PaymentProof_orderId_idx" ON "PaymentProof"("orderId");

-- ---------------------------------------------------------------------------
-- Road Safety Academy
-- ---------------------------------------------------------------------------

CREATE TABLE "RoadSafetyModule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL UNIQUE,
    "titleEn" TEXT NOT NULL,
    "titleRw" TEXT NOT NULL,
    "summaryEn" TEXT NOT NULL DEFAULT '',
    "summaryRw" TEXT NOT NULL DEFAULT '',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "status" "PublishStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "RoadSafetyLesson" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "moduleId" TEXT NOT NULL REFERENCES "RoadSafetyModule"("id") ON DELETE CASCADE,
    "titleEn" TEXT NOT NULL,
    "titleRw" TEXT NOT NULL,
    "bodyEn" TEXT NOT NULL DEFAULT '',
    "bodyRw" TEXT NOT NULL DEFAULT '',
    "keyPointsEn" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "keyPointsRw" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "citations" JSONB NOT NULL DEFAULT '[]'::jsonb,
    "legalVerifiedAt" TIMESTAMP(3),
    "lastReviewedBy" TEXT,
    "status" "PublishStatus" NOT NULL DEFAULT 'DRAFT',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "RoadSafetyLesson_moduleId_status_idx" ON "RoadSafetyLesson"("moduleId", "status");

CREATE TABLE "RoadSign" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL UNIQUE,
    "category" "RoadSignCategory" NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameRw" TEXT NOT NULL,
    "meaningEn" TEXT NOT NULL DEFAULT '',
    "meaningRw" TEXT NOT NULL DEFAULT '',
    "shape" TEXT NOT NULL DEFAULT '',
    "colourConvention" TEXT NOT NULL DEFAULT '',
    "citations" JSONB NOT NULL DEFAULT '[]'::jsonb,
    "legalVerifiedAt" TIMESTAMP(3),
    "status" "PublishStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "RoadSign_category_status_idx" ON "RoadSign"("category", "status");

CREATE TABLE "RoadSafetyQuestion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "moduleId" TEXT NOT NULL REFERENCES "RoadSafetyModule"("id") ON DELETE CASCADE,
    "lessonId" TEXT REFERENCES "RoadSafetyLesson"("id") ON DELETE SET NULL,
    "questionEn" TEXT NOT NULL,
    "questionRw" TEXT NOT NULL,
    "optionsEn" TEXT[] NOT NULL,
    "optionsRw" TEXT[] NOT NULL,
    "correctIndex" INTEGER NOT NULL,
    "explanationEn" TEXT NOT NULL DEFAULT '',
    "explanationRw" TEXT NOT NULL DEFAULT '',
    "difficulty" "QuestionDifficulty" NOT NULL DEFAULT 'MEDIUM',
    "citations" JSONB NOT NULL DEFAULT '[]'::jsonb,
    "legalVerifiedAt" TIMESTAMP(3),
    "status" "PublishStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RoadSafetyQuestion_option_selected" CHECK ("correctIndex" >= 0)
);

CREATE INDEX "RoadSafetyQuestion_moduleId_status_idx" ON "RoadSafetyQuestion"("moduleId", "status");

CREATE TABLE "ExamTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nameEn" TEXT NOT NULL,
    "nameRw" TEXT NOT NULL,
    "moduleId" TEXT REFERENCES "RoadSafetyModule"("id") ON DELETE SET NULL,
    "questionCount" INTEGER NOT NULL DEFAULT 10,
    "passPercent" INTEGER NOT NULL DEFAULT 70,
    "timeLimitMinutes" INTEGER,
    "status" "PublishStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ExamTemplate_pass_percent_range" CHECK ("passPercent" >= 1 AND "passPercent" <= 100)
);

CREATE INDEX "ExamTemplate_status_idx" ON "ExamTemplate"("status");

CREATE TABLE "ExamAttempt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
    "kind" "ExamKind" NOT NULL,
    "examTemplateId" TEXT REFERENCES "ExamTemplate"("id") ON DELETE SET NULL,
    "moduleId" TEXT,
    "language" "LanguagePreference" NOT NULL DEFAULT 'KINYARWANDA',
    "questionIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "answers" JSONB NOT NULL DEFAULT '[]'::jsonb,
    "totalQuestions" INTEGER NOT NULL,
    "correctCount" INTEGER NOT NULL DEFAULT 0,
    "scorePercent" INTEGER NOT NULL DEFAULT 0,
    "passPercent" INTEGER NOT NULL DEFAULT 0,
    "passed" BOOLEAN NOT NULL DEFAULT false,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "durationSeconds" INTEGER
);

CREATE INDEX "ExamAttempt_userId_kind_idx" ON "ExamAttempt"("userId", "kind");

CREATE TABLE "LessonProgress" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
    "lessonId" TEXT NOT NULL REFERENCES "RoadSafetyLesson"("id") ON DELETE CASCADE,
    "completedAt" TIMESTAMP(3) NOT NULL,
    UNIQUE ("userId", "lessonId")
);

CREATE TABLE "AuditEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "actor" TEXT NOT NULL,
    "actorRole" "AuditActorRole" NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "AuditEntry_action_createdAt_idx" ON "AuditEntry"("action", "createdAt");
CREATE INDEX "AuditEntry_targetType_targetId_idx" ON "AuditEntry"("targetType", "targetId");

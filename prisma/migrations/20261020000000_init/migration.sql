-- Aguka AI Initial Migration (PostgreSQL)
-- Creates enums, indexes, tables, foreign keys, and constraints

CREATE TYPE "LanguagePreference" AS ENUM ('KINYARWANDA', 'ENGLISH', 'BOTH');
CREATE TYPE "UserRole" AS ENUM ('CANDIDATE', 'WORKER', 'EMPLOYER', 'STUDENT', 'DEVELOPER');
CREATE TYPE "MessageRole" AS ENUM ('USER', 'ASSISTANT', 'SYSTEM', 'TOOL');
CREATE TYPE "MessageContentType" AS ENUM ('TEXT', 'IMAGE', 'DOCUMENT', 'AUDIO', 'INTERACTIVE_REPLY', 'LOCATION');
CREATE TYPE "AgentType" AS ENUM ('ROUTER', 'JOB_FINDER', 'CAREER_ASSISTANT', 'IMAGE_STUDIO', 'CODING_AGENT', 'STUDY_TUTOR', 'EMPLOYMENT_MARKETPLACE');
CREATE TYPE "TaskStatus" AS ENUM ('PENDING', 'QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED');
CREATE TYPE "JobType" AS ENUM ('FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERNSHIP', 'REMOTE', 'HYBRID');
CREATE TYPE "VerificationStatus" AS ENUM ('VERIFIED', 'PENDING', 'UNVERIFIED', 'EXPIRED', 'REJECTED');
CREATE TYPE "ConsentType" AS ENUM ('TERMS_OF_SERVICE', 'PRIVACY_POLICY', 'JOB_ALERTS', 'PROFILE_SHARING', 'DATA_RETENTION', 'ANALYTICS');

CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "phoneNumber" TEXT NOT NULL UNIQUE,
    "whatsappId" TEXT UNIQUE,
    "fullName" TEXT,
    "email" TEXT,
    "preferredLang" "LanguagePreference" NOT NULL DEFAULT 'KINYARWANDA',
    "role" "UserRole" NOT NULL DEFAULT 'CANDIDATE',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isBlocked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "UserPreference" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL UNIQUE REFERENCES "User"("id") ON DELETE CASCADE,
    "quietHoursStart" TEXT,
    "quietHoursEnd" TEXT,
    "notifyViaSms" BOOLEAN NOT NULL DEFAULT false,
    "notifyViaWa" BOOLEAN NOT NULL DEFAULT true,
    "autoCvSharing" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "Consent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
    "type" "ConsentType" NOT NULL,
    "granted" BOOLEAN NOT NULL DEFAULT true,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    CONSTRAINT "Consent_userId_type_unique" UNIQUE ("userId", "type")
);

CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
    "lastAgent" "AgentType" NOT NULL DEFAULT 'ROUTER',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "Message" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "conversationId" TEXT NOT NULL REFERENCES "Conversation"("id") ON DELETE CASCADE,
    "waMessageId" TEXT UNIQUE,
    "role" "MessageRole" NOT NULL,
    "type" "MessageContentType" NOT NULL DEFAULT 'TEXT',
    "content" TEXT NOT NULL,
    "mediaUrl" TEXT,
    "tokensUsed" INTEGER DEFAULT 0,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "ConversationMemory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "conversationId" TEXT NOT NULL REFERENCES "Conversation"("id") ON DELETE CASCADE,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ConversationMemory_conversationId_key_unique" UNIQUE ("conversationId", "key")
);

CREATE TABLE "JobSource" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL UNIQUE,
    "baseUrl" TEXT NOT NULL,
    "feedUrl" TEXT,
    "isPermitted" BOOLEAN NOT NULL DEFAULT true,
    "healthStatus" TEXT NOT NULL DEFAULT 'HEALTHY',
    "lastCrawledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "JobListing" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sourceId" TEXT NOT NULL REFERENCES "JobSource"("id") ON DELETE CASCADE,
    "externalId" TEXT,
    "title" TEXT NOT NULL,
    "employer" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "jobType" "JobType" NOT NULL DEFAULT 'FULL_TIME',
    "description" TEXT NOT NULL,
    "requirements" TEXT,
    "salaryRange" TEXT,
    "sourceUrl" TEXT NOT NULL,
    "deadline" TIMESTAMP(3),
    "discoveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastVerifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'VERIFIED',
    "isExpired" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "JobListing_sourceId_externalId_unique" UNIQUE ("sourceId", "externalId")
);

CREATE TABLE "JobAlert" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
    "keywords" TEXT NOT NULL,
    "location" TEXT,
    "jobType" "JobType",
    "language" "LanguagePreference" NOT NULL DEFAULT 'KINYARWANDA',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "WorkerProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL UNIQUE REFERENCES "User"("id") ON DELETE CASCADE,
    "title" TEXT NOT NULL,
    "bio" TEXT,
    "skills" TEXT[],
    "experienceYrs" INTEGER NOT NULL DEFAULT 0,
    "district" TEXT NOT NULL DEFAULT 'Kigali',
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "hourlyRateRwf" INTEGER,
    "cvUrl" TEXT,
    "rating" DOUBLE PRECISION NOT NULL DEFAULT 5.0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "EmployerProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL UNIQUE REFERENCES "User"("id") ON DELETE CASCADE,
    "companyName" TEXT NOT NULL,
    "industry" TEXT NOT NULL,
    "tinNumber" TEXT,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "hqLocation" TEXT NOT NULL DEFAULT 'Kigali',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "Vacancy" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "employerId" TEXT NOT NULL REFERENCES "EmployerProfile"("id") ON DELETE CASCADE,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "requiredSkills" TEXT[],
    "budgetRwf" INTEGER,
    "deadline" TIMESTAMP(3),
    "status" "TaskStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "JobMatch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workerId" TEXT NOT NULL REFERENCES "WorkerProfile"("id") ON DELETE CASCADE,
    "jobListingId" TEXT REFERENCES "JobListing"("id") ON DELETE CASCADE,
    "vacancyId" TEXT REFERENCES "Vacancy"("id") ON DELETE CASCADE,
    "score" DOUBLE PRECISION NOT NULL,
    "explainability" JSONB NOT NULL,
    "isContacted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "AgentRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "conversationId" TEXT NOT NULL REFERENCES "Conversation"("id") ON DELETE CASCADE,
    "agentType" "AgentType" NOT NULL,
    "intentDetected" TEXT NOT NULL,
    "modelUsed" TEXT NOT NULL,
    "tokensInput" INTEGER NOT NULL DEFAULT 0,
    "tokensOutput" INTEGER NOT NULL DEFAULT 0,
    "latencyMs" INTEGER NOT NULL DEFAULT 0,
    "status" "TaskStatus" NOT NULL DEFAULT 'COMPLETED',
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "ToolCall" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "agentRunId" TEXT NOT NULL REFERENCES "AgentRun"("id") ON DELETE CASCADE,
    "toolName" TEXT NOT NULL,
    "arguments" JSONB NOT NULL,
    "result" JSONB NOT NULL,
    "latencyMs" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "WebhookEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventId" TEXT NOT NULL UNIQUE,
    "eventType" TEXT NOT NULL,
    "senderWaId" TEXT NOT NULL,
    "rawPayload" JSONB NOT NULL,
    "isProcessed" BOOLEAN NOT NULL DEFAULT false,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3)
);

CREATE TABLE "AdminUser" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL UNIQUE,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'SUPERADMIN',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "adminId" TEXT REFERENCES "AdminUser"("id") ON DELETE SET NULL,
    "userId" TEXT REFERENCES "User"("id") ON DELETE SET NULL,
    "action" TEXT NOT NULL,
    "details" JSONB,
    "ipAddress" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "User_phoneNumber_idx" ON "User"("phoneNumber");
CREATE INDEX "JobListing_location_idx" ON "JobListing"("location");
CREATE INDEX "JobListing_deadline_idx" ON "JobListing"("deadline");
CREATE INDEX "JobListing_verificationStatus_idx" ON "JobListing"("verificationStatus");
CREATE INDEX "AgentRun_agentType_idx" ON "AgentRun"("agentType");
CREATE INDEX "WebhookEvent_senderWaId_idx" ON "WebhookEvent"("senderWaId");

-- Aguka AI — Road Safety Academy exam engine
-- Mirrors prisma/schema.prisma. Written by hand because this repository has no
-- Prisma CLI pinned and no PostgreSQL server reachable from the development
-- machine; run `npx prisma@6 migrate deploy` against the real database and then
-- `npx prisma@6 migrate status` before treating the live tables as authoritative.
--
-- Everything here is additive. No column is dropped and no row is rewritten, so a
-- database that already holds learners' attempts upgrades without losing a record.

-- 1. New states the engine needs.
--    NEEDS_REVIEW is where the verification gate parks anything it could not defend;
--    LEARN is the one-question-at-a-time tutoring mode.
ALTER TYPE "PublishStatus" ADD VALUE IF NOT EXISTS 'NEEDS_REVIEW';
ALTER TYPE "ExamKind" ADD VALUE IF NOT EXISTS 'LEARN';

CREATE TYPE "QuestionSource" AS ENUM ('CURATED_PACK', 'AI_GENERATED', 'ADMIN_AUTHORED');
CREATE TYPE "GenerationRunKind" AS ENUM ('PRACTICE', 'MOCK_EXAM', 'LEARN', 'ADMIN_BATCH');

-- 2. A sign may now carry the durable key of a photographed official sign.
--    Sign-identification questions stay unpublished while this is null.
ALTER TABLE "RoadSign" ADD COLUMN "imageKey" TEXT;

-- 3. Question rows carry their own provenance, gate verdicts and duplicate hash.
ALTER TABLE "RoadSafetyQuestion"
    ADD COLUMN "signId" TEXT,
    ADD COLUMN "correctIndexes" INTEGER[],
    ADD COLUMN "factIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    ADD COLUMN "source" "QuestionSource" NOT NULL DEFAULT 'CURATED_PACK',
    ADD COLUMN "generation" JSONB,
    ADD COLUMN "reviewReasons" TEXT[] DEFAULT ARRAY[]::TEXT[],
    ADD COLUMN "issueReports" JSONB NOT NULL DEFAULT '[]',
    ADD COLUMN "fingerprint" TEXT NOT NULL DEFAULT '';

ALTER TABLE "RoadSafetyQuestion"
    ADD CONSTRAINT "RoadSafetyQuestion_signId_fkey"
    FOREIGN KEY ("signId") REFERENCES "RoadSign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- A single-element correctIndexes would mean "one answer", which is what correctIndex
-- already says; the repository enforces the same shape, so the database says it too.
ALTER TABLE "RoadSafetyQuestion"
    ADD CONSTRAINT "RoadSafetyQuestion_multi_answer"
    CHECK ("correctIndexes" IS NULL OR cardinality("correctIndexes") > 1);

CREATE INDEX "RoadSafetyQuestion_signId_idx" ON "RoadSafetyQuestion"("signId");
CREATE INDEX "RoadSafetyQuestion_fingerprint_idx" ON "RoadSafetyQuestion"("fingerprint");
CREATE INDEX "RoadSafetyQuestion_status_idx" ON "RoadSafetyQuestion"("status");

-- 4. A paper declares whether it behaves as a strict examination, and whether its
--    count, duration and pass mark come from an authoritative source or are our own
--    simulation settings.
ALTER TABLE "ExamTemplate"
    ADD COLUMN "strictMode" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "officialBasis" JSONB;

-- 5. The attempt owns its own timer and its autosaved picks, so nothing about how a
--    paper was answered depends on a client that can be tampered with. Existing rows
--    are backfilled from the answers they already hold.
ALTER TABLE "ExamAttempt"
    ADD COLUMN "savedAnswers" JSONB NOT NULL DEFAULT '[]',
    ADD COLUMN "answerSeconds" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    ADD COLUMN "timeLimitSeconds" INTEGER,
    ADD COLUMN "deadlineAt" TIMESTAMP(3),
    ADD COLUMN "strict" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "answersRevealed" BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "ExamAttempt"
SET "savedAnswers" = (
        SELECT COALESCE(jsonb_agg(a -> 'selectedIndex'), '[]'::jsonb)
        FROM jsonb_array_elements("answers"::jsonb) AS a
    ),
    "lastActivityAt" = COALESCE("submittedAt", "startedAt")
WHERE "savedAnswers" = '[]'::jsonb AND "answers" IS NOT NULL;

CREATE INDEX "ExamAttempt_submittedAt_idx" ON "ExamAttempt"("submittedAt");

-- 6. One row per provider call, so cost, latency and failure are auditable after the
--    fact rather than reconstructed from logs.
CREATE TABLE "QuestionGenerationRun" (
    "id" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT,
    "kind" "GenerationRunKind" NOT NULL,
    "requested" INTEGER NOT NULL,
    "factIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "provider" TEXT,
    "model" TEXT,
    "candidates" INTEGER NOT NULL DEFAULT 0,
    "published" INTEGER NOT NULL DEFAULT 0,
    "heldForReview" INTEGER NOT NULL DEFAULT 0,
    "tokensUsed" INTEGER NOT NULL DEFAULT 0,
    "latencyMs" INTEGER NOT NULL DEFAULT 0,
    "attempts" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "error" TEXT,

    CONSTRAINT "QuestionGenerationRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "QuestionGenerationRun_startedAt_idx" ON "QuestionGenerationRun"("startedAt");
CREATE INDEX "QuestionGenerationRun_userId_idx" ON "QuestionGenerationRun"("userId");

-- 7. Academy configuration lives in the database too: generation limits, languages,
--    paper sizes, the review interval and the approved-source ledger with what each
--    source permits. One row, because the whole object is always read together.
CREATE TABLE "RoadSafetySettings" (
    "id" TEXT NOT NULL DEFAULT 'ROAD_SAFETY',
    "settings" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoadSafetySettings_pkey" PRIMARY KEY ("id")
);

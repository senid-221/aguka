export type LanguagePreference = 'KINYARWANDA' | 'ENGLISH' | 'BOTH';

export type UserRole = 'CANDIDATE' | 'WORKER' | 'EMPLOYER' | 'STUDENT' | 'DEVELOPER';

export type MessageRole = 'USER' | 'ASSISTANT' | 'SYSTEM' | 'TOOL';

export type MessageContentType = 'TEXT' | 'IMAGE' | 'DOCUMENT' | 'AUDIO' | 'INTERACTIVE_REPLY' | 'LOCATION';

export type AgentType = 
  | 'ROUTER'
  | 'JOB_FINDER'
  | 'CAREER_ASSISTANT'
  | 'IMAGE_STUDIO'
  | 'CODING_AGENT'
  | 'STUDY_TUTOR'
  | 'EMPLOYMENT_MARKETPLACE'
  | 'ROAD_SAFETY_ACADEMY';

export type TaskStatus = 'PENDING' | 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

export type JobType = 'FULL_TIME' | 'PART_TIME' | 'CONTRACT' | 'INTERNSHIP' | 'REMOTE' | 'HYBRID';

export type VerificationStatus = 'VERIFIED' | 'PENDING' | 'UNVERIFIED' | 'EXPIRED' | 'REJECTED';

export type ConsentType = 
  | 'TERMS_OF_SERVICE'
  | 'PRIVACY_POLICY'
  | 'JOB_ALERTS'
  | 'PROFILE_SHARING'
  | 'DATA_RETENTION'
  | 'ANALYTICS';

export interface User {
  id: string;
  phoneNumber: string; // e.g. "+250788123456"
  whatsappId?: string;
  fullName?: string;
  email?: string;
  preferredLang: LanguagePreference;
  role: UserRole;
  isActive: boolean;
  isBlocked: boolean;
  selectedServiceCode?: string | null; // last WhatsApp menu choice
  serviceSelectedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UserPreference {
  id: string;
  userId: string;
  quietHoursStart?: string; // "21:00"
  quietHoursEnd?: string;   // "07:00"
  notifyViaSms: boolean;
  notifyViaWa: boolean;
  autoCvSharing: boolean;
}

export interface Consent {
  id: string;
  userId: string;
  type: ConsentType;
  granted: boolean;
  ipAddress?: string;
  grantedAt: string;
}

export interface Message {
  id: string;
  conversationId: string;
  waMessageId?: string;
  role: MessageRole;
  type: MessageContentType;
  content: string;
  mediaUrl?: string;
  tokensUsed?: number;
  timestamp: string;
}

export interface Conversation {
  id: string;
  userId: string;
  lastAgent: AgentType;
  activeServiceCode?: string | null;
  menuSentAt?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  messages: Message[];
  memories: Record<string, string>;
}

export interface JobSource {
  id: string;
  name: string;
  code: string; // "MIFOTRA", "JOB_IN_RWANDA", "REMOTE_TECH"
  baseUrl: string;
  isPermitted: boolean;
  healthStatus: 'HEALTHY' | 'WARNING' | 'DOWN' | 'UNKNOWN';
  lastCrawledAt: string | null; // null until a crawl actually runs
  activeListingsCount: number;
  /** Outcome of the most recent real crawl attempt, with the board's own reason. */
  lastCrawlStatus?: 'OK' | 'NO_PUBLIC_FEED' | 'FAILED' | 'UNKNOWN_SOURCE';
  lastCrawlNote?: string;
}

export interface JobListing {
  id: string;
  sourceId: string;
  sourceName: string;
  externalId?: string;
  title: string;
  employer: string;
  location: string;
  jobType: JobType;
  description: string;
  requirements?: string;
  salaryRange?: string;
  sourceUrl: string;
  deadline?: string;
  discoveredAt: string;
  lastVerifiedAt: string;
  verificationStatus: VerificationStatus;
  isExpired: boolean;
  tags: string[];
}

export interface WorkerProfile {
  id: string;
  userId: string;
  fullName: string;
  phoneNumber: string;
  title: string;
  bio?: string;
  skills: string[];
  experienceYrs: number;
  district: string;
  isAvailable: boolean;
  hourlyRateRwf?: number;
  rating: number;
  completedJobsCount: number;
  cvUrl?: string;
}

export interface EmployerProfile {
  id: string;
  userId: string;
  companyName: string;
  industry: string;
  tinNumber?: string;
  isVerified: boolean;
  hqLocation: string;
  activeVacanciesCount: number;
}

export interface Vacancy {
  id: string;
  employerId: string;
  employerName: string;
  title: string;
  description: string;
  requiredSkills: string[];
  budgetRwf?: number;
  location: string;
  deadline?: string;
  status: TaskStatus;
  createdAt: string;
}

export interface JobMatch {
  id: string;
  workerId: string;
  workerName: string;
  workerTitle: string;
  vacancyId?: string;
  jobListingId?: string;
  targetTitle: string;
  score: number; // 0 - 100
  explainability: {
    skillsMatchPercentage: number;
    locationMatch: boolean;
    experienceScore: number;
    matchedSkills: string[];
    missingSkills: string[];
    rationale: string;
  };
  isContacted: boolean;
  createdAt: string;
}

export interface MediaTask {
  id: string;
  userId: string;
  userName: string;
  operation: 'PASSPORT_CROP' | 'ENHANCE_CV_PHOTO' | 'REMOVE_BG' | 'RESIZE';
  status: TaskStatus;
  originalUrl: string;
  processedUrl?: string;
  retentionDays: number;
  createdAt: string;
  completedAt?: string;
}

export interface CodingTask {
  id: string;
  userId: string;
  title: string;
  taskType: 'SCAFFOLD' | 'DEBUG' | 'EXPLAIN' | 'SANDBOX_RUN';
  language: 'typescript' | 'python' | 'cpp' | 'javascript';
  code: string;
  inputPrompt: string;
  outputResult?: string;
  status: TaskStatus;
  sandboxExitCode?: number;
  executionTimeMs?: number;
  memoryUsageMb?: number;
  createdAt: string;
}

export interface StudySession {
  id: string;
  userId: string;
  subject: string;
  topic: string;
  language: LanguagePreference;
  notes: string;
  createdAt: string;
  quizzes: QuizItem[];
}

export interface QuizItem {
  id: string;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  userAnswer?: number;
  isCorrect?: boolean;
}

export interface AgentRun {
  id: string;
  conversationId: string;
  agentType: AgentType;
  intentDetected: string;
  modelUsed: string;
  tokensInput: number;
  tokensOutput: number;
  latencyMs: number;
  status: TaskStatus;
  toolCallsCount: number;
  createdAt: string;
}

export interface ToolCallTrace {
  id: string;
  agentRunId: string;
  toolName: string;
  arguments: Record<string, unknown>;
  result: Record<string, unknown>;
  latencyMs: number;
  redacted: boolean;
  timestamp: string;
}

export interface WebhookEventRecord {
  id: string;
  eventId: string;
  senderWaId: string;
  eventType: string;
  isProcessed: boolean;
  receivedAt: string;
  payloadSummary: string;
}

export interface QueuedJob {
  id: string;
  name: string;
  data: Record<string, unknown>;
  status: TaskStatus;
  attempts: number;
  maxAttempts: number;
  enqueuedAt: string;
  processedAt?: string;
  failedReason?: string;
}

export interface SystemHealth {
  status: 'OPTIMAL' | 'DEGRADED' | 'CRITICAL';
  uptimeSeconds: number;
  database: {
    status: 'CONNECTED' | 'IN_MEMORY';
    provider: 'PostgreSQL' | 'File-Backed JSON Store' | 'In-Memory Store';
    latencyMs: number | null;
  };
  redisQueue: {
    status: 'ACTIVE' | 'IN_MEMORY' | 'UNREACHABLE';
    mode: string;
    queuedJobs: number;
    activeWorkers: number;
    lastError?: string;
  };
  whatsappApi: {
    configured: boolean;
    mode: 'PRODUCTION' | 'NOT_CONFIGURED';
    webhookVerified: boolean; // true only when WHATSAPP_APP_SECRET enforces HMAC checks
    phoneNumberId?: string;
  };
  geminiAi: {
    configured: boolean;
    model: string;
    bilingualKinyarwandaSupport: boolean;
  };
  textChain: {
    configured: boolean;
    /** Providers in answer order: the first is the primary, the rest are rescues. */
    order: Array<{ provider: 'gemini' | 'openai'; model: string }>;
    rescueConfigured: boolean;
    attemptsPerProvider: number;
    budgetMs: number;
  };
  /**
   * The reasoning layers on top of the chain. Each is a real capability with its own
   * gate, so an operator can see which of them this server can actually perform
   * instead of being told the agent "researches and remembers".
   */
  reasoning: {
    /** A turn can be grounded in a live Google Search. */
    webSearchConfigured: boolean;
    webSearchProvider: 'gemini' | 'openai' | null;
    /** Durable facts about a person are extracted from an answered turn. */
    memoryExtraction: boolean;
    /** The category of an unmatched free-text message is decided by the model. */
    categoryRouting: boolean;
    /** An answer that repeats this person's earlier answer is re-asked once. */
    repeatRewrite: boolean;
  };
  imageStudio: {
    configured: boolean;
    provider: 'openai' | 'gemini' | 'none';
    mode: 'PROVIDER_RENDERED' | 'NOT_CONFIGURED';
    model: string | null;
    /** The shape every produced file is cropped to, in pixels. */
    output: string;
    retentionDays: number;
  };
  stats: {
    totalUsers: number;
    conversations: number;
    messages: number;
    verifiedJobListings: number;
    agentRuns: number;
    toolCalls: number;
  };
  // Server filesystem paths are deliberately not part of this health payload.
  persistence: {
    mode: 'IN_MEMORY_ONLY' | 'FILE_BACKED_JSON';
    loadedFromDisk: boolean;
    lastSavedAt: string | null;
    lastSaveError: string | null;
    records: number;
  };
  productionDatabase: {
    prismaInstalled: boolean;
    schemaFilePresent: boolean;
    migrationsPresent: number;
    applied: boolean;
    note: string;
  };
}

// ---------------------------------------------------------------------------
// Service catalog, entitlements and billing
// ---------------------------------------------------------------------------

export type Currency = 'RWF' | 'USD' | 'EUR';

export type BillingPeriod = 'PER_USE' | 'DAILY' | 'WEEKLY' | 'MONTHLY';

export interface ServiceDefinition {
  id: string;
  code: string; // stable key used by routing + entitlements
  nameEn: string;
  nameRw: string;
  descriptionEn: string;
  descriptionRw: string;
  agentType: AgentType;
  isEnabled: boolean;
  showInWhatsAppMenu: boolean;
  isFree: boolean;
  /**
   * Charging stays switched off until an administrator confirms the price, so a
   * default catalog entry can never bill a real person by accident.
   */
  chargeEnabled: boolean;
  price: number; // 0 when isFree
  currency: Currency;
  billingPeriod: BillingPeriod;
  trialHours: number; // 0 disables the free trial
  trialUsageLimit: number; // 0 = unlimited during trial
  paidUsageLimit: number; // 0 = unlimited once paid
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export type EntitlementStatus = 'NONE' | 'TRIAL' | 'ACTIVE' | 'EXPIRED';

export interface Entitlement {
  id: string;
  userId: string;
  serviceCode: string;
  status: EntitlementStatus;
  trialStartsAt: string | null;
  trialExpiresAt: string | null;
  paidUntil: string | null;
  usageCount: number;
  usageLimit: number | null; // null = unlimited
  lastUsedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Append-only record that a free trial was granted. Existence of a row is what
 * blocks a second trial, so trials cannot be relinked by clearing an entitlement.
 */
export interface TrialGrant {
  id: string;
  userId: string;
  serviceCode: string;
  identityKey: string; // normalised whatsapp id / phone used to catch same-person relinks
  grantedAt: string;
  expiresAt: string;
}

export type AccessDenialReason =
  | 'SERVICE_DISABLED'
  | 'TRIAL_USED'
  | 'TRIAL_EXPIRED'
  | 'USAGE_LIMIT_REACHED'
  | 'PAYMENT_REQUIRED';

export interface AccessDecision {
  allowed: boolean;
  serviceCode: string;
  status: EntitlementStatus;
  denialReason?: AccessDenialReason;
  remainingUsage?: number | null;
  trialExpiresAt?: string | null;
  paidUntil?: string | null;
  price?: number;
  currency?: Currency;
  billingPeriod?: BillingPeriod;
}

// ---------------------------------------------------------------------------
// MoMo payment orders and proof-of-payment analysis
// ---------------------------------------------------------------------------

export type PaymentOrderStatus =
  | 'AWAITING_PROOF'
  | 'PROOF_UPLOADED'
  | 'UNDER_REVIEW'
  | 'VERIFIED'
  | 'REJECTED'
  | 'EXPIRED';

export type PaymentVerificationSource = 'MANUAL_ADMIN' | 'PAYMENT_PROVIDER_API';

export interface PaymentOrder {
  id: string;
  reference: string; // unique, customer-quoted MoMo payment reference
  userId: string;
  userPhone: string;
  serviceCode: string;
  amount: number;
  currency: Currency;
  billingPeriod: BillingPeriod;
  payeeName: string;
  payeeMomoCode: string;
  status: PaymentOrderStatus;
  idempotencyKey: string | null;
  proofIds: string[];
  riskBand: RiskBand | null;
  verificationSource: PaymentVerificationSource | null;
  verifiedBy: string | null;
  verifiedAt: string | null;
  providerTransactionId: string | null;
  rejectionReason: string | null;
  grantedEntitlementUntil: string | null;
  createdAt: string;
  updatedAt: string;
}

export type RiskBand = 'LOW' | 'MEDIUM' | 'HIGH';

export type ProofSignalSeverity = 'INFO' | 'WARN' | 'HIGH';

export interface ProofSignal {
  code: string;
  label: string;
  detail: string;
  severity: ProofSignalSeverity;
  weight: number;
}

export interface OcrOutcome {
  attempted: boolean;
  available: boolean;
  provider: string;
  reason: string;
  extractedText: string | null;
  matchedAmount: boolean | null;
  matchedReference: boolean | null;
  matchedPayee: boolean | null;
}

export interface PaymentProof {
  id: string;
  orderId: string;
  reference: string;
  userId: string;
  uploadedBy: string;
  storageKey: string; // opaque id; bytes live outside the public web root
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  width: number | null;
  height: number | null;
  duplicateProofIds: string[];
  signals: ProofSignal[];
  riskScore: number;
  riskBand: RiskBand;
  ocr: OcrOutcome;
  reviewStatus: 'UNREVIEWED' | 'ACCEPTED' | 'FLAGGED';
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Road Safety Academy
// ---------------------------------------------------------------------------

/**
 * NEEDS_REVIEW is the fail-closed state: material that could not be tied to a
 * verified rule, or that a learner flagged as wrong, sits here and is never
 * served to a learner.
 */
export type PublishStatus = 'DRAFT' | 'PUBLISHED' | 'NEEDS_REVIEW' | 'ARCHIVED';

export interface SourceCitation {
  title: string;
  publisher: string;
  url: string;
  accessedOn: string;
  quote?: string;
}

/**
 * Where a statement comes from. A general safe-driving tip must never be phrased
 * as a legal duty, so every fact carries its own basis and the generator is held
 * to it.
 */
export type LegalBasis =
  | 'OFFICIAL_REQUIREMENT'
  | 'ADMINISTRATIVE_INSTRUCTION'
  | 'SAFETY_RECOMMENDATION'
  | 'NOT_ESTABLISHED';

export type VerifiedFactKind =
  | 'SPEED_LIMIT'
  | 'BAC_LIMIT'
  | 'PRIORITY_RULE'
  | 'MARKING'
  | 'SIGN_MEANING'
  | 'LICENCE_CATEGORY'
  | 'LICENCE_RULE'
  | 'TEST_RULE'
  | 'EQUIPMENT'
  | 'INSPECTION'
  | 'PENALTY'
  | 'RESTRICTION'
  | 'OPEN_QUESTION';

/**
 * One atomic, cited rule. This registry is the only ground truth the question
 * generator is allowed to write from: a number, a penalty or a sign meaning that
 * is not in here cannot appear as a correct answer.
 */
export interface VerifiedFact {
  id: string;
  kind: VerifiedFactKind;
  /** RoadSafetyModule.code the fact belongs to, so generated questions land in a real topic. */
  moduleCode: string;
  statementEn: string;
  statementRw: string;
  legalBasis: LegalBasis;
  citation: SourceCitation;
  /** Article of the instrument, kept separate so an explanation can name it. */
  article: string | null;
  /** Numeric anchor of the rule, if it has one. The gate checks answers against it. */
  value: number | null;
  unit: string | null;
  /** Wrong values that are legitimately distractors for this rule (other real limits). */
  distractorValues: number[];
  /** False for the rules that were searched for and not found — they must not be tested as law. */
  generationAllowed: boolean;
  reviewStatus: 'VERIFIED' | 'NEEDS_REVIEW';
}

export type QuestionSource = 'CURATED_PACK' | 'AI_GENERATED' | 'ADMIN_AUTHORED';

export interface QuestionGenerationMeta {
  provider: string;
  model: string;
  runId: string;
  generatedAt: string;
  /** Verified fact ids the prompt was built from. */
  factIds: string[];
  tokensUsed: number;
}

export interface IssueReport {
  reportedAt: string;
  userId: string | null;
  channel: 'WHATSAPP' | 'API' | 'ADMIN';
  note: string;
  /**
   * Set when an administrator has looked at the report. Without it the item would sit in
   * the review queue forever after being corrected, and a queue that never drains stops
   * being a signal.
   */
  resolvedAt?: string | null;
  resolvedBy?: string | null;
  resolution?: string | null;
}

export interface RoadSafetyModule {
  id: string;
  code: string;
  titleEn: string;
  titleRw: string;
  summaryEn: string;
  summaryRw: string;
  sortOrder: number;
  status: PublishStatus;
  createdAt: string;
  updatedAt: string;
}

export interface RoadSafetyLesson {
  id: string;
  moduleId: string;
  titleEn: string;
  titleRw: string;
  bodyEn: string;
  bodyRw: string;
  keyPointsEn: string[];
  keyPointsRw: string[];
  citations: SourceCitation[];
  legalVerifiedAt: string | null;
  lastReviewedBy: string | null;
  status: PublishStatus;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export type RoadSignCategory =
  | 'WARNING'
  | 'PROHIBITORY'
  | 'MANDATORY'
  | 'DANGER'
  | 'INFORMATION'
  | 'SERVICE';

export interface RoadSign {
  id: string;
  code: string;
  category: RoadSignCategory;
  nameEn: string;
  nameRw: string;
  meaningEn: string;
  meaningRw: string;
  shape: string;
  colourConvention: string;
  /**
   * Durable key of a real sign image uploaded by an administrator. Sign-identification
   * questions are only published when this exists — an AI-drawn approximation of an
   * official sign would teach the wrong thing. Absent on curriculum-pack rows.
   */
  imageKey?: string | null;
  citations: SourceCitation[];
  legalVerifiedAt: string | null;
  status: PublishStatus;
  createdAt: string;
  updatedAt: string;
}

export type QuestionDifficulty = 'EASY' | 'MEDIUM' | 'HARD';

export interface RoadSafetyQuestion {
  id: string;
  moduleId: string;
  lessonId: string | null;
  questionEn: string;
  questionRw: string;
  optionsEn: string[];
  optionsRw: string[];
  correctIndex: number;
  /**
   * Set for a multiple-answer paper. The WhatsApp comma protocol answers one
   * option per question, so generated multi-answer items stay unpublished unless
   * an exam format explicitly allows them.
   */
  correctIndexes: number[] | null;
  explanationEn: string;
  explanationRw: string;
  difficulty: QuestionDifficulty;
  citations: SourceCitation[];
  legalVerifiedAt: string | null;
  status: PublishStatus;
  /** Verified fact ids this item tests. Revision targeting works through these. */
  factIds: string[];
  source: QuestionSource;
  generation: QuestionGenerationMeta | null;
  /** Why the gate held this item back; empty once an administrator clears it. */
  reviewReasons: string[];
  issueReports: IssueReport[];
  /** Normalised-text hash used by the duplicate detector. */
  fingerprint: string;
  signId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ExamTemplate {
  id: string;
  nameEn: string;
  nameRw: string;
  moduleId: string | null; // null = mixed across published modules
  questionCount: number;
  passPercent: number;
  timeLimitMinutes: number | null;
  /**
   * Server-enforced examination behaviour: no answer key before submission, no
   * resuming after the deadline. Practice papers leave this false.
   */
  strictMode: boolean;
  /**
   * A citation only when the count, duration or pass mark comes from an
   * authoritative source. Null means these are administrator-chosen simulation
   * settings, and the learner is told so.
   */
  officialBasis: SourceCitation | null;
  status: PublishStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ExamAnswer {
  questionId: string;
  selectedIndex: number | null;
  isCorrect: boolean;
  givenAnswerEn: string | null;
  correctAnswerEn: string;
  explanationEn: string;
  explanationRw: string;
  /** Wall-clock seconds the learner took on this item, measured on the server. */
  timeSpentSeconds: number | null;
}

export interface ExamAttempt {
  id: string;
  userId: string;
  kind: 'PRACTICE' | 'MOCK_EXAM' | 'LEARN';
  examTemplateId: string | null;
  moduleId: string | null;
  language: 'ENGLISH' | 'KINYARWANDA';
  questionIds: string[];
  answers: ExamAnswer[];
  /** Autosaved raw picks, index-aligned to questionIds. Null means unanswered. */
  savedAnswers: (number | null)[];
  /**
   * Seconds spent on each item, index-aligned to questionIds, accumulated by the server
   * from the gap between one autosave and the next. Never the client's clock.
   */
  answerSeconds: number[];
  totalQuestions: number;
  correctCount: number;
  scorePercent: number;
  passPercent: number;
  passed: boolean;
  startedAt: string;
  submittedAt: string | null;
  durationSeconds: number | null;
  /** Server-owned deadline. The timer is never the caller's clock. */
  timeLimitSeconds: number | null;
  deadlineAt: string | null;
  strict: boolean;
  /** Hidden until submission in strict mode, so the answer key cannot be read early. */
  answersRevealed: boolean;
  lastActivityAt: string;
}

export interface LessonProgress {
  userId: string;
  lessonId: string;
  completedAt: string;
}

export interface RoadSafetyProgress {
  userId: string;
  lessonsCompleted: number;
  practiceAttempts: number;
  mockExams: number;
  examsPassed: number;
  totalAnswered: number;
  totalCorrect: number;
  bestExamPercent: number;
  /** Seconds per answered question, averaged over the learner's whole history. */
  averageAnswerSeconds: number | null;
  weakestModuleCode: string | null;
  strongestModuleCode: string | null;
  lastActivityAt: string | null;
}

export type SourcePermission =
  | 'OFFICIAL_INSTRUMENT'
  | 'GOVERNMENT_SERVICE_PAGE'
  | 'DISCOVERY_REFERENCE_ONLY'
  | 'LICENCE_REQUIRED';

export type AutomatedAccess = 'PERMITTED' | 'NOT_PERMITTED' | 'UNSTATED';

/**
 * An approved place to look for curriculum. The permission fields are recorded
 * from an actual inspection, so a future crawler cannot quietly decide that a
 * site allowed scraping.
 */
export interface ApprovedSource {
  id: string;
  name: string;
  url: string;
  publisher: string;
  permission: SourcePermission;
  robots: 'ALLOWED' | 'DISALLOWED' | 'ABSENT' | 'NOT_INSPECTED';
  automatedAccess: AutomatedAccess;
  /** Whether content from here may be copied into the question bank. */
  contentReuse: 'COPY_PERMITTED' | 'STRUCTURE_ONLY' | 'NO_ACCESS';
  lastInspectedAt: string;
  notes: string;
}

export interface RoadSafetyGenerationSettings {
  enabled: boolean;
  /** Fresh items asked for per practice/mock session. */
  perSessionMax: number;
  /** Cap per learner per day, so one phone number cannot drain the provider quota. */
  perUserPerDay: number;
  /** When false, generated items always wait in the review queue. */
  autoPublishVerified: boolean;
  dailyTokenBudget: number;
  allowMultiAnswer: boolean;
  allowSignIdentification: boolean;
}

export interface RoadSafetyExamSettings {
  practiceCount: number;
  learnCount: number;
  mockCount: number;
  mockMinutes: number;
  /** Kept separate from the mock pass mark: practice never reports pass/fail. */
  strictModeByDefault: boolean;
}

export interface RoadSafetySettings {
  updatedAt: string;
  updatedBy: string;
  contentRefreshDays: number;
  /** Oldest accepted legalVerifiedAt before a lesson is treated as stale. */
  verificationRequiredToPublish: boolean;
  languages: Array<'ENGLISH' | 'KINYARWANDA'>;
  generation: RoadSafetyGenerationSettings;
  exam: RoadSafetyExamSettings;
  approvedSources: ApprovedSource[];
}

/**
 * What an administrator may send. The nested groups are partial because the repository
 * merges them over the stored values and re-derives every field against the defaults.
 */
export type RoadSafetySettingsPatch = Partial<Omit<RoadSafetySettings, 'generation' | 'exam'>> & {
  generation?: Partial<RoadSafetyGenerationSettings>;
  exam?: Partial<RoadSafetyExamSettings>;
};

export interface QuestionGenerationRun {
  id: string;
  startedAt: string;
  userId: string | null;
  kind: 'PRACTICE' | 'MOCK_EXAM' | 'LEARN' | 'ADMIN_BATCH';
  requested: number;
  /** Verified fact ids the prompt was assembled from. */
  factIds: string[];
  provider: string | null;
  model: string | null;
  candidates: number;
  published: number;
  heldForReview: number;
  tokensUsed: number;
  latencyMs: number;
  /** Provider chain trace, for the operator only. */
  attempts: string[];
  error: string | null;
}

// ---------------------------------------------------------------------------
// Audit trail
// ---------------------------------------------------------------------------

export type AuditActorRole = 'ADMIN' | 'SYSTEM' | 'USER';

export interface AuditEntry {
  id: string;
  actor: string;
  actorRole: AuditActorRole;
  action: string;
  targetType: string;
  targetId: string;
  summary: string;
  before: unknown;
  after: unknown;
  createdAt: string;
}

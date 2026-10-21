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

export type PublishStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

export interface SourceCitation {
  title: string;
  publisher: string;
  url: string;
  accessedOn: string;
  quote?: string;
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
  explanationEn: string;
  explanationRw: string;
  difficulty: QuestionDifficulty;
  citations: SourceCitation[];
  legalVerifiedAt: string | null;
  status: PublishStatus;
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
}

export interface ExamAttempt {
  id: string;
  userId: string;
  kind: 'PRACTICE' | 'MOCK_EXAM';
  examTemplateId: string | null;
  moduleId: string | null;
  language: 'ENGLISH' | 'KINYARWANDA';
  questionIds: string[];
  answers: ExamAnswer[];
  totalQuestions: number;
  correctCount: number;
  scorePercent: number;
  passPercent: number;
  passed: boolean;
  startedAt: string;
  submittedAt: string | null;
  durationSeconds: number | null;
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
  lastActivityAt: string | null;
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

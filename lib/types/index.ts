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
  | 'EMPLOYMENT_MARKETPLACE';

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
    provider: 'PostgreSQL' | 'In-Memory Store';
    latencyMs: number | null;
  };
  redisQueue: {
    status: 'ACTIVE' | 'IN_MEMORY';
    queuedJobs: number;
    activeWorkers: number;
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
}

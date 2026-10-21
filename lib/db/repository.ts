import {
  User,
  JobSource,
  JobListing,
  WorkerProfile,
  EmployerProfile,
  Vacancy,
  JobMatch,
  Conversation,
  Message,
  MediaTask,
  CodingTask,
  StudySession,
  AgentRun,
  ToolCallTrace,
  QueuedJob,
  WebhookEventRecord,
  SystemHealth,
  AgentType,
  Consent,
  UserPreference,
  ServiceDefinition,
  Entitlement,
  TrialGrant,
  PaymentOrder,
  PaymentProof,
  AuditEntry,
  RoadSafetyModule,
  RoadSafetyLesson,
  RoadSign,
  RoadSafetyQuestion,
  ExamTemplate,
  ExamAttempt,
  LessonProgress,
  RoadSafetyProgress,
} from '@/lib/types';
import { GEMINI_MODEL } from '@/lib/gemini';
import { newId } from '@/lib/util/ids';
import { durableStore, withPersistence, type Persistable } from '@/lib/db/store';
import { detectPrismaReadiness } from '@/lib/db/prisma-readiness';
import { getQueueRuntimeSnapshot } from '@/lib/queue/status';

// Boards the platform is configured to read. Health and listing counts stay
// unknown until a real crawl populates them.
const KNOWN_JOB_SOURCES: JobSource[] = [
  {
    id: 'src-mifotra',
    name: 'MIFOTRA E-Recruitment Portal',
    code: 'MIFOTRA',
    baseUrl: 'https://recruitment.mifotra.gov.rw',
    isPermitted: true,
    healthStatus: 'UNKNOWN',
    lastCrawledAt: null,
    activeListingsCount: 0,
  },
  {
    id: 'src-jobinrwanda',
    name: 'Job in Rwanda Official Feed',
    code: 'JOB_IN_RWANDA',
    baseUrl: 'https://www.jobinrwanda.com',
    isPermitted: true,
    healthStatus: 'UNKNOWN',
    lastCrawledAt: null,
    activeListingsCount: 0,
  },
  {
    id: 'src-remote-africa',
    name: 'Global Remote Tech for Africa',
    code: 'REMOTE_TECH',
    baseUrl: 'https://weworkremotely.com',
    isPermitted: true,
    healthStatus: 'UNKNOWN',
    lastCrawledAt: null,
    activeListingsCount: 0,
  },
];

// Singleton in-memory state store that persists across server requests
class AppRepository implements Persistable {
  private users: User[] = [];
  private jobSources: JobSource[] = [...KNOWN_JOB_SOURCES];
  private jobListings: JobListing[] = [];
  private workerProfiles: WorkerProfile[] = [];
  private employerProfiles: EmployerProfile[] = [];
  private vacancies: Vacancy[] = [];
  private jobMatches: JobMatch[] = [];
  private conversations: Conversation[] = [];
  private mediaTasks: MediaTask[] = [];
  private codingTasks: CodingTask[] = [];
  private studySessions: StudySession[] = [];
  private agentRuns: AgentRun[] = [];
  private toolCallTraces: ToolCallTrace[] = [];
  private queuedJobs: QueuedJob[] = [];
  private webhookEvents: WebhookEventRecord[] = [];
  private processedMessageIds: Set<string> = new Set();

  // Consents & Preferences
  private userConsents: Map<string, Consent[]> = new Map();

  private userPreferences: Map<string, UserPreference> = new Map();

  // --- Commercial + academy collections (durable) ---
  private services: ServiceDefinition[] = [];
  private entitlements: Entitlement[] = [];
  private trialGrants: TrialGrant[] = [];
  private paymentOrders: PaymentOrder[] = [];
  private paymentProofs: PaymentProof[] = [];
  private rsModules: RoadSafetyModule[] = [];
  private rsLessons: RoadSafetyLesson[] = [];
  private rsSigns: RoadSign[] = [];
  private rsQuestions: RoadSafetyQuestion[] = [];
  private rsExams: ExamTemplate[] = [];
  private rsAttempts: ExamAttempt[] = [];
  private rsLessonProgress: LessonProgress[] = [];
  private auditLog: AuditEntry[] = [];

  // --- Users ---
  getUsers(): User[] {
    return this.users;
  }

  getUserById(id: string): User | undefined {
    return this.users.find((u) => u.id === id);
  }

  getUserByPhone(phoneNumber: string): User | undefined {
    return this.users.find((u) => u.phoneNumber === phoneNumber);
  }

  getOrCreateUserByPhone(phoneNumber: string, name?: string): User {
    let user = this.getUserByPhone(phoneNumber);
    if (!user) {
      user = {
        id: newId('usr'),
        phoneNumber,
        whatsappId: `wa_${phoneNumber.replace(/\+/g, '')}`,
        fullName: name || 'WhatsApp User',
        preferredLang: 'KINYARWANDA',
        role: 'CANDIDATE',
        isActive: true,
        isBlocked: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      this.users.unshift(user);
    }
    return user;
  }

  updateUser(id: string, updates: Partial<User>): User | undefined {
    const user = this.getUserById(id);
    if (!user) return undefined;
    Object.assign(user, updates, { updatedAt: new Date().toISOString() });
    return user;
  }

  deleteUserData(userId: string): { success: boolean; deletedItems: string[] } {
    this.users = this.users.filter((u) => u.id !== userId);
    this.workerProfiles = this.workerProfiles.filter((w) => w.userId !== userId);
    this.employerProfiles = this.employerProfiles.filter((e) => e.userId !== userId);
    this.conversations = this.conversations.filter((c) => c.userId !== userId);
    this.mediaTasks = this.mediaTasks.filter((m) => m.userId !== userId);
    this.codingTasks = this.codingTasks.filter((c) => c.userId !== userId);
    this.studySessions = this.studySessions.filter((s) => s.userId !== userId);
    this.userConsents.delete(userId);
    this.userPreferences.delete(userId);
    return {
      success: true,
      deletedItems: ['profile', 'conversations', 'media', 'code', 'consents'],
    };
  }

  // --- Jobs ---
  getSources(): JobSource[] {
    return this.jobSources;
  }

  getJobs(filter?: {
    keyword?: string;
    sourceCode?: string;
    isRemote?: boolean;
    verificationStatus?: string;
  }): JobListing[] {
    return this.jobListings.filter((job) => {
      if (filter?.sourceCode && filter.sourceCode !== 'ALL') {
        const source = this.jobSources.find((s) => s.code === filter.sourceCode);
        if (source && job.sourceId !== source.id) return false;
      }
      if (filter?.isRemote !== undefined) {
        const isJobRemote = job.jobType === 'REMOTE' || job.location.toLowerCase().includes('remote');
        if (filter.isRemote && !isJobRemote) return false;
      }
      if (filter?.verificationStatus && filter.verificationStatus !== 'ALL') {
        if (job.verificationStatus !== filter.verificationStatus) return false;
      }
      if (filter?.keyword) {
        const q = filter.keyword.toLowerCase();
        const matches =
          job.title.toLowerCase().includes(q) ||
          job.employer.toLowerCase().includes(q) ||
          job.location.toLowerCase().includes(q) ||
          job.tags.some((t) => t.toLowerCase().includes(q));
        if (!matches) return false;
      }
      return true;
    });
  }

  getJobById(id: string): JobListing | undefined {
    return this.jobListings.find((j) => j.id === id);
  }

  addJobListing(job: Omit<JobListing, 'id' | 'discoveredAt' | 'lastVerifiedAt'>): JobListing {
    const newJob: JobListing = {
      ...job,
      id: newId('job'),
      discoveredAt: new Date().toISOString(),
      lastVerifiedAt: new Date().toISOString(),
    };
    this.jobListings.unshift(newJob);
    return newJob;
  }

  verifyJob(id: string): JobListing | undefined {
    const job = this.getJobById(id);
    if (!job) return undefined;
    job.verificationStatus = 'VERIFIED';
    job.lastVerifiedAt = new Date().toISOString();
    return job;
  }

  triggerSourceCrawl(sourceCode: string): { status: string; crawledCount: number } {
    // No live crawler is wired to these boards yet, so a crawl yields nothing and
    // must not rewrite source health.
    const source = this.jobSources.find((s) => s.code === sourceCode);
    if (!source) return { status: 'UNKNOWN_SOURCE', crawledCount: 0 };
    return { status: 'NOT_CONFIGURED', crawledCount: 0 };
  }

  // --- Employment Marketplace ---
  getWorkerProfiles(): WorkerProfile[] {
    return this.workerProfiles;
  }

  getEmployerProfiles(): EmployerProfile[] {
    return this.employerProfiles;
  }

  getVacancies(): Vacancy[] {
    return this.vacancies;
  }

  getJobMatches(): JobMatch[] {
    return this.jobMatches;
  }

  createWorkerProfile(profile: Omit<WorkerProfile, 'id' | 'rating' | 'completedJobsCount'>): WorkerProfile {
    const newProfile: WorkerProfile = {
      ...profile,
      id: newId('wp'),
      rating: 0,
      completedJobsCount: 0,
    };
    this.workerProfiles.unshift(newProfile);
    this.recalculateMatchesForWorker(newProfile);
    return newProfile;
  }

  private recalculateMatchesForWorker(worker: WorkerProfile): void {
    // Check match against vacancies
    for (const vac of this.vacancies) {
      const matched = worker.skills.filter((s) =>
        vac.requiredSkills.some((rs) => rs.toLowerCase() === s.toLowerCase())
      );
      const missing = vac.requiredSkills.filter(
        (rs) => !worker.skills.some((s) => s.toLowerCase() === rs.toLowerCase())
      );
      const skillScore = Math.round((matched.length / Math.max(vac.requiredSkills.length, 1)) * 100);
      const isLocationMatched =
        vac.location.toLowerCase().includes('remote') ||
        vac.location.toLowerCase().includes('kigali') ||
        worker.district.toLowerCase().includes('kigali');
      const locationBonus = isLocationMatched ? 10 : 0;
      const experienceBonus = Math.min(worker.experienceYrs * 2, 10);
      const finalScore = Math.min(100, Math.round(skillScore * 0.8 + locationBonus + experienceBonus));

      if (finalScore >= 50) {
        this.jobMatches.unshift({
          id: `match-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          workerId: worker.id,
          workerName: worker.fullName,
          workerTitle: worker.title,
          vacancyId: vac.id,
          targetTitle: vac.title,
          score: finalScore,
          explainability: {
            skillsMatchPercentage: skillScore,
            locationMatch: isLocationMatched,
            experienceScore: Math.min(100, worker.experienceYrs * 20),
            matchedSkills: matched,
            missingSkills: missing,
            rationale: `${skillScore}% skills match (${matched.join(', ') || 'None'}); verified experience: ${worker.experienceYrs} yrs.`,
          },
          isContacted: false,
          createdAt: new Date().toISOString(),
        });
      }
    }
  }

  // --- Conversations & Messages ---
  getConversations(): Conversation[] {
    return this.conversations;
  }

  getConversationById(id: string): Conversation | undefined {
    return this.conversations.find((c) => c.id === id);
  }

  getOrCreateConversation(userId: string): Conversation {
    let conv = this.conversations.find((c) => c.userId === userId && c.isActive);
    if (!conv) {
      conv = {
        id: newId('conv'),
        userId,
        lastAgent: 'ROUTER',
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        messages: [],
        memories: {},
      };
      this.conversations.unshift(conv);
    }
    return conv;
  }

  addMessage(
    conversationId: string,
    message: Omit<Message, 'id' | 'conversationId' | 'timestamp'>
  ): Message {
    const conv = this.getConversationById(conversationId);
    const newMsg: Message = {
      ...message,
      id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      conversationId,
      timestamp: new Date().toISOString(),
    };
    if (conv) {
      conv.messages.push(newMsg);
      conv.updatedAt = new Date().toISOString();
    }
    return newMsg;
  }

  setConversationAgent(conversationId: string, agent: AgentType): void {
    const conv = this.getConversationById(conversationId);
    if (conv) {
      conv.lastAgent = agent;
      conv.updatedAt = new Date().toISOString();
    }
  }

  updateConversation(
    conversationId: string,
    patch: Partial<Pick<Conversation, 'lastAgent' | 'activeServiceCode' | 'menuSentAt' | 'isActive'>>
  ): Conversation | undefined {
    const conv = this.getConversationById(conversationId);
    if (!conv) return undefined;
    Object.assign(conv, patch, { id: conv.id, userId: conv.userId, createdAt: conv.createdAt, updatedAt: new Date().toISOString() });
    return conv;
  }

  // --- Webhook Deduplication ---
  isMessageAlreadyProcessed(waMessageId: string): boolean {
    return this.processedMessageIds.has(waMessageId);
  }

  markMessageProcessed(waMessageId: string): void {
    this.processedMessageIds.add(waMessageId);
  }

  getWebhookEvents(): WebhookEventRecord[] {
    return this.webhookEvents;
  }

  recordWebhookEvent(event: Omit<WebhookEventRecord, 'id' | 'receivedAt'>): WebhookEventRecord {
    const record: WebhookEventRecord = {
      ...event,
      id: newId('wh'),
      receivedAt: new Date().toISOString(),
    };
    this.webhookEvents.unshift(record);
    if (this.webhookEvents.length > 100) this.webhookEvents.pop();
    return record;
  }

  // --- Queue Jobs ---
  getQueuedJobs(): QueuedJob[] {
    return this.queuedJobs;
  }

  enqueueJob(name: string, data: Record<string, unknown>, maxAttempts = 3): QueuedJob {
    const job: QueuedJob = {
      id: `qjob-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      name,
      data,
      status: 'QUEUED',
      attempts: 0,
      maxAttempts,
      enqueuedAt: new Date().toISOString(),
    };
    this.queuedJobs.unshift(job);
    return job;
  }

  updateJobStatus(
    id: string,
    status: QueuedJob['status'],
    failedReason?: string
  ): void {
    const job = this.queuedJobs.find((j) => j.id === id);
    if (job) {
      job.status = status;
      if (status === 'PROCESSING') job.attempts++;
      if (status === 'COMPLETED' || status === 'FAILED') {
        job.processedAt = new Date().toISOString();
      }
      if (failedReason) {
        job.failedReason = failedReason;
      }
    }
  }

  // --- Media Tasks ---
  getMediaTasks(): MediaTask[] {
    return this.mediaTasks;
  }

  createMediaTask(task: Omit<MediaTask, 'id' | 'createdAt' | 'status' | 'processedUrl'>): MediaTask {
    const newTask: MediaTask = {
      ...task,
      id: newId('med'),
      status: 'PENDING',
      createdAt: new Date().toISOString(),
    };
    this.mediaTasks.unshift(newTask);
    return newTask;
  }

  // --- Coding Tasks ---
  getCodingTasks(): CodingTask[] {
    return this.codingTasks;
  }

  createCodingTask(task: Omit<CodingTask, 'id' | 'createdAt'>): CodingTask {
    const newTask: CodingTask = {
      ...task,
      id: newId('code'),
      createdAt: new Date().toISOString(),
    };
    this.codingTasks.unshift(newTask);
    return newTask;
  }

  // --- Study Sessions ---
  getStudySessions(): StudySession[] {
    return this.studySessions;
  }

  createStudySession(session: Omit<StudySession, 'id' | 'createdAt'> & { id?: string }): StudySession {
    const newSession: StudySession = {
      ...session,
      id: session.id || newId('study'),
      createdAt: new Date().toISOString(),
    };
    this.studySessions.unshift(newSession);
    return newSession;
  }

  // --- Agent Runs & Traces ---
  getAgentRuns(): AgentRun[] {
    return this.agentRuns;
  }

  getToolCallTraces(): ToolCallTrace[] {
    return this.toolCallTraces;
  }

  recordAgentRun(
    run: Omit<AgentRun, 'id' | 'createdAt'>,
    traces: Array<Omit<ToolCallTrace, 'id' | 'agentRunId' | 'timestamp'>> = []
  ): AgentRun {
    const newRun: AgentRun = {
      ...run,
      id: newId('run'),
      createdAt: new Date().toISOString(),
    };
    this.agentRuns.unshift(newRun);

    for (const trace of traces) {
      this.toolCallTraces.unshift({
        ...trace,
        id: `tc-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        agentRunId: newRun.id,
        timestamp: new Date().toISOString(),
      });
    }

    return newRun;
  }

  // --- Service catalog ---
  getServices(): ServiceDefinition[] {
    return this.services;
  }

  getServiceByCode(code: string): ServiceDefinition | undefined {
    return this.services.find((s) => s.code === code);
  }

  getWhatsAppMenuServices(): ServiceDefinition[] {
    return this.services
      .filter((s) => s.isEnabled && s.showInWhatsAppMenu)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.nameEn.localeCompare(b.nameEn));
  }

  createService(input: Omit<ServiceDefinition, 'id' | 'createdAt' | 'updatedAt'>): ServiceDefinition {
    if (this.services.some((s) => s.code === input.code)) {
      throw new Error(`A service with code ${input.code} already exists`);
    }
    const now = new Date().toISOString();
    const created: ServiceDefinition = { ...input, id: newId('svc'), createdAt: now, updatedAt: now };
    this.services.push(created);
    return created;
  }

  updateService(code: string, patch: Partial<ServiceDefinition>): ServiceDefinition | undefined {
    const svc = this.getServiceByCode(code);
    if (!svc) return undefined;
    Object.assign(svc, patch, { id: svc.id, code: svc.code, createdAt: svc.createdAt, updatedAt: new Date().toISOString() });
    return svc;
  }

  deleteService(code: string): boolean {
    const before = this.services.length;
    this.services = this.services.filter((s) => s.code !== code);
    return this.services.length < before;
  }

  // --- Entitlements & trial grants ---
  getEntitlement(userId: string, serviceCode: string): Entitlement | undefined {
    return this.entitlements.find((e) => e.userId === userId && e.serviceCode === serviceCode);
  }

  getEntitlements(): Entitlement[] {
    return this.entitlements;
  }

  getEntitlementsForUser(userId: string): Entitlement[] {
    return this.entitlements.filter((e) => e.userId === userId);
  }

  createEntitlement(input: Omit<Entitlement, 'id' | 'createdAt' | 'updatedAt'>): Entitlement {
    const existing = this.getEntitlement(input.userId, input.serviceCode);
    if (existing) return existing;
    const now = new Date().toISOString();
    const created: Entitlement = { ...input, id: newId('ent'), createdAt: now, updatedAt: now };
    this.entitlements.push(created);
    return created;
  }

  updateEntitlement(id: string, patch: Partial<Entitlement>): Entitlement | undefined {
    const ent = this.entitlements.find((e) => e.id === id);
    if (!ent) return undefined;
    Object.assign(ent, patch, { id: ent.id, userId: ent.userId, serviceCode: ent.serviceCode, createdAt: ent.createdAt, updatedAt: new Date().toISOString() });
    return ent;
  }

  findTrialGrants(userId: string, serviceCode: string, identityKey?: string): TrialGrant[] {
    return this.trialGrants.filter(
      (g) =>
        g.serviceCode === serviceCode &&
        (g.userId === userId || (identityKey !== undefined && g.identityKey === identityKey))
    );
  }

  getAllTrialGrants(): TrialGrant[] {
    return this.trialGrants;
  }

  recordTrialGrant(input: Omit<TrialGrant, 'id'>): TrialGrant {
    const created: TrialGrant = { ...input, id: newId('trg') };
    this.trialGrants.push(created);
    return created;
  }

  // --- Payment orders & proofs ---
  getPaymentOrders(): PaymentOrder[] {
    return this.paymentOrders;
  }

  getPaymentOrderById(id: string): PaymentOrder | undefined {
    return this.paymentOrders.find((o) => o.id === id);
  }

  getPaymentOrderByReference(reference: string): PaymentOrder | undefined {
    const needle = reference.trim().toUpperCase();
    return this.paymentOrders.find((o) => o.reference.toUpperCase() === needle);
  }

  getPaymentOrderByIdempotencyKey(key: string): PaymentOrder | undefined {
    return this.paymentOrders.find((o) => o.idempotencyKey === key);
  }

  getPaymentOrdersForUser(userId: string): PaymentOrder[] {
    return this.paymentOrders.filter((o) => o.userId === userId);
  }

  createPaymentOrder(input: Omit<PaymentOrder, 'id' | 'createdAt' | 'updatedAt'>): PaymentOrder {
    const now = new Date().toISOString();
    const created: PaymentOrder = { ...input, id: newId('pay'), createdAt: now, updatedAt: now };
    this.paymentOrders.unshift(created);
    return created;
  }

  updatePaymentOrder(id: string, patch: Partial<PaymentOrder>): PaymentOrder | undefined {
    const order = this.getPaymentOrderById(id);
    if (!order) return undefined;
    Object.assign(order, patch, {
      id: order.id,
      reference: order.reference,
      userId: order.userId,
      idempotencyKey: order.idempotencyKey,
      createdAt: order.createdAt,
      updatedAt: new Date().toISOString(),
    });
    return order;
  }

  getPaymentProofs(orderId?: string): PaymentProof[] {
    return orderId ? this.paymentProofs.filter((p) => p.orderId === orderId) : this.paymentProofs;
  }

  getPaymentProofById(id: string): PaymentProof | undefined {
    return this.paymentProofs.find((p) => p.id === id);
  }

  findPaymentProofsByHash(sha256: string, excludeId?: string): PaymentProof[] {
    return this.paymentProofs.filter((p) => p.sha256 === sha256 && p.id !== excludeId);
  }

  createPaymentProof(input: Omit<PaymentProof, 'id' | 'createdAt'>): PaymentProof {
    const created: PaymentProof = { ...input, id: newId('prf'), createdAt: new Date().toISOString() };
    this.paymentProofs.unshift(created);
    return created;
  }

  updatePaymentProof(id: string, patch: Partial<PaymentProof>): PaymentProof | undefined {
    const proof = this.getPaymentProofById(id);
    if (!proof) return undefined;
    Object.assign(proof, patch, { id: proof.id, orderId: proof.orderId, createdAt: proof.createdAt });
    return proof;
  }

  // --- Road Safety Academy content ---
  getRoadSafetyModules(): RoadSafetyModule[] {
    return this.rsModules;
  }

  createRoadSafetyModule(input: Omit<RoadSafetyModule, 'id' | 'createdAt' | 'updatedAt'>): RoadSafetyModule {
    const now = new Date().toISOString();
    const created: RoadSafetyModule = { ...input, id: newId('mod'), createdAt: now, updatedAt: now };
    this.rsModules.push(created);
    return created;
  }

  updateRoadSafetyModule(id: string, patch: Partial<RoadSafetyModule>): RoadSafetyModule | undefined {
    const row = this.rsModules.find((m) => m.id === id);
    if (!row) return undefined;
    Object.assign(row, patch, { id: row.id, createdAt: row.createdAt, updatedAt: new Date().toISOString() });
    return row;
  }

  getRoadSafetyLessons(moduleId?: string): RoadSafetyLesson[] {
    const rows = moduleId ? this.rsLessons.filter((l) => l.moduleId === moduleId) : this.rsLessons;
    return [...rows].sort((a, b) => a.sortOrder - b.sortOrder);
  }

  getRoadSafetyLessonById(id: string): RoadSafetyLesson | undefined {
    return this.rsLessons.find((l) => l.id === id);
  }

  createRoadSafetyLesson(input: Omit<RoadSafetyLesson, 'id' | 'createdAt' | 'updatedAt'>): RoadSafetyLesson {
    const now = new Date().toISOString();
    const created: RoadSafetyLesson = { ...input, id: newId('les'), createdAt: now, updatedAt: now };
    this.rsLessons.push(created);
    return created;
  }

  updateRoadSafetyLesson(id: string, patch: Partial<RoadSafetyLesson>): RoadSafetyLesson | undefined {
    const row = this.getRoadSafetyLessonById(id);
    if (!row) return undefined;
    Object.assign(row, patch, { id: row.id, createdAt: row.createdAt, updatedAt: new Date().toISOString() });
    return row;
  }

  deleteRoadSafetyLesson(id: string): boolean {
    const before = this.rsLessons.length;
    this.rsLessons = this.rsLessons.filter((l) => l.id !== id);
    return this.rsLessons.length < before;
  }

  getRoadSigns(): RoadSign[] {
    return this.rsSigns;
  }

  createRoadSign(input: Omit<RoadSign, 'id' | 'createdAt' | 'updatedAt'>): RoadSign {
    const now = new Date().toISOString();
    const created: RoadSign = { ...input, id: newId('sign'), createdAt: now, updatedAt: now };
    this.rsSigns.push(created);
    return created;
  }

  updateRoadSign(id: string, patch: Partial<RoadSign>): RoadSign | undefined {
    const row = this.rsSigns.find((s) => s.id === id);
    if (!row) return undefined;
    Object.assign(row, patch, { id: row.id, createdAt: row.createdAt, updatedAt: new Date().toISOString() });
    return row;
  }

  getRoadSafetyQuestions(moduleId?: string): RoadSafetyQuestion[] {
    return moduleId ? this.rsQuestions.filter((q) => q.moduleId === moduleId) : this.rsQuestions;
  }

  getRoadSafetyQuestionById(id: string): RoadSafetyQuestion | undefined {
    return this.rsQuestions.find((q) => q.id === id);
  }

  createRoadSafetyQuestion(input: Omit<RoadSafetyQuestion, 'id' | 'createdAt' | 'updatedAt'>): RoadSafetyQuestion {
    const now = new Date().toISOString();
    const created: RoadSafetyQuestion = { ...input, id: newId('q'), createdAt: now, updatedAt: now };
    this.rsQuestions.push(created);
    return created;
  }

  updateRoadSafetyQuestion(id: string, patch: Partial<RoadSafetyQuestion>): RoadSafetyQuestion | undefined {
    const row = this.getRoadSafetyQuestionById(id);
    if (!row) return undefined;
    Object.assign(row, patch, { id: row.id, createdAt: row.createdAt, updatedAt: new Date().toISOString() });
    return row;
  }

  deleteRoadSafetyQuestion(id: string): boolean {
    const before = this.rsQuestions.length;
    this.rsQuestions = this.rsQuestions.filter((q) => q.id !== id);
    return this.rsQuestions.length < before;
  }

  getExamTemplates(): ExamTemplate[] {
    return this.rsExams;
  }

  getExamTemplateById(id: string): ExamTemplate | undefined {
    return this.rsExams.find((e) => e.id === id);
  }

  createExamTemplate(input: Omit<ExamTemplate, 'id' | 'createdAt' | 'updatedAt'>): ExamTemplate {
    const now = new Date().toISOString();
    const created: ExamTemplate = { ...input, id: newId('exam'), createdAt: now, updatedAt: now };
    this.rsExams.push(created);
    return created;
  }

  updateExamTemplate(id: string, patch: Partial<ExamTemplate>): ExamTemplate | undefined {
    const row = this.getExamTemplateById(id);
    if (!row) return undefined;
    Object.assign(row, patch, { id: row.id, createdAt: row.createdAt, updatedAt: new Date().toISOString() });
    return row;
  }

  getExamAttempts(userId?: string): ExamAttempt[] {
    return userId ? this.rsAttempts.filter((a) => a.userId === userId) : this.rsAttempts;
  }

  getExamAttemptById(id: string): ExamAttempt | undefined {
    return this.rsAttempts.find((a) => a.id === id);
  }

  recordExamAttempt(input: Omit<ExamAttempt, 'id'>): ExamAttempt {
    const created: ExamAttempt = { ...input, id: newId('att') };
    this.rsAttempts.unshift(created);
    if (this.rsAttempts.length > 5000) this.rsAttempts.length = 5000;
    return created;
  }

  /** Writes the graded result back onto the pending attempt instead of cloning it. */
  recordExamResult(
    attemptId: string,
    patch: Partial<Pick<ExamAttempt, 'answers' | 'correctCount' | 'scorePercent' | 'passed' | 'submittedAt' | 'durationSeconds'>>
  ): ExamAttempt {
    const attempt = this.getExamAttemptById(attemptId);
    if (!attempt) throw new Error(`Exam attempt ${attemptId} no longer exists`);
    Object.assign(attempt, patch);
    return attempt;
  }

  getLessonProgress(userId: string): LessonProgress[] {
    return this.rsLessonProgress.filter((p) => p.userId === userId);
  }

  markLessonCompleted(userId: string, lessonId: string): LessonProgress {
    const existing = this.rsLessonProgress.find((p) => p.userId === userId && p.lessonId === lessonId);
    if (existing) return existing;
    const created: LessonProgress = { userId, lessonId, completedAt: new Date().toISOString() };
    this.rsLessonProgress.push(created);
    return created;
  }

  // --- Audit trail ---
  getAuditLog(limit = 200): AuditEntry[] {
    return this.auditLog.slice(0, limit);
  }

  appendAudit(input: Omit<AuditEntry, 'id' | 'createdAt'>): AuditEntry {
    const created: AuditEntry = { ...input, id: newId('aud'), createdAt: new Date().toISOString() };
    this.auditLog.unshift(created);
    if (this.auditLog.length > 2000) this.auditLog.length = 2000;
    return created;
  }

  // --- Durability bridge ---
  exportState(): Record<string, unknown> {
    return {
      users: this.users,
      jobListings: this.jobListings,
      workerProfiles: this.workerProfiles,
      employerProfiles: this.employerProfiles,
      vacancies: this.vacancies,
      jobMatches: this.jobMatches,
      conversations: this.conversations.map((c) => ({ ...c, messages: c.messages.slice(-500) })),
      mediaTasks: this.mediaTasks,
      codingTasks: this.codingTasks,
      studySessions: this.studySessions,
      agentRuns: this.agentRuns.slice(0, 500),
      toolCallTraces: this.toolCallTraces.slice(0, 1000),
      queuedJobs: this.queuedJobs.slice(0, 300),
      webhookEvents: this.webhookEvents,
      processedMessageIds: Array.from(this.processedMessageIds).slice(-3000),
      services: this.services,
      entitlements: this.entitlements,
      trialGrants: this.trialGrants,
      paymentOrders: this.paymentOrders,
      paymentProofs: this.paymentProofs,
      rsModules: this.rsModules,
      rsLessons: this.rsLessons,
      rsSigns: this.rsSigns,
      rsQuestions: this.rsQuestions,
      rsExams: this.rsExams,
      rsAttempts: this.rsAttempts,
      rsLessonProgress: this.rsLessonProgress,
      auditLog: this.auditLog,
    };
  }

  hydrateState(state: Record<string, unknown>): void {
    const arr = <T>(key: string, fallback: T[]): T[] =>
      Array.isArray(state[key]) ? (state[key] as T[]) : fallback;

    this.users = arr<User>('users', this.users);
    this.jobListings = arr<JobListing>('jobListings', this.jobListings);
    this.workerProfiles = arr<WorkerProfile>('workerProfiles', this.workerProfiles);
    this.employerProfiles = arr<EmployerProfile>('employerProfiles', this.employerProfiles);
    this.vacancies = arr<Vacancy>('vacancies', this.vacancies);
    this.jobMatches = arr<JobMatch>('jobMatches', this.jobMatches);
    this.conversations = arr<Conversation>('conversations', this.conversations);
    this.mediaTasks = arr<MediaTask>('mediaTasks', this.mediaTasks);
    this.codingTasks = arr<CodingTask>('codingTasks', this.codingTasks);
    this.studySessions = arr<StudySession>('studySessions', this.studySessions);
    this.agentRuns = arr<AgentRun>('agentRuns', this.agentRuns);
    this.toolCallTraces = arr<ToolCallTrace>('toolCallTraces', this.toolCallTraces);
    this.queuedJobs = arr<QueuedJob>('queuedJobs', this.queuedJobs);
    this.webhookEvents = arr<WebhookEventRecord>('webhookEvents', this.webhookEvents);
    this.processedMessageIds = new Set(arr<string>('processedMessageIds', []));
    this.services = arr<ServiceDefinition>('services', this.services);
    this.entitlements = arr<Entitlement>('entitlements', this.entitlements);
    this.trialGrants = arr<TrialGrant>('trialGrants', this.trialGrants);
    this.paymentOrders = arr<PaymentOrder>('paymentOrders', this.paymentOrders);
    this.paymentProofs = arr<PaymentProof>('paymentProofs', this.paymentProofs);
    this.rsModules = arr<RoadSafetyModule>('rsModules', this.rsModules);
    this.rsLessons = arr<RoadSafetyLesson>('rsLessons', this.rsLessons);
    this.rsSigns = arr<RoadSign>('rsSigns', this.rsSigns);
    this.rsQuestions = arr<RoadSafetyQuestion>('rsQuestions', this.rsQuestions);
    this.rsExams = arr<ExamTemplate>('rsExams', this.rsExams);
    this.rsAttempts = arr<ExamAttempt>('rsAttempts', this.rsAttempts);
    this.rsLessonProgress = arr<LessonProgress>('rsLessonProgress', this.rsLessonProgress);
    this.auditLog = arr<AuditEntry>('auditLog', this.auditLog);
  }

  // --- Health & Metrics ---
  getSystemHealth(): SystemHealth {
    const isWaConfigured = Boolean(
      process.env.WHATSAPP_PHONE_NUMBER_ID &&
      process.env.WHATSAPP_PHONE_NUMBER_ID !== '109876543210987' &&
      process.env.WHATSAPP_ACCESS_TOKEN
    );
    const isGeminiConfigured = Boolean(
      process.env.GEMINI_API_KEY &&
      process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY'
    );

    const isSignatureEnforced = Boolean(
      process.env.WHATSAPP_APP_SECRET &&
      process.env.WHATSAPP_APP_SECRET !== 'replace_with_meta_app_secret_for_sha256_signature_verification'
    );

    const persistence = durableStore.status;
    const prisma = detectPrismaReadiness();
    const queue = getQueueRuntimeSnapshot();

    return {
      status: isWaConfigured && isGeminiConfigured && isSignatureEnforced ? 'OPTIMAL' : 'DEGRADED',
      uptimeSeconds: Math.floor(process.uptime()),
      database: {
        status: persistence.mode === 'FILE_BACKED_JSON' ? 'CONNECTED' : 'IN_MEMORY',
        provider:
          prisma.applied
            ? 'PostgreSQL'
            : persistence.mode === 'FILE_BACKED_JSON'
              ? 'File-Backed JSON Store'
              : 'In-Memory Store',
        latencyMs: null,
      },
      redisQueue: {
        status: queue.engine === 'REDIS_BULLMQ' ? 'ACTIVE' : 'IN_MEMORY',
        mode: queue.mode,
        queuedJobs: this.queuedJobs.filter((j) => j.status === 'QUEUED').length,
        activeWorkers: queue.activeWorkers,
        lastError: queue.lastError,
      },
      whatsappApi: {
        configured: isWaConfigured,
        mode: isWaConfigured ? 'PRODUCTION' : 'NOT_CONFIGURED',
        webhookVerified: isSignatureEnforced,
        phoneNumberId: isWaConfigured ? process.env.WHATSAPP_PHONE_NUMBER_ID : undefined,
      },
      geminiAi: {
        configured: isGeminiConfigured,
        model: GEMINI_MODEL,
        bilingualKinyarwandaSupport: true,
      },
      stats: {
        totalUsers: this.users.length,
        conversations: this.conversations.length,
        messages: this.conversations.reduce((n, c) => n + c.messages.length, 0),
        verifiedJobListings: this.jobListings.filter((j) => j.verificationStatus === 'VERIFIED').length,
        agentRuns: this.agentRuns.length,
        toolCalls: this.toolCallTraces.length,
      },
      persistence: {
        mode: persistence.mode,
        loadedFromDisk: persistence.loadedFromDisk,
        lastSavedAt: persistence.lastSavedAt,
        lastSaveError: persistence.lastSaveError,
        records: persistence.records,
      },
      productionDatabase: prisma,
    };
  }

  /** Counts used by the operations dashboard. */
  getCommercialStats() {
    return {
      services: this.services.length,
      enabledServices: this.services.filter((s) => s.isEnabled).length,
      chargeableServices: this.services.filter((s) => !s.isFree && s.chargeEnabled).length,
      entitlements: this.entitlements.length,
      activeTrials: this.entitlements.filter((e) => e.status === 'TRIAL').length,
      trialGrants: this.trialGrants.length,
      paymentOrders: this.paymentOrders.length,
      awaitingProof: this.paymentOrders.filter((o) => o.status === 'AWAITING_PROOF').length,
      awaitingReview: this.paymentOrders.filter((o) => o.status === 'PROOF_UPLOADED' || o.status === 'UNDER_REVIEW').length,
      verifiedPayments: this.paymentOrders.filter((o) => o.status === 'VERIFIED').length,
      rejectedPayments: this.paymentOrders.filter((o) => o.status === 'REJECTED').length,
      proofs: this.paymentProofs.length,
      highRiskProofs: this.paymentProofs.filter((p) => p.riskBand === 'HIGH').length,
      auditEntries: this.auditLog.length,
    };
  }

  getRoadSafetyStats() {
    return {
      modules: this.rsModules.length,
      lessons: this.rsLessons.length,
      publishedLessons: this.rsLessons.filter((l) => l.status === 'PUBLISHED').length,
      lessonsWithoutCitation: this.rsLessons.filter((l) => l.citations.length === 0).length,
      questions: this.rsQuestions.length,
      publishedQuestions: this.rsQuestions.filter((q) => q.status === 'PUBLISHED').length,
      signs: this.rsSigns.length,
      exams: this.rsExams.length,
      attempts: this.rsAttempts.length,
      passedAttempts: this.rsAttempts.filter((a) => a.passed).length,
    };
  }
}

// Global repository singleton, hydrated from and flushed to durable storage
export const repo = withPersistence(new AppRepository());

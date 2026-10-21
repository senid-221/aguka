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
} from '@/lib/types';
import {
  INITIAL_JOB_SOURCES,
  INITIAL_JOB_LISTINGS,
  INITIAL_USERS,
  INITIAL_WORKER_PROFILES,
  INITIAL_EMPLOYER_PROFILES,
  INITIAL_VACANCIES,
  INITIAL_JOB_MATCHES,
  INITIAL_CONVERSATIONS,
  INITIAL_MEDIA_TASKS,
  INITIAL_CODING_TASKS,
  INITIAL_STUDY_SESSIONS,
  INITIAL_AGENT_RUNS,
  INITIAL_TOOL_CALL_TRACES,
  INITIAL_QUEUED_JOBS,
  INITIAL_WEBHOOK_EVENTS,
} from './mock-data';

// Singleton in-memory state store that persists across server requests
class AppRepository {
  private users: User[] = [...INITIAL_USERS];
  private jobSources: JobSource[] = [...INITIAL_JOB_SOURCES];
  private jobListings: JobListing[] = [...INITIAL_JOB_LISTINGS];
  private workerProfiles: WorkerProfile[] = [...INITIAL_WORKER_PROFILES];
  private employerProfiles: EmployerProfile[] = [...INITIAL_EMPLOYER_PROFILES];
  private vacancies: Vacancy[] = [...INITIAL_VACANCIES];
  private jobMatches: JobMatch[] = [...INITIAL_JOB_MATCHES];
  private conversations: Conversation[] = [...INITIAL_CONVERSATIONS];
  private mediaTasks: MediaTask[] = [...INITIAL_MEDIA_TASKS];
  private codingTasks: CodingTask[] = [...INITIAL_CODING_TASKS];
  private studySessions: StudySession[] = [...INITIAL_STUDY_SESSIONS];
  private agentRuns: AgentRun[] = [...INITIAL_AGENT_RUNS];
  private toolCallTraces: ToolCallTrace[] = [...INITIAL_TOOL_CALL_TRACES];
  private queuedJobs: QueuedJob[] = [...INITIAL_QUEUED_JOBS];
  private webhookEvents: WebhookEventRecord[] = [...INITIAL_WEBHOOK_EVENTS];
  private processedMessageIds: Set<string> = new Set([
    'wamid.HBgLMjUwNzg4OTEyMzQ1FQIAEhgg...',
    'wamid.HBgLMjUwNzgwMTEyMjMzFQIAEhgg...',
  ]);

  // Consents & Preferences
  private userConsents: Map<string, Consent[]> = new Map([
    [
      'usr-rw-01',
      [
        { id: 'c-1', userId: 'usr-rw-01', type: 'TERMS_OF_SERVICE', granted: true, grantedAt: '2026-10-01T10:00:00Z' },
        { id: 'c-2', userId: 'usr-rw-01', type: 'PRIVACY_POLICY', granted: true, grantedAt: '2026-10-01T10:00:00Z' },
        { id: 'c-3', userId: 'usr-rw-01', type: 'JOB_ALERTS', granted: true, grantedAt: '2026-10-01T10:00:00Z' },
      ],
    ],
  ]);

  private userPreferences: Map<string, UserPreference> = new Map([
    [
      'usr-rw-01',
      {
        id: 'pref-1',
        userId: 'usr-rw-01',
        quietHoursStart: '21:00',
        quietHoursEnd: '07:00',
        notifyViaSms: false,
        notifyViaWa: true,
        autoCvSharing: false,
      },
    ],
  ]);

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
        id: `usr-${Date.now()}`,
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
      id: `job-${Date.now()}`,
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
    const source = this.jobSources.find((s) => s.code === sourceCode);
    if (source) {
      source.lastCrawledAt = new Date().toISOString();
      source.healthStatus = 'HEALTHY';
    }
    return { status: 'SUCCESS', crawledCount: 4 };
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
      id: `wp-${Date.now()}`,
      rating: 5.0,
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
        id: `conv-${Date.now()}`,
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
      id: `wh-${Date.now()}`,
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

  enqueueJob(name: string, data: Record<string, unknown>): QueuedJob {
    const job: QueuedJob = {
      id: `qjob-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      name,
      data,
      status: 'QUEUED',
      attempts: 0,
      maxAttempts: 3,
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

  createMediaTask(task: Omit<MediaTask, 'id' | 'createdAt' | 'status'>): MediaTask {
    const newTask: MediaTask = {
      ...task,
      id: `med-${Date.now()}`,
      status: 'COMPLETED',
      createdAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      processedUrl: task.originalUrl,
    };
    this.mediaTasks.unshift(newTask);
    return newTask;
  }

  // --- Coding Tasks ---
  getCodingTasks(): CodingTask[] {
    return this.codingTasks;
  }

  createCodingTask(task: Omit<CodingTask, 'id' | 'createdAt' | 'status'>): CodingTask {
    const newTask: CodingTask = {
      ...task,
      id: `code-${Date.now()}`,
      status: 'COMPLETED',
      createdAt: new Date().toISOString(),
    };
    this.codingTasks.unshift(newTask);
    return newTask;
  }

  // --- Study Sessions ---
  getStudySessions(): StudySession[] {
    return this.studySessions;
  }

  createStudySession(session: Omit<StudySession, 'id' | 'createdAt'>): StudySession {
    const newSession: StudySession = {
      ...session,
      id: `study-${Date.now()}`,
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
      id: `run-${Date.now()}`,
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

    return {
      status: 'OPTIMAL',
      uptimeSeconds: Math.floor(process.uptime ? process.uptime() : 1420),
      database: {
        status: 'CONNECTED',
        provider: 'Integrated Store',
        latencyMs: 4,
      },
      redisQueue: {
        status: 'ACTIVE',
        queuedJobs: this.queuedJobs.filter((j) => j.status === 'QUEUED').length,
        activeWorkers: 4,
      },
      whatsappApi: {
        configured: isWaConfigured,
        mode: isWaConfigured ? 'PRODUCTION' : 'SIMULATED_MOCK',
        webhookVerified: true,
        phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || '+250 788 AGUKA AI (Simulated)',
      },
      geminiAi: {
        configured: isGeminiConfigured,
        model: 'gemini-3.8-flash',
        bilingualKinyarwandaSupport: true,
      },
    };
  }
}

// Global repository singleton
export const repo = new AppRepository();

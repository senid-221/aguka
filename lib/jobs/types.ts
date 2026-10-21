import { JobListing, JobSource, JobType, LanguagePreference, VerificationStatus } from '@/lib/types';

export interface RawJobItem {
  externalId: string;
  sourceCode: string; // 'MIFOTRA' | 'JOB_IN_RWANDA' | 'REMOTE_TECH'
  sourceName: string;
  title: string;
  employer: string;
  location: string;
  rawJobType?: string;
  description: string;
  requirements?: string;
  salaryRange?: string;
  sourceUrl: string;
  deadline?: string; // ISO date string or formatted date
  discoveredAt?: string;
  tags?: string[];
}

export interface ConnectorHealthReport {
  sourceCode: string;
  name: string;
  baseUrl: string;
  status: 'HEALTHY' | 'DEGRADED' | 'DOWN' | 'UNKNOWN';
  lastSyncAt?: string;
  latencyMs: number;
  activeListingsCount: number;
  robotsPermitted: boolean;
  termsCompliant?: boolean;
  lastErrorMessage?: string;
}

export interface JobFilterParams {
  keyword?: string;
  skills?: string[];
  location?: string;
  isRemote?: boolean;
  sourceCode?: string;
  includeExpired?: boolean;
  minSalaryRwf?: number;
}

export interface JobAlertSubscription {
  id: string;
  userId: string;
  phoneNumber: string;
  keywords: string[];
  location?: string;
  isRemoteOnly?: boolean;
  language: LanguagePreference;
  isActive: boolean;
  quietHoursStart?: string; // default "21:00"
  quietHoursEnd?: string;   // default "07:00"
  createdAt: string;
  lastNotificationSentAt?: string;
}

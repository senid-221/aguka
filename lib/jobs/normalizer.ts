import { JobListing, JobType, VerificationStatus } from '@/lib/types';
import { RawJobItem } from './types';

/**
 * Standardizes job location strings for Rwanda and remote boards
 */
export function normalizeLocation(raw: string): string {
  const l = raw.toLowerCase().trim();
  if (l.includes('remote') || l.includes('telecommute') || l.includes('anywhere')) {
    return 'Remote (Africa / Global)';
  }
  if (l.includes('gasabo')) return 'Kigali, Gasabo';
  if (l.includes('kicukiro')) return 'Kigali, Kicukiro';
  if (l.includes('nyarugenge')) return 'Kigali, Nyarugenge';
  if (l.includes('kigali')) return 'Kigali, Rwanda';
  if (l.includes('musanze')) return 'Musanze, Northern Province';
  if (l.includes('huye')) return 'Huye, Southern Province';
  if (l.includes('rubavu')) return 'Rubavu, Western Province';
  if (l.includes('rwanda')) return 'Rwanda (Nationwide)';
  return raw.trim() || 'Kigali, Rwanda';
}

/**
 * Standardizes job contract type
 */
export function normalizeJobType(rawType?: string, location?: string): JobType {
  const t = (rawType || '').toLowerCase();
  const l = (location || '').toLowerCase();
  if (t.includes('remote') || l.includes('remote')) return 'REMOTE';
  if (t.includes('contract') || t.includes('consultant')) return 'CONTRACT';
  if (t.includes('part') || t.includes('nyiramongi')) return 'PART_TIME';
  if (t.includes('intern') || t.includes('stage')) return 'INTERNSHIP';
  if (t.includes('hybrid')) return 'HYBRID';
  return 'FULL_TIME';
}

/**
 * Parses and checks if an application deadline has passed
 */
export function evaluateDeadline(rawDeadline?: string): {
  normalizedDeadline?: string;
  isExpired: boolean;
} {
  if (!rawDeadline) {
    return { isExpired: false };
  }

  const parsed = new Date(rawDeadline);
  if (isNaN(parsed.getTime())) {
    return { isExpired: false };
  }

  const normalized = parsed.toISOString();
  const isExpired = parsed.getTime() < Date.now();
  return {
    normalizedDeadline: normalized,
    isExpired,
  };
}

/**
 * Creates an idempotency fingerprint for deduplication across platforms
 */
export function generateJobFingerprint(title: string, employer: string): string {
  const cleanTitle = title
    .toLowerCase()
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const cleanEmployer = employer
    .toLowerCase()
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return `${cleanEmployer}::${cleanTitle}`;
}

/**
 * Normalizes a raw job item into a verified platform JobListing
 */
export function normalizeJobListing(raw: RawJobItem, sourceId: string): JobListing {
  // Zero-hallucination check: source URL must be an authentic web URL
  if (!raw.sourceUrl || !raw.sourceUrl.startsWith('http')) {
    throw new Error(`Zero-Hallucination Violation: Missing or invalid source URL for job ${raw.title}`);
  }

  const location = normalizeLocation(raw.location);
  const jobType = normalizeJobType(raw.rawJobType, location);
  const { normalizedDeadline, isExpired } = evaluateDeadline(raw.deadline);

  const verificationStatus: VerificationStatus = isExpired
    ? 'EXPIRED'
    : 'VERIFIED';

  // Extract relevant skill tags
  const tags: string[] = [raw.sourceCode];
  if (jobType === 'REMOTE') tags.push('Remote');
  if (location.includes('Kigali')) tags.push('Kigali');

  const contentToSearch = `${raw.title} ${raw.requirements || ''} ${raw.description}`.toLowerCase();
  const knownKeywords = [
    'typescript', 'react', 'python', 'sql', 'node', 'docker', 'devops',
    'statistics', 'accounting', 'mifotra', 'fintech', 'mobile', 'frontend', 'backend'
  ];

  for (const kw of knownKeywords) {
    if (contentToSearch.includes(kw) && !tags.includes(kw)) {
      tags.push(kw.charAt(0).toUpperCase() + kw.slice(1));
    }
  }

  return {
    id: `job-${raw.sourceCode.toLowerCase()}-${raw.externalId.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()}`,
    sourceId,
    sourceName: raw.sourceName,
    externalId: raw.externalId,
    title: raw.title.trim(),
    employer: raw.employer.trim(),
    location,
    jobType,
    description: raw.description.trim(),
    requirements: raw.requirements?.trim(),
    salaryRange: raw.salaryRange?.trim(),
    sourceUrl: raw.sourceUrl.trim(),
    deadline: normalizedDeadline,
    discoveredAt: raw.discoveredAt || new Date().toISOString(),
    lastVerifiedAt: new Date().toISOString(),
    verificationStatus,
    isExpired,
    tags,
  };
}

/**
 * Deduplicates listings prioritizing official government MIFOTRA feeds
 */
export function deduplicateListings(listings: JobListing[]): {
  unique: JobListing[];
  duplicatesCount: number;
} {
  const seenFingerprints = new Map<string, JobListing>();
  let duplicatesCount = 0;

  for (const listing of listings) {
    const fp = generateJobFingerprint(listing.title, listing.employer);
    const existing = seenFingerprints.get(fp);

    if (!existing) {
      seenFingerprints.set(fp, listing);
    } else {
      duplicatesCount++;
      // If the duplicate is from official MIFOTRA, prefer MIFOTRA as canonical source
      if (listing.sourceName.includes('MIFOTRA') && !existing.sourceName.includes('MIFOTRA')) {
        seenFingerprints.set(fp, listing);
      }
    }
  }

  return {
    unique: Array.from(seenFingerprints.values()),
    duplicatesCount,
  };
}

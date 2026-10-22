import { ApprovedSource, RoadSafetySettings } from '@/lib/types';
import { generatableFacts, VERIFIED_FACTS } from '@/lib/road-safety/verified-facts';
import { REVIEW_DATE } from '@/lib/road-safety/sources';

/**
 * What the academy is configured to do, and where it is allowed to look.
 *
 * These are the values an administrator can change; nothing here invents a legal rule.
 * The defaults are deliberately conservative: generated items wait in the review queue
 * until a person clears them, and a multi-answer format stays off because the WhatsApp
 * protocol answers one option per question.
 */

/**
 * Sources an administrator has inspected, with what each one permits. quizblog.rw is
 * recorded as a discovery reference: an automated inspection on the review date found
 * no robots.txt and no terms of use — every path including /robots.txt answers the same
 * single-page application shell, so the site states no permission for automated access
 * and its questions are not readable without running its own JavaScript. Nothing was
 * harvested and no wording was copied.
 */
export const APPROVED_SOURCES: ApprovedSource[] = [
  {
    id: 'og-law-014-2026',
    name: 'Law N° 014/2026 of 06/03/2026 governing road traffic',
    url: 'https://police.gov.rw/uploads/tx_download/OG_n___Special_of_10.03.2026__Ikoreshwa_ry_umuhanda.pdf',
    publisher: 'Official Gazette n° Special of 10/03/2026, reproduced by Rwanda National Police',
    permission: 'OFFICIAL_INSTRUMENT',
    robots: 'NOT_INSPECTED',
    automatedAccess: 'UNSTATED',
    contentReuse: 'COPY_PERMITTED',
    lastInspectedAt: REVIEW_DATE,
    notes: 'Gazette text of the law. Statutory wording may be quoted with the citation.',
  },
  {
    id: 'decree-85-01',
    name: 'Presidential Decree N° 85/01 of 02/09/2002 (general road rules)',
    url: 'https://police.gov.rw/uploads/tx_download/Iteka_rya_Perezida_no_85_01_ryo_ku_wa_02_09_2002_rishyiraho_amabwiriza_rusange_agenga_imihanda_n_uburyo_bwo_kuyigendamo.pdf',
    publisher: 'Rwanda National Police (bilingual gazette copy)',
    permission: 'OFFICIAL_INSTRUMENT',
    robots: 'NOT_INSPECTED',
    automatedAccess: 'UNSTATED',
    contentReuse: 'COPY_PERMITTED',
    lastInspectedAt: REVIEW_DATE,
    notes: 'Source of the speed, priority, marking, equipment and inspection articles.',
  },
  {
    id: 'order-25-01-2015',
    name: 'Presidential Order N° 25/01 of 25/02/2015 amending Decree 85/01',
    url: 'https://police.gov.rw/uploads/tx_download/Traffic_Law_2015_02.pdf',
    publisher: 'Official Gazette Special of 26/02/2015',
    permission: 'OFFICIAL_INSTRUMENT',
    robots: 'NOT_INSPECTED',
    automatedAccess: 'UNSTATED',
    contentReuse: 'COPY_PERMITTED',
    lastInspectedAt: REVIEW_DATE,
    notes: 'Article 30bis speed governor rule and the amended Article 88 equipment spec.',
  },
  {
    id: 'order-066-01-2024',
    name: 'Presidential Order N° 066/01 of 19/07/2024 (licence categories, tests, fees)',
    url: 'https://www.rlrc.gov.rw/fileadmin/user_upload/RLRC/Laws_of_Rwanda_v2/Domestic_laws/Laws_in_force/5._Security/5.2._Security_activities/5.2.2._Road_Traffic_Security/5.2.2.10._Presidential_Order_regulating_general_police_and_road_traffic__No_066-01_of_2024.pdf',
    publisher: 'Rwanda Law Reform Commission',
    permission: 'OFFICIAL_INSTRUMENT',
    robots: 'NOT_INSPECTED',
    automatedAccess: 'UNSTATED',
    contentReuse: 'COPY_PERMITTED',
    lastInspectedAt: REVIEW_DATE,
    notes: 'Category definitions, provisional licence validity and issuing competence.',
  },
  {
    id: 'rura-passenger-2015',
    name: 'RURA Passengers Road Transport Regulations N°007/TRANS/RT/RURA/2015',
    url: 'https://www.rura.rw/fileadmin/user_upload/RURA/Documents/Sectors/Transport/Regulatory_instruments/Transport_Regulations_and_Guidelines/Passengers_Road_Transport_Regulations_01.pdf',
    publisher: 'RURA',
    permission: 'OFFICIAL_INSTRUMENT',
    robots: 'NOT_INSPECTED',
    automatedAccess: 'UNSTATED',
    contentReuse: 'COPY_PERMITTED',
    lastInspectedAt: REVIEW_DATE,
    notes: 'Reflector waistcoat scope for public transport crews.',
  },
  {
    id: 'rnp-services',
    name: 'Rwanda National Police service pages (PDL, definitive licence, inspection, traffic fines)',
    url: 'https://police.gov.rw/services/testing-and-licencing/provisional-driving-licence-pdl/',
    publisher: 'police.gov.rw',
    permission: 'GOVERNMENT_SERVICE_PAGE',
    robots: 'NOT_INSPECTED',
    automatedAccess: 'UNSTATED',
    contentReuse: 'COPY_PERMITTED',
    lastInspectedAt: REVIEW_DATE,
    notes: 'Operating figures such as the 60-mark theory pass mark. Labelled ADMINISTRATIVE_INSTRUCTION, never statutory.',
  },
  {
    id: 'irembo-articles',
    name: 'IremboGov licence help articles',
    url: 'https://support.irembo.gov.rw/en/support/solutions/articles/47001241773-everything-you-need-to-know-about-getting-your-e-provisional-driving-license',
    publisher: 'support.irembo.gov.rw',
    permission: 'GOVERNMENT_SERVICE_PAGE',
    robots: 'NOT_INSPECTED',
    automatedAccess: 'UNSTATED',
    contentReuse: 'COPY_PERMITTED',
    lastInspectedAt: REVIEW_DATE,
    notes: 'Corroborates the theory pass mark as 60% and the 18-year minimum age.',
  },
  {
    id: 'quizblog-rw',
    name: 'Quiz-Blog (quizblog.rw)',
    url: 'https://www.quizblog.rw/',
    publisher: 'Third-party quiz web application',
    permission: 'DISCOVERY_REFERENCE_ONLY',
    robots: 'ABSENT',
    automatedAccess: 'NOT_PERMITTED',
    contentReuse: 'STRUCTURE_ONLY',
    lastInspectedAt: '2026-10-22',
    notes:
      'Inspected 2026-10-22. /robots.txt, /sitemap.xml, /terms-of-use and /privacy-policy all return the same 2,591-byte single-page ' +
      'application shell with content-type text/html, so the site publishes no crawl policy and no licence, and its questions are only ' +
      'reachable by executing its own JavaScript. Used to confirm which topic categories and practice formats learners expect. No question ' +
      'wording, answer set or explanation was retrieved or copied; harvesting it would mean reverse-engineering an undisclosed endpoint, ' +
      'which this module is not permitted to do. An administrator who obtains written permission may change contentReuse to COPY_PERMITTED.',
  },
];

/**
 * Paper sizes are simulation settings, not the official examination. The theory test is
 * cited as 60 marks with a 60 % pass mark ('theory-test-pass-mark'), but its duration was
 * not found in any instrument, so no mock paper may claim an official length.
 */
export const DEFAULT_ROAD_SAFETY_SETTINGS: RoadSafetySettings = {
  updatedAt: REVIEW_DATE,
  updatedBy: 'SYSTEM_DEFAULTS',
  contentRefreshDays: 90,
  verificationRequiredToPublish: true,
  languages: ['ENGLISH', 'KINYARWANDA'],
  generation: {
    enabled: true,
    perSessionMax: 4,
    perUserPerDay: 6,
    autoPublishVerified: false,
    dailyTokenBudget: 150000,
    allowMultiAnswer: false,
    allowSignIdentification: true,
  },
  exam: {
    practiceCount: 10,
    learnCount: 5,
    mockCount: 20,
    mockMinutes: 20,
    strictModeByDefault: false,
  },
  approvedSources: APPROVED_SOURCES,
};

function intIn(value: unknown, fallback: number, min: number, max: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function boolOf(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value;
  return fallback;
}

/**
 * Settings are stored, so a partial or stale snapshot must never be able to switch a
 * protection off by omission. Every field is re-derived against the defaults.
 */
export function normalizeRoadSafetySettings(input: unknown): RoadSafetySettings {
  const raw = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const g = (raw.generation && typeof raw.generation === 'object' ? raw.generation : {}) as Record<string, unknown>;
  const e = (raw.exam && typeof raw.exam === 'object' ? raw.exam : {}) as Record<string, unknown>;
  const d = DEFAULT_ROAD_SAFETY_SETTINGS;

  const languages = Array.isArray(raw.languages)
    ? (raw.languages.filter((l) => l === 'ENGLISH' || l === 'KINYARWANDA') as Array<'ENGLISH' | 'KINYARWANDA'>)
    : [];

  return {
    updatedAt: String(raw.updatedAt || d.updatedAt),
    updatedBy: String(raw.updatedBy || d.updatedBy),
    contentRefreshDays: intIn(raw.contentRefreshDays, d.contentRefreshDays, 7, 730),
    verificationRequiredToPublish: boolOf(raw.verificationRequiredToPublish, d.verificationRequiredToPublish),
    languages: languages.length ? languages : d.languages,
    generation: {
      enabled: boolOf(g.enabled, d.generation.enabled),
      perSessionMax: intIn(g.perSessionMax, d.generation.perSessionMax, 1, 20),
      perUserPerDay: intIn(g.perUserPerDay, d.generation.perUserPerDay, 0, 50),
      autoPublishVerified: boolOf(g.autoPublishVerified, d.generation.autoPublishVerified),
      dailyTokenBudget: intIn(g.dailyTokenBudget, d.generation.dailyTokenBudget, 0, 5000000),
      allowMultiAnswer: boolOf(g.allowMultiAnswer, d.generation.allowMultiAnswer),
      allowSignIdentification: boolOf(g.allowSignIdentification, d.generation.allowSignIdentification),
    },
    exam: {
      practiceCount: intIn(e.practiceCount, d.exam.practiceCount, 1, 100),
      learnCount: intIn(e.learnCount, d.exam.learnCount, 1, 100),
      mockCount: intIn(e.mockCount, d.exam.mockCount, 1, 100),
      mockMinutes: intIn(e.mockMinutes, d.exam.mockMinutes, 1, 240),
      strictModeByDefault: boolOf(e.strictModeByDefault, d.exam.strictModeByDefault),
    },
    approvedSources: Array.isArray(raw.approvedSources) && raw.approvedSources.length
      ? (raw.approvedSources as ApprovedSource[])
      : APPROVED_SOURCES,
  };
}

/** Counts for the admin source ledger; the numbers an operator uses to judge coverage. */
export function approvedSourceLedger() {
  return {
    total: APPROVED_SOURCES.length,
    usableForGrounding: APPROVED_SOURCES.filter((s) => s.contentReuse === 'COPY_PERMITTED').length,
    discoveryOnly: APPROVED_SOURCES.filter((s) => s.permission === 'DISCOVERY_REFERENCE_ONLY').length,
    verifiedFacts: generatableFacts().length,
    documentedGaps: VERIFIED_FACTS.filter((f) => !f.generationAllowed).length,
  };
}

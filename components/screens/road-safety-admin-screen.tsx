'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Car,
  RefreshCw,
  Upload,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Save,
  Plus,
  BookOpen,
  TrafficCone,
  ClipboardCheck,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
} from 'lucide-react';
import { AdminGate } from '@/components/layout/admin-gate';
import { adminFetch, useAdminSession } from '@/lib/client/admin-session';

interface Citation {
  title: string;
  publisher: string;
  url: string;
  accessedOn: string;
  quote?: string;
}

interface Module {
  id: string;
  code: string;
  titleEn: string;
  titleRw: string;
  summaryEn: string;
  summaryRw: string;
  sortOrder: number;
  status: string;
}

interface Lesson {
  id: string;
  moduleId: string;
  titleEn: string;
  titleRw: string;
  bodyEn: string;
  bodyRw: string;
  keyPointsEn: string[];
  keyPointsRw: string[];
  citations: Citation[];
  legalVerifiedAt: string | null;
  lastReviewedBy: string | null;
  status: string;
  sortOrder: number;
}

interface IssueReport {
  reportedAt: string;
  userId: string | null;
  channel: string;
  note: string;
  resolvedAt?: string | null;
  resolvedBy?: string | null;
  resolution?: string | null;
}

interface Question {
  id: string;
  moduleId: string;
  lessonId: string | null;
  questionEn: string;
  questionRw: string;
  optionsEn: string[];
  optionsRw: string[];
  correctIndex: number;
  correctIndexes: number[] | null;
  explanationEn: string;
  explanationRw: string;
  difficulty: string;
  citations: Citation[];
  legalVerifiedAt: string | null;
  status: string;
  factIds: string[];
  source: string;
  reviewReasons: string[];
  issueReports: IssueReport[];
  fingerprint: string;
  signId: string | null;
}

interface VerifiedFactRef {
  id: string;
  moduleCode: string;
  statementEn: string;
  statementRw: string;
  legalBasis: string;
  article: string | null;
  citation: Citation;
}

interface ApprovedSource {
  id: string;
  name: string;
  url: string;
  publisher: string;
  permission: string;
  robots: string;
  automatedAccess: string;
  contentReuse: string;
  lastInspectedAt: string;
  notes: string;
}

interface Settings {
  updatedAt: string;
  updatedBy: string;
  contentRefreshDays: number;
  verificationRequiredToPublish: boolean;
  languages: string[];
  generation: {
    enabled: boolean;
    perSessionMax: number;
    perUserPerDay: number;
    autoPublishVerified: boolean;
    dailyTokenBudget: number;
    allowMultiAnswer: boolean;
    allowSignIdentification: boolean;
  };
  exam: {
    practiceCount: number;
    learnCount: number;
    mockCount: number;
    mockMinutes: number;
    strictModeByDefault: boolean;
  };
  approvedSources: ApprovedSource[];
}

interface GenerationRun {
  id: string;
  startedAt: string;
  userId: string | null;
  kind: string;
  requested: number;
  factIds: string[];
  provider: string | null;
  model: string | null;
  candidates: number;
  published: number;
  heldForReview: number;
  tokensUsed: number;
  latencyMs: number;
  attempts: string[];
  error: string | null;
}

interface Sign {
  id: string;
  code: string;
  category: string;
  nameEn: string;
  nameRw: string;
  meaningEn: string;
  meaningRw: string;
  shape: string;
  colourConvention: string;
  citations: Citation[];
  legalVerifiedAt: string | null;
  status: string;
}

interface Exam {
  id: string;
  nameEn: string;
  nameRw: string;
  moduleId: string | null;
  questionCount: number;
  passPercent: number;
  timeLimitMinutes: number | null;
  status: string;
}

interface Attempt {
  id: string;
  userId: string;
  kind: string;
  totalQuestions: number;
  correctCount: number;
  scorePercent: number;
  passed: boolean;
  startedAt: string;
  submittedAt: string | null;
}

interface CurriculumPayload {
  modules: Module[];
  lessons: Lesson[];
  signs: Sign[];
  questions: Question[];
  exams: Exam[];
  attempts: Attempt[];
  unverifiedTopics: Array<{ topic: string; why: string }>;
  contentPack: { version: string; reviewedOn: string };
  settings: Settings;
  reviewQueue: Question[];
  verifiedFacts: VerifiedFactRef[];
  generationRuns: GenerationRun[];
  generation: {
    enabled: boolean;
    verifiedRules: number;
    documentedGaps: number;
    tokensToday: number;
    dailyTokenBudget: number;
    autoPublishVerified: boolean;
    reviewQueue: number;
  };
  reviewOverdue: { thresholdDays: number; questions: number; lessons: number; signs: number };
  stats: Record<string, number>;
}

type Tab = 'LESSONS' | 'QUESTIONS' | 'REVIEW' | 'SIGNS' | 'PAPERS' | 'LEARNERS' | 'CONTROLS';

const inputClass =
  'w-full bg-zinc-950 text-xs text-zinc-100 px-3 py-2 rounded-lg border border-zinc-800 focus:border-emerald-500/40 outline-none';

export function RoadSafetyAdminScreen() {
  const session = useAdminSession();
  const [data, setData] = useState<CurriculumPayload | null>(null);
  const [tab, setTab] = useState<Tab>('LESSONS');
  const [refreshing, setRefreshing] = useState(false);
  const [settled, setSettled] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [lessonDraft, setLessonDraft] = useState<Lesson | null>(null);
  const [questionDraft, setQuestionDraft] = useState<Question | null>(null);
  const [citationsText, setCitationsText] = useState('[]');
  const [settingsDraft, setSettingsDraft] = useState<Settings | null>(null);
  const [sourcesDraft, setSourcesDraft] = useState<ApprovedSource[] | null>(null);
  const [newSource, setNewSource] = useState({ id: '', name: '', url: '' });
  const [rejectNotes, setRejectNotes] = useState<Record<string, string>>({});
  const [batch, setBatch] = useState({ count: 4, moduleId: '', difficulty: 'MEDIUM' });
  // The first load runs from the effect below and later ones from Reload, so the
  // spinner is derived instead of started synchronously inside the effect.
  const loading = session.authed && (!settled || refreshing);

  const load = useCallback(() => {
    void adminFetch<CurriculumPayload>('/api/admin/road-safety').then((res) => {
      setRefreshing(false);
      setSettled(true);
      if (res.ok && res.data) setData(res.data);
      else if (res.error) setMessage({ kind: 'error', text: res.error });
    });
  }, []);

  useEffect(() => {
    if (session.authed) load();
  }, [session.authed, load]);

  const post = useCallback(
    async (payload: Record<string, unknown>, label: string) => {
      setBusy(label);
      const res = await adminFetch<{ lesson?: Lesson; question?: Question }>('/api/admin/road-safety', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setBusy(null);
      if (res.ok) {
        setMessage({ kind: 'ok', text: `${label} saved.` });
        load();
        return true;
      }
      setMessage({ kind: 'error', text: res.error || 'The server refused this change.' });
      return false;
    },
    [load]
  );

  const importPack = useCallback(async () => {
    setBusy('PACK');
    const res = await adminFetch<{
      report: { created: string[]; skipped: string[]; totals: Record<string, number> };
    }>('/api/admin/road-safety', { method: 'POST', body: JSON.stringify({ action: 'IMPORT_PACK' }) });
    setBusy(null);
    if (res.ok && res.data) {
      setMessage({
        kind: 'ok',
        text: `Content pack v${data?.contentPack.version ?? ''}: ${res.data.report.created.length} item(s) added, ${res.data.report.skipped.length} already present.`,
      });
      load();
    } else {
      setMessage({ kind: 'error', text: res.error || 'Import failed.' });
    }
  }, [data?.contentPack.version, load]);

  const setStatus = useCallback(
    (type: string, id: string, status: string) => void post({ action: 'SET_STATUS', type, id, status }, `${type} ${status}`),
    [post]
  );

  // Memoised because the save callbacks depend on them: an inline `??` would hand a new
  // object identity to useCallback on every render.
  const settingsBase = useMemo(() => settingsDraft ?? data?.settings ?? null, [settingsDraft, data?.settings]);
  const sourceLedger = useMemo(
    () => sourcesDraft ?? data?.settings.approvedSources ?? [],
    [sourcesDraft, data?.settings.approvedSources]
  );

  const patchSettings = (patch: Partial<Settings>) => {
    if (!settingsBase) return;
    setSettingsDraft({ ...settingsBase, ...patch });
  };

  const patchGeneration = (patch: Partial<Settings['generation']>) => {
    if (!settingsBase) return;
    setSettingsDraft({ ...settingsBase, generation: { ...settingsBase.generation, ...patch } });
  };

  const patchExam = (patch: Partial<Settings['exam']>) => {
    if (!settingsBase) return;
    setSettingsDraft({ ...settingsBase, exam: { ...settingsBase.exam, ...patch } });
  };

  const patchSource = (index: number, patch: Partial<ApprovedSource>) => {
    const rows = [...sourceLedger];
    rows[index] = { ...rows[index], ...patch };
    setSourcesDraft(rows);
  };

  /**
   * Saved as one document: the server rebuilds every field, clamps each number to the range
   * it will honour and reports the stored result, so the form re-reads truth afterwards.
   */
  const saveSettings = useCallback(async () => {
    if (!settingsBase) return;
    setBusy('SETTINGS');
    const res = await adminFetch<{ settings?: Settings }>('/api/admin/road-safety', {
      method: 'POST',
      body: JSON.stringify({
        action: 'SAVE_SETTINGS',
        contentRefreshDays: settingsBase.contentRefreshDays,
        verificationRequiredToPublish: settingsBase.verificationRequiredToPublish,
        languages: settingsBase.languages,
        generation: settingsBase.generation,
        exam: settingsBase.exam,
        approvedSources: sourceLedger,
      }),
    });
    setBusy(null);
    if (res.ok && res.data?.settings) {
      const stored = res.data.settings;
      const clamped =
        stored.contentRefreshDays !== settingsBase.contentRefreshDays ||
        stored.generation.perSessionMax !== settingsBase.generation.perSessionMax ||
        stored.generation.dailyTokenBudget !== settingsBase.generation.dailyTokenBudget ||
        stored.exam.mockMinutes !== settingsBase.exam.mockMinutes;
      setSettingsDraft(null);
      setSourcesDraft(null);
      setMessage({
        kind: 'ok',
        text: clamped
          ? 'Controls saved. At least one value was outside the range the engine will honour, so the stored limit is shown instead.'
          : 'Controls saved and recorded in the audit trail.',
      });
      load();
      return;
    }
    setMessage({ kind: 'error', text: res.error || 'The server refused these settings. Nothing was changed.' });
  }, [load, settingsBase, sourceLedger]);

  const review = useCallback(
    async (id: string, decision: 'approve' | 'reject', note: string) => {
      if (decision === 'reject' && note.trim().length === 0) {
        setMessage({ kind: 'error', text: 'Write the reason first: it is stored on the item and in the audit trail.' });
        return;
      }
      setBusy(`${decision}:${id}`);
      const res = await adminFetch<{ question?: Question }>('/api/admin/road-safety', {
        method: 'POST',
        body: JSON.stringify({
          action: decision === 'approve' ? 'REVIEW_APPROVE' : 'REVIEW_REJECT',
          id,
          note: note.trim(),
        }),
      });
      setBusy(null);
      if (res.ok && res.data) {
        setRejectNotes((prev) => ({ ...prev, [id]: '' }));
        setMessage({
          kind: 'ok',
          text:
            decision === 'approve'
              ? 'Published. Learners will see this item and its explanation.'
              : 'Rejected and archived, with the reason recorded on the item.',
        });
        load();
        return;
      }
      setMessage({ kind: 'error', text: res.error || 'The server refused this decision.' });
    },
    [load]
  );

  /** Reports the provider outcome in the operator's own words, including an honest failure. */
  const generateBatch = useCallback(async () => {
    setBusy('BATCH');
    const res = await adminFetch<{
      blocked?: string | null;
      note?: string | null;
      provider?: string | null;
      model?: string | null;
      tokensUsed?: number;
      published?: number;
      heldForReview?: number;
      attempts?: string[];
    }>('/api/admin/road-safety', {
      method: 'POST',
      body: JSON.stringify({
        action: 'GENERATE_BATCH',
        count: batch.count,
        moduleId: batch.moduleId || undefined,
        difficulty: batch.difficulty,
      }),
    });
    setBusy(null);
    if (res.error) {
      setMessage({ kind: 'error', text: res.error });
      return;
    }
    const r = res.data;
    if (!r) {
      setMessage({ kind: 'error', text: 'The generation request returned no result.' });
      return;
    }
    const detail = [
      r.blocked ? `blocked (${r.blocked})` : `${r.published ?? 0} published`,
      `${r.heldForReview ?? 0} held for review`,
      r.provider ? `via ${r.provider}${r.model ? ` / ${r.model}` : ''}` : 'no provider reached',
      `${r.tokensUsed ?? 0} tokens`,
    ].join(' · ');
    setMessage({
      kind: (r.published ?? 0) > 0 ? 'ok' : 'error',
      text: `${detail}.${r.note ? ` ${r.note}` : ''}`,
    });
    load();
  }, [batch, load]);

  const moduleCodeOf = (moduleId: string) => data?.modules.find((m) => m.id === moduleId)?.code ?? '';

  /** Reads fall back to stored values, so the form is complete before any edit starts. */
  const genValue = <K extends keyof Settings['generation']>(loaded: Settings, key: K): Settings['generation'][K] =>
    (settingsBase?.generation ?? loaded.generation)[key];

  const examValue = <K extends keyof Settings['exam']>(loaded: Settings, key: K): Settings['exam'][K] =>
    (settingsBase?.exam ?? loaded.exam)[key];

  const toggleFact = (id: string) => {
    if (!questionDraft) return;
    const on = questionDraft.factIds.includes(id);
    setQuestionDraft({
      ...questionDraft,
      factIds: on ? questionDraft.factIds.filter((f) => f !== id) : [...questionDraft.factIds, id],
    });
  };

  const startLesson = (partial?: Partial<Lesson>) => {
    const base: Lesson = {
      id: '',
      moduleId: data?.modules[0]?.id ?? '',
      titleEn: '',
      titleRw: '',
      bodyEn: '',
      bodyRw: '',
      keyPointsEn: [],
      keyPointsRw: [],
      citations: [],
      legalVerifiedAt: null,
      lastReviewedBy: null,
      status: 'DRAFT',
      sortOrder: (data?.lessons.length ?? 0) + 1,
      ...partial,
    };
    setLessonDraft(base);
    setCitationsText(JSON.stringify(base.citations, null, 2));
  };

  const startQuestion = (partial?: Partial<Question>) => {
    const base: Question = {
      id: '',
      moduleId: data?.modules[0]?.id ?? '',
      lessonId: null,
      questionEn: '',
      questionRw: '',
      optionsEn: ['', '', '', ''],
      optionsRw: ['', '', '', ''],
      correctIndex: 0,
      correctIndexes: null,
      explanationEn: '',
      explanationRw: '',
      difficulty: 'MEDIUM',
      citations: [],
      legalVerifiedAt: null,
      status: 'DRAFT',
      factIds: [],
      source: 'ADMIN_AUTHORED',
      reviewReasons: [],
      issueReports: [],
      fingerprint: '',
      signId: null,
      ...partial,
    };
    setQuestionDraft(base);
    setCitationsText(JSON.stringify(base.citations, null, 2));
  };

  const parsedCitations = (): Citation[] | null => {
    try {
      const raw = JSON.parse(citationsText);
      return Array.isArray(raw) ? (raw as Citation[]) : null;
    } catch {
      return null;
    }
  };

  if (!session.authed) {
    return (
      <div className="p-4 sm:p-6 space-y-5">
        <Header version={undefined} />
        <AdminGate session={session} scope="Curriculum, exam papers and legal review status are controlled here." />
      </div>
    );
  }

  const tabs: Array<{ id: Tab; label: string; count: number }> = [
    { id: 'LESSONS', label: 'Modules & lessons', count: data?.lessons.length ?? 0 },
    { id: 'QUESTIONS', label: 'Question bank', count: data?.questions.length ?? 0 },
    { id: 'REVIEW', label: 'Review queue', count: data?.reviewQueue.length ?? 0 },
    { id: 'SIGNS', label: 'Road signs', count: data?.signs.length ?? 0 },
    { id: 'PAPERS', label: 'Exam papers', count: data?.exams.length ?? 0 },
    { id: 'LEARNERS', label: 'Attempts', count: data?.attempts.length ?? 0 },
    { id: 'CONTROLS', label: 'Controls & monitoring', count: data?.generationRuns.length ?? 0 },
  ];

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <Header version={data?.contentPack.version} reviewedOn={data?.contentPack.reviewedOn} />

      {message && (
        <div
          className={`p-3 rounded-xl border flex items-start gap-2 text-xs ${
            message.kind === 'ok'
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
              : 'bg-amber-500/10 border-amber-500/20 text-amber-300'
          }`}
        >
          {message.kind === 'ok' ? <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" /> : <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />}
          <span>{message.text}</span>
        </div>
      )}

      <div className="p-4 rounded-2xl bg-zinc-900 border border-zinc-800 flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs text-zinc-400 space-y-1">
          <p className="font-semibold text-white text-sm">Reviewed curriculum pack</p>
          <p>
            {data
              ? `${data.stats.publishedLessons}/${data.stats.lessons} lessons published · ${data.stats.publishedQuestions}/${data.stats.questions} questions published · ${data.stats.signs} sign conventions · ${data.stats.exams} papers`
              : 'Reading curriculum state…'}
          </p>
          <p className="text-[11px] text-zinc-500">
            Import is idempotent: rows an administrator has already edited are never overwritten.
          </p>
        </div>
        <button
          onClick={() => void importPack()}
          disabled={busy !== null}
          className="px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-xs font-bold text-white flex items-center gap-2"
        >
          {busy === 'PACK' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          <span>Import verified content pack</span>
        </button>
      </div>

      {data && data.unverifiedTopics.length > 0 && (
        <div className="p-4 rounded-2xl bg-amber-500/5 border border-amber-500/20">
          <p className="text-xs font-bold text-amber-300 mb-2">Could not be verified in a published source</p>
          <ul className="space-y-1.5">
            {data.unverifiedTopics.map((u) => (
              <li key={u.topic} className="text-[11px] text-zinc-300">
                <strong className="text-amber-200">{u.topic}:</strong> <span className="text-zinc-400">{u.why}</span>
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-zinc-500 mt-2">
            Anything on this list must not be taught as law. Learners see the same list so they know where the
            curriculum stops.
          </p>
        </div>
      )}

      <div className="flex flex-wrap gap-1.5">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold border transition-colors ${
              tab === t.id
                ? 'bg-zinc-800 text-white border-zinc-700'
                : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-zinc-200'
            }`}
          >
            {t.label} <span className="text-zinc-500">({t.count})</span>
          </button>
        ))}
        <button
          onClick={() => { setRefreshing(true); load(); }}
          disabled={loading}
          className="ml-auto px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-[11px] font-semibold text-zinc-200 flex items-center gap-1.5"
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          <span>Reload</span>
        </button>
      </div>

      {tab === 'LESSONS' && data && (
        <div className="space-y-4">
          {data.modules.map((m) => (
            <div key={m.id} className="rounded-2xl bg-zinc-900 border border-zinc-800 overflow-hidden">
              <div className="px-4 py-3 border-b border-zinc-800 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-bold text-white">
                    {m.titleEn} <span className="text-zinc-500 font-normal">/ {m.titleRw}</span>
                  </p>
                  <p className="text-[11px] text-zinc-400 mt-0.5">{m.summaryEn}</p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusPill status={m.status} />
                  {m.status !== 'PUBLISHED' && (
                    <button
                      onClick={() => setStatus('MODULE', m.id, 'PUBLISHED')}
                      className="px-2 py-1 rounded-md bg-emerald-600/20 border border-emerald-500/25 text-[10px] font-semibold text-emerald-300"
                    >
                      Publish
                    </button>
                  )}
                </div>
              </div>
              <div className="divide-y divide-zinc-800/70">
                {data.lessons
                  .filter((l) => l.moduleId === m.id)
                  .sort((a, b) => a.sortOrder - b.sortOrder)
                  .map((l) => (
                    <div key={l.id} className="px-4 py-3 flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-white">{l.titleEn}</p>
                        <p className="text-[11px] text-zinc-400">{l.titleRw}</p>
                        <p className="text-[10px] text-zinc-500 mt-1">
                          {l.citations.length} source(s){' '}
                          {l.legalVerifiedAt ? (
                            <span className="text-emerald-400">verified {l.legalVerifiedAt}</span>
                          ) : (
                            <span className="text-amber-300">NOT legally reviewed</span>
                          )}
                          {' · '}
                          {l.bodyEn.length} characters
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <StatusPill status={l.status} />
                        <button
                          onClick={() => startLesson(l)}
                          className="px-2 py-1 rounded-md bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-[10px] font-semibold text-zinc-200"
                        >
                          Edit
                        </button>
                        <select
                          value={l.status}
                          onChange={(e) => setStatus('LESSON', l.id, e.target.value)}
                          className="bg-zinc-950 border border-zinc-800 rounded-md px-1.5 py-1 text-[10px] text-zinc-300 outline-none"
                        >
                          <option value="DRAFT">DRAFT</option>
                          <option value="PUBLISHED">PUBLISHED</option>
                          <option value="ARCHIVED">ARCHIVED</option>
                        </select>
                      </div>
                    </div>
                  ))}
                {data.lessons.filter((l) => l.moduleId === m.id).length === 0 && (
                  <p className="px-4 py-4 text-[11px] text-zinc-500">No lessons in this module yet.</p>
                )}
              </div>
            </div>
          ))}

          <button
            onClick={() => startLesson()}
            className="px-3.5 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-xs font-semibold text-zinc-200 flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            <span>New lesson</span>
          </button>

          {lessonDraft && (
            <div className="p-5 rounded-2xl bg-zinc-900 border border-emerald-500/20 space-y-3">
              <h2 className="text-sm font-bold text-white">{lessonDraft.id ? 'Edit lesson' : 'New lesson'}</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <select value={lessonDraft.moduleId} onChange={(e) => setLessonDraft({ ...lessonDraft, moduleId: e.target.value })} className={inputClass}>
                  {data.modules.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.titleEn}
                    </option>
                  ))}
                </select>
                <input
                  value={lessonDraft.titleEn}
                  onChange={(e) => setLessonDraft({ ...lessonDraft, titleEn: e.target.value })}
                  placeholder="Title (English)"
                  className={inputClass}
                />
                <input
                  value={lessonDraft.titleRw}
                  onChange={(e) => setLessonDraft({ ...lessonDraft, titleRw: e.target.value })}
                  placeholder="Umutwe (Kinyarwanda)"
                  className={inputClass}
                />
                <input
                  value={lessonDraft.legalVerifiedAt ?? ''}
                  onChange={(e) => setLessonDraft({ ...lessonDraft, legalVerifiedAt: e.target.value || null })}
                  placeholder="Legal review date (YYYY-MM-DD, blank = not reviewed)"
                  className={inputClass}
                />
              </div>
              <textarea
                rows={5}
                value={lessonDraft.bodyEn}
                onChange={(e) => setLessonDraft({ ...lessonDraft, bodyEn: e.target.value })}
                placeholder="Lesson body (English)"
                className={inputClass}
              />
              <textarea
                rows={5}
                value={lessonDraft.bodyRw}
                onChange={(e) => setLessonDraft({ ...lessonDraft, bodyRw: e.target.value })}
                placeholder="Ibiganiro (Kinyarwanda)"
                className={inputClass}
              />
              <textarea
                rows={6}
                value={citationsText}
                onChange={(e) => setCitationsText(e.target.value)}
                placeholder='Citations JSON: [{"title":"Law N° 014/2026","publisher":"rlrc.gov.rw","url":"https://…","accessedOn":"2026-10-21"}]'
                className={`${inputClass} font-mono text-[11px]`}
              />
              <div className="flex items-center gap-2">
                <select
                  value={lessonDraft.status}
                  onChange={(e) => setLessonDraft({ ...lessonDraft, status: e.target.value as Lesson['status'] })}
                  className="bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-2 text-xs text-zinc-200 outline-none"
                >
                  <option value="DRAFT">DRAFT</option>
                  <option value="PUBLISHED">PUBLISHED</option>
                  <option value="ARCHIVED">ARCHIVED</option>
                </select>
                <button
                  onClick={async () => {
                    const citations = parsedCitations();
                    if (!citations) {
                      setMessage({ kind: 'error', text: 'Citations must be a valid JSON array.' });
                      return;
                    }
                    const ok = await post(
                      { action: 'SAVE_LESSON', ...lessonDraft, citations },
                      lessonDraft.id ? 'Lesson' : 'New lesson'
                    );
                    if (ok) setLessonDraft(null);
                  }}
                  disabled={busy !== null || !lessonDraft.titleEn || !lessonDraft.moduleId}
                  className="px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-xs font-bold text-white flex items-center gap-2"
                >
                  {busy === 'Lesson' || busy === 'New lesson' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  <span>Save lesson</span>
                </button>
                <button
                  onClick={() => setLessonDraft(null)}
                  className="px-3.5 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-xs font-semibold text-zinc-200"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'QUESTIONS' && data && (
        <div className="space-y-4">
          <div className="rounded-2xl bg-zinc-900 border border-zinc-800 overflow-hidden">
            <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <ClipboardCheck className="w-4 h-4 text-emerald-400" />
                <span>Question bank</span>
              </h2>
              <button
                onClick={() => startQuestion()}
                className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-[11px] font-bold text-white flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>New question</span>
              </button>
            </div>
            <div className="divide-y divide-zinc-800/70 max-h-[520px] overflow-y-auto">
              {data.questions.map((q) => (
                <div key={q.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-white">{q.questionEn}</p>
                      <p className="text-[11px] text-zinc-400 mt-0.5">{q.questionRw}</p>
                      <p className="text-[10px] text-zinc-500 mt-1">
                        {q.optionsEn.length} options · answer{' '}
                        {q.correctIndexes && q.correctIndexes.length > 1
                          ? q.correctIndexes.map((n) => String.fromCharCode(65 + n)).join(' + ')
                          : String.fromCharCode(65 + q.correctIndex)}{' '}
                        · {q.difficulty} ·{' '}
                        {q.source === 'AI_GENERATED' ? 'AI-generated' : q.source === 'ADMIN_AUTHORED' ? 'written here' : 'content pack'} ·{' '}
                        {q.factIds.length} rule(s) ·{' '}
                        {q.legalVerifiedAt ? (
                          <span className="text-emerald-400">cited</span>
                        ) : (
                          <span className="text-amber-300">uncited</span>
                        )}
                        {q.issueReports.some((r) => !r.resolvedAt) && (
                          <span className="text-amber-300"> · reported by learners</span>
                        )}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <StatusPill status={q.status} />
                      <button
                        onClick={() => startQuestion(q)}
                        className="px-2 py-1 rounded-md bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-[10px] font-semibold text-zinc-200"
                      >
                        Edit
                      </button>
                      <select
                        value={q.status}
                        onChange={(e) => setStatus('QUESTION', q.id, e.target.value)}
                        className="bg-zinc-950 border border-zinc-800 rounded-md px-1.5 py-1 text-[10px] text-zinc-300 outline-none"
                      >
                        <option value="DRAFT">DRAFT</option>
                        <option value="NEEDS_REVIEW">NEEDS_REVIEW</option>
                        <option value="PUBLISHED">PUBLISHED</option>
                        <option value="ARCHIVED">ARCHIVED</option>
                      </select>
                    </div>
                  </div>
                </div>
              ))}
              {data.questions.length === 0 && (
                <p className="px-4 py-6 text-center text-[11px] text-zinc-500">
                  The bank is empty. Import the content pack or add questions manually.
                </p>
              )}
            </div>
          </div>

          {questionDraft && (
            <div className="p-5 rounded-2xl bg-zinc-900 border border-emerald-500/20 space-y-3">
              <h2 className="text-sm font-bold text-white">{questionDraft.id ? 'Edit question' : 'New question'}</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <select
                  value={questionDraft.moduleId}
                  onChange={(e) => setQuestionDraft({ ...questionDraft, moduleId: e.target.value })}
                  className={inputClass}
                >
                  {data.modules.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.titleEn}
                    </option>
                  ))}
                </select>
                <select
                  value={questionDraft.difficulty}
                  onChange={(e) => setQuestionDraft({ ...questionDraft, difficulty: e.target.value })}
                  className={inputClass}
                >
                  <option value="EASY">EASY</option>
                  <option value="MEDIUM">MEDIUM</option>
                  <option value="HARD">HARD</option>
                </select>
              </div>
              <textarea
                rows={2}
                value={questionDraft.questionEn}
                onChange={(e) => setQuestionDraft({ ...questionDraft, questionEn: e.target.value })}
                placeholder="Question (English)"
                className={inputClass}
              />
              <textarea
                rows={2}
                value={questionDraft.questionRw}
                onChange={(e) => setQuestionDraft({ ...questionDraft, questionRw: e.target.value })}
                placeholder="Ikibazo (Kinyarwanda)"
                className={inputClass}
              />
              <div className="space-y-2">
                {questionDraft.optionsEn.map((opt, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="correct"
                      checked={questionDraft.correctIndex === i}
                      onChange={() => setQuestionDraft({ ...questionDraft, correctIndex: i })}
                      className="w-3.5 h-3.5 accent-emerald-500"
                      aria-label={`Mark option ${i + 1} correct`}
                    />
                    <span className="text-[11px] text-zinc-500 w-4">{String.fromCharCode(65 + i)}</span>
                    <input
                      value={opt}
                      onChange={(e) => {
                        const optionsEn = [...questionDraft.optionsEn];
                        optionsEn[i] = e.target.value;
                        setQuestionDraft({ ...questionDraft, optionsEn });
                      }}
                      className={inputClass}
                    />
                    <input
                      value={questionDraft.optionsRw[i] ?? ''}
                      onChange={(e) => {
                        const optionsRw = [...questionDraft.optionsRw];
                        while (optionsRw.length < questionDraft.optionsEn.length) optionsRw.push('');
                        optionsRw[i] = e.target.value;
                        setQuestionDraft({ ...questionDraft, optionsRw });
                      }}
                      className={inputClass}
                      placeholder="Kinyarwanda"
                    />
                    {questionDraft.optionsEn.length > 2 && (
                      <button
                        onClick={() => {
                          const optionsEn = questionDraft.optionsEn.filter((_, k) => k !== i);
                          const optionsRw = questionDraft.optionsRw.filter((_, k) => k !== i);
                          setQuestionDraft({
                            ...questionDraft,
                            optionsEn,
                            optionsRw,
                            correctIndex: Math.min(questionDraft.correctIndex, optionsEn.length - 1),
                          });
                        }}
                        className="p-1.5 rounded-md text-zinc-500 hover:text-red-300"
                        aria-label={`Remove option ${i + 1}`}
                      >
                        <AlertCircle className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
                <button
                  onClick={() =>
                    setQuestionDraft({
                      ...questionDraft,
                      optionsEn: [...questionDraft.optionsEn, ''],
                      optionsRw: [...questionDraft.optionsRw, ''],
                    })
                  }
                  className="text-[11px] text-emerald-400 font-semibold"
                >
                  + add option
                </button>
              </div>
              <textarea
                rows={2}
                value={questionDraft.explanationEn}
                onChange={(e) => setQuestionDraft({ ...questionDraft, explanationEn: e.target.value })}
                placeholder="Explanation shown after scoring (English)"
                className={inputClass}
              />
              <textarea
                rows={2}
                value={questionDraft.explanationRw}
                onChange={(e) => setQuestionDraft({ ...questionDraft, explanationRw: e.target.value })}
                placeholder="Insobanuro (Kinyarwanda)"
                className={inputClass}
              />
              <div className="rounded-xl bg-zinc-950 border border-zinc-800 p-3 space-y-2">
                <p className="text-[11px] font-semibold text-zinc-200">
                  Verified rules this item tests
                  <span className="text-zinc-500 font-normal"> — {moduleCodeOf(questionDraft.moduleId) || 'no topic selected'}</span>
                </p>
                {data.verifiedFacts
                  .filter((f) => f.moduleCode === moduleCodeOf(questionDraft.moduleId))
                  .map((f) => (
                    <label key={f.id} className="flex items-start gap-2 text-[11px]">
                      <input
                        type="checkbox"
                        checked={questionDraft.factIds.includes(f.id)}
                        onChange={() => toggleFact(f.id)}
                        className="mt-0.5 w-3.5 h-3.5 accent-emerald-500"
                      />
                      <span className="min-w-0">
                        <span className="text-zinc-200">{f.statementEn}</span>{' '}
                        <span className="text-zinc-500">
                          {f.legalBasis}
                          {f.article ? ` · ${f.article}` : ''} · {f.id}
                        </span>
                      </span>
                    </label>
                  ))}
                {data.verifiedFacts.filter((f) => f.moduleCode === moduleCodeOf(questionDraft.moduleId)).length === 0 && (
                  <p className="text-[11px] text-amber-300">
                    No verified rule is registered for this topic, so nothing written here can be published as law. It can
                    still be saved as a draft or archived.
                  </p>
                )}
                <p className="text-[10px] text-zinc-500">
                  Ticking a rule adds its source to the citation list on save. An item must cite a source and carry a legal
                  review date before the server will publish it.
                </p>
              </div>
              <label className="flex items-center gap-2 text-[11px] text-zinc-400">
                <span className="whitespace-nowrap">Legal review date</span>
                <input
                  type="date"
                  value={questionDraft.legalVerifiedAt ? questionDraft.legalVerifiedAt.slice(0, 10) : ''}
                  onChange={(e) =>
                    setQuestionDraft({
                      ...questionDraft,
                      legalVerifiedAt: e.target.value ? `${e.target.value}T00:00:00.000Z` : null,
                    })
                  }
                  className={inputClass}
                />
              </label>
              <textarea
                rows={4}
                value={citationsText}
                onChange={(e) => setCitationsText(e.target.value)}
                placeholder="Citations JSON"
                className={`${inputClass} font-mono text-[11px]`}
              />
              <div className="flex items-center gap-2">
                <select
                  value={questionDraft.status}
                  onChange={(e) => setQuestionDraft({ ...questionDraft, status: e.target.value as Question['status'] })}
                  className="bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-2 text-xs text-zinc-200 outline-none"
                >
                  <option value="DRAFT">DRAFT</option>
                  <option value="NEEDS_REVIEW">NEEDS_REVIEW</option>
                  <option value="PUBLISHED">PUBLISHED</option>
                  <option value="ARCHIVED">ARCHIVED</option>
                </select>
                <button
                  onClick={async () => {
                    const manual = parsedCitations();
                    if (!manual) {
                      setMessage({ kind: 'error', text: 'Citations must be a valid JSON array.' });
                      return;
                    }
                    const optionsEn = questionDraft.optionsEn.filter((o) => o.trim().length > 0);
                    if (optionsEn.length < 2) {
                      setMessage({ kind: 'error', text: 'At least two filled options are required.' });
                      return;
                    }
                    // A ticked rule always brings its own citation with it, so a grounded item
                    // can never be saved with an empty source list.
                    const citations = [...manual];
                    for (const f of data.verifiedFacts.filter((v) => questionDraft.factIds.includes(v.id))) {
                      if (!citations.some((c) => c.url === f.citation.url)) citations.push(f.citation);
                    }
                    const ok = await post(
                      { action: 'SAVE_QUESTION', ...questionDraft, optionsEn, citations },
                      questionDraft.id ? 'Question' : 'New question'
                    );
                    if (ok) setQuestionDraft(null);
                  }}
                  disabled={busy !== null || !questionDraft.questionEn}
                  className="px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-xs font-bold text-white flex items-center gap-2"
                >
                  <Save className="w-4 h-4" />
                  <span>Save question</span>
                </button>
                <button
                  onClick={() => setQuestionDraft(null)}
                  className="px-3.5 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-xs font-semibold text-zinc-200"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'REVIEW' && data && (
        <div className="space-y-4">
          <div className="p-4 rounded-2xl bg-zinc-900 border border-zinc-800">
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-amber-400" />
              <span>Review queue ({data.reviewQueue.length})</span>
            </h2>
            <p className="text-[11px] text-zinc-400 mt-1.5">
              Nothing on this list reaches a learner. An item is here because the verification gate could not defend it, or
              because a learner reported it as wrong. The decision is made server-side: an item with no citation, no legal
              review date, or no link to a verified rule stays held even when publish is pressed.
            </p>
            <p className="text-[11px] text-zinc-500 mt-1.5">
              Refresh rule: content older than {data.reviewOverdue.thresholdDays} days is treated as out of date —{' '}
              {data.reviewOverdue.questions} question(s), {data.reviewOverdue.lessons} lesson(s) and{' '}
              {data.reviewOverdue.signs} sign entry(ies) now need re-checking.
            </p>
          </div>

          {data.reviewQueue.length === 0 ? (
            <div className="p-6 rounded-2xl bg-zinc-900 border border-zinc-800 text-center">
              <p className="text-xs font-semibold text-emerald-300">The queue is empty.</p>
              <p className="text-[11px] text-zinc-500 mt-1">
                No item is waiting and no learner report is open. Newly generated questions appear here before they can be
                taught.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {data.reviewQueue.map((q) => {
                const openReports = q.issueReports.filter((r) => !r.resolvedAt);
                const settled = q.issueReports.length - openReports.length;
                return (
                  <div key={q.id} className="p-4 rounded-2xl bg-zinc-900 border border-amber-500/20 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-white">{q.questionEn}</p>
                        <p className="text-[11px] text-zinc-400 mt-0.5">{q.questionRw}</p>
                        <p className="text-[10px] text-zinc-500 mt-1">
                          {data.modules.find((m) => m.id === q.moduleId)?.titleEn ?? 'unassigned topic'} · {q.difficulty} ·{' '}
                          {q.source === 'AI_GENERATED' ? 'AI-generated' : q.source === 'ADMIN_AUTHORED' ? 'written here' : 'content pack'}{' '}
                          · {q.citations.length} source(s) · {q.factIds.length} rule(s) ·{' '}
                          {q.legalVerifiedAt ? `reviewed ${q.legalVerifiedAt.slice(0, 10)}` : 'NOT legally reviewed'}
                        </p>
                      </div>
                      <StatusPill status={q.status} />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {(q.optionsEn.length ? q.optionsEn : q.optionsRw).map((opt, i) => (
                        <p
                          key={i}
                          className={`text-[11px] px-2.5 py-1.5 rounded-lg border ${
                            i === q.correctIndex ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-200' : 'bg-zinc-950 border-zinc-800 text-zinc-300'
                          }`}
                        >
                          {String.fromCharCode(65 + i)}. {opt}
                        </p>
                      ))}
                    </div>

                    {q.reviewReasons.length > 0 && (
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-amber-300 font-semibold mb-1">
                          Why it is held
                        </p>
                        <ul className="space-y-1">
                          {q.reviewReasons.map((r, i) => (
                            <li key={i} className="text-[11px] text-zinc-300 flex items-start gap-1.5">
                              <AlertCircle className="w-3 h-3 text-amber-400 shrink-0 mt-0.5" />
                              <span>{r}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {openReports.length > 0 && (
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-amber-300 font-semibold mb-1">
                          Reported by learners ({openReports.length})
                        </p>
                        <ul className="space-y-1">
                          {openReports.map((r, i) => (
                            <li key={i} className="text-[11px] text-zinc-300">
                              <span className="text-zinc-500">
                                {new Date(r.reportedAt).toLocaleString()} · {r.channel} ·{' '}
                                {r.userId ? r.userId.slice(0, 10) : 'anonymous'}
                              </span>{' '}
                              {r.note}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {settled > 0 && (
                      <p className="text-[10px] text-zinc-500">
                        {settled} earlier report(s) already resolved by an administrator.
                      </p>
                    )}

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        onClick={() => void review(q.id, 'approve', '')}
                        disabled={busy !== null}
                        className="px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-[11px] font-bold text-white flex items-center gap-1.5"
                      >
                        {busy === `approve:${q.id}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                        <span>{q.status === 'PUBLISHED' ? 'Mark reviewed' : 'Publish to learners'}</span>
                      </button>
                      <input
                        value={rejectNotes[q.id] ?? ''}
                        onChange={(e) => setRejectNotes((prev) => ({ ...prev, [q.id]: e.target.value }))}
                        placeholder="Reason for rejecting (required, stored on the item)"
                        className={`${inputClass} flex-1 min-w-[220px]`}
                      />
                      <button
                        onClick={() => void review(q.id, 'reject', rejectNotes[q.id] ?? '')}
                        disabled={busy !== null}
                        className="px-3 py-2 rounded-lg bg-zinc-800 hover:bg-red-500/20 border border-zinc-700 disabled:opacity-50 text-[11px] font-bold text-zinc-200 flex items-center gap-1.5"
                      >
                        {busy === `reject:${q.id}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <AlertCircle className="w-3.5 h-3.5" />}
                        <span>Reject</span>
                      </button>
                      <button
                        onClick={() => {
                          startQuestion(q);
                          setTab('QUESTIONS');
                        }}
                        className="px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-[11px] font-semibold text-zinc-200"
                      >
                        Correct
                      </button>
                    </div>
                    <p className="text-[10px] text-zinc-500">
                      “Correct” opens the editor: add the source, tick the verified rule and set the review date, then publish.
                      Rejecting without fixing it keeps the item out of every paper.
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {tab === 'CONTROLS' && data && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            <Metric label="Verified rules" value={data.generation.verifiedRules} hint="Grounding available" />
            <Metric label="Documented gaps" value={data.generation.documentedGaps} hint="Searched, not found" />
            <Metric label="Held for review" value={data.generation.reviewQueue} hint="Not teachable yet" />
            <Metric
              label="Tokens today"
              value={data.generation.tokensToday}
              hint={`budget ${data.generation.dailyTokenBudget.toLocaleString()}`}
            />
            <Metric
              label="Generation"
              value={data.generation.enabled ? 'ON' : 'OFF'}
              hint={data.generation.autoPublishVerified ? 'auto-publish on' : 'nothing publishes itself'}
            />
            <Metric label="Learner reports" value={data.stats.learnerReports ?? 0} hint="All channels" />
          </div>

          <div className="p-5 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-4">
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <SlidersHorizontal className="w-4 h-4 text-emerald-400" />
              <span>Academy controls</span>
            </h2>
            <p className="text-[11px] text-zinc-400">
              These change what the engine is allowed to do. They cannot change the law: every value is re-checked on the
              server, out-of-range numbers are clamped, and a partial save can never switch a protection off by omission.
              Last changed by {data.settings.updatedBy} on {data.settings.updatedAt.slice(0, 10)}.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <NumberField
                label="Content refresh interval (days)"
                value={settingsBase?.contentRefreshDays ?? data.settings.contentRefreshDays}
                min={7}
                max={730}
                onChange={(v) => patchSettings({ contentRefreshDays: v })}
                hint="Published content older than this is listed as overdue above."
              />
              <div className="space-y-2 pt-1">
                <Check
                  label="Require verification to publish"
                  checked={settingsBase?.verificationRequiredToPublish ?? data.settings.verificationRequiredToPublish}
                  onChange={(v) => patchSettings({ verificationRequiredToPublish: v })}
                  hint="When on, an item must also be linked to a rule in the verified registry. Turning it off lets uncited wording through."
                />
                <div className="flex items-center gap-4">
                  <Check
                    label="English"
                    checked={(settingsBase?.languages ?? data.settings.languages).includes('ENGLISH')}
                    onChange={(v) =>
                      patchSettings({
                        languages: v
                          ? ['ENGLISH', 'KINYARWANDA']
                          : ['KINYARWANDA'],
                      })
                    }
                  />
                  <Check
                    label="Kinyarwanda"
                    checked={(settingsBase?.languages ?? data.settings.languages).includes('KINYARWANDA')}
                    onChange={(v) =>
                      patchSettings({
                        languages: v ? ['ENGLISH', 'KINYARWANDA'] : ['ENGLISH'],
                      })
                    }
                  />
                </div>
                <p className="text-[10px] text-zinc-500">
                  Generated wording is asked for in the selected languages only. Both unchecked falls back to the default
                  pair.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1 border-t border-zinc-800">
              <div className="space-y-2 pt-3">
                <p className="text-[11px] font-bold text-zinc-200">Generation limits</p>
                <Check
                  label="AI generation enabled"
                  checked={genValue(data.settings, 'enabled')}
                  onChange={(v) => patchGeneration({ enabled: v })}
                  hint="Off means the verified bank and the content pack only."
                />
                <Check
                  label="Auto-publish a verified item"
                  checked={genValue(data.settings, 'autoPublishVerified')}
                  onChange={(v) => patchGeneration({ autoPublishVerified: v })}
                  hint="Off keeps every generated item in the review queue until a person clears it."
                />
              </div>
              <div className="space-y-3 pt-3">
                <NumberField
                  label="Items per session"
                  value={genValue(data.settings, 'perSessionMax')}
                  min={1}
                  max={20}
                  onChange={(v) => patchGeneration({ perSessionMax: v })}
                />
                <NumberField
                  label="Items per learner per day"
                  value={genValue(data.settings, 'perUserPerDay')}
                  min={0}
                  max={50}
                  onChange={(v) => patchGeneration({ perUserPerDay: v })}
                  hint="0 stops learners from asking for new items."
                />
              </div>
              <div className="space-y-3 pt-3">
                <NumberField
                  label="Daily token budget"
                  value={genValue(data.settings, 'dailyTokenBudget')}
                  min={0}
                  max={5000000}
                  onChange={(v) => patchGeneration({ dailyTokenBudget: v })}
                  hint="Spent from real provider quota."
                />
                <div className="space-y-2">
                  <Check
                    label="Allow multiple-answer items"
                    checked={genValue(data.settings, 'allowMultiAnswer')}
                    onChange={(v) => patchGeneration({ allowMultiAnswer: v })}
                    hint="WhatsApp replies carry one option per question, so multi-answer items cannot be graded there."
                  />
                  <Check
                    label="Allow road-sign identification"
                    checked={genValue(data.settings, 'allowSignIdentification')}
                    onChange={(v) => patchGeneration({ allowSignIdentification: v })}
                    hint="An item is only publishable once a photographed sign is on file for it."
                  />
                </div>
              </div>
              <div className="space-y-3 pt-3">
                <p className="text-[11px] font-bold text-zinc-200">Paper sizes (simulation)</p>
                <NumberField
                  label="Practice set"
                  value={examValue(data.settings, 'practiceCount')}
                  min={1}
                  max={100}
                  onChange={(v) => patchExam({ practiceCount: v })}
                />
                <NumberField
                  label="Learn session"
                  value={examValue(data.settings, 'learnCount')}
                  min={1}
                  max={100}
                  onChange={(v) => patchExam({ learnCount: v })}
                />
                <NumberField
                  label="Mock exam questions"
                  value={examValue(data.settings, 'mockCount')}
                  min={1}
                  max={100}
                  onChange={(v) => patchExam({ mockCount: v })}
                />
                <NumberField
                  label="Mock exam minutes"
                  value={examValue(data.settings, 'mockMinutes')}
                  min={1}
                  max={240}
                  onChange={(v) => patchExam({ mockMinutes: v })}
                  hint="Our own timing. The instruments do not state an official duration."
                />
                <Check
                  label="Strict papers by default"
                  checked={examValue(data.settings, 'strictModeByDefault')}
                  onChange={(v) => patchExam({ strictModeByDefault: v })}
                  hint="Server timer, autosave, no answers shown before submission."
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                onClick={() => void saveSettings()}
                disabled={busy !== null}
                className="px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-xs font-bold text-white flex items-center gap-2"
              >
                {busy === 'SETTINGS' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                <span>Save controls</span>
              </button>
              {(settingsDraft || sourcesDraft) && (
                <button
                  onClick={() => {
                    setSettingsDraft(null);
                    setSourcesDraft(null);
                  }}
                  className="px-3.5 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-xs font-semibold text-zinc-200"
                >
                  Discard changes
                </button>
              )}
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-3">
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-emerald-400" />
              <span>Approved sources</span>
            </h2>
            <p className="text-[11px] text-zinc-400">
              The only places the engine may be grounded on. {data.settings.approvedSources.filter((s) => s.contentReuse === 'COPY_PERMITTED').length}{' '}
              of these allow wording to be reused; a discovery reference tells us which topics learners expect and nothing
              more. Login walls, paywalls and anti-bot checks are never bypassed, and changing an entry here does not
              create permission you have not been given.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="text-left text-[10px] uppercase tracking-wider text-zinc-500 border-b border-zinc-800">
                    <th className="px-2 py-2 font-semibold">Source</th>
                    <th className="px-2 py-2 font-semibold">Permission</th>
                    <th className="px-2 py-2 font-semibold">robots.txt</th>
                    <th className="px-2 py-2 font-semibold">Automated access</th>
                    <th className="px-2 py-2 font-semibold">Content reuse</th>
                    <th className="px-2 py-2 font-semibold">Inspected</th>
                    <th className="px-2 py-2 font-semibold">Notes</th>
                    <th className="px-2 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/80">
                  {sourceLedger.map((s, i) => (
                    <tr key={s.id}>
                      <td className="px-2 py-2 align-top min-w-[220px]">
                        <p className="text-zinc-100 font-semibold">{s.name}</p>
                        <a
                          href={s.url}
                          target="_blank"
                          rel="noreferrer nofollow"
                          className="text-[10px] text-emerald-400 hover:underline break-all"
                        >
                          {s.url}
                        </a>
                        <p className="text-[10px] text-zinc-500">{s.publisher}</p>
                      </td>
                      <td className="px-2 py-2 align-top">
                        <LedgerSelect value={s.permission} options={PERMISSIONS} onChange={(v) => patchSource(i, { permission: v })} />
                      </td>
                      <td className="px-2 py-2 align-top">
                        <LedgerSelect value={s.robots} options={ROBOT_STATES} onChange={(v) => patchSource(i, { robots: v })} />
                      </td>
                      <td className="px-2 py-2 align-top">
                        <LedgerSelect value={s.automatedAccess} options={AUTOMATED_ACCESS} onChange={(v) => patchSource(i, { automatedAccess: v })} />
                      </td>
                      <td className="px-2 py-2 align-top">
                        <LedgerSelect value={s.contentReuse} options={CONTENT_REUSE} onChange={(v) => patchSource(i, { contentReuse: v })} />
                      </td>
                      <td className="px-2 py-2 align-top text-zinc-400 whitespace-nowrap">{s.lastInspectedAt}</td>
                      <td className="px-2 py-2 align-top min-w-[240px]">
                        <input
                          value={s.notes}
                          onChange={(e) => patchSource(i, { notes: e.target.value })}
                          className={`${inputClass} text-[10px]`}
                        />
                      </td>
                      <td className="px-2 py-2 align-top">
                        <button
                          onClick={() => setSourcesDraft(sourceLedger.filter((_, k) => k !== i))}
                          className="text-[11px] text-zinc-500 hover:text-red-300"
                          aria-label={`Remove ${s.name} from the ledger`}
                        >
                          remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={newSource.id}
                onChange={(e) => setNewSource({ ...newSource, id: e.target.value })}
                placeholder="id (e.g. order-123-2026)"
                className={`${inputClass} max-w-[180px]`}
              />
              <input
                value={newSource.name}
                onChange={(e) => setNewSource({ ...newSource, name: e.target.value })}
                placeholder="Name of the instrument or service"
                className={`${inputClass} flex-1 min-w-[200px]`}
              />
              <input
                value={newSource.url}
                onChange={(e) => setNewSource({ ...newSource, url: e.target.value })}
                placeholder="https://"
                className={`${inputClass} flex-1 min-w-[200px]`}
              />
              <button
                onClick={() => {
                  const id = newSource.id.trim();
                  const url = newSource.url.trim();
                  if (!id || !url) {
                    setMessage({ kind: 'error', text: 'An id and a URL are needed before a source can be added.' });
                    return;
                  }
                  if (sourceLedger.some((s) => s.id === id)) {
                    setMessage({ kind: 'error', text: `A source with id ${id} is already in the ledger.` });
                    return;
                  }
                  setSourcesDraft([
                    ...sourceLedger,
                    {
                      id,
                      name: newSource.name.trim() || id,
                      url,
                      publisher: '',
                      permission: 'GOVERNMENT_SERVICE_PAGE',
                      robots: 'NOT_INSPECTED',
                      automatedAccess: 'UNSTATED',
                      contentReuse: 'STRUCTURE_ONLY',
                      lastInspectedAt: new Date().toISOString().slice(0, 10),
                      notes: 'Added from the admin ledger. Inspect it before allowing reuse.',
                    },
                  ]);
                  setNewSource({ id: '', name: '', url: '' });
                  setMessage({ kind: 'ok', text: 'Added to the draft ledger. Save controls to store it.' });
                }}
                className="px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-[11px] font-semibold text-zinc-200 flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add source</span>
              </button>
            </div>
            <p className="text-[10px] text-zinc-500">
              A new row starts at the most restrictive reuse level. Raising it to “wording may be copied” is only correct
              once you hold permission or the text is a published legal instrument.
            </p>
          </div>

          <div className="p-5 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-3">
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-emerald-400" />
              <span>Generate a grounded batch</span>
            </h2>
            <p className="text-[11px] text-zinc-400">
              The model is given only the verified rules below and must return a citation for each item. Anything the gate
              cannot match to a rule is held for review instead of published, so this spends real provider tokens and adds
              no law of its own.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <NumberField
                label="Items (max 10)"
                value={batch.count}
                min={1}
                max={10}
                onChange={(v) => setBatch({ ...batch, count: Math.min(Math.max(v, 1), 10) })}
              />
              <label className="space-y-1 block">
                <span className="text-[11px] font-semibold text-zinc-300">Topic</span>
                <select value={batch.moduleId} onChange={(e) => setBatch({ ...batch, moduleId: e.target.value })} className={inputClass}>
                  <option value="">Whole curriculum</option>
                  {data.modules.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.titleEn} ({m.code})
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1 block">
                <span className="text-[11px] font-semibold text-zinc-300">Difficulty</span>
                <select value={batch.difficulty} onChange={(e) => setBatch({ ...batch, difficulty: e.target.value })} className={inputClass}>
                  <option value="EASY">EASY</option>
                  <option value="MEDIUM">MEDIUM</option>
                  <option value="HARD">HARD</option>
                </select>
              </label>
              <div className="sm:flex sm:items-end">
                <button
                  onClick={() => void generateBatch()}
                  disabled={busy !== null || !data.generation.enabled}
                  className="w-full px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-xs font-bold text-white flex items-center justify-center gap-2"
                >
                  {busy === 'BATCH' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  <span>{data.generation.enabled ? 'Run generation' : 'Generation is switched off'}</span>
                </button>
              </div>
            </div>
          </div>

          <div className="rounded-2xl bg-zinc-900 border border-zinc-800 overflow-hidden">
            <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between gap-2">
              <h2 className="text-sm font-bold text-white">Generation runs ({data.generationRuns.length})</h2>
              <p className="text-[10px] text-zinc-500">Last {data.generationRuns.length} runs, newest first</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="text-left text-[10px] uppercase tracking-wider text-zinc-500 border-b border-zinc-800">
                    <th className="px-3 py-2 font-semibold">Started</th>
                    <th className="px-2 py-2 font-semibold">Kind</th>
                    <th className="px-2 py-2 font-semibold">Asked</th>
                    <th className="px-2 py-2 font-semibold">Returned</th>
                    <th className="px-2 py-2 font-semibold">Published</th>
                    <th className="px-2 py-2 font-semibold">Held</th>
                    <th className="px-2 py-2 font-semibold">Provider / model</th>
                    <th className="px-2 py-2 font-semibold">Tokens</th>
                    <th className="px-2 py-2 font-semibold">Latency</th>
                    <th className="px-2 py-2 font-semibold">Outcome</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/80">
                  {data.generationRuns.map((r) => (
                    <tr key={r.id}>
                      <td className="px-3 py-2 text-zinc-400 whitespace-nowrap">{new Date(r.startedAt).toLocaleString()}</td>
                      <td className="px-2 py-2 text-zinc-300">{r.kind.replace('_', ' ').toLowerCase()}</td>
                      <td className="px-2 py-2 text-zinc-300">{r.requested}</td>
                      <td className="px-2 py-2 text-zinc-300">{r.candidates}</td>
                      <td className="px-2 py-2 text-emerald-300">{r.published}</td>
                      <td className="px-2 py-2 text-amber-300">{r.heldForReview}</td>
                      <td className="px-2 py-2 text-zinc-300">
                        {r.provider ?? <span className="text-zinc-600">none</span>}
                        {r.model ? <span className="text-zinc-500"> / {r.model}</span> : null}
                      </td>
                      <td className="px-2 py-2 text-zinc-300">{r.tokensUsed.toLocaleString()}</td>
                      <td className="px-2 py-2 text-zinc-400">{(r.latencyMs / 1000).toFixed(1)}s</td>
                      <td className="px-2 py-2" title={r.attempts.join(' → ')}>
                        {r.error ? (
                          <span className="text-red-300">{r.error}</span>
                        ) : (
                          <span className="text-zinc-500">{r.attempts.length > 1 ? 'fell back' : 'ok'}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {data.generationRuns.length === 0 && (
                    <tr>
                      <td colSpan={10} className="px-4 py-6 text-center text-[11px] text-zinc-500">
                        No generation run has been recorded. Nothing has been asked of a provider for this academy yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <p className="px-4 py-3 text-[10px] text-zinc-500 border-t border-zinc-800">
              {data.stats.providerFailures ?? 0} of {data.stats.generationRuns ?? 0} run(s) ended in a provider failure;{' '}
              {data.stats.generatedPublished ?? 0} of {data.stats.generatedQuestions ?? 0} generated item(s) reached a
              learner. Hover “Outcome” for the provider chain.
            </p>
          </div>
        </div>
      )}

      {tab === 'SIGNS' && data && (
        <div className="rounded-2xl bg-zinc-900 border border-zinc-800 overflow-hidden">
          <div className="px-4 py-3 border-b border-zinc-800 flex items-center gap-2">
            <TrafficCone className="w-4 h-4 text-amber-400" />
            <h2 className="text-sm font-bold text-white">Sign categories and conventions</h2>
          </div>
          <div className="divide-y divide-zinc-800/70">
            {data.signs.map((s) => (
              <div key={s.id} className="px-4 py-3 flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold text-white">
                    {s.nameEn} <span className="text-zinc-500 font-normal">/ {s.nameRw}</span>
                  </p>
                  <p className="text-[11px] text-zinc-400 mt-0.5">{s.meaningEn}</p>
                  <p className="text-[10px] text-zinc-500 mt-1">
                    {s.category} · {s.shape} · {s.colourConvention} · {s.citations.length} source(s)
                  </p>
                </div>
                <StatusPill status={s.status} />
              </div>
            ))}
            {data.signs.length === 0 && (
              <p className="px-4 py-6 text-center text-[11px] text-zinc-500">
                No sign conventions recorded. Import the content pack to add the shape and colour rules from the
                traffic order.
              </p>
            )}
          </div>
        </div>
      )}

      {tab === 'PAPERS' && data && (
        <div className="rounded-2xl bg-zinc-900 border border-zinc-800 overflow-hidden">
          <div className="px-4 py-3 border-b border-zinc-800 flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-emerald-400" />
            <h2 className="text-sm font-bold text-white">Exam papers</h2>
          </div>
          <div className="divide-y divide-zinc-800/70">
            {data.exams.map((e) => (
              <div key={e.id} className="px-4 py-3 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold text-white">
                    {e.nameEn} <span className="text-zinc-500 font-normal">/ {e.nameRw}</span>
                  </p>
                  <p className="text-[10px] text-zinc-500 mt-0.5">
                    {e.questionCount} questions · pass at {e.passPercent}% ·{' '}
                    {e.moduleId
                      ? data.modules.find((m) => m.id === e.moduleId)?.titleEn ?? 'one module'
                      : 'mixed modules'}
                    {e.timeLimitMinutes ? ` · ${e.timeLimitMinutes} min` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusPill status={e.status} />
                  <select
                    value={e.status}
                    onChange={(ev) => setStatus('EXAM', e.id, ev.target.value)}
                    className="bg-zinc-950 border border-zinc-800 rounded-md px-1.5 py-1 text-[10px] text-zinc-300 outline-none"
                  >
                    <option value="DRAFT">DRAFT</option>
                    <option value="PUBLISHED">PUBLISHED</option>
                    <option value="ARCHIVED">ARCHIVED</option>
                  </select>
                </div>
              </div>
            ))}
            {data.exams.length === 0 && (
              <p className="px-4 py-6 text-center text-[11px] text-zinc-500">No exam papers configured.</p>
            )}
          </div>
        </div>
      )}

      {tab === 'LEARNERS' && data && (
        <div className="rounded-2xl bg-zinc-900 border border-zinc-800 overflow-hidden">
          <div className="px-4 py-3 border-b border-zinc-800">
            <h2 className="text-sm font-bold text-white">
              Attempts ({data.attempts.length}) · passed {data.stats.passedAttempts ?? 0}
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wider text-zinc-500 border-b border-zinc-800">
                  <th className="px-4 py-2.5 font-semibold">Learner</th>
                  <th className="px-2 py-2.5 font-semibold">Kind</th>
                  <th className="px-2 py-2.5 font-semibold">Score</th>
                  <th className="px-2 py-2.5 font-semibold">Result</th>
                  <th className="px-2 py-2.5 font-semibold">Started</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/80">
                {data.attempts.map((a) => (
                  <tr key={a.id}>
                    <td className="px-4 py-2.5 font-mono text-[10px] text-zinc-400">{a.userId.slice(0, 12)}</td>
                    <td className="px-2 py-2.5 text-zinc-300">{a.kind.replace('_', ' ')}</td>
                    <td className="px-2 py-2.5 text-zinc-300">
                      {a.correctCount}/{a.totalQuestions} ({a.scorePercent}%)
                    </td>
                    <td className="px-2 py-2.5">
                      {a.submittedAt ? (
                        a.passed ? (
                          <span className="text-emerald-400 font-semibold">passed</span>
                        ) : (
                          <span className="text-amber-300 font-semibold">not passed</span>
                        )
                      ) : (
                        <span className="text-zinc-500">in progress</span>
                      )}
                    </td>
                    <td className="px-2 py-2.5 text-[10px] text-zinc-500">{new Date(a.startedAt).toLocaleString()}</td>
                  </tr>
                ))}
                {data.attempts.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-[11px] text-zinc-500">
                      Nobody has taken a practice set or mock exam yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function Header({ version, reviewedOn }: { version?: string; reviewedOn?: string }) {
  return (
    <div>
      <h1 className="text-xl font-bold text-white flex items-center gap-2">
        <Car className="w-5 h-5 text-emerald-400" />
        <span>Road Safety Academy — Curriculum</span>
      </h1>
      <p className="text-xs text-zinc-400 mt-1">
        Bilingual lessons, signs and exam papers for Rwandan learners.{' '}
        {version ? `Reviewed pack v${version} (sources checked ${reviewedOn}).` : 'Reading pack version…'} Unpublished
        items never reach a learner, and a lesson without a citation cannot be published.
      </p>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const styles: Record<string, string> = {
    PUBLISHED: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/25',
    DRAFT: 'bg-zinc-800 text-zinc-300 border-zinc-700',
    NEEDS_REVIEW: 'bg-amber-500/10 text-amber-300 border-amber-500/25',
    ARCHIVED: 'bg-zinc-800 text-zinc-500 border-zinc-700',
  };
  return (
    <span className={`text-[10px] px-2 py-1 rounded-md font-semibold border whitespace-nowrap ${styles[status] || styles.DRAFT}`}>
      {status}
    </span>
  );
}

const PERMISSIONS = ['OFFICIAL_INSTRUMENT', 'GOVERNMENT_SERVICE_PAGE', 'DISCOVERY_REFERENCE_ONLY', 'LICENCE_REQUIRED'];
const ROBOT_STATES = ['ALLOWED', 'DISALLOWED', 'ABSENT', 'NOT_INSPECTED'];
const AUTOMATED_ACCESS = ['PERMITTED', 'NOT_PERMITTED', 'UNSTATED'];
const CONTENT_REUSE = ['COPY_PERMITTED', 'STRUCTURE_ONLY', 'NO_ACCESS'];

function Metric({ label, value, hint }: { label: string; value: number | string; hint: string }) {
  return (
    <div className="p-3 rounded-xl bg-zinc-900 border border-zinc-800">
      <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">{label}</p>
      <p className="text-lg font-bold text-white mt-0.5">{typeof value === 'number' ? value.toLocaleString() : value}</p>
      <p className="text-[10px] text-zinc-500">{hint}</p>
    </div>
  );
}

/**
 * Numeric controls are plain inputs: the server clamps anything outside the range it will
 * honour and the saved value is read back, so min/max here is a hint rather than a promise.
 */
function NumberField({
  label,
  value,
  min,
  max,
  hint,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  hint?: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-[11px] font-semibold text-zinc-300">{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className={inputClass}
      />
      {hint && <span className="block text-[10px] text-zinc-500">{hint}</span>}
    </label>
  );
}

function Check({
  label,
  checked,
  hint,
  onChange,
}: {
  label: string;
  checked: boolean;
  hint?: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-2">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 w-3.5 h-3.5 accent-emerald-500"
      />
      <span className="min-w-0">
        <span className="text-[11px] font-semibold text-zinc-200">{label}</span>
        {hint && <span className="block text-[10px] text-zinc-500">{hint}</span>}
      </span>
    </label>
  );
}

function LedgerSelect({
  value,
  options,
  onChange,
}: {
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <select
      value={options.includes(value) ? value : options[options.length - 1]}
      onChange={(e) => onChange(e.target.value)}
      className="bg-zinc-950 border border-zinc-800 rounded-md px-1.5 py-1 text-[10px] text-zinc-300 outline-none w-full"
    >
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

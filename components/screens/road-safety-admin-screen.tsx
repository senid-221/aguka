'use client';

import React, { useCallback, useEffect, useState } from 'react';
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

interface Question {
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
  difficulty: string;
  citations: Citation[];
  legalVerifiedAt: string | null;
  status: string;
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
  stats: Record<string, number>;
}

type Tab = 'LESSONS' | 'QUESTIONS' | 'SIGNS' | 'PAPERS' | 'LEARNERS';

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
      explanationEn: '',
      explanationRw: '',
      difficulty: 'MEDIUM',
      citations: [],
      legalVerifiedAt: null,
      status: 'DRAFT',
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
    { id: 'SIGNS', label: 'Road signs', count: data?.signs.length ?? 0 },
    { id: 'PAPERS', label: 'Exam papers', count: data?.exams.length ?? 0 },
    { id: 'LEARNERS', label: 'Attempts', count: data?.attempts.length ?? 0 },
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
                        {q.optionsEn.length} options · answer {String.fromCharCode(65 + q.correctIndex)} ·{' '}
                        {q.difficulty} ·{' '}
                        {q.legalVerifiedAt ? (
                          <span className="text-emerald-400">cited</span>
                        ) : (
                          <span className="text-amber-300">uncited</span>
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
                    const optionsEn = questionDraft.optionsEn.filter((o) => o.trim().length > 0);
                    if (optionsEn.length < 2) {
                      setMessage({ kind: 'error', text: 'At least two filled options are required.' });
                      return;
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
    ARCHIVED: 'bg-zinc-800 text-zinc-500 border-zinc-700',
  };
  return (
    <span className={`text-[10px] px-2 py-1 rounded-md font-semibold border whitespace-nowrap ${styles[status] || styles.DRAFT}`}>
      {status}
    </span>
  );
}

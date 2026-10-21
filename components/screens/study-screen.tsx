'use client';

import React, { useState, useEffect } from 'react';
import {
  GraduationCap,
  BookOpen,
  CheckCircle2,
  HelpCircle,
  Sparkles,
  ArrowRight,
  Plus,
} from 'lucide-react';
import { StudySession } from '@/lib/types';
import { RwandaFlagIcon } from '@/components/icons/logos';

export function StudyScreen() {
  const [sessions, setSessions] = useState<StudySession[]>([]);
  const [selectedSession, setSelectedSession] = useState<StudySession | null>(null);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, number>>({});

  useEffect(() => {
    let isMounted = true;
    fetch('/api/study')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!isMounted || !data) return;
        setSessions(data.sessions || []);
        if (data.sessions?.length > 0) {
          setSelectedSession((prev) => prev || data.sessions[0]);
        }
      })
      .catch((err) => console.error('Error fetching study sessions:', err));

    return () => {
      isMounted = false;
    };
  }, []);

  const handleSelectAnswer = (quizId: string, answerIdx: number) => {
    setSelectedAnswers((prev) => ({ ...prev, [quizId]: answerIdx }));
  };

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <GraduationCap className="w-5 h-5 text-emerald-400" />
            <span>AI Tutoring & Bilingual Concept Engine</span>
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            Explaining STEM, computer science, and career concepts in clear Kinyarwanda & English with interactive quizzes and retention flashcards.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Curricula & Sessions List */}
        <div className="lg:col-span-4 bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden flex flex-col">
          <div className="p-3.5 border-b border-zinc-800 bg-zinc-950/60 flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-300">
              Study Modules ({sessions.length})
            </span>
          </div>

          <div className="divide-y divide-zinc-800/60 overflow-y-auto">
            {sessions.map((s) => {
              const isSelected = selectedSession?.id === s.id;
              return (
                <button
                  key={s.id}
                  onClick={() => setSelectedSession(s)}
                  className={`w-full p-4 text-left transition-all ${
                    isSelected ? 'bg-zinc-800/80 border-l-2 border-emerald-500' : 'hover:bg-zinc-900/60'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] px-2 py-0.5 rounded font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      {s.subject}
                    </span>
                    <span className="text-[10px] text-zinc-400 flex items-center gap-1 font-mono">
                      {s.language === 'KINYARWANDA' && <RwandaFlagIcon className="w-3.5 h-2.5" />}
                      <span>{s.language}</span>
                    </span>
                  </div>
                  <h3 className="text-xs font-bold text-white mt-1.5">{s.topic}</h3>
                  <p className="text-[11px] text-zinc-400 line-clamp-2 mt-1 leading-relaxed">
                    {s.notes}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right Column: Explanations & Interactive Quiz Canvas */}
        <div className="lg:col-span-8 bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-5">
          {selectedSession ? (
            <>
              <div>
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-bold text-white flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-emerald-400" />
                    <span>{selectedSession.topic}</span>
                  </h2>
                  <span className="text-xs font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-300">
                    {selectedSession.subject}
                  </span>
                </div>
                <div className="mt-3 p-4 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 leading-relaxed whitespace-pre-wrap">
                  {selectedSession.notes}
                </div>
              </div>

              {/* Interactive Quizzes */}
              <div className="space-y-4 pt-3 border-t border-zinc-800">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                    <HelpCircle className="w-3.5 h-3.5" />
                    <span>Interactive Concept Check ({selectedSession.quizzes.length} Questions)</span>
                  </h3>
                  <span className="text-[10px] text-zinc-400">Click an option to test knowledge</span>
                </div>

                <div className="space-y-4">
                  {selectedSession.quizzes.map((quiz, qIdx) => {
                    const answered = selectedAnswers[quiz.id] !== undefined;
                    const selectedIdx = selectedAnswers[quiz.id];
                    const isCorrect = selectedIdx === quiz.correctIndex;

                    return (
                      <div
                        key={quiz.id}
                        className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 space-y-3 text-xs"
                      >
                        <p className="font-semibold text-zinc-100">
                          {qIdx + 1}. {quiz.question}
                        </p>

                        <div className="space-y-2">
                          {quiz.options.map((opt, oIdx) => {
                            const isThisSelected = selectedIdx === oIdx;
                            const isThisCorrect = quiz.correctIndex === oIdx;

                            let btnStyle = 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:bg-zinc-800';
                            if (answered) {
                              if (isThisCorrect) {
                                btnStyle = 'bg-emerald-500/20 border-emerald-500 text-emerald-300 font-semibold';
                              } else if (isThisSelected && !isCorrect) {
                                btnStyle = 'bg-red-500/20 border-red-500 text-red-300';
                              }
                            }

                            return (
                              <button
                                key={oIdx}
                                onClick={() => handleSelectAnswer(quiz.id, oIdx)}
                                className={`w-full p-2.5 rounded-lg border text-left transition-all flex items-center justify-between ${btnStyle}`}
                              >
                                <span>{opt}</span>
                                {answered && isThisCorrect && (
                                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                                )}
                              </button>
                            );
                          })}
                        </div>

                        {answered && (
                          <div className={`p-3 rounded-lg text-[11px] leading-relaxed border ${
                            isCorrect
                              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                              : 'bg-zinc-900 border-zinc-700 text-zinc-300'
                          }`}>
                            <span className="font-bold block mb-0.5">
                              {isCorrect ? '[Correct] Nibyo neza cyane!' : '[Explanation] Igisubizo cy’ukuri n’Igisobanuro:'}
                            </span>
                            {quiz.explanation}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          ) : (
            <div className="text-center py-16 text-zinc-500 text-xs">
              Select a module to view notes and quizzes
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

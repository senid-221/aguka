'use client';

import React, { useState, useEffect } from 'react';
import {
  Users2,
  Building2,
  Briefcase,
  Star,
  MapPin,
  CheckCircle2,
  ShieldCheck,
  TrendingUp,
  Percent,
  Plus,
  ArrowRight,
} from 'lucide-react';
import { WorkerProfile, EmployerProfile, Vacancy, JobMatch } from '@/lib/types';
import { RwandaFlagIcon } from '@/components/icons/logos';

export function EmploymentScreen() {
  const [workers, setWorkers] = useState<WorkerProfile[]>([]);
  const [employers, setEmployers] = useState<EmployerProfile[]>([]);
  const [vacancies, setVacancies] = useState<Vacancy[]>([]);
  const [matches, setMatches] = useState<JobMatch[]>([]);
  const [activeTab, setActiveTab] = useState<'matches' | 'workers' | 'vacancies'>('matches');

  useEffect(() => {
    let isMounted = true;
    fetch('/api/marketplace')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!isMounted || !data) return;
        setWorkers(data.workers || []);
        setEmployers(data.employers || []);
        setVacancies(data.vacancies || []);
        setMatches(data.matches || []);
      })
      .catch((err) => console.error('Error fetching marketplace data:', err));

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <div className="p-4 sm:p-6 space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Users2 className="w-5 h-5 text-emerald-400" />
            <span>Rwanda Employment Marketplace & Talent Matcher</span>
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            Verified local professionals, employers, and algorithmic talent-vacancy matchmaking with transparent, explainable scoring.
          </p>
        </div>

        <div className="flex items-center gap-2 bg-zinc-900 p-1 rounded-xl border border-zinc-800">
          <button
            onClick={() => setActiveTab('matches')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'matches'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            Matches ({matches.length})
          </button>
          <button
            onClick={() => setActiveTab('workers')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'workers'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            Talent Directory ({workers.length})
          </button>
          <button
            onClick={() => setActiveTab('vacancies')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'vacancies'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            Vacancies ({vacancies.length})
          </button>
        </div>
      </div>

      {/* Tab: Matches */}
      {activeTab === 'matches' && (
        <div className="space-y-4">
          <div className="p-3.5 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-between text-xs text-zinc-300">
            <span className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>Transparent AI Matching: Scores are computed strictly on verified technical skills, location proximity, and experience. Non-discriminatory.</span>
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {matches.map((match) => (
              <div
                key={match.id}
                className="p-5 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-zinc-700 transition-all space-y-4"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-white">{match.workerName}</h3>
                    <p className="text-xs text-zinc-400 mt-0.5">{match.workerTitle}</p>
                  </div>
                  <div className="text-right">
                    <span className="text-xl font-bold font-mono text-emerald-400">
                      {match.score.toFixed(1)}%
                    </span>
                    <span className="text-[10px] text-zinc-400 block">Match Score</span>
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-zinc-950 border border-zinc-800/80 space-y-2 text-xs">
                  <div className="flex items-center justify-between text-zinc-300">
                    <span className="font-medium">Matched Target Role:</span>
                    <span className="text-emerald-300 font-semibold truncate max-w-[200px]">
                      {match.targetTitle}
                    </span>
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[11px] text-zinc-400">
                      <span>Skills Match</span>
                      <span className="font-mono text-white font-semibold">
                        {match.explainability.skillsMatchPercentage}%
                      </span>
                    </div>
                    <div className="w-full bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                      <div
                        className="bg-emerald-500 h-full rounded-full"
                        style={{ width: `${match.explainability.skillsMatchPercentage}%` }}
                      />
                    </div>
                  </div>

                  <p className="text-[11px] text-zinc-400 pt-1 leading-relaxed">
                    💡 <span className="font-semibold text-zinc-300">Rationale:</span>{' '}
                    {match.explainability.rationale}
                  </p>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <div className="flex flex-wrap gap-1">
                    {match.explainability.matchedSkills.map((s) => (
                      <span
                        key={s}
                        className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono"
                      >
                        ✓ {s}
                      </span>
                    ))}
                  </div>

                  <button className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-zinc-200 border border-zinc-700 transition-colors">
                    Introduce Candidate
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab: Talent Directory */}
      {activeTab === 'workers' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {workers.map((w) => (
            <div
              key={w.id}
              className="p-5 rounded-xl bg-zinc-900 border border-zinc-800 space-y-4 flex flex-col justify-between"
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-white">{w.fullName}</h3>
                    <p className="text-xs text-emerald-400 font-medium mt-0.5">{w.title}</p>
                  </div>
                  <div className="flex items-center gap-1 text-xs font-bold text-amber-400">
                    <Star className="w-3.5 h-3.5 fill-amber-400" />
                    <span>{w.rating}</span>
                  </div>
                </div>

                <p className="text-xs text-zinc-400 leading-relaxed">{w.bio}</p>

                <div className="flex flex-wrap gap-1.5">
                  {w.skills.map((skill) => (
                    <span
                      key={skill}
                      className="text-[10px] px-2 py-0.5 rounded bg-zinc-950 text-zinc-300 border border-zinc-800 font-mono"
                    >
                      {skill}
                    </span>
                  ))}
                </div>
              </div>

              <div className="pt-3 border-t border-zinc-800/80 flex items-center justify-between text-xs text-zinc-400">
                <div className="flex items-center gap-1">
                  <MapPin className="w-3 h-3 text-zinc-500" />
                  <span>{w.district}</span>
                </div>
                <div className="font-mono text-zinc-200 font-semibold">
                  {w.hourlyRateRwf ? `RWF ${w.hourlyRateRwf.toLocaleString()}/hr` : 'Negotiable'}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tab: Vacancies */}
      {activeTab === 'vacancies' && (
        <div className="space-y-4">
          {vacancies.map((v) => (
            <div
              key={v.id}
              className="p-5 rounded-xl bg-zinc-900 border border-zinc-800 space-y-3"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold text-white">{v.title}</h3>
                  <p className="text-xs text-zinc-400 flex items-center gap-1.5 mt-0.5">
                    <Building2 className="w-3.5 h-3.5 text-zinc-500" />
                    <span>{v.employerName}</span>
                    <span>•</span>
                    <MapPin className="w-3 h-3 text-emerald-400" />
                    <span>{v.location}</span>
                  </p>
                </div>
                <div className="text-xs font-mono font-bold text-emerald-400">
                  {v.budgetRwf ? `Budget: RWF ${v.budgetRwf.toLocaleString()}` : 'Negotiable'}
                </div>
              </div>

              <p className="text-xs text-zinc-300">{v.description}</p>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-zinc-800">
                <div className="flex flex-wrap gap-1.5">
                  {v.requiredSkills.map((s) => (
                    <span
                      key={s}
                      className="text-[10px] px-2 py-0.5 rounded bg-zinc-950 text-zinc-300 border border-zinc-800 font-mono"
                    >
                      {s}
                    </span>
                  ))}
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold">
                  Active Vacancy
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

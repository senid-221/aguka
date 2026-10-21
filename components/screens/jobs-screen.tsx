'use client';

import React, { useState, useEffect } from 'react';
import {
  Briefcase,
  Search,
  Filter,
  CheckCircle2,
  ExternalLink,
  RefreshCw,
  Plus,
  ShieldCheck,
  Calendar,
  MapPin,
  Building2,
  DollarSign,
  AlertCircle,
} from 'lucide-react';
import { JobListing, JobSource } from '@/lib/types';
import { RwandaFlagIcon } from '@/components/icons/logos';

export function JobsScreen() {
  const [jobs, setJobs] = useState<JobListing[]>([]);
  const [sources, setSources] = useState<JobSource[]>([]);
  const [keyword, setKeyword] = useState('');
  const [selectedSource, setSelectedSource] = useState('ALL');
  const [isRemoteOnly, setIsRemoteOnly] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [crawlingSource, setCrawlingSource] = useState<string | null>(null);
  const [sourceNotice, setSourceNotice] = useState('');

  const loadJobs = () => {
    setIsLoading(true);
    const params = new URLSearchParams();
    if (keyword) params.append('keyword', keyword);
    if (selectedSource !== 'ALL') params.append('sourceCode', selectedSource);
    if (isRemoteOnly) params.append('isRemote', 'true');

    fetch(`/api/jobs?${params.toString()}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data) return;
        setJobs(data.jobs || []);
        setSources(data.sources || []);
      })
      .catch((err) => console.error('Error fetching jobs:', err))
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    let isMounted = true;
    const params = new URLSearchParams();
    if (keyword) params.append('keyword', keyword);
    if (selectedSource !== 'ALL') params.append('sourceCode', selectedSource);
    if (isRemoteOnly) params.append('isRemote', 'true');

    fetch(`/api/jobs?${params.toString()}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!isMounted || !data) return;
        setJobs(data.jobs || []);
        setSources(data.sources || []);
      })
      .catch((err) => console.error('Error fetching jobs:', err));

    return () => {
      isMounted = false;
    };
  }, [selectedSource, isRemoteOnly, keyword]);

  const handleCrawl = async (sourceCode: string) => {
    setCrawlingSource(sourceCode);
    setSourceNotice('');
    try {
      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'CRAWL_SOURCE', sourceCode }),
      });
      const data = await res.json();
      const status = data?.result?.status;
      if (status === 'NOT_CONFIGURED') {
        setSourceNotice(
          `${sourceCode}: no crawler is connected to this board yet, so nothing was fetched.`
        );
      } else if (status === 'UNKNOWN_SOURCE') {
        setSourceNotice(`${sourceCode} is not registered on this server.`);
      } else if (!res.ok) {
        setSourceNotice(data?.error || 'The crawl request failed.');
      } else {
        setSourceNotice(`${sourceCode}: ${data?.result?.crawledCount ?? 0} listing(s) imported.`);
      }
      loadJobs();
    } catch (err) {
      setSourceNotice(err instanceof Error ? err.message : 'Crawl request failed.');
    } finally {
      setCrawlingSource(null);
    }
  };

  const handleVerify = async (jobId: string) => {
    try {
      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'VERIFY_JOB', jobId }),
      });
      if (res.ok) {
        loadJobs();
      }
    } catch (err) {
      console.error('Verification failed:', err);
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Briefcase className="w-5 h-5 text-emerald-400" />
            <span>Jobs Discovery & Verification Hub</span>
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            Listings are only what has been imported or manually added — the platform never generates a
            vacancy. Live crawlers for MIFOTRA, Job in Rwanda and remote boards are not connected yet.
          </p>
        </div>

        <button
          onClick={loadJobs}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs text-zinc-200 border border-zinc-700 transition-colors w-max"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          <span>Refresh Listings</span>
        </button>
      </div>

      {/* Sources Health & Crawl Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {sources.map((src) => (
          <div
            key={src.id}
            className="p-4 rounded-xl bg-zinc-900 border border-zinc-800 space-y-3 flex flex-col justify-between"
          >
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-1.5">
                  <h3 className="text-xs font-bold text-white">{src.name}</h3>
                  {src.code === 'MIFOTRA' && <RwandaFlagIcon className="w-3.5 h-2 rounded-xs" />}
                </div>
                <a
                  href={src.baseUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] text-zinc-400 hover:text-emerald-400 flex items-center gap-1 mt-0.5 truncate"
                >
                  <span>{src.baseUrl}</span>
                  <ExternalLink className="w-2.5 h-2.5" />
                </a>
              </div>
              <span
                className={`text-[10px] px-2 py-0.5 rounded-md font-semibold border ${
                  src.healthStatus === 'HEALTHY'
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                    : src.healthStatus === 'DOWN'
                    ? 'bg-red-500/10 text-red-400 border-red-500/20'
                    : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                }`}
              >
                {src.healthStatus === 'UNKNOWN' ? 'Not crawled yet' : src.healthStatus}
              </span>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-zinc-800 text-[11px]">
              <span className="text-zinc-400">
                {src.activeListingsCount} stored listing(s)
                {src.lastCrawledAt
                  ? ` • synced ${new Date(src.lastCrawledAt).toLocaleString()}`
                  : ' • never synced'}
              </span>
              <button
                onClick={() => handleCrawl(src.code)}
                disabled={crawlingSource === src.code}
                className="flex items-center gap-1 px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-emerald-400 font-semibold text-[10px] border border-zinc-700 transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-2.5 h-2.5 ${crawlingSource === src.code ? 'animate-spin' : ''}`} />
                <span>{crawlingSource === src.code ? 'Trying…' : 'Attempt sync'}</span>
              </button>
            </div>
          </div>
        ))}
      </div>

      {sourceNotice && (
        <p className="text-[11px] text-amber-400 flex items-center gap-1.5 -mt-3">
          <AlertCircle className="w-3.5 h-3.5" />
          <span>{sourceNotice}</span>
        </p>
      )}

      {/* Filters Bar */}
      <div className="p-3.5 rounded-xl bg-zinc-900 border border-zinc-800 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        <div className="flex-1 relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            placeholder="Search verified jobs by title, company, skills..."
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && loadJobs()}
            className="w-full pl-9 pr-3 py-2 bg-zinc-950 text-xs text-zinc-200 placeholder-zinc-500 rounded-lg border border-zinc-800 outline-hidden focus:border-emerald-500"
          />
        </div>

        <div className="flex items-center gap-3">
          <select
            value={selectedSource}
            onChange={(e) => setSelectedSource(e.target.value)}
            className="bg-zinc-950 text-xs text-zinc-300 rounded-lg px-3 py-2 border border-zinc-800 outline-hidden"
          >
            <option value="ALL">All Sources</option>
            <option value="MIFOTRA">MIFOTRA E-Recruitment</option>
            <option value="JOB_IN_RWANDA">Job in Rwanda</option>
            <option value="REMOTE_TECH">Global Remote Tech</option>
          </select>

          <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer select-none px-2.5 py-2 bg-zinc-950 rounded-lg border border-zinc-800">
            <input
              type="checkbox"
              checked={isRemoteOnly}
              onChange={(e) => setIsRemoteOnly(e.target.checked)}
              className="accent-emerald-500 rounded"
            />
            <span>Remote Only</span>
          </label>
        </div>
      </div>

      {/* Listings Table */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-zinc-950/80 text-zinc-400 text-[11px] uppercase tracking-wider border-b border-zinc-800">
              <tr>
                <th className="py-3 px-4">Job Title & Employer</th>
                <th className="py-3 px-4">Location & Type</th>
                <th className="py-3 px-4">Remuneration</th>
                <th className="py-3 px-4">Application Deadline</th>
                <th className="py-3 px-4">Source & Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {jobs.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-xs text-zinc-500">
                    No job records stored yet. Import listings from the admin job form once a live
                    crawler is connected, or wait for verified feeds to populate the store.
                  </td>
                </tr>
              )}
              {jobs.map((job) => (
                <tr key={job.id} className="hover:bg-zinc-800/30 transition-colors">
                  <td className="py-3.5 px-4">
                    <div className="font-semibold text-zinc-100 flex items-center gap-1.5">
                      <span>{job.title}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-zinc-400 mt-0.5">
                      <Building2 className="w-3 h-3 text-zinc-500" />
                      <span>{job.employer}</span>
                    </div>
                  </td>
                  <td className="py-3.5 px-4">
                    <div className="flex items-center gap-1.5 text-zinc-200">
                      <MapPin className="w-3 h-3 text-emerald-400" />
                      <span>{job.location}</span>
                    </div>
                    <span className="text-[10px] text-zinc-500 font-mono mt-0.5 block">
                      {job.jobType}
                    </span>
                  </td>
                  <td className="py-3.5 px-4">
                    <div className="flex items-center gap-1 text-emerald-400 font-medium font-mono text-[11px]">
                      <DollarSign className="w-3 h-3 shrink-0" />
                      <span>{job.salaryRange || 'Per Scale'}</span>
                    </div>
                  </td>
                  <td className="py-3.5 px-4 text-zinc-300">
                    <div className="flex items-center gap-1 text-[11px]">
                      <Calendar className="w-3 h-3 text-zinc-500" />
                      <span>{job.deadline ? new Date(job.deadline).toLocaleDateString() : 'Rolling'}</span>
                    </div>
                  </td>
                  <td className="py-3.5 px-4">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] px-2 py-0.5 rounded font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>{job.verificationStatus}</span>
                      </span>
                    </div>
                    <a
                      href={job.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[10px] text-zinc-500 hover:text-emerald-400 flex items-center gap-1 mt-1 truncate max-w-[140px]"
                    >
                      <span>{job.sourceName}</span>
                      <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <a
                        href={job.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs border border-zinc-700 transition-colors inline-flex items-center gap-1"
                      >
                        <span>Official Link</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

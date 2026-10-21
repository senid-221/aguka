'use client';

import React, { useState } from 'react';
import {
  Bot,
  Briefcase,
  Code2,
  Image as ImageIcon,
  GraduationCap,
  Users2,
  FileText,
  ShieldCheck,
  CheckCircle2,
  Cpu,
  Sliders,
  Layers,
  Sparkles,
} from 'lucide-react';

interface AgentConfig {
  id: string;
  name: string;
  description: string;
  languages: string[];
  model: string;
  status: 'ACTIVE' | 'MAINTENANCE';
  icon: React.ReactNode;
  allowedTools: string[];
  maxTokens: number;
  rateLimitPerMin: number;
  temperature: number;
}

export function AgentsScreen() {
  const [agents, setAgents] = useState<AgentConfig[]>([
    {
      id: 'job-finder',
      name: 'Job Finder Agent',
      description: 'Connects to official MIFOTRA e-recruitment, Job in Rwanda, and remote boards. Enforces strict zero-hallucination source URL verification.',
      languages: ['Kinyarwanda', 'English'],
      model: 'gemini-3.8-flash',
      status: 'ACTIVE',
      icon: <Briefcase className="w-5 h-5 text-emerald-400" />,
      allowedTools: ['search_mifotra_jobs', 'filter_remote_jobs', 'validate_deadline', 'schedule_alerts'],
      maxTokens: 1024,
      rateLimitPerMin: 30,
      temperature: 0.2,
    },
    {
      id: 'career-assistant',
      name: 'Career & CV Assistant',
      description: 'Generates Rwanda-compliant bilingual CVs, tailored cover letters, and interview coaching. Never auto-applies without explicit consent.',
      languages: ['Kinyarwanda', 'English'],
      model: 'gemini-3.8-flash',
      status: 'ACTIVE',
      icon: <FileText className="w-5 h-5 text-blue-400" />,
      allowedTools: ['generate_cv_template', 'draft_cover_letter', 'interview_qna', 'check_application_consent'],
      maxTokens: 2048,
      rateLimitPerMin: 20,
      temperature: 0.4,
    },
    {
      id: 'coding-agent',
      name: 'Coding Agent & Sandbox',
      description: 'Analyzes code, scaffolds microservices, generates Swagger docs, and executes code in an isolated sandboxed container with strict memory limits.',
      languages: ['TypeScript', 'Python', 'Go', 'C++'],
      model: 'gemini-3.8-flash',
      status: 'ACTIVE',
      icon: <Code2 className="w-5 h-5 text-purple-400" />,
      allowedTools: ['scaffold_microservice', 'debug_snippet', 'run_sandbox_isolated', 'map_system_architecture'],
      maxTokens: 4096,
      rateLimitPerMin: 15,
      temperature: 0.1,
    },
    {
      id: 'image-studio',
      name: 'Passport & Photo Studio',
      description: 'Validates official Rwanda 35x45mm passport dimensions, removes cluttered backgrounds to solid white, and styles CV portraits.',
      languages: ['Kinyarwanda', 'English'],
      model: 'gemini-3.8-flash',
      status: 'ACTIVE',
      icon: <ImageIcon className="w-5 h-5 text-amber-400" />,
      allowedTools: ['crop_passport_specs', 'remove_background', 'enhance_cv_portrait', 'apply_30day_retention'],
      maxTokens: 512,
      rateLimitPerMin: 10,
      temperature: 0.0,
    },
    {
      id: 'study-tutor',
      name: 'Bilingual Study Tutor',
      description: 'Explains STEM, programming, and language concepts in intuitive Kinyarwanda and English with interactive quizzes and flashcards.',
      languages: ['Kinyarwanda', 'English'],
      model: 'gemini-3.8-flash',
      status: 'ACTIVE',
      icon: <GraduationCap className="w-5 h-5 text-cyan-400" />,
      allowedTools: ['explain_concept', 'generate_quiz_question', 'score_quiz_answer', 'build_study_schedule'],
      maxTokens: 1500,
      rateLimitPerMin: 25,
      temperature: 0.5,
    },
    {
      id: 'employment-marketplace',
      name: 'Employment Marketplace',
      description: 'Matches verified local talent with employer vacancies using explainable skill metrics, geographic proximity, and rate compatibility.',
      languages: ['Kinyarwanda', 'English'],
      model: 'gemini-3.8-flash',
      status: 'ACTIVE',
      icon: <Users2 className="w-5 h-5 text-pink-400" />,
      allowedTools: ['match_worker_to_vacancy', 'explain_match_factors', 'register_talent', 'post_vacancy'],
      maxTokens: 1024,
      rateLimitPerMin: 20,
      temperature: 0.3,
    },
  ]);

  const toggleStatus = (id: string) => {
    setAgents((prev) =>
      prev.map((a) =>
        a.id === id ? { ...a, status: a.status === 'ACTIVE' ? 'MAINTENANCE' : 'ACTIVE' } : a
      )
    );
  };

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Bot className="w-5 h-5 text-emerald-400" />
            <span>AI Specialized Agents & Tool Registry</span>
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            Configure agent routing policies, models, tool capabilities, and rate-limiting safeguards.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-300 flex items-center gap-2">
            <Cpu className="w-3.5 h-3.5 text-blue-400" />
            <span>Primary Model: Gemini 3.8-Flash</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {agents.map((agent) => (
          <div
            key={agent.id}
            className="p-5 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-zinc-700 transition-all flex flex-col justify-between space-y-4"
          >
            <div className="space-y-3">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-zinc-950 border border-zinc-800">
                    {agent.icon}
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">{agent.name}</h3>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-zinc-400 font-mono">{agent.model}</span>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => toggleStatus(agent.id)}
                  className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border transition-colors ${
                    agent.status === 'ACTIVE'
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                      : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                  }`}
                >
                  {agent.status}
                </button>
              </div>

              <p className="text-xs text-zinc-400 leading-relaxed">{agent.description}</p>

              <div className="space-y-2 pt-2 border-t border-zinc-800/80">
                <p className="text-[11px] font-semibold text-zinc-300 flex items-center gap-1.5">
                  <Layers className="w-3 h-3 text-emerald-400" />
                  <span>Permitted Tools ({agent.allowedTools.length})</span>
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {agent.allowedTools.map((tool) => (
                    <span
                      key={tool}
                      className="text-[10px] px-2 py-0.5 rounded bg-zinc-950 text-zinc-300 border border-zinc-800 font-mono"
                    >
                      {tool}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-zinc-800/80 grid grid-cols-3 gap-2 text-center">
              <div className="p-1.5 rounded bg-zinc-950 border border-zinc-800/60">
                <span className="text-[9px] text-zinc-500 block">Max Tokens</span>
                <span className="text-xs font-mono font-bold text-zinc-200">{agent.maxTokens}</span>
              </div>
              <div className="p-1.5 rounded bg-zinc-950 border border-zinc-800/60">
                <span className="text-[9px] text-zinc-500 block">Rate Limit</span>
                <span className="text-xs font-mono font-bold text-zinc-200">{agent.rateLimitPerMin}/m</span>
              </div>
              <div className="p-1.5 rounded bg-zinc-950 border border-zinc-800/60">
                <span className="text-[9px] text-zinc-500 block">Temp</span>
                <span className="text-xs font-mono font-bold text-zinc-200">{agent.temperature}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

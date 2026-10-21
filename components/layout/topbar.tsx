'use client';

import React from 'react';
import {
  Menu,
  CheckCircle2,
  Cpu,
  Smartphone,
  FlaskConical,
  ExternalLink,
  Shield,
} from 'lucide-react';
import { RwandaFlagIcon } from '@/components/icons/logos';

interface TopbarProps {
  onToggleMobileMenu: () => void;
  onOpenSimulator: () => void;
  onOpenTestSuite: () => void;
}

export function Topbar({ onToggleMobileMenu, onOpenSimulator, onOpenTestSuite }: TopbarProps) {
  return (
    <header className="sticky top-0 z-30 h-16 bg-zinc-950/80 backdrop-blur-md border-b border-zinc-800/80 px-4 sm:px-6 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleMobileMenu}
          className="p-2 -ml-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-900 lg:hidden"
          aria-label="Toggle Navigation"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2">
          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-zinc-900 border border-zinc-800 text-xs text-zinc-300">
            <RwandaFlagIcon className="w-3.5 h-2.5 rounded-xs" />
            <span className="font-medium">Rwanda Hub (Kigali GMT+2)</span>
          </div>

          <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-400 font-medium">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Webhook Live</span>
          </div>

          <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-zinc-900 border border-zinc-800 text-xs text-zinc-400">
            <Cpu className="w-3.5 h-3.5 text-blue-400" />
            <span>Gemini 3.8-Flash</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2.5">
        <button
          onClick={onOpenTestSuite}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-700/80 text-xs font-medium text-zinc-200 transition-colors"
        >
          <FlaskConical className="w-3.5 h-3.5 text-amber-400" />
          <span className="hidden sm:inline">Run Test Suite</span>
          <span className="sm:hidden">Tests</span>
        </button>

        <button
          onClick={onOpenSimulator}
          className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-sm transition-all cursor-pointer"
        >
          <Smartphone className="w-3.5 h-3.5" />
          <span>WhatsApp Simulator</span>
        </button>
      </div>
    </header>
  );
}

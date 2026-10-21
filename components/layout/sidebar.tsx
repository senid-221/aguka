'use client';

import React from 'react';
import {
  LayoutDashboard,
  Smartphone,
  MessageSquare,
  Bot,
  Briefcase,
  Users2,
  Code2,
  Image as ImageIcon,
  GraduationCap,
  ShieldCheck,
  Settings,
  Flame,
  CheckCircle2,
} from 'lucide-react';
import { WhatsAppLogo, RwandaFlagIcon } from '@/components/icons/logos';

export type ScreenId =
  | 'overview'
  | 'simulator'
  | 'conversations'
  | 'agents'
  | 'jobs'
  | 'employment'
  | 'coding'
  | 'media'
  | 'study'
  | 'users'
  | 'settings';

interface SidebarProps {
  currentScreen: ScreenId;
  onSelectScreen: (screen: ScreenId) => void;
  isOpenMobile: boolean;
  onCloseMobile: () => void;
}

export function Sidebar({ currentScreen, onSelectScreen, isOpenMobile, onCloseMobile }: SidebarProps) {
  const menuItems: Array<{ id: ScreenId; label: string; icon: React.ReactNode; badge?: string; badgeColor?: string }> = [
    { id: 'overview', label: 'Overview', icon: <LayoutDashboard className="w-4 h-4" /> },
    {
      id: 'simulator',
      label: 'Live WhatsApp Simulator',
      icon: <Smartphone className="w-4 h-4 text-emerald-400" />,
      badge: 'Interactive',
      badgeColor: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    },
    { id: 'conversations', label: 'Conversations', icon: <MessageSquare className="w-4 h-4" /> },
    { id: 'agents', label: 'AI Agents Hub', icon: <Bot className="w-4 h-4" /> },
    { id: 'jobs', label: 'Jobs Discovery & MIFOTRA', icon: <Briefcase className="w-4 h-4" /> },
    { id: 'employment', label: 'Employment Marketplace', icon: <Users2 className="w-4 h-4" /> },
    { id: 'coding', label: 'Coding Agent & Arch Map', icon: <Code2 className="w-4 h-4" /> },
    { id: 'media', label: 'Passport & Photo Studio', icon: <ImageIcon className="w-4 h-4" /> },
    { id: 'study', label: 'Study Tutor & Quizzes', icon: <GraduationCap className="w-4 h-4" /> },
    { id: 'users', label: 'Users & DPPA Consent', icon: <ShieldCheck className="w-4 h-4" /> },
    { id: 'settings', label: 'System Settings', icon: <Settings className="w-4 h-4" /> },
  ];

  return (
    <>
      {/* Mobile backdrop */}
      {isOpenMobile && (
        <div
          className="fixed inset-0 z-40 bg-black/80 backdrop-blur-sm lg:hidden"
          onClick={onCloseMobile}
        />
      )}

      <aside
        className={`fixed top-0 bottom-0 left-0 z-50 w-64 bg-zinc-950 border-r border-zinc-800/80 flex flex-col transition-transform duration-200 lg:translate-x-0 ${
          isOpenMobile ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Brand header */}
        <div className="h-16 px-5 border-b border-zinc-800/80 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
              <WhatsAppLogo className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-1.5 font-bold tracking-tight text-white text-base">
                <span>Aguka AI</span>
                <RwandaFlagIcon className="w-4 h-2.5 rounded-xs" />
              </div>
              <p className="text-[10px] text-zinc-400 font-medium">Enterprise WhatsApp Agent</p>
            </div>
          </div>
        </div>

        {/* Navigation list */}
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          <div className="px-2 pb-2 text-[10px] uppercase tracking-wider font-semibold text-zinc-300">
            Platform Modules
          </div>

          {menuItems.map((item) => {
            const isActive = currentScreen === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  onSelectScreen(item.id);
                  onCloseMobile();
                }}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-medium transition-all ${
                  isActive
                    ? 'bg-zinc-800 text-white font-semibold border border-zinc-700/60 shadow-xs'
                    : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900/60'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className={isActive ? 'text-emerald-400' : 'text-zinc-400'}>
                    {item.icon}
                  </span>
                  <span>{item.label}</span>
                </div>
                {item.badge && (
                  <span
                    className={`text-[9px] px-1.5 py-0.5 rounded-md font-semibold border ${
                      item.badgeColor || 'bg-zinc-800 text-zinc-300 border-zinc-700'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Bottom System Status */}
        <div className="p-3 border-t border-zinc-800/80 bg-zinc-950/60">
          <div className="p-2.5 rounded-lg bg-zinc-900/80 border border-zinc-800/60 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <div className="text-[11px]">
                <p className="text-zinc-200 font-medium">Bilingual Gateway</p>
                <p className="text-[10px] text-zinc-300">Kinyarwanda & EN</p>
              </div>
            </div>
            <div className="text-[10px] text-emerald-400 font-semibold px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/20">
              Active
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}

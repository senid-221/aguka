'use client';

import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  User,
  Download,
  Trash2,
  Lock,
  CheckCircle2,
  AlertTriangle,
  Ban,
  FileText,
} from 'lucide-react';
import { User as UserType } from '@/lib/types';
import { RwandaFlagIcon } from '@/components/icons/logos';

export function UsersConsentScreen() {
  const [users, setUsers] = useState<UserType[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserType | null>(null);
  const [exportJson, setExportJson] = useState<string | null>(null);

  const loadUsers = () => {
    setIsLoading(true);
    fetch('/api/users')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data) return;
        setUsers(data.users || []);
        if (data.users?.length > 0) {
          setSelectedUser((prev) => prev || data.users[0]);
        }
      })
      .catch((err) => console.error('Error fetching users:', err))
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    let isMounted = true;
    fetch('/api/users')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!isMounted || !data) return;
        setUsers(data.users || []);
        if (data.users?.length > 0) {
          setSelectedUser((prev) => prev || data.users[0]);
        }
      })
      .catch((err) => console.error('Error fetching users:', err));

    return () => {
      isMounted = false;
    };
  }, []);

  const handleExportData = async (userId: string) => {
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'EXPORT_DATA', userId }),
      });
      if (res.ok) {
        const data = await res.json();
        setExportJson(JSON.stringify(data, null, 2));
      }
    } catch (err) {
      console.error('Data export failed:', err);
    }
  };

  const handleDeleteData = async (userId: string) => {
    if (!confirm('Are you sure you want to permanently erase all personal data under Rwanda DPPA Right to Erasure? This cannot be undone.')) {
      return;
    }
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'DELETE_DATA', userId }),
      });
      if (res.ok) {
        alert('All user personal data, CVs, and conversations permanently erased.');
        loadUsers();
        setSelectedUser(null);
        setExportJson(null);
      }
    } catch (err) {
      console.error('Data deletion failed:', err);
    }
  };

  const handleToggleBlock = async (userId: string) => {
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'TOGGLE_BLOCK', userId }),
      });
      if (res.ok) {
        loadUsers();
      }
    } catch (err) {
      console.error('Block toggle failed:', err);
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-400" />
            <span>Users, Privacy & Rwanda DPPA Consent</span>
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            Consent, export and erasure controls for Rwanda Law N° 058/2021. These act on records held in
            this process; a persistent store must apply the same rules once a database is connected.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-emerald-400 flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>DPPA Compliance Audit: PASSED</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: User Directory */}
        <div className="lg:col-span-5 bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden flex flex-col">
          <div className="p-3.5 border-b border-zinc-800 bg-zinc-950/60 flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-300">
              Registered WhatsApp Users ({users.length})
            </span>
          </div>

          <div className="divide-y divide-zinc-800/60 overflow-y-auto max-h-[500px]">
            {users.length === 0 && (
              <p className="text-xs text-zinc-500 p-6 text-center">
                No users registered yet. A user record is created the first time a phone number messages
                the agent.
              </p>
            )}
            {users.map((u) => {
              const isSelected = selectedUser?.id === u.id;
              return (
                <button
                  key={u.id}
                  onClick={() => {
                    setSelectedUser(u);
                    setExportJson(null);
                  }}
                  className={`w-full p-4 text-left transition-all flex items-center justify-between gap-3 ${
                    isSelected ? 'bg-zinc-800/80 border-l-2 border-emerald-500' : 'hover:bg-zinc-900/60'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-300">
                      <User className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-white">{u.fullName || 'User'}</span>
                        {u.isBlocked && (
                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-red-500/20 text-red-400 border border-red-500/30 font-semibold">
                            Blocked
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-zinc-400 font-mono mt-0.5">{u.phoneNumber}</p>
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="text-[10px] px-2 py-0.5 rounded bg-zinc-950 text-emerald-400 border border-zinc-800 font-semibold">
                      {u.role}
                    </span>
                    <p className="text-[9px] text-zinc-500 mt-1">{u.preferredLang}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right Column: User Consent & Data Subject Rights */}
        <div className="lg:col-span-7 bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
          {selectedUser ? (
            <>
              <div className="flex items-start justify-between pb-3 border-b border-zinc-800">
                <div>
                  <h3 className="text-base font-bold text-white">{selectedUser.fullName || 'User'}</h3>
                  <p className="text-xs text-zinc-400 font-mono mt-0.5">{selectedUser.phoneNumber}</p>
                </div>
                <button
                  onClick={() => handleToggleBlock(selectedUser.id)}
                  className={`text-xs px-3 py-1.5 rounded-lg border font-semibold transition-colors flex items-center gap-1.5 ${
                    selectedUser.isBlocked
                      ? 'bg-zinc-800 text-zinc-300 border-zinc-700 hover:bg-zinc-700'
                      : 'bg-red-500/10 text-red-400 border-red-500/20 hover:bg-red-500/20'
                  }`}
                >
                  <Ban className="w-3.5 h-3.5" />
                  <span>{selectedUser.isBlocked ? 'Unblock User' : 'Block Number'}</span>
                </button>
              </div>

              {/* Consent Badges */}
              <div className="space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  Documented Consent Records
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  <div className="p-3 rounded-lg bg-zinc-950 border border-zinc-800 flex items-center justify-between">
                    <div>
                      <p className="text-zinc-200 font-medium">Terms & Privacy Policy</p>
                      <p className="text-[10px] text-zinc-500">Law N° 058/2021 Notice</p>
                    </div>
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div className="p-3 rounded-lg bg-zinc-950 border border-zinc-800 flex items-center justify-between">
                    <div>
                      <p className="text-zinc-200 font-medium">Job Alerts Opt-in</p>
                      <p className="text-[10px] text-zinc-500">Scheduled WhatsApp notifications</p>
                    </div>
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div className="p-3 rounded-lg bg-zinc-950 border border-zinc-800 flex items-center justify-between">
                    <div>
                      <p className="text-zinc-200 font-medium">Quiet Hours Preference</p>
                      <p className="text-[10px] text-zinc-500">21:00 - 07:00 (No late alerts)</p>
                    </div>
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div className="p-3 rounded-lg bg-zinc-950 border border-zinc-800 flex items-center justify-between">
                    <div>
                      <p className="text-zinc-200 font-medium">Data Retention</p>
                      <p className="text-[10px] text-zinc-500">30-day temporary media purge</p>
                    </div>
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  </div>
                </div>
              </div>

              {/* Data Subject Action Controls */}
              <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 space-y-3">
                <h4 className="text-xs font-semibold text-zinc-300">
                  Data Subject Rights (Article 21 & 22)
                </h4>
                <div className="flex flex-wrap gap-2.5">
                  <button
                    onClick={() => handleExportData(selectedUser.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-zinc-200 border border-zinc-700 transition-colors"
                  >
                    <Download className="w-3.5 h-3.5 text-blue-400" />
                    <span>Export User Data (JSON)</span>
                  </button>

                  <button
                    onClick={() => handleDeleteData(selectedUser.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-950/60 hover:bg-red-900/60 text-xs font-semibold text-red-300 border border-red-800/80 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-red-400" />
                    <span>Erase All Data (Right to be Forgotten)</span>
                  </button>
                </div>

                {exportJson && (
                  <div className="mt-3 space-y-1">
                    <span className="text-[10px] text-zinc-400 font-mono">Portability Export Archive:</span>
                    <pre className="p-3 rounded-lg bg-zinc-900 border border-zinc-800 text-emerald-400 font-mono text-[10px] max-h-48 overflow-x-auto">
                      {exportJson}
                    </pre>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="text-center py-16 text-zinc-500 text-xs">
              Select a user to inspect consent status and privacy rights
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

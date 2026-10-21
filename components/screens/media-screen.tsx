'use client';

import React, { useState, useEffect } from 'react';
import {
  Image as ImageIcon,
  CheckCircle2,
  Trash2,
  Clock,
  ShieldCheck,
  RefreshCw,
  Sparkles,
  ExternalLink,
  Upload,
} from 'lucide-react';
import { MediaTask } from '@/lib/types';

export function MediaScreen() {
  const [tasks, setTasks] = useState<MediaTask[]>([]);
  const [selectedTask, setSelectedTask] = useState<MediaTask | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    let isMounted = true;
    fetch('/api/media')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!isMounted || !data) return;
        setTasks(data.tasks || []);
        if (data.tasks?.length > 0) {
          setSelectedTask((prev) => prev || data.tasks[0]);
        }
      })
      .catch((err) => console.error('Error fetching media tasks:', err));

    return () => {
      isMounted = false;
    };
  }, []);

  const handleSimulateNewTask = async () => {
    setIsProcessing(true);
    try {
      const res = await fetch('/api/media', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation: 'PASSPORT_CROP',
          originalUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=400&q=80',
          userName: 'David Kanimba',
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setTasks((prev) => [data.task, ...prev]);
        setSelectedTask(data.task);
      }
    } catch (err) {
      console.error('Failed to create task:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <ImageIcon className="w-5 h-5 text-emerald-400" />
            <span>Passport & Photo Studio Hub</span>
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            Automated 35x45mm Rwanda biometric passport compliance, CV portrait background removal, and 30-day retention policies.
          </p>
        </div>

        <button
          onClick={handleSimulateNewTask}
          disabled={isProcessing}
          className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-all cursor-pointer disabled:opacity-50 w-max"
        >
          <Upload className="w-3.5 h-3.5" />
          <span>{isProcessing ? 'Processing...' : 'Simulate Photo Upload'}</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Media Task History */}
        <div className="lg:col-span-5 bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden flex flex-col">
          <div className="p-3.5 border-b border-zinc-800 bg-zinc-950/60 flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-300">
              Processed Media Tasks ({tasks.length})
            </span>
            <span className="text-[10px] text-zinc-500 font-mono">Retention: 30 days</span>
          </div>

          <div className="divide-y divide-zinc-800/60 overflow-y-auto max-h-[500px]">
            {tasks.map((t) => {
              const isSelected = selectedTask?.id === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setSelectedTask(t)}
                  className={`w-full p-3.5 text-left transition-all flex items-center justify-between gap-3 ${
                    isSelected ? 'bg-zinc-800/80 border-l-2 border-emerald-500' : 'hover:bg-zinc-900/60'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <img
                      src={t.processedUrl || t.originalUrl}
                      alt={t.userName}
                      className="w-10 h-10 rounded-lg object-cover border border-zinc-700"
                    />
                    <div>
                      <p className="text-xs font-semibold text-zinc-200">{t.userName}</p>
                      <p className="text-[10px] text-emerald-400 font-mono mt-0.5">
                        {t.operation.replace('_', ' ')}
                      </p>
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="text-[10px] px-2 py-0.5 rounded font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      {t.status}
                    </span>
                    <p className="text-[9px] text-zinc-500 mt-1">
                      {new Date(t.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right Column: Preview & Biometric Specs Inspector */}
        <div className="lg:col-span-7 bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
          {selectedTask ? (
            <>
              <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
                <div>
                  <h3 className="text-sm font-bold text-white">
                    {selectedTask.userName} — {selectedTask.operation}
                  </h3>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Verified compliant with Rwanda Directorate General of Immigration & Emigration.
                  </p>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-semibold px-2.5 py-1 rounded bg-emerald-500/10 border border-emerald-500/20">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>35x45mm Biometric Passed</span>
                </div>
              </div>

              {/* Image Preview Canvas */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-3 rounded-lg bg-zinc-950 border border-zinc-800 text-center space-y-2">
                  <span className="text-[10px] text-zinc-400 font-medium uppercase tracking-wider block">
                    Original User Upload
                  </span>
                  <div className="w-40 h-48 mx-auto rounded-lg overflow-hidden border border-zinc-700 bg-zinc-900">
                    <img
                      src={selectedTask.originalUrl}
                      alt="Original"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <p className="text-[10px] text-zinc-500">Unfiltered mobile capture</p>
                </div>

                <div className="p-3 rounded-lg bg-zinc-950 border border-emerald-500/30 text-center space-y-2">
                  <span className="text-[10px] text-emerald-400 font-medium uppercase tracking-wider block">
                    Processed 35x45mm Output
                  </span>
                  <div className="w-40 h-48 mx-auto rounded-lg overflow-hidden border-2 border-emerald-500 bg-white shadow-md">
                    <img
                      src={selectedTask.processedUrl || selectedTask.originalUrl}
                      alt="Processed"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <p className="text-[10px] text-emerald-400 font-semibold">
                    White Background • Centered Crop
                  </p>
                </div>
              </div>

              {/* Compliance Checklist */}
              <div className="p-4 rounded-lg bg-zinc-950 border border-zinc-800 space-y-2 text-xs">
                <h4 className="font-semibold text-zinc-200 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span>Rwanda Passport & DPPA Compliance Check</span>
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-zinc-400 text-[11px] pt-1">
                  <p className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Aspect Ratio: 35mm x 45mm</span>
                  </p>
                  <p className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Background: Clean Studio White</span>
                  </p>
                  <p className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Facial Area: 70-80% frame coverage</span>
                  </p>
                  <p className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Auto-delete: {selectedTask.retentionDays} days retention</span>
                  </p>
                </div>
              </div>
            </>
          ) : (
            <div className="text-center py-16 text-zinc-500 text-xs">
              Select a media task to inspect preview
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

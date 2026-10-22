'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Image as ImageIcon,
  CheckCircle2,
  Clock,
  AlertCircle,
  RefreshCw,
  Upload,
} from 'lucide-react';
import { MediaTask } from '@/lib/types';
import { AdminGate } from '@/components/layout/admin-gate';
import { adminBlobUrl, adminFetch, useAdminSession } from '@/lib/client/admin-session';

/** Studio inputs are described, never hosted: only real URLs render as images. */
function isDisplayableUrl(value: string): boolean {
  return /^https?:\/\//i.test(value) || value.startsWith('blob:');
}

function storedKeyOf(task: MediaTask | null): string | null {
  const stored = task?.processedUrl || '';
  return stored.startsWith('stored:') ? stored.slice('stored:'.length) : null;
}

const OPERATIONS: Array<{ value: MediaTask['operation']; label: string }> = [
  { value: 'PASSPORT_CROP', label: 'Passport crop 35x45mm' },
  { value: 'REMOVE_BG', label: 'Remove background' },
  { value: 'ENHANCE_CV_PHOTO', label: 'Enhance CV photo' },
  { value: 'RESIZE', label: 'Resize' },
];

function statusStyle(status: MediaTask['status']): string {
  if (status === 'COMPLETED') return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
  if (status === 'FAILED') return 'bg-red-500/10 text-red-400 border-red-500/20';
  return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
}

export function MediaScreen() {
  const session = useAdminSession();
  const [tasks, setTasks] = useState<MediaTask[]>([]);
  const [selectedTask, setSelectedTask] = useState<MediaTask | null>(null);
  const [userId, setUserId] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [operation, setOperation] = useState<MediaTask['operation']>('PASSPORT_CROP');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [preview, setPreview] = useState<Record<string, string>>({});
  const [previewError, setPreviewError] = useState<{ taskId: string; message: string } | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const objectUrls = useRef<string[]>([]);

  // Portraits are only ever fetched with the administrator bearer token, on
  // request, so they never become public URLs and never leave the data directory.
  useEffect(() => () => objectUrls.current.forEach((url) => URL.revokeObjectURL(url)), []);

  const showStoredPhoto = useCallback(
    async (taskId: string) => {
      if (preview[taskId]) return;
      setIsPreviewLoading(true);
      setPreviewError(null);
      const res = await adminBlobUrl(`/api/admin/media/image?taskId=${encodeURIComponent(taskId)}`);
      setIsPreviewLoading(false);
      if (res.url) {
        objectUrls.current.push(res.url);
        setPreview((prev) => ({ ...prev, [taskId]: res.url as string }));
      } else {
        setPreviewError({ taskId, message: res.error ?? 'The stored file could not be loaded.' });
      }
    },
    [preview]
  );

  const loadTasks = () => {
    adminFetch<{ tasks?: MediaTask[] }>('/api/media')
      .then((res) => {
        if (!res.ok || !res.data) return;
        const list: MediaTask[] = res.data.tasks || [];
        setTasks(list);
        setSelectedTask((prev) => prev || list[0] || null);
      })
      .catch((err) => console.error('Error fetching media tasks:', err));
  };

  useEffect(() => {
    if (session.authed) loadTasks();
  }, [session.authed]);

  const handleCreateTask = async () => {
    if (!userId.trim() || !imageUrl.trim()) {
      setFormError('Both a user ID and an image URL are required.');
      return;
    }
    setFormError('');
    setIsSubmitting(true);
    try {
      const res = await adminFetch<{ task?: MediaTask; error?: string }>('/api/media', {
        method: 'POST',
        body: JSON.stringify({
          userId: userId.trim(),
          originalUrl: imageUrl.trim(),
          operation,
        }),
      });
      if (res.ok && res.data?.task) {
        setTasks((prev) => [res.data!.task!, ...prev]);
        setSelectedTask(res.data.task);
      } else {
        setFormError(res.error || 'Could not record the request.');
      }
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Request failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <ImageIcon className="w-5 h-5 text-emerald-400" />
            <span>Photo Studio Queue</span>
          </h1>
          <p className="text-xs text-zinc-400 mt-1 max-w-2xl">
            Photo requests rendered by this server appear here. When an image provider is configured,
            the studio produces the file, crops it to 35x45mm in code and keeps it in the private data
            directory until the retention sweep deletes it. With no provider key, the person on WhatsApp
            is told the studio is unavailable and no task is created.
          </p>
        </div>

        <button
          onClick={loadTasks}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs text-zinc-200 border border-zinc-700 transition-colors w-max"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Reload</span>
        </button>
      </div>

      <AdminGate session={session} scope="Photo tasks carry a person's portrait, so the queue is read and written only from an administrator session." />

      {/* Record a request */}
      <div className="p-4 rounded-xl bg-zinc-900 border border-zinc-800 space-y-3">
        <p className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
          <Upload className="w-3.5 h-3.5 text-emerald-400" />
          <span>Record a photo request</span>
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
          <input
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            placeholder="User ID (e.g. usr-...)"
            className="bg-zinc-950 text-zinc-100 placeholder-zinc-500 text-xs rounded-lg px-3 py-2 border border-zinc-800 outline-hidden focus:border-emerald-500/50"
          />
          <input
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            placeholder="Image URL from WhatsApp media"
            className="bg-zinc-950 text-zinc-100 placeholder-zinc-500 text-xs rounded-lg px-3 py-2 border border-zinc-800 outline-hidden focus:border-emerald-500/50 sm:col-span-2"
          />
          <select
            value={operation}
            onChange={(e) => setOperation(e.target.value as MediaTask['operation'])}
            className="bg-zinc-950 text-zinc-100 text-xs rounded-lg px-3 py-2 border border-zinc-800 outline-hidden"
          >
            {OPERATIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center justify-between gap-3">
          {formError ? (
            <p className="text-[11px] text-red-400 flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5" />
              <span>{formError}</span>
            </p>
          ) : (
            <p className="text-[11px] text-zinc-500">
              Creates a queue record only — nothing is downloaded, edited or stored beyond the URL.
            </p>
          )}
          <button
            onClick={handleCreateTask}
            disabled={isSubmitting}
            className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-all cursor-pointer disabled:opacity-50 w-max"
          >
            <span>{isSubmitting ? 'Saving…' : 'Add to queue'}</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Media Task History */}
        <div className="lg:col-span-5 bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden flex flex-col">
          <div className="p-3.5 border-b border-zinc-800 bg-zinc-950/60 flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-300">
              Requested Media Tasks ({tasks.length})
            </span>
            <span className="text-[10px] text-zinc-500 font-mono">Retention policy: {tasks[0]?.retentionDays ?? 30} days</span>
          </div>

          <div className="divide-y divide-zinc-800/60 overflow-y-auto max-h-[500px]">
            {tasks.length === 0 && (
              <p className="text-xs text-zinc-500 p-5 text-center">
                No photo requests recorded yet.
              </p>
            )}
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
                    {isDisplayableUrl(t.originalUrl) ? (
                      <img
                        src={t.originalUrl}
                        alt={t.userName}
                        className="w-10 h-10 rounded-lg object-cover border border-zinc-700"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-lg border border-zinc-700 bg-zinc-950 flex items-center justify-center">
                        <ImageIcon className="w-4 h-4 text-zinc-600" />
                      </div>
                    )}
                    <div>
                      <p className="text-xs font-semibold text-zinc-200">{t.userName}</p>
                      <p className="text-[10px] text-emerald-400 font-mono mt-0.5">
                        {t.operation.replace('_', ' ')}
                      </p>
                    </div>
                  </div>

                  <div className="text-right">
                    <span className={`text-[10px] px-2 py-0.5 rounded font-semibold border ${statusStyle(t.status)}`}>
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

        {/* Right Column: Request Detail */}
        <div className="lg:col-span-7 bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
          {selectedTask ? (
            <>
              <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
                <div>
                  <h3 className="text-sm font-bold text-white">
                    {selectedTask.userName} — {selectedTask.operation.replace('_', ' ')}
                  </h3>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Requested by {selectedTask.userId} • task {selectedTask.id}
                  </p>
                </div>
                <span className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded border ${statusStyle(selectedTask.status)}`}>
                  {selectedTask.status === 'COMPLETED' ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5" />}
                  <span>{selectedTask.status}</span>
                </span>
              </div>

              <div className="p-3 rounded-lg bg-zinc-950 border border-zinc-800 text-center space-y-2">
                <span className="text-[10px] text-zinc-400 font-medium uppercase tracking-wider block">
                  Source
                </span>
                <div className="w-40 h-48 mx-auto rounded-lg overflow-hidden border border-zinc-700 bg-zinc-900 flex items-center justify-center">
                  {isDisplayableUrl(selectedTask.originalUrl) ? (
                    <img
                      src={selectedTask.originalUrl}
                      alt="Original"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <ImageIcon className="w-6 h-6 text-zinc-600" />
                  )}
                </div>
                <p className="text-[10px] text-zinc-500 break-all px-2">{selectedTask.originalUrl}</p>
              </div>

              {storedKeyOf(selectedTask) ? (
                <div className="p-3 rounded-lg bg-zinc-950 border border-emerald-500/30 text-center space-y-2">
                  <span className="text-[10px] text-emerald-400 font-medium uppercase tracking-wider block">
                    Edited output
                  </span>
                  <div className="w-40 h-48 mx-auto rounded-lg overflow-hidden border-2 border-emerald-500 bg-white shadow-md flex items-center justify-center">
                    {preview[selectedTask.id] ? (
                      <img
                        src={preview[selectedTask.id]}
                        alt="Processed"
                        className="w-full h-full object-cover"
                      />
                    ) : previewError?.taskId === selectedTask.id ? (
                      <span className="text-[10px] text-amber-400 px-3">{previewError.message}</span>
                    ) : (
                      <button
                        onClick={() => void showStoredPhoto(selectedTask.id)}
                        disabled={isPreviewLoading}
                        className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 disabled:opacity-60 border border-zinc-700 text-[11px] font-semibold text-zinc-200 transition-colors"
                      >
                        {isPreviewLoading ? 'Loading…' : 'View photo'}
                      </button>
                    )}
                  </div>
                  <p className="text-[10px] text-zinc-500 px-2">
                    Stored privately under an opaque key and shown only to a signed-in administrator.
                    Kept for {selectedTask.retentionDays} days.
                  </p>
                </div>
              ) : (selectedTask.processedUrl || '').startsWith('purged:') ? (
                <div className="p-4 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-zinc-400 flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-400" />
                  <span>
                    The file was deleted at the end of its {selectedTask.retentionDays}-day retention
                    window. Only this task record remains.
                  </span>
                </div>
              ) : (
                <div className="p-4 rounded-lg bg-zinc-950 border border-amber-500/20 text-xs text-amber-400 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>
                    No edited output exists for this task. Requests made through WhatsApp produce a
                    file only when an image provider key is configured on this server.
                  </span>
                </div>
              )}

              <p className="text-[11px] text-zinc-500">
                Retention: the retention sweep deletes stored files after {selectedTask.retentionDays}{' '}
                days. Records were created from real traffic on this server.
              </p>
            </>
          ) : (
            <div className="text-center py-16 text-zinc-500 text-xs">
              No request selected. Photo tasks appear here after a WhatsApp user sends an image.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

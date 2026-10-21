'use client';

import { useCallback, useState, useSyncExternalStore } from 'react';

const TOKEN_KEY = 'aguka_admin_token';

export function readAdminToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

// sessionStorage holds the admin token, so React reads it through an external
// store: no hydration mismatch, and a 401 or another tab signing out updates every
// mounted screen at once.
type TokenListener = () => void;

const tokenListeners = new Set<TokenListener>();
let cachedToken: string | null | undefined;

function currentToken(): string | null {
  if (cachedToken === undefined) cachedToken = readAdminToken();
  return cachedToken;
}

function publishToken(next: string | null): void {
  cachedToken = next;
  for (const listener of tokenListeners) listener();
}

function onStorageEvent(event: StorageEvent): void {
  if (event.key === TOKEN_KEY) publishToken(event.newValue);
}

function subscribeToToken(listener: TokenListener): () => void {
  tokenListeners.add(listener);
  // Re-read on next snapshot: a token written earlier in this same tab is not a storage event.
  cachedToken = undefined;
  if (typeof window !== 'undefined' && tokenListeners.size === 1) {
    window.addEventListener('storage', onStorageEvent);
  }
  return () => {
    tokenListeners.delete(listener);
    if (typeof window !== 'undefined' && tokenListeners.size === 0) {
      window.removeEventListener('storage', onStorageEvent);
    }
  };
}

function writeAdminToken(token: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (token) window.sessionStorage.setItem(TOKEN_KEY, token);
    else window.sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    // Private browsing can block storage; the session simply stays in memory.
  }
  publishToken(token);
}

export interface AdminResponse<T> {
  ok: boolean;
  status: number;
  data: T | null;
  error: string | null;
  unauthorized: boolean;
}

/** Fetch with the admin bearer token attached. Never logs or stores secrets. */
export async function adminFetch<T>(path: string, init: RequestInit = {}): Promise<AdminResponse<T>> {
  const token = readAdminToken();
  const headers = new Headers(init.headers || {});
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');

  try {
    const res = await fetch(path, { ...init, headers });
    const isJson = (res.headers.get('content-type') || '').includes('application/json');
    const parsed: unknown = isJson ? await res.json().catch(() => null) : null;
    const payload = (parsed as Record<string, unknown> | null) ?? null;
    if (res.status === 401) writeAdminToken(null);
    const message = typeof payload?.error === 'string' ? payload.error : null;
    return {
      ok: res.ok,
      status: res.status,
      data: (payload ?? null) as T | null,
      error: message ?? (res.ok ? null : `Request failed with ${res.status}`),
      unauthorized: res.status === 401,
    };
  } catch (err: unknown) {
    return {
      ok: false,
      status: 0,
      data: null,
      error: err instanceof Error ? err.message : 'Network request failed',
      unauthorized: false,
    };
  }
}

/** Fetches a protected binary and returns an object URL for it. */
export async function adminBlobUrl(path: string): Promise<{ url: string | null; error: string | null }> {
  const token = readAdminToken();
  try {
    const res = await fetch(path, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (!res.ok) {
      const payload = (await res.json().catch(() => null)) as Record<string, unknown> | null;
      return {
        url: null,
        error: typeof payload?.error === 'string' ? payload.error : `Request failed with ${res.status}`,
      };
    }
    const blob = await res.blob();
    return { url: URL.createObjectURL(blob), error: null };
  } catch (err: unknown) {
    return { url: null, error: err instanceof Error ? err.message : 'Network request failed' };
  }
}

export interface AdminSession {
  token: string | null;
  authed: boolean;
  signingIn: boolean;
  error: string | null;
  signIn: (email: string, password: string) => Promise<boolean>;
  signOut: () => void;
}

export function useAdminSession(): AdminSession {
  const token = useSyncExternalStore(subscribeToToken, currentToken, () => null);
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signIn = useCallback(async (email: string, password: string): Promise<boolean> => {
    setSigningIn(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const payload = (await res.json().catch(() => null)) as { token?: string; error?: string } | null;
      if (!res.ok || !payload?.token) {
        setError(payload?.error || 'Sign-in failed. Check the admin credentials in the server environment.');
        return false;
      }
      writeAdminToken(payload.token);
      return true;
    } finally {
      setSigningIn(false);
    }
  }, []);

  const signOut = useCallback(() => {
    writeAdminToken(null);
  }, []);

  return { token, authed: Boolean(token), signingIn, error, signIn, signOut };
}

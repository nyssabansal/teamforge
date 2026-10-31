'use client';
import { useCallback, useEffect, useState } from 'react';

/** fetch wrapper: JSON in/out, throws Error(message from API) on non-2xx */
export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

/** load JSON on mount / when `path` changes; returns { data, error, loading, reload } */
export function useApi(path) {
  const [state, setState] = useState({ data: null, error: null, loading: !!path });
  const load = useCallback(async () => {
    if (!path) return;
    setState((s) => ({ ...s, loading: true }));
    try {
      setState({ data: await api(path), error: null, loading: false });
    } catch (e) {
      setState({ data: null, error: e.message, loading: false });
    }
  }, [path]);
  useEffect(() => { load(); }, [load]);
  return { ...state, reload: load };
}

/** run an action, tracking busy/error/success message */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(null);
  const run = useCallback(async (fn, successMsg) => {
    setBusy(true); setError(null); setDone(null);
    try {
      const r = await fn();
      if (successMsg) setDone(successMsg);
      return r;
    } catch (e) {
      setError(e.message);
      return undefined;
    } finally {
      setBusy(false);
    }
  }, []);
  return { busy, error, done, run, setError, setDone };
}

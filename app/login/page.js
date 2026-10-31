'use client';
import { useState, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { api, useAction } from '../_components/api';
import { Notice } from '../_components/ui';

function LoginForm() {
  const next = useSearchParams().get('next') || '/dashboard';
  const [form, setForm] = useState({ email: '', password: '' });
  const { busy, error, run } = useAction();

  async function submit(e) {
    e.preventDefault();
    const r = await run(() => api('/api/auth/login', { method: 'POST', body: form }));
    if (r) window.location.href = next.startsWith('/') ? next : '/dashboard';
  }

  return (
    <form onSubmit={submit} className="panel stack" style={{ maxWidth: 420, margin: '0 auto' }}>
      <h1 style={{ fontSize: '2rem' }}>Log in</h1>
      <Notice>{error}</Notice>
      <div>
        <label htmlFor="email">Email</label>
        <input id="email" type="email" autoComplete="email" required value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })} />
      </div>
      <div>
        <label htmlFor="pw">Password</label>
        <input id="pw" type="password" autoComplete="current-password" required value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })} />
      </div>
      <button className="btn" disabled={busy}>{busy ? 'Logging in…' : 'Log in'}</button>
      <p className="small muted">New here? <Link href="/register">Create an account</Link></p>
      <p className="small muted">Demo accounts use the password <code>password123</code> — e.g. diya@teamforge.dev (participant), ananya@teamforge.dev (organizer), meera@teamforge.dev (judge).</p>
    </form>
  );
}

export default function LoginPage() {
  return <Suspense><LoginForm /></Suspense>;
}

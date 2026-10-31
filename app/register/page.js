'use client';
import { useState } from 'react';
import Link from 'next/link';
import { api, useAction } from '../_components/api';
import { Notice } from '../_components/ui';

export default function RegisterPage() {
  const [f, setF] = useState({ name: '', email: '', password: '', role: 'participant', invite_code: '' });
  const { busy, error, run } = useAction();
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    const r = await run(() => api('/api/auth/register', { method: 'POST', body: f }));
    if (r) window.location.href = f.role === 'participant' ? '/profile' : '/dashboard';
  }

  return (
    <form onSubmit={submit} className="panel stack" style={{ maxWidth: 460, margin: '0 auto' }}>
      <h1 style={{ fontSize: '2rem' }}>Create an account</h1>
      <Notice>{error}</Notice>
      <div>
        <label htmlFor="name">Full name</label>
        <input id="name" required minLength={2} autoComplete="name" value={f.name} onChange={set('name')} />
      </div>
      <div>
        <label htmlFor="email">Email</label>
        <input id="email" type="email" required autoComplete="email" value={f.email} onChange={set('email')} />
      </div>
      <div>
        <label htmlFor="pw">Password <span className="hint">at least 8 characters</span></label>
        <input id="pw" type="password" required minLength={8} autoComplete="new-password" value={f.password} onChange={set('password')} />
      </div>
      <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
        <legend style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: 6 }}>I am joining as</legend>
        <div className="row">
          {[['participant', 'Participant'], ['organizer', 'Organizer'], ['judge', 'Judge']].map(([v, l]) => (
            <label key={v} className="row" style={{ fontWeight: 400, gap: 6, margin: 0 }}>
              <input type="radio" name="role" value={v} checked={f.role === v} onChange={set('role')} style={{ width: 'auto' }} /> {l}
            </label>
          ))}
        </div>
      </fieldset>
      {f.role !== 'participant' && (
        <div>
          <label htmlFor="code">Invite code <span className="hint">from the event team</span></label>
          <input id="code" required value={f.invite_code} onChange={set('invite_code')} />
        </div>
      )}
      <button className="btn" disabled={busy}>{busy ? 'Creating…' : 'Create account'}</button>
      <p className="small muted">Already have one? <Link href="/login">Log in</Link></p>
    </form>
  );
}

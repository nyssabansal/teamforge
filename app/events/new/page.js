'use client';
import { useState } from 'react';
import { api, useAction } from '../../_components/api';
import { Notice } from '../../_components/ui';

export default function NewEventPage() {
  const [f, setF] = useState({
    title: '', theme: '', venue: '', description: '',
    start_date: '', end_date: '', reg_deadline: '',
    min_team_size: 2, max_team_size: 4, status: 'draft',
  });
  const { busy, error, run } = useAction();
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    const r = await run(() => api('/api/events', { method: 'POST', body: f }));
    if (r) window.location.href = `/events/${r.event.event_id}`;
  }

  return (
    <form onSubmit={submit} className="panel stack" style={{ maxWidth: 720 }}>
      <h1 style={{ fontSize: '2rem' }}>Create an event</h1>
      <Notice>{error}</Notice>
      <div className="fields">
        <div><label htmlFor="t">Title</label><input id="t" required value={f.title} onChange={set('title')} /></div>
        <div className="fields two">
          <div><label htmlFor="th">Theme</label><input id="th" value={f.theme} onChange={set('theme')} /></div>
          <div><label htmlFor="v">Venue</label><input id="v" value={f.venue} onChange={set('venue')} /></div>
        </div>
        <div>
          <label htmlFor="d">Description <span className="hint">searchable by participants</span></label>
          <textarea id="d" value={f.description} onChange={set('description')} />
        </div>
        <div className="fields two">
          <div><label htmlFor="s">Starts</label><input id="s" type="date" required value={f.start_date} onChange={set('start_date')} /></div>
          <div><label htmlFor="e">Ends</label><input id="e" type="date" required value={f.end_date} onChange={set('end_date')} /></div>
        </div>
        <div className="fields two">
          <div><label htmlFor="rd">Registration closes</label><input id="rd" type="date" required value={f.reg_deadline} onChange={set('reg_deadline')} /></div>
          <div>
            <label htmlFor="st">Publish as</label>
            <select id="st" value={f.status} onChange={set('status')}>
              <option value="draft">Draft (only you can see it)</option>
              <option value="open">Open for registration</option>
            </select>
          </div>
        </div>
        <div className="fields two">
          <div><label htmlFor="mn">Smallest team</label><input id="mn" type="number" min={1} max={10} value={f.min_team_size} onChange={set('min_team_size')} /></div>
          <div><label htmlFor="mx">Largest team</label><input id="mx" type="number" min={1} max={10} value={f.max_team_size} onChange={set('max_team_size')} /></div>
        </div>
      </div>
      <button className="btn" disabled={busy}>{busy ? 'Creating…' : 'Create event'}</button>
    </form>
  );
}

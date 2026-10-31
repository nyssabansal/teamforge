'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useApi } from '../_components/api';
import { Status, Notice, fmtDate } from '../_components/ui';

export default function EventsPage() {
  const [q, setQ] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [status, setStatus] = useState('');
  const params = new URLSearchParams();
  if (submitted) params.set('q', submitted);
  if (status) params.set('status', status);
  const { data, error, loading } = useApi(`/api/events?${params}`);
  const me = useApi('/api/auth/me');

  return (
    <div>
      <div className="spread">
        <h1>Events</h1>
        {me.data?.user?.role === 'organizer' && <Link href="/events/new" className="btn">Create an event</Link>}
      </div>

      <form className="row" style={{ marginTop: 24 }} onSubmit={(e) => { e.preventDefault(); setSubmitted(q.trim()); }}>
        <label htmlFor="q" className="sr-only" style={{ position: 'absolute', left: -9999 }}>Search events</label>
        <input id="q" placeholder="Search by topic, e.g. flood warning or accessibility" value={q}
          onChange={(e) => setQ(e.target.value)} style={{ flex: '1 1 320px' }} />
        <select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)} style={{ width: 'auto' }}>
          <option value="">Any status</option>
          <option value="open">Open</option>
          <option value="ongoing">Ongoing</option>
          <option value="judging">Judging</option>
          <option value="completed">Completed</option>
        </select>
        <button className="btn">Search</button>
        {submitted && <button type="button" className="btn ghost" onClick={() => { setQ(''); setSubmitted(''); }}>Clear</button>}
      </form>

      <div className="stack" style={{ '--space': '0px', marginTop: 24 }}>
        <Notice>{error}</Notice>
        {!loading && data?.events?.length === 0 && (
          <p className="empty">{submitted ? `No events match “${submitted}”.` : 'No events yet.'}</p>
        )}
        {data?.events?.map((e) => (
          <Link key={e.event_id} href={`/events/${e.event_id}`} className="board-row" style={{ gridTemplateColumns: '1fr auto' }}>
            <div className="stack" style={{ '--space': '6px' }}>
              <div className="row"><h2 style={{ fontSize: '1.3rem' }}>{e.title}</h2><Status status={e.status} /></div>
              <p className="muted small">
                {fmtDate(e.start_date)}{e.end_date !== e.start_date && ` – ${fmtDate(e.end_date)}`} · {e.venue} · teams of {e.min_team_size}–{e.max_team_size}
              </p>
              {e.snippet && <p className="small" dangerouslySetInnerHTML={{ __html: sanitize(e.snippet) }} />}
            </div>
            <div className="small" style={{ textAlign: 'right' }}>
              <div><b>{e.registrations}</b> registered</div>
              <div><b>{e.teams}</b> teams</div>
              {e.is_registered && <div style={{ color: 'var(--met)', fontWeight: 700 }}>You&apos;re in</div>}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

// ts_headline only adds <b>…</b>; escape everything else
function sanitize(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/&lt;b&gt;/g, '<b>').replace(/&lt;\/b&gt;/g, '</b>');
}

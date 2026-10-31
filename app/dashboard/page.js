'use client';
import { useState } from 'react';
import Link from 'next/link';
import { api, useApi, useAction } from '../_components/api';
import { Seats, Status, Notice, fmtDate } from '../_components/ui';

export default function Dashboard() {
  const { data, error, reload } = useApi('/api/me');
  if (error) return <Notice>{error}</Notice>;
  if (!data) return <p className="muted">Loading…</p>;
  const first = data.user.name.split(' ')[0];
  return (
    <div className="stack" style={{ '--space': '8px' }}>
      <h1>Hi, {first}</h1>
      {data.user.role === 'participant' && <ParticipantView d={data} reload={reload} />}
      {data.user.role === 'organizer' && <OrganizerView d={data} />}
      {data.user.role === 'judge' && <JudgeView d={data} reload={reload} />}
    </div>
  );
}

function ParticipantView({ d, reload }) {
  const act = useAction();
  return (
    <>
      <p className="muted">Your events, your teams, and where your requests stand.</p>
      <div className="section-head"><h2>Your events</h2><Link href="/events" className="small">Find more events</Link></div>
      {d.registrations.length === 0 && <p className="empty">You haven&apos;t registered for anything yet. <Link href="/events">Browse events</Link></p>}
      <div className="grid">
        {d.registrations.map((r) => (
          <div key={r.event_id} className="team-card">
            <div className="spread"><Link href={`/events/${r.event_id}`}><h3>{r.title}</h3></Link><Status status={r.status} /></div>
            <p className="small muted">{fmtDate(r.start_date)}</p>
            {r.team_id ? (
              <>
                <Seats members={Array(r.member_count).fill('•')} capacity={r.capacity} size="sm" />
                <p className="small">
                  {r.is_leader ? 'You lead ' : 'You\'re in '}<Link href={`/teams/${r.team_id}`}><b>{r.team_name}</b></Link>
                  {r.is_leader && r.incoming > 0 && <> · <b style={{ color: 'var(--seat)' }}>{r.incoming} request{r.incoming > 1 ? 's' : ''} waiting</b></>}
                </p>
              </>
            ) : (
              <p className="small">No team yet. <Link href={`/events/${r.event_id}`}>See teams that need you</Link></p>
            )}
          </div>
        ))}
      </div>

      <div className="section-head"><h2>Your requests</h2></div>
      <Notice>{act.error}</Notice>
      {d.requests.length === 0 ? <p className="empty">You haven&apos;t asked to join any team.</p> : (
        <table>
          <thead><tr><th>Team</th><th>Event</th><th>Status</th><th /></tr></thead>
          <tbody>{d.requests.map((r) => (
            <tr key={r.request_id}>
              <td><Link href={`/teams/${r.team_id}`}>{r.team_name}</Link></td>
              <td>{r.event_title}</td>
              <td><span className={`chip ${r.status === 'accepted' ? 'met' : r.status === 'rejected' ? 'gap' : ''}`}>{r.status}</span></td>
              <td className="num">{r.status === 'pending' && (
                <button className="btn ghost sm" disabled={act.busy}
                  onClick={() => act.run(async () => { await api(`/api/requests/${r.request_id}`, { method: 'POST', body: { action: 'withdraw' } }); reload(); })}>
                  Withdraw
                </button>)}
              </td>
            </tr>))}
          </tbody>
        </table>
      )}
    </>
  );
}

function OrganizerView({ d }) {
  return (
    <>
      <div className="spread"><p className="muted">How your events are filling up.</p><Link href="/events/new" className="btn">Create an event</Link></div>
      <div className="section-head"><h2>Your events</h2></div>
      {d.events.length === 0 ? <p className="empty">No events yet. <Link href="/events/new">Create your first one</Link></p> : (
        <table>
          <thead><tr>
            <th>Event</th><th>Stage</th><th className="num">Registered</th><th className="num">Still looking</th>
            <th className="num">Teams</th><th className="num">Full</th><th className="num">Avg balance</th><th className="num">Requests</th><th className="num">Submissions</th>
          </tr></thead>
          <tbody>{d.events.map((e) => (
            <tr key={e.event_id}>
              <td><Link href={`/events/${e.event_id}`}><b>{e.title}</b></Link><br /><span className="small muted">{fmtDate(e.start_date)}</span></td>
              <td><Status status={e.status} /></td>
              <td className="num">{e.registrations}</td>
              <td className="num" style={{ color: e.still_seeking ? 'var(--seat)' : undefined, fontWeight: 700 }}>{e.still_seeking}</td>
              <td className="num">{e.teams}</td>
              <td className="num">{e.full_teams}</td>
              <td className="num">{e.avg_balance ?? '–'}</td>
              <td className="num">{e.pending_requests}</td>
              <td className="num">{e.submissions}</td>
            </tr>))}
          </tbody>
        </table>
      )}
    </>
  );
}

const CRITERIA = ['innovation', 'technical', 'design', 'impact', 'presentation'];

function JudgeView({ d, reload }) {
  const byEvent = {};
  for (const r of d.queue) (byEvent[r.event_id] ??= { title: r.title, status: r.status, items: [] }).items.push(r);
  return (
    <>
      <p className="muted">Submissions waiting for your scores.</p>
      {Object.keys(byEvent).length === 0 && <p className="empty">You haven&apos;t been assigned to any event yet.</p>}
      {Object.entries(byEvent).map(([id, ev]) => (
        <section key={id}>
          <div className="section-head"><h2><Link href={`/events/${id}`}>{ev.title}</Link></h2><Status status={ev.status} /></div>
          {ev.items.every((x) => !x.submission_id) && <p className="empty">No submissions yet.</p>}
          <div className="stack">
            {ev.items.filter((x) => x.submission_id).map((s) => (
              <ScoreCard key={s.submission_id} s={s} canScore={ev.status === 'judging'} onSaved={reload} />
            ))}
          </div>
        </section>
      ))}
    </>
  );
}

function ScoreCard({ s, canScore, onSaved }) {
  const [v, setV] = useState(Object.fromEntries(CRITERIA.map((c) => [c, s.my_scores?.[c] ?? 5])));
  const act = useAction();
  const done = s.criteria_scored === 5;
  return (
    <div className="panel stack">
      <div className="spread">
        <div>
          <h3><a href={s.repo_url} target="_blank" rel="noreferrer">{s.project_title}</a></h3>
          <p className="small muted">{s.team_name}</p>
        </div>
        <span className={`chip ${done ? 'met' : ''}`}>{done ? 'Scored' : `${s.criteria_scored}/5 scored`}</span>
      </div>
      {s.summary && <p className="small">{s.summary}</p>}
      <Notice>{act.error}</Notice>
      <Notice kind="ok">{act.done}</Notice>
      <div className="fields" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))' }}>
        {CRITERIA.map((c) => (
          <div key={c}>
            <label htmlFor={`${s.submission_id}-${c}`} style={{ textTransform: 'capitalize' }}>{c} <span className="hint">{v[c]}/10</span></label>
            <input id={`${s.submission_id}-${c}`} type="range" min={0} max={10} value={v[c]} disabled={!canScore}
              onChange={(e) => setV({ ...v, [c]: Number(e.target.value) })} />
          </div>
        ))}
      </div>
      {canScore ? (
        <div><button className="btn sm" disabled={act.busy}
          onClick={() => act.run(async () => { await api('/api/scores', { method: 'POST', body: { submission_id: s.submission_id, scores: v } }); onSaved(); }, 'Scores saved')}>
          {done ? 'Update scores' : 'Save scores'}
        </button></div>
      ) : <p className="small muted">Scoring opens when the organizer starts judging.</p>}
    </div>
  );
}

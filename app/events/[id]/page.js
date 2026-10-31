'use client';
import { use, useState } from 'react';
import Link from 'next/link';
import { api, useApi, useAction } from '../../_components/api';
import { Seats, SkillChip, Status, Notice, Balance, fmtDate } from '../../_components/ui';
import SkillPicker from '../../_components/SkillPicker';

export default function EventPage({ params }) {
  const { id } = use(params);
  const ev = useApi(`/api/events/${id}`);
  const me = useApi('/api/auth/me');
  const [tab, setTab] = useState('teams');
  const act = useAction();

  if (ev.error) return <Notice>{ev.error}</Notice>;
  if (!ev.data) return <p className="muted">Loading…</p>;
  const e = ev.data.event;
  const user = me.data?.user;
  const isParticipant = user?.role === 'participant';
  const canRegister = isParticipant && !e.is_registered && e.status === 'open';
  const seeking = isParticipant && e.is_registered && !e.my_team_id && ['open', 'ongoing'].includes(e.status);

  const tabs = [
    ['teams', 'Teams'],
    ['people', 'Free agents'],
    seeking && ['foryou', 'Teams for you'],
    e.is_organizer && ['insights', 'Insights'],
    (e.status === 'completed' || e.is_organizer || e.is_judge) && ['results', 'Results'],
    e.is_organizer && ['manage', 'Manage'],
  ].filter(Boolean);

  return (
    <div>
      <div className="split">
        <div className="stack" style={{ '--space': '10px', maxWidth: 680 }}>
          <div className="row"><Status status={e.status} /><span className="muted small">{e.theme}</span></div>
          <h1>{e.title}</h1>
          <p className="muted">{e.description}</p>
        </div>
        <div className="panel stack" style={{ '--space': '12px' }}>
          <dl className="facts">
            <dt>When</dt><dd>{fmtDate(e.start_date)}{e.end_date !== e.start_date && <> – {fmtDate(e.end_date)}</>}</dd>
            <dt>Where</dt><dd>{e.venue || 'TBA'}</dd>
            <dt>Teams</dt><dd>{e.min_team_size}–{e.max_team_size} people</dd>
            <dt>Sign up by</dt><dd>{fmtDate(e.reg_deadline)}</dd>
            <dt>Organizer</dt><dd>{e.organizer}</dd>
          </dl>
          <Notice>{act.error}</Notice>
          {canRegister && (
            <button className="btn seat-btn" disabled={act.busy}
              onClick={() => act.run(async () => { await api(`/api/events/${id}/register`, { method: 'POST' }); ev.reload(); })}>
              Register for this event
            </button>
          )}
          {!user && e.status === 'open' && <Link className="btn seat-btn" href={`/login?next=/events/${id}`}>Log in to register</Link>}
          {isParticipant && e.is_registered && !e.my_team_id && (
            <>
              <p className="notice ok">You&apos;re registered. Next, join a team or start one.</p>
              <button className="btn ghost sm" disabled={act.busy}
                onClick={() => act.run(async () => { await api(`/api/events/${id}/register`, { method: 'DELETE' }); ev.reload(); })}>
                Cancel registration
              </button>
            </>
          )}
          {e.my_team_id && <Link className="btn" href={`/teams/${e.my_team_id}`}>Open your team</Link>}
        </div>
      </div>

      <div className="tabs" role="tablist">
        {tabs.map(([k, l]) => (
          <button key={k} role="tab" className="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>

      {tab === 'teams' && <TeamsTab eventId={id} event={e} canCreate={seeking} onCreated={ev.reload} />}
      {tab === 'people' && <PeopleTab eventId={id} />}
      {tab === 'foryou' && <ForYouTab eventId={id} />}
      {tab === 'insights' && <InsightsTab eventId={id} event={e} />}
      {tab === 'results' && <ResultsTab eventId={id} />}
      {tab === 'manage' && <ManageTab eventId={id} event={e} onChange={ev.reload} />}
    </div>
  );
}

function TeamCard({ t }) {
  const missing = t.missing_skills ? t.missing_skills.split(', ') : [];
  const have = t.required_skills ? t.required_skills.split(', ').filter((s) => !missing.includes(s)) : [];
  return (
    <Link href={`/teams/${t.team_id}`} className={`team-card${t.is_locked ? ' locked' : ''}`}>
      <div className="spread">
        <h3>{t.team_name}</h3>
        <span className="small muted">{t.is_locked ? 'Full' : `${t.slots_left} open`}</span>
      </div>
      <Seats members={t.members} capacity={t.capacity} leaderName={t.leader_name} />
      {t.pitch && <p className="small muted">{t.pitch}</p>}
      {(have.length > 0 || missing.length > 0) && (
        <div className="chips">
          {missing.map((s) => <SkillChip key={s} name={s} kind="gap" />)}
          {have.map((s) => <SkillChip key={s} name={s} kind="met" />)}
        </div>
      )}
      <Balance score={t.balance_score} />
    </Link>
  );
}

function TeamsTab({ eventId, event, canCreate, onCreated }) {
  const [openOnly, setOpenOnly] = useState(false);
  const [sort, setSort] = useState('balance');
  const { data, error, reload } = useApi(`/api/teams?eventId=${eventId}&open=${openOnly ? 1 : 0}&sort=${sort}`);
  const [creating, setCreating] = useState(false);

  return (
    <div className="stack">
      <div className="spread">
        <div className="row">
          <label className="row" style={{ fontWeight: 400, margin: 0, gap: 6 }}>
            <input type="checkbox" checked={openOnly} onChange={(e) => setOpenOnly(e.target.checked)} style={{ width: 'auto' }} />
            Only teams with open seats
          </label>
          <select aria-label="Sort teams" value={sort} onChange={(e) => setSort(e.target.value)} style={{ width: 'auto' }}>
            <option value="balance">Best balanced first</option>
            <option value="slots">Most open seats</option>
            <option value="name">Name</option>
          </select>
        </div>
        {canCreate && !creating && <button className="btn" onClick={() => setCreating(true)}>Start a team</button>}
      </div>
      {creating && (
        <CreateTeam event={event} onCancel={() => setCreating(false)}
          onDone={(teamId) => { window.location.href = `/teams/${teamId}`; onCreated(); reload(); }} />
      )}
      <Notice>{error}</Notice>
      {data?.teams?.length === 0 && <p className="empty">No teams yet{canCreate ? ' — start the first one.' : '.'}</p>}
      <div className="grid">{data?.teams?.map((t) => <TeamCard key={t.team_id} t={t} />)}</div>
    </div>
  );
}

function CreateTeam({ event, onCancel, onDone }) {
  const [f, setF] = useState({ team_name: '', pitch: '', capacity: event.max_team_size, required_skills: [] });
  const { busy, error, run } = useAction();
  async function submit(e) {
    e.preventDefault();
    const r = await run(() => api('/api/teams', { method: 'POST', body: { ...f, event_id: event.event_id } }));
    if (r) onDone(r.team_id);
  }
  return (
    <form onSubmit={submit} className="panel stack">
      <h2>Start a team</h2>
      <Notice>{error}</Notice>
      <div className="fields two">
        <div><label htmlFor="tn">Team name</label><input id="tn" required minLength={2} value={f.team_name} onChange={(e) => setF({ ...f, team_name: e.target.value })} /></div>
        <div>
          <label htmlFor="cap">Seats <span className="hint">{event.min_team_size}–{event.max_team_size}, including you</span></label>
          <input id="cap" type="number" min={event.min_team_size} max={event.max_team_size} value={f.capacity}
            onChange={(e) => setF({ ...f, capacity: e.target.value })} />
        </div>
      </div>
      <div>
        <label htmlFor="pitch">What you&apos;re building <span className="hint">used to match people to your team</span></label>
        <textarea id="pitch" value={f.pitch} onChange={(e) => setF({ ...f, pitch: e.target.value })} />
      </div>
      <div>
        <label>Skills you&apos;re looking for</label>
        <SkillPicker value={f.required_skills} field="min_proficiency" onChange={(v) => setF({ ...f, required_skills: v })} />
      </div>
      <div className="row">
        <button className="btn" disabled={busy}>{busy ? 'Creating…' : 'Create team'}</button>
        <button type="button" className="btn ghost" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

function PeopleTab({ eventId }) {
  const skills = useApi('/api/skills');
  const [skill, setSkill] = useState('');
  const [min, setMin] = useState(3);
  const [rare, setRare] = useState(false);
  const qs = new URLSearchParams({ ...(skill && { skill, min }), ...(rare && { rare: 1 }) });
  const { data, error } = useApi(`/api/events/${eventId}/participants?${qs}`);
  return (
    <div className="stack">
      <div className="row">
        <select aria-label="Skill" value={skill} onChange={(e) => setSkill(e.target.value)} style={{ width: 'auto' }}>
          <option value="">Any skill</option>
          {skills.data?.skills?.map((s) => <option key={s.skill_id} value={s.name}>{s.name}</option>)}
        </select>
        {skill && (
          <select aria-label="Minimum level" value={min} onChange={(e) => setMin(e.target.value)} style={{ width: 'auto' }}>
            {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>at least {n}/5</option>)}
          </select>
        )}
        <label className="row" style={{ fontWeight: 400, margin: 0, gap: 6 }}>
          <input type="checkbox" checked={rare} onChange={(e) => setRare(e.target.checked)} style={{ width: 'auto' }} />
          Has a skill no team here has yet
        </label>
      </div>
      <Notice>{error}</Notice>
      {data?.participants?.length === 0 && <p className="empty">Nobody matches those filters.</p>}
      <div className="grid">
        {data?.participants?.map((p) => (
          <div key={p.user_id} className="team-card">
            <h3>{p.name}</h3>
            {p.bio && <p className="small muted">{p.bio}</p>}
            <div className="chips">{p.skills.map((s) => <SkillChip key={s.name} name={s.name} level={s.proficiency} />)}</div>
            {p.interests?.length > 0 && <p className="small">Into {p.interests.join(', ')}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}

function ForYouTab({ eventId }) {
  const { data, error, reload } = useApi(`/api/matching?eventId=${eventId}`);
  const act = useAction();
  const [msg, setMsg] = useState({});
  return (
    <div className="stack">
      {data && (
        <p className="muted small">
          {data.mode === 'semantic'
            ? 'Ranked by how closely your profile matches what each team describes, plus how many of their missing skills you cover.'
            : 'Ranked by how many of each team\'s missing skills you cover. Fill in your profile to also match on what you\'ve built and what you\'re into.'}
        </p>
      )}
      <Notice>{error || act.error}</Notice>
      <Notice kind="ok">{act.done}</Notice>
      {data?.teams?.length === 0 && <p className="empty">No open teams right now. You could start one from the Teams tab.</p>}
      {data?.teams?.map((t) => (
        <div key={t.team_id} className="panel spread">
          <div className="stack" style={{ '--space': '8px', flex: '1 1 380px' }}>
            <div className="row">
              <Link href={`/teams/${t.team_id}`}><h3>{t.team_name}</h3></Link>
              <span className="small muted">{t.slots_left} open of {t.capacity}</span>
            </div>
            {t.pitch && <p className="small muted">{t.pitch}</p>}
            <p className="small">
              {t.gaps_filled > 0
                ? <>You cover <b>{t.gaps_filled}</b> of the skills they&apos;re missing{t.missing_skills && ` (${t.missing_skills})`}.</>
                : t.missing_skills ? <>They need {t.missing_skills}.</> : 'No specific skills listed.'}
              {t.similarity != null && <> Profile match {Math.round(t.similarity * 100)}%.</>}
            </p>
          </div>
          <div className="stack" style={{ '--space': '8px', width: 260 }}>
            <div className="meter" title="Overall match"><span style={{ width: `${Math.round(t.match_score * 100)}%`, background: 'var(--seat)' }} /></div>
            {t.already_requested ? <p className="small muted">Request sent</p> : (
              <>
                <input aria-label={`Message to ${t.team_name}`} placeholder="Short note to the leader (optional)"
                  value={msg[t.team_id] ?? ''} onChange={(e) => setMsg({ ...msg, [t.team_id]: e.target.value })} />
                <button className="btn seat-btn sm" disabled={act.busy}
                  onClick={() => act.run(async () => {
                    await api(`/api/teams/${t.team_id}/requests`, { method: 'POST', body: { message: msg[t.team_id] ?? '' } });
                    reload();
                  }, `Request sent to ${t.team_name}`)}>
                  Ask to join
                </button>
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function Bars({ rows, label, value, max }) {
  const top = max ?? Math.max(1, ...rows.map((r) => r[value]));
  return (
    <div className="stack" style={{ '--space': '8px' }}>
      {rows.map((r) => (
        <div key={r[label]} className="bar-row">
          <span>{r[label]}</span>
          <div className="meter"><span style={{ width: `${(100 * r[value]) / top}%` }} /></div>
          <span className="num">{r[value]}</span>
        </div>
      ))}
    </div>
  );
}

function InsightsTab({ eventId, event }) {
  const { data, error } = useApi(`/api/events/${eventId}/stats`);
  if (error) return <Notice>{error}</Notice>;
  if (!data) return <p className="muted">Loading…</p>;
  return (
    <div className="stack" style={{ '--space': '28px' }}>
      <div className="row" style={{ gap: 32 }}>
        {[['Registered', event.registrations], ['Still looking', event.still_seeking], ['Teams', event.teams],
          ['Full teams', event.full_teams], ['Pending requests', event.pending_requests]].map(([l, v]) => (
          <div key={l}><div style={{ font: '700 2rem var(--display)' }}>{v}</div><div className="small muted">{l}</div></div>
        ))}
      </div>
      <div className="grid">
        <div className="panel stack">
          <h3>Skills teams need vs. people still free</h3>
          {data.demand.length === 0 ? <p className="muted small">No required skills listed yet.</p> : (
            <table>
              <thead><tr><th>Skill</th><th className="num">Teams need</th><th className="num">Free people</th></tr></thead>
              <tbody>{data.demand.map((d) => (
                <tr key={d.skill}>
                  <td>{d.skill}</td>
                  <td className="num">{d.demand}</td>
                  <td className="num" style={{ color: d.supply < d.demand ? 'var(--gap)' : undefined, fontWeight: d.supply < d.demand ? 700 : 400 }}>{d.supply}</td>
                </tr>))}
              </tbody>
            </table>
          )}
        </div>
        <div className="panel stack">
          <h3>Skill areas among registrants</h3>
          <Bars rows={data.categories} label="category" value="people" />
        </div>
        <div className="panel stack">
          <h3>Most common interests</h3>
          {data.interests.length ? <Bars rows={data.interests} label="interest" value="people" /> : <p className="muted small">No profile data.</p>}
        </div>
        <div className="panel stack">
          <h3>Tech people have built with</h3>
          {data.stacks.length ? <Bars rows={data.stacks} label="tech" value="projects" /> : <p className="muted small">No profile data.</p>}
        </div>
      </div>
    </div>
  );
}

function ResultsTab({ eventId }) {
  const { data, error } = useApi(`/api/events/${eventId}/leaderboard`);
  if (error) return <Notice>{error}</Notice>;
  if (data?.hidden) return <p className="empty">Results are published when the event is completed.</p>;
  if (!data?.leaderboard?.length) return <p className="empty">No submissions yet.</p>;
  return (
    <table>
      <thead><tr><th>Rank</th><th>Team</th><th>Project</th><th className="num">Innovation</th><th className="num">Technical</th><th className="num">Impact</th><th className="num">Average</th></tr></thead>
      <tbody>{data.leaderboard.map((r) => (
        <tr key={r.team_id}>
          <td><b>{r.rank}</b></td>
          <td><Link href={`/teams/${r.team_id}`}>{r.team_name}</Link></td>
          <td><a href={r.repo_url} target="_blank" rel="noreferrer">{r.project_title}</a></td>
          <td className="num">{r.innovation ?? '–'}</td><td className="num">{r.technical ?? '–'}</td><td className="num">{r.impact ?? '–'}</td>
          <td className="num"><b>{r.avg_score ?? '–'}</b></td>
        </tr>))}
      </tbody>
    </table>
  );
}

const NEXT = { draft: ['open'], open: ['ongoing', 'draft'], ongoing: ['judging'], judging: ['completed'], completed: [] };
const VERB = { open: 'Open registration', draft: 'Move back to draft', ongoing: 'Start the event', judging: 'Close submissions and start judging', completed: 'Publish results' };

function ManageTab({ eventId, event, onChange }) {
  const judges = useApi(`/api/events/${eventId}/judges`);
  const act = useAction();
  return (
    <div className="grid">
      <div className="panel stack">
        <h3>Event stage</h3>
        <p className="small muted">Currently <b>{event.status}</b>. Each stage unlocks the next step: registration, submissions, then scoring.</p>
        <Notice>{act.error}</Notice>
        {NEXT[event.status].map((s) => (
          <button key={s} className={s === 'draft' ? 'btn ghost' : 'btn'} disabled={act.busy}
            onClick={() => act.run(async () => { await api(`/api/events/${eventId}`, { method: 'PATCH', body: { status: s } }); onChange(); })}>
            {VERB[s]}
          </button>
        ))}
        {event.status === 'completed' && <p className="small muted">This event is finished.</p>}
      </div>
      <div className="panel stack">
        <h3>Judges</h3>
        <Notice>{judges.error}</Notice>
        {judges.data?.judges?.length === 0 && <p className="small muted">No judge accounts exist yet.</p>}
        {judges.data?.judges?.map((j) => (
          <div key={j.user_id} className="spread">
            <span>{j.name}<br /><span className="small muted">{j.email}</span></span>
            <button className={`btn sm ${j.assigned ? 'ghost' : ''}`} disabled={act.busy}
              onClick={() => act.run(async () => {
                if (j.assigned) await api(`/api/events/${eventId}/judges?judgeId=${j.user_id}`, { method: 'DELETE' });
                else await api(`/api/events/${eventId}/judges`, { method: 'POST', body: { judge_id: j.user_id } });
                judges.reload();
              })}>
              {j.assigned ? 'Remove' : 'Assign'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

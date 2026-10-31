'use client';
import { use, useState } from 'react';
import Link from 'next/link';
import { api, useApi, useAction } from '../../_components/api';
import { Seats, SkillChip, Notice, Balance, Status } from '../../_components/ui';
import SkillPicker from '../../_components/SkillPicker';

export default function TeamPage({ params }) {
  const { id } = use(params);
  const { data, error, reload } = useApi(`/api/teams/${id}`);
  const act = useAction();
  const [note, setNote] = useState('');
  const [editing, setEditing] = useState(false);

  if (error) return <Notice>{error}</Notice>;
  if (!data) return <p className="muted">Loading…</p>;
  const { team: t, members, required, requests, submission, me } = data;
  const open = !t.is_locked && t.slots_left > 0;
  const live = ['open', 'ongoing'].includes(t.event_status);
  const canAsk = me.role === 'participant' && me.is_registered && !me.has_team && !me.pending_request_id && open && live;
  const doThen = (fn, msg) => act.run(async () => { await fn(); reload(); }, msg);

  return (
    <div>
      <p className="small"><Link href={`/events/${t.event_id}`}>{t.event_title}</Link> <Status status={t.event_status} /></p>
      <div className="split" style={{ marginTop: 16 }}>
        <div className="stack" style={{ '--space': '20px' }}>
          <h1>{t.team_name}</h1>
          <Seats members={members.map((m) => m.name)} capacity={t.capacity} leaderName={t.leader_name} size="lg" />
          <p className="muted">
            {t.is_locked ? 'This team is full.' : `${t.slots_left} of ${t.capacity} seats open.`} Led by {t.leader_name}.
          </p>
          {t.pitch && <p style={{ maxWidth: '62ch' }}>{t.pitch}</p>}

          <Notice>{act.error}</Notice>
          <Notice kind="ok">{act.done}</Notice>

          {canAsk && (
            <div className="panel stack" style={{ borderColor: 'var(--seat)' }}>
              <h3>Ask to join</h3>
              <textarea placeholder="Tell the leader what you'd work on (optional)" value={note} maxLength={500}
                onChange={(e) => setNote(e.target.value)} aria-label="Message to the team leader" />
              <button className="btn seat-btn" disabled={act.busy}
                onClick={() => doThen(() => api(`/api/teams/${id}/requests`, { method: 'POST', body: { message: note } }), 'Request sent. The leader will see it on this page.')}>
                Send request
              </button>
            </div>
          )}
          {me.pending_request_id && (
            <div className="notice info row" style={{ justifyContent: 'space-between' }}>
              <span>Your request is waiting for the leader.</span>
              <button className="btn ghost sm" disabled={act.busy}
                onClick={() => doThen(() => api(`/api/requests/${me.pending_request_id}`, { method: 'POST', body: { action: 'withdraw' } }), 'Request withdrawn')}>
                Withdraw request
              </button>
            </div>
          )}
          {me.role === 'participant' && !me.is_registered && t.event_status === 'open' && (
            <p className="notice info">Register for <Link href={`/events/${t.event_id}`}>{t.event_title}</Link> to ask to join.</p>
          )}

          <section className="stack">
            <h2>Members</h2>
            {members.map((m) => (
              <div key={m.user_id} className="panel stack" style={{ '--space': '8px' }}>
                <div className="spread">
                  <h3>{m.name}{m.is_leader && <span className="small muted" style={{ fontWeight: 400 }}> · leader</span>}</h3>
                  {m.github && <a className="small" href={m.github} target="_blank" rel="noreferrer">Work</a>}
                </div>
                {m.bio && <p className="small muted">{m.bio}</p>}
                <div className="chips">{m.skills.map((s) => <SkillChip key={s.name} name={s.name} level={s.proficiency} />)}</div>
              </div>
            ))}
          </section>

          {me.is_leader && <LeaderRequests requests={requests} busy={act.busy} doThen={doThen} />}
          {me.is_leader && open && live && <Suggestions teamId={id} />}

          {submission ? (
            <section className="panel stack">
              <h2>Submission</h2>
              <h3><a href={submission.repo_url} target="_blank" rel="noreferrer">{submission.project_title}</a></h3>
              <p className="muted">{submission.summary}</p>
            </section>
          ) : me.is_leader && t.event_status === 'ongoing' && <SubmitForm teamId={id} onDone={reload} />}
        </div>

        <aside className="stack">
          <div className="panel stack">
            <h3>Skills this team wants</h3>
            {required.length === 0 && <p className="small muted">No specific skills listed.</p>}
            <div className="chips">
              {required.map((r) => <SkillChip key={r.skill_id} name={r.name} level={r.min_proficiency} kind={r.met ? 'met' : 'gap'} />)}
            </div>
            {required.length > 0 && (
              <p className="small muted">Solid: covered by a member. Dashed: still missing. Numbers are the minimum level wanted.</p>
            )}
            <Balance score={t.balance_score} />
          </div>
          {me.is_leader && !submission && (
            <div className="panel stack">
              {editing
                ? <EditTeam team={t} required={required} onDone={() => { setEditing(false); reload(); }} onCancel={() => setEditing(false)} />
                : <button className="btn ghost" onClick={() => setEditing(true)}>Edit team</button>}
              <button className="btn danger sm" disabled={act.busy}
                onClick={() => {
                  if (confirm(`Disband ${t.team_name}? Members become free agents again.`)) {
                    act.run(async () => { await api(`/api/teams/${id}`, { method: 'DELETE' }); window.location.href = `/events/${t.event_id}`; });
                  }
                }}>Disband team</button>
            </div>
          )}
          {me.is_member && !me.is_leader && !submission && (
            <button className="btn danger sm" disabled={act.busy}
              onClick={() => confirm('Leave this team?') && doThen(() => api(`/api/teams/${id}/leave`, { method: 'POST' }), 'You left the team')}>
              Leave team
            </button>
          )}
        </aside>
      </div>
    </div>
  );
}

function LeaderRequests({ requests, busy, doThen }) {
  return (
    <section className="stack">
      <h2>Requests to join</h2>
      {requests.length === 0 && <p className="empty">No pending requests.</p>}
      {requests.map((r) => (
        <div key={r.request_id} className="panel stack" style={{ '--space': '8px' }}>
          <div className="spread">
            <h3>{r.name}</h3>
            <span className="small">
              {r.gaps_filled > 0 ? <b style={{ color: 'var(--met)' }}>Fills {r.gaps_filled} missing skill{r.gaps_filled > 1 ? 's' : ''}</b> : <span className="muted">Fills no missing skills</span>}
              {r.similarity != null && <span className="muted"> · profile match {Math.round(r.similarity * 100)}%</span>}
            </span>
          </div>
          {r.message && <p>&ldquo;{r.message}&rdquo;</p>}
          {r.bio && <p className="small muted">{r.bio}</p>}
          <div className="chips">{r.skills.map((s) => <SkillChip key={s.name} name={s.name} level={s.proficiency} />)}</div>
          <div className="row">
            <button className="btn sm" disabled={busy}
              onClick={() => doThen(() => api(`/api/requests/${r.request_id}`, { method: 'POST', body: { action: 'accept' } }), `${r.name} joined the team`)}>
              Accept
            </button>
            <button className="btn ghost sm" disabled={busy}
              onClick={() => doThen(() => api(`/api/requests/${r.request_id}`, { method: 'POST', body: { action: 'reject' } }), 'Request declined')}>
              Decline
            </button>
          </div>
        </div>
      ))}
    </section>
  );
}

function Suggestions({ teamId }) {
  const { data, error } = useApi(`/api/teams/${teamId}/suggestions`);
  return (
    <section className="stack">
      <h2>People who could fill your seats</h2>
      {data && (
        <p className="small muted">
          {data.mode === 'semantic'
            ? 'Free agents whose profiles are closest to your pitch and wanted skills, weighted by how many missing skills they cover.'
            : 'Free agents ranked by how many of your missing skills they cover.'}
        </p>
      )}
      <Notice>{error}</Notice>
      {data?.suggestions?.length === 0 && <p className="empty">Nobody is looking for a team in this event right now.</p>}
      <div className="grid">
        {data?.suggestions?.map((p) => (
          <div key={p.user_id} className="team-card">
            <div className="spread">
              <h3>{p.name}</h3>
              <span className="small muted">{Math.round(p.match_score * 100)}% match</span>
            </div>
            {p.bio && <p className="small muted">{p.bio}</p>}
            <div className="chips">{p.skills.slice(0, 5).map((s) => <SkillChip key={s.name} name={s.name} level={s.proficiency} />)}</div>
            <p className="small">
              {p.gaps_filled > 0 ? `Covers ${p.gaps_filled} missing skill${p.gaps_filled > 1 ? 's' : ''}` : 'Covers none of your missing skills'}
              {p.already_requested && ' · has already asked to join'}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

function EditTeam({ team, required, onDone, onCancel }) {
  const [f, setF] = useState({
    pitch: team.pitch, capacity: team.capacity,
    required_skills: required.map((r) => ({ skill_id: r.skill_id, min_proficiency: r.min_proficiency })),
  });
  const { busy, error, run } = useAction();
  return (
    <form className="stack" onSubmit={async (e) => {
      e.preventDefault();
      if (await run(() => api(`/api/teams/${team.team_id}`, { method: 'PATCH', body: f }))) onDone();
    }}>
      <h3>Edit team</h3>
      <Notice>{error}</Notice>
      <div>
        <label htmlFor="ecap">Seats <span className="hint">{team.min_team_size}–{team.max_team_size}</span></label>
        <input id="ecap" type="number" min={team.min_team_size} max={team.max_team_size} value={f.capacity}
          onChange={(e) => setF({ ...f, capacity: e.target.value })} />
      </div>
      <div>
        <label htmlFor="epitch">Pitch</label>
        <textarea id="epitch" value={f.pitch} onChange={(e) => setF({ ...f, pitch: e.target.value })} />
      </div>
      <div>
        <label>Wanted skills</label>
        <SkillPicker field="min_proficiency" value={f.required_skills} onChange={(v) => setF({ ...f, required_skills: v })} />
      </div>
      <div className="row">
        <button className="btn sm" disabled={busy}>Save changes</button>
        <button type="button" className="btn ghost sm" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

function SubmitForm({ teamId, onDone }) {
  const [f, setF] = useState({ project_title: '', summary: '', repo_url: '' });
  const { busy, error, run } = useAction();
  return (
    <form className="panel stack" onSubmit={async (e) => {
      e.preventDefault();
      if (await run(() => api('/api/submissions', { method: 'POST', body: { ...f, team_id: Number(teamId) } }))) onDone();
    }}>
      <h2>Submit your project</h2>
      <p className="small muted">You can submit once. Judges see the title, summary and repository.</p>
      <Notice>{error}</Notice>
      <div><label htmlFor="pt">Project title</label><input id="pt" required value={f.project_title} onChange={(e) => setF({ ...f, project_title: e.target.value })} /></div>
      <div><label htmlFor="ps">Summary</label><textarea id="ps" value={f.summary} onChange={(e) => setF({ ...f, summary: e.target.value })} /></div>
      <div><label htmlFor="pr">Repository URL</label><input id="pr" type="url" required placeholder="https://github.com/…" value={f.repo_url} onChange={(e) => setF({ ...f, repo_url: e.target.value })} /></div>
      <button className="btn" disabled={busy}>Submit project</button>
    </form>
  );
}

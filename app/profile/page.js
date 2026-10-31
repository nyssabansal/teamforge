'use client';
import { useEffect, useState } from 'react';
import { api, useApi, useAction } from '../_components/api';
import { Notice } from '../_components/ui';
import SkillPicker from '../_components/SkillPicker';

export default function ProfilePage() {
  const skills = useApi('/api/me/skills');
  const prof = useApi('/api/me/profile');
  const [mine, setMine] = useState(null);
  const [p, setP] = useState(null);
  const sAct = useAction();
  const pAct = useAction();

  useEffect(() => { if (skills.data) setMine(skills.data.skills.map(({ skill_id, proficiency }) => ({ skill_id, proficiency }))); }, [skills.data]);
  useEffect(() => { if (prof.data) setP({ ...prof.data.profile, interestsText: (prof.data.profile.interests ?? []).join(', ') }); }, [prof.data]);

  const setProj = (i, k, v) => setP({ ...p, past_projects: p.past_projects.map((x, j) => (j === i ? { ...x, [k]: v } : x)) });

  return (
    <div className="stack" style={{ '--space': '32px', maxWidth: 760 }}>
      <div className="stack" style={{ '--space': '8px' }}>
        <h1>Your profile</h1>
        <p className="muted">Teams see your skills and profile when you ask to join. Your profile text is also what we use to match you with teams.</p>
      </div>

      <section className="panel stack">
        <h2>Skills</h2>
        <p className="small muted">Rate yourself honestly: 3 means you could build with it this weekend, 5 means others ask you for help.</p>
        <Notice>{skills.error || sAct.error}</Notice>
        <Notice kind="ok">{sAct.done}</Notice>
        {mine && <SkillPicker value={mine} onChange={setMine} />}
        <div><button className="btn" disabled={sAct.busy || !mine}
          onClick={() => sAct.run(() => api('/api/me/skills', { method: 'PUT', body: { skills: mine } }), 'Skills saved')}>
          Save skills
        </button></div>
      </section>

      <section className="panel stack">
        <h2>About you</h2>
        <Notice>{prof.error || pAct.error}</Notice>
        <Notice kind="ok">{pAct.done}</Notice>
        {p && (
          <>
            <div>
              <label htmlFor="bio">Bio <span className="hint">what you like building</span></label>
              <textarea id="bio" maxLength={1000} value={p.bio} onChange={(e) => setP({ ...p, bio: e.target.value })} />
            </div>
            <div className="fields two">
              <div>
                <label htmlFor="int">Interests <span className="hint">comma separated</span></label>
                <input id="int" value={p.interestsText} placeholder="climate, accessibility, fintech"
                  onChange={(e) => setP({ ...p, interestsText: e.target.value })} />
              </div>
              <div>
                <label htmlFor="av">Availability</label>
                <select id="av" value={p.availability ?? 'full-time'} onChange={(e) => setP({ ...p, availability: e.target.value })}>
                  <option value="full-time">Full event</option>
                  <option value="weekends">Weekends</option>
                  <option value="evenings">Evenings</option>
                </select>
              </div>
            </div>
            <div>
              <label htmlFor="gh">Link to your work <span className="hint">GitHub, Behance, portfolio</span></label>
              <input id="gh" type="url" value={p.github ?? ''} onChange={(e) => setP({ ...p, github: e.target.value })} />
            </div>

            <h3 style={{ marginTop: 8 }}>Past projects</h3>
            {p.past_projects.map((pr, i) => (
              <div key={i} className="stack" style={{ '--space': '10px', paddingLeft: 14, borderLeft: '3px solid var(--line)' }}>
                <div className="fields two">
                  <div><label htmlFor={`pt${i}`}>Title</label><input id={`pt${i}`} value={pr.title} onChange={(e) => setProj(i, 'title', e.target.value)} /></div>
                  <div><label htmlFor={`ps${i}`}>Built with <span className="hint">comma separated</span></label>
                    <input id={`ps${i}`} value={(pr.stack ?? []).join(', ')} onChange={(e) => setProj(i, 'stack', e.target.value.split(',').map((x) => x.trim()).filter(Boolean))} /></div>
                </div>
                <div><label htmlFor={`pd${i}`}>What it does</label>
                  <textarea id={`pd${i}`} style={{ minHeight: 60 }} value={pr.description} onChange={(e) => setProj(i, 'description', e.target.value)} /></div>
                <div><button type="button" className="btn ghost sm"
                  onClick={() => setP({ ...p, past_projects: p.past_projects.filter((_, j) => j !== i) })}>Remove project</button></div>
              </div>
            ))}
            {p.past_projects.length < 8 && (
              <div><button type="button" className="btn ghost sm"
                onClick={() => setP({ ...p, past_projects: [...p.past_projects, { title: '', stack: [], description: '' }] })}>
                Add a project
              </button></div>
            )}
            <div><button className="btn" disabled={pAct.busy}
              onClick={() => pAct.run(() => api('/api/me/profile', {
                method: 'PUT',
                body: {
                  bio: p.bio, availability: p.availability ?? 'full-time', github: p.github ?? '',
                  interests: p.interestsText.split(',').map((x) => x.trim()).filter(Boolean),
                  past_projects: p.past_projects.filter((x) => x.title.trim()),
                },
              }), 'Profile saved')}>
              Save profile
            </button></div>
          </>
        )}
      </section>
    </div>
  );
}

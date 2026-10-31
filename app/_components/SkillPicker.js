'use client';
import { useState } from 'react';
import { useApi } from './api';
import { levelName } from './ui';

/**
 * Edit a list of { skill_id, [field]: 1..5 }.
 * field = 'proficiency' for a person's skills, 'min_proficiency' for a team's needs.
 */
export default function SkillPicker({ value, onChange, field = 'proficiency' }) {
  const { data } = useApi('/api/skills');
  const all = data?.skills ?? [];
  const byId = Object.fromEntries(all.map((s) => [s.skill_id, s]));
  const [pick, setPick] = useState('');
  const [lvl, setLvl] = useState(3);
  const remaining = all.filter((s) => !value.some((v) => v.skill_id === s.skill_id));

  const add = () => {
    if (!pick) return;
    onChange([...value, { skill_id: Number(pick), [field]: Number(lvl) }]);
    setPick('');
  };

  return (
    <div className="stack" style={{ '--space': '10px' }}>
      {value.length > 0 && (
        <div className="stack" style={{ '--space': '6px' }}>
          {value.map((v) => (
            <div key={v.skill_id} className="row" style={{ justifyContent: 'space-between' }}>
              <span style={{ minWidth: 140 }}><b>{byId[v.skill_id]?.name ?? '…'}</b> <span className="small muted">{byId[v.skill_id]?.category}</span></span>
              <div className="row" style={{ gap: 8 }}>
                <select aria-label={`Level for ${byId[v.skill_id]?.name}`} value={v[field]} style={{ width: 'auto' }}
                  onChange={(e) => onChange(value.map((x) => x.skill_id === v.skill_id ? { ...x, [field]: Number(e.target.value) } : x))}>
                  {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n} · {levelName(n)}</option>)}
                </select>
                <button type="button" className="btn ghost sm" aria-label={`Remove ${byId[v.skill_id]?.name}`}
                  onClick={() => onChange(value.filter((x) => x.skill_id !== v.skill_id))}>Remove</button>
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="row" style={{ gap: 8 }}>
        <select aria-label="Add a skill" value={pick} onChange={(e) => setPick(e.target.value)} style={{ flex: '1 1 180px', width: 'auto' }}>
          <option value="">Add a skill…</option>
          {remaining.map((s) => <option key={s.skill_id} value={s.skill_id}>{s.name} ({s.category})</option>)}
        </select>
        <select aria-label="Level" value={lvl} onChange={(e) => setLvl(e.target.value)} style={{ width: 'auto' }}>
          {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{field === 'min_proficiency' ? `at least ${n}` : `${n} · ${levelName(n)}`}</option>)}
        </select>
        <button type="button" className="btn ghost sm" onClick={add} disabled={!pick}>Add</button>
      </div>
    </div>
  );
}

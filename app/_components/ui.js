// Small shared UI pieces (server- and client-safe: no hooks here)

export function initials(name = '') {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
}

/** Seat row: one seat per capacity slot; filled seats show member initials. */
export function Seats({ members = [], capacity, leaderName, size = '' }) {
  const names = Array.isArray(members) ? members : String(members || '').split(', ').filter(Boolean);
  const seats = Array.from({ length: capacity }, (_, i) => names[i] ?? null);
  const open = capacity - names.length;
  return (
    <div className={`seats ${size}`} role="img"
      aria-label={`${names.length} of ${capacity} seats taken${open > 0 ? `, ${open} open` : ', team full'}`}>
      {seats.map((n, i) => n
        ? <span key={i} className={`seat${n === leaderName ? ' lead' : ''}`} title={n === leaderName ? `${n} (leader)` : n}>{initials(n)}</span>
        : <span key={i} className="seat open" title="Open seat" />)}
    </div>
  );
}

const LEVEL = ['', 'beginner', 'basic', 'intermediate', 'strong', 'expert'];
export const levelName = (n) => LEVEL[n] ?? '';

export function SkillChip({ name, level, kind }) {
  return (
    <span className={`chip${kind ? ' ' + kind : ''}`} title={level ? `${name}: ${levelName(level)}` : name}>
      {name}{level ? <span className="lvl">{level}/5</span> : null}
    </span>
  );
}

export function Status({ status }) {
  return <span className={`status ${status}`}>{status}</span>;
}

export function Notice({ kind = 'error', children }) {
  if (!children) return null;
  return <div className={`notice ${kind}`} role={kind === 'error' ? 'alert' : 'status'}>{children}</div>;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** 'YYYY-MM-DD' -> '21 Nov 2026' without timezone conversion */
export function fmtDate(d) {
  if (!d) return '';
  const [y, m, day] = String(d).slice(0, 10).split('-').map(Number);
  return `${day} ${MONTHS[m - 1]} ${y}`;
}

export function Balance({ score }) {
  const v = Number(score) || 0;
  return (
    <div title="Team balance: required-skill coverage, skill variety and how full the team is">
      <div className="row small" style={{ justifyContent: 'space-between' }}>
        <span className="muted">Balance</span><b>{v.toFixed(0)}</b>
      </div>
      <div className="meter"><span style={{ width: `${Math.min(v, 100)}%` }} /></div>
    </div>
  );
}

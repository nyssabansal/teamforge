import Link from 'next/link';
import { query } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { Seats } from './_components/ui';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const s = await getSession();
  let teams = [];
  let error = null;
  try {
    ({ rows: teams } = await query(
      `SELECT team_id, team_name, event_title, event_id, members, leader_name, capacity, slots_left, missing_skills
       FROM v_open_teams ORDER BY slots_left DESC, balance_score DESC LIMIT 6`));
  } catch (e) {
    error = e.message;
  }
  const openSeats = teams.reduce((n, t) => n + t.slots_left, 0);

  return (
    <div className="hero">
      <h1>Every team has an empty seat. Find the one that fits you.</h1>
      <p className="lede">
        Teams list the skills they&apos;re missing. You list what you&apos;re good at.
        We match the two, so you join a team that actually needs you.
      </p>
      <div className="row" style={{ marginTop: 24 }}>
        <Link href="/events" className="btn seat-btn">Browse events</Link>
        {!s && <Link href="/register" className="btn ghost">Create an account</Link>}
        {s && <Link href="/dashboard" className="btn ghost">Go to your dashboard</Link>}
      </div>

      <section className="hero-board" aria-labelledby="open-now">
        <div className="spread" style={{ marginTop: 28 }}>
          <h2 id="open-now">Open right now</h2>
          {teams.length > 0 && <p className="muted">{openSeats} open seats across {teams.length} teams</p>}
        </div>
        {error && <p className="notice error">Can&apos;t reach the database: {error}</p>}
        {!error && teams.length === 0 && <p className="empty">No open seats at the moment. Check back when the next event opens.</p>}
        {teams.map((t) => (
          <Link key={t.team_id} href={`/teams/${t.team_id}`} className="board-row">
            <Seats members={t.members} capacity={t.capacity} leaderName={t.leader_name} />
            <div>
              <h3>{t.team_name}</h3>
              <p className="muted small">{t.event_title}</p>
            </div>
            <p className="small" style={{ textAlign: 'right' }}>
              {t.missing_skills ? <>Needs <b>{t.missing_skills}</b></> : 'Open to anyone'}
            </p>
          </Link>
        ))}
      </section>
    </div>
  );
}

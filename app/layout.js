import './globals.css';
import Link from 'next/link';
import { getSession } from '@/lib/auth';
import LogoutButton from './_components/LogoutButton';

export const metadata = {
  title: { default: 'TeamForge', template: '%s · TeamForge' },
  description: 'Find teammates whose skills fill your team\'s gaps.',
};

export default async function RootLayout({ children }) {
  const s = await getSession();
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:wght@400;700&family=Bricolage+Grotesque:opsz,wght@12..96,500..800&display=swap"
        />
      </head>
      <body>
        <header className="nav">
          <nav className="wrap" aria-label="Main">
            <Link href="/" className="brand" aria-label="TeamForge home">
              <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>
              <span className="brand-name">TeamForge</span>
            </Link>
            <div className="nav-links">
              <Link href="/events">Events</Link>
              {s ? (
                <>
                  <Link href="/dashboard">Dashboard</Link>
                  {s.role === 'participant' && <Link href="/profile">Profile</Link>}
                  <span className="who">{s.name} · {s.role}</span>
                  <LogoutButton />
                </>
              ) : (
                <>
                  <Link href="/login">Log in</Link>
                  <Link href="/register" className="btn seat-btn sm">Sign up</Link>
                </>
              )}
            </div>
          </nav>
        </header>
        <main className="wrap">{children}</main>
      </body>
    </html>
  );
}

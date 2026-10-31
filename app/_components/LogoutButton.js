'use client';
import { api } from './api';

export default function LogoutButton() {
  return (
    <button className="btn ghost sm" style={{ color: '#fff', borderColor: 'rgba(255,255,255,.4)' }}
      onClick={async () => { await api('/api/auth/logout', { method: 'POST' }); window.location.href = '/'; }}>
      Log out
    </button>
  );
}

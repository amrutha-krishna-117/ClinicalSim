'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/store';

export function Navigation() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuthStore();

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  const links = [
    { href: '/dashboard',  label: 'Dashboard' },
    { href: '/scenarios',  label: 'Scenarios'  },
    { href: '/dashboard#performance', label: 'Performance' },
  ];

  if (user?.role === 'FACULTY' || user?.role === 'ADMIN') {
    links.push({ href: '/faculty', label: 'Faculty' });
  }

  return (
    <nav style={{ background: '#0f2744', borderBottom: '1px solid #1e3a5f' }}>
      <div className="max-w-7xl mx-auto px-6 flex items-center h-14">
        {/* Brand */}
        <Link href="/dashboard" className="flex items-center gap-2.5 mr-10">
          <div style={{
            width: 28, height: 28, borderRadius: 7,
            background: 'linear-gradient(135deg,#2563eb,#06b6d4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" fill="rgba(255,255,255,0.3)"/>
              <path d="M12 6v6l4 2" stroke="white" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </div>
          <span style={{ color: '#ffffff', fontWeight: 700, fontSize: 15, letterSpacing: '-0.3px' }}>
            ClinicalSim
          </span>
          <span style={{
            fontSize: 10, fontWeight: 600, color: '#2563eb',
            background: 'rgba(37,99,235,0.18)', border: '1px solid rgba(37,99,235,0.35)',
            borderRadius: 4, padding: '1px 6px', letterSpacing: '0.5px',
          }}>BETA</span>
        </Link>

        {/* Nav links */}
        <div className="flex items-center gap-1 flex-1">
          {links.map(l => {
            const active = pathname === l.href || pathname.startsWith(l.href.split('#')[0] + '/');
            return (
              <Link key={l.href} href={l.href}
                style={{
                  fontSize: 13, fontWeight: 500, padding: '5px 14px',
                  borderRadius: 7, transition: 'all 0.15s',
                  color: active ? '#ffffff' : '#94b0cc',
                  background: active ? 'rgba(37,99,235,0.22)' : 'transparent',
                }}>
                {l.label}
              </Link>
            );
          })}
        </div>

        {/* User */}
        <div className="flex items-center gap-3">
          {user && (
            <div className="text-right">
              <div style={{ color: '#ffffff', fontSize: 13, fontWeight: 600 }}>
                {user.full_name ?? user.email?.split('@')[0]}
              </div>
              <div style={{ color: '#60a0c0', fontSize: 11 }}>
                {user.role?.charAt(0) + user.role?.slice(1).toLowerCase()}
              </div>
            </div>
          )}
          <button onClick={handleLogout}
            style={{
              fontSize: 12, fontWeight: 500, color: '#94b0cc',
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.10)',
              borderRadius: 7, padding: '5px 14px', cursor: 'pointer',
            }}>
            Sign out
          </button>
        </div>
      </div>
    </nav>
  );
}

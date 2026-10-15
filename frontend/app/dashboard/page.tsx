'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/lib/store';
import { scenariosApi, analyticsApi } from '@/lib/api';
import { Navigation } from '@/components/Navigation';
import Link from 'next/link';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

const DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Today'];
const mockPerf = DAYS.map((d,i) => ({ day: d, score: 62 + i*4 - (i===6?40:0) }));

export default function DashboardPage() {
  const router = useRouter();
  const { isAuthenticated, user, _hasHydrated } = useAuthStore();

  useEffect(() => {
    if (_hasHydrated && !isAuthenticated) router.push('/login');
  }, [isAuthenticated, _hasHydrated, router]);

  const { data: scenarios = [] } = useQuery({
    queryKey: ['scenarios'],
    queryFn: () => scenariosApi.list().then(r => r.data),
    enabled: isAuthenticated && _hasHydrated,
  });

  const { data: analytics } = useQuery({
    queryKey: ['analytics-student'],
    queryFn: () => analyticsApi.student().then(r => r.data),
    enabled: isAuthenticated && _hasHydrated,
  });

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const firstName = user?.full_name?.split(' ')[0] ?? user?.email?.split('@')[0] ?? '';

  const metrics = [
    { label: 'Simulations',  value: analytics?.total_sessions ?? 0,             sub: 'this month' },
    { label: 'Avg Score',    value: `${(analytics?.average_score ?? 0).toFixed(1)}%`, sub: 'this month' },
    { label: 'Dx Accuracy',  value: analytics?.diagnosis_accuracy ? `${analytics.diagnosis_accuracy.toFixed(0)}%` : '--%', sub: 'this month' },
    { label: 'Time Spent',   value: `${analytics?.time_spent_minutes ?? 0}min`, sub: 'this month' },
  ];

  if (!_hasHydrated) return null;

  return (
    <div style={{ minHeight: '100vh', background: '#f0f4f9' }}>
      <Navigation />
      <div className="max-w-7xl mx-auto px-6 py-8">

        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 style={{ fontSize: 26, fontWeight: 700, color: '#0d1f35', marginBottom: 4 }}>
              {greeting}, {firstName}
            </h1>
            <p style={{ color: '#5a7a9a', fontSize: 14 }}>
              Continue your clinical training. {scenarios.length} scenarios available.
            </p>
          </div>
          <Link href="/scenarios"
            style={{
              background: 'linear-gradient(135deg,#1d4ed8,#2563eb)',
              color: '#fff', fontWeight: 600, fontSize: 13,
              padding: '10px 22px', borderRadius: 10,
              textDecoration: 'none', display: 'inline-block',
              boxShadow: '0 2px 12px rgba(37,99,235,0.35)',
            }}>
            Browse Scenarios
          </Link>
        </div>

        {/* Metric cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {metrics.map(m => (
            <div key={m.label} style={{
              background: '#ffffff', borderRadius: 14,
              border: '1px solid #dde6f0', padding: '20px 22px',
              boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
            }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#3b82f6',
                background: '#eff6ff', borderRadius: 5, padding: '2px 8px',
                display: 'inline-block', marginBottom: 10 }}>
                {m.sub}
              </div>
              <div style={{ fontSize: 28, fontWeight: 700, color: '#0d1f35', lineHeight: 1 }}>
                {m.value}
              </div>
              <div style={{ fontSize: 12, color: '#7a9ab8', marginTop: 4 }}>{m.label}</div>
            </div>
          ))}
        </div>

        <div className="grid lg:grid-cols-3 gap-6 mb-6">
          {/* Performance chart */}
          <div style={{
            gridColumn: 'span 2', background: '#ffffff',
            borderRadius: 14, border: '1px solid #dde6f0',
            padding: '24px', boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
          }}>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#0d1f35' }}>Performance this week</div>
              <div style={{ fontSize: 12, color: '#8aabca' }}>Average simulation score</div>
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={mockPerf}>
                <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#8aabca' }} axisLine={false} tickLine={false}/>
                <YAxis domain={[0,100]} tick={{ fontSize: 11, fill: '#8aabca' }} axisLine={false} tickLine={false}/>
                <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #dde6f0', fontSize: 12 }}/>
                <Line type="monotone" dataKey="score" stroke="#2563eb" strokeWidth={2.5}
                  dot={{ fill: '#2563eb', r: 3 }} activeDot={{ r: 5 }}/>
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Quick access */}
          <div style={{
            background: '#ffffff', borderRadius: 14,
            border: '1px solid #dde6f0', padding: '24px',
            boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
          }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#0d1f35', marginBottom: 16 }}>
              Quick access
            </div>
            {[
              { label: 'Start new case',      href: '/scenarios',  color: '#2563eb' },
              { label: 'View performance',    href: '/dashboard#performance', color: '#0891b2' },
              { label: 'All scenarios',       href: '/scenarios',  color: '#7c3aed' },
            ].map(item => (
              <Link key={item.label} href={item.href}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '13px 14px', borderRadius: 10, marginBottom: 8,
                  background: '#f7fafd', border: '1px solid #e8eef5',
                  textDecoration: 'none', transition: 'background 0.15s',
                }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{
                    width: 34, height: 34, borderRadius: 8,
                    background: `${item.color}18`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: item.color }}/>
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 500, color: '#1e3a55' }}>{item.label}</span>
                </div>
                <span style={{ color: '#94b0c8', fontSize: 16 }}>›</span>
              </Link>
            ))}
          </div>
        </div>

        {/* Recent scenarios */}
        <div style={{
          background: '#ffffff', borderRadius: 14,
          border: '1px solid #dde6f0', padding: '24px',
          boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
        }}>
          <div className="flex items-center justify-between mb-4">
            <div style={{ fontSize: 15, fontWeight: 700, color: '#0d1f35' }}>Clinical Scenarios</div>
            <Link href="/scenarios" style={{ fontSize: 12, color: '#2563eb', textDecoration: 'none', fontWeight: 600 }}>
              View all {scenarios.length}
            </Link>
          </div>
          <div className="grid md:grid-cols-3 gap-3">
            {scenarios.slice(0,3).map((sc: any) => (
              <Link key={sc.id} href={`/scenarios/${sc.id}`}
                style={{ textDecoration: 'none', display: 'block' }}>
                <div style={{
                  padding: '14px 16px', borderRadius: 10,
                  border: '1px solid #e8eef5', background: '#f7fafd',
                  transition: 'border-color 0.15s',
                }}>
                  <div className="flex items-center justify-between mb-2">
                    <span style={{
                      fontSize: 10, fontWeight: 600, color: '#2563eb',
                      background: '#eff6ff', borderRadius: 4, padding: '2px 7px',
                    }}>{sc.specialty}</span>
                    <span style={{
                      fontSize: 10, fontWeight: 600,
                      color: sc.difficulty==='ADVANCED'?'#dc2626':sc.difficulty==='INTERMEDIATE'?'#d97706':'#16a34a',
                    }}>{sc.difficulty}</span>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#0d1f35', marginBottom: 3 }}>
                    {sc.title}
                  </div>
                  <div style={{ fontSize: 11, color: '#7a9ab8' }}>
                    {sc.patient_age}y {sc.patient_sex} · {sc.estimated_duration}min
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

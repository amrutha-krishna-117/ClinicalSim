'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/lib/store';
import { scenariosApi } from '@/lib/api';
import { Navigation } from '@/components/Navigation';
import Link from 'next/link';

const DIFF_COLOR: Record<string,string> = {
  BEGINNER: '#16a34a', INTERMEDIATE: '#d97706', ADVANCED: '#dc2626',
};
const DIFF_BG: Record<string,string> = {
  BEGINNER: '#f0fdf4', INTERMEDIATE: '#fffbeb', ADVANCED: '#fef2f2',
};

export default function ScenariosPage() {
  const router = useRouter();
  const { isAuthenticated, _hasHydrated } = useAuthStore();
  const [search, setSearch] = useState('');
  const [specialty, setSpecialty] = useState('');
  const [difficulty, setDifficulty] = useState('');

  useEffect(() => {
    if (_hasHydrated && !isAuthenticated) router.push('/login');
  }, [isAuthenticated, _hasHydrated, router]);

  const { data: scenarios = [], isLoading } = useQuery({
    queryKey: ['scenarios'],
    queryFn: () => scenariosApi.list().then(r => r.data),
    enabled: isAuthenticated && _hasHydrated,
  });

  const specialties: string[] = Array.from(new Set(scenarios.map((s: any) => s.specialty))).filter(Boolean) as string[];

  const filtered = scenarios.filter((s: any) => {
    const q = search.toLowerCase();
    const matchQ = !q || s.title.toLowerCase().includes(q)
      || s.specialty?.toLowerCase().includes(q)
      || s.chief_complaint?.toLowerCase().includes(q);
    const matchS = !specialty || s.specialty === specialty;
    const matchD = !difficulty || s.difficulty === difficulty;
    return matchQ && matchS && matchD;
  });

  if (!_hasHydrated) return null;

  return (
    <div style={{ minHeight: '100vh', background: '#f0f4f9' }}>
      <Navigation />
      <div className="max-w-7xl mx-auto px-6 py-8">

        {/* Header */}
        <div className="mb-6">
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#0d1f35', marginBottom: 4 }}>
            Clinical Scenarios
          </h1>
          <p style={{ color: '#5a7a9a', fontSize: 14 }}>
            {scenarios.length} cases across {specialties.length} specialties
          </p>
        </div>

        {/* Search + filters */}
        <div className="flex flex-wrap gap-3 mb-7">
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search scenarios, specialties, complaints..."
            style={{
              flex: 1, minWidth: 260, padding: '10px 16px', fontSize: 13,
              border: '1px solid #d0dce8', borderRadius: 10, background: '#ffffff',
              outline: 'none', color: '#0d1f35',
              boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
            }}
          />
          <select value={specialty} onChange={e => setSpecialty(e.target.value)}
            style={{
              padding: '10px 14px', fontSize: 13, borderRadius: 10,
              border: '1px solid #d0dce8', background: '#ffffff',
              color: specialty ? '#0d1f35' : '#8aabca', outline: 'none',
              boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
            }}>
            <option value="">All Specialties</option>
            {specialties.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={difficulty} onChange={e => setDifficulty(e.target.value)}
            style={{
              padding: '10px 14px', fontSize: 13, borderRadius: 10,
              border: '1px solid #d0dce8', background: '#ffffff',
              color: difficulty ? '#0d1f35' : '#8aabca', outline: 'none',
              boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
            }}>
            <option value="">All Levels</option>
            <option value="BEGINNER">Beginner</option>
            <option value="INTERMEDIATE">Intermediate</option>
            <option value="ADVANCED">Advanced</option>
          </select>
        </div>

        {/* Grid */}
        {isLoading ? (
          <div style={{ textAlign: 'center', color: '#8aabca', padding: '60px 0', fontSize: 14 }}>
            Loading scenarios...
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((sc: any) => (
              <div key={sc.id} style={{
                background: '#ffffff', borderRadius: 14,
                border: '1px solid #dde6f0',
                boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
                overflow: 'hidden', transition: 'box-shadow 0.15s',
              }}>
                <div style={{ padding: '18px 20px' }}>
                  <div className="flex items-center justify-between mb-3">
                    <span style={{
                      fontSize: 11, fontWeight: 600, color: '#2563eb',
                      background: '#eff6ff', border: '1px solid #bfdbfe',
                      borderRadius: 5, padding: '2px 8px',
                    }}>{sc.specialty}</span>
                    <span style={{
                      fontSize: 11, fontWeight: 700,
                      color: DIFF_COLOR[sc.difficulty] ?? '#555',
                      background: DIFF_BG[sc.difficulty] ?? '#f5f5f5',
                      border: `1px solid ${DIFF_COLOR[sc.difficulty]}30`,
                      borderRadius: 5, padding: '2px 8px',
                    }}>{sc.difficulty}</span>
                  </div>
                  <h3 style={{ fontSize: 14, fontWeight: 700, color: '#0d1f35', marginBottom: 6 }}>
                    {sc.title}
                  </h3>
                  <p style={{ fontSize: 12, color: '#6a8eaa', lineHeight: 1.5, marginBottom: 14 }}>
                    {sc.description}
                  </p>
                  <div className="flex items-center justify-between">
                    <div style={{ fontSize: 11, color: '#8aabca' }}>
                      {sc.patient_sex === 'male' ? 'M' : 'F'} {sc.patient_age}y
                      &nbsp;&middot;&nbsp;{sc.estimated_duration}min
                    </div>
                    <Link href={`/scenarios/${sc.id}`}
                      style={{
                        fontSize: 12, fontWeight: 600, color: '#2563eb',
                        textDecoration: 'none',
                      }}>
                      Start &rsaquo;
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {!isLoading && filtered.length === 0 && (
          <div style={{ textAlign: 'center', color: '#8aabca', padding: '60px 0', fontSize: 14 }}>
            No scenarios match your search.
          </div>
        )}
      </div>
    </div>
  );
}

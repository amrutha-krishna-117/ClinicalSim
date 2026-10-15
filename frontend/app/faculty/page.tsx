'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/lib/store';
import { analyticsApi } from '@/lib/api';
import { Navigation } from '@/components/Navigation';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, Cell } from 'recharts';

const SCORE_COLOR = (s: number) => s >= 80 ? '#10b981' : s >= 60 ? '#f59e0b' : '#ef4444';

export default function FacultyPage() {
  const router = useRouter();
  const { isAuthenticated, user, _hasHydrated } = useAuthStore();
  const [activeTab, setActiveTab] = useState<'overview'|'students'|'scenarios'>('overview');

  useEffect(() => {
    if (_hasHydrated && !isAuthenticated) router.push('/login');
    if (_hasHydrated && isAuthenticated && user?.role === 'STUDENT') router.push('/dashboard');
  }, [isAuthenticated, _hasHydrated, user, router]);

  const { data: analytics, isLoading } = useQuery({
    queryKey: ['faculty-analytics'],
    queryFn: () => analyticsApi.facultyEnhanced().then(r => r.data),
    enabled: isAuthenticated && _hasHydrated,
  });

  if (!_hasHydrated || isLoading) {
    return (
      <div className="min-h-screen bg-slate-50">
        <Navigation />
        <div className="flex items-center justify-center py-24 text-slate-400">Loading analytics…</div>
      </div>
    );
  }

  const a = analytics ?? {};
  const students = a.student_performance ?? [];
  const scenarioStats = a.scenario_statistics ?? [];

  const overviewMetrics = [
    { label: 'Total Sessions',    value: a.total_sessions ?? 0,    icon: '🏥', color: '#2563eb' },
    { label: 'Active Students',   value: a.active_students ?? 0,   icon: '👨‍🎓', color: '#7c3aed' },
    { label: 'Avg Score',         value: `${(a.average_score ?? 0).toFixed(1)}%`, icon: '📊', color: '#059669' },
    { label: 'Completed Cases',   value: a.completed_sessions ?? 0, icon: '✅', color: '#0891b2' },
  ];

  return (
    <div className="min-h-screen" style={{ background: '#f8fafc' }}>
      <Navigation />
      <div className="max-w-7xl mx-auto px-6 py-8">

        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Faculty Dashboard</h1>
            <p className="text-slate-500 text-sm mt-1">Monitor student performance and simulation outcomes</p>
          </div>
          <button onClick={() => {
            const csv = ['Student,Cases,Avg Score,Dx Accuracy'];
            students.forEach((s: any) => csv.push(`${s.name},${s.total_cases},${s.average_score?.toFixed(1)},${s.diagnosis_accuracy?.toFixed(0)}`));
            const blob = new Blob([csv.join('\n')], { type: 'text/csv' });
            const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
            a.download = 'clinicalsim_report.csv'; a.click();
          }} className="px-4 py-2 text-sm font-semibold border border-slate-200 text-slate-700 rounded-xl hover:bg-white transition-colors">
            ⬇ Export CSV
          </button>
        </div>

        {/* Metric cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {overviewMetrics.map(m => (
            <div key={m.label} className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xl">{m.icon}</span>
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: m.color }} />
              </div>
              <div className="text-2xl font-bold text-slate-900">{m.value}</div>
              <div className="text-xs text-slate-500 mt-0.5">{m.label}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-5 bg-slate-100 p-1 rounded-xl w-fit">
          {(['overview','students','scenarios'] as const).map(t => (
            <button key={t} onClick={() => setActiveTab(t)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors capitalize ${
                activeTab === t ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}>
              {t}
            </button>
          ))}
        </div>

        {activeTab === 'overview' && (
          <div className="grid lg:grid-cols-2 gap-6">
            {/* Score distribution */}
            <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm">
              <h3 className="font-semibold text-slate-900 mb-4">Score Distribution</h3>
              {students.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={students.slice(0,10).map((s: any) => ({
                    name: s.name?.split(' ')[0] ?? 'Student',
                    score: Math.round(s.average_score ?? 0),
                  }))}>
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                    <YAxis domain={[0,100]} tick={{ fontSize: 10 }} />
                    <Tooltip  />
                    <Bar dataKey="score" radius={[4,4,0,0]}>
                      {students.slice(0,10).map((s: any, i: number) => (
                        <Cell key={i} fill={SCORE_COLOR(s.average_score ?? 0)} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-48 flex items-center justify-center text-slate-400 text-sm">
                  No simulation data yet
                </div>
              )}
            </div>

            {/* Scenario completion */}
            <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm">
              <h3 className="font-semibold text-slate-900 mb-4">Top Scenarios by Completion</h3>
              {scenarioStats.length > 0 ? (
                <div className="space-y-3">
                  {scenarioStats.slice(0,6).map((sc: any, i: number) => (
                    <div key={i}>
                      <div className="flex justify-between text-xs text-slate-600 mb-1">
                        <span className="truncate flex-1">{sc.title}</span>
                        <span className="font-semibold ml-2">{sc.count} cases</span>
                      </div>
                      <div className="w-full h-2 bg-slate-100 rounded-full">
                        <div className="h-full rounded-full" style={{
                          width: `${Math.min(100, (sc.count / (scenarioStats[0]?.count || 1)) * 100)}%`,
                          background: '#2563eb'
                        }} />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="h-48 flex items-center justify-center text-slate-400 text-sm">
                  No scenario data yet
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'students' && (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100">
              <h3 className="font-semibold text-slate-900">Student Performance</h3>
            </div>
            {students.length === 0 ? (
              <div className="py-16 text-center text-slate-400">No student data yet</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100">
                      {['Student','Cases','Avg Score','Dx Accuracy','Last Active','Status'].map(h => (
                        <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {students.map((s: any, i: number) => (
                      <tr key={i} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-900">{s.name ?? `Student ${i+1}`}</div>
                          <div className="text-xs text-slate-400">{s.email}</div>
                        </td>
                        <td className="px-4 py-3 text-slate-700">{s.total_cases ?? 0}</td>
                        <td className="px-4 py-3">
                          <span className="font-semibold" style={{ color: SCORE_COLOR(s.average_score ?? 0) }}>
                            {(s.average_score ?? 0).toFixed(1)}%
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-700">
                          {(s.diagnosis_accuracy ?? 0).toFixed(0)}%
                        </td>
                        <td className="px-4 py-3 text-slate-500 text-xs">
                          {s.last_active ? new Date(s.last_active).toLocaleDateString() : '—'}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                            (s.average_score ?? 0) >= 70
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-amber-100 text-amber-700'
                          }`}>
                            {(s.average_score ?? 0) >= 70 ? 'On track' : 'Needs support'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeTab === 'scenarios' && (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100">
              <h3 className="font-semibold text-slate-900">Scenario Analytics</h3>
            </div>
            {scenarioStats.length === 0 ? (
              <div className="py-16 text-center text-slate-400">No scenario data yet</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100">
                      {['Scenario','Attempts','Avg Score','Dx Rate','Difficulty'].map(h => (
                        <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {scenarioStats.map((sc: any, i: number) => (
                      <tr key={i} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-900 text-xs">{sc.title}</div>
                          <div className="text-xs text-slate-400">{sc.specialty}</div>
                        </td>
                        <td className="px-4 py-3 text-slate-700">{sc.count ?? 0}</td>
                        <td className="px-4 py-3">
                          <span className="font-semibold" style={{ color: SCORE_COLOR(sc.avg_score ?? 0) }}>
                            {(sc.avg_score ?? 0).toFixed(1)}%
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-700">{(sc.diagnosis_rate ?? 0).toFixed(0)}%</td>
                        <td className="px-4 py-3">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                            sc.difficulty === 'ADVANCED' ? 'bg-red-100 text-red-700' :
                            sc.difficulty === 'INTERMEDIATE' ? 'bg-amber-100 text-amber-700' :
                            'bg-emerald-100 text-emerald-700'
                          }`}>{sc.difficulty}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

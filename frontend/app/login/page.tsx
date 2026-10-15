'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/store';
import { authApi } from '@/lib/api';
import Link from 'next/link';

export default function LoginPage() {
  const router = useRouter();
  const { isAuthenticated, setAuth, _hasHydrated } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => { if (_hasHydrated && isAuthenticated) router.push('/dashboard'); }, [isAuthenticated, _hasHydrated, router]);

  const DEMOS = [
    { label: 'Student', email: 'student@example.com', password: 'student123', color: '#2563eb' },
    { label: 'Faculty', email: 'faculty@example.com', password: 'faculty123', color: '#7c3aed' },
    { label: 'Admin',   email: 'admin@example.com',   password: 'admin123',   color: '#0891b2' },
  ];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const res = await authApi.login(email, password);
      setAuth(res.data.access_token, res.data.user);
      router.push('/dashboard');
    } catch {
      setError('Invalid credentials. Please try again.');
    } finally { setLoading(false); }
  }

  return (
    <div className="min-h-screen flex" style={{ background: '#f0f4f8' }}>

      {/* LEFT — Branding */}
      <div className="hidden lg:flex flex-col justify-between w-[44%] p-12"
        style={{ background: 'linear-gradient(145deg, #0f2340 0%, #1d4ed8 60%, #1e40af 100%)' }}>

        {/* Logo */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{ background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(8px)' }}>
            <span className="text-white text-lg font-bold">C</span>
          </div>
          <span className="text-white font-bold text-lg tracking-tight">ClinicalSim</span>
        </div>

        {/* Hero */}
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium mb-6"
            style={{ background: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.85)' }}>
            <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full"></span>
            AI-Powered Medical Education
          </div>
          <h1 className="text-4xl font-bold text-white leading-tight mb-4">
            Practice clinical reasoning.<br />
            <span style={{ color: '#93c5fd' }}>Learn through simulation.</span>
          </h1>
          <p className="text-base leading-relaxed" style={{ color: 'rgba(255,255,255,0.70)' }}>
            Immersive 3D clinical cases with realistic virtual patients. Build systematic examination skills in a safe environment.
          </p>
        </div>

        {/* Feature pills */}
        <div className="space-y-3">
          {[
            { icon: '🏥', text: '30 clinical scenarios across 12 specialties' },
            { icon: '🩺', text: 'Deterministic clinical engine — no AI hallucinations' },
            { icon: '📊', text: 'Structured debrief and competency tracking' },
          ].map((f, i) => (
            <div key={i} className="flex items-center gap-3 text-sm"
              style={{ color: 'rgba(255,255,255,0.78)' }}>
              <span className="text-base">{f.icon}</span>
              <span>{f.text}</span>
            </div>
          ))}
        </div>

        {/* Bottom */}
        <div className="text-xs" style={{ color: 'rgba(255,255,255,0.40)' }}>
          For medical education only. All patient cases are synthetic.
        </div>
      </div>

      {/* RIGHT — Login form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-sm">

          {/* Mobile logo */}
          <div className="flex items-center gap-2 mb-8 lg:hidden">
            <div className="w-8 h-8 rounded-lg bg-blue-700 flex items-center justify-center">
              <span className="text-white font-bold text-sm">C</span>
            </div>
            <span className="font-bold text-slate-900 text-lg">ClinicalSim</span>
          </div>

          <div className="mb-8">
            <h2 className="text-2xl font-bold text-slate-900">Welcome back</h2>
            <p className="text-slate-500 text-sm mt-1">Sign in to your simulation account</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5 uppercase tracking-wide">
                Email address
              </label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="you@university.edu" required
                className="w-full px-3.5 py-2.5 text-sm border rounded-xl bg-white text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                style={{ border: '1.5px solid #e2e8f0' }} />
            </div>

            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Password</label>
                <button type="button" className="text-xs text-blue-600 hover:text-blue-700">Forgot password?</button>
              </div>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                placeholder="••••••••" required
                className="w-full px-3.5 py-2.5 text-sm border rounded-xl bg-white text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                style={{ border: '1.5px solid #e2e8f0' }} />
            </div>

            {error && (
              <div className="flex items-center gap-2 px-3.5 py-2.5 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
                <span>⚠️</span><span>{error}</span>
              </div>
            )}

            <button type="submit" disabled={loading}
              className="w-full py-2.5 text-sm font-semibold text-white rounded-xl transition-all disabled:opacity-70 disabled:cursor-not-allowed"
              style={{ background: loading ? '#6b7280' : 'linear-gradient(135deg, #1d4ed8, #2563eb)' }}>
              {loading ? 'Signing in…' : 'Sign in →'}
            </button>
          </form>

          {/* Demo accounts */}
          <div className="mt-6">
            <div className="flex items-center gap-2 mb-3">
              <div className="flex-1 h-px bg-slate-200" />
              <span className="text-xs text-slate-400 font-medium">Demo accounts</span>
              <div className="flex-1 h-px bg-slate-200" />
            </div>
            <div className="grid grid-cols-3 gap-2">
              {DEMOS.map(d => (
                <button key={d.label}
                  onClick={() => { setEmail(d.email); setPassword(d.password); }}
                  className="py-2 px-2 rounded-xl text-xs font-semibold text-white transition-all hover:opacity-90 active:scale-95"
                  style={{ background: d.color }}>
                  {d.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-slate-400 text-center mt-2">Click a role to auto-fill credentials</p>
          </div>

          <p className="text-center text-sm text-slate-500 mt-6">
            Don&apos;t have an account?{' '}
            <Link href="/register" className="text-blue-600 font-semibold hover:underline">Create account</Link>
          </p>
        </div>
      </div>
    </div>
  );
}

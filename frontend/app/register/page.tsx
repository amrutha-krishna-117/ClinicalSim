'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { authApi } from '@/lib/api';
import Link from 'next/link';

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({ full_name:'', email:'', password:'', confirm:'', role:'STUDENT' });
  const [errors, setErrors] = useState<Record<string,string>>({});
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState('');

  const ROLES = [
    { id:'STUDENT', label:'Student', desc:'Practice clinical cases' },
    { id:'FACULTY', label:'Faculty', desc:'Manage and review students' },
  ];

  function validate() {
    const e: Record<string,string> = {};
    if (!form.full_name.trim()) e.full_name = 'Name is required';
    if (!form.email.includes('@')) e.email = 'Valid email required';
    if (form.password.length < 8) e.password = 'Minimum 8 characters';
    if (form.password !== form.confirm) e.confirm = 'Passwords do not match';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true); setApiError('');
    try {
      await authApi.register(form.email, form.password, form.full_name, form.role);
      router.push('/login?registered=1');
    } catch (err: any) {
      setApiError(err.response?.data?.detail ?? 'Registration failed. Please try again.');
    } finally { setLoading(false); }
  }

  const Field = ({ id, label, type='text', placeholder='', value='', error='' }: any) => (
    <div>
      <label className="block text-xs font-semibold text-slate-700 mb-1.5 uppercase tracking-wide">{label}</label>
      <input type={type} placeholder={placeholder} value={value}
        onChange={e => setForm(f => ({ ...f, [id]: e.target.value }))} required
        className={`w-full px-3.5 py-2.5 text-sm rounded-xl bg-white text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all ${error ? 'border-red-400 ring-1 ring-red-400' : 'border border-slate-200'}`} />
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </div>
  );

  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: '#f0f4f8' }}>
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
          <div className="flex items-center gap-2 mb-6">
            <div className="w-8 h-8 rounded-lg bg-blue-700 flex items-center justify-center">
              <span className="text-white font-bold text-sm">C</span>
            </div>
            <span className="font-bold text-slate-900 text-lg">ClinicalSim</span>
          </div>

          <h2 className="text-xl font-bold text-slate-900 mb-1">Create your account</h2>
          <p className="text-slate-500 text-sm mb-6">Join thousands of medical students using ClinicalSim</p>

          {/* Role selection */}
          <div className="grid grid-cols-2 gap-2 mb-5">
            {ROLES.map(r => (
              <button key={r.id} type="button" onClick={() => setForm(f => ({ ...f, role: r.id }))}
                className={`p-3 rounded-xl border text-left transition-all ${form.role === r.id ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:border-slate-300'}`}>
                <div className={`text-sm font-semibold ${form.role === r.id ? 'text-blue-700' : 'text-slate-700'}`}>{r.label}</div>
                <div className="text-xs text-slate-400 mt-0.5">{r.desc}</div>
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <Field id="full_name" label="Full name" placeholder="Dr. Jane Smith" value={form.full_name} error={errors.full_name} />
            <Field id="email" label="Email address" type="email" placeholder="jane@university.edu" value={form.email} error={errors.email} />
            <Field id="password" label="Password" type="password" placeholder="Minimum 8 characters" value={form.password} error={errors.password} />
            <Field id="confirm" label="Confirm password" type="password" placeholder="Repeat password" value={form.confirm} error={errors.confirm} />

            {apiError && (
              <div className="flex items-center gap-2 px-3.5 py-2.5 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
                <span>⚠️</span><span>{apiError}</span>
              </div>
            )}

            <button type="submit" disabled={loading}
              className="w-full py-2.5 text-sm font-semibold text-white rounded-xl transition-all disabled:opacity-70"
              style={{ background: 'linear-gradient(135deg, #1d4ed8, #2563eb)' }}>
              {loading ? 'Creating account…' : 'Create account →'}
            </button>
          </form>

          <p className="text-center text-sm text-slate-500 mt-5">
            Already have an account?{' '}
            <Link href="/login" className="text-blue-600 font-semibold hover:underline">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}

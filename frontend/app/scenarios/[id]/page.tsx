'use client';
import { useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useQuery, useMutation } from '@tanstack/react-query';
import { scenariosApi, sessionsApi } from '@/lib/api';
import { useAuthStore, useSimulationStore } from '@/lib/store';
import { Navigation } from '@/components/Navigation';
import Link from 'next/link';

const WORKFLOW_STEPS = [
  { id: 1, label: 'Greet & Introduce',      desc: 'Introduce yourself and establish rapport with the patient.' },
  { id: 2, label: 'Chief Complaint',         desc: 'Ask what brought them in today and listen to their story.' },
  { id: 3, label: 'History of Illness',      desc: 'Explore onset, character, radiation, timing, severity, modifying factors.' },
  { id: 4, label: 'Systems Review',          desc: 'Ask about related systems — cardiovascular, respiratory, GI, neuro etc.' },
  { id: 5, label: 'Past Medical History',    desc: 'Previous illnesses, hospitalisations, surgeries.' },
  { id: 6, label: 'Medications & Allergies', desc: 'Current medications, dosages, any allergies.' },
  { id: 7, label: 'Family & Social History', desc: 'Family illness, occupation, smoking, alcohol, travel.' },
  { id: 8, label: 'Physical Examination',    desc: 'Systematic examination — general, vital signs, relevant systems.' },
  { id: 9, label: 'Investigations',          desc: 'Order appropriate blood tests, imaging, ECG etc.' },
  { id: 10, label: 'Diagnosis & Plan',       desc: 'Formulate a diagnosis with differentials and management plan.' },
];

export default function ScenarioDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { isAuthenticated, _hasHydrated } = useAuthStore();
  const { setSession } = useSimulationStore();

  useEffect(() => {
    if (_hasHydrated && !isAuthenticated) router.push('/login');
  }, [isAuthenticated, _hasHydrated, router]);

  const { data: scenario, isLoading } = useQuery({
    queryKey: ['scenario', id],
    queryFn: () => scenariosApi.get(id).then(r => r.data),
    enabled: isAuthenticated && !!id,
  });

  const startMutation = useMutation({
    mutationFn: () => sessionsApi.create(id),
    onSuccess: (res) => {
      setSession(res.data.id, id);
      router.push(`/simulation/${res.data.id}`);
    },
  });

  if (!_hasHydrated || isLoading) {
    return (
      <div style={{ minHeight: '100vh', background: '#f0f4f9' }}>
        <Navigation/>
        <div style={{ textAlign: 'center', color: '#8aabca', padding: '80px 0', fontSize: 14 }}>
          Loading scenario...
        </div>
      </div>
    );
  }
  if (!scenario) return null;

  return (
    <div style={{ minHeight: '100vh', background: '#f0f4f9' }}>
      <Navigation/>
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '32px 24px' }}>
        <Link href="/scenarios" style={{ fontSize: 13, color: '#2563eb', textDecoration: 'none',
          display: 'inline-flex', alignItems: 'center', gap: 4, marginBottom: 20, fontWeight: 500 }}>
          ← Back to Scenarios
        </Link>

        {/* Header card */}
        <div style={{ borderRadius: 16, overflow: 'hidden', marginBottom: 20,
          boxShadow: '0 2px 16px rgba(13,31,53,0.10)' }}>
          <div style={{ background: 'linear-gradient(135deg,#0f2744,#1d4ed8)', padding: '28px 32px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#93c5fd',
                background: 'rgba(255,255,255,0.12)', borderRadius: 5, padding: '2px 10px' }}>
                {scenario.specialty}
              </span>
              <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 10px', borderRadius: 5,
                color: scenario.difficulty==='ADVANCED'?'#fca5a5':scenario.difficulty==='INTERMEDIATE'?'#fcd34d':'#86efac',
                background: 'rgba(255,255,255,0.10)' }}>
                {scenario.difficulty}
              </span>
            </div>
            <h1 style={{ fontSize: 26, fontWeight: 800, color: '#ffffff', marginBottom: 6 }}>
              {scenario.title}
            </h1>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.75)', lineHeight: 1.6 }}>
              {scenario.description}
            </p>
          </div>

          {/* Patient + details */}
          <div style={{ background: '#ffffff', padding: '24px 32px', display: 'grid',
            gridTemplateColumns: '1fr 1fr', gap: 24 }}>

            {/* Patient profile */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b',
                textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14 }}>
                Patient Profile
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
                <div style={{ width: 52, height: 52, borderRadius: 12,
                  background: '#eff6ff', border: '2px solid #bfdbfe',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 22 }}>
                  {scenario.patient_sex === 'female' ? '♀' : '♂'}
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 17, color: '#0d1f35' }}>
                    {scenario.patient_name ?? 'Patient'}
                  </div>
                  <div style={{ fontSize: 13, color: '#64748b', textTransform: 'capitalize' }}>
                    {scenario.patient_age} years old &middot; {scenario.patient_sex}
                  </div>
                </div>
              </div>
              <div style={{ background: '#f8fafc', borderRadius: 10, padding: '12px 14px',
                border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8',
                  textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
                  Chief Complaint
                </div>
                <div style={{ fontSize: 13, color: '#1e3a55', fontStyle: 'italic' }}>
                  "{scenario.chief_complaint}"
                </div>
              </div>
            </div>

            {/* Simulation details */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b',
                textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14 }}>
                Simulation Details
              </div>
              {[
                { label: 'Duration',   value: `${scenario.estimated_duration} minutes` },
                { label: 'Difficulty', value: scenario.difficulty },
                { label: 'Specialty',  value: scenario.specialty },
              ].map(item => (
                <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between',
                  padding: '9px 0', borderBottom: '1px solid #f1f5f9' }}>
                  <span style={{ fontSize: 13, color: '#64748b' }}>{item.label}</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#0d1f35' }}>{item.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Learning Objectives */}
        <div style={{ background: '#ffffff', borderRadius: 14, border: '1px solid #dde6f0',
          padding: '24px 28px', marginBottom: 20, boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#0d1f35', marginBottom: 14 }}>
            Learning Objectives
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {(scenario.learning_objectives ?? []).map((obj: string, i: number) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10,
                padding: '10px 14px', background: '#f0f9ff',
                border: '1px solid #bae6fd', borderRadius: 10 }}>
                <div style={{ width: 18, height: 18, borderRadius: '50%',
                  background: '#0ea5e9', color: '#fff', fontSize: 10, fontWeight: 700,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0, marginTop: 1 }}>{i+1}</div>
                <span style={{ fontSize: 12, color: '#0c4a6e', lineHeight: 1.5 }}>{obj}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Clinical Workflow — the structured flow steps */}
        <div style={{ background: '#ffffff', borderRadius: 14, border: '1px solid #dde6f0',
          padding: '24px 28px', marginBottom: 24, boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#0d1f35', marginBottom: 4 }}>
            Simulation Workflow
          </div>
          <div style={{ fontSize: 12, color: '#64748b', marginBottom: 18 }}>
            Follow these steps in order as you would in a real clinical encounter.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {WORKFLOW_STEPS.map((step, i) => (
              <div key={step.id} style={{ display: 'flex', gap: 0, alignItems: 'stretch' }}>
                {/* Timeline */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 36 }}>
                  <div style={{ width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                    background: i < 7 ? '#1d4ed8' : i < 9 ? '#0891b2' : '#7c3aed',
                    color: '#fff', fontSize: 11, fontWeight: 700,
                    display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {step.id}
                  </div>
                  {i < WORKFLOW_STEPS.length - 1 && (
                    <div style={{ width: 2, flex: 1, background: '#e2e8f0', minHeight: 12 }}/>
                  )}
                </div>
                {/* Content */}
                <div style={{ paddingLeft: 14, paddingBottom: i < WORKFLOW_STEPS.length-1 ? 14 : 0,
                  paddingTop: 2 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#0d1f35' }}>{step.label}</div>
                  <div style={{ fontSize: 11, color: '#64748b', marginTop: 2, lineHeight: 1.5 }}>
                    {step.desc}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Start button */}
        <div style={{ display: 'flex', gap: 12 }}>
          <button
            onClick={() => startMutation.mutate()}
            disabled={startMutation.isPending || !isAuthenticated}
            style={{
              flex: 1, padding: '16px 0', fontSize: 15, fontWeight: 700,
              background: startMutation.isPending ? '#93c5fd' :
                'linear-gradient(135deg,#1d4ed8,#2563eb)',
              color: '#ffffff', border: 'none', borderRadius: 12, cursor: 'pointer',
              boxShadow: '0 3px 14px rgba(37,99,235,0.40)',
              transition: 'all 0.2s',
            }}>
            {startMutation.isPending ? 'Starting simulation...' : 'Start Clinical Simulation'}
          </button>
          <Link href="/scenarios" style={{
            padding: '16px 24px', fontSize: 14, fontWeight: 600, color: '#64748b',
            background: '#ffffff', border: '1px solid #dde6f0', borderRadius: 12,
            textDecoration: 'none', display: 'flex', alignItems: 'center',
          }}>Back</Link>
        </div>

        {startMutation.isError && (
          <div style={{ marginTop: 14, padding: '14px 18px', background: '#fef2f2',
            border: '1px solid #fecaca', borderRadius: 10, textAlign: 'center' }}>
            <p style={{ fontSize: 13, color: '#b91c1c', fontWeight: 600 }}>
              Failed to start simulation.
            </p>
            <p style={{ fontSize: 11, color: '#ef4444', marginTop: 4 }}>
              {(startMutation.error as any)?.response?.data?.detail ?? 'Please try again.'}
            </p>
            <button onClick={() => startMutation.mutate()}
              style={{ marginTop: 8, fontSize: 12, color: '#b91c1c',
                background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
              Retry
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

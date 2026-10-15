'use client';
import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/lib/store';
import { sessionsApi, scenariosApi } from '@/lib/api';
import { Navigation } from '@/components/Navigation';
import Link from 'next/link';
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, Cell,
} from 'recharts';

const SCORE_COLOR = (s: number) =>
  s >= 80 ? '#16a34a' : s >= 60 ? '#d97706' : '#dc2626';

const SCORE_LABEL = (s: number) =>
  s >= 80 ? 'Excellent' : s >= 70 ? 'Good' : s >= 60 ? 'Satisfactory'
  : s >= 50 ? 'Needs Improvement' : 'Unsatisfactory';

const SCORE_BG = (s: number) =>
  s >= 80 ? 'linear-gradient(135deg,#065f46,#059669)'
  : s >= 60 ? 'linear-gradient(135deg,#78350f,#d97706)'
  : 'linear-gradient(135deg,#7f1d1d,#dc2626)';

// Per-category improvement advice
const IMPROVEMENT_ADVICE: Record<string, { tip: string; actions: string[] }> = {
  history_taking: {
    tip: 'A thorough history guides the entire clinical encounter.',
    actions: [
      'Always start with an open question — let the patient tell their story.',
      'Use SOCRATES for pain: Site, Onset, Character, Radiation, Associations, Time course, Exacerbating/relieving, Severity.',
      'Never skip social history — occupation, smoking, alcohol and travel often hold diagnostic clues.',
      'Always ask about medications, doses and allergies before examination.',
      'Screen all relevant systems even if the patient does not volunteer symptoms.',
    ],
  },
  examination: {
    tip: 'Systematic examination prevents missed findings.',
    actions: [
      'Begin every patient with a general inspection — appearance, colour, distress, posture.',
      'Always check vital signs early — they can reveal the most urgent problems.',
      'Examine the relevant system fully, not just the area of complaint.',
      'Select the correct instrument before examining — a stethoscope for auscultation, ophthalmoscope for fundi.',
      'Compare sides — asymmetry in pulses, reflexes or breath sounds is always significant.',
    ],
  },
  investigations: {
    tip: 'Order tests that will directly change your management.',
    actions: [
      'Start with basic bloods: FBC, U&E, LFTs, CRP for most presentations.',
      'Always consider ECG early in chest pain, palpitations or syncope.',
      'Order specific tests for your working diagnosis — do not order a shotgun panel.',
      'Remember to repeat troponin at 3 hours in suspected ACS.',
      'Consider imaging based on examination findings, not just symptoms.',
    ],
  },
  diagnosis_accuracy: {
    tip: 'A structured differential prevents premature closure.',
    actions: [
      'List at least 3 differentials before committing to a primary diagnosis.',
      'Consider the most dangerous diagnosis first — you must rule it out.',
      'Use the clinical triad: symptoms + examination signs + investigation results.',
      'Common things are common — start with the most likely diagnosis.',
      'If unsure, state your reasoning — partial credit is given for sound clinical thinking.',
    ],
  },
  clinical_reasoning: {
    tip: 'Documenting your reasoning shows the examiner how you think.',
    actions: [
      'State what you found, what it means, and what you will do about it.',
      'Link your history findings to your examination findings explicitly.',
      'Explain why each investigation is relevant to your differential.',
      'Acknowledge uncertainty — "this presentation could also be X because..."',
      'Write a brief management plan even if not asked — it demonstrates clinical maturity.',
    ],
  },
};

export default function AssessmentPage() {
  const { id: sessionId } = useParams<{ id: string }>();
  const router = useRouter();
  const { isAuthenticated, _hasHydrated } = useAuthStore();

  useEffect(() => {
    if (_hasHydrated && !isAuthenticated) router.push('/login');
  }, [isAuthenticated, _hasHydrated, router]);

  const { data: assessment, isLoading } = useQuery({
    queryKey: ['assessment', sessionId],
    queryFn: () => sessionsApi.getAssessment(sessionId).then(r => r.data),
    enabled: isAuthenticated && _hasHydrated && !!sessionId,
  });

  const { data: session } = useQuery({
    queryKey: ['session', sessionId],
    queryFn: () => sessionsApi.get(sessionId).then(r => r.data),
    enabled: isAuthenticated && _hasHydrated && !!sessionId,
  });

  const { data: scenario } = useQuery({
    queryKey: ['scenario', session?.scenario_id],
    queryFn: () => scenariosApi.get(session!.scenario_id).then(r => r.data),
    enabled: !!session?.scenario_id,
  });

  if (!_hasHydrated || isLoading) {
    return (
      <div style={{ minHeight: '100vh', background: '#f0f4f9' }}>
        <Navigation/>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', padding: '80px 0' }}>
          <div style={{ width: 48, height: 48, borderRadius: '50%',
            border: '3px solid #bfdbfe', borderTopColor: '#2563eb',
            animation: 'spin 0.8s linear infinite', marginBottom: 16 }}/>
          <p style={{ color: '#64748b', fontSize: 14, fontWeight: 500 }}>
            Generating your assessment report...
          </p>
        </div>
      </div>
    );
  }

  if (!assessment) return null;

  const score = assessment.total_score ?? 0;
  const breakdown = assessment.score_breakdown ?? {};
  const debrief = assessment.debriefing ?? {};

  const radarData = Object.entries(breakdown).map(([key, val]) => ({
    subject: key.replace(/_/g,' ').replace(/\b\w/g, c=>c.toUpperCase()).replace('Taking','').replace('Accuracy','').trim(),
    score: Math.round(Number(val)),
    fullMark: 100,
  }));

  const barData = Object.entries(breakdown).map(([key, val]) => ({
    key,
    name: key.replace(/_/g,' ').replace(/\b\w/g, c=>c.toUpperCase()),
    score: Math.round(Number(val)),
  }));

  // Weak areas (score < 65) — generate improvement plans
  const weakAreas = barData.filter(b => b.score < 65);
  const strongAreas = barData.filter(b => b.score >= 75);

  return (
    <div style={{ minHeight: '100vh', background: '#f0f4f9' }}>
      <Navigation/>
      <div style={{ maxWidth: 960, margin: '0 auto', padding: '32px 24px' }}>

        {/* Score header */}
        <div style={{ borderRadius: 16, overflow: 'hidden', marginBottom: 20,
          boxShadow: '0 3px 16px rgba(0,0,0,0.10)' }}>
          <div style={{ background: SCORE_BG(score), padding: '32px 36px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.7)',
                marginBottom: 6 }}>
                {scenario?.title} &middot; {scenario?.specialty}
              </div>
              <div style={{ fontSize: 52, fontWeight: 900, color: '#ffffff', lineHeight: 1 }}>
                {score.toFixed(1)}%
              </div>
              <div style={{ fontSize: 20, fontWeight: 600, color: 'rgba(255,255,255,0.90)',
                marginTop: 6 }}>
                {SCORE_LABEL(score)}
              </div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)', marginTop: 4 }}>
                {scenario?.patient_name} &middot; {scenario?.patient_age}y {scenario?.patient_sex}
              </div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ width: 96, height: 96, borderRadius: '50%',
                border: '4px solid rgba(255,255,255,0.30)',
                background: 'rgba(255,255,255,0.15)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexDirection: 'column' }}>
                <div style={{ fontSize: 28, fontWeight: 900, color: '#ffffff', lineHeight: 1 }}>
                  {Math.round(score)}
                </div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', fontWeight: 600 }}>/ 100</div>
              </div>
            </div>
          </div>

          {/* Score bar */}
          <div style={{ background: '#ffffff', padding: '16px 36px 20px' }}>
            <div style={{ width: '100%', height: 10, background: '#e2e8f0',
              borderRadius: 99, overflow: 'hidden' }}>
              <div style={{ height: '100%', borderRadius: 99, transition: 'width 1s ease',
                width: `${score}%`, background: SCORE_COLOR(score) }}/>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between',
              fontSize: 10, color: '#94a3b8', marginTop: 5, fontWeight: 600 }}>
              <span>0</span>
              <span style={{ color: '#d97706' }}>Pass (60%)</span>
              <span style={{ color: '#16a34a' }}>Excellent (80%)</span>
              <span>100</span>
            </div>
          </div>
        </div>

        {/* Charts */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
          <div style={{ background: '#ffffff', borderRadius: 14, border: '1px solid #dde6f0',
            padding: '20px 16px', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#0d1f35', marginBottom: 14 }}>
              Competency Profile
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <RadarChart data={radarData}>
                <PolarGrid stroke="#e2e8f0"/>
                <PolarAngleAxis dataKey="subject"
                  tick={{ fontSize: 10, fill: '#64748b' }}/>
                <Radar name="Score" dataKey="score"
                  stroke="#2563eb" fill="#2563eb" fillOpacity={0.18} strokeWidth={2}/>
              </RadarChart>
            </ResponsiveContainer>
          </div>

          <div style={{ background: '#ffffff', borderRadius: 14, border: '1px solid #dde6f0',
            padding: '20px 16px', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#0d1f35', marginBottom: 14 }}>
              Category Scores
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={barData} layout="vertical">
                <XAxis type="number" domain={[0,100]}
                  tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false}/>
                <YAxis type="category" dataKey="name" width={100}
                  tick={{ fontSize: 10, fill: '#64748b' }}/>
                <Bar dataKey="score" radius={[0,5,5,0]}>
                  {barData.map((entry, i) => (
                    <Cell key={i} fill={SCORE_COLOR(entry.score)}/>
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* AI Feedback */}
        {assessment.ai_feedback && (
          <div style={{ background: '#ffffff', borderRadius: 14, border: '1px solid #dde6f0',
            padding: '22px 26px', marginBottom: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#0d1f35', marginBottom: 12 }}>
              Attending Physician Feedback
            </div>
            <p style={{ fontSize: 13, color: '#334155', lineHeight: 1.8,
              whiteSpace: 'pre-line', fontStyle: 'italic' }}>
              "{assessment.ai_feedback}"
            </p>
          </div>
        )}

        {/* What went well + Areas to improve */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
          <div style={{ background: '#ffffff', borderRadius: 14,
            border: '1px solid #bbf7d0', padding: '20px 22px',
            boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#065f46', marginBottom: 12,
              display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#16a34a' }}/>
              What Went Well
            </div>
            {strongAreas.length > 0 ? (
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex',
                flexDirection: 'column', gap: 6 }}>
                {strongAreas.map((a, i) => (
                  <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8,
                    fontSize: 12, color: '#166534' }}>
                    <span style={{ color: '#16a34a', fontWeight: 700, flexShrink: 0 }}>+</span>
                    <span>Strong performance in <strong>{a.name}</strong> ({a.score}%)</span>
                  </li>
                ))}
                {(debrief.what_went_well ?? []).map((s: string, i: number) => (
                  <li key={`ww${i}`} style={{ display: 'flex', alignItems: 'flex-start', gap: 8,
                    fontSize: 12, color: '#166534' }}>
                    <span style={{ color: '#16a34a', fontWeight: 700, flexShrink: 0 }}>+</span>
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p style={{ fontSize: 12, color: '#94a3b8' }}>Complete more of the simulation to receive feedback.</p>
            )}
          </div>

          <div style={{ background: '#ffffff', borderRadius: 14,
            border: '1px solid #fed7aa', padding: '20px 22px',
            boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#7c2d12', marginBottom: 12,
              display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#d97706' }}/>
              Areas to Improve
            </div>
            {weakAreas.length > 0 ? (
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex',
                flexDirection: 'column', gap: 6 }}>
                {weakAreas.map((a, i) => (
                  <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8,
                    fontSize: 12, color: '#92400e' }}>
                    <span style={{ color: '#d97706', fontWeight: 700, flexShrink: 0 }}>△</span>
                    <span><strong>{a.name}</strong> needs work ({a.score}%)</span>
                  </li>
                ))}
                {(debrief.areas_to_improve ?? []).map((w: string, i: number) => (
                  <li key={`ai${i}`} style={{ display: 'flex', alignItems: 'flex-start', gap: 8,
                    fontSize: 12, color: '#92400e' }}>
                    <span style={{ color: '#d97706', fontWeight: 700, flexShrink: 0 }}>△</span>
                    <span>{w}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p style={{ fontSize: 12, color: '#94a3b8' }}>No major weaknesses identified.</p>
            )}
          </div>
        </div>

        {/* Specific improvement plans for weak areas */}
        {weakAreas.length > 0 && (
          <div style={{ background: '#ffffff', borderRadius: 14, border: '1px solid #dde6f0',
            padding: '22px 26px', marginBottom: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#0d1f35', marginBottom: 4 }}>
              Specific Improvement Plan
            </div>
            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 18 }}>
              Based on your performance, here is what to focus on before your next simulation.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              {weakAreas.map((area) => {
                const advice = IMPROVEMENT_ADVICE[area.key];
                if (!advice) return null;
                return (
                  <div key={area.key} style={{ borderLeft: `3px solid ${SCORE_COLOR(area.score)}`,
                    paddingLeft: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#0d1f35' }}>
                        {area.name}
                      </span>
                      <span style={{ fontSize: 11, fontWeight: 700, padding: '1px 8px',
                        borderRadius: 20, color: '#fff',
                        background: SCORE_COLOR(area.score) }}>
                        {area.score}%
                      </span>
                    </div>
                    <p style={{ fontSize: 12, color: '#475569', fontStyle: 'italic', marginBottom: 8 }}>
                      {advice.tip}
                    </p>
                    <ul style={{ listStyle: 'none', padding: 0, margin: 0,
                      display: 'flex', flexDirection: 'column', gap: 5 }}>
                      {advice.actions.map((action, i) => (
                        <li key={i} style={{ display: 'flex', gap: 10, fontSize: 12, color: '#334155' }}>
                          <span style={{ width: 18, height: 18, borderRadius: '50%',
                            background: '#f1f5f9', border: '1px solid #e2e8f0',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 10, fontWeight: 700, color: '#64748b', flexShrink: 0 }}>
                            {i+1}
                          </span>
                          <span style={{ lineHeight: 1.6 }}>{action}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Missed findings */}
        {(debrief.missed_findings ?? []).length > 0 && (
          <div style={{ background: '#ffffff', borderRadius: 14, border: '1px solid #fecaca',
            padding: '22px 26px', marginBottom: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#991b1b', marginBottom: 12 }}>
              Missed Findings
            </div>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0,
              display: 'flex', flexDirection: 'column', gap: 6 }}>
              {debrief.missed_findings.map((f: string, i: number) => (
                <li key={i} style={{ display: 'flex', gap: 10, fontSize: 12, color: '#7f1d1d' }}>
                  <span style={{ color: '#ef4444', flexShrink: 0 }}>•</span>
                  <span>{f}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Learning points */}
        {(debrief.learning_points ?? []).length > 0 && (
          <div style={{ background: '#ffffff', borderRadius: 14, border: '1px solid #bfdbfe',
            padding: '22px 26px', marginBottom: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#1e40af', marginBottom: 12 }}>
              Learning Points
            </div>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0,
              display: 'flex', flexDirection: 'column', gap: 10 }}>
              {debrief.learning_points.map((lp: string, i: number) => (
                <li key={i} style={{ display: 'flex', gap: 12, fontSize: 12, color: '#1e3a55' }}>
                  <span style={{ width: 22, height: 22, borderRadius: '50%',
                    background: '#1d4ed8', color: '#fff', fontSize: 10, fontWeight: 700,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {i+1}
                  </span>
                  <span style={{ lineHeight: 1.6 }}>{lp}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Diagnosis comparison */}
        {session?.student_diagnosis && scenario?.diagnosis && (
          <div style={{ background: '#ffffff', borderRadius: 14, border: '1px solid #dde6f0',
            padding: '22px 26px', marginBottom: 20, boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#0d1f35', marginBottom: 14 }}>
              Diagnosis Comparison
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={{ padding: '14px 16px', background: '#f8fafc',
                border: '1px solid #e2e8f0', borderRadius: 10 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8',
                  textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                  Your Diagnosis
                </div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#0d1f35' }}>
                  {session.student_diagnosis}
                </div>
              </div>
              <div style={{ padding: '14px 16px', background: '#f0fdf4',
                border: '1px solid #bbf7d0', borderRadius: 10 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#16a34a',
                  textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                  Correct Diagnosis
                </div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#065f46' }}>
                  {scenario.diagnosis}
                </div>
              </div>
            </div>
            {debrief.correct_diagnosis_explanation && (
              <p style={{ fontSize: 12, color: '#475569', lineHeight: 1.7,
                marginTop: 14, paddingTop: 14, borderTop: '1px solid #f1f5f9' }}>
                {debrief.correct_diagnosis_explanation}
              </p>
            )}
          </div>
        )}

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Link href="/scenarios" style={{
            flex: 1, minWidth: 160, padding: '14px 0', textAlign: 'center',
            fontWeight: 700, fontSize: 14, color: '#ffffff', textDecoration: 'none',
            background: 'linear-gradient(135deg,#1d4ed8,#2563eb)', borderRadius: 12,
            boxShadow: '0 2px 12px rgba(37,99,235,0.35)',
          }}>
            Try Another Case
          </Link>
          <button onClick={() => router.push(`/simulation/${sessionId}`)}
            style={{ flex: 1, minWidth: 160, padding: '14px 0', fontWeight: 600,
              fontSize: 14, color: '#2563eb', background: '#ffffff', cursor: 'pointer',
              border: '2px solid #bfdbfe', borderRadius: 12 }}>
            Replay This Case
          </button>
          <Link href="/dashboard" style={{
            flex: 1, minWidth: 160, padding: '14px 0', textAlign: 'center',
            fontWeight: 600, fontSize: 14, color: '#475569', textDecoration: 'none',
            background: '#ffffff', border: '1px solid #dde6f0', borderRadius: 12,
          }}>
            Dashboard
          </Link>
        </div>

      </div>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes bounce { 0%,100% { transform:translateY(0); } 50% { transform:translateY(-4px); } }
      `}</style>
    </div>
  );
}

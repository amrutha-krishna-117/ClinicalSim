'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { sessionsApi, scenariosApi } from '@/lib/api';
import { useAuthStore } from '@/lib/store';
import dynamic from 'next/dynamic';
import { ConversationPanel } from '@/components/ConversationPanel';
import { ExaminationPanel } from '@/components/ExaminationPanel';
import { StationPanel } from '@/components/StationPanel';
import { PoseName, poseFor } from '@/lib/poseMath';
import { InvestigationPanel } from '@/components/InvestigationPanel';
import { DiagnosisPanel } from '@/components/DiagnosisPanel';
import { InstrumentType, INSTRUMENTS, getRequiredInstrument } from '@/components/3d/ExaminationInstruments';
import Link from 'next/link';

const SimulationRoom = dynamic(
  () => import('@/components/3d/SimulationRoom').then(m => ({ default: m.SimulationRoom })),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full flex items-center justify-center"
        style={{ background: 'linear-gradient(135deg, #0f2340 0%, #1d4ed8 100%)' }}>
        <div className="text-center text-white">
          <div className="text-5xl mb-4 animate-pulse">🏥</div>
          <p className="font-semibold text-sm">Loading simulation room…</p>
          <div className="flex justify-center gap-1 mt-3">
            {[0,1,2].map(i => (
              <div key={i} className="w-2 h-2 bg-blue-300 rounded-full animate-bounce"
                style={{ animationDelay: `${i*150}ms` }} />
            ))}
          </div>
        </div>
      </div>
    ),
  }
);

type PatientPosition = 'sitting' | 'supine' | 'semi_recumbent' | 'standing';
type PatientState    = 'neutral' | 'anxious' | 'painful' | 'breathless' | 'comfortable';

const TABS = [
  { id: 'talk',       label: 'History'  },
  { id: 'examine',    label: 'Examine'  },
  { id: 'investigate',label: 'Tests'    },
  { id: 'reasoning',  label: 'Reasoning'},
  { id: 'diagnose',   label: 'Diagnose' },
];

const POSITIONS: { id: PatientPosition; label: string; icon: string }[] = [
  { id: 'supine',         label: 'Supine',         icon: '' },
  { id: 'semi_recumbent', label: 'Semi-recumbent',  icon: '' },
  { id: 'sitting',        label: 'Sitting',         icon: '' },
  { id: 'standing',       label: 'Standing',        icon: '' },
];

// Tutor AI hints — scenario-aware
const TUTOR_HINTS: Record<string, string[]> = {
  default: [
    'Start with a systematic approach: take a focused history before examining.',
    'Ask about the onset, character, radiation, and relieving/aggravating factors.',
    'Consider the most life-threatening diagnosis first.',
    'Order investigations that will directly change your management.',
  ],
  normal: [
    'This is a routine check-up — focus on systematic general examination.',
    'Check all vital signs carefully — they should be within normal limits.',
    'Examine the cardiovascular and respiratory systems thoroughly.',
    'Normal findings are equally important to document.',
  ],
  acs: [
    'URGENT: Check ECG within 10 minutes of presentation.',
    'Ask specifically about aspirin allergy — this patient has one.',
    'Troponin should be checked now and repeated at 3 hours.',
    'Assess Killip class — check for signs of heart failure.',
  ],
  anaemia: [
    'Ask about menstrual history — this is a key clue in young women.',
    'Look carefully for pallor in conjunctivae, palmar creases, and nails.',
    'Koilonychia (spoon-shaped nails) is a specific sign of iron deficiency.',
    'Order iron studies and ferritin — not just FBC.',
  ],
};

export default function SimulationPage() {
  const { id: sessionId } = useParams<{ id: string }>();
  const router = useRouter();
  const { isAuthenticated, _hasHydrated } = useAuthStore();
  const queryClient = useQueryClient();

  const [activeTab,        setActiveTab]        = useState('talk');
  const [selectedRegion,   setSelectedRegion]   = useState<string | null>(null);
  const [activeInstrument, setActiveInstrument] = useState<InstrumentType>('none');
  const [patientPosition,  setPatientPosition]  = useState<PatientPosition>('supine');
  const [examMode, setExamMode] = useState<'stations' | 'free'>('stations');
  const [pose, setPose] = useState<PoseName>('rest');
  const poseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const triggerPose = useCallback((p: PoseName, ms = 7000) => {
    setPose(p);
    if (poseTimer.current) clearTimeout(poseTimer.current);
    if (p !== 'rest') poseTimer.current = setTimeout(() => setPose('rest'), ms);   // patient relaxes afterwards
  }, []);
  const [patientState,     setPatientState]     = useState<PatientState>('neutral');
  const [showPositionMenu, setShowPositionMenu] = useState(false);
  const [showInstBar,      setShowInstBar]      = useState(false);
  const [elapsed,          setElapsed]          = useState(0);
  const [toast,            setToast]            = useState<{ msg: string; type: 'info'|'warn'|'success'|'error' } | null>(null);
  const [keyFindings,      setKeyFindings]      = useState<string[]>([]);
  const [probList,         setProbList]         = useState(['','','']);
  const [showTutor,        setShowTutor]        = useState(false);
  const [tutorHint,        setTutorHint]        = useState('');
  const [actionLog,        setActionLog]        = useState<{ time: number; text: string; type: string }[]>([]);
  const [showActionLog,    setShowActionLog]    = useState(false);
  const decompTimer = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (_hasHydrated && !isAuthenticated) router.push('/login');
  }, [isAuthenticated, _hasHydrated, router]);

  // Timer
  useEffect(() => {
    const t = setInterval(() => setElapsed(e => e + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const fmt = (s: number) =>
    `${Math.floor(s/60).toString().padStart(2,'0')}:${(s%60).toString().padStart(2,'0')}`;

  function showToast(msg: string, type: 'info'|'warn'|'success'|'error' = 'info', ms = 3500) {
    setToast({ msg, type });
    setTimeout(() => setToast(null), ms);
  }

  function logAction(text: string, type = 'action') {
    setActionLog(prev => [...prev, { time: elapsed, text, type }]);
  }

  const { data: session, refetch: refetchSession } = useQuery({
    queryKey: ['session', sessionId],
    queryFn: () => sessionsApi.get(sessionId).then(r => r.data),
    enabled: isAuthenticated && _hasHydrated && !!sessionId,
  });

  const { data: messages = [], refetch: refetchMessages } = useQuery({
    queryKey: ['messages', sessionId],
    queryFn: () => sessionsApi.getMessages(sessionId).then(r => r.data),
    enabled: isAuthenticated && _hasHydrated && !!sessionId,
  });

  const { data: scenario } = useQuery({
    queryKey: ['scenario', session?.scenario_id],
    queryFn: () => scenariosApi.get(session!.scenario_id).then(r => r.data),
    enabled: !!session?.scenario_id,
  });

  // Sync position from session/scenario
  useEffect(() => {
    if (session?.patient_position) setPatientPosition(session.patient_position as PatientPosition);
    else if (scenario?.patient_position) setPatientPosition(scenario.patient_position as PatientPosition);
  }, [session?.patient_position, scenario?.patient_position]);

  // Patient decompensation — for sick patients, state worsens after 5 min
  useEffect(() => {
    if (!scenario) return;
    const isUrgent = ['ADVANCED','INTERMEDIATE'].includes(scenario.difficulty);
    const isSick = scenario.patient_personality?.includes('pain') ||
                   scenario.patient_personality?.includes('breathless') ||
                   scenario.patient_personality?.includes('distressed');
    if (isUrgent && isSick) {
      decompTimer.current = setTimeout(() => {
        setPatientState('breathless');
        showToast('⚠️ Patient deteriorating — vital signs worsening. Act quickly!', 'warn', 6000);
        logAction('Patient deterioration noted', 'alert');
      }, 5 * 60 * 1000); // 5 minutes
    }
    return () => { if (decompTimer.current) clearTimeout(decompTimer.current); };
  }, [scenario]);

  // Tutor hint
  function getTutorHint() {
    const title = scenario?.title?.toLowerCase() ?? '';
    let bank = TUTOR_HINTS.default;
    if (title.includes('normal')) bank = TUTOR_HINTS.normal;
    else if (title.includes('coronary') || title.includes('acs')) bank = TUTOR_HINTS.acs;
    else if (title.includes('anaemia') || title.includes('anemia')) bank = TUTOR_HINTS.anaemia;
    const hint = bank[Math.floor(Math.random() * bank.length)];
    setTutorHint(hint);
    setShowTutor(true);
    logAction('Asked attending for hint', 'tutor');
  }

  const positionMutation = useMutation({
    mutationFn: (pos: PatientPosition) => sessionsApi.updatePosition(sessionId, pos),
  });

  const completeMutation = useMutation({
    mutationFn: () => sessionsApi.complete(sessionId),
    onSuccess: () => router.push(`/assessment/${sessionId}`),
  });

  const handleRegionClick = useCallback((region: string) => {
    setSelectedRegion(region);
    setActiveTab('examine');
    triggerPose(poseFor(region));
    logAction(`Selected region: ${region.replace(/_/g,' ')}`);
  }, [elapsed, triggerPose]);

  const handleInstrumentSelect = useCallback((id: InstrumentType) => {
    setActiveInstrument(prev => prev === id ? 'none' : id);
    if (id !== 'none') {
      const inst = INSTRUMENTS.find(i => i.id === id);
      showToast(`${inst?.icon ?? '🩺'} ${inst?.label ?? id} selected`, 'info', 2000);
      logAction(`Selected instrument: ${inst?.label ?? id}`);
    }
  }, [elapsed]);

  const handlePositionChange = (pos: PatientPosition) => {
    setPatientPosition(pos);
    setShowPositionMenu(false);
    positionMutation.mutate(pos);
    showToast(`Patient repositioned: ${pos.replace('_','-')}`, 'success', 2000);
    logAction(`Changed patient position: ${pos}`);
  };

  const patient = scenario ? {
    sex: scenario.patient_sex, age: scenario.patient_age,
    position: patientPosition, personality: scenario.patient_personality,
  } : { sex: 'male', age: 45, position: patientPosition, personality: 'cooperative' };

  const TOAST_COLORS: Record<string, string> = {
    info: 'rgba(15,23,42,0.92)', warn: 'rgba(120,53,15,0.95)',
    success: 'rgba(6,78,59,0.95)', error: 'rgba(127,29,29,0.95)',
  };

  if (!_hasHydrated) return null;

  return (
    <div className="h-screen flex flex-col overflow-hidden" style={{ background: '#0f172a' }}>

      {/* ── TOP BAR ─────────────────────────────── */}
      <div className="flex items-center gap-3 px-4 py-2 flex-shrink-0"
        style={{ background: '#1e293b', borderBottom: '1px solid #334155' }}>
        <Link href="/scenarios" className="text-slate-400 hover:text-white text-xs font-medium flex items-center gap-1">
          ← Exit
        </Link>
        <div className="w-px h-4 bg-slate-600" />
        <div className="flex-1 min-w-0">
          <div className="text-white font-semibold text-sm truncate">
            {scenario?.title ?? 'Clinical Simulation'}
          </div>
          {scenario && (
            <div className="text-slate-400 text-xs">
              {scenario.patient_sex === 'male' ? '♂' : '♀'} {scenario.patient_age}y
              &nbsp;·&nbsp;{scenario.chief_complaint}
              &nbsp;·&nbsp;<span className={
                scenario.difficulty === 'ADVANCED' ? 'text-red-400' :
                scenario.difficulty === 'INTERMEDIATE' ? 'text-amber-400' : 'text-emerald-400'
              }>{scenario.difficulty}</span>
            </div>
          )}
        </div>

        {/* Attending / Tutor AI button */}
        <button onClick={getTutorHint}
          className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
          style={{ background: 'rgba(124,58,237,0.25)', color: '#c4b5fd', border: '1px solid rgba(124,58,237,0.4)' }}>
          Ask Attending
        </button>

        {/* Action log */}
        <button onClick={() => setShowActionLog(!showActionLog)}
          className="hidden sm:flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-white transition-colors"
          style={{ border: '1px solid #334155' }}>
          Log ({actionLog.length})
        </button>

        <span className="font-mono text-sm text-slate-300 bg-slate-800 px-2.5 py-0.5 rounded">
          {fmt(elapsed)}
        </span>
        <span className={`text-xs px-2 py-0.5 rounded font-medium ${
          session?.status === 'COMPLETED' ? 'bg-emerald-700 text-white' : 'bg-blue-700 text-blue-100'
        }`}>
          {session?.status?.replace(/_/g,' ') ?? '…'}
        </span>
      </div>

      {/* ── MAIN AREA ───────────────────────────── */}
      <div className="flex-1 flex overflow-hidden">

        {/* ── 3D VIEWPORT ─────────────────────── */}
        <div className="flex-1 relative overflow-hidden" style={{ touchAction: 'none' }}>
          <SimulationRoom
            patient={patient}
            onRegionClick={handleRegionClick}
            selectedRegion={selectedRegion}
            activeInstrument={activeInstrument}
            onInstrumentSelect={handleInstrumentSelect}
            patientState={patientState}
            pose={pose}
          />

          {/* Patient HUD */}
          {scenario && (
            <div className="absolute top-3 left-3 pointer-events-none"
              style={{ background: 'rgba(15,23,42,0.85)', backdropFilter: 'blur(8px)',
                borderRadius: 12, padding: '10px 14px', border: '1px solid rgba(255,255,255,0.10)',
                maxWidth: 220 }}>
              <div className="text-white font-semibold text-sm">{scenario.patient_name}</div>
              <div className="text-slate-300 text-xs mt-0.5">
                {scenario.patient_age}y {scenario.patient_sex} · {patientPosition.replace('_','-')}
              </div>
              <div className="text-blue-300 text-xs mt-0.5 italic truncate">
                &quot;{scenario.chief_complaint}&quot;
              </div>
              {selectedRegion && (
                <div className="mt-1.5 pt-1.5 border-t border-slate-700 text-xs">
                  <span className="text-slate-400">Examining: </span>
                  <span className="text-sky-300 font-medium">{selectedRegion.replace(/_/g,' ')}</span>
                </div>
              )}
              {activeInstrument !== 'none' && (
                <div className="text-xs mt-0.5">
                  <span className="text-slate-400">Instrument: </span>
                  <span className="text-amber-300 font-medium">
                    {INSTRUMENTS.find(i => i.id === activeInstrument)?.label}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Active instrument badge */}
          {activeInstrument !== 'none' && (
            <div className="absolute top-3 right-3 flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium text-white"
              style={{ background: 'rgba(37,99,235,0.92)', backdropFilter: 'blur(6px)' }}>
              <span>{INSTRUMENTS.find(i => i.id === activeInstrument)?.icon}</span>
              <span>{INSTRUMENTS.find(i => i.id === activeInstrument)?.label}</span>
              <button onClick={() => setActiveInstrument('none')} className="text-blue-200 hover:text-white ml-1">✕</button>
            </div>
          )}

          {/* Tutor AI overlay */}
          {showTutor && (
            <div className="absolute top-14 right-3 max-w-xs rounded-xl p-4 shadow-xl"
              style={{ background: 'rgba(88,28,135,0.94)', backdropFilter: 'blur(10px)',
                border: '1px solid rgba(167,139,250,0.4)' }}>
              <div className="flex items-center gap-2 mb-2">
                <span>👨‍⚕️</span>
                <span className="text-violet-200 text-xs font-bold">Attending Physician</span>
                <button onClick={() => setShowTutor(false)} className="ml-auto text-violet-400 hover:text-white text-xs">✕</button>
              </div>
              <p className="text-white text-sm leading-relaxed">{tutorHint}</p>
              <button onClick={getTutorHint}
                className="mt-3 text-xs text-violet-300 hover:text-white underline">
                Give another hint
              </button>
            </div>
          )}

          {/* Action log overlay */}
          {showActionLog && (
            <div className="absolute bottom-20 left-3 w-72 max-h-64 rounded-xl overflow-hidden shadow-xl"
              style={{ background: 'rgba(15,23,42,0.95)', border: '1px solid #334155' }}>
              <div className="flex items-center justify-between px-3 py-2 border-b border-slate-700">
                <span className="text-xs font-semibold text-slate-300">Action Timeline</span>
                <button onClick={() => setShowActionLog(false)} className="text-slate-500 hover:text-white text-xs">✕</button>
              </div>
              <div className="overflow-y-auto max-h-52 p-2 space-y-1">
                {actionLog.length === 0 ? (
                  <p className="text-xs text-slate-500 text-center py-4">No actions recorded yet</p>
                ) : [...actionLog].reverse().map((a, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs py-1">
                    <span className="text-slate-500 font-mono flex-shrink-0">{fmt(a.time)}</span>
                    <span className="text-slate-300">{a.text}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Toast */}
          {toast && (
            <div className="absolute bottom-20 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full text-xs text-white font-medium max-w-xs text-center"
              style={{ background: TOAST_COLORS[toast.type], backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.12)' }}>
              {toast.msg}
            </div>
          )}

          {/* Bottom toolbar */}
          <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between gap-2">
            <div className="text-xs text-white/50 px-3 py-1.5 rounded-full pointer-events-none hidden sm:block"
              style={{ background: 'rgba(15,23,42,0.70)' }}>
              Scroll to zoom · Drag to rotate
            </div>
            <div className="flex items-center gap-2 ml-auto">
              {/* Position picker */}
              <div className="relative">
                <button onClick={() => { setShowPositionMenu(!showPositionMenu); setShowInstBar(false); }}
                  className="text-xs font-medium text-white px-3 py-1.5 rounded-full flex items-center gap-1.5"
                  style={{ background: 'rgba(15,23,42,0.85)', border: '1px solid rgba(255,255,255,0.15)' }}>
                  <span className="hidden sm:inline">{patientPosition.replace('_','-')}</span>
                  <span className="text-slate-400">&#9662;</span>
                </button>
                {showPositionMenu && (
                  <div className="absolute bottom-10 right-0 rounded-xl shadow-2xl z-20 overflow-hidden"
                    style={{ background: '#1e293b', border: '1px solid #334155', minWidth: 180 }}>
                    <div className="px-3 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wide border-b border-slate-700">
                      Patient Position
                    </div>
                    {POSITIONS.map(pos => (
                      <button key={pos.id} onClick={() => handlePositionChange(pos.id)}
                        className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 transition-colors ${
                          patientPosition === pos.id ? 'bg-blue-700 text-white' : 'text-slate-300 hover:bg-slate-700'
                        }`}>
                        <span>{pos.label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Instrument picker */}
              <div className="relative">
                <button onClick={() => { setShowInstBar(!showInstBar); setShowPositionMenu(false); }}
                  className="text-xs font-medium text-white px-3 py-1.5 rounded-full flex items-center gap-1.5"
                  style={{ background: 'rgba(15,23,42,0.85)', border: '1px solid rgba(255,255,255,0.15)' }}>
                  Instruments
                </button>
                {showInstBar && (
                  <div className="absolute bottom-10 right-0 rounded-xl shadow-2xl z-20 p-3"
                    style={{ background: '#1e293b', border: '1px solid #334155', minWidth: 240 }}>
                    <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Select Instrument</div>
                    <div className="flex flex-wrap gap-1.5">
                      {INSTRUMENTS.map(inst => (
                        <button key={inst.id} onClick={() => { handleInstrumentSelect(inst.id); setShowInstBar(false); }}
                          className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                            activeInstrument === inst.id
                              ? 'bg-blue-600 text-white border-blue-500'
                              : 'text-slate-300 border-slate-600 hover:border-blue-400 hover:text-white'
                          }`}>
                          <span>{inst.icon}</span><span>{inst.label}</span>
                        </button>
                      ))}
                      <button onClick={() => { setActiveInstrument('none'); setShowInstBar(false); }}
                        className="px-2.5 py-1.5 rounded-lg text-xs border border-slate-700 text-slate-500 hover:text-slate-300">
                        ✕ None
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── RIGHT PANEL ─────────────────────── */}
        <div className="w-80 flex flex-col flex-shrink-0"
          style={{ background: '#f8fafc', borderLeft: '1px solid #e2e8f0' }}>

          {/* Tab bar */}
          <div className="flex border-b border-slate-200 flex-shrink-0" style={{ background: '#f1f5f9' }}>
            {TABS.map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                style={{
                  flex: 1, padding: '10px 4px', fontSize: 12, fontWeight: 600,
                  border: 'none', cursor: 'pointer', transition: 'all 0.15s',
                  borderBottom: activeTab===tab.id ? '2px solid #2563eb' : '2px solid transparent',
                  color: activeTab===tab.id ? '#1d4ed8' : '#64748b',
                  background: activeTab===tab.id ? '#ffffff' : 'transparent',
                }}>
                {tab.label}
              </button>
            ))}
          </div>

          {/* Panel content */}
          <div className="flex-1 overflow-hidden">
            {activeTab === 'talk' && (
              <ConversationPanel
                sessionId={sessionId}
                messages={messages}
                onMessageSent={() => {
                  refetchMessages();
                  refetchSession();
                  logAction(`Asked patient: ${messages[messages.length-1]?.content?.slice(0,40) ?? '…'}`);
                }}
                stage="general"
                scenario={scenario}
                patientState={patientState}
              />
            )}
            {activeTab === 'examine' && session && (
              <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                <div style={{ display: 'flex', gap: 4, padding: '6px 8px', background: '#fff', borderBottom: '1px solid #e2e8f0' }}>
                  {([['stations', 'Guided stations'], ['free', 'Free examination']] as const).map(([id, label]) => (
                    <button key={id} onClick={() => setExamMode(id)}
                      style={{ flex: 1, fontSize: 11, fontWeight: 700, padding: '6px 0', borderRadius: 7, cursor: 'pointer', border: 'none',
                        background: examMode === id ? '#1d4ed8' : '#f1f5f9', color: examMode === id ? '#fff' : '#475569' }}>{label}</button>
                  ))}
                </div>
                <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
                  {examMode === 'stations' ? (
                    <StationPanel
                      sessionId={sessionId}
                      activeInstrument={activeInstrument}
                      onInstrument={handleInstrumentSelect}
                      position={patientPosition}
                      onPosition={handlePositionChange}
                      onRegion={r => setSelectedRegion(r)}
                      onPose={triggerPose}
                      onActivity={() => { refetchSession(); logAction('Completed an examination step'); }}
                    />
                  ) : (
                    <ExaminationPanel
                      sessionId={sessionId}
                      selectedRegion={selectedRegion}
                      activeInstrument={activeInstrument}
                      performedExams={session.examinations_performed ?? []}
                      revealedFindings={session.findings_revealed ?? []}
                      onRegionSelect={r => setSelectedRegion(r)}
                      onExamDone={() => {
                        refetchSession();
                        logAction(`Examined: ${selectedRegion?.replace(/_/g,' ') ?? '?'}`);
                        triggerPose(poseFor(selectedRegion));
                      }}
                      patientState={patientState}
                      onPatientStateChange={setPatientState}
                    />
                  )}
                </div>
              </div>
            )}
            {activeTab === 'investigate' && session && (
              <InvestigationPanel
                sessionId={sessionId}
                orderedInvestigations={session.investigations_ordered ?? []}
                onInvestigationDone={() => {
                  refetchSession();
                  logAction('Investigation ordered');
                }}
              />
            )}
            {activeTab === 'reasoning' && (
              <div className="p-4 h-full overflow-y-auto space-y-4">
                <div>
                  <div className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-2">Key Findings</div>
                  {keyFindings.map((f, i) => (
                    <div key={i} className="flex gap-2 mb-1.5">
                      <span className="text-xs text-slate-400 font-mono w-5 pt-2">{i+1}.</span>
                      <input value={f} onChange={e => setKeyFindings(kf => { const n=[...kf]; n[i]=e.target.value; return n; })}
                        placeholder={`Finding ${i+1}…`}
                        className="flex-1 text-xs px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white" />
                    </div>
                  ))}
                  <button onClick={() => setKeyFindings(kf => [...kf,''])} className="text-xs text-blue-600 hover:underline mt-1">+ Add finding</button>
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-2">Differentials</div>
                  {probList.map((d,i) => (
                    <div key={i} className="flex gap-2 mb-1.5 items-center">
                      <span className="text-xs text-slate-400 w-5 font-mono">{i+1}.</span>
                      <input value={d} onChange={e => setProbList(pl => { const n=[...pl]; n[i]=e.target.value; return n; })}
                        placeholder={`Differential ${i+1}…`}
                        className="flex-1 text-xs px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white" />
                    </div>
                  ))}
                  <button onClick={() => setProbList(pl => [...pl,''])} className="text-xs text-blue-600 hover:underline mt-1">+ Add</button>
                </div>
                {(session?.findings_revealed?.length ?? 0) > 0 && (
                  <div>
                    <div className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-2">Abnormal Findings</div>
                    {session!.findings_revealed.map((f: any, i: number) => (
                      <div key={i} className="text-xs px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 mb-1.5 flex gap-2">
                        <span>⚠️</span><span>{f.finding}</span>
                      </div>
                    ))}
                  </div>
                )}
                {/* Action log in reasoning tab */}
                {actionLog.length > 0 && (
                  <div>
                    <div className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-2">Timeline</div>
                    <div className="space-y-1">
                      {actionLog.map((a, i) => (
                        <div key={i} className="flex gap-2 text-xs">
                          <span className="text-slate-400 font-mono">{fmt(a.time)}</span>
                          <span className="text-slate-600">{a.text}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
            {activeTab === 'diagnose' && session && (
              <DiagnosisPanel
                sessionId={sessionId}
                currentDiagnosis={session.student_diagnosis}
                currentDifferentials={session.student_differentials ?? []}
                onDiagnosisSubmit={() => refetchSession()}
                onComplete={() => completeMutation.mutate()}
              />
            )}
          </div>

          {/* Bottom bar */}
          <div className="border-t border-slate-200 p-3 flex-shrink-0" style={{ background: '#f1f5f9' }}>
            {session?.status !== 'COMPLETED' && activeTab !== 'diagnose' && (
              <button onClick={() => setActiveTab('diagnose')}
                className="w-full py-2 text-xs font-semibold text-slate-600 border border-slate-300 rounded-lg hover:bg-white hover:text-slate-900 transition-colors mb-2">
                Submit Diagnosis
              </button>
            )}
            {session?.status === 'COMPLETED' && (
              <button onClick={() => router.push(`/assessment/${sessionId}`)}
                className="w-full py-2 text-xs font-semibold bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors mb-2">
                View Assessment
              </button>
            )}
            <div className="flex gap-3 text-xs text-slate-400 justify-center">
              <span title="Messages">Hist: {messages.length}</span>
              <span title="Examinations">Exam: {session?.examinations_performed?.length ?? 0}</span>
              <span title="Abnormal findings">Find: {session?.findings_revealed?.length ?? 0}</span>
              <span title="Investigations">Tests: {session?.investigations_ordered?.length ?? 0}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

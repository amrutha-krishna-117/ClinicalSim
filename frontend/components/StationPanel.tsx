'use client';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { sessionsApi } from '@/lib/api';
import { INSTRUMENTS, InstrumentType } from '@/components/3d/ExaminationInstruments';
import { PoseName, poseFor } from '@/lib/poseMath';

interface Step {
  id: string; title: string; how: string; kind: 'exam' | 'measure' | 'talk' | 'action';
  done: boolean; note: string; critical: boolean; instrument: string[] | null; tip: string | null;
  say: string | null; vital: string | null; site: string | null; action: string | null; targets: [string, string][] | null;
}
interface Station { id: string; title: string; summary: string; steps: Step[]; done: number; total: number; percent: number }
type Result =
  | { kind: 'finding'; finding: string; description: string; is_abnormal: boolean; clinical_significance: string; instrument_note?: string }
  | { kind: 'measure'; display: string; note: string; adequate: boolean }
  | { kind: 'say'; text: string } | { kind: 'warn'; text: string; pick?: string } | { kind: 'error'; text: string };

// examinations that need the patient in a particular position
const NEEDS_POSITION: Record<string, 'sitting' | 'semi_recumbent'> = {
  jvp: 'semi_recumbent', percuss_back: 'sitting', ausc_back: 'sitting', lung_bases: 'sitting',
};
const VITAL_REGION: Record<string, string> = {
  blood_pressure: 'right_arm', temperature: 'face', oxygen_saturation: 'hands', pulse_rate: 'radial_pulse', respiratory_rate: 'chest',
};
const instLabel = (id: string) => INSTRUMENTS.find((i) => i.id === id)?.label ?? id.replace(/_/g, ' ');
const errText = (e: any) => e?.response?.data?.detail ?? 'Something went wrong. Please try again.';

const Tick = ({ done, warn }: { done: boolean; warn?: boolean }) => (
  <div style={{ width: 18, height: 18, borderRadius: '50%', flexShrink: 0, marginTop: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: done ? '#16a34a' : '#fff', border: `2px solid ${done ? '#16a34a' : warn ? '#f59e0b' : '#cbd5e1'}` }}>
    {done && (<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 7" /></svg>)}
  </div>
);

export function StationPanel({ sessionId, activeInstrument, onInstrument, position, onPosition, onRegion, onPose, onActivity }: {
  sessionId: string;
  activeInstrument: InstrumentType;
  onInstrument: (id: InstrumentType) => void;
  position: string;
  onPosition: (p: 'sitting' | 'supine' | 'semi_recumbent' | 'standing') => void;
  onRegion: (r: string) => void;
  onPose: (p: PoseName) => void;
  onActivity: () => void;
}) {
  const qc = useQueryClient();
  const [current, setCurrent] = useState('general');
  const [results, setResults] = useState<Record<string, Result>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, { site?: string; seconds?: number }>>({});
  const [counting, setCounting] = useState<string | null>(null);

  const { data: stations = [], refetch } = useQuery<Station[]>({
    queryKey: ['stations', sessionId],
    queryFn: () => sessionsApi.stations(sessionId).then((r) => r.data),
    staleTime: 0, refetchOnMount: 'always',
  });
  const station = stations.find((s) => s.id === current) ?? stations[0];
  const nextId = station?.steps.find((s) => !s.done)?.id;

  const key = (s: Step) => `${station?.id}:${s.id}`;
  const put = (s: Step, r: Result) => setResults((p) => ({ ...p, [key(s)]: r }));
  const finish = async () => { await refetch(); qc.invalidateQueries({ queryKey: ['session', sessionId] }); onActivity(); };
  const needsInstrument = (s: Step) => !!s.instrument && !s.instrument.includes(activeInstrument);

  function ensurePosition(s: Step) {
    const want = NEEDS_POSITION[s.id];
    if (want && position !== want) onPosition(want);
  }

  async function runExam(s: Step) {
    if (needsInstrument(s)) {
      put(s, { kind: 'warn', text: `This needs the ${instLabel(s.instrument![0])}. Pick it from the instrument tray first.`, pick: s.instrument![0] });
      return;
    }
    const [region, method] = s.targets![0];
    setBusy(key(s)); ensurePosition(s); onRegion(region); onPose(poseFor(region));
    const send = s.instrument ? activeInstrument
      : s.tip && (activeInstrument === 'penlight' || activeInstrument === 'tongue_depressor') ? activeInstrument : undefined;
    try {
      const r = await sessionsApi.examine(sessionId, region, method, send && send !== 'none' ? send : undefined);
      put(s, { kind: 'finding', ...r.data });
    } catch (e) { put(s, { kind: 'error', text: errText(e) }); }
    setBusy(null); finish();
  }

  async function runMeasure(s: Step) {
    if (needsInstrument(s)) {
      put(s, { kind: 'warn', text: `This needs the ${instLabel(s.instrument![0])}. Pick it from the instrument tray first.`, pick: s.instrument![0] });
      return;
    }
    const f = form[key(s)] ?? {};
    const vital = s.vital!;
    const site = f.site ?? (vital === 'blood_pressure' ? 'right_arm' : vital === 'temperature' ? 'tympanic' : undefined);
    const seconds = f.seconds ?? (vital === 'pulse_rate' || vital === 'respiratory_rate' ? 30 : undefined);
    const region = vital === 'blood_pressure' ? site! : VITAL_REGION[vital];
    setBusy(key(s)); onRegion(region); onPose(poseFor(region));
    if (seconds) { setCounting(key(s)); await new Promise((r) => setTimeout(r, 2200)); setCounting(null); }
    try {
      const r = await sessionsApi.measure(sessionId, { vital, instrument: s.instrument ? activeInstrument : undefined, site, seconds });
      put(s, { kind: 'measure', display: r.data.display, note: r.data.note, adequate: r.data.adequate });
    } catch (e) { put(s, { kind: 'error', text: errText(e) }); }
    setBusy(null); finish();
  }

  async function runTalk(s: Step) {
    setBusy(key(s));
    try {
      const r = await sessionsApi.sendMessage(sessionId, s.say!, 'general');
      put(s, { kind: 'say', text: r.data.patient_response });
      qc.invalidateQueries({ queryKey: ['messages', sessionId] });
    } catch (e) { put(s, { kind: 'error', text: errText(e) }); }
    setBusy(null); finish();
  }

  async function runAction(s: Step) {
    setBusy(key(s));
    try { const r = await sessionsApi.action(sessionId, s.action!); put(s, { kind: 'say', text: r.data.message }); }
    catch (e) { put(s, { kind: 'error', text: errText(e) }); }
    setBusy(null); finish();
  }

  if (!station) return <div style={{ padding: 20, fontSize: 12, color: '#94a3b8' }}>Loading examination stations...</div>;

  const btn = (label: string, onClick: () => void, disabled = false, primary = true) => (
    <button onClick={onClick} disabled={disabled}
      style={{ fontSize: 11, fontWeight: 700, padding: '5px 12px', borderRadius: 7, cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.6 : 1,
        color: primary ? '#fff' : '#1d4ed8', background: primary ? '#1d4ed8' : '#eff6ff', border: primary ? 'none' : '1px solid #bfdbfe' }}>{label}</button>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#f8fafc' }}>
      {/* station chooser */}
      <div style={{ padding: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, borderBottom: '1px solid #e2e8f0', background: '#fff' }}>
        {stations.map((st) => (
          <button key={st.id} onClick={() => setCurrent(st.id)}
            style={{ textAlign: 'left', padding: '7px 9px', borderRadius: 9, cursor: 'pointer', border: `1.5px solid ${st.id === station.id ? '#2563eb' : '#e2e8f0'}`,
              background: st.id === station.id ? '#eff6ff' : '#fff' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#0d1f35', lineHeight: 1.25 }}>{st.title}</div>
            <div style={{ height: 3, background: '#e2e8f0', borderRadius: 9, marginTop: 5 }}>
              <div style={{ width: `${st.percent}%`, height: '100%', background: st.percent === 100 ? '#16a34a' : '#2563eb', borderRadius: 9 }} />
            </div>
            <div style={{ fontSize: 10, color: '#64748b', marginTop: 3 }}>{st.done}/{st.total} steps</div>
          </button>
        ))}
      </div>

      <div style={{ padding: '8px 12px', fontSize: 11, color: '#475569', background: '#fff', borderBottom: '1px solid #e2e8f0' }}>
        {station.summary} Using: <b>{activeInstrument === 'none' ? 'no instrument selected' : instLabel(activeInstrument)}</b>
      </div>

      {/* steps */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {station.steps.map((s, i) => {
          const r = results[key(s)];
          const isNext = s.id === nextId;
          const open = form[key(s)] ?? {};
          return (
            <div key={s.id} style={{ background: '#fff', borderRadius: 10, padding: '9px 11px', border: `1.5px solid ${isNext ? '#93c5fd' : '#e2e8f0'}`,
              boxShadow: isNext ? '0 0 0 3px rgba(147,197,253,.25)' : 'none' }}>
              <div style={{ display: 'flex', gap: 9 }}>
                <Tick done={s.done} warn={!!s.note} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: s.done ? '#15803d' : '#0d1f35' }}>{i + 1}. {s.title}</span>
                    {s.instrument && <span style={{ fontSize: 10, fontWeight: 700, color: '#7c3aed', background: '#f5f3ff', borderRadius: 5, padding: '1px 6px' }}>{instLabel(s.instrument[0])}</span>}
                    {isNext && <span style={{ fontSize: 10, fontWeight: 700, color: '#1d4ed8' }}>NEXT</span>}
                  </div>
                  <div style={{ fontSize: 11, color: '#64748b', marginTop: 2, lineHeight: 1.45 }}>{s.how}{s.tip ? ` ${s.tip}` : ''}</div>
                  {s.note && !s.done && <div style={{ fontSize: 11, color: '#b45309', marginTop: 3 }}>{s.note}</div>}

                  {/* controls */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 7 }}>
                    {s.kind === 'exam' && btn(s.done ? 'Repeat' : 'Examine', () => runExam(s), busy === key(s), !s.done)}
                    {s.kind === 'action' && btn(s.done ? 'Done' : 'Wash hands', () => runAction(s), busy === key(s) || s.done, !s.done)}
                    {s.kind === 'talk' && btn(s.done ? 'Said' : 'Say it', () => runTalk(s), busy === key(s) || s.done, !s.done)}
                    {s.kind === 'talk' && !s.done && <span style={{ fontSize: 10, color: '#94a3b8' }}>or say it yourself in the History tab</span>}

                    {s.kind === 'measure' && (
                      <>
                        {s.vital === 'blood_pressure' && (
                          <select value={open.site ?? 'right_arm'} onChange={(e) => setForm((p) => ({ ...p, [key(s)]: { ...open, site: e.target.value } }))} style={selStyle}>
                            <option value="right_arm">Right arm</option><option value="left_arm">Left arm</option>
                          </select>
                        )}
                        {s.vital === 'temperature' && (
                          <select value={open.site ?? 'tympanic'} onChange={(e) => setForm((p) => ({ ...p, [key(s)]: { ...open, site: e.target.value } }))} style={selStyle}>
                            <option value="tympanic">Ear</option><option value="oral">Mouth</option><option value="axilla">Armpit</option>
                          </select>
                        )}
                        {(s.vital === 'pulse_rate' || s.vital === 'respiratory_rate') && (
                          <select value={open.seconds ?? 30} onChange={(e) => setForm((p) => ({ ...p, [key(s)]: { ...open, seconds: Number(e.target.value) } }))} style={selStyle}>
                            <option value={15}>Count 15 s</option><option value={30}>Count 30 s</option><option value={60}>Count 60 s</option>
                          </select>
                        )}
                        {btn(counting === key(s) ? 'Counting...' : s.done ? 'Measure again' : 'Measure', () => runMeasure(s), busy === key(s), !s.done)}
                      </>
                    )}
                  </div>
                  {counting === key(s) && (
                    <div style={{ height: 4, background: '#e2e8f0', borderRadius: 9, marginTop: 7, overflow: 'hidden' }}>
                      <div style={{ height: '100%', background: '#2563eb', width: '100%', animation: 'cs-fill 2.2s linear' }} />
                    </div>
                  )}

                  {/* result */}
                  {r?.kind === 'finding' && (
                    <div style={{ marginTop: 8, padding: '8px 10px', borderRadius: 8, background: r.is_abnormal ? '#fffbeb' : '#f0fdf4', border: `1px solid ${r.is_abnormal ? '#fde68a' : '#bbf7d0'}` }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: r.is_abnormal ? '#92400e' : '#166534' }}>{r.finding}</div>
                      <div style={{ fontSize: 11, color: '#475569', marginTop: 2, lineHeight: 1.5 }}>{r.description}</div>
                      {r.instrument_note && <div style={{ fontSize: 11, color: '#b45309', marginTop: 3 }}>{r.instrument_note}</div>}
                    </div>
                  )}
                  {r?.kind === 'measure' && (
                    <div style={{ marginTop: 8, padding: '8px 10px', borderRadius: 8, background: r.adequate ? '#eff6ff' : '#fffbeb', border: `1px solid ${r.adequate ? '#bfdbfe' : '#fde68a'}` }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#0d1f35' }}>{r.display}</div>
                      {r.note && <div style={{ fontSize: 11, color: r.adequate ? '#475569' : '#b45309', marginTop: 2 }}>{r.note}</div>}
                    </div>
                  )}
                  {r?.kind === 'say' && <div style={{ marginTop: 8, fontSize: 11, color: '#334155', background: '#f1f5f9', borderRadius: 8, padding: '7px 10px' }}>{r.text}</div>}
                  {r?.kind === 'warn' && (
                    <div style={{ marginTop: 8, fontSize: 11, color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '7px 10px' }}>
                      {r.text}{' '}
                      {r.pick && <button onClick={() => onInstrument(r.pick as InstrumentType)} style={{ color: '#1d4ed8', fontWeight: 700, textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer', fontSize: 11 }}>Select it</button>}
                    </div>
                  )}
                  {r?.kind === 'error' && <div style={{ marginTop: 8, fontSize: 11, color: '#991b1b', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '7px 10px' }}>{r.text}</div>}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <style>{`@keyframes cs-fill { from { transform: translateX(-100%);} to { transform: translateX(0);} }`}</style>
    </div>
  );
}

const selStyle = { fontSize: 11, padding: '4px 6px', border: '1px solid #d0dce8', borderRadius: 6, background: '#fff', color: '#334155' } as const;

'use client';
import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { sessionsApi } from '@/lib/api';
import { Message } from '@/types';
import { createOutbox, OutItem } from '@/lib/outbox';
import {
  useVoiceStore, initVoice, setLang, speakPatient, stopSpeaking,
  startListening, stopListening, VoiceLang,
} from '@/lib/voice';

/** Staged shortcut questions — mirror the clinical workflow. */
const STAGES = [
  { id: 'greeting', label: 'Greeting', color: '#0ea5e9', bg: '#f0f9ff', border: '#bae6fd', qs: [
    'Hello, I am Dr. [Name]. What brings you in today?', 'Good morning. How are you feeling right now?',
    "Hello, I'm your doctor today. Can you tell me what's been bothering you?", 'Hi, please take a seat. What can I do for you today?'] },
  { id: 'complaint', label: 'Chief Complaint', color: '#2563eb', bg: '#eff6ff', border: '#bfdbfe', qs: [
    'Can you tell me more about this problem?', 'When did this first start?',
    'How would you describe the discomfort — sharp, dull, pressure, burning?', 'On a scale of 1 to 10, how severe is it right now?',
    'Does it come and go, or is it constant?'] },
  { id: 'history', label: 'History', color: '#7c3aed', bg: '#f5f3ff', border: '#ddd6fe', qs: [
    'Does anything make it better or worse?', 'Does the pain or discomfort spread anywhere else?', 'Have you had anything like this before?',
    'Any associated symptoms — nausea, vomiting, sweating, dizziness?', 'Any shortness of breath, chest tightness, or palpitations?',
    'Any changes in appetite or weight recently?', 'Any changes in your bowel or bladder habits?', 'Any cough, fever, or night sweats?'] },
  { id: 'pmh', label: 'Past Medical', color: '#0891b2', bg: '#ecfeff', border: '#a5f3fc', qs: [
    'Do you have any known medical conditions?', 'Have you ever been hospitalised or had surgery?',
    'Any history of diabetes, hypertension, or high cholesterol?', 'What medications are you currently taking?', 'Do you have any drug or food allergies?'] },
  { id: 'social', label: 'Social & Family', color: '#059669', bg: '#f0fdf4', border: '#bbf7d0', qs: [
    'Do you smoke, or have you smoked in the past?', 'How much alcohol do you drink per week?', 'What do you do for work?',
    'Is there any family history of heart disease, cancer, or diabetes?', 'Any recent travel abroad?'] },
];

const Icon = {
  mic: (c = 'currentColor') => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 11a7 7 0 0 0 14 0" /><path d="M12 18v4" /><path d="M8 22h8" /></svg>),
  stop: (c = 'currentColor') => (<svg width="14" height="14" viewBox="0 0 24 24" fill={c}><rect x="5" y="5" width="14" height="14" rx="2" /></svg>),
  speaker: (c = 'currentColor') => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 5 6 9H2v6h4l5 4V5z" /><path d="M15.5 8.5a5 5 0 0 1 0 7" /><path d="M18.5 5.5a9 9 0 0 1 0 13" /></svg>),
  list: (c = 'currentColor') => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /></svg>),
};

const timeOf = (iso?: string) => {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
};

export function ConversationPanel({ sessionId, messages, onMessageSent, stage = 'general', scenario, patientState }: {
  sessionId: string;
  messages: Message[];
  onMessageSent: () => void;
  stage?: string;
  scenario?: any;
  patientState?: string;
}) {
  const [input, setInput] = useState('');
  const [activeStage, setActiveStage] = useState<string | null>(null);
  const [started, setStarted] = useState(false);       // opening request already made
  const [opening, setOpening] = useState(false);       // opening request in flight
  const [showTranscript, setShowTranscript] = useState(false);
  const [atBottom, setAtBottom] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const voice = useVoiceStore();

  // always show the conversation in the order it happened
  const ordered = useMemo(
    () => [...messages].sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? '')),
    [messages],
  );

  /* ───────── send queue: nothing the doctor says is ever dropped ───────── */
  const latest = useRef({ sessionId, stage, onMessageSent });
  latest.current = { sessionId, stage, onMessageSent };
  const outbox = useRef(createOutbox(async (text) => {
    const { sessionId: sid, stage: stg, onMessageSent: done } = latest.current;
    await sessionsApi.sendMessage(sid, text, stg);
    done();
    await queryClient.refetchQueries({ queryKey: ['messages', sid] });   // item leaves the queue only once it is in the list
  })).current;
  const [outItems, setOutItems] = useState<OutItem[]>(outbox.getItems());
  useEffect(() => outbox.subscribe(() => setOutItems([...outbox.getItems()])), [outbox]);
  const thinking = opening || outItems.some((i) => i.status === 'sending');

  useEffect(() => { initVoice(); return () => { stopSpeaking(); stopListening(); useVoiceStore.getState().patch({ voiceMode: false }); }; }, []);

  // Patient opens the consultation (the server ignores repeats, so a reload can never duplicate it)
  useEffect(() => {
    if (started || !scenario || messages.length > 0) return;
    setStarted(true);
    setOpening(true);
    sessionsApi.sendMessage(sessionId, '[START_CONSULTATION]', 'greeting')
      .then(() => { onMessageSent(); return queryClient.refetchQueries({ queryKey: ['messages', sessionId] }); })
      .finally(() => setOpening(false));
  }, [scenario, messages.length, started]);

  /* ───────── scrolling: follow the conversation unless the doctor scrolled up ───────── */
  const onScroll = () => {
    const el = scrollRef.current;
    if (el) setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 80);
  };
  useEffect(() => { if (atBottom) bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [ordered.length, outItems.length, thinking]);

  /* ───────── voice plumbing ───────── */
  const profile = useCallback(() => ({
    sex: scenario?.patient_sex ?? 'male', age: scenario?.patient_age, personality: scenario?.patient_personality,
    state: patientState, seed: scenario?.id ?? scenario?.title ?? 'patient',
  }), [scenario, patientState]);

  const sayRef = useRef<(t: string) => void>(() => {});
  const micRef = useRef<() => void>(() => {});
  micRef.current = () => startListening({ onFinal: (text) => outbox.enqueue(text) });
  sayRef.current = (text: string) => {
    const st = useVoiceStore.getState();
    const afterSpeech = () => { if (useVoiceStore.getState().voiceMode) micRef.current(); };
    if (!st.patientVoice || !st.supportsTTS) { afterSpeech(); return; }
    stopListening();
    speakPatient(text, profile()).then(afterSpeech);
  };

  // speak each NEW patient message while voice mode is on (messages already on screen are marked as seen)
  const spoken = useRef<Set<string>>(new Set());
  useEffect(() => {
    for (const m of ordered) {
      if (m.role !== 'patient' || spoken.current.has(m.id)) continue;
      spoken.current.add(m.id);
      if (useVoiceStore.getState().voiceMode) sayRef.current(m.content);
    }
  }, [ordered]);

  function send(text: string) {
    if (!text.trim()) return;
    setInput(''); setActiveStage(null);
    stopSpeaking();
    outbox.enqueue(text);
    setAtBottom(true);
  }

  function startVoiceConsultation() {
    voice.patch({ voiceMode: true, patientVoice: true, error: null });
    const lastPatient = [...ordered].reverse().find((m) => m.role === 'patient');
    const doctorTurns = ordered.filter((m) => m.role === 'student').length;
    if (lastPatient && doctorTurns === 0) sayRef.current(lastPatient.content);
    else micRef.current();
  }
  function endVoiceConsultation() { voice.patch({ voiceMode: false }); stopSpeaking(); stopListening(); }
  function toggleMic() {
    if (voice.listening) { stopListening(); return; }
    stopSpeaking(); voice.patch({ error: null }); micRef.current();
  }

  const patientName = scenario?.patient_name ?? 'Patient';
  const first = patientName.split(' ')[0];
  const doctorTurns = ordered.filter((m) => m.role === 'student').length + outItems.length;
  const suggested = doctorTurns === 0 ? 'greeting' : doctorTurns <= 2 ? 'complaint' : doctorTurns <= 6 ? 'history' : doctorTurns <= 10 ? 'pmh' : 'social';
  const stageInfo = STAGES.find((s) => s.id === suggested);
  const total = ordered.length + outItems.length;

  const status =
    voice.listening ? 'Listening to you...' : voice.speaking ? `${first} is speaking...` :
    thinking ? `${first} is thinking...` : voice.voiceMode ? 'Your turn — speak' : 'Awaiting you';
  const statusColor = voice.listening ? '#dc2626' : voice.speaking ? '#2563eb' : thinking ? '#f59e0b' : '#22c55e';

  const copyTranscript = () => {
    const lines = ordered.map((m, i) => `${i + 1}. [${timeOf(m.created_at)}] ${m.role === 'student' ? 'Doctor' : patientName}: ${m.content}`);
    navigator.clipboard?.writeText(lines.join('\n'));
  };

  const bubble = (role: 'student' | 'patient', content: string, opts?: { dim?: boolean; failed?: boolean }) => ({
    padding: '9px 13px', borderRadius: 16, fontSize: 12, lineHeight: 1.55,
    borderBottomRightRadius: role === 'student' ? 4 : 16, borderBottomLeftRadius: role === 'patient' ? 4 : 16,
    background: opts?.failed ? '#fef2f2' : role === 'student' ? (opts?.dim ? '#6b8fe8' : '#1d4ed8') : '#f1f5f9',
    color: opts?.failed ? '#991b1b' : role === 'student' ? '#fff' : '#1e3a55',
    border: opts?.failed ? '1px solid #fecaca' : 'none',
  } as const);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#ffffff', position: 'relative' }}>
      <style>{`
        @keyframes cs-pulse { 0%,100% { box-shadow: 0 0 0 0 rgba(220,38,38,.45);} 50% { box-shadow: 0 0 0 8px rgba(220,38,38,0);} }
        @keyframes cs-bounce { 0%,100% { transform: translateY(0);} 50% { transform: translateY(-4px);} }
        @keyframes cs-bars { 0%,100% { height: 4px;} 50% { height: 14px;} }
      `}</style>

      {/* Compact header — leaves most of the panel for the conversation */}
      <div style={{ flexShrink: 0, padding: '8px 12px', borderBottom: '1px solid #e8eef5', background: '#f7fafd' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'linear-gradient(135deg,#1d4ed8,#0ea5e9)', display: 'flex',
            alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>{first[0]}</div>
          <div style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 700, color: '#0d1f35', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {patientName} <span style={{ fontWeight: 400, color: '#64748b' }}>· {scenario?.patient_age}y {scenario?.patient_sex === 'female' ? 'F' : 'M'}</span>
          </div>
          {voice.speaking ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 2, height: 14 }}>
              {[0, 120, 240, 120].map((d, i) => (<div key={i} style={{ width: 3, background: '#2563eb', borderRadius: 2, animation: 'cs-bars .7s infinite', animationDelay: `${d}ms` }} />))}
            </div>
          ) : (<div style={{ width: 7, height: 7, borderRadius: '50%', background: statusColor }} />)}
          <span style={{ fontSize: 11, color: '#64748b' }}>{status}</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 6 }}>
          {STAGES.map((s, i) => {
            const cur = STAGES.findIndex((x) => x.id === suggested);
            return <div key={s.id} style={{ flex: 1, height: 3, borderRadius: 99, background: i < cur ? '#22c55e' : i === cur ? s.color : '#e2e8f0' }} title={s.label} />;
          })}
          <span style={{ fontSize: 10, color: stageInfo?.color, fontWeight: 600, marginLeft: 6, whiteSpace: 'nowrap' }}>{stageInfo?.label}</span>
        </div>

        <div style={{ marginTop: 7, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {!voice.voiceMode ? (
            <button onClick={startVoiceConsultation} disabled={!voice.supportsSTT && !voice.supportsTTS}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', fontSize: 11, fontWeight: 700, color: '#fff',
                background: 'linear-gradient(135deg,#1d4ed8,#2563eb)', border: 'none', borderRadius: 7, cursor: 'pointer' }}>
              {Icon.mic('#fff')} Start voice consultation
            </button>
          ) : (
            <button onClick={endVoiceConsultation}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', fontSize: 11, fontWeight: 700, color: '#b91c1c',
                background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 7, cursor: 'pointer' }}>
              {Icon.stop('#b91c1c')} End voice consultation
            </button>
          )}
          <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#475569', cursor: 'pointer' }}>
            <input type="checkbox" checked={voice.patientVoice} onChange={(e) => { voice.patch({ patientVoice: e.target.checked }); if (!e.target.checked) stopSpeaking(); }} />
            Patient voice
          </label>
          <select value={voice.lang} onChange={(e) => setLang(e.target.value as VoiceLang)} title="Accent for speech recognition and voices"
            style={{ fontSize: 11, padding: '3px 4px', border: '1px solid #d0dce8', borderRadius: 6, background: '#fff', color: '#334155' }}>
            <option value="en-IN">India</option><option value="en-GB">UK</option><option value="en-US">US</option>
          </select>
          <button onClick={() => setShowTranscript(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 'auto', padding: '4px 9px', fontSize: 11, fontWeight: 600, color: '#334155',
              background: '#fff', border: '1px solid #d0dce8', borderRadius: 7, cursor: 'pointer' }}>
            {Icon.list('#334155')} Full transcript ({total})
          </button>
          {voice.speaking && (
            <button onClick={() => stopSpeaking()} style={{ fontSize: 11, color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>Skip reply</button>
          )}
        </div>
        {!voice.supportsSTT && voice.supportsTTS && (
          <div style={{ marginTop: 6, fontSize: 11, color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6, padding: '5px 8px' }}>
            Speaking to the patient needs Chrome or Edge. You can still type, and the patient will answer aloud.
          </div>
        )}
        {voice.error && (
          <div style={{ marginTop: 6, fontSize: 11, color: '#991b1b', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, padding: '5px 8px' }}>{voice.error}</div>
        )}
      </div>

      {/* Conversation */}
      <div ref={scrollRef} onScroll={onScroll} style={{ flex: 1, overflowY: 'auto', padding: '14px 14px 8px', display: 'flex', flexDirection: 'column', gap: 10, minHeight: 0, position: 'relative' }}>
        {total === 0 && !thinking && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', textAlign: 'center', padding: 20 }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: '#1e3a55', marginBottom: 4 }}>Start the consultation</p>
            <p style={{ fontSize: 11, color: '#94a3b8' }}>Press "Start voice consultation" and speak, or use the shortcuts and keyboard below.</p>
          </div>
        )}

        {ordered.map((msg) => (
          <div key={msg.id} style={{ display: 'flex', justifyContent: msg.role === 'student' ? 'flex-end' : 'flex-start', alignItems: 'flex-end', gap: 8 }}>
            {msg.role === 'patient' && (<div style={{ width: 26, height: 26, borderRadius: '50%', flexShrink: 0, background: 'linear-gradient(135deg,#1d4ed8,#0ea5e9)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 11, fontWeight: 700 }}>{first[0]}</div>)}
            <div style={{ maxWidth: '82%', display: 'flex', flexDirection: 'column', alignItems: msg.role === 'student' ? 'flex-end' : 'flex-start', gap: 2 }}>
              <div style={bubble(msg.role, msg.content)}>{msg.content}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 4px' }}>
                <span style={{ fontSize: 10, color: '#94a3b8' }}>{msg.role === 'student' ? 'You' : first} · {timeOf(msg.created_at)}</span>
                {msg.role === 'patient' && voice.supportsTTS && (
                  <button title="Hear this again" onClick={() => { stopListening(); speakPatient(msg.content, profile()); }}
                    style={{ display: 'flex', alignItems: 'center', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 0 }}>{Icon.speaker()}</button>
                )}
              </div>
            </div>
          </div>
        ))}

        {/* messages the doctor has said but that are not in the list yet — shown at once, never lost */}
        {outItems.map((it) => (
          <div key={it.id} style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <div style={{ maxWidth: '82%', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
              <div style={bubble('student', it.text, { dim: it.status === 'sending', failed: it.status === 'failed' })}>{it.text}</div>
              {it.status === 'sending' ? (
                <span style={{ fontSize: 10, color: '#94a3b8', padding: '0 4px' }}>Sending...</span>
              ) : (
                <span style={{ fontSize: 10, color: '#b91c1c', padding: '0 4px' }}>
                  Not delivered —{' '}
                  <button onClick={() => outbox.retry(it.id)} style={{ color: '#b91c1c', textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer', fontSize: 10, padding: 0 }}>retry</button>{' · '}
                  <button onClick={() => outbox.discard(it.id)} style={{ color: '#64748b', textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer', fontSize: 10, padding: 0 }}>discard</button>
                </span>
              )}
            </div>
          </div>
        ))}

        {thinking && (
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
            <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'linear-gradient(135deg,#1d4ed8,#0ea5e9)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{first[0]}</div>
            <div style={{ padding: '10px 16px', background: '#f1f5f9', borderRadius: 16, borderBottomLeftRadius: 4 }}>
              <div style={{ display: 'flex', gap: 4 }}>
                {[0, 150, 300].map((d) => (<div key={d} style={{ width: 6, height: 6, borderRadius: '50%', background: '#94a3b8', animation: 'cs-bounce 1s infinite', animationDelay: `${d}ms` }} />))}
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {!atBottom && (
        <button onClick={() => { setAtBottom(true); bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }}
          style={{ position: 'absolute', right: 16, bottom: 130, padding: '5px 12px', fontSize: 11, fontWeight: 700, color: '#fff', background: '#1d4ed8',
            border: 'none', borderRadius: 99, cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,.25)' }}>
          Jump to latest
        </button>
      )}

      {/* Shortcuts + input */}
      <div style={{ flexShrink: 0, borderTop: '1px solid #e8eef5' }}>
        <div style={{ display: 'flex', gap: 4, padding: '7px 12px 3px', overflowX: 'auto' }}>
          {STAGES.map((s) => (
            <button key={s.id} onClick={() => setActiveStage(activeStage === s.id ? null : s.id)}
              style={{ flexShrink: 0, fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20, border: 'none', cursor: 'pointer',
                background: activeStage === s.id ? s.color : suggested === s.id ? s.bg : '#f1f5f9', color: activeStage === s.id ? '#fff' : suggested === s.id ? s.color : '#64748b' }}>
              {s.label}
            </button>
          ))}
        </div>
        {activeStage && (
          <div style={{ padding: '6px 12px 8px', display: 'flex', flexWrap: 'wrap', gap: 5, maxHeight: 100, overflowY: 'auto', borderBottom: '1px solid #e8eef5' }}>
            {STAGES.find((s) => s.id === activeStage)?.qs.map((q) => {
              const s = STAGES.find((x) => x.id === activeStage)!;
              return (<button key={q} onClick={() => send(q)} style={{ fontSize: 11, padding: '5px 10px', borderRadius: 8, cursor: 'pointer', background: s.bg, color: s.color, border: `1px solid ${s.border}`, fontWeight: 500, textAlign: 'left' }}>{q}</button>);
            })}
          </div>
        )}
        {voice.listening && (
          <div style={{ margin: '8px 12px 0', padding: '7px 11px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, fontSize: 12, color: '#7f1d1d', minHeight: 20 }}>
            <span style={{ fontWeight: 700 }}>Listening: </span>{voice.interim || 'speak now...'}
          </div>
        )}
        <div style={{ padding: '8px 12px 10px', display: 'flex', gap: 8, alignItems: 'center' }}>
          <button onClick={toggleMic} disabled={!voice.supportsSTT}
            title={voice.supportsSTT ? (voice.listening ? 'Stop listening' : 'Speak to the patient') : 'Voice input needs Chrome or Edge'}
            style={{ width: 36, height: 36, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none',
              cursor: voice.supportsSTT ? 'pointer' : 'not-allowed', color: '#fff', opacity: voice.supportsSTT ? 1 : 0.4,
              background: voice.listening ? '#dc2626' : '#1d4ed8', animation: voice.listening ? 'cs-pulse 1.3s infinite' : 'none' }}>
            {voice.listening ? Icon.stop('#fff') : Icon.mic('#fff')}
          </button>
          <input type="text" value={input} onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); } }}
            placeholder={`Ask ${first}, or press the microphone...`}
            style={{ flex: 1, minWidth: 0, padding: '9px 12px', fontSize: 12, border: '1px solid #d0dce8', borderRadius: 10, background: '#f7fafd', outline: 'none', color: '#0d1f35' }} />
          <button onClick={() => send(input)} disabled={!input.trim()}
            style={{ padding: '9px 14px', background: '#1d4ed8', color: '#fff', border: 'none', borderRadius: 10, fontSize: 12, fontWeight: 600, cursor: 'pointer', opacity: !input.trim() ? 0.5 : 1 }}>Send</button>
        </div>
      </div>

      {/* Full transcript: every line of the consultation, in order, with times */}
      {showTranscript && (
        <div style={{ position: 'absolute', inset: 0, background: '#fff', zIndex: 20, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderBottom: '1px solid #e8eef5', background: '#f7fafd' }}>
            <div style={{ flex: 1, fontSize: 13, fontWeight: 700, color: '#0d1f35' }}>Full transcript <span style={{ fontWeight: 400, color: '#64748b' }}>· {total} messages</span></div>
            <button onClick={copyTranscript} style={{ fontSize: 11, fontWeight: 600, padding: '4px 10px', border: '1px solid #d0dce8', borderRadius: 6, background: '#fff', cursor: 'pointer', color: '#334155' }}>Copy</button>
            <button onClick={() => setShowTranscript(false)} style={{ fontSize: 11, fontWeight: 700, padding: '4px 12px', border: 'none', borderRadius: 6, background: '#1d4ed8', color: '#fff', cursor: 'pointer' }}>Close</button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '10px 14px' }}>
            {ordered.map((m, i) => (
              <div key={m.id} style={{ display: 'flex', gap: 8, padding: '7px 0', borderBottom: '1px solid #f1f5f9', fontSize: 12, lineHeight: 1.55 }}>
                <span style={{ width: 22, color: '#94a3b8', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{i + 1}</span>
                <span style={{ width: 62, color: '#94a3b8', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{timeOf(m.created_at)}</span>
                <span style={{ width: 54, fontWeight: 700, flexShrink: 0, color: m.role === 'student' ? '#1d4ed8' : '#0f766e' }}>{m.role === 'student' ? 'Doctor' : first}</span>
                <span style={{ color: '#1e293b' }}>{m.content}</span>
              </div>
            ))}
            {outItems.map((it) => (
              <div key={it.id} style={{ display: 'flex', gap: 8, padding: '7px 0', fontSize: 12, color: it.status === 'failed' ? '#b91c1c' : '#94a3b8' }}>
                <span style={{ width: 22 }} /><span style={{ width: 62 }}>{it.status === 'failed' ? 'failed' : 'sending'}</span>
                <span style={{ width: 54, fontWeight: 700 }}>Doctor</span><span>{it.text}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

'use client';
import { useState, useRef, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { sessionsApi } from '@/lib/api';
import { Message } from '@/types';

/**
 * Staged shortcut prompts — mirror the 10-step clinical workflow.
 * Each stage has contextually relevant questions.
 */
const STAGES = [
  {
    id: 'greeting',
    label: 'Greeting',
    color: '#0ea5e9',
    bg: '#f0f9ff',
    border: '#bae6fd',
    qs: [
      'Hello, I am Dr. [Name]. What brings you in today?',
      'Good morning. How are you feeling right now?',
      'Hello, I\'m your doctor today. Can you tell me what\'s been bothering you?',
      'Hi, please take a seat. What can I do for you today?',
    ],
  },
  {
    id: 'complaint',
    label: 'Chief Complaint',
    color: '#2563eb',
    bg: '#eff6ff',
    border: '#bfdbfe',
    qs: [
      'Can you tell me more about this problem?',
      'When did this first start?',
      'How would you describe the discomfort — sharp, dull, pressure, burning?',
      'On a scale of 1 to 10, how severe is it right now?',
      'Does it come and go, or is it constant?',
    ],
  },
  {
    id: 'history',
    label: 'History',
    color: '#7c3aed',
    bg: '#f5f3ff',
    border: '#ddd6fe',
    qs: [
      'Does anything make it better or worse?',
      'Does the pain or discomfort spread anywhere else?',
      'Have you had anything like this before?',
      'Any associated symptoms — nausea, vomiting, sweating, dizziness?',
      'Any shortness of breath, chest tightness, or palpitations?',
      'Any changes in appetite or weight recently?',
      'Any changes in your bowel or bladder habits?',
      'Any cough, fever, or night sweats?',
    ],
  },
  {
    id: 'pmh',
    label: 'Past Medical',
    color: '#0891b2',
    bg: '#ecfeff',
    border: '#a5f3fc',
    qs: [
      'Do you have any known medical conditions?',
      'Have you ever been hospitalised or had surgery?',
      'Have you ever had a heart attack, stroke, or blood clots?',
      'Any history of diabetes, hypertension, or high cholesterol?',
      'Have you ever been diagnosed with cancer?',
      'What medications are you currently taking?',
      'Do you have any drug or food allergies?',
    ],
  },
  {
    id: 'social',
    label: 'Social & Family',
    color: '#059669',
    bg: '#f0fdf4',
    border: '#bbf7d0',
    qs: [
      'Do you smoke, or have you smoked in the past?',
      'How much alcohol do you drink per week?',
      'Do you use any recreational drugs?',
      'What do you do for work?',
      'Is there any family history of heart disease, cancer, or diabetes?',
      'Are you married? Do you have children?',
      'Any recent travel abroad?',
      'How is your stress level at work and home?',
    ],
  },
];

export function ConversationPanel({ sessionId, messages, onMessageSent, stage = 'general', scenario }: {
  sessionId: string;
  messages: Message[];
  onMessageSent: () => void;
  stage?: string;
  scenario?: any;
}) {
  const [input, setInput] = useState('');
  const [activeStage, setActiveStage] = useState<string | null>(null);
  const [autoGreeted, setAutoGreeted] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const sendMutation = useMutation({
    mutationFn: (msg: string) => sessionsApi.sendMessage(sessionId, msg, stage),
    onSuccess: () => {
      onMessageSent();
      queryClient.invalidateQueries({ queryKey: ['messages', sessionId] });
    },
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auto-send greeting on first load if no messages exist
  useEffect(() => {
    if (!autoGreeted && messages.length === 0 && scenario && !sendMutation.isPending) {
      setAutoGreeted(true);
      // Patient sends the opening line — sets the scene
      // We trigger this by sending a special system message that the backend handles
      sendMutation.mutate('[START_CONSULTATION]');
    }
  }, [scenario, messages.length, autoGreeted]);

  function handleSend(msg: string) {
    const trimmed = msg.trim();
    if (!trimmed || sendMutation.isPending) return;
    setInput('');
    setActiveStage(null);
    sendMutation.mutate(trimmed);
  }

  const patientName = scenario?.patient_name ?? 'Patient';
  const patientFirstName = patientName.split(' ')[0];
  const patientInfo = scenario
    ? `${scenario.patient_age}y · ${scenario.patient_sex === 'male' ? 'Male' : 'Female'}`
    : '';

  // Determine which stage the student is in based on messages count
  const msgCount = messages.filter(m => m.role === 'student').length;
  const suggestedStage =
    msgCount === 0 ? 'greeting' :
    msgCount <= 2  ? 'complaint' :
    msgCount <= 6  ? 'history' :
    msgCount <= 10 ? 'pmh' : 'social';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#ffffff' }}>

      {/* Patient header */}
      <div style={{ flexShrink: 0, padding: '12px 16px',
        borderBottom: '1px solid #e8eef5', background: '#f7fafd' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 38, height: 38, borderRadius: '50%',
            background: 'linear-gradient(135deg,#1d4ed8,#0ea5e9)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontSize: 14, fontWeight: 700, flexShrink: 0 }}>
            {scenario?.patient_sex === 'female' ? '♀' : '♂'}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: '#0d1f35' }}>
              {patientName}
            </div>
            <div style={{ fontSize: 11, color: '#64748b' }}>{patientInfo}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%',
              background: sendMutation.isPending ? '#f59e0b' : '#22c55e',
              animation: 'pulse 2s infinite' }}/>
            <span style={{ fontSize: 11, color: '#64748b' }}>
              {sendMutation.isPending ? 'Responding...' : 'Awaiting you'}
            </span>
          </div>
        </div>

        {/* Stage progress indicator */}
        <div style={{ display: 'flex', gap: 3, marginTop: 10 }}>
          {STAGES.map(s => {
            const isActive = s.id === suggestedStage;
            const isDone = STAGES.findIndex(x=>x.id===s.id) < STAGES.findIndex(x=>x.id===suggestedStage);
            return (
              <div key={s.id} style={{ flex: 1, height: 3, borderRadius: 99,
                background: isDone ? '#22c55e' : isActive ? s.color : '#e2e8f0',
                transition: 'background 0.3s' }} title={s.label}/>
            );
          })}
        </div>
        <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 4 }}>
          Current stage: <span style={{ color: STAGES.find(s=>s.id===suggestedStage)?.color ?? '#2563eb', fontWeight: 600 }}>
            {STAGES.find(s=>s.id===suggestedStage)?.label}
          </span>
        </div>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px 8px', display: 'flex',
        flexDirection: 'column', gap: 10, minHeight: 0 }}>

        {messages.length === 0 && !sendMutation.isPending && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', height: '100%', textAlign: 'center', padding: 20 }}>
            <div style={{ width: 48, height: 48, borderRadius: '50%',
              background: '#eff6ff', border: '2px solid #bfdbfe',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 20, marginBottom: 12 }}>+</div>
            <p style={{ fontSize: 13, fontWeight: 600, color: '#1e3a55', marginBottom: 4 }}>
              Start the consultation
            </p>
            <p style={{ fontSize: 11, color: '#94a3b8' }}>
              Greet the patient to begin. Use the shortcuts below.
            </p>
          </div>
        )}

        {messages.map(msg => (
          <div key={msg.id} style={{
            display: 'flex',
            justifyContent: msg.role === 'student' ? 'flex-end' : 'flex-start',
            alignItems: 'flex-end', gap: 8,
          }}>
            {msg.role === 'patient' && (
              <div style={{ width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                background: 'linear-gradient(135deg,#1d4ed8,#0ea5e9)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', fontSize: 11, fontWeight: 700 }}>
                {patientFirstName[0]}
              </div>
            )}
            <div style={{ maxWidth: '82%', display: 'flex', flexDirection: 'column',
              alignItems: msg.role === 'student' ? 'flex-end' : 'flex-start', gap: 2 }}>
              {msg.role === 'patient' && (
                <span style={{ fontSize: 10, color: '#94a3b8', paddingLeft: 4 }}>
                  {patientFirstName}
                </span>
              )}
              <div style={{
                padding: '10px 14px', borderRadius: 16, fontSize: 12, lineHeight: 1.6,
                borderBottomRightRadius: msg.role === 'student' ? 4 : 16,
                borderBottomLeftRadius: msg.role === 'patient' ? 4 : 16,
                background: msg.role === 'student' ? '#1d4ed8' : '#f1f5f9',
                color: msg.role === 'student' ? '#ffffff' : '#1e3a55',
              }}>
                {msg.content}
              </div>
              <span style={{ fontSize: 10, color: '#cbd5e1', paddingLeft: 4, paddingRight: 4 }}>
                {msg.role === 'student' ? 'You' : 'Patient'}
              </span>
            </div>
          </div>
        ))}

        {sendMutation.isPending && (
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
            <div style={{ width: 28, height: 28, borderRadius: '50%',
              background: 'linear-gradient(135deg,#1d4ed8,#0ea5e9)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
              {patientFirstName[0]}
            </div>
            <div style={{ padding: '10px 16px', background: '#f1f5f9', borderRadius: 16,
              borderBottomLeftRadius: 4 }}>
              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                {[0,150,300].map(d=>(
                  <div key={d} style={{ width: 6, height: 6, borderRadius: '50%',
                    background: '#94a3b8', animation: 'bounce 1s infinite',
                    animationDelay: `${d}ms` }}/>
                ))}
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef}/>
      </div>

      {/* Staged shortcuts */}
      <div style={{ flexShrink: 0, borderTop: '1px solid #e8eef5' }}>

        {/* Stage selector */}
        <div style={{ display: 'flex', gap: 4, padding: '8px 12px 4px',
          overflowX: 'auto' }}>
          {STAGES.map(s => (
            <button key={s.id}
              onClick={() => setActiveStage(activeStage === s.id ? null : s.id)}
              style={{
                flexShrink: 0, fontSize: 11, fontWeight: 600, padding: '4px 10px',
                borderRadius: 20, border: 'none', cursor: 'pointer', transition: 'all 0.15s',
                background: activeStage === s.id ? s.color : (suggestedStage === s.id ? s.bg : '#f1f5f9'),
                color: activeStage === s.id ? '#fff' : (suggestedStage === s.id ? s.color : '#64748b'),
                outline: suggestedStage === s.id && activeStage !== s.id ? `2px solid ${s.color}40` : 'none',
              }}>
              {s.label}
            </button>
          ))}
        </div>

        {/* Questions for selected stage */}
        {activeStage && (
          <div style={{ padding: '6px 12px 8px', display: 'flex', flexWrap: 'wrap', gap: 5,
            maxHeight: 110, overflowY: 'auto', borderBottom: '1px solid #e8eef5' }}>
            {STAGES.find(s => s.id === activeStage)?.qs.map(q => (
              <button key={q}
                onClick={() => handleSend(q)}
                style={{
                  fontSize: 11, padding: '5px 10px', borderRadius: 8, cursor: 'pointer',
                  background: STAGES.find(s=>s.id===activeStage)?.bg,
                  color: STAGES.find(s=>s.id===activeStage)?.color,
                  border: `1px solid ${STAGES.find(s=>s.id===activeStage)?.border}`,
                  fontWeight: 500, textAlign: 'left', transition: 'opacity 0.15s',
                }}>
                {q}
              </button>
            ))}
          </div>
        )}

        {/* Input */}
        <div style={{ padding: '8px 12px 10px', display: 'flex', gap: 8 }}>
          <input ref={inputRef} type="text" value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key==='Enter' && !e.shiftKey) { e.preventDefault(); handleSend(input); }}}
            placeholder={`Ask ${patientFirstName}...`}
            disabled={sendMutation.isPending}
            style={{
              flex: 1, padding: '9px 14px', fontSize: 12,
              border: '1px solid #d0dce8', borderRadius: 10,
              background: '#f7fafd', outline: 'none', color: '#0d1f35',
            }}/>
          <button onClick={() => handleSend(input)}
            disabled={!input.trim() || sendMutation.isPending}
            style={{
              padding: '9px 16px', background: '#1d4ed8', color: '#fff',
              border: 'none', borderRadius: 10, fontSize: 12, fontWeight: 600,
              cursor: 'pointer', opacity: !input.trim() ? 0.5 : 1,
            }}>
            Send
          </button>
        </div>
      </div>
    </div>
  );
}

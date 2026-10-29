'use client';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { sessionsApi } from '@/lib/api';

const COMMON_DX = [
  'Normal healthy adult','Iron deficiency anaemia','Acute coronary syndrome',
  'NSTEMI','Aortic stenosis','Mitral regurgitation','Community-acquired pneumonia',
  'Pleural effusion','Alcoholic cirrhosis','Ischaemic stroke','Heart failure',
  'Pulmonary embolism','Pneumothorax','Meningitis','Hypertensive emergency',
  'Thalassaemia trait','Vitamin B12 deficiency','Chronic liver disease',
  'Haemorrhagic stroke','Mesothelioma',
];

interface Props {
  sessionId: string;
  currentDiagnosis: string | null;
  currentDifferentials: string[];
  onDiagnosisSubmit: () => void;
  onComplete: () => void;
}

export function DiagnosisPanel({ sessionId, currentDiagnosis, currentDifferentials, onDiagnosisSubmit, onComplete }: Props) {
  const [primaryDx, setPrimaryDx] = useState(currentDiagnosis ?? '');
  const [diffs, setDiffs] = useState<string[]>(currentDifferentials.length ? currentDifferentials : ['', '', '']);
  const [confidence, setConfidence] = useState(70);
  const [reasoning, setReasoning] = useState('');
  const [submitted, setSubmitted] = useState(!!currentDiagnosis);
  const queryClient = useQueryClient();

  const submitMutation = useMutation({
    mutationFn: () => sessionsApi.submitDiagnosis(sessionId, {
      primary_diagnosis: primaryDx,
      differentials: diffs.filter(Boolean),
      confidence,
      reasoning,
    }),
    onSuccess: () => {
      setSubmitted(true);
      onDiagnosisSubmit();
      queryClient.invalidateQueries({ queryKey: ['session', sessionId] });
    },
  });

  return (
    <div className="flex flex-col h-full overflow-y-auto p-4 space-y-4">
      <div>
        <h3 className="text-sm font-bold text-slate-800">Clinical Diagnosis</h3>
        <p className="text-xs text-slate-500 mt-0.5">Based on your history, examination and investigations.</p>
      </div>

      <div>
        <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5">Primary Diagnosis *</label>
        <input type="text" value={primaryDx} onChange={e => setPrimaryDx(e.target.value)}
          list="dx-list" disabled={submitted} placeholder="e.g. Acute coronary syndrome"
          className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50" />
        <datalist id="dx-list">{COMMON_DX.map(d => <option key={d} value={d} />)}</datalist>
      </div>

      <div>
        <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5">Differential Diagnoses</label>
        {diffs.map((d, i) => (
          <div key={i} className="flex items-center gap-2 mb-1.5">
            <span className="text-xs text-slate-400 font-mono w-5">{i+1}.</span>
            <input type="text" value={d} onChange={e => setDiffs(prev => { const n=[...prev]; n[i]=e.target.value; return n; })}
              list="dx-list" disabled={submitted} placeholder={`Alternative ${i+1}…`}
              className="flex-1 px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50" />
          </div>
        ))}
        {!submitted && (
          <button onClick={() => setDiffs(d => [...d, ''])} className="text-xs text-blue-600 hover:underline mt-0.5">+ Add differential</button>
        )}
      </div>

      <div>
        <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5">
          Confidence: <span className="text-blue-600 font-bold">{confidence}%</span>
        </label>
        <input type="range" min={10} max={100} step={5} value={confidence}
          onChange={e => setConfidence(Number(e.target.value))} disabled={submitted} className="w-full accent-blue-600" />
        <div className="flex justify-between text-xs text-slate-400 mt-0.5">
          <span>Uncertain</span><span>Moderate</span><span>Confident</span>
        </div>
      </div>

      <div>
        <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5">Clinical Reasoning</label>
        <textarea value={reasoning} onChange={e => setReasoning(e.target.value)} disabled={submitted} rows={4}
          placeholder="Key findings supporting your diagnosis, how you excluded differentials…"
          className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none disabled:bg-slate-50" />
      </div>

      {submitted ? (
        <div className="space-y-3">
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center">
            <div className="text-2xl mb-1">✅</div>
            <div className="text-sm font-semibold text-emerald-800">Diagnosis submitted</div>
            <div className="text-xs text-emerald-600 mt-0.5">{primaryDx}</div>
          </div>
          <button onClick={onComplete}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl text-sm transition-colors">
            🏁 Complete & Get Assessment
          </button>
        </div>
      ) : (
        <button onClick={() => submitMutation.mutate()}
          disabled={!primaryDx.trim() || submitMutation.isPending}
          className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl text-sm transition-colors disabled:opacity-60">
          {submitMutation.isPending ? '⏳ Submitting…' : '📤 Submit Diagnosis'}
        </button>
      )}
    </div>
  );
}

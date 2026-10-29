'use client';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { sessionsApi } from '@/lib/api';

const INVESTIGATIONS = [
  { id: 'CBC', label: 'Full Blood Count (CBC)', cat: 'Haematology', icon: '🩸', turnaround: '1–2h' },
  { id: 'BMP', label: 'Basic Metabolic Panel', cat: 'Biochemistry', icon: '🧪', turnaround: '1–2h' },
  { id: 'LFT', label: 'Liver Function Tests', cat: 'Biochemistry', icon: '🫀', turnaround: '2–4h' },
  { id: 'RFT', label: 'Renal Function Tests', cat: 'Biochemistry', icon: '🫘', turnaround: '2–4h' },
  { id: 'TROPONIN', label: 'Troponin I & T', cat: 'Cardiac', icon: '❤️', turnaround: '1h + 3h repeat' },
  { id: 'IRON_STUDIES', label: 'Iron Studies / Ferritin', cat: 'Haematology', icon: '⚙️', turnaround: '4–6h' },
  { id: 'ECG', label: 'ECG (12-lead)', cat: 'Cardiac', icon: '📈', turnaround: 'Immediate' },
  { id: 'CHEST_XRAY', label: 'Chest X-Ray', cat: 'Radiology', icon: '🔬', turnaround: '1–2h' },
  { id: 'ABG', label: 'Arterial Blood Gas', cat: 'Respiratory', icon: '💨', turnaround: 'Immediate' },
  { id: 'CT', label: 'CT Scan', cat: 'Radiology', icon: '🖥️', turnaround: '2–4h' },
  { id: 'MRI', label: 'MRI Brain', cat: 'Radiology', icon: '🧲', turnaround: '4–8h' },
  { id: 'ECHO', label: 'Echocardiogram', cat: 'Cardiac', icon: '🔊', turnaround: '24–48h' },
  { id: 'COAGULATION', label: 'Coagulation Screen', cat: 'Haematology', icon: '🩺', turnaround: '2h' },
  { id: 'THYROID', label: 'Thyroid Function Tests', cat: 'Endocrine', icon: '🦋', turnaround: '24h' },
  { id: 'BLOOD_CULTURES', label: 'Blood Cultures', cat: 'Microbiology', icon: '🦠', turnaround: '24–72h' },
  { id: 'URINALYSIS', label: 'Urinalysis', cat: 'Biochemistry', icon: '🟡', turnaround: '30min' },
];

const CATS = ['All','Haematology','Biochemistry','Cardiac','Radiology','Respiratory','Endocrine','Microbiology'];

export function InvestigationPanel({ sessionId, orderedInvestigations, onInvestigationDone }: {
  sessionId: string; orderedInvestigations: string[]; onInvestigationDone: () => void;
}) {
  const [cat, setCat] = useState('All');
  const [results, setResults] = useState<Record<string,any>>({});
  const [viewing, setViewing] = useState<string|null>(null);
  const queryClient = useQueryClient();

  const orderMutation = useMutation({
    mutationFn: (inv: string) => sessionsApi.orderInvestigation(sessionId, inv),
    onSuccess: (res, inv) => {
      setResults(p => ({ ...p, [inv]: res.data }));
      setViewing(inv);
      onInvestigationDone();
      queryClient.invalidateQueries({ queryKey: ['session', sessionId] });
    },
  });

  const filtered = INVESTIGATIONS.filter(i => cat === 'All' || i.cat === cat);

  return (
    <div className="flex flex-col h-full">
      {/* Category filter */}
      <div className="p-3 border-b border-slate-100">
        <div className="flex flex-wrap gap-1">
          {CATS.map(c => (
            <button key={c} onClick={() => setCat(c)}
              className={`text-xs px-2 py-1 rounded-lg font-medium transition-colors ${cat===c ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* Investigation list */}
      <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
        {filtered.map(inv => {
          const ordered = orderedInvestigations.includes(inv.id);
          const hasResult = !!results[inv.id];
          return (
            <div key={inv.id} className={`border rounded-xl transition-all ${ordered ? 'border-emerald-200 bg-emerald-50/50' : 'border-slate-200 bg-white'}`}>
              <div className="flex items-center gap-2 p-2.5">
                <span className="text-base">{inv.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold text-slate-900">{inv.label}</div>
                  <div className="text-xs text-slate-400">{inv.cat} · {inv.turnaround}</div>
                </div>
                <div className="flex gap-1.5">
                  {hasResult && (
                    <button onClick={() => setViewing(viewing === inv.id ? null : inv.id)}
                      className="text-xs px-2 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg hover:bg-blue-100">
                      {viewing === inv.id ? 'Hide' : 'Results'}
                    </button>
                  )}
                  <button onClick={() => !ordered && orderMutation.mutate(inv.id)}
                    disabled={ordered || orderMutation.isPending}
                    className={`text-xs px-2 py-1 rounded-lg transition-colors ${ordered ? 'bg-emerald-100 text-emerald-700 cursor-default' : 'bg-blue-600 text-white hover:bg-blue-700'}`}>
                    {ordered ? '✓' : 'Order'}
                  </button>
                </div>
              </div>

              {viewing === inv.id && results[inv.id] && (
                <div className="border-t border-slate-200 px-3 py-2.5 bg-white rounded-b-xl">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-slate-700">{inv.label} — Results</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${results[inv.id].is_appropriate ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                      {results[inv.id].is_appropriate ? '✓ Appropriate' : '⚠ Review indication'}
                    </span>
                  </div>
                  <div className="space-y-0.5">
                    {Object.entries(results[inv.id].result ?? {}).map(([k,v]) => (
                      <div key={k} className="flex justify-between text-xs py-0.5 border-b border-slate-50 last:border-0">
                        <span className="text-slate-500">{k}</span>
                        <span className={`font-mono font-semibold ${String(v).includes('HIGH')||String(v).includes('LOW')||String(v).includes('↑')||String(v).includes('↓') ? 'text-amber-700' : 'text-slate-900'}`}>{String(v)}</span>
                      </div>
                    ))}
                  </div>
                  {results[inv.id].interpretation && (
                    <p className="text-xs text-slate-600 italic mt-2 pt-2 border-t border-slate-100">{results[inv.id].interpretation}</p>
                  )}
                  {results[inv.id].feedback && (
                    <p className="text-xs text-blue-600 bg-blue-50 rounded px-2 py-1 mt-1.5">💡 {results[inv.id].feedback}</p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {orderedInvestigations.length > 0 && (
        <div className="p-3 border-t border-slate-100 bg-slate-50 text-xs text-slate-600">
          {orderedInvestigations.length} investigation(s) ordered: {orderedInvestigations.join(', ')}
        </div>
      )}
    </div>
  );
}

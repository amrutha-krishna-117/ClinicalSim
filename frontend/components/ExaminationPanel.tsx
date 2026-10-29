'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { sessionsApi } from '@/lib/api';
import { InstrumentType, INSTRUMENTS, getRequiredInstrument } from '@/components/3d/ExaminationInstruments';

const EXAM_REGIONS: Record<string, { label: string; icon: string; methods: string[]; category: string }> = {
  general:        { label: 'General Appearance', icon: '👁',  methods: ['inspect'],                               category: 'General' },
  pallor:         { label: 'Pallor',              icon: '🫧',  methods: ['inspect'],                               category: 'General' },
  jaundice:       { label: 'Jaundice/Icterus',    icon: '🟡',  methods: ['inspect'],                               category: 'General' },
  cyanosis:       { label: 'Cyanosis',            icon: '💙',  methods: ['inspect'],                               category: 'General' },
  clubbing:       { label: 'Clubbing',            icon: '👆',  methods: ['inspect'],                               category: 'General' },
  lymph_nodes:    { label: 'Lymph Nodes',         icon: '🔵',  methods: ['palpate'],                               category: 'General' },
  edema:          { label: 'Oedema',              icon: '💧',  methods: ['inspect', 'palpate'],                    category: 'General' },
  nails:          { label: 'Nails',               icon: '💅',  methods: ['inspect'],                               category: 'General' },
  tongue:         { label: 'Oral Cavity',         icon: '👅',  methods: ['inspect'],                               category: 'General' },
  eyes:           { label: 'Eyes/Pupils',         icon: '👀',  methods: ['inspect'],                               category: 'General' },
  temperature:    { label: 'Temperature',         icon: '🌡️', methods: ['measure'],                               category: 'Vitals' },
  pulse:          { label: 'Pulse',               icon: '',  methods: ['palpate', 'measure'],                    category: 'Vitals' },
  blood_pressure: { label: 'Blood Pressure',      icon: '💉',  methods: ['measure'],                               category: 'Vitals' },
  respiratory_rate:{ label: 'Resp Rate',          icon: '',  methods: ['measure'],                               category: 'Vitals' },
  oxygen_saturation:{ label: 'SpO₂',             icon: '📡',  methods: ['measure'],                               category: 'Vitals' },
  bmi:            { label: 'BMI/Weight',          icon: '📏',  methods: ['measure'],                               category: 'Vitals' },
  gcs:            { label: 'GCS',                 icon: '',  methods: ['assess'],                                category: 'Vitals' },
  left_arm:       { label: 'Left Arm/Pulse',      icon: '💪',  methods: ['inspect', 'palpate'],                    category: 'Cardiovascular' },
  right_arm:      { label: 'Right Arm/BP',        icon: '💪',  methods: ['inspect', 'palpate', 'measure'],         category: 'Cardiovascular' },
  jvp:            { label: 'JVP',                 icon: '🔎',  methods: ['inspect'],                               category: 'Cardiovascular' },
  carotid:        { label: 'Carotid Pulse',       icon: '',  methods: ['palpate', 'auscultate'],                 category: 'Cardiovascular' },
  precordium:     { label: 'Precordium',          icon: '',  methods: ['inspect', 'palpate', 'auscultate'],      category: 'Cardiovascular' },
  aortic:         { label: 'Aortic Area',         icon: '',  methods: ['auscultate'],                            category: 'Cardiovascular' },
  pulmonary:      { label: 'Pulmonary Area',      icon: '',  methods: ['auscultate'],                            category: 'Cardiovascular' },
  tricuspid:      { label: 'Tricuspid Area',      icon: '',  methods: ['auscultate'],                            category: 'Cardiovascular' },
  mitral:         { label: 'Mitral Area',         icon: '',  methods: ['auscultate'],                            category: 'Cardiovascular' },
  chest:          { label: 'Chest',               icon: '',  methods: ['inspect', 'palpate', 'percuss', 'auscultate'], category: 'Respiratory' },
  lungs:          { label: 'Lung Fields',         icon: '',  methods: ['inspect', 'palpate', 'percuss', 'auscultate'], category: 'Respiratory' },
  posterior_chest:{ label: 'Posterior Chest',     icon: '🔙',  methods: ['inspect', 'palpate', 'percuss', 'auscultate'], category: 'Respiratory' },
  abdomen:        { label: 'Abdomen',             icon: '🫃',  methods: ['inspect', 'palpate', 'percuss', 'auscultate'], category: 'Abdominal' },
  liver:          { label: 'Liver',               icon: '🟤',  methods: ['palpate', 'percuss'],                    category: 'Abdominal' },
  spleen:         { label: 'Spleen',              icon: '🔴',  methods: ['palpate', 'percuss'],                    category: 'Abdominal' },
  ascites:        { label: 'Ascites',             icon: '💦',  methods: ['palpate', 'percuss'],                    category: 'Abdominal' },
  legs:           { label: 'Legs/Feet',           icon: '',  methods: ['inspect', 'palpate'],                    category: 'Lower Limbs' },
  edema_legs:     { label: 'Ankle Oedema',        icon: '💧',  methods: ['inspect', 'palpate'],                    category: 'Lower Limbs' },
  neurological:   { label: 'Neurological',        icon: '',  methods: ['inspect', 'assess'],                     category: 'Neurology' },
  cranial_nerves: { label: 'Cranial Nerves',      icon: '🔮',  methods: ['inspect', 'assess'],                     category: 'Neurology' },
  motor:          { label: 'Motor System',        icon: '⚡',  methods: ['inspect', 'palpate', 'assess'],           category: 'Neurology' },
  reflexes:       { label: 'Reflexes',            icon: '🔨',  methods: ['assess'],                                category: 'Neurology' },
};

const METHOD_META: Record<string, { label: string; icon: string; instrument?: string }> = {
  inspect:    { label: 'Inspect',     icon: '👁' },
  palpate:    { label: 'Palpate',     icon: '✋' },
  percuss:    { label: 'Percuss',     icon: '🔨' },
  auscultate: { label: 'Auscultate',  icon: '', instrument: 'stethoscope' },
  measure:    { label: 'Measure',     icon: '📏' },
  assess:     { label: 'Assess',      icon: '📋' },
};

const CATEGORIES = ['General', 'Vitals', 'Cardiovascular', 'Respiratory', 'Abdominal', 'Lower Limbs', 'Neurology'];

interface Props {
  sessionId: string;
  selectedRegion: string | null;
  activeInstrument: InstrumentType;
  performedExams: Array<{ region: string; method: string }>;
  revealedFindings: Array<{ region: string; method: string; finding: string; is_abnormal: boolean }>;
  onRegionSelect: (r: string) => void;
  onExamDone: () => void;
  patientState: string;
  onPatientStateChange: (s: any) => void;
}

export function ExaminationPanel({
  sessionId, selectedRegion, activeInstrument, performedExams,
  revealedFindings, onRegionSelect, onExamDone, patientState, onPatientStateChange,
}: Props) {
  const [activeCategory, setActiveCategory] = useState('General');
  const [lastFinding, setLastFinding] = useState<any>(null);
  const [instrumentWarning, setInstrumentWarning] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const examMutation = useMutation({
    mutationFn: ({ region, method }: { region: string; method: string }) =>
      sessionsApi.examine(sessionId, region, method, activeInstrument !== 'none' ? activeInstrument : undefined),
    onSuccess: (res) => {
      setLastFinding(res.data);
      if (res.data.is_abnormal) {
        onPatientStateChange('painful');
        setTimeout(() => onPatientStateChange('anxious'), 2500);
      }
      onExamDone();
      queryClient.invalidateQueries({ queryKey: ['session', sessionId] });
    },
    onError: (err: any) => {
      setLastFinding({ finding: err.response?.data?.detail ?? 'Examination error', is_abnormal: false, description: '', clinical_significance: '' });
    },
  });

  const vitalsQuery = useQuery({
    queryKey: ['vitals', sessionId],
    queryFn: () => sessionsApi.getVitals(sessionId).then(r => r.data),
    enabled: false,
  });

  function handleExam(region: string, method: string) {
    const requiredInst = getRequiredInstrument(region, method);
    if (requiredInst && activeInstrument !== requiredInst && activeInstrument !== 'none') {
      const inst = INSTRUMENTS.find(i => i.id === requiredInst);
      setInstrumentWarning(`Select ${inst?.label ?? requiredInst} to ${method} ${region.replace(/_/g, ' ')}`);
      setTimeout(() => setInstrumentWarning(null), 3000);
      return;
    }
    setInstrumentWarning(null);
    examMutation.mutate({ region, method });
  }

  const isDone = (region: string, method: string) =>
    performedExams.some(e => e.region === region && e.method === method);

  const regionsByCategory = Object.entries(EXAM_REGIONS).filter(([, v]) => v.category === activeCategory);
  const currentRegion = selectedRegion && EXAM_REGIONS[selectedRegion] ? EXAM_REGIONS[selectedRegion] : null;

  return (
    <div className="flex flex-col h-full overflow-y-auto">

      {/* Vitals quick access */}
      <div className="p-3 border-b border-slate-100">
        <button onClick={() => vitalsQuery.refetch()}
          className="w-full text-left px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-lg text-xs font-medium text-emerald-700 hover:bg-emerald-100 transition-colors">
           Read bedside monitor (quick vitals, no instrument)
        </button>
        {vitalsQuery.data && (
          <div className="mt-2 grid grid-cols-2 gap-1">
            {Object.entries(vitalsQuery.data).map(([k, v]) => (
              <div key={k} className="text-xs bg-white border border-slate-200 rounded px-2 py-1">
                <span className="text-slate-400">{k.replace(/_/g,' ')}: </span>
                <span className="font-semibold text-slate-800">{String(v)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Instrument warning */}
      {instrumentWarning && (
        <div className="mx-3 mt-2 text-xs bg-amber-50 border border-amber-300 text-amber-800 rounded-lg px-3 py-2">
          💡 {instrumentWarning}
        </div>
      )}

      {/* Active region actions — shown when 3D region clicked */}
      {currentRegion && (
        <div className="p-3 border-b border-slate-100 bg-blue-50">
          <div className="text-xs font-bold text-blue-900 mb-2">
            {currentRegion.icon} {currentRegion.label}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {currentRegion.methods.map(method => {
              const done = isDone(selectedRegion!, method);
              const m = METHOD_META[method];
              const needsInst = getRequiredInstrument(selectedRegion!, method);
              return (
                <button key={method} onClick={() => handleExam(selectedRegion!, method)}
                  disabled={examMutation.isPending}
                  className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    done ? 'bg-emerald-50 text-emerald-700 border-emerald-200 cursor-default'
                    : 'bg-white text-slate-700 border-slate-300 hover:bg-blue-100 hover:border-blue-400 hover:text-blue-700'
                  }`}>
                  {m.icon} {m.label}
                  {needsInst && <span className="text-slate-400 text-xs">()</span>}
                  {done && <span className="text-emerald-500">✓</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Category tabs */}
      <div className="px-3 pt-3 pb-1">
        <div className="flex flex-wrap gap-1">
          {CATEGORIES.map(cat => (
            <button key={cat} onClick={() => setActiveCategory(cat)}
              className={`text-xs px-2 py-1 rounded-lg font-medium transition-colors ${
                activeCategory === cat ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}>
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Region list */}
      <div className="p-3 space-y-1 flex-1 overflow-y-auto">
        {regionsByCategory.map(([key, info]) => {
          const anyDone = performedExams.some(e => e.region === key);
          const isActive = selectedRegion === key;
          return (
            <div key={key} className={`border rounded-xl transition-all ${
              isActive ? 'border-blue-400 bg-blue-50' : anyDone ? 'border-emerald-200 bg-emerald-50/40' : 'border-slate-200 bg-white'
            }`}>
              <button className="w-full text-left px-3 py-2 flex items-center gap-2"
                onClick={() => onRegionSelect(key)}>
                <span>{info.icon}</span>
                <span className="text-xs font-semibold text-slate-800 flex-1">{info.label}</span>
                {anyDone && <span className="text-emerald-500 text-xs">✓</span>}
                <span className="text-slate-300 text-xs">{isActive ? '▾' : '▸'}</span>
              </button>

              {isActive && (
                <div className="px-3 pb-2 flex flex-wrap gap-1.5">
                  {info.methods.map(method => {
                    const done = isDone(key, method);
                    const m = METHOD_META[method];
                    return (
                      <button key={method} onClick={() => handleExam(key, method)}
                        disabled={examMutation.isPending}
                        className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs border transition-colors ${
                          done ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-white text-slate-600 border-slate-200 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-700'
                        }`}>
                        {m.icon} {m.label} {done && '✓'}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Last finding */}
      {lastFinding && (
        <div className={`mx-3 mb-3 p-3 rounded-xl border text-xs ${
          lastFinding.is_abnormal ? 'bg-amber-50 border-amber-200' : 'bg-emerald-50 border-emerald-200'
        }`}>
          <div className="font-bold text-slate-900 mb-0.5">{lastFinding.finding}</div>
          <p className="text-slate-600 leading-relaxed">{lastFinding.description}</p>
          {lastFinding.clinical_significance && (
            <p className="text-slate-500 mt-1 italic">↳ {lastFinding.clinical_significance}</p>
          )}
        </div>
      )}

      {/* Findings summary */}
      {revealedFindings.length > 0 && (
        <div className="px-3 pb-3">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
            Abnormal Findings ({revealedFindings.length})
          </div>
          <div className="space-y-1">
            {revealedFindings.map((f, i) => (
              <div key={i} className="text-xs px-2.5 py-1.5 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg flex gap-1.5">
                <span>⚠️</span><span>{f.finding}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

'use client';
/**
 * Browser speech layer for the doctor <-> patient voice consultation.
 *  - Doctor (student) speaks  -> SpeechRecognition (Chrome / Edge)  -> text sent as the question
 *  - Patient replies          -> speechSynthesis                    -> spoken aloud, voice matched to the patient
 * No API keys. Speech-to-text in Chrome streams audio to Google, so it needs internet.
 */
import { create } from 'zustand';
import {
  ageAdjust, pickVoice, splitSegments, styleFor, STYLE_PARAMS,
} from './voiceUtils';

export type VoiceLang = 'en-IN' | 'en-GB' | 'en-US';

interface VoiceState {
  voiceMode: boolean;     // hands-free consultation running
  patientVoice: boolean;  // patient replies are spoken
  listening: boolean;
  speaking: boolean;      // also read by the 3D patient to move the jaw
  interim: string;
  lang: VoiceLang;
  error: string | null;
  supportsSTT: boolean;
  supportsTTS: boolean;
  patch: (p: Partial<Omit<VoiceState, 'patch'>>) => void;
}

const LANG_KEY = 'clinicalsim-voice-lang';

export const useVoiceStore = create<VoiceState>((set) => ({
  voiceMode: false, patientVoice: true, listening: false, speaking: false,
  interim: '', lang: 'en-IN', error: null, supportsSTT: false, supportsTTS: false,
  patch: (p) => set(p),
}));

/** Call once on the client to detect browser support and restore the saved accent. */
export function initVoice() {
  if (typeof window === 'undefined') return;
  const w = window as any;
  const saved = localStorage.getItem(LANG_KEY) as VoiceLang | null;
  useVoiceStore.getState().patch({
    supportsSTT: !!(w.SpeechRecognition || w.webkitSpeechRecognition),
    supportsTTS: 'speechSynthesis' in window,
    ...(saved ? { lang: saved } : {}),
  });
  if ('speechSynthesis' in window) loadVoices();
}

export function setLang(lang: VoiceLang) {
  localStorage.setItem(LANG_KEY, lang);
  useVoiceStore.getState().patch({ lang });
}

/* ───────────── speaking (patient) ───────────── */
let voices: SpeechSynthesisVoice[] = [];
function loadVoices() {
  voices = window.speechSynthesis.getVoices();
  window.speechSynthesis.onvoiceschanged = () => { voices = window.speechSynthesis.getVoices(); };
}

let run = 0; // cancels an in-flight utterance chain

export function stopSpeaking() {
  run++;
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel();
  useVoiceStore.getState().patch({ speaking: false });
}

export interface PatientVoiceProfile {
  sex: string; age?: number; personality?: string; state?: string; seed: string;
}

export function speakPatient(text: string, p: PatientVoiceProfile): Promise<void> {
  return new Promise((resolve) => {
    const st = useVoiceStore.getState();
    if (typeof window === 'undefined' || !st.supportsTTS) return resolve();
    if (!voices.length) voices = window.speechSynthesis.getVoices();

    window.speechSynthesis.cancel();
    const my = ++run;
    const segs = splitSegments(text);
    if (!segs.length) return resolve();

    const style = STYLE_PARAMS[styleFor(p.personality, p.state)];
    const age = ageAdjust(p.age, p.sex);
    const { voice, mismatch } = pickVoice(voices, p.sex, st.lang, p.seed);
    const pitch = Math.min(2, Math.max(0.1, style.pitch * age.pitch * (mismatch && p.sex !== 'female' ? 0.7 : 1)));
    const rate = Math.min(2, Math.max(0.5, style.rate * age.rate));

    useVoiceStore.getState().patch({ speaking: true });
    const finish = () => {
      if (run === my) useVoiceStore.getState().patch({ speaking: false });
      resolve();
    };

    const next = (i: number) => {
      if (run !== my) return resolve();
      if (i >= segs.length) return finish();
      const u = new SpeechSynthesisUtterance(segs[i]);
      if (voice) { u.voice = voice; u.lang = voice.lang; } else u.lang = st.lang;
      u.rate = rate; u.pitch = pitch; u.volume = 1;
      const done = () => setTimeout(() => next(i + 1), i < segs.length - 1 ? style.gap : 0);
      u.onend = done;
      u.onerror = (e: SpeechSynthesisErrorEvent) => {
        if (e.error === 'not-allowed') {
          useVoiceStore.getState().patch({ error: 'The browser blocked the patient voice. Click "Start voice consultation" once, then try again.' });
          return finish();
        }
        if (e.error === 'interrupted' || e.error === 'canceled') return resolve();
        done();
      };
      window.speechSynthesis.speak(u);
    };
    next(0);
  });
}

/* ───────────── listening (doctor) ───────────── */
let rec: any = null;

export interface ListenHandlers {
  onFinal: (text: string) => void;
}

const ERRORS: Record<string, string> = {
  'not-allowed': 'Microphone access is blocked. Allow the microphone for localhost in the browser address bar, then try again.',
  'service-not-allowed': 'Microphone access is blocked. Allow the microphone for localhost in the browser address bar, then try again.',
  'audio-capture': 'No microphone found. Plug one in or choose another input in system settings.',
  network: 'Speech recognition needs an internet connection (Chrome sends the audio to Google).',
  'no-speech': "I didn't hear anything. Tap the microphone and speak again.",
  'language-not-supported': 'This browser does not support that language for speech input.',
};

export function stopListening() {
  try { rec?.abort(); } catch { /* already stopped */ }
  rec = null;
  useVoiceStore.getState().patch({ listening: false, interim: '' });
}

export function startListening({ onFinal }: ListenHandlers) {
  const w = window as any;
  const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
  const patch = useVoiceStore.getState().patch;
  if (!Ctor) { patch({ error: 'Voice input needs Chrome or Edge. You can still type your questions.' }); return; }

  stopSpeaking();           // never listen to the patient's own voice
  try { rec?.abort(); } catch { /* ignore */ }

  const r = new Ctor();
  rec = r;
  r.lang = useVoiceStore.getState().lang;
  r.interimResults = true;
  r.continuous = false;
  r.maxAlternatives = 1;

  let finalText = '';
  r.onstart = () => patch({ listening: true, error: null, interim: '' });
  r.onresult = (e: any) => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const t = e.results[i][0].transcript;
      if (e.results[i].isFinal) finalText += t; else interim += t;
    }
    patch({ interim: (finalText + ' ' + interim).trim() });
  };
  r.onerror = (e: any) => {
    if (e.error === 'aborted') return;
    patch({ error: ERRORS[e.error] ?? `Speech recognition error: ${e.error}` });
  };
  r.onend = () => {
    if (rec === r) rec = null;
    patch({ listening: false, interim: '' });
    const text = finalText.trim();
    if (text) onFinal(text);
  };
  try { r.start(); } catch { patch({ listening: false }); }
}

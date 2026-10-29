/**
 * Pure speech helpers (no browser APIs) so they can be unit-tested.
 * - styleFor:      how this patient talks (calm / anxious / in pain / drowsy / breathless)
 * - pickVoice:     choose a male or female voice, stable per patient
 * - cleanForSpeech / splitSegments: turn chat text into natural spoken phrases
 */
export type SpeechStyle = 'calm' | 'anxious' | 'pain' | 'slow' | 'breathless';

export function styleFor(personality?: string, state?: string): SpeechStyle {
  if (state === 'breathless') return 'breathless';
  const p = (personality ?? '').toLowerCase();
  if (p.includes('breathless')) return 'breathless';
  if (/(drowsy|confused|lethargic|slow|flat|quiet)/.test(p)) return 'slow';
  if (p.includes('pain') || state === 'painful') return 'pain';
  if (/(anxious|frightened|distressed|scared)/.test(p) || state === 'anxious') return 'anxious';
  return 'calm';
}

/** rate/pitch multipliers and the pause (ms) between spoken phrases */
export const STYLE_PARAMS: Record<SpeechStyle, { rate: number; pitch: number; gap: number }> = {
  calm:       { rate: 1.0,  pitch: 1.0,  gap: 140 },
  anxious:    { rate: 1.12, pitch: 1.10, gap: 90 },
  pain:       { rate: 0.92, pitch: 0.94, gap: 260 },
  slow:       { rate: 0.80, pitch: 0.92, gap: 380 },
  breathless: { rate: 1.0,  pitch: 1.06, gap: 520 },
};

export function ageAdjust(age: number | undefined, sex: string) {
  const a = age ?? 40;
  return {
    rate: a >= 70 ? 0.9 : a >= 60 ? 0.95 : 1,
    pitch: sex === 'female' ? (a >= 65 ? 0.96 : 1) : (a >= 65 ? 0.92 : 1),
  };
}

export function cleanForSpeech(text: string): string {
  return text
    .replace(/\*[^*]*\*/g, ' ')      // *looks up*
    .replace(/\[[^\]]*\]/g, ' ')     // [START_CONSULTATION]
    .replace(/\([^)]*\)/g, ' ')      // (aside)
    .replace(/\s+/g, ' ')
    .trim();
}

/** "I can't... breathe properly. My chest hurts." -> ["I can't", "breathe properly.", "My chest hurts."] */
export function splitSegments(text: string): string[] {
  return cleanForSpeech(text)
    .split(/(?<=[.!?])\s+|\s*\.{3}\s*|\s*\u2026\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export interface VoiceLike { name: string; lang: string }

const FEMALE = /\b(samantha|karen|moira|tessa|veena|kate|serena|fiona|victoria|allison|ava|susan|zoe|heera|neerja|zira|hazel|aria|jenny|sonia|libby|catherine|martha|shelley|sandy|flo|female)\b/i;
const MALE = /\b(daniel|alex|fred|tom|oliver|aaron|rishi|ralph|arthur|gordon|lee|reed|ravi|prabhat|david|mark|guy|ryan|james|george|thomas|eddy|rocko|male)\b/i;

export function genderOf(v: VoiceLike): 'male' | 'female' | 'unknown' {
  if (/female/i.test(v.name)) return 'female';
  if (/\bmale\b/i.test(v.name)) return 'male';
  if (FEMALE.test(v.name)) return 'female';
  if (MALE.test(v.name)) return 'male';
  return 'unknown';
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

/** Same patient (seed) always gets the same voice; different patients spread across the available voices. */
export function pickVoice<T extends VoiceLike>(
  voices: T[], sex: string, lang: string, seed: string,
): { voice: T | null; mismatch: boolean } {
  if (!voices.length) return { voice: null, mismatch: false };
  const english = voices.filter((v) => /^en[-_]/i.test(v.lang));
  const pool = english.length ? english : voices;
  const want = sex === 'female' ? 'female' : 'male';

  let candidates = pool.filter((v) => genderOf(v) === want);
  let mismatch = false;
  if (!candidates.length) {
    candidates = pool.filter((v) => genderOf(v) === 'unknown');
    if (!candidates.length) { candidates = pool; mismatch = true; }
  }

  const order = [lang, 'en-IN', 'en-GB', 'en-US', 'en-AU'].map((l) => l.toLowerCase());
  const score = (v: T) => {
    const l = v.lang.replace('_', '-').toLowerCase();
    const idx = order.findIndex((o) => l.startsWith(o));
    return (idx >= 0 ? 10 - idx : 0) + (/natural|neural|online/i.test(v.name) ? 3 : 0) + (/google/i.test(v.name) ? 2 : 0);
  };
  const top = Math.max(...candidates.map(score));
  const best = candidates.filter((v) => score(v) >= top - 3).sort((a, b) => a.name.localeCompare(b.name));
  return { voice: best[hash(seed) % best.length], mismatch };
}

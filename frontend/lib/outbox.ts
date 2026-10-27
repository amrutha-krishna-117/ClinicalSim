/**
 * Send queue for the consultation chat.
 *
 * Why it exists: the old chat ignored anything the doctor said or typed while the patient's previous
 * reply was still being generated, so some questions silently vanished. Now every message is queued,
 * shown immediately as "sending", sent strictly one at a time in the order it was said, and a failure
 * leaves a visible "failed - retry" bubble instead of disappearing.
 */
export interface OutItem {
  id: string;
  text: string;
  status: 'sending' | 'failed';
}

let counter = 0;
const uid = () => `out-${Date.now()}-${counter++}`;

export function createOutbox(send: (text: string) => Promise<void>) {
  let items: OutItem[] = [];
  let running = false;
  const subs = new Set<() => void>();
  const emit = () => subs.forEach((f) => f());

  async function run() {
    if (running) return;
    running = true;
    try {
      for (;;) {
        const next = items.find((i) => i.status === 'sending');
        if (!next) break;
        try {
          await send(next.text);
          items = items.filter((i) => i.id !== next.id);
        } catch {
          items = items.map((i) => (i.id === next.id ? { ...i, status: 'failed' as const } : i));
        }
        emit();
      }
    } finally {
      running = false;
    }
  }

  return {
    enqueue(text: string) {
      const t = text.trim();
      if (!t) return;
      items = [...items, { id: uid(), text: t, status: 'sending' }];
      emit();
      void run();
    },
    retry(id: string) {
      items = items.map((i) => (i.id === id ? { ...i, status: 'sending' as const } : i));
      emit();
      void run();
    },
    discard(id: string) {
      items = items.filter((i) => i.id !== id);
      emit();
    },
    getItems: () => items,
    subscribe(fn: () => void) {
      subs.add(fn);
      return () => { subs.delete(fn); };
    },
  };
}

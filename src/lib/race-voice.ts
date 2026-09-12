// Spoken race commentary. Lines are synthesized once through the app's
// voiceover endpoint, cached as blob URLs, and replayed for the rest of the session.

let enabled = true;
let speaking = false;
let lastSpoken = 0;
const cache = new Map<string, string>();
const pending = new Map<string, Promise<string | null>>();
let current: HTMLAudioElement | null = null;

export function setVoiceEnabled(value: boolean) {
  enabled = value;
  if (!value) stopVoice();
}

export function stopVoice() {
  if (current) {
    current.pause();
    current = null;
  }
  speaking = false;
}

async function fetchLine(text: string): Promise<string | null> {
  const cached = cache.get(text);
  if (cached) return cached;
  const inflight = pending.get(text);
  if (inflight) return inflight;

  const request = (async () => {
    try {
      const response = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!response.ok) {
        console.error(`Voiceover request failed [${response.status}]: ${await response.text().catch(() => "")}`);
        return null;
      }
      const url = URL.createObjectURL(await response.blob());
      cache.set(text, url);
      return url;
    } catch (error) {
      console.error("Voiceover request failed", error);
      return null;
    } finally {
      pending.delete(text);
    }
  })();

  pending.set(text, request);
  return request;
}

/** Speak one short commentary line; drops the line when muted, busy or too soon after the last one. */
export function say(text: string, options: { cooldown?: number; priority?: boolean } = {}) {
  if (!enabled || typeof window === "undefined") return;
  const now = performance.now();
  if (!options.priority && (speaking || now - lastSpoken < (options.cooldown ?? 3500))) return;
  if (options.priority) stopVoice();

  speaking = true;
  lastSpoken = now;
  void fetchLine(text).then((url) => {
    if (!url || !enabled) { speaking = false; return; }
    const audio = new Audio(url);
    audio.volume = 0.9;
    current = audio;
    audio.onended = () => { speaking = false; current = null; };
    audio.onerror = () => { speaking = false; current = null; };
    void audio.play().catch(() => { speaking = false; current = null; });
  });
}

/** Warm the cache for the fixed lines so the first shout is instant. */
export function prewarmVoice(lines: string[]) {
  if (!enabled) return;
  lines.forEach((line) => void fetchLine(line));
}

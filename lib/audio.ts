// Loads optional per-mode ambient/alarm-tone mp3s from /public/sounds and
// loops them through the shared AudioContext while that mode is active and
// sound is on. If a file is missing (404) or fails to decode, `startLoop`
// reports failure so callers can fall back to the synthesized per-beat
// beep — nothing breaks if no mp3s are added.
import type { ModeId } from "./simulation";

export type SoundSlot = "pulse-stable" | "pulse-critical" | "pulse-recovering";

export const SOUND_FILES: Record<SoundSlot, string> = {
  "pulse-stable": "/sounds/pulse-stable.mp3",
  "pulse-critical": "/sounds/pulse-critical.mp3",
  "pulse-recovering": "/sounds/pulse-recovering.mp3",
};

export function slotForMode(mode: ModeId): SoundSlot {
  if (mode === 2) return "pulse-critical";
  if (mode === 3) return "pulse-recovering";
  return "pulse-stable";
}

interface ActiveLoop {
  slot: SoundSlot;
  source: AudioBufferSourceNode;
  gain: GainNode;
}

export class SoundBank {
  private ctx: AudioContext;
  private buffers = new Map<SoundSlot, AudioBuffer | null>();
  private loading = new Map<SoundSlot, Promise<AudioBuffer | null>>();
  private activeLoop: ActiveLoop | null = null;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
  }

  /** Fetches + decodes a slot's mp3, caching the result (including failures as null). */
  load(slot: SoundSlot): Promise<AudioBuffer | null> {
    if (this.buffers.has(slot)) return Promise.resolve(this.buffers.get(slot) ?? null);
    const inFlight = this.loading.get(slot);
    if (inFlight) return inFlight;

    const promise = fetch(SOUND_FILES[slot])
      .then((res) => (res.ok ? res.arrayBuffer() : Promise.reject(new Error("not found"))))
      .then((data) => this.ctx.decodeAudioData(data))
      .then((decoded) => {
        this.buffers.set(slot, decoded);
        return decoded;
      })
      .catch(() => {
        this.buffers.set(slot, null);
        return null;
      })
      .finally(() => {
        this.loading.delete(slot);
      });
    this.loading.set(slot, promise);
    return promise;
  }

  preloadAll(): void {
    (Object.keys(SOUND_FILES) as SoundSlot[]).forEach((slot) => {
      this.load(slot);
    });
  }

  /** Starts (or keeps) a looping ambient tone for `slot`. Returns false if no buffer is loaded yet. */
  startLoop(slot: SoundSlot, gainValue: number): boolean {
    if (this.activeLoop?.slot === slot) return true;
    const buffer = this.buffers.get(slot);
    if (!buffer) return false;

    this.stopLoop();
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const gain = this.ctx.createGain();
    gain.gain.value = gainValue;
    source.connect(gain);
    gain.connect(this.ctx.destination);
    source.start();
    this.activeLoop = { slot, source, gain };
    return true;
  }

  stopLoop(): void {
    if (!this.activeLoop) return;
    try {
      this.activeLoop.source.stop();
    } catch {
      /* already stopped */
    }
    this.activeLoop.source.disconnect();
    this.activeLoop.gain.disconnect();
    this.activeLoop = null;
  }

  isLooping(slot: SoundSlot): boolean {
    return this.activeLoop?.slot === slot;
  }
}

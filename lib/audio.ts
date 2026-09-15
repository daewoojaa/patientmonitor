// Loads optional per-mode pulse-tone mp3s from /public/sounds and plays them
// through the shared AudioContext. If a file is missing (404) or fails to
// decode, playback for that slot silently reports "no buffer" so callers can
// fall back to the synthesized beep — nothing breaks if no mp3s are added.
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

export class SoundBank {
  private ctx: AudioContext;
  private buffers = new Map<SoundSlot, AudioBuffer | null>();
  private pending = new Set<SoundSlot>();

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
  }

  /** Fire-and-forget preload; safe to call repeatedly (dedupes in-flight/loaded slots). */
  preload(slot: SoundSlot): void {
    if (this.buffers.has(slot) || this.pending.has(slot)) return;
    this.pending.add(slot);
    fetch(SOUND_FILES[slot])
      .then((res) => (res.ok ? res.arrayBuffer() : Promise.reject(new Error("not found"))))
      .then((data) => this.ctx.decodeAudioData(data))
      .then((decoded) => {
        this.buffers.set(slot, decoded);
      })
      .catch(() => {
        this.buffers.set(slot, null);
      })
      .finally(() => {
        this.pending.delete(slot);
      });
  }

  preloadAll(): void {
    (Object.keys(SOUND_FILES) as SoundSlot[]).forEach((slot) => this.preload(slot));
  }

  /** Returns true if a buffer was available and playback started. */
  play(slot: SoundSlot, gainValue: number): boolean {
    const buffer = this.buffers.get(slot);
    if (!buffer) return false;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const gain = this.ctx.createGain();
    gain.gain.value = gainValue;
    src.connect(gain);
    gain.connect(this.ctx.destination);
    src.start();
    return true;
  }
}

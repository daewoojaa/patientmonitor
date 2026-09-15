// Simulation math ported verbatim from reference/simulation-logic.js
// (waveform shapes, vitals jitter model, NBP model), extended with per-mode
// waveform morphology (see WaveStyle) so CRITICAL reads clinically as severe
// shock + respiratory failure + hypoxia rather than just faster/scaled targets.

export type ModeId = 1 | 2 | 3;
export type ChannelKey = "ecg" | "pleth" | "resp";

export interface ModeVals {
  hr: number;
  rr: number;
  spo2: number;
  sys: number;
  dia: number;
}

export interface ModeDef {
  label: string;
  color: string;
}

export const MODE_VALS: Record<ModeId, ModeVals> = {
  1: { hr: 120, rr: 30, spo2: 91, sys: 85, dia: 55 },
  2: { hr: 145, rr: 38, spo2: 85, sys: 78, dia: 42 },
  3: { hr: 100, rr: 25, spo2: 95, sys: 120, dia: 80 },
};

export const MODE_DEFS: Record<ModeId, ModeDef> = {
  1: { label: "STABLE", color: "#4ade80" },
  2: { label: "CRITICAL", color: "#e8483b" },
  3: { label: "RECOVERING", color: "#f2e34c" },
};

// Per-mode waveform morphology. Mode 1 (STABLE) is all identity values so it
// renders exactly like the original reference prototype; mode 2 (CRITICAL)
// depicts severe shock (weak, thready pulse: low amplitude / flattened
// dicrotic notch on the pleth), respiratory failure (shallow, irregular
// breaths with occasional weak effort), and hypoxia (noisy, low-amplitude
// ECG and pleth signal, consistent with poor perfusion).
export interface WaveStyle {
  ecgAmpScale: number;
  ecgNoiseScale: number;
  ecgIrregularity: number; // fractional beat-to-beat rate jitter, re-rolled each cycle
  plethAmpScale: number;
  plethNotchScale: number;
  plethNoiseAmp: number; // absolute noise amplitude added to the pleth trace
  respAmpScale: number;
  respNoiseScale: number;
  respIrregularity: number; // fractional breath-to-breath rate jitter
  respEffortVariability: number; // fractional breath-to-breath amplitude jitter (weak effort)
}

export const MODE_WAVE_STYLES: Record<ModeId, WaveStyle> = {
  1: {
    ecgAmpScale: 1,
    ecgNoiseScale: 1,
    ecgIrregularity: 0,
    plethAmpScale: 1,
    plethNotchScale: 1,
    plethNoiseAmp: 0,
    respAmpScale: 1,
    respNoiseScale: 1,
    respIrregularity: 0,
    respEffortVariability: 0,
  },
  2: {
    ecgAmpScale: 0.6,
    ecgNoiseScale: 3,
    ecgIrregularity: 0.08,
    plethAmpScale: 0.35,
    plethNotchScale: 0.2,
    plethNoiseAmp: 0.05,
    respAmpScale: 0.55,
    respNoiseScale: 3,
    respIrregularity: 0.4,
    respEffortVariability: 0.6,
  },
  3: {
    ecgAmpScale: 0.92,
    ecgNoiseScale: 1.3,
    ecgIrregularity: 0.02,
    plethAmpScale: 0.85,
    plethNotchScale: 0.8,
    plethNoiseAmp: 0.01,
    respAmpScale: 0.88,
    respNoiseScale: 1.3,
    respIrregularity: 0.06,
    respEffortVariability: 0.08,
  },
};

export interface ChannelConfig {
  key: ChannelKey;
  color: string;
  speed: number;
  amp: number;
}

export const CHANNELS: ChannelConfig[] = [
  { key: "ecg", color: "#4ade80", speed: 105, amp: 0.42 },
  { key: "pleth", color: "#67d5f5", speed: 105, amp: 0.34 },
  { key: "resp", color: "#f2e34c", speed: 105, amp: 0.34 },
];

export interface ChannelRuntime {
  x: number;
  py: number | null;
  phase: number;
  periodJitter: number;
  ampJitter: number;
}

export function createChannelRuntime(phase: number): ChannelRuntime {
  return { x: 0, py: null, phase, periodJitter: 1, ampJitter: 1 };
}

export interface VitalsState {
  hr: number;
  pulse: number;
  spo2: number;
  rr: number;
  temp: string;
  tempHi: string;
  tempLo: string;
  sys: number;
  dia: number;
  map: number;
}

export interface HistRow {
  t: string;
  v: string;
}

export const DEFAULT_VITALS: VitalsState = {
  hr: 76,
  pulse: 79,
  spo2: 84,
  rr: 18,
  temp: "37.3",
  tempHi: "40.1",
  tempLo: "36.9",
  sys: 121,
  dia: 82,
  map: 89,
};

function gaussian(x: number, c: number, w: number): number {
  return Math.exp(-Math.pow((x - c) / w, 2));
}

export function waveValue(key: ChannelKey, p: number, style: WaveStyle): number {
  if (key === "ecg") {
    const base =
      0.13 * gaussian(p, 0.14, 0.026) -
      0.09 * gaussian(p, 0.195, 0.009) +
      1.0 * gaussian(p, 0.215, 0.0085) -
      0.26 * gaussian(p, 0.245, 0.013) +
      0.3 * gaussian(p, 0.37, 0.048);
    const noise = (Math.random() - 0.5) * 0.012 * style.ecgNoiseScale;
    return base * style.ecgAmpScale + noise;
  }
  if (key === "pleth") {
    const upstroke = 0.95 * gaussian(p, 0.22, 0.1);
    const notch = 0.42 * gaussian(p, 0.45, 0.13) * style.plethNotchScale;
    const tail = 0.1 * gaussian(p, 0.7, 0.2);
    const noise = (Math.random() - 0.5) * 2 * style.plethNoiseAmp;
    return (upstroke + notch + tail - 0.35) * style.plethAmpScale + noise;
  }
  const base = 0.9 * gaussian(p, 0.32, 0.135) + 0.18 * gaussian(p, 0.52, 0.09) - 0.3;
  const noise = (Math.random() - 0.5) * 0.02 * style.respNoiseScale;
  return base * style.respAmpScale + noise;
}

export function periodFor(key: ChannelKey, hr: number, rr: number): number {
  if (key === "resp") return 60 / Math.max(6, rr);
  return 60 / Math.max(35, hr);
}

function jitter(v: number, spread: number): number {
  return v + (Math.random() * 2 - 1) * spread;
}

export function computeVitals(base: ModeVals): VitalsState {
  const hr = Math.max(40, Math.round(jitter(base.hr, 3)));
  const sys = Math.round(jitter(base.sys, 3));
  const dia = Math.round(jitter(base.dia, 2));
  return {
    sys,
    dia,
    map: Math.round(dia + (sys - dia) / 3),
    hr,
    pulse: hr + (Math.random() < 0.5 ? 0 : 1) + Math.round(Math.random() * 2),
    spo2: Math.min(100, Math.max(70, Math.round(jitter(base.spo2, 1.4)))),
    rr: Math.max(6, Math.round(jitter(base.rr, 1.6))),
    temp: jitter(37.3, 0.15).toFixed(1),
    tempHi: jitter(40.1, 0.05).toFixed(1),
    tempLo: jitter(36.9, 0.05).toFixed(1),
  };
}

export function computeNbp(base: ModeVals): { sys: number; dia: number; map: number } {
  const sys = Math.round(base.sys + (Math.random() * 6 - 3));
  const dia = Math.round(base.dia + (Math.random() * 4 - 2));
  return { sys, dia, map: Math.round(dia + (sys - dia) / 3) };
}

export function hhmm(d: Date): string {
  return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
}

export function seedHist(): HistRow[] {
  const out: HistRow[] = [];
  for (let i = 4; i >= 0; i--) {
    const d = new Date(Date.now() - i * 10 * 60000);
    const sys = 119 + Math.round(Math.random() * 5);
    const dia = 79 + Math.round(Math.random() * 4);
    out.push({ t: hhmm(d), v: sys + "/" + dia + " (" + Math.round(dia + (sys - dia) / 3) + ")" });
  }
  return out;
}

const ERASE_BAND_PX = 22;
const STEP_PX = 1.5;

export function drawChannel(
  canvas: HTMLCanvasElement,
  config: ChannelConfig,
  runtime: ChannelRuntime,
  dt: number,
  hr: number,
  rr: number,
  sweepSpeed: number,
  style: WaveStyle,
  onEcgBeat: () => void
): void {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (!w || !h) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const needW = Math.round(w * dpr);
  const needH = Math.round(h * dpr);
  if (canvas.width !== needW || canvas.height !== needH) {
    canvas.width = needW;
    canvas.height = needH;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, w, h);
    runtime.x = 0;
    runtime.py = null;
  }

  const mid = h * 0.56;
  const per = periodFor(config.key, hr, rr);
  const speed = config.speed * sweepSpeed;
  const total = speed * dt;
  const steps = Math.max(1, Math.ceil(total / STEP_PX));
  const cycleIrregularity = config.key === "resp" ? style.respIrregularity : style.ecgIrregularity;

  ctx.lineWidth = 1.8;
  ctx.strokeStyle = config.color;
  ctx.lineJoin = "round";
  ctx.shadowColor = config.color;
  ctx.shadowBlur = 6;

  for (let i = 0; i < steps; i++) {
    const sdt = dt / steps;
    const sdx = total / steps;
    const prevPhase = runtime.phase;
    runtime.phase = (prevPhase + (sdt / per) * runtime.periodJitter) % 1;

    if (
      config.key === "ecg" &&
      prevPhase < 0.215 !== runtime.phase < 0.215 &&
      runtime.phase > prevPhase
    ) {
      onEcgBeat();
    }

    if (runtime.phase < prevPhase) {
      // Crossed into a new cycle: re-roll this channel's rate (and, for
      // respiration, effort/amplitude) jitter for the upcoming cycle.
      runtime.periodJitter = 1 + (Math.random() * 2 - 1) * cycleIrregularity;
      if (config.key === "resp") {
        runtime.ampJitter = 1 - Math.random() * style.respEffortVariability;
      }
    }

    let nx = runtime.x + sdx;
    const ampJitter = config.key === "resp" ? runtime.ampJitter : 1;
    const y = mid - waveValue(config.key, runtime.phase, style) * h * config.amp * ampJitter;
    if (nx >= w) {
      nx -= w;
      runtime.py = null;
    }

    ctx.save();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#000";
    ctx.fillRect(nx, 0, ERASE_BAND_PX, h);
    if (nx + ERASE_BAND_PX > w) ctx.fillRect(0, 0, nx + ERASE_BAND_PX - w, h);
    ctx.restore();

    if (runtime.py !== null) {
      ctx.beginPath();
      ctx.moveTo(runtime.x, runtime.py);
      ctx.lineTo(nx, y);
      ctx.stroke();
    }
    runtime.x = nx;
    runtime.py = y;
  }
  ctx.shadowBlur = 0;
}

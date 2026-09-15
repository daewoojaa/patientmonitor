# Handoff: Hospital Patient Monitor Simulator (PWA)

## Overview
An installable PWA that simulates a bedside multi-parameter patient monitor (ICU/ER style): three live waveforms (ECG lead II, SpO₂ pleth, respiration), live numeric vitals with realistic jitter, cyclic NBP measurement with history, a pulse-synced beep, and three scripted patient states switched by tapping the screen 1/2/3 times. Intended use: training demos, props, and teaching aids — **not** a medical device.

## About the Design Files
`reference/Patient Monitor.dc.html` is a **design reference prototype written in HTML** — it shows the intended look, motion, and behavior. `reference/simulation-logic.js` is the prototype's logic class extracted for reading: the waveform math, jitter model, tap state machine, and audio beep. Do not ship these files as the product.

The task is to **recreate this design in the target codebase's environment** using its established patterns. If no codebase exists yet, pick a suitable stack for an offline-capable PWA (suggested: Vite + React + TypeScript, `vite-plugin-pwa` for manifest/service worker, a single `<canvas>` renderer per waveform). Port the simulation math from `simulation-logic.js` verbatim — the shapes were tuned to look clinical.

## Fidelity
**High-fidelity.** Colors, type sizes, layout ratios and motion timing below are final; recreate them pixel-accurately, then adapt only what a real phone/tablet viewport demands (see Responsive).

## Screens / Views
Single full-screen view — the monitor. Root: `display:flex; flex-direction:column`, black `#000` background, `1px solid #222` border, `font-family:'Helvetica Neue', Helvetica, Arial, sans-serif`, `user-select:none`, whole surface is the tap target. Prototype max-width 1200px; in the PWA it fills the viewport (landscape).

### 1. Status bar (top)
`display:flex; align-items:center`, background `#1b1b1b`, `border-bottom:1px solid #000`, text `#dcdcdc`, `font-size:15px`, `letter-spacing:.02em`. Cells separated by `border-right:1px solid #000`, padding `6px 14px`:
| Cell | Content | Sizing |
|---|---|---|
| Bed | `Bed 3` | `min-width:86px` |
| Patient | `Doe, John` (configurable) | `min-width:160px` |
| Patient type | `Adult` | `flex:1`, centered |
| Clock | real device time `HH:MM`, tabular numerals | `flex:1`, centered |
| Waves | `3 Waves` | `flex:1`, centered |
| **State label** | `STABLE` / `CRITICAL` / `RECOVERING`, `font-weight:600`, `letter-spacing:.06em`, color = state color | `flex:1.4`, centered |
| Controls | sound toggle button + alarm-bell glyph | padding `5px 14px`, `gap:10px` |

Sound button: label `SOUND OFF` / `SOUND ON`, background `#2a2a2a`, border `1px solid #3d3d3d`, text `#dcdcdc`, `font:500 12px/1`, padding `6px 10px`, `border-radius:3px`, hover background `#383838`. Its click must **not** count as a screen tap (stop propagation).
Bell glyph: 13×15 white (`#e6e6e6`) bell silhouette + 1.6r circle clapper.

### 2. Main area
`display:grid; grid-template-columns: minmax(0,2.15fr) minmax(0,1fr)`.

**Left — waveform stack** (`border-right:1px solid #1a1a1a`): three rows, each `height:130px`, `position:relative`, rows 1–2 with `border-bottom:1px solid #111`. Each row: absolutely positioned channel label at `top:6px; left:10px`, `font-size:12px`, `letter-spacing:.04em`, in the channel color; below it a `<canvas>` at `width:100%; height:100%; display:block`.
Channels: `II` `#4ade80` (green), `Pleth` `#67d5f5` (cyan), `Resp` `#f2e34c` (yellow).

**Right — numerics**: `display:grid; grid-template-columns: minmax(0,1fr) 116px`.
- Vitals column: three rows, each `display:grid; grid-template-columns:56px minmax(0,1fr)`, `align-items:start`, `column-gap:6px`, `padding:8px 8px 0 14px`, `height:130px`, `box-sizing:border-box`. Left cell = label (`font-size:19px; font-weight:500`) over the alarm limits (`font-size:14px; line-height:1.25`, dim color, tabular). Right cell = the big value: `font-size:46px; line-height:1.08; font-weight:600; text-align:right; letter-spacing:-.02em`, tabular numerals.
  - `HR` — value/label `#4ade80`, limits `#3bbd6b`, limits text `120 / 50`
  - `SpO₂` (subscript 2 at `font-size:12px`) — `#4ddbe6`, limits `#38a8b4`, `100 / 90`
  - `RR` — `#f2e34c`, limits `#b5a92f`, `30 / 8`
  - **Constraint that matters:** the value must never shrink or clip — fixed label track + right-aligned value, room for 3 digits at 46px (~80px). Verify with HR 145 / SpO₂ 100.
- Pulse/Temp column (fixed 116px): `display:flex; flex-direction:column; padding:8px 14px 0 12px; gap:42px`, all `#4ade80`, right-aligned. `Pulse` label 19px + value 36px; `Temp` label 19px + value 30px + two dim (`#3bbd6b`) 15px lines = session high / low.

### 3. NBP bar (bottom)
Same 2.15fr / 1fr grid, `border-top:1px solid #1a1a1a`.
Left cell (`position:relative; padding:6px 14px 12px; min-height:118px`), all red family:
- Header row `font-size:14px`, color `#e04a3f`: `NBP` + tiny `Sys./Dia.` (`11px`, `#8c2f28`); centered `Auto 10 min`; then a 52×7px solid `#e04a3f` bar, the cuff countdown `MM:SS` (`#c94238`, tabular), and `NBP` + `mmHg` (`10px`, `#8c2f28`).
- Value row: dim limits `160 / 90` (`14px`, `#8c2f28`, `padding-bottom:12px`), then `{sys}/{dia}` and `({map})` each `font-size:54px; line-height:1.05; font-weight:500; color:#e8483b`, tabular, `gap:18px`.
- Tap hint, bottom-right, `font-size:12px`, `#6b6b6b`, `letter-spacing:.04em`: idle → `tap screen: 1 = stable / 2 = critical / 3 = recovering`; pending → `tap x{n} — switching in 2s`.
Right cell: NBP history, `padding:10px 14px`, bottom-aligned, 5 rows max, each `font-size:14px; line-height:1.5; color:#d0453a`, tabular: timestamp column `min-width:52px` + `SYS/DIA (MAP)`.

## Interactions & Behavior

### Tap state machine (core feature)
Tap anywhere on the monitor. Taps within a **700 ms** window accumulate (capped at 3). 700 ms after the last tap the count locks, then after a **2000 ms** delay the state is applied. A new tap during either timer cancels and restarts. `pending` count drives the hint text.

| Taps | State | Label / color | HR | RR | SpO₂ | NBP |
|---|---|---|---|---|---|---|
| 1 | Stable | `STABLE` `#4ade80` | 120 | 30 | 91 | 85/55 |
| 2 | Critical (near-death) | `CRITICAL` `#e8483b` | 145 | 38 | 85 | 78/42 |
| 3 | Recovering | `RECOVERING` `#f2e34c` | 100 | 25 | 95 | 120/80 |

States are steady targets (no auto-recovery ramp). Initial state on load = state 1. MAP is always derived: `dia + (sys - dia)/3`, rounded.

### Live numbers
Every **1800 ms**, each vital = target + uniform jitter: HR ±3, SpO₂ ±1.4 (clamped 70–100), RR ±1.6 (min 6), Temp 37.3 ±0.15 (1 decimal), session high 40.1 ±0.05, low 36.9 ±0.05, sys ±3, dia ±2. HR is floored at 40. Pulse = HR + 0–3.

### Waveforms
Sweep rendering, exactly like a real monitor: a trace advances left→right at **105 px/s** (× `sweepSpeed` multiplier, default 1) while a **22 px** black erase band immediately ahead wipes the previous pass; on reaching the right edge x wraps to 0 and the pen lifts. Stroke `lineWidth 1.8`, `lineJoin:round`, channel color with `shadowBlur:6` in the same color (the CRT glow); the erase fill is drawn with shadow off. Per frame, subdivide `dt` into steps of ≈1.5 px for smooth curves; clamp `dt` to 0.06 s. Resize handling: match canvas backing store to `clientWidth/Height × devicePixelRatio`, `setTransform(dpr,0,0,dpr,0,0)`, repaint black and reset x.

Baseline sits at `y = 0.56 × height`; `y = mid − f(phase) × height × amp` with amp 0.42 (ECG) / 0.34 (pleth, resp).
Phase advances by `dt / period`; period = `60/HR` for ECG and pleth, `60/RR` for resp.

Waveform functions (`g(x,c,w) = exp(-((x-c)/w)²)`, phase p ∈ [0,1)):
- **ECG:** `0.13·g(p,0.14,0.026) − 0.09·g(p,0.195,0.009) + 1.0·g(p,0.215,0.0085) − 0.26·g(p,0.245,0.013) + 0.30·g(p,0.37,0.048)` + noise ±0.006 (P, Q, R, S, T).
- **Pleth:** `0.95·g(p,0.22,0.10) + 0.42·g(p,0.45,0.13) + 0.1·g(p,0.7,0.2) − 0.35` (systolic upstroke + dicrotic notch).
- **Resp:** `0.9·g(p,0.32,0.135) + 0.18·g(p,0.52,0.09) − 0.3` + noise ±0.01.

### Audio (pulse beep)
WebAudio, created on the first sound-button press (browser gesture requirement); resume a suspended context. The beep fires from the ECG renderer the moment the phase crosses **0.215** (the R peak) so it is locked to the drawn QRS. Tone: `square` oscillator, `freq = 520 + (min(100, SpO₂) − 90) × 14` Hz (pitch falls as SpO₂ drops, as on a real pulse oximeter); gain 0 → 0.09 over 6 ms, exponential decay to 0.0001 by 75 ms, stop at 90 ms. Default is muted.

### Clock, cuff, NBP cycle
- Clock ticks every 1000 ms from device time (`HH:MM`).
- Cuff countdown decrements 1 s per tick from 400 s, and rolls to 600 s at zero.
- NBP re-measures every **65 s**: value = target ±3/±2, appended to history (keep last 5). Skip the append if the newest row already has the current `HH:MM` (never two rows with the same minute). Seed history with 5 rows at −40/−30/−20/−10/0 min.

### Responsive
Prototype is a desktop-width panel. For the PWA: lock/encourage landscape, scale the whole monitor to fit the viewport (e.g. CSS `transform: scale()` on a 1200×640 design box, or fluid grid with 130px rows down to ~96px on phones). Never let numerics shrink below the layout constraints noted above.

## State Management
- `mode: 1 | 2 | 3` — active state; `pending: 0..3` — taps awaiting apply.
- `soundOn: boolean`.
- Vitals: `hr, pulse, spo2, rr, temp, tempHi, tempLo, sys, dia, map`, `clock`, `cuffCountdown`, `hist: {t, v}[]`.
- Non-render refs (keep out of reactive state to avoid re-render churn): per-channel `{x, prevY, phase}`, `AudioContext`, rAF handle, tap/apply timers, last frame timestamp.
- Timers: rAF render loop; intervals 1800 ms (vitals), 1000 ms (clock/cuff), 65000 ms (NBP); timeouts 700 ms (tap window) and 2000 ms (apply delay). Clear all on unmount.
- No network, no data fetching. Fully offline — precache the shell in the service worker.

## Design Tokens
Colors: background `#000`; status bar `#1b1b1b`; borders `#000` / `#222` / `#1a1a1a` / `#111`; primary text `#e6e6e6`, bar text `#dcdcdc`, hint `#6b6b6b`; green `#4ade80` (dim `#3bbd6b`); cyan `#4ddbe6` (dim `#38a8b4`), pleth trace `#67d5f5`; yellow `#f2e34c` (dim `#b5a92f`); red `#e8483b`, `#e04a3f`, `#d0453a`, `#c94238`, dim `#8c2f28`; button `#2a2a2a` / border `#3d3d3d` / hover `#383838`.
Type scale: 10, 11, 12, 14, 15, 19, 30, 36, 46, 54 px. Weights 500 / 600. Tabular numerals everywhere numbers change. Letter-spacing: `.02em` bar, `.04em` labels/hint, `.06em` state label, `-.02em` big numerals.
Spacing: 6, 8, 10, 12, 14, 16, 18, 42 px. Radius: 3px (button only). Row height 130px; Pulse/Temp column 116px; label track 56px; NBP bar min-height 118px. Shadow: canvas glow only (`shadowBlur 6`, trace color).

## Assets
None external. The bell is an inline SVG (two simple shapes, spec above). No images, no icon font, no webfont — system Helvetica/Arial stack. Add PWA icons (192/512 maskable) + manifest: name "Patient Monitor", `display: fullscreen`, `orientation: landscape`, `background_color`/`theme_color` `#000000`.

## Files
- `reference/Patient Monitor.dc.html` — the full HTML design prototype (open in a browser to see live motion; tap it to switch states).
- `reference/simulation-logic.js` — the prototype's simulation logic, extracted for reading and porting.

## Note
Add a visible "simulation / training use only — not a medical device" disclaimer somewhere in the shipped app (about screen or first-run notice).

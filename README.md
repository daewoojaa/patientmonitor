# Patient Monitor

An installable PWA that simulates a bedside multi-parameter patient monitor (ICU/ER style): three
live waveforms (ECG lead II, SpO₂ pleth, respiration), live numeric vitals with realistic jitter,
cyclic NBP measurement with history, a pulse-synced beep, and three scripted patient states
switched by tapping the screen 1/2/3 times.

Built with Next.js (App Router) and TypeScript. **Simulation / training use only — not a medical
device.**

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Tap (or click) anywhere on the monitor:

- 1 tap → **STABLE**
- 2 taps → **CRITICAL**
- 3 taps → **RECOVERING**

## Scripts

```bash
npm run dev     # start the dev server
npm run build   # production build
npm run start   # run the production build locally
npm run lint    # eslint
```

## Project structure

- [app/page.tsx](app/page.tsx), [app/layout.tsx](app/layout.tsx) — routing shell + PWA metadata.
- [components/Monitor.tsx](components/Monitor.tsx) — the monitor: state machine, timers, canvas
  waveform loop, audio beep.
- [components/Stage.tsx](components/Stage.tsx) — scales/centers the fixed-design-width monitor to
  fit any viewport.
- [lib/simulation.ts](lib/simulation.ts) — waveform math, vitals jitter model, NBP model (ported
  from the design prototype's logic).
- [public/manifest.webmanifest](public/manifest.webmanifest), [public/sw.js](public/sw.js) — PWA
  manifest + offline service worker.

## Design reference

`reference/` holds the original high-fidelity HTML design prototype this app was built from (see
[HANDOFF.md](HANDOFF.md) for the full spec). It's kept for reference only and isn't part of the
shipped app.

## Deployment

Deployed to Vercel from the `main` branch of this repository — every push to `main` triggers a
new production deployment.

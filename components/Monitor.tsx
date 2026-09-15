"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import styles from "./Monitor.module.css";
import EditableField from "./EditableField";
import {
  CHANNELS,
  DEFAULT_VITALS,
  MODE_DEFS,
  MODE_VALS,
  MODE_WAVE_STYLES,
  ModeId,
  VitalsState,
  HistRow,
  ChannelKey,
  ChannelRuntime,
  computeNbp,
  computeVitals,
  createChannelRuntime,
  drawChannel,
  hhmm,
  seedHist,
} from "@/lib/simulation";
import { SoundBank, slotForMode } from "@/lib/audio";

const TAP_WINDOW_MS = 700;
const APPLY_DELAY_MS = 2000;
const VITALS_INTERVAL_MS = 1800;
const CLOCK_INTERVAL_MS = 1000;
const NBP_INTERVAL_MS = 65000;
const SWEEP_SPEED = 1;
const CUFF_START_S = 400;
const CUFF_RESET_S = 600;
const LOOP_GAIN = 0.06;
const BEEP_GAIN = 0.09;

const DISCLAIMER_KEY = "pm-disclaimer-dismissed";
const BED_KEY = "pm-bed";
const PATIENT_KEY = "pm-patient";
const PATIENT_TYPE_KEY = "pm-patient-type";

export default function Monitor() {
  const [bed, setBed] = useState("Bed 3");
  const [patient, setPatient] = useState("Doe, John");
  const [patientType, setPatientType] = useState("Adult");
  const [mode, setMode] = useState<ModeId>(1);
  const [pending, setPending] = useState(0);
  const [soundOn, setSoundOn] = useState(false);
  const [vitals, setVitals] = useState<VitalsState>(DEFAULT_VITALS);
  const [clock, setClock] = useState("--:--");
  const [cuffCountdown, setCuffCountdown] = useState("06:40");
  const [hist, setHist] = useState<HistRow[]>([]);
  const [showDisclaimer, setShowDisclaimer] = useState(false);
  const [audioReady, setAudioReady] = useState(false);

  const ecgCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const plethCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const respCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const modeRef = useRef<ModeId>(1);
  const histRef = useRef<HistRow[]>([]);
  const hrRef = useRef(DEFAULT_VITALS.hr);
  const rrRef = useRef(DEFAULT_VITALS.rr);
  const spo2Ref = useRef(DEFAULT_VITALS.spo2);
  const soundOnRef = useRef(false);

  const tapsRef = useRef(0);
  const tapTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const applyTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const cuffLeftRef = useRef(CUFF_START_S);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const soundBankRef = useRef<SoundBank | null>(null);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);
  useEffect(() => {
    histRef.current = hist;
  }, [hist]);
  useEffect(() => {
    hrRef.current = vitals.hr;
    rrRef.current = vitals.rr;
    spo2Ref.current = vitals.spo2;
  }, [vitals.hr, vitals.rr, vitals.spo2]);
  useEffect(() => {
    soundOnRef.current = soundOn;
  }, [soundOn]);

  useEffect(() => {
    // Client-only localStorage check; must run post-mount to avoid an SSR hydration mismatch.
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (!window.localStorage.getItem(DISCLAIMER_KEY)) setShowDisclaimer(true);
      const savedBed = window.localStorage.getItem(BED_KEY);
      const savedPatient = window.localStorage.getItem(PATIENT_KEY);
      const savedType = window.localStorage.getItem(PATIENT_TYPE_KEY);
      if (savedBed) setBed(savedBed);
      if (savedPatient) setPatient(savedPatient);
      if (savedType) setPatientType(savedType);
    } catch {
      setShowDisclaimer(true);
    }
  }, []);

  const dismissDisclaimer = useCallback(() => {
    setShowDisclaimer(false);
    try {
      window.localStorage.setItem(DISCLAIMER_KEY, "1");
    } catch {
      /* ignore */
    }
  }, []);

  const updateBed = useCallback((next: string) => {
    setBed(next);
    try {
      window.localStorage.setItem(BED_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);
  const updatePatient = useCallback((next: string) => {
    setPatient(next);
    try {
      window.localStorage.setItem(PATIENT_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);
  const updatePatientType = useCallback((next: string) => {
    setPatientType(next);
    try {
      window.localStorage.setItem(PATIENT_TYPE_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  const applyMode = useCallback((m: ModeId) => {
    setMode(m);
    setPending(0);
    setVitals(computeVitals(MODE_VALS[m]));
  }, []);

  const handleTap = useCallback(() => {
    tapsRef.current = Math.min(3, tapsRef.current + 1);
    setPending(tapsRef.current);
    if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
    if (applyTimerRef.current) clearTimeout(applyTimerRef.current);
    tapTimerRef.current = setTimeout(() => {
      const m = tapsRef.current as ModeId;
      tapsRef.current = 0;
      applyTimerRef.current = setTimeout(() => applyMode(m), APPLY_DELAY_MS);
    }, TAP_WINDOW_MS);
  }, [applyMode]);

  const beep = useCallback(() => {
    const ctx = audioCtxRef.current;
    if (!ctx || !soundOnRef.current) return;
    // A looping ambient/alarm mp3 for the current mode (see public/sounds/)
    // already provides continuous audio feedback — don't also click on top
    // of it. Only synthesize the per-beat tone when no such loop is active.
    const slot = slotForMode(modeRef.current);
    if (soundBankRef.current?.isLooping(slot)) return;

    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.value = 520 + (Math.min(100, spo2Ref.current) - 90) * 14;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(BEEP_GAIN, t + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.075);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.09);
  }, []);

  const toggleSound = useCallback((ev: React.MouseEvent) => {
    ev.stopPropagation();
    if (!audioCtxRef.current) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AC) audioCtxRef.current = new AC();
    }
    if (audioCtxRef.current && audioCtxRef.current.state === "suspended") {
      audioCtxRef.current.resume();
    }
    if (audioCtxRef.current && !soundBankRef.current) {
      soundBankRef.current = new SoundBank(audioCtxRef.current);
      soundBankRef.current.preloadAll();
      setAudioReady(true);
    }
    setSoundOn((s) => !s);
  }, []);

  // Start/stop the current mode's looping ambient/alarm mp3 as sound and mode
  // state change. Falls back to no-op (per-beat synth beep takes over) when
  // no mp3 is loaded for that mode.
  useEffect(() => {
    const bank = soundBankRef.current;
    if (!bank) return;
    if (!soundOn) {
      bank.stopLoop();
      return;
    }
    const slot = slotForMode(mode);
    if (bank.startLoop(slot, LOOP_GAIN)) return;

    let cancelled = false;
    bank.load(slot).then((buffer) => {
      if (!cancelled && buffer && soundOnRef.current && modeRef.current === mode) {
        bank.startLoop(slot, LOOP_GAIN);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [mode, soundOn, audioReady]);

  const runNbp = useCallback(() => {
    const base = MODE_VALS[modeRef.current];
    const { sys, dia, map } = computeNbp(base);
    const t = hhmm(new Date());
    const prev = histRef.current;
    if (prev.length && prev[prev.length - 1].t === t) return;
    const next = [...prev.slice(-4), { t, v: `${sys}/${dia} (${map})` }];
    histRef.current = next;
    setHist(next);
    setVitals((v) => ({ ...v, sys, dia, map }));
  }, []);

  const tickClock = useCallback(() => {
    const d = new Date();
    cuffLeftRef.current = Math.max(0, cuffLeftRef.current - 1);
    if (cuffLeftRef.current === 0) cuffLeftRef.current = CUFF_RESET_S;
    const m = Math.floor(cuffLeftRef.current / 60);
    const s = cuffLeftRef.current % 60;
    setClock(hhmm(d));
    setCuffCountdown(`${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`);
  }, []);

  // Vitals / clock / NBP timers + initial mode application.
  useEffect(() => {
    // Random seed data must be generated post-mount to avoid an SSR hydration mismatch.
    const seeded = seedHist();
    histRef.current = seeded;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHist(seeded);

    tickClock();
    const iClock = setInterval(tickClock, CLOCK_INTERVAL_MS);
    const iVit = setInterval(() => {
      setVitals(computeVitals(MODE_VALS[modeRef.current]));
    }, VITALS_INTERVAL_MS);
    const iNbp = setInterval(runNbp, NBP_INTERVAL_MS);

    applyMode(1);

    return () => {
      clearInterval(iClock);
      clearInterval(iVit);
      clearInterval(iNbp);
      if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
      if (applyTimerRef.current) clearTimeout(applyTimerRef.current);
      soundBankRef.current?.stopLoop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Waveform render loop.
  useEffect(() => {
    const runtimes: Record<ChannelKey, ChannelRuntime> = {
      ecg: createChannelRuntime(Math.random()),
      pleth: createChannelRuntime(Math.random()),
      resp: createChannelRuntime(Math.random()),
    };
    const canvasRefs: Record<ChannelKey, React.RefObject<HTMLCanvasElement | null>> = {
      ecg: ecgCanvasRef,
      pleth: plethCanvasRef,
      resp: respCanvasRef,
    };

    let last = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const dt = Math.min(0.06, (now - last) / 1000);
      last = now;
      for (const cfg of CHANNELS) {
        const el = canvasRefs[cfg.key].current;
        if (el) {
          drawChannel(
            el,
            cfg,
            runtimes[cfg.key],
            dt,
            hrRef.current,
            rrRef.current,
            SWEEP_SPEED,
            MODE_WAVE_STYLES[modeRef.current],
            cfg.key === "ecg" ? beep : () => {}
          );
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [beep]);

  const modeDef = MODE_DEFS[mode];
  const tapHint = pending
    ? `tap x${pending} — switching in 2s`
    : "tap screen: 1 = stable / 2 = critical / 3 = recovering";

  return (
    <div className={styles.monitor} onClick={handleTap}>
      <div className={styles.statusBar}>
        <div className={`${styles.cell} ${styles.cellBed}`}>
          <EditableField value={bed} onChange={updateBed} ariaLabel="Bed" />
        </div>
        <div className={`${styles.cell} ${styles.cellPatient}`}>
          <EditableField value={patient} onChange={updatePatient} ariaLabel="Patient name" />
        </div>
        <div className={`${styles.cell} ${styles.cellCenter}`}>
          <EditableField value={patientType} onChange={updatePatientType} ariaLabel="Patient type" />
        </div>
        <div className={`${styles.cell} ${styles.cellCenter}`} style={{ fontVariantNumeric: "tabular-nums" }}>
          {clock}
        </div>
        <div className={`${styles.cell} ${styles.cellCenter}`}>3 Waves</div>
        <div className={`${styles.cell} ${styles.cellState}`} style={{ color: modeDef.color }}>
          {modeDef.label}
        </div>
        <div className={styles.controls}>
          <button type="button" className={styles.soundBtn} onClick={toggleSound}>
            {soundOn ? "SOUND ON" : "SOUND OFF"}
          </button>
          <svg width="13" height="15" viewBox="0 0 13 15" style={{ display: "block" }}>
            <path
              d="M6.5 1a4 4 0 0 1 4 4v3l1.4 2.2H-.9L1.5 8V5a4 4 0 0 1 4-4z"
              transform="translate(.5)"
              fill="#e6e6e6"
            />
            <circle cx="6.5" cy="13" r="1.6" fill="#e6e6e6" />
          </svg>
        </div>
      </div>

      <div className={styles.mainGrid}>
        <div className={styles.waveStack}>
          <div className={`${styles.waveRow} ${styles.waveRowBorder}`}>
            <div className={styles.waveLabel} style={{ color: "#4ade80" }}>
              II
            </div>
            <canvas ref={ecgCanvasRef} className={styles.canvas} />
          </div>
          <div className={`${styles.waveRow} ${styles.waveRowBorder}`}>
            <div className={styles.waveLabel} style={{ color: "#67d5f5" }}>
              Pleth
            </div>
            <canvas ref={plethCanvasRef} className={styles.canvas} />
          </div>
          <div className={styles.waveRow}>
            <div className={styles.waveLabel} style={{ color: "#f2e34c" }}>
              Resp
            </div>
            <canvas ref={respCanvasRef} className={styles.canvas} />
          </div>
        </div>

        <div className={styles.numGrid}>
          <div className={styles.vitalsCol}>
            <div className={styles.vitalRow}>
              <div style={{ color: "#4ade80" }}>
                <div className={styles.vitalLabel}>HR</div>
                <div className={styles.vitalLimits} style={{ color: "#3bbd6b" }}>
                  120
                  <br />
                  50
                </div>
              </div>
              <div className={styles.vitalValue} style={{ color: "#4ade80" }}>
                {vitals.hr}
              </div>
            </div>
            <div className={styles.vitalRow}>
              <div style={{ color: "#4ddbe6" }}>
                <div className={styles.vitalLabel}>
                  SpO<span className={styles.spo2Sub}>2</span>
                </div>
                <div className={styles.vitalLimits} style={{ color: "#38a8b4" }}>
                  100
                  <br />
                  90
                </div>
              </div>
              <div className={styles.vitalValue} style={{ color: "#4ddbe6" }}>
                {vitals.spo2}
              </div>
            </div>
            <div className={styles.vitalRow}>
              <div style={{ color: "#f2e34c" }}>
                <div className={styles.vitalLabel}>RR</div>
                <div className={styles.vitalLimits} style={{ color: "#b5a92f" }}>
                  30
                  <br />8
                </div>
              </div>
              <div className={styles.vitalValue} style={{ color: "#f2e34c" }}>
                {vitals.rr}
              </div>
            </div>
          </div>

          <div className={styles.sideCol}>
            <div>
              <div className={styles.sideLabel}>Pulse</div>
              <div className={styles.pulseValue}>{vitals.pulse}</div>
            </div>
            <div>
              <div className={styles.sideLabel}>Temp</div>
              <div className={styles.tempValue}>{vitals.temp}</div>
              <div className={styles.tempLimits}>
                {vitals.tempHi}
                <br />
                {vitals.tempLo}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className={styles.nbpGrid}>
        <div className={styles.nbpLeft}>
          <div className={styles.nbpHeader}>
            <div className={styles.nbpHeaderLabel}>
              NBP{" "}
              <span className={styles.nbpSysDia}>
                Sys.
                <br />
                Dia.
              </span>
            </div>
            <div className={styles.nbpAuto}>Auto 10 min</div>
            <div className={styles.nbpCuff}>
              <div className={styles.nbpCuffBar} />
              <div className={styles.nbpCuffTime}>{cuffCountdown}</div>
              <div>
                NBP <span className={styles.nbpUnit}>mmHg</span>
              </div>
            </div>
          </div>
          <div className={styles.tapHint}>{tapHint}</div>
          <div className={styles.nbpValues}>
            <div className={styles.nbpLimits}>
              160
              <br />
              90
            </div>
            <div className={styles.nbpBig}>
              {vitals.sys}/{vitals.dia}
            </div>
            <div className={styles.nbpBig}>({vitals.map})</div>
          </div>
        </div>

        <div className={styles.nbpRight}>
          {hist.map((row, i) => (
            <div className={styles.histRow} key={i}>
              <div className={styles.histT}>{row.t}</div>
              <div>{row.v}</div>
            </div>
          ))}
        </div>
      </div>

      {showDisclaimer && (
        <div className={styles.disclaimerOverlay} onClick={(e) => e.stopPropagation()}>
          <div className={styles.disclaimerBox}>
            <p className={styles.disclaimerTitle}>SIMULATION / TRAINING USE ONLY</p>
            <p className={styles.disclaimerBody}>
              This app simulates a bedside patient monitor for training, demonstration, and prop
              use. It is not a medical device and must never be used for actual patient
              monitoring or clinical decisions.
            </p>
            <button type="button" className={styles.disclaimerBtn} onClick={dismissDisclaimer}>
              I understand
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Extracted simulation logic from the HTML prototype (waveform math, vitals jitter, tap state machine, beep).
// Framework-agnostic reference — port the math verbatim.

class Component extends DCLogic {
  state = { soundOn: false, mode: 1, pending: 0, hr: 76, pulse: 79, spo2: 84, rr: 18, temp: '37.3', sys: 121, dia: 82, map: 89, clock: '--:--', hist: [], cuffCountdown: '06:40' };

  crefs = {
    ecg: (el) => { this.cv.ecg = el; },
    pleth: (el) => { this.cv.pleth = el; },
    resp: (el) => { this.cv.resp = el; }
  };

  cv = {};
  chans = [
    { key: 'ecg', color: '#4ade80', speed: 105, amp: 0.42, gain: 1 },
    { key: 'pleth', color: '#67d5f5', speed: 105, amp: 0.34, gain: 1 },
    { key: 'resp', color: '#f2e34c', speed: 105, amp: 0.34, gain: 1 }
  ];

  componentDidMount() {
    this.chans.forEach(c => { c.x = 0; c.py = null; c.phase = Math.random(); });
    this.last = performance.now();
    this.cuffLeft = 400;
    this.setState({ hist: this.seedHist() });
    this.tick = (now) => {
      const dt = Math.min(0.06, (now - this.last) / 1000);
      this.last = now;
      this.chans.forEach(c => this.draw(c, dt));
      this.raf = requestAnimationFrame(this.tick);
    };
    this.raf = requestAnimationFrame(this.tick);

    this.iVit = setInterval(() => this.vitals(), 1800);
    this.iClock = setInterval(() => this.clock(), 1000);
    this.clock();
    this.iNbp = setInterval(() => this.nbp(), 65000);
    this.rampStart = performance.now();
    this.applyMode(1);
  }

  componentWillUnmount() {
    cancelAnimationFrame(this.raf);
    clearInterval(this.iVit); clearInterval(this.iClock); clearInterval(this.iNbp);
    clearTimeout(this.tapTimer); clearTimeout(this.applyTimer);
  }

  modes = {
    1: { label: 'STABLE', color: '#4ade80', vals: { hr: 120, rr: 30, spo2: 91, sys: 85, dia: 55 } },
    2: { label: 'CRITICAL', color: '#e8483b', vals: { hr: 145, rr: 38, spo2: 85, sys: 78, dia: 42 } },
    3: { label: 'RECOVERING', color: '#f2e34c', vals: { hr: 100, rr: 25, spo2: 95, sys: 120, dia: 80 } }
  };

  onTap = () => {
    this.taps = Math.min(3, (this.taps || 0) + 1);
    this.setState({ pending: this.taps });
    clearTimeout(this.tapTimer);
    clearTimeout(this.applyTimer);
    this.tapTimer = setTimeout(() => {
      const m = this.taps; this.taps = 0;
      this.applyTimer = setTimeout(() => this.applyMode(m), 2000);
    }, 700);
  };

  applyMode(m) {
    const def = this.modes[m];
    if (!def) return;
    this.rampStart = performance.now();
    this.setState({ mode: m, pending: 0 });
    this.vitals();
  }

  baseNow() {
    const def = this.modes[this.state.mode] || this.modes[1];
    if (def.vals) return def.vals;
    const k = Math.min(1, ((performance.now() - (this.rampStart || 0)) / 1000) / def.dur);
    const e = k * k * (3 - 2 * k);
    const mix = {};
    Object.keys(def.from).forEach(key => { mix[key] = def.from[key] + (def.to[key] - def.from[key]) * e; });
    return mix;
  }

  toggleSound = (ev) => {
    if (ev && ev.stopPropagation) ev.stopPropagation();
    if (!this.actx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) this.actx = new AC();
    }
    if (this.actx && this.actx.state === 'suspended') this.actx.resume();
    this.setState(s => ({ soundOn: !s.soundOn }));
  };

  beep() {
    const a = this.actx;
    if (!a || !this.state.soundOn) return;
    const t = a.currentTime;
    const o = a.createOscillator(), g = a.createGain();
    // pitch drops as SpO2 falls, like a real pulse-oximeter tone
    o.type = 'square';
    o.frequency.value = 520 + (Math.min(100, this.state.spo2) - 90) * 14;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.09, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.075);
    o.connect(g); g.connect(a.destination);
    o.start(t); o.stop(t + 0.09);
  }

  hhmm(d) {
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }

  clock() {
    const d = new Date();
    this.cuffLeft = Math.max(0, this.cuffLeft - 1);
    if (this.cuffLeft === 0) this.cuffLeft = 600;
    const m = Math.floor(this.cuffLeft / 60), s = this.cuffLeft % 60;
    this.setState({ clock: this.hhmm(d), cuffCountdown: String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0') });
  }

  seedHist() {
    const out = [];
    for (let i = 4; i >= 0; i--) {
      const d = new Date(Date.now() - i * 10 * 60000);
      const sys = 119 + Math.round(Math.random() * 5), dia = 79 + Math.round(Math.random() * 4);
      out.push({ t: this.hhmm(d), v: sys + '/' + dia + ' (' + Math.round(dia + (sys - dia) / 3) + ')' });
    }
    return out;
  }

  vitals() {
    const j = (v, sp) => v + (Math.random() * 2 - 1) * sp;
    const b = this.baseNow();
    const hrT = b.hr, spT = b.spo2, rrT = b.rr;
    const hr = Math.max(40, Math.round(j(hrT, 3)));
    const sys = Math.round(j(b.sys, 3)), dia = Math.round(j(b.dia, 2));
    this.setState({
      sys, dia, map: Math.round(dia + (sys - dia) / 3),
      hr,
      pulse: hr + (Math.random() < 0.5 ? 0 : 1) + Math.round(Math.random() * 2),
      spo2: Math.min(100, Math.max(70, Math.round(j(spT, 1.4)))),
      rr: Math.max(6, Math.round(j(rrT, 1.6))),
      temp: j(37.3, 0.15).toFixed(1),
      tempHi: j(40.1, 0.05).toFixed(1),
      tempLo: j(36.9, 0.05).toFixed(1)
    });
  }

  nbp() {
    const b = this.baseNow();
    const sys = Math.round(b.sys + (Math.random() * 6 - 3));
    const dia = Math.round(b.dia + (Math.random() * 4 - 2));
    const map = Math.round(dia + (sys - dia) / 3);
    const t = this.hhmm(new Date());
    if (this.state.hist.length && this.state.hist[this.state.hist.length - 1].t === t) return;
    const hist = this.state.hist.slice(-4).concat([{ t: t, v: sys + '/' + dia + ' (' + map + ')' }]);
    this.setState({ sys, dia, map, hist });
  }

  wave(key, p) {
    const g = (x, c, w) => Math.exp(-Math.pow((x - c) / w, 2));
    if (key === 'ecg') {
      return 0.13 * g(p, 0.14, 0.026) - 0.09 * g(p, 0.195, 0.009)
        + 1.0 * g(p, 0.215, 0.0085) - 0.26 * g(p, 0.245, 0.013)
        + 0.30 * g(p, 0.37, 0.048) + (Math.random() - 0.5) * 0.012;
    }
    if (key === 'pleth') {
      return 0.95 * g(p, 0.22, 0.10) + 0.42 * g(p, 0.45, 0.13) + 0.1 * g(p, 0.7, 0.2) - 0.35;
    }
    return 0.9 * g(p, 0.32, 0.135) + 0.18 * g(p, 0.52, 0.09) - 0.3 + (Math.random() - 0.5) * 0.02;
  }

  period(key) {
    if (key === 'resp') return 60 / Math.max(6, this.state.rr);
    return 60 / Math.max(35, this.state.hr);
  }

  draw(c, dt) {
    const el = this.cv[c.key];
    if (!el) return;
    const dpr = window.devicePixelRatio || 1;
    const w = el.clientWidth, h = el.clientHeight;
    if (!w || !h) return;
    const g = el.getContext('2d');
    if (el.width !== Math.round(w * dpr) || el.height !== Math.round(h * dpr)) {
      el.width = Math.round(w * dpr); el.height = Math.round(h * dpr);
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
      c.x = 0; c.py = null;
    }
    const mid = h * 0.56;
    const per = this.period(c.key);
    const speed = c.speed * (this.props.sweepSpeed ?? 1);
    const total = speed * dt;
    const steps = Math.max(1, Math.ceil(total / 1.5));
    g.lineWidth = 1.8;
    g.strokeStyle = c.color;
    g.lineJoin = 'round';
    g.shadowColor = c.color;
    g.shadowBlur = 6;
    for (let i = 0; i < steps; i++) {
      const sdt = dt / steps, sdx = total / steps;
      const prevPhase = c.phase;
      c.phase = (c.phase + sdt / per) % 1;
      if (c.key === 'ecg' && (prevPhase < 0.215) !== (c.phase < 0.215) && c.phase > prevPhase) this.beep();
      let nx = c.x + sdx;
      const y = mid - this.wave(c.key, c.phase) * h * c.amp;
      if (nx >= w) { nx -= w; c.py = null; }
      g.save(); g.shadowBlur = 0; g.fillStyle = '#000';
      g.fillRect(nx, 0, 22, h);
      if (nx + 22 > w) g.fillRect(0, 0, nx + 22 - w, h);
      g.restore();
      if (c.py !== null) {
        g.beginPath(); g.moveTo(c.x, c.py); g.lineTo(nx, y); g.stroke();
      }
      c.x = nx; c.py = y;
    }
    g.shadowBlur = 0;
  }

  renderVals() {
    const s = this.state;
    return {
      ecgRef: this.crefs.ecg, plethRef: this.crefs.pleth, respRef: this.crefs.resp,
      patient: this.props.patient ?? 'Doe, John',
      hr: s.hr, pulse: s.pulse, spo2: s.spo2, rr: s.rr,
      temp: s.temp, tempHi: s.tempHi ?? '40.1', tempLo: s.tempLo ?? '36.9',
      sys: s.sys, dia: s.dia, map: s.map,
      clock: s.clock, cuffCountdown: s.cuffCountdown, hist: s.hist,
      toggleSound: this.toggleSound, soundLabel: s.soundOn ? 'SOUND ON' : 'SOUND OFF',
      onTap: this.onTap,
      modeLabel: (this.modes[s.mode] || this.modes[1]).label,
      modeColor: (this.modes[s.mode] || this.modes[1]).color,
      tapHint: s.pending ? 'tap x' + s.pending + ' — switching in 2s' : 'tap screen: 1 = stable / 2 = critical / 3 = recovering'
    };
  }
}

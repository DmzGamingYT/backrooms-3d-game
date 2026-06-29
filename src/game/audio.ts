// Procedural audio engine using the Web Audio API. No external sound files.

type Ctx = AudioContext;

export class AudioEngine {
  private ctx: Ctx | null = null;
  private master!: GainNode;
  private noiseBuf!: AudioBuffer;
  private humGain!: GainNode;
  private buzzGain!: GainNode;
  private growlGain!: GainNode;
  private whisperGain!: GainNode;
  private proximity = 0;
  private muted = false;
  private heartTimer: number | null = null;

  // Menu ambient: isolated node tree so we can fade it independently from
  // the gameplay ambience without leaking oscillators into the master bus.
  private menuHumOscs: OscillatorNode[] = [];
  private menuBuzzOsc: OscillatorNode | null = null;
  private menuLfoOsc: OscillatorNode | null = null;
  private menuHumGain: GainNode | null = null;
  private menuBuzzGain: GainNode | null = null;
  // Cleanup queue: every stopMenuHum() pushes a snapshot of the nodes it just
  // silenced. A shared timer (only one in flight at a time) drains the queue,
  // so even rapid double-calls can't leak the previously-snapshotted nodes.
  private menuPendingCleanup: {
    osc: OscillatorNode[];
    buzz: OscillatorNode | null;
    lfo: OscillatorNode | null;
    humGain: GainNode | null;
    buzzGain: GainNode | null;
  }[] = [];
  private menuCleanupTimer: number | null = null;

  init() {
    if (this.ctx) { this.ctx.resume(); return; }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new AC();
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.85;
    this.master.connect(ctx.destination);

    // Shared noise buffer.
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;
  }

  private ensure(): Ctx | null {
    if (!this.ctx) return null;
    if (this.ctx.state === "suspended") this.ctx.resume();
    return this.ctx;
  }

  private noiseSource(loop = false) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = loop;
    return src;
  }

  startAmbience() {
    const ctx = this.ensure();
    if (!ctx) return;
    if (this.humGain) return;

    // Low industrial hum.
    this.humGain = ctx.createGain();
    this.humGain.gain.value = 0.09;
    const humFilter = ctx.createBiquadFilter();
    humFilter.type = "lowpass";
    humFilter.frequency.value = 220;
    this.humGain.connect(humFilter).connect(this.master);
    [55, 82.5, 110].forEach((f, i) => {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.value = i === 0 ? 0.9 : 0.35;
      o.connect(g).connect(this.humGain);
      o.start();
    });

    // Fluorescent buzz.
    this.buzzGain = ctx.createGain();
    this.buzzGain.gain.value = 0.012;
    const buzzFilter = ctx.createBiquadFilter();
    buzzFilter.type = "bandpass";
    buzzFilter.frequency.value = 3200;
    buzzFilter.Q.value = 6;
    this.buzzGain.connect(buzzFilter).connect(this.master);
    const buzz = ctx.createOscillator();
    buzz.type = "sawtooth";
    buzz.frequency.value = 120;
    buzz.connect(this.buzzGain);
    buzz.start();
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 9;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.008;
    lfo.connect(lfoGain).connect(this.buzzGain.gain);
    lfo.start();

    // Monster growl (gain driven by proximity).
    this.growlGain = ctx.createGain();
    this.growlGain.gain.value = 0;
    const growlFilter = ctx.createBiquadFilter();
    growlFilter.type = "lowpass";
    growlFilter.frequency.value = 420;
    this.growlGain.connect(growlFilter).connect(this.master);
    [70, 73, 140].forEach((f) => {
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = f;
      o.connect(this.growlGain);
      o.start();
      const vib = ctx.createOscillator();
      vib.frequency.value = 5.5;
      const vg = ctx.createGain();
      vg.gain.value = 4;
      vib.connect(vg).connect(o.frequency);
      vib.start();
    });

    // Whisper bed (gain driven by 1 - sanity).
    this.whisperGain = ctx.createGain();
    this.whisperGain.gain.value = 0;
    const whisperFilter = ctx.createBiquadFilter();
    whisperFilter.type = "bandpass";
    whisperFilter.frequency.value = 1400;
    whisperFilter.Q.value = 0.8;
    this.whisperGain.connect(whisperFilter).connect(this.master);
    const wsrc = this.noiseSource(true);
    wsrc.connect(this.whisperGain);
    wsrc.start();
    const wlfo = ctx.createOscillator();
    wlfo.frequency.value = 0.35;
    const wlfoGain = ctx.createGain();
    wlfoGain.gain.value = 0.4;
    wlfo.connect(wlfoGain).connect(this.whisperGain.gain);
    wlfo.start();
  }

  /**
   * Soft "evening" hum for the menu. Quieter than the gameplay ambience:
   * just a low industrial drone + a very faint fluorescent buzz with a slow
   * LFO morphing the bandpass center so it feels like a single dying tube
   * in an empty office at night. Used while phase === "menu".
   */
  startMenuHum() {
    const ctx = this.ensure();
    if (!ctx || this.menuHumGain) return;

    // Low industrial drone (sine triad @ 55/82.5/110 Hz, lowpassed).
    this.menuHumGain = ctx.createGain();
    this.menuHumGain.gain.value = 0;
    this.menuHumGain.gain.linearRampToValueAtTime(0.05, ctx.currentTime + 1.4);
    const humLp = ctx.createBiquadFilter();
    humLp.type = "lowpass";
    humLp.frequency.value = 210;
    this.menuHumGain.connect(humLp).connect(this.master);

    [55, 82.5, 110].forEach((f, i) => {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.value = i === 0 ? 0.88 : 0.32;
      o.connect(g).connect(this.menuHumGain!);
      o.start();
      this.menuHumOscs.push(o);
    });

    // Faint fluorescent buzz with a slow LFO sweeping the bandpass center.
    this.menuBuzzGain = ctx.createGain();
    this.menuBuzzGain.gain.value = 0;
    this.menuBuzzGain.gain.linearRampToValueAtTime(0.009, ctx.currentTime + 1.4);
    const bf = ctx.createBiquadFilter();
    bf.type = "bandpass";
    bf.frequency.value = 3000;
    bf.Q.value = 5;
    this.menuBuzzGain.connect(bf).connect(this.master);
    const bz = ctx.createOscillator();
    bz.type = "sawtooth";
    bz.frequency.value = 120;
    bz.connect(this.menuBuzzGain);
    bz.start();
    this.menuBuzzOsc = bz;

    const lfo = ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = 0.18; // ~5.5s throb — evening feeling, not panicked
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 700;
    lfo.connect(lfoGain).connect(bf.frequency);
    lfo.start();
    this.menuLfoOsc = lfo;
  }

  /** Smoothly fade the menu hum to silence and disconnect its node tree. */
  stopMenuHum() {
    const ctx = this.ctx;
    if (!ctx) return;
    // Snapshot the current nodes so the scheduled cleanup applies to the
    // exact nodes we just silenced — even if startMenuHum recreates new ones
    // before the cleanup fires. Null the instance fields immediately so
    // re-entrant startMenuHum can proceed without short-circuiting.
    const payload = {
      osc: this.menuHumOscs,
      buzz: this.menuBuzzOsc,
      lfo: this.menuLfoOsc,
      humGain: this.menuHumGain,
      buzzGain: this.menuBuzzGain,
    };
    this.menuHumOscs = [];
    this.menuBuzzOsc = null;
    this.menuLfoOsc = null;
    this.menuHumGain = null;
    this.menuBuzzGain = null;
    if (payload.humGain) {
      payload.humGain.gain.cancelScheduledValues(ctx.currentTime);
      payload.humGain.gain.setTargetAtTime(0, ctx.currentTime, 0.35);
    }
    if (payload.buzzGain) {
      payload.buzzGain.gain.cancelScheduledValues(ctx.currentTime);
      payload.buzzGain.gain.setTargetAtTime(0, ctx.currentTime, 0.35);
    }
    // Queue the snapshot for later disconnect. Rapid double-calls append to
    // the queue and a single shared timer (kept alive until the queue drains)
    // reaps every entry — no oscillator from any previous batch ever leaks.
    this.menuPendingCleanup.push(payload);
    if (this.menuCleanupTimer !== null) return;
    this.menuCleanupTimer = window.setTimeout(() => {
      const list = this.menuPendingCleanup;
      this.menuPendingCleanup = [];
      this.menuCleanupTimer = null;
      for (const p of list) {
        p.osc.forEach(AudioEngine.safeStop);
        AudioEngine.safeStop(p.buzz);
        AudioEngine.safeStop(p.lfo);
        p.humGain?.disconnect();
        p.buzzGain?.disconnect();
      }
    }, 1200);
  }

  /** Stop an oscillator without throwing if it already stopped. */
  private static safeStop(osc: OscillatorNode | null | undefined) {
    if (!osc) return;
    try { osc.stop(); } catch { /* already stopped */ }
  }

  /** VCR-tape boot stinger for the intro cinematic (▶ PLAY moment).
   * Three layered cues ~700 ms total: a bandpassed click, a bandpassed
   * noise sweep-up (spool whoosh), and a sine sub that drops to sub-bass.
   * Master gain honors setMuted automatically. */
  tapeBoot() {
    const ctx = this.ensure();
    if (!ctx) return;
    const t0 = ctx.currentTime;
    // 1) VCR click — short burst of bandpassed noise (~50 ms).
    const clickSrc = this.noiseSource();
    const clickF = ctx.createBiquadFilter();
    clickF.type = "bandpass";
    clickF.frequency.value = 3800;
    clickF.Q.value = 6;
    const clickG = ctx.createGain();
    clickG.gain.setValueAtTime(0.0001, t0);
    clickG.gain.exponentialRampToValueAtTime(0.08, t0 + 0.005);
    clickG.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.05);
    clickSrc.connect(clickF).connect(clickG).connect(this.master);
    clickSrc.start(t0);
    clickSrc.stop(t0 + 0.07);
    // 2) Spool whoosh — bandpassed noise sweeping up in pitch.
    const spoolSrc = this.noiseSource();
    const spoolF = ctx.createBiquadFilter();
    spoolF.type = "bandpass";
    spoolF.Q.value = 4;
    spoolF.frequency.setValueAtTime(700, t0 + 0.1);
    spoolF.frequency.exponentialRampToValueAtTime(2400, t0 + 0.55);
    const spoolG = ctx.createGain();
    spoolG.gain.setValueAtTime(0.0001, t0 + 0.1);
    spoolG.gain.exponentialRampToValueAtTime(0.16, t0 + 0.3);
    spoolG.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.7);
    spoolSrc.connect(spoolF).connect(spoolG).connect(this.master);
    spoolSrc.start(t0 + 0.1);
    spoolSrc.stop(t0 + 0.75);
    // 3) Sub rumble — sine descending into the chest.
    const grunt = ctx.createOscillator();
    grunt.type = "sine";
    grunt.frequency.setValueAtTime(120, t0 + 0.2);
    grunt.frequency.exponentialRampToValueAtTime(45, t0 + 0.85);
    const gruntG = ctx.createGain();
    gruntG.gain.setValueAtTime(0.0001, t0 + 0.2);
    gruntG.gain.exponentialRampToValueAtTime(0.20, t0 + 0.4);
    gruntG.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.95);
    grunt.connect(gruntG).connect(this.master);
    grunt.start(t0 + 0.2);
    grunt.stop(t0 + 1.0);
  }

  /**
   * Drive the whisper bed from the player's sanity. The whisper source is a
   * looping bandpassed noise that exists from startAmbience() but has its
   * gain held at zero until the player dips below ~60% sanity. Below that,
   * fear ramps linearly to a peak gain of 0.32 at sanity = 0 — enough to
   * read as a constant low-frequency "shhh" without drowning the corridor hum.
   */
  setSanity(sanityNormalized: number) {
    const sanity = Math.max(0, Math.min(1, sanityNormalized));
    const ctx = this.ensure();
    if (!ctx || !this.whisperGain) return;
    // 0 above 0.6 sanity, 1 at sanity=0. Capped so we never blow out the bus.
    const fear = Math.max(0, 0.6 - sanity) / 0.6;
    this.whisperGain.gain.cancelScheduledValues(ctx.currentTime);
    this.whisperGain.gain.setTargetAtTime(fear * 0.32, ctx.currentTime, 0.4);
  }

  setMonsterProximity(p: number) {
    this.proximity = p;
    const ctx = this.ensure();
    if (!ctx || !this.growlGain) return;
    this.growlGain.gain.setTargetAtTime(Math.min(1, p) * 0.5, ctx.currentTime, 0.3);
    if (p > 0.25 && this.heartTimer === null) this.scheduleHeart();
    if (p <= 0.2 && this.heartTimer !== null) {
      clearTimeout(this.heartTimer);
      this.heartTimer = null;
    }
  }

  private scheduleHeart() {
    const bpm = 55 + this.proximity * 95;
    const beat = 60 / bpm;
    this.thump(0, 0.9);
    window.setTimeout(() => this.thump(0, 0.55), beat * 1000 * 0.3);
    const delay = Math.max(420, beat * 1000 * (1.6 - this.proximity));
    this.heartTimer = window.setTimeout(() => this.scheduleHeart(), delay);
  }

  private thump(delay: number, vol: number) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(95, t);
    o.frequency.exponentialRampToValueAtTime(38, t + 0.16);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol * 0.6, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + 0.32);
  }

  footstep(running: boolean) {
    const ctx = this.ensure();
    if (!ctx) return;
    const t = ctx.currentTime;
    const src = this.noiseSource();
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = running ? 1100 : 800;
    const g = ctx.createGain();
    const vol = running ? 0.16 : 0.1;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
    src.connect(f).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + 0.16);
  }

  pickup() {
    this.blip([660, 880, 1320], 0.18, "sine", 0.16);
  }

  /** Soft footstep for carpeted/walked floors — quieter and duller than
   *  the gameplay footstep(). Used during the bedroom intro cinematic
   *  so the character walking around the room doesn't sound like it's
   *  on a tile corridor. ~180 ms total. */
  footstepSoft() {
    const ctx = this.ensure();
    if (!ctx) return;
    const t = ctx.currentTime;
    const src = this.noiseSource();
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 540;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.07, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.20);
    src.connect(f).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + 0.22);
  }

  /** Cardboard-on-screen "clack" for the moment in the intro where the
   *  character places the box against the TV. Combines a high-frequency
   *  triangle transient (the plastic/cardboard tap) with a low-frequency
   *  sine sub (the hollow body of the box resonated). ~180 ms total. */
  boxClack() {
    const ctx = this.ensure();
    if (!ctx) return;
    const t = ctx.currentTime;
    // Wooden transient — triangle descending 880 → 220 Hz, sharp envelope.
    const o1 = ctx.createOscillator();
    o1.type = "triangle";
    o1.frequency.setValueAtTime(880, t);
    o1.frequency.exponentialRampToValueAtTime(220, t + 0.05);
    const g1 = ctx.createGain();
    g1.gain.setValueAtTime(0.0001, t);
    g1.gain.exponentialRampToValueAtTime(0.07, t + 0.002);
    g1.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
    o1.connect(g1).connect(this.master);
    o1.start(t);
    o1.stop(t + 0.10);
    // Box body — sine sub dropping 60 → 40 Hz, half-volume.
    const o2 = ctx.createOscillator();
    o2.type = "sine";
    o2.frequency.setValueAtTime(60, t);
    o2.frequency.exponentialRampToValueAtTime(40, t + 0.12);
    const g2 = ctx.createGain();
    g2.gain.setValueAtTime(0.0001, t);
    g2.gain.exponentialRampToValueAtTime(0.16, t + 0.005);
    g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    o2.connect(g2).connect(this.master);
    o2.start(t);
    o2.stop(t + 0.20);
  }

  /**
   * Short UI tick for menu button hovers / clicks. Two variants share the
   * same shape (filtered triangle blip, ~80 ms) but differ in pitch and
   * gain so a hover feels lighter than a confirm. The master gain already
   * accounts for setMuted(), so we don't need to mute-check here.
   */
  playUi(variant: "hover" | "click" = "hover") {
    const ctx = this.ensure();
    if (!ctx) return;
    const t = ctx.currentTime;
    const pitch = variant === "hover" ? 1480 : 1980;
    const vol = variant === "hover" ? 0.045 : 0.07;
    // Body: triangle blip, lightly lowpassed to soften the 1480/1980 edge.
    const o = ctx.createOscillator();
    o.type = "triangle";
    o.frequency.setValueAtTime(pitch, t);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 5200;
    o.connect(g).connect(lp).connect(this.master);
    o.start(t);
    o.stop(t + 0.1);
    // Click variant adds a bandpassed noise transient so the click feels
    // mechanical rather than purely tonal (think room-tone key press).
    if (variant === "click") {
      const noiseSrc = this.noiseSource();
      const nf = ctx.createBiquadFilter();
      nf.type = "bandpass";
      nf.frequency.value = 4500;
      nf.Q.value = 4;
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(0.0001, t);
      ng.gain.exponentialRampToValueAtTime(0.025 * (vol / 0.07), t + 0.002);
      ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
      noiseSrc.connect(nf).connect(ng).connect(this.master);
      noiseSrc.start(t);
      noiseSrc.stop(t + 0.06);
    }
  }

  battery() {
    this.blip([440, 660], 0.12, "square", 0.1);
  }

  flashlight() {
    this.blip([1800, 2200], 0.04, "square", 0.05);
  }

  /** Battery-exhausted dying buzz when the flashlight cuts out mid-run. */
  flashlightDie() {
    const ctx = this.ensure();
    if (!ctx) return;
    const t = ctx.currentTime;
    // Square descending 380 → 140 Hz gives the "tube going out" reading.
    const o = ctx.createOscillator();
    o.type = "square";
    o.frequency.setValueAtTime(380, t);
    o.frequency.exponentialRampToValueAtTime(140, t + 0.32);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.14, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + 0.5);
  }

  /** Soft "click-click" when the player tries to toggle the flashlight
   *  on while they're out of batteries — tells them why nothing happened
   *  without re-using the full flashlight toggle sound. */
  flashlightEmpty() {
    this.blip([1200, 900], 0.05, "square", 0.06);
  }

  private blip(freqs: number[], step: number, type: OscillatorType, vol: number) {
    const ctx = this.ensure();
    if (!ctx) return;
    const t0 = ctx.currentTime;
    freqs.forEach((f, i) => {
      const t = t0 + i * step;
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + step + 0.06);
      o.connect(g).connect(this.master);
      o.start(t);
      o.stop(t + step + 0.1);
    });
  }

  win() {
    const notes = [392, 523, 659, 784, 1046];
    notes.forEach((f, i) => window.setTimeout(() => this.blip([f], 0.18, "triangle", 0.18), i * 140));
  }

  lose() {
    const ctx = this.ensure();
    if (!ctx) return;
    const t = ctx.currentTime;
    // Descending dissonant tones.
    [196, 185, 130, 98].forEach((f, i) => {
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.setValueAtTime(f * 2, t + i * 0.18);
      o.frequency.exponentialRampToValueAtTime(f, t + i * 0.18 + 0.3);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t + i * 0.18);
      g.gain.exponentialRampToValueAtTime(0.2, t + i * 0.18 + 0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.18 + 0.9);
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 700;
      o.connect(g).connect(lp).connect(this.master);
      o.start(t + i * 0.18);
      o.stop(t + i * 0.18 + 1);
    });
    // Noise swell.
    const src = this.noiseSource();
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.18, t + 0.4);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
    src.connect(g).connect(this.master);
    src.start(t);
    src.stop(t + 1.5);
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    // Cancel any ramp already in flight so setTargetAtTime is the only
    // schedule — otherwise the linear ramp from startMenuHum could race the
    // exponential target and produce a non-monotone volume curve.
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setTargetAtTime(m ? 0 : 0.85, t, 0.05);
    const menuScale = m ? 0 : 1;
    if (this.menuHumGain) {
      this.menuHumGain.gain.cancelScheduledValues(t);
      this.menuHumGain.gain.setTargetAtTime(menuScale * 0.05, t, 0.2);
    }
    if (this.menuBuzzGain) {
      this.menuBuzzGain.gain.cancelScheduledValues(t);
      this.menuBuzzGain.gain.setTargetAtTime(menuScale * 0.009, t, 0.2);
    }
  }

  isMuted() { return this.muted; }
}


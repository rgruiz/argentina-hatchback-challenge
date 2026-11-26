/**
 * Web Audio Synthesizer for Argentina Hatchback Challenge Engines (1.6 MSI & 1.3 8V Firefly), Curbs & Tires
 */
class SoundEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.initialized = false;
    this.carAudioKey = 'polo';
    this.pitchFactor = 1.0;
    this.filterOffset = 0;

    // Engine nodes
    this.osc1 = null;
    this.osc2 = null;
    this.oscSub = null;
    this.engineFilter = null;
    this.cabinFilter = null;
    this.engineGain = null;

    // Tire screech nodes
    this.screechGain = null;
    this.screechFilter = null;

    // Curb rumble nodes
    this.curbOsc = null;
    this.curbGain = null;
  }

  init() {
    if (this.initialized) {
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
      return;
    }

    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;

    this.ctx = new AudioCtx();
    this.initialized = true;

    // Master gain
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.42;
    this.masterGain.connect(this.ctx.destination);

    // --- 1. 4-Cylinder 1.6L Engine Synth ---
    this.osc1 = this.ctx.createOscillator();
    this.osc2 = this.ctx.createOscillator();
    this.oscSub = this.ctx.createOscillator();

    this.osc1.type = 'sawtooth';
    this.osc2.type = 'triangle';
    this.oscSub.type = 'square';

    const osc1Gain = this.ctx.createGain();
    const osc2Gain = this.ctx.createGain();
    const subGain = this.ctx.createGain();

    osc1Gain.gain.value = 0.35;
    osc2Gain.gain.value = 0.45;
    subGain.gain.value = 0.16;

    this.engineFilter = this.ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 380;
    this.engineFilter.Q.value = 2.8;

    // Cabin filter changes acoustic profile between Cockpit Cam and Exterior Cam
    this.cabinFilter = this.ctx.createBiquadFilter();
    this.cabinFilter.type = 'lowpass';
    this.cabinFilter.frequency.value = 3200;

    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0.0;

    this.osc1.connect(osc1Gain);
    this.osc2.connect(osc2Gain);
    this.oscSub.connect(subGain);

    osc1Gain.connect(this.engineFilter);
    osc2Gain.connect(this.engineFilter);
    subGain.connect(this.engineFilter);

    this.engineFilter.connect(this.cabinFilter);
    this.cabinFilter.connect(this.engineGain);
    this.engineGain.connect(this.masterGain);

    this.osc1.start();
    this.osc2.start();
    this.oscSub.start();

    // --- 2. Tire Screech Generator (Noise + Resonant Bandpass) ---
    const bufferSize = this.ctx.sampleRate * 2;
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }

    const whiteNoise = this.ctx.createBufferSource();
    whiteNoise.buffer = noiseBuffer;
    whiteNoise.loop = true;

    this.screechFilter = this.ctx.createBiquadFilter();
    this.screechFilter.type = 'bandpass';
    this.screechFilter.frequency.value = 1450;
    this.screechFilter.Q.value = 8.5;

    this.screechGain = this.ctx.createGain();
    this.screechGain.gain.value = 0.0;

    whiteNoise.connect(this.screechFilter);
    this.screechFilter.connect(this.screechGain);
    this.screechGain.connect(this.masterGain);
    whiteNoise.start();

    // --- 3. Curb (Pianito) Rumble Synth ---
    this.curbOsc = this.ctx.createOscillator();
    this.curbOsc.type = 'sawtooth';
    this.curbOsc.frequency.value = 55;

    const curbFilter = this.ctx.createBiquadFilter();
    curbFilter.type = 'lowpass';
    curbFilter.frequency.value = 180;

    this.curbGain = this.ctx.createGain();
    this.curbGain.gain.value = 0.0;

    this.curbOsc.connect(curbFilter);
    curbFilter.connect(this.curbGain);
    this.curbGain.connect(this.masterGain);
    this.curbOsc.start();
  }

  update(rpm, throttle, slipRatio, onCurb, speedKmh, isCockpit) {
    if (!this.initialized || this.muted || !this.ctx) return;

    const now = this.ctx.currentTime;

    // 4-cylinder firing frequency: (RPM / 60) * 2
    const baseFreq = Math.max(26, (rpm / 60) * 1.85 * this.pitchFactor);
    this.osc1.frequency.setTargetAtTime(baseFreq, now, 0.03);
    this.osc2.frequency.setTargetAtTime(baseFreq * 2.0, now, 0.03);
    this.oscSub.frequency.setTargetAtTime(baseFreq * 0.5, now, 0.03);

    // Filter opens up with throttle and high RPM
    const filterFreq = Math.max(160, 220 + this.filterOffset + (rpm / 7000) * 1400 + throttle * 550);
    this.engineFilter.frequency.setTargetAtTime(filterFreq, now, 0.04);

    // Cockpit acoustic damping vs Exterior exhaust note
    this.cabinFilter.frequency.setTargetAtTime(isCockpit ? 1350 : 3800, now, 0.08);

    const targetEngineGain = 0.16 + throttle * 0.14 + (rpm / 7000) * 0.12;
    this.engineGain.gain.setTargetAtTime(targetEngineGain, now, 0.05);

    // Tire squeal
    const squealIntensity = Math.min(1.0, Math.max(0, (slipRatio - 0.22) * 1.6));
    this.screechGain.gain.setTargetAtTime(squealIntensity * 0.22, now, 0.04);
    this.screechFilter.frequency.setTargetAtTime(1250 + squealIntensity * 420, now, 0.05);

    // Curb (pianito) rumble frequency proportional to wheel speed
    if (onCurb && speedKmh > 8) {
      const rumbleFreq = 32 + Math.min(130, speedKmh * 0.65);
      this.curbOsc.frequency.setTargetAtTime(rumbleFreq, now, 0.02);
      this.curbGain.gain.setTargetAtTime(0.28, now, 0.02);
    } else {
      this.curbGain.gain.setTargetAtTime(0.0, now, 0.04);
    }
  }

  playShiftSound() {
    if (!this.initialized || this.muted || !this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.exponentialRampToValueAtTime(55, now + 0.07);
    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.08);
  }

  playBeep(freq = 440, duration = 0.16) {
    if (!this.initialized || this.muted || !this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(freq, now);
    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  playLapChime() {
    if (!this.initialized || this.muted || !this.ctx) return;
    this.playBeep(587.33, 0.12);
    setTimeout(() => this.playBeep(880, 0.25), 120);
  }

  setCarAudioProfile(carKey) {
    this.carAudioKey = carKey;
    if (carKey === 'peugeot208') {
      // 1.3L 8V Firefly: slightly punchier, lower-pitched 8-valve midrange tone
      this.pitchFactor = 0.94;
      this.filterOffset = 110;
    } else {
      // 1.6L 16V MSI
      this.pitchFactor = 1.0;
      this.filterOffset = 0;
    }
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(this.muted ? 0 : 0.42, this.ctx.currentTime, 0.04);
    }
    return this.muted;
  }
}

window.SoundEngine = SoundEngine;

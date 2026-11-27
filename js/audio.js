/**
 * Web Audio Synthesizer for Argentina Hatchback Challenge Engines (1.6 MSI & 1.3 8V Firefly),
 * Curbs, Tires, Heavy Braking & Spatial AI Opponents
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

    // Player heavy braking nodes
    this.brakeRaspFilter = null;
    this.brakeRaspGain = null;
    this.brakeSquealFilter = null;
    this.brakeSquealGain = null;

    // Shared noise & Spatial AI audio voices (up to MAX_AI = 3)
    this.noiseBuffer = null;
    this.aiVoices = [];
  }

  getCarAudioParams(carKey) {
    if (carKey === 'peugeot208') {
      // 1.3L 8V Firefly: slightly punchier, lower-pitched 8-valve midrange tone
      return { pitchFactor: 0.94, filterOffset: 110 };
    }
    // 1.6L 16V MSI
    return { pitchFactor: 1.0, filterOffset: 0 };
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

    // --- 1. 4-Cylinder Engine Synth ---
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
    this.noiseBuffer = noiseBuffer;

    const whiteNoise = this.ctx.createBufferSource();
    whiteNoise.buffer = this.noiseBuffer;
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

    // --- 4. Player Heavy Braking Synth (Pad/Rotor Friction Rasp + Pad Bite Squeal) ---
    this.brakeRaspFilter = this.ctx.createBiquadFilter();
    this.brakeRaspFilter.type = 'bandpass';
    this.brakeRaspFilter.frequency.value = 760;
    this.brakeRaspFilter.Q.value = 2.2;

    this.brakeRaspGain = this.ctx.createGain();
    this.brakeRaspGain.gain.value = 0.0;

    whiteNoise.connect(this.brakeRaspFilter);
    this.brakeRaspFilter.connect(this.brakeRaspGain);
    this.brakeRaspGain.connect(this.masterGain);

    this.brakeSquealFilter = this.ctx.createBiquadFilter();
    this.brakeSquealFilter.type = 'bandpass';
    this.brakeSquealFilter.frequency.value = 2650;
    this.brakeSquealFilter.Q.value = 10.5;

    this.brakeSquealGain = this.ctx.createGain();
    this.brakeSquealGain.gain.value = 0.0;

    whiteNoise.connect(this.brakeSquealFilter);
    this.brakeSquealFilter.connect(this.brakeSquealGain);
    this.brakeSquealGain.connect(this.masterGain);

    // --- 5. Spatial AI Car Voices (Pool of 3 matching MAX_AI) ---
    this.aiVoices = [];
    for (let i = 0; i < 3; i++) {
      const osc1 = this.ctx.createOscillator();
      const osc2 = this.ctx.createOscillator();
      osc1.type = 'sawtooth';
      osc2.type = 'triangle';

      const vOsc1Gain = this.ctx.createGain();
      const vOsc2Gain = this.ctx.createGain();
      vOsc1Gain.gain.value = 0.40;
      vOsc2Gain.gain.value = 0.42;

      const engineFilter = this.ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 400;
      engineFilter.Q.value = 2.4;

      const engineGain = this.ctx.createGain();
      engineGain.gain.value = 0.0;

      const brakeFilter = this.ctx.createBiquadFilter();
      brakeFilter.type = 'bandpass';
      brakeFilter.frequency.value = 2100;
      brakeFilter.Q.value = 5.5;

      const brakeGain = this.ctx.createGain();
      brakeGain.gain.value = 0.0;

      const distGain = this.ctx.createGain();
      distGain.gain.value = 0.0;

      const panner = typeof this.ctx.createStereoPanner === 'function'
        ? this.ctx.createStereoPanner()
        : null;
      const voiceBus = panner || distGain;

      osc1.connect(vOsc1Gain);
      osc2.connect(vOsc2Gain);
      vOsc1Gain.connect(engineFilter);
      vOsc2Gain.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(voiceBus);

      whiteNoise.connect(brakeFilter);
      brakeFilter.connect(brakeGain);
      brakeGain.connect(voiceBus);

      if (panner) {
        panner.connect(distGain);
      }
      distGain.connect(this.masterGain);

      osc1.start();
      osc2.start();

      this.aiVoices.push({
        osc1,
        osc2,
        engineFilter,
        engineGain,
        brakeFilter,
        brakeGain,
        panner,
        distGain,
        detuneOffset: (i - 1) * 0.022
      });
    }

    whiteNoise.start();
  }

  update(rpm, throttle, slipRatio, onCurb, speedKmh, isCockpit, brakeInput = 0, handbrakeInput = 0, surface = 'asphalt') {
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

    // Heavy braking sound (>= 50% brake pressure or handbrake at speed)
    const effectiveBrake = Math.max(brakeInput || 0, handbrakeInput ? 0.75 : 0);
    if (effectiveBrake >= 0.5 && speedKmh > 12) {
      const pressure = Math.min(1, (effectiveBrake - 0.45) / 0.55);
      const speedFactor = Math.min(1, Math.max(0, (speedKmh - 12) / 90));
      const isGrass = surface === 'grass';
      const cabinScale = isCockpit ? 0.74 : 1.0;

      const raspFreq = isGrass
        ? (420 + speedFactor * 220)
        : (640 + speedFactor * 360 + pressure * 140);
      const raspGain = pressure * speedFactor * (isGrass ? 0.16 : 0.24) * cabinScale;

      const squealFreq = 2350 + speedFactor * 580 + pressure * 240;
      const squealGain = (speedKmh > 22 ? 1 : 0) * pressure * speedFactor * (isGrass ? 0.03 : 0.13) * cabinScale;

      this.brakeRaspFilter.frequency.setTargetAtTime(raspFreq, now, 0.035);
      this.brakeRaspGain.gain.setTargetAtTime(raspGain, now, 0.035);
      this.brakeSquealFilter.frequency.setTargetAtTime(squealFreq, now, 0.035);
      this.brakeSquealGain.gain.setTargetAtTime(squealGain, now, 0.035);
    } else {
      this.brakeRaspGain.gain.setTargetAtTime(0.0, now, 0.04);
      this.brakeSquealGain.gain.setTargetAtTime(0.0, now, 0.04);
    }

    // Curb (pianito) rumble frequency proportional to wheel speed
    if (onCurb && speedKmh > 8) {
      const rumbleFreq = 32 + Math.min(130, speedKmh * 0.65);
      this.curbOsc.frequency.setTargetAtTime(rumbleFreq, now, 0.02);
      this.curbGain.gain.setTargetAtTime(0.28, now, 0.02);
    } else {
      this.curbGain.gain.setTargetAtTime(0.0, now, 0.04);
    }
  }

  updateAIVoices(listener, aiRacers = [], isCockpit = false) {
    if (!this.initialized || this.muted || !this.ctx || !listener) return;

    const now = this.ctx.currentTime;
    const fwdX = Math.sin(listener.heading || 0);
    const fwdZ = Math.cos(listener.heading || 0);
    // Physical right vector in Three.js world coordinates (+Z forward, +X left, -X right)
    const physRightX = -fwdZ;
    const physRightZ = fwdX;
    const maxDist = 85.0;

    for (let i = 0; i < this.aiVoices.length; i++) {
      const voice = this.aiVoices[i];
      const racer = i < aiRacers.length ? aiRacers[i] : null;
      const p = racer ? racer.physics : null;

      if (!p) {
        voice.distGain.gain.setTargetAtTime(0.0, now, 0.04);
        voice.engineGain.gain.setTargetAtTime(0.0, now, 0.04);
        voice.brakeGain.gain.setTargetAtTime(0.0, now, 0.04);
        continue;
      }

      const dx = p.x - listener.x;
      const dz = p.z - listener.z;
      const dist = Math.hypot(dx, dz);

      if (dist >= maxDist) {
        voice.distGain.gain.setTargetAtTime(0.0, now, 0.05);
        voice.brakeGain.gain.setTargetAtTime(0.0, now, 0.05);
        continue;
      }

      const att = Math.pow(1 / (1 + (dist / 13) * (dist / 13)), 0.72) * (1 - dist / maxDist);

      if (voice.panner) {
        const lat = dx * physRightX + dz * physRightZ;
        const pan = Math.max(-0.92, Math.min(0.92, lat / Math.max(4.5, dist * 0.75)));
        voice.panner.pan.setTargetAtTime(pan, now, 0.04);
      }

      let doppler = 1.0;
      if (dist > 0.25) {
        const rvx = (p.vx || 0) - (listener.vx || 0);
        const rvz = (p.vz || 0) - (listener.vz || 0);
        const closingVel = -(rvx * (dx / dist) + rvz * (dz / dist));
        doppler = Math.max(0.88, Math.min(1.14, 1 + closingVel / 340));
      }

      const profile = this.getCarAudioParams(racer.carKey);
      const rpm = p.rpm || 850;
      const throttle = p.throttleInput || 0;
      const baseFreq = Math.max(26, (rpm / 60) * 1.85 * profile.pitchFactor * (1 + voice.detuneOffset) * doppler);

      voice.osc1.frequency.setTargetAtTime(baseFreq, now, 0.03);
      voice.osc2.frequency.setTargetAtTime(baseFreq * 2.0, now, 0.03);

      const eFilterFreq = Math.max(
        180,
        (220 + profile.filterOffset + (rpm / 7000) * 1350 + throttle * 520) * (isCockpit ? 0.72 : 1.0)
      );
      voice.engineFilter.frequency.setTargetAtTime(eFilterFreq, now, 0.04);
      voice.engineGain.gain.setTargetAtTime(0.16 + throttle * 0.14 + (rpm / 7000) * 0.12, now, 0.05);

      const effBrake = Math.max(p.brakeInput || 0, p.handbrakeInput ? 0.75 : 0);
      if (effBrake >= 0.5 && p.speedKmh > 14) {
        const bPress = Math.min(1, (effBrake - 0.45) / 0.55);
        const bSpeed = Math.min(1, Math.max(0, (p.speedKmh - 14) / 90));
        const isGrass = p.surface === 'grass';
        const bFreq = (isGrass ? 700 : 1850 + bSpeed * 650 + bPress * 220) * doppler;
        const bGain = bPress * bSpeed * (isGrass ? 0.10 : 0.24);
        voice.brakeFilter.frequency.setTargetAtTime(bFreq, now, 0.04);
        voice.brakeGain.gain.setTargetAtTime(bGain, now, 0.035);
      } else {
        voice.brakeGain.gain.setTargetAtTime(0.0, now, 0.04);
      }

      voice.distGain.gain.setTargetAtTime(att * (isCockpit ? 0.58 : 0.88), now, 0.04);
    }
  }

  silenceDynamic() {
    if (!this.initialized || !this.ctx) return;
    const now = this.ctx.currentTime;
    if (this.engineGain) this.engineGain.gain.setTargetAtTime(0.0, now, 0.04);
    if (this.screechGain) this.screechGain.gain.setTargetAtTime(0.0, now, 0.04);
    if (this.curbGain) this.curbGain.gain.setTargetAtTime(0.0, now, 0.04);
    if (this.brakeRaspGain) this.brakeRaspGain.gain.setTargetAtTime(0.0, now, 0.04);
    if (this.brakeSquealGain) this.brakeSquealGain.gain.setTargetAtTime(0.0, now, 0.04);
    for (let i = 0; i < this.aiVoices.length; i++) {
      const v = this.aiVoices[i];
      v.distGain.gain.setTargetAtTime(0.0, now, 0.04);
      v.engineGain.gain.setTargetAtTime(0.0, now, 0.04);
      v.brakeGain.gain.setTargetAtTime(0.0, now, 0.04);
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
    const profile = this.getCarAudioParams(carKey);
    this.pitchFactor = profile.pitchFactor;
    this.filterOffset = profile.filterOffset;
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

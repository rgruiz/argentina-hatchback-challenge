/**
 * Realistic Stock Engine Physics & Strictly Manual 5-Speed Gearbox
 * Supports:
 * - VW Polo Track MY25: 1.6L MSI 16V (110 CV / 155 Nm)
 * - Peugeot 208 Like MT: 1.3L Firefly 8V (96 CV / 125 Nm)
 */
class ArcadePhysics {
  constructor(track, soundEngine) {
    this.track = track;
    this.sound = soundEngine;

    this.carProfiles = {
      polo: {
        name: 'VW Polo Track 1.6 MSI',
        idleRpm: 850,
        redlineRpm: 6500,
        maxRpm: 6650,
        steerAgility: 1.0,
        // Real MQ200 5-Speed Manual Gear Max Speeds at 6,500 RPM (km/h)
        gearRedlineSpeeds: { '-1': 42, '1': 48, '2': 86, '3': 126, '4': 162, '5': 192 },
        // 1.6L 16V 110 CV / 155 Nm acceleration curve (~10.6s 0-100 km/h)
        gearBaseAccel: { '-1': -4.2, '1': 5.25, '2': 3.65, '3': 2.55, '4': 1.82, '5': 1.32 }
      },
      peugeot208: {
        name: 'Peugeot 208 Like MT 1.3 8V',
        idleRpm: 820,
        redlineRpm: 6250,
        maxRpm: 6400,
        steerAgility: 1.08,
        // Shorter 5-Speed Manual ratios matched to 1.3L 8V 96 CV / 125 Nm (~180 km/h top)
        gearRedlineSpeeds: { '-1': 40, '1': 44, '2': 79, '3': 116, '4': 150, '5': 180 },
        // 1.3L 8V 96 CV / 125 Nm progressive pull (~11.8s 0-100 km/h)
        gearBaseAccel: { '-1': -3.9, '1': 4.75, '2': 3.28, '3': 2.28, '4': 1.62, '5': 1.15 }
      }
    };

    this.activeCarKey = 'polo';
    this.autoTransmission = false;
    this.applyCarProfile('polo');
    this.resetToStart();
  }

  applyCarProfile(carKey) {
    const profile = this.carProfiles[carKey] || this.carProfiles.polo;
    this.activeCarKey = carKey in this.carProfiles ? carKey : 'polo';
    this.idleRpm = profile.idleRpm;
    this.redlineRpm = profile.redlineRpm;
    this.maxRpm = profile.maxRpm;
    this.steerAgility = profile.steerAgility;
    this.gearRedlineSpeeds = profile.gearRedlineSpeeds;
    this.gearBaseAccel = profile.gearBaseAccel;
  }

  setCarProfile(carKey) {
    this.applyCarProfile(carKey);
    this.resetToStart();
  }

  resetToGridSlot(slotIndex = 0, isRace = false) {
    this.resetToStart(slotIndex, isRace);
  }

  resetToStart(slotIndex = 0, isRace = false) {
    const N = this.track.samples.length;
    const idx = isRace ? ((N - 3 - slotIndex * 3 + N * 4) % N) : 0;
    const startSample = this.track.samples[idx];
    const tan = startSample.tangent;
    const lat = isRace ? ((slotIndex % 2 === 0) ? 2.6 : -2.6) : 0;

    this.x = startSample.point.x + startSample.right.x * lat;
    this.y = startSample.point.y;
    this.z = startSample.point.z + startSample.right.z * lat;

    this.heading = Math.atan2(tan.x, tan.z);

    this.vx = 0;
    this.vz = 0;
    this.speed = 0; // m/s signed
    this.speedKmh = 0;

    this.steerAngle = 0;
    this.rollAngle = 0;
    this.pitchAngle = 0;

    this.gear = 1; // Starts in 1st gear ready to launch manually
    this.rpm = this.idleRpm;
    this.shiftTimer = 0;

    this.throttleInput = 0;
    this.brakeInput = 0;
    this.handbrakeInput = 0;

    this.slipRatio = 0;
    this.surface = 'asphalt';
    this.onCurb = false;
    this.curbShake = 0;
    this.cornerName = 'RECTA PRINCIPAL';
    this.trackSampleIndex = idx;

    // Lap & Sector Timing State
    this.lapCount = 1;
    this.lapTime = 0;
    this.lastLapTime = null;
    this.bestLapTime = null;
    this.timingStarted = false;

    this.currentSector = 1;
    this.sectorStartTimes = [0, 0, 0];
    this.sectorTimes = [null, null, null];
    this.passedCheckpoints = new Set([0]);
    this.lastTrackT = startSample.t;

    // Race Progression & Finish State
    this.raceFinished = false;
    this.finishTime = null;
    this.totalRaceTime = 0;
  }

  /**
   * Returns continuous monotonic race distance in laps (e.g. 1.42 = 42% through Lap 2),
   * safely wrapping pre-start grid slots behind t=1.0 into [-0.05..0.0].
   */
  getRaceProgress() {
    let lapFrac = this.lastTrackT;
    if (!this.passedCheckpoints.has(1) && lapFrac > 0.82) {
      lapFrac -= 1.0;
    }
    return (this.lapCount - 1) + lapFrac;
  }

  manualShiftUp() {
    if (this.gear === -1) {
      this.gear = 1;
      this.shiftTimer = 0.14;
      if (this.sound) this.sound.playShiftSound();
    } else if (this.gear < 5) {
      this.gear++;
      this.shiftTimer = 0.15;
      if (this.sound) this.sound.playShiftSound();
    }
  }

  manualShiftDown() {
    if (this.gear > 1) {
      this.gear--;
      this.shiftTimer = 0.12;
      if (this.sound) this.sound.playShiftSound();
    } else if (this.gear === 1 && this.speedKmh < 18) {
      this.gear = -1;
      this.shiftTimer = 0.14;
      if (this.sound) this.sound.playShiftSound();
    }
  }

  /**
   * Naturally Aspirated Torque Curve Factor (0.0 to 1.0) tuned per engine:
   * - 1.6 MSI 16V: linear pull peaking 4,000-5,750 RPM, 6,500 RPM fuel cut
   * - 1.3 Firefly 8V: strong low-end/midrange torque around 3,500 RPM, softer top-end above 5,400 RPM, 6,250 RPM fuel cut
   */
  getEngineTorqueFactor(rpm) {
    if (rpm >= this.redlineRpm) {
      return -0.15;
    }

    if (this.activeCarKey === 'peugeot208') {
      if (rpm < 1400) {
        return 0.62 + ((rpm - this.idleRpm) / (1400 - this.idleRpm)) * 0.18;
      }
      if (rpm < 3600) {
        return 0.80 + ((rpm - 1400) / 2200) * 0.20; // 125 Nm 8V midrange peak
      }
      if (rpm < 5300) {
        return 1.0 - ((rpm - 3600) / 1700) * 0.10;
      }
      return Math.max(0.56, 0.90 - ((rpm - 5300) / (this.redlineRpm - 5300)) * 0.34);
    }

    if (rpm < 1500) {
      return 0.58 + ((rpm - this.idleRpm) / (1500 - this.idleRpm)) * 0.18;
    }
    if (rpm < 4200) {
      return 0.76 + ((rpm - 1500) / 2700) * 0.24; // Climbs to 1.0 peak torque at 4,200 RPM
    }
    if (rpm < 5800) {
      return 1.0 - ((rpm - 4200) / 1600) * 0.08; // Holds strong to 5,750 RPM peak power
    }
    return 0.92 - ((rpm - 5800) / (this.redlineRpm - 5800)) * 0.28;
  }

  update(dt, inputs, canDrive = true, otherRacers = null) {
    dt = Math.min(dt, 0.05);

    const forwardX = Math.sin(this.heading);
    const forwardZ = Math.cos(this.heading);
    const rightX = Math.cos(this.heading);
    const rightZ = -Math.sin(this.heading);

    let forwardSpeed = this.vx * forwardX + this.vz * forwardZ;
    let lateralSpeed = this.vx * rightX + this.vz * rightZ;

    this.speed = forwardSpeed;
    this.speedKmh = Math.abs(forwardSpeed) * 3.6;

    const up = canDrive
      ? (typeof inputs.throttle === 'number' ? THREE.MathUtils.clamp(inputs.throttle, 0, 1) : (inputs.up ? 1 : 0))
      : 0;
    const down = canDrive
      ? (typeof inputs.brake === 'number' ? THREE.MathUtils.clamp(inputs.brake, 0, 1) : (inputs.down ? 1 : 0))
      : 0;
    const handbrake = canDrive && inputs.handbrake ? 1 : 0;

    this.handbrakeInput = handbrake;
    this.throttleInput = up;
    this.brakeInput = down;

    if (canDrive && (this.throttleInput > 0 || Math.abs(this.speed) > 0.5)) {
      this.timingStarted = true;
    }

    // Progressive steering sensitivity (supports analog AI steer [-1..1] or digital keys)
    const targetSteerInput = canDrive
      ? (typeof inputs.steer === 'number'
        ? THREE.MathUtils.clamp(inputs.steer, -1, 1)
        : ((inputs.left ? 1 : 0) - (inputs.right ? 1 : 0)))
      : 0;
    const speedFactor = Math.min(1.0, this.speedKmh / 185);
    const maxSteerRad = THREE.MathUtils.lerp(0.50, 0.21, speedFactor);
    const targetSteer = targetSteerInput * maxSteerRad;
    const steerRate = targetSteerInput !== 0 ? 7.0 : 9.0;
    this.steerAngle = THREE.MathUtils.lerp(this.steerAngle, targetSteer, Math.min(1, dt * steerRate));

    if (this.shiftTimer > 0) {
      this.shiftTimer -= dt;
    }

    // Mechanical RPM calculation directly tied to current gear ratio and wheel speed
    const redlineSpeedForGear = this.gearRedlineSpeeds[String(this.gear)] || 190;
    const mechanicalRpm = (this.speedKmh / redlineSpeedForGear) * this.redlineRpm;

    // Auto-clutch below 1,350 RPM so the car launches smoothly in 1st gear without stalling
    let targetRpm = Math.max(this.idleRpm, mechanicalRpm);
    if (mechanicalRpm < 1450 && this.throttleInput > 0) {
      targetRpm = Math.max(mechanicalRpm, this.idleRpm + this.throttleInput * 950);
    }

    // Rev-limiter flutter at 6,500 RPM if player doesn't shift up
    if (targetRpm >= this.redlineRpm && this.throttleInput > 0) {
      targetRpm = this.redlineRpm - (Math.sin(performance.now() * 0.08) * 90);
    }

    this.rpm = THREE.MathUtils.lerp(this.rpm, Math.min(this.maxRpm, targetRpm), Math.min(1, dt * 16));

    // Realistic Stock Acceleration per gear for active car profile
    const gearBaseAccel = this.gearBaseAccel[String(this.gear)] || 2.0;

    let driveAccel = 0;
    if (this.shiftTimer <= 0 && this.throttleInput > 0) {
      const torqueFactor = this.getEngineTorqueFactor(this.rpm);
      // If player tries to launch in 4th or 5th gear from low speed, bog down realistically
      const bogFactor = (this.gear >= 3 && this.rpm < 1500) ? (0.35 / (this.gear - 1)) : 1.0;

      if (this.gear === -1) {
        if (forwardSpeed > -this.gearRedlineSpeeds['-1'] / 3.6) {
          driveAccel = gearBaseAccel * this.throttleInput * Math.max(0, torqueFactor);
        }
      } else {
        driveAccel = gearBaseAccel * this.throttleInput * torqueFactor * bogFactor;
      }
    } else if (this.throttleInput === 0 && Math.abs(forwardSpeed) > 0.5) {
      // Natural engine braking (higher in lower gears)
      const engineBrake = (6 - Math.abs(this.gear)) * 0.28;
      driveAccel = -Math.sign(forwardSpeed) * engineBrake;
    }

    // Service Brakes
    let brakeDecel = 0;
    if (this.brakeInput > 0) {
      if (Math.abs(forwardSpeed) > 0.25) {
        brakeDecel = -Math.sign(forwardSpeed) * 19.5 * this.brakeInput;
      } else {
        forwardSpeed = 0;
      }
    }

    // Handbrake
    if (handbrake > 0 && Math.abs(forwardSpeed) > 0.4) {
      brakeDecel += -Math.sign(forwardSpeed) * 11.5;
    }

    // Rolling Resistance & Realistic Aerodynamic Drag + Fair Slipstream Drafting Tow
    const isGrass = this.surface === 'grass';
    const rollingDrag = isGrass ? 3.8 : 0.32;

    let draftFactor = 0;
    if (otherRacers && otherRacers.length > 1 && this.speedKmh > 70 && forwardSpeed > 18) {
      for (let i = 0; i < otherRacers.length; i++) {
        const other = otherRacers[i];
        if (!other || other === this) continue;
        const ddx = other.x - this.x;
        const ddz = other.z - this.z;
        const fwdDist = ddx * forwardX + ddz * forwardZ;
        if (fwdDist > 3.0 && fwdDist < 26.0) {
          const latDist = Math.abs(ddx * rightX + ddz * rightZ);
          if (latDist < 2.5) {
            const longF = fwdDist < 5.0
              ? (fwdDist - 3.0) / 2.0
              : (fwdDist <= 16.0 ? 1.0 : (26.0 - fwdDist) / 10.0);
            const latF = 1.0 - latDist / 2.5;
            const df = longF * latF;
            if (df > draftFactor) draftFactor = df;
          }
        }
      }
    }

    const aeroDrag = 0.00036 * (1 - 0.48 * draftFactor) * forwardSpeed * Math.abs(forwardSpeed);
    const draftTow = (this.throttleInput > 0.5 && forwardSpeed > 22) ? (0.32 * draftFactor) : 0;

    forwardSpeed += (driveAccel + draftTow + brakeDecel - Math.sign(forwardSpeed) * rollingDrag - aeroDrag) * dt;
    if (this.throttleInput === 0 && this.brakeInput > 0 && Math.abs(forwardSpeed) < 0.25) {
      forwardSpeed = 0;
    }

    // Turning & Cornering Grip
    const minTurnFactor = Math.min(1.0, Math.abs(forwardSpeed) / 2.8);
    const directionSign = forwardSpeed >= -0.05 ? 1 : -1;
    const turnRate = this.steerAngle * 2.45 * this.steerAgility * minTurnFactor * directionSign;

    const driftYawBoost = (handbrake > 0 && Math.abs(forwardSpeed) > 5) ? 1.30 : 1.0;
    this.heading += turnRate * driftYawBoost * dt;

    const newFwdX = Math.sin(this.heading);
    const newFwdZ = Math.cos(this.heading);
    const newRightX = Math.cos(this.heading);
    const newRightZ = -Math.sin(this.heading);

    let lateralGrip = 11.5;
    if (handbrake > 0) lateralGrip = 2.6;
    else if (isGrass) lateralGrip = 5.2;
    else if (Math.abs(this.steerAngle) > 0.25 && this.speedKmh > 105) lateralGrip = 8.0;

    lateralSpeed = THREE.MathUtils.lerp(lateralSpeed, 0, Math.min(1, dt * lateralGrip));

    this.vx = newFwdX * forwardSpeed + newRightX * lateralSpeed;
    this.vz = newFwdZ * forwardSpeed + newRightZ * lateralSpeed;

    this.x += this.vx * dt;
    this.z += this.vz * dt;

    const trackInfo = this.track.getTrackInfoAt(this.x, this.z, this.trackSampleIndex);
    this.trackSampleIndex = trackInfo.index;
    this.surface = trackInfo.surface;
    this.onCurb = trackInfo.onCurb;
    this.cornerName = trackInfo.cornerName;

    if (this.onCurb && this.speedKmh > 10) {
      this.curbShake = Math.sin(performance.now() * 0.065) * 0.038 * Math.min(1, this.speedKmh / 80);
    } else {
      this.curbShake = 0;
    }

    this.y = THREE.MathUtils.lerp(this.y, trackInfo.elevation, Math.min(1, dt * 18)) + this.curbShake;

    if (trackInfo.absLateral > trackInfo.wallLimit) {
      const s = trackInfo.sample;
      const sign = Math.sign(trackInfo.lateralOffset);
      const clampedLat = sign * (trackInfo.wallLimit - 0.15);

      this.x = s.point.x + s.right.x * clampedLat;
      this.z = s.point.z + s.right.z * clampedLat;

      const vDotTan = this.vx * s.tangent.x + this.vz * s.tangent.z;
      this.vx = s.tangent.x * vDotTan * 0.85;
      this.vz = s.tangent.z * vDotTan * 0.85;

      const trackHeading = Math.atan2(s.tangent.x, s.tangent.z);
      let angleDiff = trackHeading - this.heading;
      while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
      while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
      this.heading += angleDiff * 0.28;
    }

    const sideSlip = Math.abs(lateralSpeed) / Math.max(6, Math.abs(forwardSpeed));
    const turnSlip = Math.abs(this.steerAngle) * (this.speedKmh / 145);
    this.slipRatio = Math.min(1.0, sideSlip * 1.4 + (handbrake ? 0.55 : 0) + Math.max(0, turnSlip - 0.18));

    const targetRoll = -this.steerAngle * Math.min(1.0, this.speedKmh / 95) * 0.085;
    const targetPitch = (this.brakeInput * 0.036) - (this.throttleInput * 0.022);
    this.rollAngle = THREE.MathUtils.lerp(this.rollAngle, targetRoll, dt * 10);
    this.pitchAngle = THREE.MathUtils.lerp(this.pitchAngle, targetPitch, dt * 10);

    this.updateTiming(dt, trackInfo.t);
  }

  updateTiming(dt, currentT) {
    if (this.timingStarted) {
      this.lapTime += dt;
      if (!this.raceFinished) {
        this.totalRaceTime += dt;
      }
    }

    if (currentT > 0.25 && currentT < 0.45) {
      this.passedCheckpoints.add(1);
    } else if (currentT >= 0.45 && currentT < 0.72) {
      this.passedCheckpoints.add(2);
    } else if (currentT >= 0.72 && currentT < 0.95) {
      this.passedCheckpoints.add(3);
    }

    if (this.currentSector === 1 && currentT >= 0.33 && this.passedCheckpoints.has(1)) {
      this.sectorTimes[0] = this.lapTime - this.sectorStartTimes[0];
      this.sectorStartTimes[1] = this.lapTime;
      this.currentSector = 2;
    } else if (this.currentSector === 2 && currentT >= 0.66 && this.passedCheckpoints.has(2)) {
      this.sectorTimes[1] = this.lapTime - this.sectorStartTimes[1];
      this.sectorStartTimes[2] = this.lapTime;
      this.currentSector = 3;
    }

    if (this.lastTrackT > 0.85 && currentT < 0.15 && this.passedCheckpoints.has(1) && this.passedCheckpoints.has(2) && this.passedCheckpoints.has(3)) {
      this.sectorTimes[2] = this.lapTime - this.sectorStartTimes[2];
      this.lastLapTime = this.lapTime;
      if (this.bestLapTime === null || this.lapTime < this.bestLapTime) {
        this.bestLapTime = this.lapTime;
      }
      this.lapCount++;
      this.lapTime = 0;
      this.currentSector = 1;
      this.sectorStartTimes = [0, 0, 0];
      this.passedCheckpoints.clear();
      this.passedCheckpoints.add(0);

      if (this.sound) {
        this.sound.playLapChime();
      }
    }

    this.lastTrackT = currentT;
  }

  /**
   * 2D Oriented Bounding Box (SAT) car-to-car collision response.
   * Separates overlapping cars and exchanges impulse along collision normal.
   */
  static resolveCarCollision(physA, physB, soundEngine = null) {
    const dx = physB.x - physA.x;
    const dz = physB.z - physA.z;
    if (dx * dx + dz * dz > 21.16) return false; // 4.6m bounding circle quick reject

    const hw = 0.88;
    const hl = 2.02;

    const afx = Math.sin(physA.heading), afz = Math.cos(physA.heading);
    const arx = Math.cos(physA.heading), arz = -Math.sin(physA.heading);
    const bfx = Math.sin(physB.heading), bfz = Math.cos(physB.heading);
    const brx = Math.cos(physB.heading), brz = -Math.sin(physB.heading);

    const axes = [
      [afx, afz],
      [arx, arz],
      [bfx, bfz],
      [brx, brz]
    ];

    let minOverlap = Infinity;
    let bestAxisX = 1;
    let bestAxisZ = 0;

    for (let i = 0; i < 4; i++) {
      const ax = axes[i][0];
      const az = axes[i][1];

      const radA = Math.abs(ax * afx + az * afz) * hl + Math.abs(ax * arx + az * arz) * hw;
      const radB = Math.abs(ax * bfx + az * bfz) * hl + Math.abs(ax * brx + az * brz) * hw;
      const dist = Math.abs(dx * ax + dz * az);
      const overlap = radA + radB - dist;

      if (overlap <= 0) return false;
      if (overlap < minOverlap) {
        minOverlap = overlap;
        bestAxisX = ax;
        bestAxisZ = az;
      }
    }

    // Orient normal from A -> B
    if (dx * bestAxisX + dz * bestAxisZ < 0) {
      bestAxisX = -bestAxisX;
      bestAxisZ = -bestAxisZ;
    }

    const push = minOverlap * 0.52;
    physA.x -= bestAxisX * push;
    physA.z -= bestAxisZ * push;
    physB.x += bestAxisX * push;
    physB.z += bestAxisZ * push;

    // Relative velocity along collision normal
    const rvx = physB.vx - physA.vx;
    const rvz = physB.vz - physA.vz;
    const velAlongNormal = rvx * bestAxisX + rvz * bestAxisZ;

    if (velAlongNormal < 0) {
      const restitution = 0.30;
      const impulse = -(1 + restitution) * velAlongNormal * 0.5;
      physA.vx -= bestAxisX * impulse;
      physA.vz -= bestAxisZ * impulse;
      physB.vx += bestAxisX * impulse;
      physB.vz += bestAxisZ * impulse;

      if (soundEngine && -velAlongNormal > 3.0) {
        const now = performance.now();
        if (!ArcadePhysics._lastBumpTime || now - ArcadePhysics._lastBumpTime > 260) {
          ArcadePhysics._lastBumpTime = now;
          soundEngine.playBeep(140, 0.06);
        }
      }
    }
    return true;
  }
}

/**
 * Autonomous Race Opponent Controller driving a full ArcadePhysics car instance.
 * Features competitive outside-inside-outside cornering, fair slipstream drafting,
 * randomized driver traits, overtakes, divebombs, defense, risky mistakes, and barrier recovery.
 */
class AIRacerController {
  constructor(physics, track, opts = {}) {
    this.physics = physics;
    this.track = track;
    this.baseOpts = opts || {};
    this.preferredLane = typeof opts.preferredLane === 'number' ? opts.preferredLane : 0;
    this.currentLaneOffset = this.preferredLane;
    this.randomizePersonality(this.baseOpts);
  }

  randomizePersonality(baseOpts = this.baseOpts) {
    const baseSkill = typeof baseOpts.skill === 'number' ? baseOpts.skill : 1.00;
    this.skill = THREE.MathUtils.clamp(baseSkill + (Math.random() - 0.5) * 0.07, 0.97, 1.05);
    this.aggression = 0.35 + Math.random() * 0.63;
    this.bravery = 0.94 + Math.random() * 0.15;
    this.consistency = 0.68 + Math.random() * 0.26;
    this.preferredLane = (Math.random() - 0.5) * 3.4;

    this.mode = 'race';
    this.modeTimer = 0;
    this.overtakeSide = 0;
    this.mistakeLatBias = 0;
    this.pacePhase = Math.random() * Math.PI * 2;
    this.paceFreq = 0.35 + Math.random() * 0.30;
    this.decisionCooldown = 0.8 + Math.random() * 1.4;
    this.stuckTimer = 0;
    this.recoverTimer = 0;
  }

  update(dt, canDrive, allRacersPhysics = []) {
    if (!canDrive) {
      this.physics.update(dt, { throttle: 0.45, brake: 0, steer: 0, handbrake: 0 }, false, allRacersPhysics);
      return;
    }

    const samples = this.track.samples;
    const N = samples.length;
    const stepLen = this.track.totalLength / N;
    const curIdx = this.physics.trackSampleIndex || 0;
    const curSample = samples[curIdx];

    this.pacePhase += dt * this.paceFreq;
    if (this.decisionCooldown > 0) this.decisionCooldown -= dt;
    if (this.modeTimer > 0) {
      this.modeTimer -= dt;
      if (this.modeTimer <= 0 && this.mode !== 'recover') {
        this.mode = 'race';
        this.mistakeLatBias = 0;
      }
    }

    // 1. Stuck / Barrier Recovery Detection
    if (Math.abs(this.physics.speed) < 2.2) {
      this.stuckTimer += dt;
      if (this.stuckTimer > 1.2 && this.recoverTimer <= 0) {
        this.recoverTimer = 1.05;
        this.mode = 'recover';
      }
    } else if (Math.abs(this.physics.speed) > 4.5) {
      this.stuckTimer = 0;
    }

    if (this.recoverTimer > 0) {
      this.recoverTimer -= dt;
      // Back away from barrier cleanly toward track centerline
      const toCenterHeading = Math.atan2(curSample.point.x - this.physics.x, curSample.point.z - this.physics.z);
      const trackHeading = Math.atan2(curSample.tangent.x, curSample.tangent.z);
      const backSample = samples[(curIdx + 8) % N];
      const fwdTargetH = Math.atan2(backSample.point.x - this.physics.x, backSample.point.z - this.physics.z);
      const errH = Math.atan2(
        Math.sin(fwdTargetH - this.physics.heading),
        Math.cos(fwdTargetH - this.physics.heading)
      );

      if (this.recoverTimer > 0.42) {
        if (this.physics.gear !== -1 && this.physics.shiftTimer <= 0) {
          this.physics.gear = -1;
          this.physics.shiftTimer = 0.12;
        }
        const revSteer = THREE.MathUtils.clamp(-errH * 1.4, -0.7, 0.7);
        this.physics.update(dt, { throttle: 0.78, brake: 0, steer: revSteer, handbrake: 0 }, true, allRacersPhysics);
        return;
      }

      if (this.physics.gear === -1 && this.physics.shiftTimer <= 0) {
        this.physics.manualShiftUp();
      }
      const fwdSteer = THREE.MathUtils.clamp(
        Math.atan2(Math.sin(toCenterHeading - this.physics.heading), Math.cos(toCenterHeading - this.physics.heading)) * 1.8,
        -1,
        1
      );
      if (this.recoverTimer <= 0) {
        this.mode = 'race';
        this.stuckTimer = 0;
      }
      this.physics.update(dt, { throttle: 0.75, brake: 0, steer: fwdSteer, handbrake: 0 }, true, allRacersPhysics);
      return;
    }

    // 2. Scan Near & Upcoming Corner Curvature (Outside-Inside-Outside Racing Line)
    let nearCurvSum = 0;
    for (let o = 4; o <= 12; o++) nearCurvSum += samples[(curIdx + o) % N].curvature;
    const nearCurv = nearCurvSum / 9;

    let farCurvSum = 0;
    for (let o = 16; o <= 28; o++) farCurvSum += samples[(curIdx + o) % N].curvature;
    const farCurv = farCurvSum / 13;

    // 3. Scan Rivals Ahead, Alongside, and Behind in Track Coordinates (+right = +laneOffset)
    const myTrackLat = (this.physics.x - curSample.point.x) * curSample.right.x +
      (this.physics.z - curSample.point.z) * curSample.right.z;

    let nearestAhead = null;
    let nearestFwd = Infinity;
    let aheadLatDiff = 0;
    let aheadTrackLat = 0;

    let nearestBehind = null;
    let nearestBack = Infinity;
    let behindLatDiff = 0;

    let alongsideMinLane = -6.0;
    let alongsideMaxLane = 6.0;
    let hasAlongside = false;

    for (let i = 0; i < allRacersPhysics.length; i++) {
      const other = allRacersPhysics[i];
      if (!other || other === this.physics) continue;
      const dx = other.x - this.physics.x;
      const dz = other.z - this.physics.z;
      const fwdDist = dx * curSample.tangent.x + dz * curSample.tangent.z;
      const trackLatDiff = dx * curSample.right.x + dz * curSample.right.z;
      const otherTrackLat = myTrackLat + trackLatDiff;

      const minAhead = this.mode === 'overtake' ? -1.5 : 1.0;
      if (fwdDist > minAhead && fwdDist < 28.0 && fwdDist < nearestFwd) {
        nearestFwd = fwdDist;
        nearestAhead = other;
        aheadLatDiff = trackLatDiff;
        aheadTrackLat = otherTrackLat;
      } else if (fwdDist < -1.0 && fwdDist > -16.0 && -fwdDist < nearestBack) {
        nearestBack = -fwdDist;
        nearestBehind = other;
        behindLatDiff = trackLatDiff;
      }

      if (Math.abs(fwdDist) < 4.8 && Math.abs(trackLatDiff) < 3.0) {
        hasAlongside = true;
        if (trackLatDiff >= 0) {
          alongsideMaxLane = Math.min(alongsideMaxLane, otherTrackLat - 2.35);
        } else {
          alongsideMinLane = Math.max(alongsideMinLane, otherTrackLat + 2.35);
        }
      }
    }

    // End active overtake/divebomb cleanly once rival is passed
    if ((this.mode === 'overtake' || this.mode === 'divebomb') && (!nearestAhead || nearestFwd > 24.0)) {
      if (this.modeTimer < 1.0) {
        this.mode = 'race';
      }
    }

    // 4. Randomized Tactical Decision-Making
    if (this.mode === 'race' && this.decisionCooldown <= 0) {
      if (nearestAhead && nearestFwd >= 3.0 && nearestFwd <= 22.0 && Math.abs(farCurv) > 0.042 && Math.random() < (0.35 + this.aggression * 0.45)) {
        // Late-braking divebomb into upcoming corner inside apex
        this.mode = 'divebomb';
        this.modeTimer = 1.7 + Math.random() * 0.8;
        this.overtakeSide = Math.sign(farCurv) || 1;
        if (Math.random() < this.aggression * 0.16) {
          this.mistakeLatBias = -this.overtakeSide * (3.2 + Math.random() * 2.5);
        } else {
          this.mistakeLatBias = 0;
        }
      } else if (nearestAhead && nearestFwd >= 2.5 && nearestFwd <= 24.0 && Math.abs(aheadLatDiff) < 3.2) {
        // Slipstream pull-out overtake maneuver
        this.mode = 'overtake';
        this.modeTimer = 2.4 + Math.random() * 1.4;
        const clearSide = aheadTrackLat >= 0 ? -1 : 1;
        const daringFlip = Math.random() < this.aggression * 0.18 && Math.abs(aheadTrackLat - clearSide * 3.4) < 5.6;
        this.overtakeSide = daringFlip ? -clearSide : clearSide;
      } else if (nearestBehind && nearestBack >= 2.0 && nearestBack <= 15.0 && nearestBehind.speed > this.physics.speed + 0.8 && Math.random() < this.aggression * 0.55) {
        // Defensive inside line cover
        this.mode = 'defend';
        this.modeTimer = 1.4 + Math.random() * 0.8;
        this.overtakeSide = Math.sign(farCurv) || (behindLatDiff >= 0 ? 1 : -1);
      } else if ((Math.abs(farCurv) > 0.048 || Math.abs(nearCurv) > 0.085) && this.physics.speedKmh > 100) {
        // Calculated braking/cornering risk: occasional wide run or overcooked entry
        const underPressure = (nearestAhead && nearestFwd < 18.0) || (nearestBehind && nearestBack < 12.0);
        const mistakeChance = (1.0 - this.consistency) * 0.16 + (underPressure ? 0.05 : 0);
        if (Math.random() < mistakeChance) {
          this.mode = 'mistake';
          this.modeTimer = 0.85 + Math.random() * 0.55;
          const turnSign = Math.sign(Math.abs(farCurv) > Math.abs(nearCurv) ? farCurv : nearCurv) || 1;
          this.mistakeLatBias = -turnSign * (4.8 + Math.random() * 4.4);
        }
      }
      this.decisionCooldown = 0.6 + Math.random() * 1.1;
    }

    // 5. Smoothed Chicane Lookahead & Competitive Cornering Speed Targets
    const rhythm = 1.0 + Math.sin(this.pacePhase) * (0.025 + (1.0 - this.consistency) * 0.045);
    const turnCap = 0.94 * this.physics.steerAgility * this.skill * this.bravery * rhythm;
    let brakeDecel = 17.8 * (0.95 + this.aggression * 0.14);
    let cornerBoost = 1.0;

    if (this.mode === 'divebomb') {
      cornerBoost = this.mistakeLatBias !== 0 ? 1.24 : 1.12;
      brakeDecel *= 1.24;
    } else if (this.mode === 'mistake') {
      cornerBoost = 1.32;
      brakeDecel *= 1.42;
    }

    let targetSpeedMs = 57.0;
    for (let offset = 2; offset <= 44; offset++) {
      const sPrev = samples[(curIdx + offset - 1 + N) % N];
      const s = samples[(curIdx + offset) % N];
      const sNext = samples[(curIdx + offset + 1) % N];
      const avgCurv = Math.abs(sPrev.curvature + s.curvature * 2 + sNext.curvature) * 0.25;
      const kappa = avgCurv / (6 * stepLen);

      const vCorner = THREE.MathUtils.clamp(
        (turnCap * cornerBoost) / Math.max(0.0012, kappa),
        21.0,
        57.0
      );
      const dist = offset * stepLen;
      const vAllow = Math.sqrt(vCorner * vCorner + 2 * brakeDecel * Math.max(0, dist - 3.5));
      if (vAllow < targetSpeedMs) {
        targetSpeedMs = vAllow;
      }
    }

    // 6. Outside-Inside-Outside Racing Line & Mode Lane Target
    const lookSamples = Math.round(THREE.MathUtils.clamp(5 + this.physics.speed * 0.30, 5, 16));
    const lookSample = samples[(curIdx + lookSamples) % N];

    let lineOffset = this.preferredLane * 0.35;
    if (Math.abs(nearCurv) > 0.022) {
      // Dive to inside apex/curb through corner
      lineOffset = Math.sign(nearCurv) * Math.min(5.6, Math.abs(nearCurv) * 26.0);
    } else if (Math.abs(farCurv) > 0.032) {
      // Widen entry arc on straight approaching upcoming turn
      lineOffset = -Math.sign(farCurv) * Math.min(4.2, Math.abs(farCurv) * 16.0);
    }

    if (this.mode === 'overtake') {
      const rivalBase = nearestAhead ? aheadTrackLat : 0;
      const passLane = THREE.MathUtils.clamp(rivalBase + this.overtakeSide * 3.6, -5.8, 5.8);
      lineOffset = Math.abs(passLane - rivalBase) < 2.2
        ? THREE.MathUtils.clamp(rivalBase - this.overtakeSide * 3.6, -5.8, 5.8)
        : passLane;
    } else if (this.mode === 'divebomb') {
      lineOffset = this.mistakeLatBias !== 0
        ? THREE.MathUtils.clamp(this.overtakeSide * 4.5 + this.mistakeLatBias * 0.65, -8.8, 8.8)
        : this.overtakeSide * 4.8;
    } else if (this.mode === 'defend') {
      lineOffset = this.overtakeSide * 2.8;
    } else if (this.mode === 'mistake') {
      lineOffset = THREE.MathUtils.clamp(lineOffset + this.mistakeLatBias, -10.0, 10.0);
    }

    let desiredLane = lineOffset;
    if (this.mode !== 'mistake') {
      if (hasAlongside) {
        if (alongsideMinLane <= alongsideMaxLane) {
          desiredLane = THREE.MathUtils.clamp(desiredLane, alongsideMinLane, alongsideMaxLane);
        } else {
          desiredLane = (alongsideMinLane + alongsideMaxLane) * 0.5;
        }
      }
      const laneCap = (this.mode === 'divebomb' && this.mistakeLatBias !== 0) ? 8.8 : 6.0;
      desiredLane = THREE.MathUtils.clamp(desiredLane, -laneCap, laneCap);
    }
    this.currentLaneOffset = THREE.MathUtils.lerp(
      this.currentLaneOffset,
      desiredLane,
      Math.min(1, dt * (this.mode === 'race' ? 5.2 : 6.8))
    );

    // 7. Target Point Steering
    const tx = lookSample.point.x + lookSample.right.x * this.currentLaneOffset;
    const tz = lookSample.point.z + lookSample.right.z * this.currentLaneOffset;
    const desiredHeading = Math.atan2(tx - this.physics.x, tz - this.physics.z);
    const angleDiff = Math.atan2(
      Math.sin(desiredHeading - this.physics.heading),
      Math.cos(desiredHeading - this.physics.heading)
    );
    const steer = THREE.MathUtils.clamp(angleDiff * 2.35, -1, 1);

    // 8. Full-Throttle Discipline & Late Braking Modulation
    const err = targetSpeedMs - this.physics.speed;
    let throttle = 0;
    let brake = 0;
    if (err >= -0.5) {
      throttle = 1.0;
    } else {
      brake = THREE.MathUtils.clamp((-err - 0.3) / 6.5, 0.12, 1.0);
    }

    // 9. Crisp 5-Speed Manual Shifting Matching Stock Redlines & Peak Power Band
    if (this.physics.shiftTimer <= 0) {
      if (this.physics.gear === -1) {
        this.physics.manualShiftUp();
      } else if (this.physics.gear < 5 && this.physics.rpm >= this.physics.redlineRpm - 110) {
        this.physics.manualShiftUp();
      } else if (this.physics.gear > 1) {
        const lowerRedline = this.physics.gearRedlineSpeeds[String(this.physics.gear - 1)] || 45;
        if (this.physics.speedKmh < lowerRedline * 0.89) {
          this.physics.manualShiftDown();
        }
      }
    }

    this.physics.update(dt, { throttle, brake, steer, handbrake: 0 }, true, allRacersPhysics);
  }
}

window.ArcadePhysics = ArcadePhysics;
window.AIRacerController = AIRacerController;

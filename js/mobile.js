/**
 * Mobile Device Detection, Landscape/Fullscreen Flow & Multi-Touch Driving Controls
 * Argentina Hatchback Challenge — Autódromo de Buenos Aires
 */
class MobileControls {
  constructor(callbacks = {}) {
    this.callbacks = callbacks;
    this.enabled = MobileControls.detectMobile();

    this.steerValue = 0; // -1 (right) .. +1 (left), matching ArcadePhysics convention
    this.steerActive = false;
    this.throttle = false;
    this.brake = false;
    this.lookX = 0; // -1 (left) .. +1 (right)
    this.lookY = 0; // -1 (up/fwd) .. +1 (down/back)
    this.lookActive = false;
    this.pausedForOrientation = false;

    this.inMenu = true;
    this.fsPromptDismissed = false;

    this.steerPointerId = null;
    this.lookPointerId = null;
    this.gasPointers = new Set();
    this.brakePointers = new Set();

    // DOM elements
    this.steerZone = document.getElementById('touch-steer-zone');
    this.steerPad = document.getElementById('touch-steer-pad');
    this.steerWheel = document.getElementById('touch-steer-wheel');
    this.steerIndicator = document.getElementById('touch-steer-indicator');

    this.lookPad = document.getElementById('touch-look-pad');
    this.lookPuck = document.getElementById('touch-look-puck');

    this.btnGas = document.getElementById('btn-mobile-gas');
    this.btnBrake = document.getElementById('btn-mobile-brake');
    this.btnShiftUp = document.getElementById('btn-mobile-shift-up');
    this.btnShiftDown = document.getElementById('btn-mobile-shift-down');
    this.btnCam = document.getElementById('btn-mobile-cam');
    this.mobileCamLabel = document.getElementById('mobile-cam-label');

    this.mobileGear = document.getElementById('mobile-gear');
    this.mobileSpeed = document.getElementById('mobile-speed');
    this.mobileRpmFill = document.getElementById('mobile-rpm-fill');

    this.rotateOverlay = document.getElementById('mobile-rotate-overlay');
    this.btnRotateFs = document.getElementById('btn-rotate-fullscreen');
    this.fsPrompt = document.getElementById('mobile-fs-prompt');
    this.btnFsAccept = document.getElementById('btn-fs-accept');
    this.btnFsDismiss = document.getElementById('btn-fs-dismiss');

    this.btnHudFs = document.getElementById('btn-fullscreen');
    this.menuFsBar = document.getElementById('mobile-menu-fs-bar');
    this.menuFsText = document.getElementById('mobile-fs-bar-text');
    this.iosFsHint = document.getElementById('mobile-ios-fs-hint');
    this.btnMenuFs = document.getElementById('btn-menu-fullscreen');

    if (this.enabled) {
      document.body.classList.add('mobile-mode');
      this.bindEvents();
      this.syncState(true);
    }
  }

  static detectMobile() {
    const params = new URLSearchParams(window.location.search || '');
    if (params.get('mobile') === '0') return false;
    if (params.get('mobile') === '1') return true;

    const ua = navigator.userAgent || '';
    if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua)) {
      return true;
    }

    const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    const hasTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    const minScreenDim = Math.min(window.screen.width || 9999, window.screen.height || 9999);
    return Boolean(coarse && hasTouch && minScreenDim <= 900);
  }

  canFullscreen() {
    const el = document.documentElement;
    return Boolean(
      document.fullscreenEnabled ||
      document.webkitFullscreenEnabled ||
      el.requestFullscreen ||
      el.webkitRequestFullscreen
    );
  }

  isFullscreen() {
    return Boolean(
      document.fullscreenElement ||
      document.webkitFullscreenElement ||
      window.navigator.standalone === true
    );
  }

  requestFullscreenAndLandscape() {
    if (!this.enabled) return;

    const el = document.documentElement;
    if (this.canFullscreen() && !this.isFullscreen()) {
      const req = el.requestFullscreen || el.webkitRequestFullscreen;
      if (req) {
        try {
          const p = req.call(el);
          if (p && typeof p.catch === 'function') p.catch(() => {});
        } catch (_) {
          // Ignore browsers rejecting fullscreen outside strict gestures
        }
      }
    } else if (!this.canFullscreen()) {
      try {
        window.scrollTo(0, 1);
      } catch (_) {}
    }

    if (screen.orientation && typeof screen.orientation.lock === 'function') {
      screen.orientation.lock('landscape').catch(() => {});
    }
  }

  haptic(ms = 8) {
    if (navigator.vibrate) {
      try {
        navigator.vibrate(ms);
      } catch (_) {}
    }
  }

  syncState(inMenu = this.inMenu) {
    this.inMenu = Boolean(inMenu);
    if (!this.enabled) return;

    document.body.classList.toggle('mobile-racing', !this.inMenu);

    const isPortrait = window.innerHeight > window.innerWidth;
    const canFs = this.canFullscreen();
    const isFs = this.isFullscreen();

    const wasPaused = this.pausedForOrientation;
    if (!this.inMenu && isPortrait) {
      this.pausedForOrientation = true;
      if (this.rotateOverlay) this.rotateOverlay.classList.remove('hidden');
      if (this.btnRotateFs) {
        this.btnRotateFs.classList.toggle('hidden', !canFs || isFs);
      }
      this.resetTouchInputs();
    } else {
      this.pausedForOrientation = false;
      if (this.rotateOverlay) this.rotateOverlay.classList.add('hidden');
      if (wasPaused && !this.inMenu && typeof this.callbacks.onPortraitCleared === 'function') {
        this.callbacks.onPortraitCleared();
      }
    }

    // Show optional fullscreen prompt when entering landscape racing if supported & not yet active
    const showFsPrompt = !this.inMenu && !isPortrait && canFs && !isFs && !this.fsPromptDismissed;
    if (this.fsPrompt) {
      this.fsPrompt.classList.toggle('hidden', !showFsPrompt);
    }

    // Top HUD & Menu fullscreen controls
    if (this.btnHudFs) {
      this.btnHudFs.classList.toggle('hidden', !canFs);
      this.btnHudFs.classList.toggle('active-cam', isFs);
    }
    if (this.menuFsBar) {
      if (!canFs) {
        if (this.menuFsText) this.menuFsText.style.display = 'none';
        if (this.btnMenuFs) this.btnMenuFs.style.display = 'none';
        if (this.iosFsHint) this.iosFsHint.style.display = 'block';
      } else {
        if (this.menuFsText) this.menuFsText.style.display = isFs ? 'none' : 'block';
        if (this.btnMenuFs) this.btnMenuFs.style.display = isFs ? 'none' : 'inline-flex';
        if (this.iosFsHint) this.iosFsHint.style.display = 'none';
        this.menuFsBar.classList.toggle('hidden', isFs);
      }
    }
  }

  resetTouchInputs() {
    this.steerPointerId = null;
    this.steerValue = 0;
    this.steerActive = false;
    if (this.steerPad) this.steerPad.classList.remove('active');
    if (this.steerWheel) this.steerWheel.style.transform = 'translateX(0px) rotate(0deg)';
    if (this.steerIndicator) {
      this.steerIndicator.style.left = '50%';
      this.steerIndicator.style.width = '0%';
    }

    this.gasPointers.clear();
    this.brakePointers.clear();
    this.throttle = false;
    this.brake = false;
    if (this.btnGas) this.btnGas.classList.remove('pressed');
    if (this.btnBrake) this.btnBrake.classList.remove('pressed');

    this.lookPointerId = null;
    this.lookX = 0;
    this.lookY = 0;
    this.lookActive = false;
    if (this.lookPad) this.lookPad.classList.remove('active');
    if (this.lookPuck) this.lookPuck.style.transform = 'translate(0px, 0px)';
  }

  updateHudReadout(gearStr, speedInt, rpmRatio, isShiftAlert, camShortName) {
    if (!this.enabled) return;
    if (this.mobileGear) {
      this.mobileGear.textContent = gearStr;
      this.mobileGear.classList.toggle('shift-up', Boolean(isShiftAlert));
    }
    if (this.btnShiftUp) {
      this.btnShiftUp.classList.toggle('shift-up', Boolean(isShiftAlert));
    }
    if (this.mobileSpeed) {
      this.mobileSpeed.textContent = String(speedInt);
    }
    if (this.mobileRpmFill) {
      const pct = Math.max(0, Math.min(100, Math.round((rpmRatio || 0) * 100)));
      this.mobileRpmFill.style.width = `${pct}%`;
      this.mobileRpmFill.classList.toggle('redline', pct >= 88);
    }
    if (this.mobileCamLabel && camShortName) {
      this.mobileCamLabel.textContent = camShortName;
    }
  }

  updateSteerFromPointer(clientX) {
    if (!this.steerPad) return;
    const rect = this.steerPad.getBoundingClientRect();
    const cx = rect.left + rect.width * 0.5;
    const maxR = Math.max(46, rect.width * 0.42);
    const rawDx = Math.max(-1, Math.min(1, (clientX - cx) / maxR));

    const deadzone = 0.06;
    let curved = 0;
    if (Math.abs(rawDx) > deadzone) {
      const norm = (Math.abs(rawDx) - deadzone) / (1 - deadzone);
      curved = Math.sign(rawDx) * Math.pow(norm, 1.25);
    }

    // Physics convention: +1 = left, -1 = right
    this.steerValue = -curved;

    if (this.steerWheel) {
      const deg = (curved * 105).toFixed(1);
      const tx = (curved * 12).toFixed(1);
      this.steerWheel.style.transform = `translateX(${tx}px) rotate(${deg}deg)`;
    }
    if (this.steerIndicator) {
      const mag = Math.abs(curved) * 50;
      if (curved >= 0) {
        this.steerIndicator.style.left = '50%';
        this.steerIndicator.style.width = `${mag.toFixed(1)}%`;
      } else {
        this.steerIndicator.style.left = `${(50 - mag).toFixed(1)}%`;
        this.steerIndicator.style.width = `${mag.toFixed(1)}%`;
      }
    }
  }

  updateLookFromPointer(clientX, clientY) {
    if (!this.lookPad) return;
    const rect = this.lookPad.getBoundingClientRect();
    const cx = rect.left + rect.width * 0.5;
    const cy = rect.top + rect.height * 0.5;
    const maxR = Math.max(18, rect.width * 0.34);

    let dx = (clientX - cx) / maxR;
    let dy = (clientY - cy) / maxR;
    const dist = Math.hypot(dx, dy);
    if (dist > 1) {
      dx /= dist;
      dy /= dist;
    }

    this.lookX = dx;
    this.lookY = dy;
    this.lookActive = Math.hypot(dx, dy) > 0.14;

    if (this.lookPuck) {
      const px = (dx * maxR).toFixed(1);
      const py = (dy * maxR).toFixed(1);
      this.lookPuck.style.transform = `translate(${px}px, ${py}px)`;
    }
  }

  bindEvents() {
    const notifyInteract = () => {
      if (typeof this.callbacks.onUserInteract === 'function') {
        this.callbacks.onUserInteract();
      }
    };

    // Steering wheel touch joystick (bound to outer forgiving catch zone)
    const steerTarget = this.steerZone || this.steerPad;
    if (steerTarget && this.steerPad) {
      steerTarget.addEventListener('pointerdown', e => {
        e.preventDefault();
        notifyInteract();
        if (this.steerPointerId !== null) return;
        this.steerPointerId = e.pointerId;
        this.steerActive = true;
        this.steerPad.classList.add('active');
        try { steerTarget.setPointerCapture(e.pointerId); } catch (_) {}
        this.updateSteerFromPointer(e.clientX);
      });

      steerTarget.addEventListener('pointermove', e => {
        if (e.pointerId !== this.steerPointerId) return;
        e.preventDefault();
        this.updateSteerFromPointer(e.clientX);
      });

      const endSteer = e => {
        if (e.pointerId !== this.steerPointerId) return;
        try { steerTarget.releasePointerCapture(e.pointerId); } catch (_) {}
        this.steerPointerId = null;
        this.steerActive = false;
        this.steerValue = 0;
        this.steerPad.classList.remove('active');
        if (this.steerWheel) this.steerWheel.style.transform = 'translateX(0px) rotate(0deg)';
        if (this.steerIndicator) {
          this.steerIndicator.style.left = '50%';
          this.steerIndicator.style.width = '0%';
        }
      };
      steerTarget.addEventListener('pointerup', endSteer);
      steerTarget.addEventListener('pointercancel', endSteer);
    }

    // Accelerator & Brake pedals
    const bindPedal = (btn, pointerSet, propName) => {
      if (!btn) return;
      btn.addEventListener('pointerdown', e => {
        e.preventDefault();
        notifyInteract();
        pointerSet.add(e.pointerId);
        this[propName] = true;
        btn.classList.add('pressed');
        this.haptic(8);
        try { btn.setPointerCapture(e.pointerId); } catch (_) {}
      });
      const releasePedal = e => {
        if (!pointerSet.has(e.pointerId)) return;
        pointerSet.delete(e.pointerId);
        try { btn.releasePointerCapture(e.pointerId); } catch (_) {}
        this[propName] = pointerSet.size > 0;
        btn.classList.toggle('pressed', this[propName]);
      };
      btn.addEventListener('pointerup', releasePedal);
      btn.addEventListener('pointercancel', releasePedal);
    };
    bindPedal(this.btnGas, this.gasPointers, 'throttle');
    bindPedal(this.btnBrake, this.brakePointers, 'brake');

    // Gear Shift Paddles
    const bindPaddle = (btn, cbName) => {
      if (!btn) return;
      btn.addEventListener('pointerdown', e => {
        e.preventDefault();
        notifyInteract();
        btn.classList.add('pressed');
        this.haptic(12);
        if (typeof this.callbacks[cbName] === 'function') {
          this.callbacks[cbName]();
        }
      });
      const clearPaddle = () => btn.classList.remove('pressed');
      btn.addEventListener('pointerup', clearPaddle);
      btn.addEventListener('pointercancel', clearPaddle);
      btn.addEventListener('pointerleave', clearPaddle);
    };
    bindPaddle(this.btnShiftUp, 'onShiftUp');
    bindPaddle(this.btnShiftDown, 'onShiftDown');

    // Look-around joystick
    if (this.lookPad) {
      this.lookPad.addEventListener('pointerdown', e => {
        e.preventDefault();
        notifyInteract();
        if (this.lookPointerId !== null) return;
        this.lookPointerId = e.pointerId;
        this.lookPad.classList.add('active');
        try { this.lookPad.setPointerCapture(e.pointerId); } catch (_) {}
        this.updateLookFromPointer(e.clientX, e.clientY);
      });

      this.lookPad.addEventListener('pointermove', e => {
        if (e.pointerId !== this.lookPointerId) return;
        e.preventDefault();
        this.updateLookFromPointer(e.clientX, e.clientY);
      });

      const endLook = e => {
        if (e.pointerId !== this.lookPointerId) return;
        try { this.lookPad.releasePointerCapture(e.pointerId); } catch (_) {}
        this.lookPointerId = null;
        this.lookX = 0;
        this.lookY = 0;
        this.lookActive = false;
        this.lookPad.classList.remove('active');
        if (this.lookPuck) this.lookPuck.style.transform = 'translate(0px, 0px)';
      };
      this.lookPad.addEventListener('pointerup', endLook);
      this.lookPad.addEventListener('pointercancel', endLook);
    }

    // Bottom-center Camera Rotate button
    if (this.btnCam) {
      this.btnCam.addEventListener('pointerdown', e => {
        e.preventDefault();
        notifyInteract();
        this.haptic(8);
        if (typeof this.callbacks.onCycleCamera === 'function') {
          this.callbacks.onCycleCamera();
        }
      });
    }

    // Fullscreen buttons & modal actions
    const triggerFullscreen = () => {
      notifyInteract();
      this.requestFullscreenAndLandscape();
      setTimeout(() => this.syncState(this.inMenu), 120);
    };

    if (this.btnMenuFs) this.btnMenuFs.addEventListener('click', triggerFullscreen);
    if (this.btnRotateFs) this.btnRotateFs.addEventListener('click', triggerFullscreen);
    if (this.btnHudFs) {
      this.btnHudFs.addEventListener('click', () => {
        notifyInteract();
        if (this.isFullscreen()) {
          const exitFs = document.exitFullscreen || document.webkitExitFullscreen;
          if (exitFs) {
            try {
              const p = exitFs.call(document);
              if (p && typeof p.catch === 'function') p.catch(() => {});
            } catch (_) {}
          }
        } else {
          this.requestFullscreenAndLandscape();
        }
        this.btnHudFs.blur();
      });
    }
    if (this.btnFsAccept) {
      this.btnFsAccept.addEventListener('click', () => {
        this.fsPromptDismissed = true;
        triggerFullscreen();
      });
    }
    if (this.btnFsDismiss) {
      this.btnFsDismiss.addEventListener('click', () => {
        this.fsPromptDismissed = true;
        this.syncState(this.inMenu);
      });
    }

    // Global viewport & visibility listeners
    const onViewportChange = () => {
      this.syncState(this.inMenu);
      setTimeout(() => this.syncState(this.inMenu), 150);
    };
    window.addEventListener('resize', onViewportChange);
    window.addEventListener('orientationchange', onViewportChange);
    document.addEventListener('fullscreenchange', onViewportChange);
    document.addEventListener('webkitfullscreenchange', onViewportChange);
    window.addEventListener('blur', () => this.resetTouchInputs());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.resetTouchInputs();
    });
  }
}

window.MobileControls = MobileControls;

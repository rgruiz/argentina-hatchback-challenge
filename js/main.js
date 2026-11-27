/**
 * Main Game Loop, Multi-Car Manager, Camera Controller, HUD & Menu Logic
 * Argentina Hatchback Challenge — Autódromo de Buenos Aires
 */
(function () {
  // --- DOM Elements ---
  const canvas = document.getElementById('game-canvas');
  const tachCanvas = document.getElementById('tach-canvas');
  const tachCtx = tachCanvas.getContext('2d');
  const minimapCanvas = document.getElementById('minimap-canvas');
  const minimapCtx = minimapCanvas.getContext('2d');

  const menuOverlay = document.getElementById('menu-overlay');
  const btnStartRace = document.getElementById('btn-start-race');
  const btnCamera = document.getElementById('btn-camera');
  const btnShiftDown = document.getElementById('btn-shift-down');
  const btnShiftUp = document.getElementById('btn-shift-up');
  const btnPause = document.getElementById('btn-pause');
  const pauseIcon = document.getElementById('pause-icon');
  const pauseLabel = document.getElementById('pause-label');
  const btnReset = document.getElementById('btn-reset');
  const btnAudio = document.getElementById('btn-audio');
  const btnMenu = document.getElementById('btn-menu');
  const btnMenuAnthem = document.getElementById('btn-menu-anthem');
  const menuAnthemLabel = document.getElementById('menu-anthem-label');

  const camLabel = document.getElementById('cam-label');
  const audioLabel = document.getElementById('audio-label');
  const hudCarBadge = document.getElementById('hud-car-badge');
  const carSpecsList = document.getElementById('car-specs-list');
  const colorSelector = document.getElementById('color-selector');
  const colorLabel = document.getElementById('color-label');

  const hudCircuitName = document.getElementById('hud-circuit-name');
  const minimapTitle = document.getElementById('minimap-title');
  const hudPos = document.getElementById('hud-pos');
  const hudLap = document.getElementById('hud-lap');
  const hudCurTime = document.getElementById('hud-cur-time');
  const hudBestTime = document.getElementById('hud-best-time');
  const hudLastTime = document.getElementById('hud-last-time');
  const raceStandingsEl = document.getElementById('race-standings');
  const secPills = [
    document.getElementById('sec-1'),
    document.getElementById('sec-2'),
    document.getElementById('sec-3')
  ];

  const cornerNameEl = document.getElementById('corner-name');
  const offtrackWarning = document.getElementById('offtrack-warning');
  const raceFinishBanner = document.getElementById('race-finish-banner');
  const finishTitleEl = document.getElementById('finish-title');
  const finishSubEl = document.getElementById('finish-sub');
  const racePauseBanner = document.getElementById('race-pause-banner');
  const pauseSubEl = document.getElementById('pause-sub');
  const btnResumeBanner = document.getElementById('btn-resume-banner');
  const startLightsBox = document.getElementById('start-lights');
  const lightBulbs = [
    document.getElementById('light-1'),
    document.getElementById('light-2'),
    document.getElementById('light-3'),
    document.getElementById('light-4'),
    document.getElementById('light-5')
  ];

  const hudGear = document.getElementById('hud-gear');
  const hudTransMode = document.getElementById('hud-trans-mode');
  const hudRpmText = document.getElementById('hud-rpm-text');
  const hudSpeed = document.getElementById('hud-speed');
  const barThrottle = document.getElementById('bar-throttle');
  const barBrake = document.getElementById('bar-brake');

  // --- Three.js Scene Setup ---
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance'
  });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x5da9e9);
  scene.fog = new THREE.FogExp2(0x8ec5fc, 0.00065);

  const camera = new THREE.PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
    0.06,
    2800
  );

  // Lighting
  const hemiLight = new THREE.HemisphereLight(0xffffff, 0x334155, 0.92);
  hemiLight.position.set(0, 200, 0);
  scene.add(hemiLight);

  const dirLight = new THREE.DirectionalLight(0xfffbeb, 1.1);
  dirLight.position.set(-180, 240, 160);
  scene.add(dirLight);

  // --- Core Game Modules ---
  const sound = new SoundEngine();
  const anthemPlayer = new AnthemMidiPlayer(sound);
  const track = new BuenosAiresTrack(scene);
  track.build('8');

  const cars = {
    polo: new VWPoloTrackCar(scene),
    peugeot208: new Peugeot208Car(scene)
  };

  // Soft interior cabin daylight fill lights so each dashboard & steering wheel stays crisp
  const cabinLightPolo = new THREE.PointLight(0xf8fafc, 0.88, 3.6);
  cabinLightPolo.position.set(0.12, 1.18, 0.05);
  cars.polo.chassisGroup.add(cabinLightPolo);

  const cabinLightPeugeot = new THREE.PointLight(0xf8fafc, 0.92, 3.6);
  cabinLightPeugeot.position.set(0.12, 1.18, 0.05);
  cars.peugeot208.chassisGroup.add(cabinLightPeugeot);

  let activeCarKey = 'polo';
  let car = cars.polo;
  cars.peugeot208.root.visible = false;

  const CAR_SPECS_DATA = {
    polo: {
      hudBadge: 'VW POLO TRACK 1.6',
      tachTitle: 'POLO TRACK',
      colorTitle: 'Colores oficiales — Volkswagen Polo Track',
      specs: [
        ['Vehículo', 'Volkswagen Polo Track MY25 (Mk6)'],
        ['Motor', '1.6L MSI 16V (110 CV / 155 Nm)'],
        ['Transmisión', 'Manual de 5 marchas (cambios Q / E)'],
        ['0–100 km/h / Máx.', '10,6 s / 190 km/h (de serie)'],
        ['Tablero', 'Relojes analógicos + pantalla VW I-System'],
        ['Multimedia', 'Pantalla táctil VW Play 10,1" (MY25)'],
        ['Volante', 'Volante VW multifunción de 3 rayos'],
        ['Curvas clásicas', 'Reutemann, Confitería, Ombú, Tobogán, Horquilla']
      ]
    },
    peugeot208: {
      hudBadge: 'PEUGEOT 208 1.3',
      tachTitle: 'PEUGEOT 208',
      colorTitle: 'Colores oficiales — Peugeot 208 Like MT',
      specs: [
        ['Vehículo', 'Peugeot 208 Like MT (versión Argentina)'],
        ['Motor', '1.3L Firefly 8V (96 CV / 125 Nm)'],
        ['Transmisión', 'Manual de 5 marchas (cambios Q / E)'],
        ['0–100 km/h / Máx.', '11,8 s / 180 km/h (de serie)'],
        ['Tablero', 'Peugeot i-Cockpit (tacómetro antihorario)'],
        ['Multimedia', 'Pantalla táctil 10" + teclas tipo piano'],
        ['Volante', 'Compacto i-Cockpit de 2 rayos achatado'],
        ['Curvas clásicas', 'Reutemann, Confitería, Ombú, Tobogán, Horquilla']
      ]
    }
  };

  const physics = new ArcadePhysics(track, sound);

  // --- Race Mode & AI Opponents Pool (Equal Stock Physics + Random Cars) ---
  const TOTAL_RACE_LAPS = 3;
  let raceMode = 'race3'; // 'race3' (Grid vs 3 AI), 'race1' (1v1), 'practice' (Solo)
  const MAX_AI = 3;
  const AI_DRIVERS = [
    { name: 'M. ROSSI', skill: 0.99, lane: -1.6 },
    { name: 'J. M. TRAVERSO', skill: 1.00, lane: 1.6 },
    { name: 'G. ORTELLI', skill: 1.01, lane: -1.4 }
  ];

  const aiPool = AI_DRIVERS.map(drv => {
    const aiPhysics = new ArcadePhysics(track, null);
    const aiPolo = new VWPoloTrackCar(scene);
    const aiPeugeot = new Peugeot208Car(scene);
    aiPolo.root.visible = false;
    aiPeugeot.root.visible = false;
    return {
      name: drv.name,
      physics: aiPhysics,
      controller: new AIRacerController(aiPhysics, track, { skill: drv.skill, preferredLane: drv.lane }),
      models: { polo: aiPolo, peugeot208: aiPeugeot },
      activeModel: null,
      carKey: 'polo',
      colorKey: 'silver',
      colorHex: '#b4bec8',
      active: false
    };
  });

  function getActiveAIs() {
    return aiPool.filter(a => a.active);
  }

  function setupSessionAndGrid() {
    const aiCount = raceMode === 'race1' ? 1 : (raceMode === 'race3' ? 3 : 0);
    const isRace = aiCount > 0;

    if (raceFinishBanner) raceFinishBanner.classList.add('hidden');

    physics.applyCarProfile(activeCarKey);
    physics.resetToStart(isRace ? aiCount : 0, isRace);

    aiPool.forEach((ai, i) => {
      if (i < aiCount) {
        ai.active = true;
        const carKey = Math.random() < 0.5 ? 'polo' : 'peugeot208';
        const chosenModel = ai.models[carKey];
        const otherModel = carKey === 'polo' ? ai.models.peugeot208 : ai.models.polo;
        otherModel.root.visible = false;

        const paletteKeys = Object.keys(chosenModel.colorPalettes);
        const altKeys = paletteKeys.filter(k => k !== car.currentColorKey);
        const pool = altKeys.length > 0 ? altKeys : paletteKeys;
        const colorKey = pool[Math.floor(Math.random() * pool.length)];

        chosenModel.setColor(colorKey);
        chosenModel.root.visible = true;
        ai.activeModel = chosenModel;
        ai.carKey = carKey;
        ai.colorKey = colorKey;
        const bodyHex = chosenModel.colorPalettes[colorKey].body;
        ai.colorHex = '#' + bodyHex.toString(16).padStart(6, '0');

        ai.physics.applyCarProfile(carKey);
        ai.physics.resetToStart(i, true);
        ai.controller.randomizePersonality();
        ai.controller.currentLaneOffset = (i % 2 === 0) ? 2.6 : -2.6;
        ai.activeModel.updateVisuals(0.016, ai.physics);
      } else {
        ai.active = false;
        ai.activeModel = null;
        ai.models.polo.root.visible = false;
        ai.models.peugeot208.root.visible = false;
      }
    });
  }

  // --- Camera Modes ---
  // 0: 3rd Person Exterior Chase Cam
  // 1: 3D Cockpit Interior Cam (Stock VW Polo Track Dealership Cabin)
  // 2: Hood / Bonnet Cam
  // 3: Far Arcade Chase Cam
  const CAMERA_MODES = [
    { name: '3.ª PERSONA', shortName: '3.ª PERS.', fov: 58 },
    { name: 'CABINA INTERIOR', shortName: 'CABINA', fov: 72 },
    { name: 'CAPOT', shortName: 'CAPOT', fov: 62 },
    { name: 'PERSECUCIÓN LEJANA', shortName: 'LEJANA', fov: 64 }
  ];
  let cameraMode = 0;

  // Smooth Chase Camera & Look-Around State
  const camWorldPos = new THREE.Vector3();
  const camLookTarget = new THREE.Vector3();
  let chaseCamHeading = physics.heading;
  let smoothLookYaw = 0;

  // --- Input State ---
  const inputs = {
    up: false,
    down: false,
    left: false,
    right: false,
    handbrake: false,
    lookBack: false,
    lookLeft: false,
    lookRight: false
  };

  let inMenu = true;
  let isPaused = false;
  let raceCanDrive = true;
  let countdownActive = false;
  let countdownElapsed = 0;
  let countdownStage = 0;
  let pendingStartAfterRotate = false;

  function setPaused(paused) {
    isPaused = Boolean(paused);
    document.body.classList.toggle('race-paused', isPaused);
    if (racePauseBanner) racePauseBanner.classList.toggle('hidden', !isPaused);
    if (btnPause) btnPause.classList.toggle('active-cam', isPaused);
    if (pauseIcon) pauseIcon.textContent = isPaused ? '▶' : '⏸';
    if (pauseLabel) pauseLabel.textContent = isPaused ? 'REANUDAR' : 'PAUSA';
    if (pauseSubEl) {
      pauseSubEl.textContent = mobileControls.enabled
        ? 'Tocá ▶ para reanudar la carrera'
        : 'Presioná P o tocá REANUDAR para continuar';
    }
    if (isPaused) {
      sound.silenceDynamic();
      mobileControls.resetTouchInputs();
    }
  }

  // --- Mobile Touch Controls & Orientation / Fullscreen Manager ---
  function resizeRenderer() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }

  const mobileControls = new MobileControls({
    onUserInteract: () => sound.init(),
    onShiftUp: () => {
      if (inMenu || isPaused) return;
      sound.init();
      physics.manualShiftUp();
    },
    onShiftDown: () => {
      if (inMenu || isPaused) return;
      sound.init();
      physics.manualShiftDown();
    },
    onCycleCamera: () => {
      sound.init();
      setCameraMode(cameraMode + 1);
    },
    onPortraitCleared: () => {
      resizeRenderer();
      setTimeout(resizeRenderer, 140);
      if (pendingStartAfterRotate && !inMenu) {
        pendingStartAfterRotate = false;
        triggerStartLightsCountdown();
      }
    }
  });

  // --- Format Helper (MM:SS.mmm) ---
  function formatTime(sec) {
    if (sec === null || sec === undefined || isNaN(sec)) return '--:--.---';
    const mins = Math.floor(sec / 60);
    const remSec = sec % 60;
    const wholeSec = Math.floor(remSec);
    const ms = Math.floor((remSec - wholeSec) * 1000);
    return (
      String(mins).padStart(2, '0') +
      ':' +
      String(wholeSec).padStart(2, '0') +
      '.' +
      String(ms).padStart(3, '0')
    );
  }

  // --- Camera Switching ---
  function setCameraMode(modeIndex) {
    cameraMode = (modeIndex + CAMERA_MODES.length) % CAMERA_MODES.length;
    const mode = CAMERA_MODES[cameraMode];
    camLabel.textContent = `CÁM: ${mode.name}`;
    camera.fov = mode.fov;
    camera.updateProjectionMatrix();

    car.setCockpitViewMode(cameraMode === 1);
    document.body.classList.toggle('cockpit-active', cameraMode === 1);

    // Sync menu buttons
    document.querySelectorAll('#camera-selector .choice-btn').forEach(btn => {
      btn.classList.toggle('selected', Number(btn.dataset.cam) === cameraMode);
    });
  }

  // --- Time of Day / Weather Presets ---
  let currentTimeOfDay = 'day';

  function setTimeOfDay(preset) {
    currentTimeOfDay = preset || 'day';
    if (preset === 'sunset') {
      scene.background.setHex(0xf97316);
      scene.fog.color.setHex(0xfdba74);
      scene.fog.density = 0.00065;
      hemiLight.color.setHex(0xfed7aa);
      hemiLight.groundColor.setHex(0x31102f);
      hemiLight.intensity = 0.72;
      dirLight.color.setHex(0xffedd5);
      dirLight.intensity = 1.05;
      dirLight.position.set(-320, 95, -140);
    } else if (preset === 'dusk') {
      scene.background.setHex(0x0f172a);
      scene.fog.color.setHex(0x1e293b);
      scene.fog.density = 0.00078;
      hemiLight.color.setHex(0x93c5fd);
      hemiLight.groundColor.setHex(0x090d16);
      hemiLight.intensity = 0.52;
      dirLight.color.setHex(0xe0f2fe);
      dirLight.intensity = 0.65;
    } else {
      // Sunny Porteño Afternoon
      scene.background.setHex(0x4ea8de);
      scene.fog.color.setHex(0x90dbf4);
      scene.fog.density = 0.00065;
      hemiLight.color.setHex(0xffffff);
      hemiLight.groundColor.setHex(0x334155);
      hemiLight.intensity = 0.85;
      dirLight.color.setHex(0xfffbeb);
      dirLight.intensity = 0.95;
      dirLight.position.set(-180, 240, 160);
    }
    track.setTimeOfDay(currentTimeOfDay);
  }

  // --- Start Lights Sequence (dt-driven so Pause freezes exact stage cleanly) ---
  function triggerStartLightsCountdown() {
    raceCanDrive = false;
    countdownActive = true;
    countdownElapsed = 0;
    countdownStage = 0;
    startLightsBox.classList.remove('hidden');
    lightBulbs.forEach(b => {
      b.className = 'light-bulb';
    });
  }

  function updateStartLights(dt) {
    if (!countdownActive) return;
    countdownElapsed += dt;

    while (countdownStage < 5 && countdownElapsed >= (countdownStage + 1) * 0.42) {
      lightBulbs[countdownStage].classList.add('red');
      sound.playBeep(440, 0.14);
      countdownStage++;
    }

    if (countdownStage === 5 && countdownElapsed >= 5 * 0.42 + 0.52) {
      lightBulbs.forEach(b => {
        b.className = 'light-bulb green';
      });
      raceCanDrive = true;
      physics.timingStarted = true;
      aiPool.forEach(ai => {
        if (ai.active) ai.physics.timingStarted = true;
      });
      sound.playBeep(880, 0.35);
      countdownStage = 6;
    }

    if (countdownStage === 6 && countdownElapsed >= 5 * 0.42 + 0.52 + 1.40) {
      startLightsBox.classList.add('hidden');
      countdownActive = false;
    }
  }

  // --- Keyboard Listeners ---
  window.addEventListener('keydown', e => {
    const code = e.code;

    if (!inMenu && !isPaused) {
      sound.init();
    }

    if (code === 'KeyW' || code === 'ArrowUp') {
      inputs.up = true;
    } else if (code === 'KeyS' || code === 'ArrowDown') {
      inputs.down = true;
    } else if (code === 'KeyA' || code === 'ArrowLeft') {
      inputs.left = true;
    } else if (code === 'KeyD' || code === 'ArrowRight') {
      inputs.right = true;
    } else if (code === 'Space') {
      inputs.handbrake = true;
      e.preventDefault();
    } else if (code === 'KeyB') {
      inputs.lookBack = true;
    } else if (code === 'KeyV') {
      inputs.lookLeft = true;
    } else if (code === 'KeyN') {
      inputs.lookRight = true;
    } else if (code === 'KeyC' && !e.repeat) {
      setCameraMode(cameraMode + 1);
    } else if ((code === 'KeyE' || code === 'ShiftLeft' || code === 'ShiftRight') && !e.repeat) {
      if (!inMenu && !isPaused) physics.manualShiftUp();
    } else if ((code === 'KeyQ' || code === 'ControlLeft' || code === 'ControlRight') && !e.repeat) {
      if (!inMenu && !isPaused) physics.manualShiftDown();
    } else if (code === 'KeyP' && !e.repeat) {
      if (!inMenu) setPaused(!isPaused);
    } else if (code === 'KeyR' && !e.repeat) {
      setPaused(false);
      setupSessionAndGrid();
      chaseCamHeading = physics.heading;
      triggerStartLightsCountdown();
    } else if (code === 'Escape' && !e.repeat) {
      inMenu = !inMenu;
      if (inMenu) setPaused(false);
      menuOverlay.classList.toggle('hidden', !inMenu);
      mobileControls.syncState(inMenu);
      syncMenuAnthem();
    }
  });

  window.addEventListener('keyup', e => {
    const code = e.code;
    if (code === 'KeyW' || code === 'ArrowUp') inputs.up = false;
    else if (code === 'KeyS' || code === 'ArrowDown') inputs.down = false;
    else if (code === 'KeyA' || code === 'ArrowLeft') inputs.left = false;
    else if (code === 'KeyD' || code === 'ArrowRight') inputs.right = false;
    else if (code === 'Space') inputs.handbrake = false;
    else if (code === 'KeyB') inputs.lookBack = false;
    else if (code === 'KeyV') inputs.lookLeft = false;
    else if (code === 'KeyN') inputs.lookRight = false;
  });

  // --- HUD & Garage Menu Button Events ---
  btnCamera.addEventListener('click', () => {
    sound.init();
    setCameraMode(cameraMode + 1);
    btnCamera.blur();
  });

  btnShiftDown.addEventListener('click', () => {
    if (inMenu || isPaused) return;
    sound.init();
    physics.manualShiftDown();
    btnShiftDown.blur();
  });

  btnShiftUp.addEventListener('click', () => {
    if (inMenu || isPaused) return;
    sound.init();
    physics.manualShiftUp();
    btnShiftUp.blur();
  });

  if (btnPause) {
    btnPause.addEventListener('click', () => {
      if (!inMenu) {
        setPaused(!isPaused);
      }
      btnPause.blur();
    });
  }

  if (btnResumeBanner) {
    btnResumeBanner.addEventListener('click', () => {
      setPaused(false);
      btnResumeBanner.blur();
    });
  }

  btnReset.addEventListener('click', () => {
    sound.init();
    setPaused(false);
    mobileControls.resetTouchInputs();
    setupSessionAndGrid();
    chaseCamHeading = physics.heading;
    triggerStartLightsCountdown();
    btnReset.blur();
  });

  btnAudio.addEventListener('click', () => {
    sound.init();
    const muted = sound.toggleMute();
    audioLabel.textContent = muted ? 'SONIDO: NO' : 'SONIDO: SÍ';
    anthemPlayer.setGlobalMuted(muted);
    updateAnthemButtonUI();
    btnAudio.blur();
  });

  btnMenu.addEventListener('click', () => {
    inMenu = !inMenu;
    if (inMenu) setPaused(false);
    menuOverlay.classList.toggle('hidden', !inMenu);
    mobileControls.syncState(inMenu);
    syncMenuAnthem();
    btnMenu.blur();
  });

  function updateAnthemButtonUI() {
    if (!btnMenuAnthem || !menuAnthemLabel) return;
    const status = anthemPlayer.getStatus();
    btnMenuAnthem.classList.toggle('playing', status === 'playing');
    btnMenuAnthem.classList.toggle('muted', status === 'muted');
    if (status === 'playing') {
      menuAnthemLabel.textContent = '♫ HIMNO: SÍ';
    } else if (status === 'muted') {
      menuAnthemLabel.textContent = '♫ HIMNO: NO';
    } else if (status === 'waiting') {
      menuAnthemLabel.textContent = '♫ HIMNO: TOCÁ PARA OÍR';
    } else {
      menuAnthemLabel.textContent = '♫ HIMNO: SÍ';
    }
  }

  anthemPlayer.onStateChange = updateAnthemButtonUI;

  function syncMenuAnthem() {
    if (inMenu) {
      const hasUserActivation =
        Boolean(sound.ctx && sound.ctx.state === 'running') ||
        Boolean(navigator.userActivation && navigator.userActivation.hasBeenActive);
      if (hasUserActivation && !anthemPlayer.userMuted && !anthemPlayer.globalMuted) {
        sound.init();
        anthemPlayer.start();
      } else {
        anthemPlayer.wantsPlay = !anthemPlayer.userMuted && !anthemPlayer.globalMuted;
      }
    } else {
      anthemPlayer.stop(0.3);
    }
    updateAnthemButtonUI();
  }

  function unlockMenuAnthemOnGesture(event) {
    if (!inMenu) return;
    const target = event && event.target;
    if (
      target &&
      target.closest &&
      (target.closest('#btn-menu-anthem') || target.closest('#btn-start-race'))
    ) {
      return;
    }
    if (anthemPlayer.getStatus() === 'waiting') {
      sound.init();
      anthemPlayer.start();
      updateAnthemButtonUI();
    }
  }

  document.addEventListener('pointerdown', unlockMenuAnthemOnGesture, true);
  document.addEventListener('keydown', unlockMenuAnthemOnGesture, true);

  if (btnMenuAnthem) {
    btnMenuAnthem.addEventListener('click', () => {
      sound.init();
      if (anthemPlayer.getStatus() === 'waiting') {
        anthemPlayer.userMuted = false;
        anthemPlayer.start();
      } else {
        const muted = anthemPlayer.toggleUserMute();
        if (!muted) {
          anthemPlayer.start();
        }
      }
      updateAnthemButtonUI();
      btnMenuAnthem.blur();
    });
  }

  // --- Dynamic Car Switcher & Garage UI Sync ---
  function rebuildColorSwatches() {
    if (!colorSelector) return;
    colorSelector.innerHTML = '';
    const palettes = car.colorPalettes;
    Object.keys(palettes).forEach(colorKey => {
      const pal = palettes[colorKey];
      const btn = document.createElement('button');
      btn.className = 'color-swatch' + (car.currentColorKey === colorKey ? ' selected' : '');
      btn.dataset.color = colorKey;

      const dot = document.createElement('span');
      dot.className = 'swatch-dot';
      dot.style.background = '#' + pal.body.toString(16).padStart(6, '0');

      btn.appendChild(dot);
      btn.appendChild(document.createTextNode(pal.name));

      btn.addEventListener('click', () => {
        colorSelector.querySelectorAll('.color-swatch').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        car.setColor(colorKey);
      });
      colorSelector.appendChild(btn);
    });
  }

  function renderCarSpecs(carKey) {
    const meta = CAR_SPECS_DATA[carKey];
    if (!carSpecsList || !meta) return;
    const corners = track.currentLayout === '8'
      ? 'Reutemann, Confitería, Ombú, Tobogán, Horquilla'
      : 'S del Ciervo, Salotto, Ascari, Horquilla';
    carSpecsList.innerHTML = meta.specs
      .map(([k, v]) => `<li><span>${k}</span><span>${k === 'Curvas clásicas' ? corners : v}</span></li>`)
      .join('');
  }

  function selectCar(carKey) {
    if (!cars[carKey]) return;
    activeCarKey = carKey;
    Object.keys(cars).forEach(k => {
      cars[k].root.visible = (k === carKey);
    });
    car = cars[carKey];

    sound.setCarAudioProfile(carKey);
    setupSessionAndGrid();
    chaseCamHeading = physics.heading;
    car.setCockpitViewMode(cameraMode === 1);

    const meta = CAR_SPECS_DATA[carKey];
    if (hudCarBadge && meta) hudCarBadge.textContent = meta.hudBadge;
    if (colorLabel && meta) colorLabel.textContent = meta.colorTitle;
    renderCarSpecs(carKey);

    document.querySelectorAll('#car-selector .choice-btn').forEach(btn => {
      btn.classList.toggle('selected', btn.dataset.car === carKey);
    });

    rebuildColorSwatches();
    updateHUD();
  }

  // Menu Option Selectors
  document.querySelectorAll('#mode-selector .choice-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#mode-selector .choice-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      raceMode = btn.dataset.mode;
      setupSessionAndGrid();
      chaseCamHeading = physics.heading;
      updateHUD();
    });
  });

  document.querySelectorAll('#car-selector .choice-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      selectCar(btn.dataset.car);
    });
  });

  document.querySelectorAll('#layout-selector .choice-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#layout-selector .choice-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      const layout = btn.dataset.layout;
      track.build(layout);
      track.setTimeOfDay(currentTimeOfDay);
      setupSessionAndGrid();
      chaseCamHeading = physics.heading;
      hudCircuitName.textContent = `AUTÓDROMO BS. AS. — CIRCUITO N°${layout}`;
      minimapTitle.textContent = `EL GÁLVEZ N°${layout}`;
      renderCarSpecs(activeCarKey);
      updateHUD();
    });
  });

  document.querySelectorAll('#camera-selector .choice-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      setCameraMode(Number(btn.dataset.cam));
    });
  });

  document.querySelectorAll('#weather-selector .choice-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#weather-selector .choice-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      setTimeOfDay(btn.dataset.time);
    });
  });

  btnStartRace.addEventListener('click', () => {
    sound.init();
    setPaused(false);
    if (mobileControls.enabled) {
      mobileControls.requestFullscreenAndLandscape();
    }
    inMenu = false;
    menuOverlay.classList.add('hidden');
    anthemPlayer.stop(0.3);
    updateAnthemButtonUI();
    setupSessionAndGrid();
    chaseCamHeading = physics.heading;
    mobileControls.syncState(false);

    if (mobileControls.enabled && mobileControls.pausedForOrientation) {
      pendingStartAfterRotate = true;
    } else {
      pendingStartAfterRotate = false;
      triggerStartLightsCountdown();
    }
  });

  // --- Camera Update Logic ---
  function updateCamera(dt) {
    car.root.updateMatrixWorld(true);
    car.chassisGroup.updateMatrixWorld(true);

    let targetLookYaw = 0;
    let snapLook = false;
    if (mobileControls.enabled && mobileControls.lookActive) {
      targetLookYaw = Math.atan2(-mobileControls.lookX, -mobileControls.lookY);
    } else if (inputs.lookBack) {
      targetLookYaw = Math.PI;
      snapLook = true;
    } else if (inputs.lookLeft) {
      targetLookYaw = Math.PI / 2;
      snapLook = true;
    } else if (inputs.lookRight) {
      targetLookYaw = -Math.PI / 2;
      snapLook = true;
    }

    if (snapLook) {
      smoothLookYaw = targetLookYaw;
    } else {
      let yawDelta = targetLookYaw - smoothLookYaw;
      while (yawDelta > Math.PI) yawDelta -= Math.PI * 2;
      while (yawDelta < -Math.PI) yawDelta += Math.PI * 2;
      smoothLookYaw += yawDelta * Math.min(1, dt * 13);
      if (targetLookYaw === 0 && Math.abs(smoothLookYaw) < 0.005) {
        smoothLookYaw = 0;
      }
    }
    const isLookingOffset = Math.abs(smoothLookYaw) > 0.005;

    if (cameraMode === 1 && Math.abs(smoothLookYaw) > 0.12) {
      const lookBlend = THREE.MathUtils.clamp((Math.abs(smoothLookYaw) - 0.12) / 0.45, 0, 1);
      car.setDriverSeatOpacity(THREE.MathUtils.lerp(1.0, 0.08, lookBlend));
    } else {
      car.setDriverSeatOpacity(1.0);
    }

    if (cameraMode === 1) {
      // ====================================================================
      // CAMERA 1: 3D COCKPIT INTERIOR CAMERA (Driver's Seat View)
      // Tailored per vehicle so Peugeot i-Cockpit views the raised cluster
      // cleanly OVER the compact double-flat steering wheel!
      // ====================================================================
      const headSwayX = -physics.steerAngle * 0.045;
      const headBobY = Math.sin(performance.now() * 0.015) * 0.003 * Math.min(1, physics.speedKmh / 100);
      const brakeNodZ = physics.brakeInput * 0.025 - physics.throttleInput * 0.015;

      const isPeugeot = activeCarKey === 'peugeot208';
      const eyeY = isPeugeot ? 1.13 : 1.11;
      const eyeZ = isPeugeot ? -0.23 : -0.24;
      const targetY = isPeugeot ? 0.83 : 0.81;

      const localEye = new THREE.Vector3(
        0.35 + headSwayX,
        eyeY + headBobY,
        eyeZ + brakeNodZ
      );

      const localTarget = new THREE.Vector3();
      if (isLookingOffset) {
        localTarget.set(
          0.35 + Math.sin(smoothLookYaw) * 8.0,
          0.93,
          eyeZ + Math.cos(smoothLookYaw) * 8.0
        );
      } else {
        localTarget.set(0.26 - physics.steerAngle * 0.65, targetY, 6.0);
      }

      localEye.applyMatrix4(car.chassisGroup.matrixWorld);
      localTarget.applyMatrix4(car.chassisGroup.matrixWorld);

      camera.position.copy(localEye);
      camera.lookAt(localTarget);
      return;
    }

    if (cameraMode === 2) {
      // ====================================================================
      // CAMERA 2: HOOD / BONNET CAMERA
      // ====================================================================
      const localHood = new THREE.Vector3(0, 1.04, 0.88);
      const localTarget = new THREE.Vector3();
      if (isLookingOffset) {
        localTarget.set(
          Math.sin(smoothLookYaw) * 12.0,
          0.88,
          0.88 + Math.cos(smoothLookYaw) * 12.0
        );
      } else {
        localTarget.set(-physics.steerAngle * 1.2, 0.86, 14.0);
      }
      localHood.applyMatrix4(car.chassisGroup.matrixWorld);
      localTarget.applyMatrix4(car.chassisGroup.matrixWorld);
      camera.position.copy(localHood);
      camera.lookAt(localTarget);
      return;
    }

    // ======================================================================
    // CAMERA 0 & 3: 3RD PERSON EXTERIOR CHASE CAMERA (2000s Arcade Spring Cam)
    // ======================================================================
    const isFar = cameraMode === 3;
    const baseDist = isFar ? 7.2 : 4.85;
    const baseHeight = isFar ? 2.45 : 1.72;

    // Smooth angular spring for chase camera
    let angleDiff = physics.heading - chaseCamHeading;
    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
    chaseCamHeading += angleDiff * Math.min(1, dt * 7.5);

    const effectiveHeading = (isLookingOffset ? physics.heading : chaseCamHeading) + smoothLookYaw;
    const dynamicDist = baseDist + (physics.speedKmh / 210) * 0.65;

    const targetCamX = physics.x - Math.sin(effectiveHeading) * dynamicDist;
    const targetCamZ = physics.z - Math.cos(effectiveHeading) * dynamicDist;
    const targetCamY = physics.y + baseHeight;

    if (isLookingOffset) {
      camera.position.set(targetCamX, targetCamY, targetCamZ);
    } else {
      camWorldPos.set(targetCamX, targetCamY, targetCamZ);
      camera.position.lerp(camWorldPos, Math.min(1, dt * 14));
    }

    const lookAheadDist = isLookingOffset ? (2.8 * Math.cos(smoothLookYaw)) : 2.8;

    camLookTarget.set(
      physics.x + Math.sin(physics.heading) * lookAheadDist,
      physics.y + 0.88,
      physics.z + Math.cos(physics.heading) * lookAheadDist
    );
    camera.lookAt(camLookTarget);
  }

  // --- 2000s HUD Analog Tachometer Renderer ---
  function drawHudTachometer(rpm, speedKmh) {
    const w = tachCanvas.width;
    const h = tachCanvas.height;
    const cx = w * 0.5;
    const cy = h * 0.52;
    const r = 66;

    tachCtx.clearRect(0, 0, w, h);

    // Outer dial bezel
    const grad = tachCtx.createRadialGradient(cx, cy, 10, cx, cy, r);
    grad.addColorStop(0, '#0a162e');
    grad.addColorStop(1, '#040914');
    tachCtx.beginPath();
    tachCtx.arc(cx, cy, r, 0, Math.PI * 2);
    tachCtx.fillStyle = grad;
    tachCtx.fill();
    tachCtx.lineWidth = 3;
    tachCtx.strokeStyle = '#00b0f0';
    tachCtx.stroke();

    const startAng = Math.PI * 0.75;
    const endAng = Math.PI * 2.25;
    const maxRpm = 8000;

    // Redline arc (6000 to 8000 RPM)
    const redStart = startAng + (6000 / maxRpm) * (endAng - startAng);
    tachCtx.beginPath();
    tachCtx.arc(cx, cy, r - 6, redStart, endAng);
    tachCtx.strokeStyle = 'rgba(239, 68, 68, 0.75)';
    tachCtx.lineWidth = 6;
    tachCtx.stroke();

    // Ticks & Numbers (0..8)
    for (let i = 0; i <= 8; i++) {
      const ang = startAng + (i / 8) * (endAng - startAng);
      const x1 = cx + Math.cos(ang) * (r - 12);
      const y1 = cy + Math.sin(ang) * (r - 12);
      const x2 = cx + Math.cos(ang) * (r - 3);
      const y2 = cy + Math.sin(ang) * (r - 3);

      tachCtx.strokeStyle = i >= 6 ? '#ef4444' : '#f8fafc';
      tachCtx.lineWidth = 2.5;
      tachCtx.beginPath();
      tachCtx.moveTo(x1, y1);
      tachCtx.lineTo(x2, y2);
      tachCtx.stroke();

      const tx = cx + Math.cos(ang) * (r - 23);
      const ty = cy + Math.sin(ang) * (r - 23);
      tachCtx.fillStyle = i >= 6 ? '#ef4444' : '#cbd5e1';
      tachCtx.font = '900 12px sans-serif';
      tachCtx.textAlign = 'center';
      tachCtx.textBaseline = 'middle';
      tachCtx.fillText(String(i), tx, ty);
    }

    // Center label
    tachCtx.fillStyle = '#74acdf';
    tachCtx.font = 'bold 9px sans-serif';
    tachCtx.textAlign = 'center';
    tachCtx.fillText('x1000 RPM', cx, cy + 22);
    tachCtx.fillStyle = '#ffffff';
    tachCtx.font = 'italic 900 11px sans-serif';
    const tachMeta = CAR_SPECS_DATA[activeCarKey];
    tachCtx.fillText(tachMeta ? tachMeta.tachTitle : 'POLO TRACK', cx, cy - 18);

    // Needle
    const clampedRpm = Math.min(maxRpm, Math.max(0, rpm));
    const needleAng = startAng + (clampedRpm / maxRpm) * (endAng - startAng);
    tachCtx.save();
    tachCtx.strokeStyle = '#ff2a2a';
    tachCtx.shadowColor = '#ff2a2a';
    tachCtx.shadowBlur = 8;
    tachCtx.lineWidth = 3.5;
    tachCtx.beginPath();
    tachCtx.moveTo(cx - Math.cos(needleAng) * 10, cy - Math.sin(needleAng) * 10);
    tachCtx.lineTo(cx + Math.cos(needleAng) * (r - 10), cy + Math.sin(needleAng) * (r - 10));
    tachCtx.stroke();
    tachCtx.restore();

    // Center Cap
    tachCtx.beginPath();
    tachCtx.arc(cx, cy, 6, 0, Math.PI * 2);
    tachCtx.fillStyle = '#e2e8f0';
    tachCtx.fill();
  }

  // --- Track Minimap Renderer ---
  function drawMinimap() {
    const w = minimapCanvas.width;
    const h = minimapCanvas.height;
    minimapCtx.clearRect(0, 0, w, h);

    const samples = track.samples;
    if (!samples || samples.length === 0) return;

    // Compute bounds
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (let i = 0; i < samples.length; i += 4) {
      const p = samples[i].point;
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.z < minZ) minZ = p.z;
      if (p.z > maxZ) maxZ = p.z;
    }

    const pad = 22;
    const spanX = Math.max(1, maxX - minX);
    const spanZ = Math.max(1, maxZ - minZ);
    const scale = Math.min((w - pad * 2) / spanX, (h - pad * 2) / spanZ);

    const toMapX = x => w * 0.5 - (x - (minX + maxX) * 0.5) * scale;
    const toMapY = z => h * 0.54 - (z - (minZ + maxZ) * 0.5) * scale;

    // Draw Lago de Regatas circle on minimap
    minimapCtx.beginPath();
    minimapCtx.arc(toMapX(42), toMapY(315), 95 * scale * 0.75, 0, Math.PI * 2);
    minimapCtx.fillStyle = 'rgba(2, 132, 199, 0.35)';
    minimapCtx.fill();

    // Draw Track Outline
    minimapCtx.beginPath();
    for (let i = 0; i < samples.length; i += 3) {
      const p = samples[i].point;
      const mx = toMapX(p.x);
      const my = toMapY(p.z);
      if (i === 0) minimapCtx.moveTo(mx, my);
      else minimapCtx.lineTo(mx, my);
    }
    minimapCtx.closePath();
    minimapCtx.strokeStyle = 'rgba(0, 176, 240, 0.45)';
    minimapCtx.lineWidth = 7;
    minimapCtx.stroke();

    minimapCtx.strokeStyle = '#f8fafc';
    minimapCtx.lineWidth = 3;
    minimapCtx.stroke();

    // Start/Finish marker
    const s0 = samples[0].point;
    minimapCtx.fillStyle = '#ffd100';
    minimapCtx.fillRect(toMapX(s0.x) - 5, toMapY(s0.z) - 2, 10, 4);

    // AI Opponent Car Arrows (drawn underneath player arrow)
    getActiveAIs().forEach(ai => {
      const ax = toMapX(ai.physics.x);
      const ay = toMapY(ai.physics.z);
      minimapCtx.save();
      minimapCtx.translate(ax, ay);
      minimapCtx.rotate(-ai.physics.heading);
      minimapCtx.beginPath();
      minimapCtx.moveTo(0, -6.5);
      minimapCtx.lineTo(4.5, 4.5);
      minimapCtx.lineTo(-4.5, 4.5);
      minimapCtx.closePath();
      minimapCtx.fillStyle = ai.colorHex;
      minimapCtx.fill();
      minimapCtx.strokeStyle = '#0f172a';
      minimapCtx.lineWidth = 1.5;
      minimapCtx.stroke();
      minimapCtx.restore();
    });

    // Player Car Arrow
    const px = toMapX(physics.x);
    const py = toMapY(physics.z);
    minimapCtx.save();
    minimapCtx.translate(px, py);
    minimapCtx.rotate(-physics.heading);
    minimapCtx.beginPath();
    minimapCtx.moveTo(0, -7);
    minimapCtx.lineTo(5, 5);
    minimapCtx.lineTo(-5, 5);
    minimapCtx.closePath();
    minimapCtx.fillStyle = '#ef4444';
    minimapCtx.fill();
    minimapCtx.strokeStyle = '#ffffff';
    minimapCtx.lineWidth = 1.5;
    minimapCtx.stroke();
    minimapCtx.restore();
  }

  function buildSortedStandings() {
    const playerHex = '#' + car.colorPalettes[car.currentColorKey].body.toString(16).padStart(6, '0');
    const racers = [
      {
        isPlayer: true,
        name: 'VOS',
        carLabel: activeCarKey === 'peugeot208' ? '208' : 'POLO',
        colorHex: playerHex,
        physics
      },
      ...getActiveAIs().map(ai => ({
        isPlayer: false,
        name: ai.name,
        carLabel: ai.carKey === 'peugeot208' ? '208' : 'POLO',
        colorHex: ai.colorHex,
        physics: ai.physics
      }))
    ];

    racers.sort((a, b) => {
      if (a.physics.raceFinished && b.physics.raceFinished) {
        return a.physics.finishTime - b.physics.finishTime;
      }
      if (a.physics.raceFinished !== b.physics.raceFinished) {
        return a.physics.raceFinished ? -1 : 1;
      }
      return b.physics.getRaceProgress() - a.physics.getRaceProgress();
    });

    return racers;
  }

  // --- HUD Telemetry Update ---
  function updateHUD() {
    const speedInt = Math.round(physics.speedKmh);
    const gearStr = physics.gear === -1 ? 'R' : String(physics.gear);

    hudSpeed.textContent = speedInt;
    hudGear.textContent = gearStr;
    hudGear.classList.toggle('shift-up', physics.rpm > (physics.redlineRpm - 250) && physics.gear < 5);
    hudRpmText.textContent = `${Math.round(physics.rpm)} RPM`;

    barThrottle.style.width = `${Math.round(physics.throttleInput * 100)}%`;
    barBrake.style.width = `${Math.round(physics.brakeInput * 100)}%`;

    const activeAIs = getActiveAIs();
    const isRace = activeAIs.length > 0;

    if (isRace) {
      const displayLap = Math.min(physics.lapCount, TOTAL_RACE_LAPS);
      hudLap.textContent = `VTA ${displayLap} / ${TOTAL_RACE_LAPS}`;

      const standings = buildSortedStandings();
      const playerRank = standings.findIndex(r => r.isPlayer) + 1;
      if (hudPos) {
        hudPos.textContent = `P${playerRank} / ${standings.length}`;
        hudPos.classList.remove('hidden');
      }

      if (raceStandingsEl) {
        const leader = standings[0];
        const leaderProg = leader.physics.getRaceProgress();
        const refSpeed = Math.max(20, (leader.physics.speed + 26) * 0.5);

        raceStandingsEl.innerHTML = standings.map((r, idx) => {
          let gapText = 'LÍDER';
          if (idx > 0) {
            if (r.physics.raceFinished && leader.physics.raceFinished) {
              gapText = `+${(r.physics.finishTime - leader.physics.finishTime).toFixed(2)}s`;
            } else {
              const lapDiff = Math.max(0, leaderProg - r.physics.getRaceProgress());
              const secGap = (lapDiff * track.totalLength) / refSpeed;
              gapText = `+${secGap.toFixed(1)}s`;
            }
          }
          return (
            `<div class="standing-row${r.isPlayer ? ' player' : ''}">` +
              `<span class="standing-left">` +
                `<span>P${idx + 1}</span>` +
                `<span class="racer-swatch" style="background:${r.colorHex};"></span>` +
                `<span>${r.name} (${r.carLabel})</span>` +
              `</span>` +
              `<span class="standing-gap">${gapText}</span>` +
            `</div>`
          );
        }).join('');
      }
    } else {
      hudLap.textContent = `VTA ${physics.lapCount}`;
      if (hudPos) hudPos.classList.add('hidden');
      if (raceStandingsEl) raceStandingsEl.innerHTML = '';
    }

    const curTimeStr = formatTime(physics.lapTime);
    hudCurTime.textContent = curTimeStr;
    hudBestTime.textContent = formatTime(physics.bestLapTime);
    hudLastTime.textContent = formatTime(physics.lastLapTime);

    // Sector pills
    for (let i = 0; i < 3; i++) {
      const pill = secPills[i];
      const st = physics.sectorTimes[i];
      const label = st !== null ? `S${i + 1}: ${st.toFixed(1)}s` : `S${i + 1}: --.-`;
      pill.textContent = label;
      pill.className = 'sector-pill';
      if (physics.currentSector === i + 1) pill.classList.add('active');
      else if (st !== null) pill.classList.add('done');
    }

    cornerNameEl.textContent = physics.cornerName;
    offtrackWarning.classList.toggle('visible', physics.surface === 'grass');

    drawHudTachometer(physics.rpm, physics.speedKmh);
    drawMinimap();

    if (mobileControls.enabled) {
      const rpmRatio = Math.min(1, physics.rpm / Math.max(1000, physics.redlineRpm));
      const shiftAlert = physics.rpm > (physics.redlineRpm - 250) && physics.gear < 5;
      mobileControls.updateHudReadout(
        gearStr,
        speedInt,
        rpmRatio,
        shiftAlert,
        CAMERA_MODES[cameraMode].shortName
      );
    }

    // Also update the 3D Cockpit Instrument Cluster & Infotainment Screen inside the car!
    car.updateCockpitDisplays(
      physics.speedKmh,
      physics.rpm,
      gearStr,
      physics.cornerName,
      curTimeStr
    );
  }

  // --- Window Resize ---
  window.addEventListener('resize', resizeRenderer);
  window.addEventListener('orientationchange', () => {
    resizeRenderer();
    setTimeout(resizeRenderer, 140);
  });

  // --- Main Animation Loop ---
  let lastFrameTime = performance.now();

  function animate(now) {
    requestAnimationFrame(animate);

    const dt = Math.min(0.05, (now - lastFrameTime) / 1000);
    lastFrameTime = now;

    if (inMenu) {
      // Showcase orbiting camera around the grid while in Garage Menu
      sound.silenceDynamic();
      car.setDriverSeatOpacity(1.0);
      car.updateVisuals(dt, physics);
      getActiveAIs().forEach(ai => {
        if (ai.activeModel) ai.activeModel.updateVisuals(dt, ai.physics);
      });
      const orbitAngle = now * 0.00045;
      camera.position.set(
        physics.x + Math.sin(orbitAngle) * 5.2,
        physics.y + 1.85,
        physics.z + Math.cos(orbitAngle) * 5.2
      );
      camera.lookAt(physics.x, physics.y + 0.78, physics.z);
    } else if (mobileControls.enabled && mobileControls.pausedForOrientation) {
      // Keep scene rendered cleanly behind portrait rotation prompt while paused
      sound.silenceDynamic();
      updateCamera(dt);
    } else if (isPaused) {
      // Freeze race simulation cleanly while keeping all car positions, speeds, headings & timers intact
      sound.silenceDynamic();
    } else {
      updateStartLights(dt);
      const activeAIs = getActiveAIs();
      const allPhysics = [physics, ...activeAIs.map(a => a.physics)];
      const frameInputs = {
        up: inputs.up || mobileControls.throttle,
        down: inputs.down || mobileControls.brake,
        left: inputs.left,
        right: inputs.right,
        handbrake: inputs.handbrake,
        steer: mobileControls.steerActive ? mobileControls.steerValue : undefined
      };

      physics.update(dt, frameInputs, raceCanDrive, allPhysics);
      activeAIs.forEach(ai => {
        ai.controller.update(dt, raceCanDrive, allPhysics);
      });

      // Resolve car-to-car bumper & side-by-side contact
      if (allPhysics.length > 1) {
        for (let i = 0; i < allPhysics.length; i++) {
          for (let j = i + 1; j < allPhysics.length; j++) {
            ArcadePhysics.resolveCarCollision(allPhysics[i], allPhysics[j], sound);
          }
        }
      }

      // Track race completion in Race Mode
      if (activeAIs.length > 0) {
        allPhysics.forEach(p => {
          if (!p.raceFinished && p.lapCount > TOTAL_RACE_LAPS) {
            p.raceFinished = true;
            p.finishTime = p.totalRaceTime;
          }
        });

        if (physics.raceFinished && raceFinishBanner && raceFinishBanner.classList.contains('hidden')) {
          const standings = buildSortedStandings();
          const playerPos = standings.findIndex(r => r.isPlayer) + 1;
          const totalTimeStr = formatTime(physics.finishTime);
          if (finishTitleEl) {
            finishTitleEl.textContent = playerPos === 1
              ? '🏁 ¡1.° PUESTO — VICTORIA!'
              : `🏁 FINALIZASTE P${playerPos} / ${standings.length}`;
          }
          if (finishSubEl) {
            finishSubEl.textContent = mobileControls.enabled
              ? `Tiempo: ${totalTimeStr} • Tocá REINICIAR para revancha o TALLER / PISTA para volver`
              : `Tiempo: ${totalTimeStr} • Presioná R para revancha o ESC para el taller`;
          }
          raceFinishBanner.classList.remove('hidden');
        }
      }

      car.updateVisuals(dt, physics);
      activeAIs.forEach(ai => {
        if (ai.activeModel) ai.activeModel.updateVisuals(dt, ai.physics);
      });

      updateCamera(dt);
      sound.update(
        physics.rpm,
        physics.throttleInput,
        physics.slipRatio,
        physics.onCurb,
        physics.speedKmh,
        cameraMode === 1,
        physics.brakeInput,
        physics.handbrakeInput,
        physics.surface
      );
      sound.updateAIVoices(
        {
          x: physics.x,
          z: physics.z,
          vx: physics.vx,
          vz: physics.vz,
          heading: physics.heading
        },
        activeAIs,
        cameraMode === 1
      );
      updateHUD();
    }

    renderer.render(scene, camera);
  }

  // Initial state setup
  selectCar('polo');
  setCameraMode(0);
  syncMenuAnthem();
  requestAnimationFrame(animate);
})();

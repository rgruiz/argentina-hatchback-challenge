/**
 * Photo-Accurate 3D Volkswagen Polo Track MY25 (MQB-A0 South America Dealership Spec)
 * Built directly from official VW Polo Track reference photography:
 * - Exterior: Stealth-black honeycomb upper grille, wide smiling lower honeycomb intake,
 *   warm dual-reflector halogen headlamps with white top brow, 15" matte-black 5-twin-spoke
 *   wheel covers, smoked/black-gill 3D taillights, centered VW + "TRACK" tailgate badge,
 *   and large matte-black trapezoidal rear bumper valance with side reflectors.
 * - Interior: Unified upper cockpit bezel housing the octagonal-framed analog cluster +
 *   10.1" VW Play display + right-side Hazard button; dual center vents directly below screen;
 *   red-illuminated 3-dial Climatic A/C + dual USB-C ports; shield-shaped steering wheel horn pad
 *   with hollow split-bottom spoke; silver-bezel 5-speed shifter; and two-tone seats + VW mats.
 */
class VWPoloTrackCar {
  constructor(scene) {
    this.scene = scene;

    this.root = new THREE.Group();
    this.scene.add(this.root);

    this.chassisGroup = new THREE.Group();
    this.root.add(this.chassisGroup);

    // Official Volkswagen Polo Track Brochure Colors (Image 1)
    this.colorPalettes = {
      white:    { body: 0xf3f5f8, metalness: 0.08, roughness: 0.18, name: 'Blanco Cristal' },
      silver:   { body: 0xb4bec8, metalness: 0.62, roughness: 0.18, name: 'Plata Sirius' },
      platinum: { body: 0x555d66, metalness: 0.58, roughness: 0.20, name: 'Gris Platino' },
      black:    { body: 0x12151a, metalness: 0.25, roughness: 0.15, name: 'Negro Universal' },
      red:      { body: 0xc8102e, metalness: 0.35, roughness: 0.18, name: 'Rojo Sunset' }
    };
    this.currentColorKey = 'silver';

    this.envMap = this.createAutomotiveEnvMap();

    this.bodyPaintMat = null;
    this.wheelPivots = [];
    this.wheelMeshes = [];
    this.brakeLightMaterials = [];

    // Cockpit interior references
    this.cockpitGroup = new THREE.Group();
    this.steeringWheelGroup = null;
    this.gearStickPivot = null;
    this.dashCanvas = null;
    this.dashCtx = null;
    this.dashTexture = null;
    this.vwPlayCanvas = null;
    this.vwPlayCtx = null;
    this.vwPlayTexture = null;
    this.mirrorCanvas = null;
    this.mirrorCtx = null;
    this.mirrorTexture = null;
    this.exteriorGlassMat = null;
    this.rearGlassMat = null;
    this.driverSeatMat = null;

    this.smokeParticles = [];
    this.initSmokePool();

    this.buildCar();
  }

  createAutomotiveEnvMap() {
    const faces = [];
    for (let i = 0; i < 6; i++) {
      const c = document.createElement('canvas');
      c.width = 256;
      c.height = 256;
      const ctx = c.getContext('2d');

      if (i === 2) {
        const g = ctx.createRadialGradient(128, 128, 10, 128, 128, 180);
        g.addColorStop(0, '#e0f2fe');
        g.addColorStop(1, '#38bdf8');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, 256, 256);
      } else if (i === 3) {
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(0, 0, 256, 256);
      } else {
        const g = ctx.createLinearGradient(0, 0, 0, 256);
        g.addColorStop(0.0, '#38bdf8');
        g.addColorStop(0.45, '#e0f2fe');
        g.addColorStop(0.50, '#ffffff');
        g.addColorStop(0.53, '#334155');
        g.addColorStop(1.0, '#0f172a');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, 256, 256);
      }
      faces.push(c);
    }
    const cubeTex = new THREE.CubeTexture(faces);
    cubeTex.needsUpdate = true;
    return cubeTex;
  }

  buildLoftedSymmetricSurface(stations, material) {
    const numStations = stations.length;
    const numHalfPts = stations[0].pts.length;
    const ringSize = numHalfPts * 2 - 1;

    const positions = [];
    const uvs = [];
    const indices = [];

    for (let s = 0; s < numStations; s++) {
      const st = stations[s];
      const v = s / (numStations - 1);

      for (let p = numHalfPts - 1; p >= 1; p--) {
        const pt = st.pts[p];
        positions.push(-pt[0], pt[1], st.z + (pt[2] || 0));
        uvs.push(0.5 - (p / (numHalfPts - 1)) * 0.5, v);
      }
      for (let p = 0; p < numHalfPts; p++) {
        const pt = st.pts[p];
        positions.push(pt[0], pt[1], st.z + (pt[2] || 0));
        uvs.push(0.5 + (p / (numHalfPts - 1)) * 0.5, v);
      }
    }

    for (let s = 0; s < numStations - 1; s++) {
      const rowA = s * ringSize;
      const rowB = (s + 1) * ringSize;
      for (let j = 0; j < ringSize - 1; j++) {
        const a = rowA + j;
        const b = rowA + j + 1;
        const c = rowB + j;
        const d = rowB + j + 1;
        indices.push(a, c, b);
        indices.push(b, c, d);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return new THREE.Mesh(geo, material);
  }

  buildSideBodyPanels(stations, material) {
    const group = new THREE.Group();
    const numStations = stations.length;
    const numPts = stations[0].pts.length;

    [-1, 1].forEach(side => {
      const positions = [];
      const indices = [];

      for (let s = 0; s < numStations; s++) {
        const st = stations[s];
        for (let p = 0; p < numPts; p++) {
          const pt = st.pts[p];
          positions.push(side * pt[0], pt[1], st.z);
        }
      }

      for (let s = 0; s < numStations - 1; s++) {
        const rA = s * numPts;
        const rB = (s + 1) * numPts;
        for (let j = 0; j < numPts - 1; j++) {
          const a = rA + j;
          const b = rA + j + 1;
          const c = rB + j;
          const d = rB + j + 1;
          if (side > 0) {
            indices.push(a, b, c);
            indices.push(b, d, c);
          } else {
            indices.push(a, c, b);
            indices.push(b, c, d);
          }
        }
      }

      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geo.setIndex(indices);
      geo.computeVertexNormals();
      group.add(new THREE.Mesh(geo, material));
    });

    return group;
  }

  buildFlushRibbonPair(innerPts, outerPts, material) {
    const group = new THREE.Group();
    const N = innerPts.length;

    [-1, 1].forEach(side => {
      const pos = [];
      const idx = [];
      for (let i = 0; i < N; i++) {
        const pIn = innerPts[i];
        const pOut = outerPts[i];
        pos.push(side * pIn[0], pIn[1], pIn[2]);
        pos.push(side * pOut[0], pOut[1], pOut[2]);
      }
      for (let i = 0; i < N - 1; i++) {
        const b = i * 2;
        if (side > 0) {
          idx.push(b, b + 1, b + 2);
          idx.push(b + 1, b + 3, b + 2);
        } else {
          idx.push(b, b + 2, b + 1);
          idx.push(b + 1, b + 2, b + 3);
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      group.add(new THREE.Mesh(geo, material));
    });

    return group;
  }

  buildCar() {
    const pal = this.colorPalettes[this.currentColorKey];

    this.bodyPaintMat = new THREE.MeshStandardMaterial({
      color: pal.body,
      metalness: pal.metalness,
      roughness: pal.roughness,
      envMap: this.envMap,
      envMapIntensity: 1.25,
      side: THREE.DoubleSide
    });

    const matteBlackPlasticMat = new THREE.MeshStandardMaterial({
      color: 0x15181f,
      roughness: 0.78,
      metalness: 0.05,
      side: THREE.DoubleSide
    });

    const satinBlackMat = new THREE.MeshStandardMaterial({
      color: 0x0f1217,
      roughness: 0.36,
      metalness: 0.18,
      envMap: this.envMap,
      envMapIntensity: 0.55,
      side: THREE.DoubleSide
    });

    const chromeMat = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      metalness: 0.92,
      roughness: 0.08,
      envMap: this.envMap,
      envMapIntensity: 1.4,
      side: THREE.DoubleSide
    });

    this.exteriorGlassMat = new THREE.MeshStandardMaterial({
      color: 0x0d1522,
      metalness: 0.25,
      roughness: 0.05,
      transparent: true,
      opacity: 0.72,
      envMap: this.envMap,
      envMapIntensity: 1.35,
      side: THREE.DoubleSide
    });

    const exteriorGroup = new THREE.Group();
    this.chassisGroup.add(exteriorGroup);

    const rockerSillMat = matteBlackPlasticMat;
    const brakeRotorMat = new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      metalness: 0.82,
      roughness: 0.28
    });
    const brakeCaliperMat = new THREE.MeshStandardMaterial({
      color: 0x64748b,
      metalness: 0.55,
      roughness: 0.42
    });
    const poloWheelMat = new THREE.MeshStandardMaterial({
      color: 0x161920,
      roughness: 0.42,
      metalness: 0.28,
      envMap: this.envMap,
      envMapIntensity: 0.7
    });
    const wheelHubLogoMat = new THREE.MeshStandardMaterial({
      map: this.createPoloTrackWheelCoverTexture(),
      roughness: 0.35,
      metalness: 0.4
    });

    // ========================================================================
    // 1A. CUBIC-SPLINE CLAMSHELL HOOD & VERTICAL FRONT BUMPER NOSE (Polo Mk6 Blueprint)
    // ========================================================================
    const frontHoodControlStations = [
      { z: 0.86, pts: [[0, 0.918, 0], [0.34, 0.920, 0], [0.58, 0.914, 0], [0.72, 0.910, 0], [0.768, 0.908, 0]] },
      { z: 1.28, pts: [[0, 0.875, 0], [0.33, 0.880, 0], [0.56, 0.872, 0], [0.71, 0.868, 0], [0.762, 0.865, 0]] },
      { z: 1.68, pts: [[0, 0.795, 0], [0.31, 0.800, 0], [0.54, 0.788, 0], [0.68, 0.774, 0], [0.735, 0.762, 0]] },
      { z: 1.92, pts: [[0, 0.690, 0], [0.28, 0.692, 0], [0.48, 0.685, -0.01], [0.63, 0.678, -0.025], [0.718, 0.672, -0.04]] },
      { z: 2.00, pts: [[0, 0.565, 0], [0.28, 0.565, 0], [0.48, 0.558, -0.03], [0.63, 0.552, -0.075], [0.720, 0.545, -0.12]] },
      { z: 2.04, pts: [[0, 0.420, 0], [0.30, 0.420, 0], [0.51, 0.415, -0.04], [0.65, 0.410, -0.095], [0.722, 0.405, -0.16]] },
      { z: 2.05, pts: [[0, 0.235, 0], [0.32, 0.235, 0], [0.54, 0.240, -0.04], [0.66, 0.245, -0.10], [0.718, 0.245, -0.17]] }
    ];
    const smoothHoodStations = CarCAD.evaluateCubicSpline(frontHoodControlStations, 24);
    exteriorGroup.add(this.buildLoftedSymmetricSurface(smoothHoodStations, this.bodyPaintMat));

    // Splined Hood Character Crease Ribs converging toward headlamps
    const hoodCreaseMat = new THREE.LineBasicMaterial({ color: 0x64748b, transparent: true, opacity: 0.42 });
    [-1, 1].forEach(side => {
      const creasePts = CarCAD.evaluateCubicSpline([
        [side * 0.61, 0.912, 0.89],
        [side * 0.53, 0.868, 1.24],
        [side * 0.43, 0.798, 1.62],
        [side * 0.34, 0.712, 1.90]
      ], 16).map(p => new THREE.Vector3(p[0], p[1], p[2]));
      exteriorGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(creasePts), hoodCreaseMat));
    });

    // Dark Cowl Plenum Deck bridging interior dash bulkhead (z=0.54) to new forward windshield base (z=0.88)
    const cowlDeck = new THREE.Mesh(
      new THREE.BoxGeometry(1.48, 0.035, 0.38),
      matteBlackPlasticMat
    );
    cowlDeck.position.set(0, 0.865, 0.71);
    exteriorGroup.add(cowlDeck);

    // ========================================================================
    // 1B. CUBIC-SPLINE REAR TAILGATE & REAR BUMPER SHELL (Polo Mk6 Blueprint)
    // ========================================================================
    const rearTailControlStations = [
      { z: -2.01, pts: [[0, 0.235], [0.34, 0.235], [0.58, 0.245], [0.72, 0.268], [0.76, 0.305]] },
      { z: -2.05, pts: [[0, 0.455], [0.34, 0.455], [0.59, 0.465], [0.75, 0.472], [0.80, 0.440]] },
      { z: -2.02, pts: [[0, 0.595], [0.34, 0.595], [0.59, 0.602], [0.75, 0.608], [0.81, 0.575]] },
      { z: -1.94, pts: [[0, 0.720], [0.35, 0.720], [0.60, 0.725], [0.75, 0.728], [0.80, 0.700]] },
      { z: -1.86, pts: [[0, 0.945], [0.35, 0.945], [0.59, 0.940], [0.72, 0.930], [0.765, 0.905]] },
      { z: -1.72, pts: [[0, 0.975], [0.35, 0.975], [0.59, 0.968], [0.71, 0.958], [0.758, 0.940]] }
    ];
    const smoothRearStations = CarCAD.evaluateCubicSpline(rearTailControlStations, 20);
    exteriorGroup.add(this.buildLoftedSymmetricSurface(smoothRearStations, this.bodyPaintMat));

    // ========================================================================
    // 1C. SCULPTED SIDE BODY PANELS & 3D STAMPED WHEEL ARCHES (CarCAD Blueprint)
    //     - Authentic 2:1 door-to-glass ratio (sill y=0.172, belt y=0.92..0.96)
    //     - Razor Polo Mk6 Tornado character crease + lower sill chamfer
    //     - 32-segment semi-circular stamped fender flare ribbons around z = ±1.28
    // ========================================================================
    const poloSideBlueprint = {
      zRear: -2.01,
      zFront: 1.88,
      uniformStations: 48,
      archAngularSteps: 26,
      rearArch:  { z: -1.28, y: 0.308, cutR: 0.390, lipX: 0.858, startAngle: -0.35, endAngle: Math.PI + 0.35 },
      frontArch: { z:  1.28, y: 0.308, cutR: 0.390, lipX: 0.858, startAngle: -0.35, endAngle: Math.PI + 0.35 },
      rows: [
        // Row 0: Lower rocker sill (tucked cleanly underneath at y = 0.172)
        [
          [-2.01, 0.295, 0.745],
          [-1.82, 0.215, 0.785],
          [-1.66, 0.176, 0.802],
          [-0.85, 0.172, 0.805],
          [ 0.00, 0.172, 0.808],
          [ 0.85, 0.172, 0.805],
          [ 1.68, 0.185, 0.790],
          [ 1.88, 0.245, 0.718]
        ],
        // Row 1: Crisp lower door rocker chamfer step
        [
          [-2.01, 0.370, 0.778],
          [-1.78, 0.275, 0.835],
          [-1.50, 0.245, 0.856],
          [-0.85, 0.238, 0.862],
          [ 0.00, 0.236, 0.865],
          [ 0.85, 0.235, 0.862],
          [ 1.62, 0.248, 0.840],
          [ 1.88, 0.315, 0.722]
        ],
        // Row 2: Mid-door slight tumblehome barrel bulge
        [
          [-2.01, 0.540, 0.808],
          [-1.80, 0.555, 0.846],
          [-1.28, 0.565, 0.870],
          [-0.50, 0.562, 0.876],
          [ 0.35, 0.555, 0.876],
          [ 1.28, 0.545, 0.868],
          [ 1.66, 0.525, 0.825],
          [ 1.88, 0.440, 0.722]
        ],
        // Row 3: Iconic Polo Mk6 sharp "Tornado" shoulder crease just under handles
        [
          [-2.01, 0.700, 0.792],
          [-1.82, 0.825, 0.818],
          [-1.45, 0.855, 0.848],
          [-0.75, 0.852, 0.858],
          [ 0.15, 0.842, 0.860],
          [ 0.88, 0.830, 0.854],
          [ 1.58, 0.765, 0.818],
          [ 1.88, 0.555, 0.720]
        ],
        // Row 4: Top beltline & front fender crest matching hood outer edge col 4 seamlessly
        [
          [-2.01, 0.740, 0.762],
          [-1.84, 0.942, 0.768],
          [-1.56, 0.962, 0.768],
          [-0.85, 0.946, 0.776],
          [ 0.00, 0.930, 0.778],
          [ 0.86, 0.908, 0.768],
          [ 1.28, 0.865, 0.762],
          [ 1.68, 0.762, 0.735],
          [ 1.88, 0.672, 0.718]
        ]
      ],
      creaseRows: [1, 3],
      shutLines: [
        // Front fender -> front door seam
        {
          pts: [
            [0.770, 0.908, 0.83],
            [0.855, 0.825, 0.84],
            [0.875, 0.550, 0.85],
            [0.862, 0.245, 0.86],
            [0.805, 0.175, 0.87]
          ],
          width: 0.0055,
          material: satinBlackMat
        },
        // Center B-pillar -> door split seam (slanted subtly rearward)
        {
          pts: [
            [0.778, 0.938, -0.15],
            [0.860, 0.840, -0.11],
            [0.876, 0.550, -0.09],
            [0.864, 0.240, -0.09],
            [0.806, 0.174, -0.09]
          ],
          width: 0.0055,
          material: satinBlackMat
        },
        // Rear door shut-line curving around front arc of rear wheel arch (Image 4 detail)
        {
          pts: [
            [0.774, 0.950, -1.04],
            [0.856, 0.845, -1.07],
            [0.873, 0.650, -0.97],
            [0.864, 0.430, -0.90],
            [0.810, 0.180, -0.87]
          ],
          width: 0.0055,
          material: satinBlackMat
        }
      ]
    };
    exteriorGroup.add(CarCAD.buildSculptedSideBody(poloSideBlueprint, this.bodyPaintMat));

    // Stamped 32-segment Circular Painted Wheel-Arch Fender Flare Ribbons (z = ±1.28)
    exteriorGroup.add(CarCAD.buildWheelArchFenderRibbon(
      1.28, 0.308, 0.358, 0.402, 0.872, 0.858, -0.34, Math.PI + 0.34, 32, this.bodyPaintMat
    ));
    exteriorGroup.add(CarCAD.buildWheelArchFenderRibbon(
      -1.28, 0.308, 0.358, 0.402, 0.872, 0.858, -0.34, Math.PI + 0.34, 32, this.bodyPaintMat
    ));

    // Subtle dark lower sill trim underline along doors between wheels
    [-1, 1].forEach(side => {
      const sillTrim = new THREE.Mesh(
        new THREE.BoxGeometry(0.024, 0.022, 1.76),
        rockerSillMat
      );
      sillTrim.position.set(side * 0.796, 0.175, 0.00);
      exteriorGroup.add(sillTrim);
    });

    // Square/rounded fuel filler door seam on right (-X) rear quarter above arch
    const fuelPts = CarCAD.evaluateCubicSpline([
      [-0.856, 0.835, -1.49],
      [-0.856, 0.835, -1.61],
      [-0.858, 0.735, -1.61],
      [-0.858, 0.735, -1.49],
      [-0.856, 0.835, -1.49]
    ], 24).map(p => new THREE.Vector3(p[0], p[1], p[2]));
    exteriorGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(fuelPts), new THREE.LineBasicMaterial({ color: 0x0f172a })));

    // ========================================================================
    // 2. POLO Mk6 CUBIC-SPLINE ROOFLINE, SPOILER & 3-PANE CONTOURED GREENHOUSE
    // ========================================================================
    const roofControlStations = [
      { z: -1.38, pts: [[0, 1.402], [0.27, 1.402], [0.50, 1.384], [0.625, 1.356]] },
      { z: -0.96, pts: [[0, 1.430], [0.28, 1.430], [0.52, 1.412], [0.642, 1.384]] },
      { z: -0.45, pts: [[0, 1.442], [0.29, 1.442], [0.54, 1.424], [0.655, 1.396]] },
      { z:  0.00, pts: [[0, 1.425], [0.29, 1.425], [0.53, 1.406], [0.650, 1.378]] },
      { z:  0.28, pts: [[0, 1.396], [0.28, 1.396], [0.51, 1.376], [0.638, 1.348]] }
    ];
    exteriorGroup.add(this.buildLoftedSymmetricSurface(CarCAD.evaluateCubicSpline(roofControlStations, 20), this.bodyPaintMat));

    // Integrated Rear Roof Spoiler Lip + Satin Aero Underside
    const spoilerTopStations = [
      { z: -1.56, pts: [[0, 1.386], [0.27, 1.386], [0.52, 1.368], [0.60, 1.342]] },
      { z: -1.37, pts: [[0, 1.402], [0.27, 1.402], [0.50, 1.384], [0.625, 1.356]] }
    ];
    exteriorGroup.add(this.buildLoftedSymmetricSurface(spoilerTopStations, this.bodyPaintMat));

    const spoilerUnderStations = [
      { z: -1.56, pts: [[0, 1.366], [0.27, 1.366], [0.52, 1.348], [0.60, 1.324]] },
      { z: -1.39, pts: [[0, 1.382], [0.27, 1.382], [0.50, 1.364], [0.618, 1.338]] }
    ];
    exteriorGroup.add(this.buildLoftedSymmetricSurface(spoilerUnderStations, satinBlackMat));

    // Sleek Swept A-Pillars & Arched Roof Cantrails (Cubic-Splined from z = 0.87 cowl to z = -1.38 spoiler)
    const aPillarAndRailInner = CarCAD.evaluateCubicSpline([
      [0.680, 0.910,  0.86],
      [0.652, 1.135,  0.58],
      [0.602, 1.345,  0.28],
      [0.608, 1.392, -0.45],
      [0.585, 1.380, -0.96],
      [0.562, 1.352, -1.38]
    ], 24);
    const aPillarAndRailOuter = CarCAD.evaluateCubicSpline([
      [0.766, 0.905,  0.86],
      [0.722, 1.130,  0.58],
      [0.650, 1.345,  0.28],
      [0.658, 1.396, -0.45],
      [0.642, 1.384, -0.96],
      [0.625, 1.356, -1.38]
    ], 24);
    exteriorGroup.add(this.buildFlushRibbonPair(aPillarAndRailInner, aPillarAndRailOuter, this.bodyPaintMat));

    // Wide Angular VW Polo Mk6 Body-Colored C-Pillars behind rear quarter kink
    const cPillarInner = CarCAD.evaluateCubicSpline([
      [0.578, 1.352, -1.36],
      [0.645, 1.160, -1.58],
      [0.725, 0.962, -1.76]
    ], 12);
    const cPillarOuter = CarCAD.evaluateCubicSpline([
      [0.632, 1.342, -1.24],
      [0.715, 1.130, -1.48],
      [0.765, 0.955, -1.56]
    ], 12);
    exteriorGroup.add(this.buildFlushRibbonPair(cPillarInner, cPillarOuter, this.bodyPaintMat));

    // Matte-Black Front A-Pillar Sail Triangle ahead of front window
    [-1, 1].forEach(side => {
      const sailPos = [
        side * 0.766, 0.910, 0.84,
        side * 0.760, 0.918, 0.65,
        side * 0.726, 1.070, 0.63
      ];
      const sailGeo = new THREE.BufferGeometry();
      sailGeo.setAttribute('position', new THREE.Float32BufferAttribute(sailPos, 3));
      sailGeo.setIndex(side > 0 ? [0, 1, 2] : [0, 2, 1]);
      sailGeo.computeVertexNormals();
      exteriorGroup.add(new THREE.Mesh(sailGeo, matteBlackPlasticMat));
    });

    // Roof Bee-Sting Antenna (moved cleanly along updated roof arch)
    const antennaBase = new THREE.Mesh(
      new THREE.BoxGeometry(0.042, 0.028, 0.075),
      matteBlackPlasticMat
    );
    antennaBase.position.set(0, 1.418, -1.16);
    exteriorGroup.add(antennaBase);

    const antennaMast = new THREE.Mesh(
      new THREE.CylinderGeometry(0.004, 0.007, 0.21, 8),
      matteBlackPlasticMat
    );
    antennaMast.position.set(0, 1.505, -1.22);
    antennaMast.rotation.x = -0.58;
    exteriorGroup.add(antennaMast);

    // ========================================================================
    // 3. WINDSHIELD, REAR GLASS, CONTOURED 3-PANE SIDE WINDOWS & MIRRORS
    // ========================================================================
    const wsStations = CarCAD.evaluateCubicSpline([
      { z: 0.28, pts: [[0, 1.385], [0.26, 1.385], [0.47, 1.368], [0.602, 1.345]] },
      { z: 0.58, pts: [[0, 1.150], [0.28, 1.148], [0.51, 1.140], [0.652, 1.132]] },
      { z: 0.87, pts: [[0, 0.915], [0.30, 0.916], [0.54, 0.912], [0.680, 0.908]] }
    ], 12);
    exteriorGroup.add(this.buildLoftedSymmetricSurface(wsStations, this.exteriorGlassMat));

    const rearGlassMat = new THREE.MeshStandardMaterial({
      map: this.createRearDefrosterGlassTexture(),
      metalness: 0.25,
      roughness: 0.06,
      transparent: true,
      opacity: 0.72,
      envMap: this.envMap,
      envMapIntensity: 1.35,
      side: THREE.DoubleSide
    });
    this.rearGlassMat = rearGlassMat;
    const rearGlassStations = CarCAD.evaluateCubicSpline([
      { z: -1.75, pts: [[0, 0.972], [0.28, 0.972], [0.52, 0.962], [0.715, 0.955]] },
      { z: -1.56, pts: [[0, 1.175], [0.27, 1.175], [0.49, 1.164], [0.642, 1.152]] },
      { z: -1.36, pts: [[0, 1.382], [0.25, 1.382], [0.46, 1.372], [0.578, 1.352]] }
    ], 12);
    exteriorGroup.add(this.buildLoftedSymmetricSurface(rearGlassStations, rearGlassMat));

    // CarCAD Contoured 3-Pane Polo Mk6 Greenhouse (DLO + rubber seal + B-pillar + quarter divider bar)
    const poloSideWindowPts = {
      samples: 76,
      frameWidth: 0.022,
      frameOut: 0.008,
      pts: [
        // Beltline front -> rear
        [0.760, 0.922,  0.65],
        [0.772, 0.932,  0.22],
        [0.775, 0.942, -0.18],
        [0.774, 0.952, -0.68],
        [0.768, 0.962, -1.16],
        [0.758, 0.968, -1.49],
        // Tight Polo rear quarter kink curving up C-pillar
        [0.742, 1.005, -1.52],
        [0.692, 1.165, -1.40],
        [0.645, 1.320, -1.26],
        // Roofline cantrail rear -> front
        [0.635, 1.348, -1.18],
        [0.648, 1.372, -0.78],
        [0.658, 1.385, -0.30],
        [0.652, 1.358,  0.14],
        [0.646, 1.335,  0.25],
        // Swept A-pillar down to mirror sail corner
        [0.708, 1.135,  0.55],
        [0.752, 0.955,  0.67]
      ]
    };
    const poloBPillar = {
      zBottom: -0.15,
      zTop: -0.24,
      yBottom: 0.938,
      yTop: 1.378,
      xBottom: 0.775,
      xTop: 0.656,
      widthBottom: 0.11,
      widthTop: 0.095,
      thickness: 0.012
    };
    const poloQPillar = {
      zBottom: -1.04,
      zTop: -1.12,
      yBottom: 0.958,
      yTop: 1.352,
      xBottom: 0.770,
      xTop: 0.638,
      widthBottom: 0.044,
      widthTop: 0.042,
      thickness: 0.011
    };
    exteriorGroup.add(
      CarCAD.buildGreenhouseWindowAndFrame(
        poloSideWindowPts,
        poloBPillar,
        poloQPillar,
        this.exteriorGlassMat,
        matteBlackPlasticMat
      )
    );

    [-1, 1].forEach(side => {
      // Sculpted Matte-Black Pull Door Handles aligned beneath Tornado crease
      [0.02, -0.74].forEach(zPos => {
        const yHandle = zPos > 0 ? 0.865 : 0.875;
        const pocket = new THREE.Mesh(
          new THREE.BoxGeometry(0.01, 0.030, 0.13),
          new THREE.MeshBasicMaterial({ color: 0x1e293b })
        );
        pocket.position.set(side * 0.848, yHandle - 0.002, zPos);
        exteriorGroup.add(pocket);

        const handleBar = new THREE.Mesh(
          new THREE.CylinderGeometry(0.013, 0.013, 0.14, 12),
          matteBlackPlasticMat
        );
        handleBar.rotation.x = Math.PI / 2;
        handleBar.scale.set(0.72, 1.0, 1.0);
        handleBar.position.set(side * 0.863, yHandle, zPos);
        exteriorGroup.add(handleBar);
      });

      // Sculpted Rounded Matte-Black Wing Mirrors mounted at A-pillar window corner (z = 0.64)
      const mirrorGroup = new THREE.Group();
      mirrorGroup.position.set(side * 0.855, 0.935, 0.62);

      const baseTriangle = new THREE.Mesh(
        new THREE.BoxGeometry(0.036, 0.072, 0.095),
        matteBlackPlasticMat
      );
      baseTriangle.position.set(side * -0.072, -0.01, 0.02);
      baseTriangle.rotation.x = 0.48;
      mirrorGroup.add(baseTriangle);

      const arm = new THREE.Mesh(
        new THREE.CylinderGeometry(0.013, 0.017, 0.078, 10),
        matteBlackPlasticMat
      );
      arm.rotation.z = Math.PI / 2;
      arm.position.set(side * -0.044, -0.012, 0.01);
      mirrorGroup.add(arm);

      const cap = new THREE.Mesh(
        new THREE.SphereGeometry(0.074, 18, 12),
        matteBlackPlasticMat
      );
      cap.scale.set(1.16, 0.72, 0.84);
      cap.rotation.y = side * -0.20;
      mirrorGroup.add(cap);

      const repeater = new THREE.Mesh(
        new THREE.BoxGeometry(0.105, 0.010, 0.014),
        new THREE.MeshBasicMaterial({ color: 0xfde047 })
      );
      repeater.position.set(side * 0.01, 0.0, 0.058);
      repeater.rotation.y = side * -0.20;
      mirrorGroup.add(repeater);

      const mirrorLens = new THREE.Mesh(
        new THREE.CircleGeometry(0.058, 14),
        chromeMat
      );
      mirrorLens.scale.set(1.24, 0.74, 1.0);
      mirrorLens.position.set(0, 0, -0.054);
      mirrorLens.rotation.y = Math.PI + side * 0.20;
      mirrorGroup.add(mirrorLens);

      exteriorGroup.add(mirrorGroup);
    });

    // ========================================================================
    // 4. FRONT FASCIA (Image 3 Reference):
    //    - Stealth All-Black Honeycomb Upper Grille (no chrome bar) + VW Badge
    //    - Wide Smiling Lower Honeycomb Intake with C-shaped outer surrounds
    //    - Warm Dual-Reflector Halogen Headlamps with White Upper Brow
    // ========================================================================
    const upperGrilleTex = this.createUpperGrilleTexture();
    const upperGrille = new THREE.Mesh(
      new THREE.PlaneGeometry(0.90, 0.122),
      new THREE.MeshStandardMaterial({ map: upperGrilleTex, roughness: 0.6, metalness: 0.1 })
    );
    upperGrille.position.set(0, 0.625, 2.016);
    upperGrille.rotation.x = -0.06;
    exteriorGroup.add(upperGrille);

    // Wide Smiling Lower Bumper Honeycomb Intake (Image 3)
    const lowerGrilleTex = this.createSmilingLowerGrilleTexture();
    const lowerIntake = new THREE.Mesh(
      new THREE.PlaneGeometry(1.38, 0.225),
      new THREE.MeshStandardMaterial({ map: lowerGrilleTex, roughness: 0.65, metalness: 0.1, transparent: true })
    );
    lowerIntake.position.set(0, 0.355, 2.042);
    lowerIntake.rotation.x = 0.03;
    exteriorGroup.add(lowerIntake);

    const frontVWBadge = this.createVWLogoBadge(0.084);
    frontVWBadge.position.set(0, 0.625, 2.026);
    frontVWBadge.rotation.x = -0.06;
    exteriorGroup.add(frontVWBadge);

    // Front Hood Leading-Edge Shut-Line across upper grille & headlamps
    const frontHoodShutPts = CarCAD.evaluateCubicSpline([
      [-0.718, 0.674, 1.885],
      [-0.480, 0.686, 1.912],
      [ 0.000, 0.692, 1.925],
      [ 0.480, 0.686, 1.912],
      [ 0.718, 0.674, 1.885]
    ], 24).map(p => new THREE.Vector3(p[0], p[1], p[2]));
    exteriorGroup.add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(frontHoodShutPts),
      new THREE.LineBasicMaterial({ color: 0x0f172a })
    ));

    // Shiny Dual-Reflector Halogen Headlamps (Image 3)
    const headlampTex = this.createHeadlampTexture();
    const shinyHeadlampMat = new THREE.MeshStandardMaterial({
      map: headlampTex,
      emissiveMap: headlampTex,
      emissive: 0xfff7ed,
      emissiveIntensity: 0.58,
      roughness: 0.05,
      metalness: 0.25,
      envMap: this.envMap,
      envMapIntensity: 1.5
    });
    [-1, 1].forEach(side => {
      const hlLens = new THREE.Mesh(
        new THREE.PlaneGeometry(0.35, 0.142),
        shinyHeadlampMat
      );
      hlLens.position.set(side * 0.585, 0.625, 1.995);
      hlLens.rotation.y = side * 0.22;
      hlLens.rotation.x = -0.06;
      if (side < 0) hlLens.scale.x = -1;
      exteriorGroup.add(hlLens);

      // Wraparound Side Headlamp Corner (visible from side view as in Image 4)
      const sideHl = new THREE.Mesh(
        new THREE.PlaneGeometry(0.24, 0.105),
        shinyHeadlampMat
      );
      sideHl.position.set(side * 0.725, 0.628, 1.835);
      sideHl.rotation.y = side * (Math.PI / 2 - 0.20);
      if (side > 0) sideHl.scale.x = -1;
      exteriorGroup.add(sideHl);
    });

    // ========================================================================
    // 5. REAR END (Images 2 & 4 Reference):
    //    - Centered VW Emblem + "T R A C K" centered directly underneath!
    //    - Smoked/Black-Gill 3D Taillight Clusters with bottom amber/clear strip
    //    - Large Trapezoidal Matte-Black Rear Bumper Valance + Red Reflectors
    // ========================================================================
    const rearDiffuserTex = this.createRearTrapezoidDiffuserTexture();
    const rearValance = new THREE.Mesh(
      new THREE.PlaneGeometry(1.34, 0.25),
      new THREE.MeshStandardMaterial({ map: rearDiffuserTex, roughness: 0.78, metalness: 0.05, transparent: true })
    );
    rearValance.position.set(0, 0.37, -2.052);
    rearValance.rotation.y = Math.PI;
    rearValance.rotation.x = 0.05;
    exteriorGroup.add(rearValance);

    // Sleek Red Bumper Reflectors above the outer corners of the black valance (Images 2 & 4)
    [-1, 1].forEach(side => {
      const refl = new THREE.Mesh(
        new THREE.PlaneGeometry(0.21, 0.024),
        new THREE.MeshBasicMaterial({ color: 0xdc2626 })
      );
      refl.position.set(side * 0.535, 0.425, -2.049);
      refl.rotation.y = Math.PI - side * 0.14;
      exteriorGroup.add(refl);
    });

    // Center Tailgate VW Badge + "T R A C K" Block Lettering Directly Underneath (Images 2 & 4)
    const rearVWBadge = this.createVWLogoBadge(0.076);
    rearVWBadge.position.set(0, 0.835, -1.948);
    rearVWBadge.rotation.y = Math.PI;
    rearVWBadge.rotation.x = -0.34;
    exteriorGroup.add(rearVWBadge);

    const trackCenterScriptTex = this.createCenteredTrackScriptTexture();
    const trackCenterPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(0.26, 0.045),
      new THREE.MeshBasicMaterial({ map: trackCenterScriptTex, transparent: true })
    );
    trackCenterPlane.position.set(0, 0.735, -1.968);
    trackCenterPlane.rotation.y = Math.PI;
    trackCenterPlane.rotation.x = -0.22;
    exteriorGroup.add(trackCenterPlane);

    // Polo Mk6 Rear Tailgate Shut-Lines & Character Crease
    exteriorGroup.add(
      CarCAD.buildSymmetricTrunkLines(
        [
          {
            pts: [
              [0.690, 0.955, -1.755],
              [0.470, 0.895, -1.875],
              [0.465, 0.720, -1.945],
              [0.430, 0.598, -2.024]
            ],
            mirrored: true,
            width: 0.006,
            offsetZ: -0.005
          },
          {
            pts: [
              [-0.430, 0.598, -2.024],
              [ 0.000, 0.595, -2.026],
              [ 0.430, 0.598, -2.024]
            ],
            mirrored: false,
            width: 0.006,
            offsetZ: -0.005
          },
          {
            pts: [
              [-0.465, 0.695, -1.962],
              [ 0.000, 0.692, -1.965],
              [ 0.465, 0.695, -1.962]
            ],
            mirrored: false,
            width: 0.0045,
            offsetZ: -0.004
          }
        ],
        satinBlackMat
      )
    );

    // Rear Windshield Wiper Arm (pivoting from right to left at bottom of rear glass)
    const rearWiper = new THREE.Mesh(
      new THREE.BoxGeometry(0.35, 0.016, 0.02),
      matteBlackPlasticMat
    );
    rearWiper.position.set(0.12, 0.985, -1.755);
    rearWiper.rotation.z = -0.04;
    exteriorGroup.add(rearWiper);

    // License Plates
    const plateTex = this.createLicensePlateTexture();
    const rearPlate = new THREE.Mesh(
      new THREE.PlaneGeometry(0.42, 0.135),
      new THREE.MeshBasicMaterial({ map: plateTex })
    );
    rearPlate.position.set(0, 0.39, -2.060);
    rearPlate.rotation.y = Math.PI;
    exteriorGroup.add(rearPlate);

    const frontPlate = rearPlate.clone();
    frontPlate.rotation.y = 0;
    frontPlate.position.set(0, 0.468, 2.042);
    exteriorGroup.add(frontPlate);

    // Smoked/Black-Gill 3D Taillight Clusters (Images 2 & 4)
    this.tailOffTex = this.createTaillightTexture(false);
    this.tailBrakeTex = this.createTaillightTexture(true);

    [-1, 1].forEach(side => {
      const tailMat = new THREE.MeshBasicMaterial({ map: this.tailOffTex });
      this.brakeLightMaterials.push(tailMat);

      const tailCluster = new THREE.Mesh(
        new THREE.BoxGeometry(0.32, 0.21, 0.145),
        tailMat
      );
      tailCluster.position.set(side * 0.62, 0.815, -1.895);
      tailCluster.rotation.y = side * -0.16;
      exteriorGroup.add(tailCluster);

      // Wraparound Smoked Taillight Side Wing & Red Side Bumper Reflector (Image 4)
      const sideTail = new THREE.Mesh(
        new THREE.PlaneGeometry(0.24, 0.175),
        tailMat
      );
      sideTail.position.set(side * 0.785, 0.815, -1.78);
      sideTail.rotation.y = side * (Math.PI / 2 + 0.14);
      exteriorGroup.add(sideTail);

      const sideRefl = new THREE.Mesh(
        new THREE.PlaneGeometry(0.14, 0.02),
        new THREE.MeshBasicMaterial({ color: 0xdc2626 })
      );
      sideRefl.position.set(side * 0.805, 0.445, -1.86);
      sideRefl.rotation.y = side * (Math.PI / 2 + 0.15);
      exteriorGroup.add(sideRefl);
    });

    // High-Mount Red 3rd Brake Light in Roof Spoiler (Image 2 & 4)
    const thirdBrakeMat = new THREE.MeshBasicMaterial({ color: 0xb91c1c });
    this.thirdBrakeMat = thirdBrakeMat;
    const thirdBrake = new THREE.Mesh(
      new THREE.BoxGeometry(0.36, 0.020, 0.03),
      thirdBrakeMat
    );
    thirdBrake.position.set(0, 1.392, -1.535);
    exteriorGroup.add(thirdBrake);

    // ========================================================================
    // 6. 15" MATTE-BLACK VW POLO TRACK WHEELS + BRAKE DISCS & DARK WELL TUBS
    // ========================================================================
    const wheelPositions = [
      { x: -0.77, y: 0.308, z:  1.28, front: true,  side: -1 },
      { x:  0.77, y: 0.308, z:  1.28, front: true,  side:  1 },
      { x: -0.77, y: 0.308, z: -1.28, front: false, side: -1 },
      { x:  0.77, y: 0.308, z: -1.28, front: false, side:  1 }
    ];

    const tireRubberMat = new THREE.MeshStandardMaterial({
      color: 0x15171c,
      roughness: 0.84,
      metalness: 0.04,
      side: THREE.DoubleSide
    });
    const tireSidewallMat = new THREE.MeshStandardMaterial({
      color: 0x1a1d24,
      roughness: 0.72,
      metalness: 0.06,
      side: THREE.DoubleSide
    });

    const wheelWellGeo = new THREE.CircleGeometry(0.375, 28);
    const wheelWellBarrelGeo = new THREE.CylinderGeometry(0.375, 0.375, 0.24, 28, 1, true, 0, Math.PI);
    wheelWellBarrelGeo.rotateZ(Math.PI / 2);

    wheelPositions.forEach(wp => {
      // Dark interior wheelhouse liner & backing plate attached to chassis
      const wellBack = new THREE.Mesh(wheelWellGeo, matteBlackPlasticMat);
      wellBack.position.set(wp.side * 0.62, wp.y + 0.01, wp.z);
      wellBack.rotation.y = wp.side > 0 ? Math.PI / 2 : -Math.PI / 2;
      exteriorGroup.add(wellBack);

      const wellArchRoof = new THREE.Mesh(wheelWellBarrelGeo, matteBlackPlasticMat);
      wellArchRoof.position.set(wp.side * 0.72, wp.y + 0.01, wp.z);
      exteriorGroup.add(wellArchRoof);

      const steerPivot = new THREE.Group();
      steerPivot.position.set(wp.x, wp.y, wp.z);
      this.root.add(steerPivot);

      const wheelAsm = CarCAD.buildDetailedWheelAssembly({
        radius: 0.308,
        width: 0.195,
        rimRadius: 0.198, // 185/65 R15 tall chunky sidewall matching Polo Track photo
        side: wp.side,
        isRear: !wp.front,
        style: 'polo_cover',
        segments: 40,
        tireMat: tireRubberMat,
        sidewallMat: tireSidewallMat,
        rimMat: poloWheelMat,
        spokeMat: matteBlackPlasticMat,
        hubMat: wheelHubLogoMat,
        rotorMat: brakeRotorMat,
        caliperMat: brakeCaliperMat
      });

      steerPivot.add(wheelAsm.staticGroup);
      steerPivot.add(wheelAsm.spinGroup);

      if (wp.front) {
        this.wheelPivots.push(steerPivot);
      }
      this.wheelMeshes.push(wheelAsm.spinGroup);
    });

    const underShadow = new THREE.Mesh(
      new THREE.PlaneGeometry(1.76, 3.92),
      new THREE.MeshBasicMaterial({
        color: 0x030712,
        transparent: true,
        opacity: 0.68
      })
    );
    underShadow.rotation.x = -Math.PI / 2;
    underShadow.position.set(0, 0.03, 0);
    this.root.add(underShadow);

    // ========================================================================
    // 7. BUILD PHOTO-ACCURATE MY25 STOCK DEALERSHIP COCKPIT (Images 5 & 6)
    // ========================================================================
    this.buildStockDealershipCockpit();
    this.chassisGroup.add(this.cockpitGroup);
  }

  /**
   * Builds the exact MY25 Stock Dealership Interior from Images 5 & 6:
   * - Unified Upper Cockpit Bezel housing the Octagonal-Framed Instrument Cluster on the left
   *   and the 10.1" VW Play Touchscreen + Right-Side Hazard Warning Button on the right
   * - Matte Silver-Grey Passenger Dashboard Trim Band flowing into the Right Air Vent
   * - Dual Horizontal Center Air Vents directly below the 10.1" VW Play screen
   * - Red-Illuminated 3-Dial Climatic A/C Panel + Dual Illuminated USB-C Ports in lower cubby
   * - Steering Wheel with Shield/Teardrop Horn Pad, Silver-Bordered Red-Lit Multifunction Buttons,
   *   and Hollow Split-Bottom 6-o'clock Spoke
   * - Silver-Grey Trapezoidal Shifter Surround + 5-Speed H-Pattern Knob + VW Floor Mats + Two-Tone Seats
   */
  buildStockDealershipCockpit() {
    const dashCharcoalMat = new THREE.MeshStandardMaterial({
      color: 0x1e222a,
      roughness: 0.68,
      metalness: 0.06
    });

    const dashSoftBlackMat = new THREE.MeshStandardMaterial({
      color: 0x13161c,
      roughness: 0.52,
      metalness: 0.08
    });

    const pianoBezelMat = new THREE.MeshStandardMaterial({
      color: 0x141820,
      roughness: 0.25,
      metalness: 0.28,
      envMap: this.envMap,
      envMapIntensity: 0.55
    });

    const satinSilverGreyMat = new THREE.MeshStandardMaterial({
      color: 0x646e7a,
      roughness: 0.35,
      metalness: 0.48,
      envMap: this.envMap,
      envMapIntensity: 0.65
    });

    const brightSilverMat = new THREE.MeshStandardMaterial({
      color: 0xd1d5db,
      roughness: 0.22,
      metalness: 0.82,
      envMap: this.envMap,
      envMapIntensity: 0.95
    });

    const headlinerGreyMat = new THREE.MeshLambertMaterial({ color: 0x9ca3af });
    const seatFabricMat = new THREE.MeshStandardMaterial({
      map: this.createPoloTrackSeatFabricTexture(),
      roughness: 0.85,
      metalness: 0.02
    });

    // 1. Cabin Floor Carpet + Branded "VW / POLO" Floor Mats (Images 5 & 6)
    const floorCarpet = new THREE.Mesh(
      new THREE.BoxGeometry(1.52, 0.05, 1.95),
      dashSoftBlackMat
    );
    floorCarpet.position.set(0, 0.25, -0.10);
    this.cockpitGroup.add(floorCarpet);

    const floorMatTex = this.createVWFloorMatTexture();
    [-0.36, 0.36].forEach(mx => {
      const matMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(0.44, 0.52),
        new THREE.MeshBasicMaterial({ map: floorMatTex })
      );
      matMesh.rotation.x = -Math.PI / 2;
      matMesh.position.set(mx, 0.278, 0.16);
      this.cockpitGroup.add(matMesh);
    });

    // Rear Bench Seat & Parcel Shelf
    const rearBenchBack = new THREE.Mesh(
      new THREE.BoxGeometry(1.48, 0.68, 0.14),
      seatFabricMat
    );
    rearBenchBack.position.set(0, 0.66, -1.35);
    rearBenchBack.rotation.x = -0.15;
    this.cockpitGroup.add(rearBenchBack);

    const parcelShelf = new THREE.Mesh(
      new THREE.BoxGeometry(1.46, 0.05, 0.42),
      dashSoftBlackMat
    );
    parcelShelf.position.set(0, 0.92, -1.60);
    this.cockpitGroup.add(parcelShelf);

    [-1, 1].forEach(side => {
      const doorCard = new THREE.Mesh(
        new THREE.BoxGeometry(0.06, 0.62, 1.85),
        dashCharcoalMat
      );
      doorCard.position.set(side * 0.74, 0.58, -0.25);
      this.cockpitGroup.add(doorCard);

      const armrest = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, 0.045, 0.54),
        dashSoftBlackMat
      );
      armrest.position.set(side * 0.70, 0.65, 0.08);
      this.cockpitGroup.add(armrest);

      const doorHandle = new THREE.Mesh(
        new THREE.BoxGeometry(0.02, 0.028, 0.075),
        brightSilverMat
      );
      doorHandle.position.set(side * 0.70, 0.76, 0.24);
      this.cockpitGroup.add(doorHandle);
    });

    // 2. Two-Tone Bolstered Seats with Light-Grey Side Wings & Contrast Stitch (Image 5)
    this.driverSeatMat = seatFabricMat.clone();
    [-0.35, 0.35].forEach(xPos => {
      const seatMat = xPos > 0 ? this.driverSeatMat : seatFabricMat;
      const seatCushion = new THREE.Mesh(
        new THREE.BoxGeometry(0.46, 0.12, 0.46),
        seatMat
      );
      seatCushion.position.set(xPos, 0.39, -0.18);
      this.cockpitGroup.add(seatCushion);

      const seatBack = new THREE.Mesh(
        new THREE.BoxGeometry(0.46, 0.60, 0.10),
        seatMat
      );
      seatBack.position.set(xPos, 0.72, -0.42);
      seatBack.rotation.x = -0.16;
      this.cockpitGroup.add(seatBack);

      const headrest = new THREE.Mesh(
        new THREE.BoxGeometry(0.22, 0.18, 0.085),
        seatMat
      );
      headrest.position.set(xPos, 1.10, -0.48);
      this.cockpitGroup.add(headrest);
    });

    // 3. Main Sculpted Dashboard Bulkhead (behind z = 0.46)
    const dashLowerBody = new THREE.Mesh(
      new THREE.BoxGeometry(1.48, 0.34, 0.16),
      dashCharcoalMat
    );
    dashLowerBody.position.set(0, 0.65, 0.54);
    this.cockpitGroup.add(dashLowerBody);

    const dashTopPad = new THREE.Mesh(
      new THREE.BoxGeometry(1.46, 0.024, 0.15),
      dashSoftBlackMat
    );
    dashTopPad.position.set(0, 0.825, 0.535);
    this.cockpitGroup.add(dashTopPad);

    // Passenger-Side Upper Gloss-Black Panel + Lower Matte Silver-Grey Trim Band (Images 5 & 6)
    const passengerUpperPanel = new THREE.Mesh(
      new THREE.BoxGeometry(0.58, 0.105, 0.02),
      pianoBezelMat
    );
    passengerUpperPanel.position.set(-0.41, 0.79, 0.455);
    this.cockpitGroup.add(passengerUpperPanel);

    const passengerSilverBand = new THREE.Mesh(
      new THREE.BoxGeometry(0.76, 0.042, 0.024),
      satinSilverGreyMat
    );
    passengerSilverBand.position.set(-0.34, 0.72, 0.456);
    this.cockpitGroup.add(passengerSilverBand);

    const glovebox = new THREE.Mesh(
      new THREE.BoxGeometry(0.54, 0.18, 0.015),
      dashSoftBlackMat
    );
    glovebox.position.set(-0.41, 0.56, 0.455);
    this.cockpitGroup.add(glovebox);

    // 4. Unified Driver Instrument Binnacle & Octagonal-Framed Cluster (Images 5 & 6)
    const clusterBacking = new THREE.Mesh(
      new THREE.BoxGeometry(0.44, 0.19, 0.04),
      pianoBezelMat
    );
    clusterBacking.position.set(0.35, 0.885, 0.468);
    clusterBacking.rotation.x = 0.08;
    this.cockpitGroup.add(clusterBacking);

    // Continuous Upper Visor linking Instrument Cluster to 10" VW Play Screen (Images 5 & 6)
    const unifiedTopVisor = new THREE.Mesh(
      new THREE.BoxGeometry(0.84, 0.018, 0.065),
      dashSoftBlackMat
    );
    unifiedTopVisor.position.set(0.16, 0.978, 0.445);
    this.cockpitGroup.add(unifiedTopVisor);

    this.dashCanvas = document.createElement('canvas');
    this.dashCanvas.width = 640;
    this.dashCanvas.height = 280;
    this.dashCtx = this.dashCanvas.getContext('2d');
    this.dashTexture = new THREE.CanvasTexture(this.dashCanvas);
    this.dashTexture.anisotropy = 4;

    const clusterPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(0.41, 0.175),
      new THREE.MeshBasicMaterial({ map: this.dashTexture })
    );
    clusterPlane.position.set(0.35, 0.885, 0.442);
    clusterPlane.rotation.y = Math.PI;
    clusterPlane.rotation.x = 0.08;
    this.cockpitGroup.add(clusterPlane);

    // 5. Left Driver Air Vent & Rotary Headlight Switch (x = +0.63) + Right Passenger Air Vent (x = -0.63)
    const leftVentPanel = new THREE.Mesh(
      new THREE.PlaneGeometry(0.14, 0.18),
      new THREE.MeshBasicMaterial({ map: this.createLeftVentAndLightSwitchTexture() })
    );
    leftVentPanel.position.set(0.63, 0.79, 0.444);
    leftVentPanel.rotation.y = Math.PI - 0.08;
    this.cockpitGroup.add(leftVentPanel);

    const rightVentPanel = new THREE.Mesh(
      new THREE.PlaneGeometry(0.14, 0.09),
      new THREE.MeshBasicMaterial({ map: this.createSingleAirVentTexture() })
    );
    rightVentPanel.position.set(-0.63, 0.79, 0.442);
    rightVentPanel.rotation.y = Math.PI + 0.06;
    this.cockpitGroup.add(rightVentPanel);

    // ========================================================================
    // 6. MY25 CENTER CONSOLE (Images 5 & 6 Reference):
    //    - Top: 10.1" VW Play Touchscreen + Right-Side Red Hazard Button
    //    - Middle: Sleek Dual Horizontal Center Air Vents (no hazard button between them!)
    //    - Bottom: Red-Illuminated 3-Dial Climatic A/C + Dual Illuminated USB-C Ports
    // ========================================================================
    const centerStackHousing = new THREE.Mesh(
      new THREE.BoxGeometry(0.38, 0.47, 0.12),
      pianoBezelMat
    );
    centerStackHousing.position.set(-0.01, 0.74, 0.47);
    centerStackHousing.rotation.y = -0.09; // Tilted toward the driver's seat (+X)
    this.cockpitGroup.add(centerStackHousing);

    this.vwPlayCanvas = document.createElement('canvas');
    this.vwPlayCanvas.width = 540;
    this.vwPlayCanvas.height = 660;
    this.vwPlayCtx = this.vwPlayCanvas.getContext('2d');
    this.vwPlayTexture = new THREE.CanvasTexture(this.vwPlayCanvas);
    this.vwPlayTexture.anisotropy = 4;

    const centerFaceplate = new THREE.Mesh(
      new THREE.PlaneGeometry(0.355, 0.435),
      new THREE.MeshBasicMaterial({ map: this.vwPlayTexture })
    );
    centerFaceplate.position.set(-0.01, 0.75, 0.402);
    centerFaceplate.rotation.y = Math.PI - 0.09;
    this.cockpitGroup.add(centerFaceplate);

    // 3 Physical Rotary Knobs for the Red-Backlit Climatic A/C Panel
    const acKnobGeo = new THREE.CylinderGeometry(0.022, 0.024, 0.018, 18);
    acKnobGeo.rotateX(Math.PI / 2);
    [-0.102, -0.01, 0.082].forEach(ax => {
      const dz = (ax + 0.01) * 0.09;
      const acDial = new THREE.Mesh(acKnobGeo, dashSoftBlackMat);
      acDial.position.set(ax, 0.615, 0.395 + dz);
      acDial.rotation.y = -0.09;
      this.cockpitGroup.add(acDial);

      const redGlowRing = new THREE.Mesh(
        new THREE.TorusGeometry(0.022, 0.0022, 8, 18),
        new THREE.MeshBasicMaterial({ color: 0xef4444 })
      );
      redGlowRing.position.set(ax, 0.615, 0.386 + dz);
      redGlowRing.rotation.y = -0.09;
      this.cockpitGroup.add(redGlowRing);
    });

    // ========================================================================
    // 7. SILVER-BEZEL SHIFTER CONSOLE, 5-SPEED KNOB, 12V SOCKET & HANDBRAKE (Images 5 & 6)
    // ========================================================================
    const tunnelConsole = new THREE.Mesh(
      new THREE.BoxGeometry(0.24, 0.24, 0.86),
      dashCharcoalMat
    );
    tunnelConsole.position.set(0.0, 0.39, 0.08);
    this.cockpitGroup.add(tunnelConsole);

    // Matte Silver-Grey Trapezoidal Shifter Base Bezel with Left Switch Blanks (Images 5 & 6)
    const shifterConsoleTex = this.createShifterConsoleBezelTexture();
    const shiftSurround = new THREE.Mesh(
      new THREE.BoxGeometry(0.165, 0.02, 0.21),
      new THREE.MeshStandardMaterial({ map: shifterConsoleTex, roughness: 0.38, metalness: 0.45 })
    );
    shiftSurround.position.set(0.0, 0.515, 0.23);
    this.cockpitGroup.add(shiftSurround);

    // Pleated Black Leather Shift Boot
    const shiftBoot = new THREE.Mesh(
      new THREE.ConeGeometry(0.062, 0.085, 12),
      dashSoftBlackMat
    );
    shiftBoot.position.set(-0.01, 0.555, 0.23);
    this.cockpitGroup.add(shiftBoot);

    // Animated 5-Speed Gear Lever Pivot + Chrome-Ringed H-Pattern Cap
    this.gearStickPivot = new THREE.Group();
    this.gearStickPivot.position.set(-0.01, 0.53, 0.23);
    this.cockpitGroup.add(this.gearStickPivot);

    const shiftShaft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.011, 0.014, 0.14, 10),
      dashSoftBlackMat
    );
    shiftShaft.position.y = 0.07;
    this.gearStickPivot.add(shiftShaft);

    const shiftKnobBall = new THREE.Mesh(
      new THREE.SphereGeometry(0.032, 16, 16),
      dashSoftBlackMat
    );
    shiftKnobBall.scale.set(0.94, 1.14, 1.05);
    shiftKnobBall.position.y = 0.145;
    this.gearStickPivot.add(shiftKnobBall);

    const hPatternCap = new THREE.Mesh(
      new THREE.CircleGeometry(0.024, 18),
      new THREE.MeshBasicMaterial({ map: this.createShiftKnobHPatternTexture() })
    );
    hPatternCap.rotation.x = -Math.PI / 2 + 0.35;
    hPatternCap.rotation.z = Math.PI;
    hPatternCap.position.set(0, 0.178, -0.008);
    this.gearStickPivot.add(hPatternCap);

    // 12V Socket & Mechanical Handbrake Lever (Image 5 bottom center)
    const socket12V = new THREE.Mesh(
      new THREE.CylinderGeometry(0.016, 0.016, 0.015, 12),
      brightSilverMat
    );
    socket12V.position.set(-0.01, 0.515, 0.06);
    this.cockpitGroup.add(socket12V);

    const handbrakeLever = new THREE.Mesh(
      new THREE.CylinderGeometry(0.016, 0.020, 0.23, 10),
      dashSoftBlackMat
    );
    handbrakeLever.rotation.x = Math.PI / 2 - 0.28;
    handbrakeLever.position.set(0.055, 0.55, -0.02);
    this.cockpitGroup.add(handbrakeLever);

    // Footwell Pedals
    [0.45, 0.35, 0.25].forEach(px => {
      const pedalPad = new THREE.Mesh(
        new THREE.BoxGeometry(0.045, 0.08, 0.015),
        dashSoftBlackMat
      );
      pedalPad.position.set(px, 0.39, 0.44);
      pedalPad.rotation.x = -0.35;
      this.cockpitGroup.add(pedalPad);
    });

    // ========================================================================
    // 8. AUTHENTIC MY25 STEERING WHEEL (Images 5 & 6 Reference):
    //    - Shield / Teardrop Horn Airbag Pad with Embossed Chrome VW Emblem
    //    - Silver-Bordered Red-Illuminated Multifunction Button Islands
    //    - Hollow Split-Bottom 6-o'clock Spoke with Satin Grey U-Trim
    // ========================================================================
    const steeringCol = new THREE.Mesh(
      new THREE.CylinderGeometry(0.052, 0.064, 0.24, 14),
      dashCharcoalMat
    );
    steeringCol.rotation.x = Math.PI / 2 + 0.22;
    steeringCol.position.set(0.35, 0.81, 0.33);
    this.cockpitGroup.add(steeringCol);

    // Turn Signal (Left) & Wiper (Right) Stalks with White Markings (Image 5)
    [-1, 1].forEach(side => {
      const stalk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.010, 0.013, 0.14, 10),
        dashSoftBlackMat
      );
      stalk.rotation.z = side * (Math.PI / 2 - 0.18);
      stalk.position.set(0.35 + side * 0.115, 0.835, 0.275);
      this.cockpitGroup.add(stalk);
    });

    const wheelMount = new THREE.Group();
    wheelMount.position.set(0.35, 0.835, 0.22);
    wheelMount.rotation.x = 0.22;
    this.cockpitGroup.add(wheelMount);

    this.steeringWheelGroup = new THREE.Group();
    wheelMount.add(this.steeringWheelGroup);

    const wheelRadius = 0.192;
    const wheelRim = new THREE.Mesh(
      new THREE.TorusGeometry(wheelRadius, 0.0185, 18, 48),
      dashSoftBlackMat
    );
    this.steeringWheelGroup.add(wheelRim);

    // 10-and-2 Ergonomic Thumb Rests (Images 5 & 6)
    [-1, 1].forEach(side => {
      const thumbGrip = new THREE.Mesh(
        new THREE.SphereGeometry(0.022, 10, 10),
        dashSoftBlackMat
      );
      thumbGrip.scale.set(0.85, 1.38, 0.85);
      const ang = side > 0 ? Math.PI * 0.17 : Math.PI * 0.83;
      thumbGrip.position.set(Math.cos(ang) * (wheelRadius - 0.008), Math.sin(ang) * (wheelRadius - 0.008), 0);
      this.steeringWheelGroup.add(thumbGrip);
    });

    // Horizontal Left & Right Spokes + Silver-Bordered Red-Illuminated Button Islands (Images 5 & 6)
    const hSpoke = new THREE.Mesh(
      new THREE.BoxGeometry(wheelRadius * 1.88, 0.044, 0.022),
      dashSoftBlackMat
    );
    hSpoke.position.set(0, -0.020, 0);
    this.steeringWheelGroup.add(hSpoke);

    const mfButtonsTex = this.createSteeringWheelButtonsTexture();
    [-1, 1].forEach(side => {
      const btnIsland = new THREE.Mesh(
        new THREE.PlaneGeometry(0.068, 0.038),
        new THREE.MeshBasicMaterial({ map: mfButtonsTex })
      );
      btnIsland.position.set(side * 0.116, -0.020, -0.012);
      btnIsland.rotation.y = Math.PI;
      this.steeringWheelGroup.add(btnIsland);
    });

    // Hollow Split-Bottom 6-o'clock Spoke (Images 5 & 6 show two angled legs with an open center slot!)
    [-1, 1].forEach(side => {
      const splitLeg = new THREE.Mesh(
        new THREE.BoxGeometry(0.020, wheelRadius * 0.82, 0.020),
        dashSoftBlackMat
      );
      splitLeg.position.set(side * 0.024, -wheelRadius * 0.49, 0);
      splitLeg.rotation.z = side * 0.10;
      this.steeringWheelGroup.add(splitLeg);

      const trimLeg = new THREE.Mesh(
        new THREE.BoxGeometry(0.012, wheelRadius * 0.72, 0.022),
        satinSilverGreyMat
      );
      trimLeg.position.set(side * 0.022, -wheelRadius * 0.49, -0.002);
      trimLeg.rotation.z = side * 0.10;
      this.steeringWheelGroup.add(trimLeg);
    });

    const bottomBridge = new THREE.Mesh(
      new THREE.BoxGeometry(0.052, 0.016, 0.022),
      satinSilverGreyMat
    );
    bottomBridge.position.set(0, -wheelRadius + 0.022, -0.002);
    this.steeringWheelGroup.add(bottomBridge);

    // Shield / Teardrop Shaped Central Horn Airbag Pad + Embossed Chrome VW Emblem (Images 5 & 6)
    const hornShieldShape = new THREE.Shape();
    hornShieldShape.moveTo(0, 0.062);
    hornShieldShape.bezierCurveTo(0.078, 0.062, 0.088, 0.022, 0.072, -0.032);
    hornShieldShape.bezierCurveTo(0.054, -0.082, 0.026, -0.092, 0, -0.092);
    hornShieldShape.bezierCurveTo(-0.026, -0.092, -0.054, -0.082, -0.072, -0.032);
    hornShieldShape.bezierCurveTo(-0.088, 0.022, -0.078, 0.062, 0, 0.062);

    const hornExtrudeGeo = new THREE.ExtrudeGeometry(hornShieldShape, {
      depth: 0.032,
      bevelEnabled: true,
      bevelThickness: 0.006,
      bevelSize: 0.006,
      bevelSegments: 4
    });
    const airbagShieldMesh = new THREE.Mesh(hornExtrudeGeo, dashSoftBlackMat);
    airbagShieldMesh.position.set(0, 0.0, -0.016);
    this.steeringWheelGroup.add(airbagShieldMesh);

    const hornChromeRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.036, 0.0022, 10, 28),
      brightSilverMat
    );
    hornChromeRing.position.set(0, -0.014, -0.023);
    this.steeringWheelGroup.add(hornChromeRing);

    const wheelVWLogo = this.createVWLogoBadge(0.034);
    wheelVWLogo.rotation.y = Math.PI;
    wheelVWLogo.position.set(0, -0.014, -0.024);
    this.steeringWheelGroup.add(wheelVWLogo);

    // ========================================================================
    // 9. SUN VISORS, INTERIOR REARVIEW MIRROR & LOW EXTERIOR WIPERS
    // ========================================================================
    [-1, 1].forEach(side => {
      const sunVisor = new THREE.Mesh(
        new THREE.BoxGeometry(0.34, 0.016, 0.12),
        headlinerGreyMat
      );
      sunVisor.position.set(side * 0.32, 1.36, 0.22);
      sunVisor.rotation.x = 0.12;
      this.cockpitGroup.add(sunVisor);
    });

    const mirrorStem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.009, 0.011, 0.08, 8),
      dashSoftBlackMat
    );
    mirrorStem.position.set(0, 1.33, 0.28);
    this.cockpitGroup.add(mirrorStem);

    const mirrorHousing = new THREE.Mesh(
      new THREE.BoxGeometry(0.23, 0.058, 0.02),
      dashSoftBlackMat
    );
    mirrorHousing.position.set(0, 1.29, 0.27);
    mirrorHousing.rotation.y = -0.10;
    this.cockpitGroup.add(mirrorHousing);

    this.mirrorCanvas = document.createElement('canvas');
    this.mirrorCanvas.width = 256;
    this.mirrorCanvas.height = 64;
    this.mirrorCtx = this.mirrorCanvas.getContext('2d');
    this.mirrorTexture = new THREE.CanvasTexture(this.mirrorCanvas);

    const mirrorGlassPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(0.218, 0.048),
      new THREE.MeshBasicMaterial({ map: this.mirrorTexture })
    );
    mirrorGlassPlane.position.set(0, 1.29, 0.258);
    mirrorGlassPlane.rotation.y = Math.PI - 0.10;
    this.cockpitGroup.add(mirrorGlassPlane);

    [-0.18, 0.30].forEach(wx => {
      const wiperArm = new THREE.Mesh(
        new THREE.BoxGeometry(0.42, 0.012, 0.016),
        dashSoftBlackMat
      );
      wiperArm.position.set(wx, 0.905, 0.855);
      wiperArm.rotation.z = -0.04;
      this.cockpitGroup.add(wiperArm);
    });

    this.updateCockpitDisplays(0, 850, '1', 'RECTA PRINCIPAL', '00:00.000');
  }

  // ==========================================================================
  // PHOTO-ACCURATE TEXTURE GENERATORS (Images 1–6)
  // ==========================================================================

  createUpperGrilleTexture() {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 96;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#090b10';
    ctx.fillRect(0, 0, 512, 96);

    // Hexagonal honeycomb mesh + horizontal black ribs (Image 3)
    ctx.strokeStyle = '#1f2430';
    ctx.lineWidth = 3;
    const r = 12;
    for (let y = 0; y < 104; y += r * 1.5) {
      for (let x = 0; x < 524; x += r * 1.732) {
        const ox = (Math.round(y / (r * 1.5)) % 2) * (r * 0.866);
        ctx.beginPath();
        for (let a = 0; a < 6; a++) {
          const ang = (a * Math.PI) / 3 + Math.PI / 6;
          const px = x + ox + Math.cos(ang) * (r - 1);
          const py = y + Math.sin(ang) * (r - 1);
          if (a === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.stroke();
      }
    }

    // Two stealth matte-black horizontal slat bars across the upper grille (Image 3)
    ctx.fillStyle = '#161a23';
    ctx.fillRect(0, 28, 512, 10);
    ctx.fillRect(0, 62, 512, 10);
    return new THREE.CanvasTexture(c);
  }

  createSmilingLowerGrilleTexture() {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 128;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, 512, 128);

    // Wide smiling lower bumper intake with flared C-shaped outer corners (Image 3)
    ctx.fillStyle = '#0b0e14';
    ctx.beginPath();
    ctx.moveTo(28, 12);
    ctx.lineTo(484, 12);
    ctx.lineTo(506, 86);
    ctx.lineTo(465, 118);
    ctx.lineTo(47, 118);
    ctx.lineTo(6, 86);
    ctx.closePath();
    ctx.fill();

    // Honeycomb pattern inside
    ctx.strokeStyle = '#232936';
    ctx.lineWidth = 2.5;
    for (let y = 18; y < 114; y += 16) {
      ctx.beginPath();
      ctx.moveTo(18, y);
      ctx.lineTo(494, y);
      ctx.stroke();
    }
    for (let x = 24; x < 490; x += 28) {
      ctx.beginPath();
      ctx.moveTo(x, 14);
      ctx.lineTo(x + 8, 114);
      ctx.stroke();
    }

    // Outer C-shaped matte-black fog-area trim Bezels (Image 3)
    ctx.strokeStyle = '#262c3a';
    ctx.lineWidth = 10;
    ctx.strokeRect(14, 16, 95, 96);
    ctx.strokeRect(403, 16, 95, 96);

    return new THREE.CanvasTexture(c);
  }

  createHeadlampTexture() {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 128;
    const ctx = c.getContext('2d');

    // Smoked dark-chrome inner housing (Image 3)
    ctx.fillStyle = '#12161f';
    ctx.fillRect(0, 0, 256, 128);

    // Crisp White Upper Eyebrow Strip along top of headlamp (Image 3)
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(8, 6, 240, 12);

    // Outer Halogen Reflector Chamber (Silver/White parabolic bowl)
    const g1 = ctx.createRadialGradient(74, 66, 6, 74, 66, 48);
    g1.addColorStop(0, '#ffffff');
    g1.addColorStop(0.45, '#e2e8f0');
    g1.addColorStop(1, '#262d3d');
    ctx.fillStyle = g1;
    ctx.beginPath();
    ctx.arc(74, 66, 44, 0, Math.PI * 2);
    ctx.fill();

    // Inner Warm Halogen High/Daytime Reflector Bowl (Image 3 warm golden halogen glow!)
    const g2 = ctx.createRadialGradient(176, 68, 4, 176, 68, 42);
    g2.addColorStop(0, '#fffbeb');
    g2.addColorStop(0.35, '#fde68a');
    g2.addColorStop(0.7, '#d97706');
    g2.addColorStop(1, '#262d3d');
    ctx.fillStyle = g2;
    ctx.beginPath();
    ctx.arc(176, 68, 38, 0, Math.PI * 2);
    ctx.fill();

    // Faceted reflector lines
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 2;
    ctx.strokeRect(24, 24, 100, 82);
    ctx.strokeRect(132, 28, 96, 78);

    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 6;
    ctx.strokeRect(3, 3, 250, 122);
    return new THREE.CanvasTexture(c);
  }

  /**
   * Smoked/Black-Gill 3D Taillight Texture matching Images 2 & 4:
   * - Dark smoked black outer border & horizontal black gill stripes on the side
   * - Glowing red C-signature in the upper/center section
   * - Warm amber/white indicator strip along the bottom edge
   */
  createTaillightTexture(braking) {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 192;
    const ctx = c.getContext('2d');

    // Smoked black outer housing (Images 2 & 4)
    ctx.fillStyle = '#0c0e14';
    ctx.fillRect(0, 0, 256, 192);

    // Horizontal white/silver gill stripes on outer smoked section (Image 2 & 4)
    ctx.fillStyle = '#64748b';
    for (let gy = 26; gy <= 136; gy += 16) {
      ctx.fillRect(18, gy, 54, 4);
      ctx.fillRect(184, gy, 54, 4);
    }

    // Glowing Red C-Signature Chamber (Images 2 & 4)
    ctx.fillStyle = braking ? '#ff1e27' : '#991b1b';
    ctx.fillRect(48, 22, 160, 112);

    ctx.strokeStyle = braking ? '#fef08a' : '#ef4444';
    ctx.lineWidth = 18;
    ctx.strokeRect(58, 32, 140, 92);

    // Black horizontal louvers across the red lens (Image 2 detail)
    ctx.fillStyle = '#0c0e14';
    for (let ly = 52; ly <= 108; ly += 18) {
      ctx.fillRect(48, ly, 160, 5);
    }

    // Bottom Amber/Warm-White Turn/Reverse Strip (Image 2 shows glowing amber bottom bar!)
    const botGrad = ctx.createLinearGradient(44, 146, 212, 146);
    botGrad.addColorStop(0, '#fde68a');
    botGrad.addColorStop(0.5, '#f59e0b');
    botGrad.addColorStop(1, '#fde68a');
    ctx.fillStyle = botGrad;
    ctx.fillRect(48, 144, 160, 28);

    ctx.strokeStyle = '#090b10';
    ctx.lineWidth = 8;
    ctx.strokeRect(4, 4, 248, 184);
    return new THREE.CanvasTexture(c);
  }

  createRearTrapezoidDiffuserTexture() {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 128;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, 512, 128);

    // Large matte-black trapezoidal insert rising in the center of the rear bumper (Images 2 & 4)
    ctx.fillStyle = '#14171f';
    ctx.beginPath();
    ctx.moveTo(86, 12);
    ctx.lineTo(426, 12);
    ctx.lineTo(492, 124);
    ctx.lineTo(20, 124);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = '#262b38';
    ctx.lineWidth = 4;
    ctx.stroke();
    return new THREE.CanvasTexture(c);
  }

  createCenteredTrackScriptTexture() {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 48;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, 256, 48);
    // Dark charcoal/black spaced "T R A C K" letters centered under the VW logo (Images 2 & 4)
    ctx.fillStyle = '#111827';
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = 2;
    ctx.font = '900 26px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.strokeText('T  R  A  C  K', 128, 24);
    ctx.fillText('T  R  A  C  K', 128, 24);
    return new THREE.CanvasTexture(c);
  }

  createRearDefrosterGlassTexture() {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 128;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#0d1522';
    ctx.fillRect(0, 0, 256, 128);

    // Thick black frit border + horizontal orange/copper defroster lines (Image 2)
    ctx.strokeStyle = 'rgba(217, 119, 6, 0.38)';
    ctx.lineWidth = 1.5;
    for (let y = 16; y < 114; y += 10) {
      ctx.beginPath();
      ctx.moveTo(12, y);
      ctx.lineTo(244, y);
      ctx.stroke();
    }
    ctx.strokeStyle = '#090b10';
    ctx.lineWidth = 12;
    ctx.strokeRect(0, 0, 256, 128);
    return new THREE.CanvasTexture(c);
  }

  /**
   * 15" Matte-Black 5-Twin-Spoke Wheel Cover ("Taza Negra" from Images 1, 2, 3, 4)
   */
  createPoloTrackWheelCoverTexture() {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 256;
    const ctx = c.getContext('2d');
    const cx = 128, cy = 128;

    ctx.fillStyle = '#07090d';
    ctx.beginPath();
    ctx.arc(cx, cy, 126, 0, Math.PI * 2);
    ctx.fill();

    // Satin jet-black outer rim ring
    ctx.strokeStyle = '#181b22';
    ctx.lineWidth = 18;
    ctx.beginPath();
    ctx.arc(cx, cy, 115, 0, Math.PI * 2);
    ctx.stroke();

    // 5-Twin-Spoke Directional Matte-Black Blades (Images 2 & 3)
    ctx.fillStyle = '#1c2029';
    ctx.strokeStyle = '#2d3340';
    ctx.lineWidth = 2;
    for (let i = 0; i < 10; i++) {
      const ang = (i * Math.PI * 2) / 10;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(ang);
      ctx.beginPath();
      ctx.moveTo(-12, 24);
      ctx.lineTo(-18, 108);
      ctx.lineTo(9, 108);
      ctx.lineTo(7, 24);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    // Center Hub + 5 Black Lug Recesses + Chrome VW Emblem
    ctx.fillStyle = '#12151c';
    ctx.beginPath();
    ctx.arc(cx, cy, 34, 0, Math.PI * 2);
    ctx.fill();

    for (let i = 0; i < 5; i++) {
      const a = (i * Math.PI * 2) / 5;
      ctx.fillStyle = '#07090d';
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * 24, cy + Math.sin(a) * 24, 4.5, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, 14, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 12px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('VW', cx, cy + 1);

    return new THREE.CanvasTexture(c);
  }

  /**
   * Two-Tone Seat Fabric Texture with Light-Grey Bolsters & Contrast Stitch (Image 5)
   */
  createPoloTrackSeatFabricTexture() {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 256;
    const ctx = c.getContext('2d');

    // Center dark charcoal cloth
    ctx.fillStyle = '#1b1f27';
    ctx.fillRect(0, 0, 256, 256);

    // Light-grey woven outer bolster bands (Image 5 bottom left/right of seats)
    ctx.fillStyle = '#646d7a';
    ctx.fillRect(0, 0, 44, 256);
    ctx.fillRect(212, 0, 44, 256);

    // Subtle orange/red contrast stitch seam along the bolster border (Image 5)
    ctx.strokeStyle = '#ea580c';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(45, 0); ctx.lineTo(45, 256);
    ctx.moveTo(211, 0); ctx.lineTo(211, 256);
    ctx.stroke();

    return new THREE.CanvasTexture(c);
  }

  createVWFloorMatTexture() {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 256;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#0c0f15';
    ctx.fillRect(0, 0, 256, 256);

    // White circular VW emblem on floor mat (Image 5)
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(176, 76, 36, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#cbd5e1';
    ctx.font = 'bold 28px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('VW', 176, 78);

    // "POLO" vertical script on mat edge (Image 6)
    ctx.font = 'bold 18px Arial';
    ctx.fillText('P O L O', 64, 180);
    return new THREE.CanvasTexture(c);
  }

  createShifterConsoleBezelTexture() {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 256;
    const ctx = c.getContext('2d');
    // Matte silver-grey surround with dark inner boot cutout & left button slots (Images 5 & 6)
    ctx.fillStyle = '#646e7a';
    ctx.fillRect(0, 0, 256, 256);
    ctx.fillStyle = '#11141c';
    ctx.fillRect(58, 24, 174, 208);
    // Left vertical switch blank column (Image 5)
    ctx.fillStyle = '#1e232d';
    ctx.fillRect(16, 28, 34, 198);
    ctx.strokeStyle = '#0f131a';
    ctx.lineWidth = 3;
    for (let y = 68; y < 200; y += 42) {
      ctx.beginPath();
      ctx.moveTo(16, y);
      ctx.lineTo(50, y);
      ctx.stroke();
    }
    return new THREE.CanvasTexture(c);
  }

  createLeftVentAndLightSwitchTexture() {
    const c = document.createElement('canvas');
    c.width = 160;
    c.height = 200;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#181c24';
    ctx.fillRect(0, 0, 160, 200);

    // Left Air Vent with Silver Bezel (Images 5 & 6)
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 4;
    ctx.strokeRect(12, 12, 136, 76);
    ctx.fillStyle = '#0c0f16';
    ctx.fillRect(16, 16, 128, 68);
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 2;
    for (let y = 28; y <= 72; y += 14) {
      ctx.beginPath();
      ctx.moveTo(18, y);
      ctx.lineTo(142, y);
      ctx.stroke();
    }
    ctx.fillStyle = '#e2e8f0';
    ctx.fillRect(72, 43, 16, 14);

    // Rotary Headlight Switch below Left Vent
    ctx.beginPath();
    ctx.arc(80, 146, 36, 0, Math.PI * 2);
    ctx.fillStyle = '#11141c';
    ctx.fill();
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    ctx.fillStyle = '#ef4444';
    ctx.font = 'bold 11px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('0', 56, 118);
    ctx.fillStyle = '#22c55e';
    ctx.fillText('💡', 104, 118);

    ctx.save();
    ctx.translate(80, 146);
    ctx.rotate(0.45);
    ctx.fillStyle = '#262b36';
    ctx.fillRect(-8, -28, 16, 56);
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(-2, -26, 4, 14);
    ctx.restore();

    return new THREE.CanvasTexture(c);
  }

  createSingleAirVentTexture() {
    const c = document.createElement('canvas');
    c.width = 160;
    c.height = 100;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#181c24';
    ctx.fillRect(0, 0, 160, 100);
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 4;
    ctx.strokeRect(10, 10, 140, 80);
    ctx.fillStyle = '#0c0f16';
    ctx.fillRect(14, 14, 132, 72);
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 2;
    for (let y = 26; y <= 76; y += 16) {
      ctx.beginPath();
      ctx.moveTo(16, y);
      ctx.lineTo(144, y);
      ctx.stroke();
    }
    ctx.fillStyle = '#e2e8f0';
    ctx.fillRect(72, 44, 16, 12);
    return new THREE.CanvasTexture(c);
  }

  /**
   * Silver-Bordered Steering Wheel Multifunction Button Module with Red-Backlit Icons (Images 5 & 6)
   */
  createSteeringWheelButtonsTexture() {
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 72;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#12151d';
    ctx.fillRect(0, 0, 128, 72);

    // Bright silver outer bezel around button island (Images 5 & 6)
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 5;
    ctx.strokeRect(4, 4, 120, 64);

    // Central silver toggle bar
    ctx.fillStyle = '#cbd5e1';
    ctx.fillRect(54, 12, 20, 48);

    // Red-backlit multifunction icons (Images 5 & 6 show glowing red/orange button symbols!)
    ctx.fillStyle = '#f87171';
    ctx.font = 'bold 14px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('◀', 28, 28);
    ctx.fillText('▶', 28, 54);
    ctx.fillText('+', 100, 28);
    ctx.fillText('−', 100, 54);
    return new THREE.CanvasTexture(c);
  }

  createShiftKnobHPatternTexture() {
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 128;
    const ctx = c.getContext('2d');

    ctx.fillStyle = '#0f131a';
    ctx.beginPath();
    ctx.arc(64, 64, 62, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(64, 64, 55, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = '#f8fafc';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(28, 64);
    ctx.lineTo(100, 64);
    ctx.moveTo(32, 38); ctx.lineTo(32, 90);
    ctx.moveTo(64, 38); ctx.lineTo(64, 90);
    ctx.moveTo(96, 38); ctx.lineTo(96, 90);
    ctx.stroke();

    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 16px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('R', 32, 31);
    ctx.fillText('1', 48, 31);
    ctx.fillText('2', 48, 106);
    ctx.fillText('3', 68, 31);
    ctx.fillText('4', 68, 106);
    ctx.fillText('5', 96, 31);
    return new THREE.CanvasTexture(c);
  }

  createVWLogoBadge(radius = 0.09) {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(64, 64, 60, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#f8fafc';
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.arc(64, 64, 54, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 46px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('VW', 64, 67);

    const tex = new THREE.CanvasTexture(canvas);
    return new THREE.Mesh(
      new THREE.CircleGeometry(radius, 24),
      new THREE.MeshBasicMaterial({ map: tex })
    );
  }

  createLicensePlateTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 80;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 256, 80);
    ctx.fillStyle = '#003893';
    ctx.fillRect(0, 0, 256, 20);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('REPÚBLICA ARGENTINA', 128, 14);

    ctx.fillStyle = '#111827';
    ctx.font = 'bold 31px monospace';
    ctx.fillText('AG 412 VW', 128, 59);

    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, 252, 76);

    return new THREE.CanvasTexture(canvas);
  }

  setColor(colorKey) {
    if (!this.colorPalettes[colorKey] || !this.bodyPaintMat) return;
    this.currentColorKey = colorKey;
    const pal = this.colorPalettes[colorKey];
    this.bodyPaintMat.color.setHex(pal.body);
    this.bodyPaintMat.metalness = pal.metalness;
    this.bodyPaintMat.roughness = pal.roughness;
    this.bodyPaintMat.needsUpdate = true;
  }

  setCockpitViewMode(isCockpit) {
    if (this.exteriorGlassMat) {
      this.exteriorGlassMat.opacity = isCockpit ? 0.05 : 0.72;
    }
    if (this.rearGlassMat) {
      this.rearGlassMat.opacity = isCockpit ? 0.14 : 0.72;
    }
    if (!isCockpit) {
      this.setDriverSeatOpacity(1.0);
    }
  }

  setDriverSeatOpacity(opacity = 1.0) {
    if (!this.driverSeatMat) return;
    const clamped = Math.max(0, Math.min(1, opacity));
    const isTrans = clamped < 0.99;
    if (this.driverSeatMat.transparent !== isTrans) {
      this.driverSeatMat.transparent = isTrans;
      this.driverSeatMat.depthWrite = !isTrans;
      this.driverSeatMat.needsUpdate = true;
    }
    this.driverSeatMat.opacity = clamped;
  }

  /**
   * Renders the Exact Interior Displays from Images 5 & 6:
   * 1. Octagonal-Framed Analog Instrument Cluster + White-on-Black I-System LCD + Warning Icons
   * 2. MY25 10.1" VW Play Touchscreen + Right-Side Red Hazard Switch + Dual Vents + Red-Lit 3-Dial A/C + Dual USB-C
   */
  updateCockpitDisplays(speedKmh, rpm, gearStr, cornerName, lapTimeStr) {
    if (!this.dashCtx) return;
    const ctx = this.dashCtx;
    const W = 640, H = 280;

    ctx.fillStyle = '#090b10';
    ctx.fillRect(0, 0, W, H);

    // Octagonal / Chamfered Silver Inner Border around the Instrument Cluster (Images 5 & 6)
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(46, 12);
    ctx.lineTo(594, 12);
    ctx.lineTo(628, 52);
    ctx.lineTo(628, 228);
    ctx.lineTo(594, 268);
    ctx.lineTo(46, 268);
    ctx.lineTo(12, 228);
    ctx.lineTo(12, 52);
    ctx.closePath();
    ctx.stroke();

    const drawVWDial = (cx, cy, r, val, maxVal, majorSteps, labelTop, labelSub, isTach) => {
      ctx.save();

      ctx.beginPath();
      ctx.arc(cx, cy, r + 4, 0, Math.PI * 2);
      ctx.fillStyle = '#1e2430';
      ctx.fill();

      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = '#080b11';
      ctx.fill();
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 2.5;
      ctx.stroke();

      const startAng = Math.PI * 0.72;
      const endAng = Math.PI * 2.28;
      const totalSpan = endAng - startAng;

      const subDivs = isTach ? 40 : 48;
      for (let i = 0; i <= subDivs; i++) {
        const frac = i / subDivs;
        const ang = startAng + frac * totalSpan;
        const isRedZone = isTach && frac >= 0.75;
        const innerR = (i % (isTach ? 5 : 4) === 0) ? r - 14 : r - 7;

        ctx.strokeStyle = isRedZone ? '#ef4444' : '#f8fafc';
        ctx.lineWidth = (i % (isTach ? 5 : 4) === 0) ? 2.6 : 1.2;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(ang) * innerR, cy + Math.sin(ang) * innerR);
        ctx.lineTo(cx + Math.cos(ang) * (r - 2), cy + Math.sin(ang) * (r - 2));
        ctx.stroke();
      }

      for (let m = 0; m < majorSteps.length; m++) {
        const frac = m / (majorSteps.length - 1);
        const ang = startAng + frac * totalSpan;
        const tx = cx + Math.cos(ang) * (r - 27);
        const ty = cy + Math.sin(ang) * (r - 27);
        ctx.fillStyle = (isTach && m >= 6) ? '#ef4444' : '#f8fafc';
        ctx.font = 'bold 15px Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(majorSteps[m]), tx, ty);
      }

      ctx.fillStyle = '#94a3b8';
      ctx.font = 'bold 10px Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(labelTop, cx, cy - 32);
      ctx.fillText(labelSub, cx, cy + 44);

      // Authentic Dashboard Indicator Icons inside Tachometer (Image 5 & 6: EPC, Check Engine, Battery)
      if (isTach) {
        ctx.fillStyle = '#f59e0b';
        ctx.font = 'bold 10px Arial';
        ctx.fillText('EPC', cx - 26, cy - 12);
        ctx.fillStyle = '#ef4444';
        ctx.fillText('🔋', cx + 26, cy + 22);
      }

      // Glowing Red VW Needle (Images 5 & 6)
      const clamped = Math.min(maxVal, Math.max(0, val));
      const needleAng = startAng + (clamped / maxVal) * totalSpan;
      ctx.save();
      ctx.strokeStyle = '#ff1e27';
      ctx.shadowColor = '#ff1e27';
      ctx.shadowBlur = 8;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(cx - Math.cos(needleAng) * 12, cy - Math.sin(needleAng) * 12);
      ctx.lineTo(cx + Math.cos(needleAng) * (r - 8), cy + Math.sin(needleAng) * (r - 8));
      ctx.stroke();
      ctx.restore();

      ctx.beginPath();
      ctx.arc(cx, cy, 12, 0, Math.PI * 2);
      ctx.fillStyle = '#111827';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#cbd5e1';
      ctx.stroke();

      ctx.restore();
    };

    drawVWDial(134, 142, 102, rpm / 1000, 8, [0, 1, 2, 3, 4, 5, 6, 7, 8], '1/min', 'x 1000', true);
    drawVWDial(506, 142, 102, speedKmh, 240, [0, 20, 40, 60, 80, 100, 120, 140, 160, 180, 200, 220, 240], 'km/h', '', false);

    // Center White-on-Black I-System LCD Screen (Images 5 & 6)
    const lx = 262, ly = 32, lw = 116, lh = 212;
    ctx.fillStyle = '#080b12';
    ctx.fillRect(lx, ly, lw, lh);
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(lx, ly, lw, lh);

    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('17:35', lx + 10, ly + 22);
    ctx.textAlign = 'right';
    ctx.font = 'bold 17px monospace';
    ctx.fillText(`${gearStr}`, lx + lw - 10, ly + 22);

    ctx.strokeStyle = 'rgba(248, 250, 252, 0.22)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(lx + 8, ly + 30);
    ctx.lineTo(lx + lw - 8, ly + 30);
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.fillStyle = '#cbd5e1';
    ctx.font = '13px monospace';
    ctx.fillText('22.5 °C', lx + lw / 2, ly + 48);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 38px monospace';
    ctx.fillText(`${Math.round(speedKmh)}`, lx + lw / 2, ly + 94);
    ctx.font = 'bold 12px Arial';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText('km/h', lx + lw / 2, ly + 112);

    ctx.fillStyle = '#e2e8f0';
    ctx.font = '12px monospace';
    ctx.fillText(lapTimeStr || '00:00.0', lx + lw / 2, ly + 136);

    ctx.strokeStyle = 'rgba(248, 250, 252, 0.22)';
    ctx.beginPath();
    ctx.moveTo(lx + 8, ly + 148);
    ctx.lineTo(lx + lw - 8, ly + 148);
    ctx.stroke();

    ctx.fillStyle = '#94a3b8';
    ctx.font = '10px Arial';
    ctx.textAlign = 'left';
    ctx.fillText('⛽ 0', lx + 8, ly + 162);
    ctx.textAlign = 'center';
    ctx.fillText('1/2', lx + lw / 2, ly + 162);
    ctx.textAlign = 'right';
    ctx.fillText('1', lx + lw - 8, ly + 162);

    for (let b = 0; b < 8; b++) {
      ctx.fillStyle = b < 6 ? '#f8fafc' : '#334155';
      ctx.fillRect(lx + 10 + b * 12, ly + 167, 10, 7);
    }

    ctx.fillStyle = '#f8fafc';
    ctx.font = '12px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('1428 km', lx + 10, ly + 195);
    ctx.textAlign = 'right';
    ctx.fillText('tr 14.2', lx + lw - 8, ly + 195);

    this.dashTexture.needsUpdate = true;

    // ------------------------------------------------------------------------
    // Update MY25 Center Stack (Exact Layout from Images 5 & 6!):
    // 1. Top (y = 10..268): 10.1" VW Play Touchscreen on left/center +
    //    RED HAZARD BUTTON mounted immediately to the RIGHT of the screen!
    // 2. Middle (y = 282..378): Dual Horizontal Center Air Vents directly below
    //    the screen (side-by-side, no hazard button between them!)
    // 3. Bottom (y = 392..575): RED-ILLUMINATED 3-Dial Climatic A/C Panel
    // 4. Lower Cubby (y = 582..650): Dual Illuminated USB-C Ports on right side!
    // ------------------------------------------------------------------------
    if (this.vwPlayCtx) {
      const vc = this.vwPlayCtx;
      vc.fillStyle = '#10141c';
      vc.fillRect(0, 0, 540, 660);

      // === 1. 10.1" VW PLAY SCREEN (x = 12..462, y = 12..266) + RIGHT-SIDE HAZARD BUTTON (x = 472..526) ===
      vc.fillStyle = '#050811';
      vc.strokeStyle = '#334155';
      vc.lineWidth = 3;
      vc.fillRect(12, 12, 450, 254);
      vc.strokeRect(12, 12, 450, 254);

      // Red Hazard Warning Switch to the RIGHT of the 10" VW Play Display (Images 5 & 6!)
      vc.fillStyle = '#1e2430';
      vc.fillRect(468, 12, 60, 254);
      vc.fillStyle = '#991b1b';
      vc.strokeStyle = '#ef4444';
      vc.lineWidth = 2;
      vc.fillRect(476, 108, 44, 46);
      vc.strokeRect(476, 108, 44, 46);
      vc.strokeStyle = '#ffffff';
      vc.lineWidth = 2.5;
      vc.beginPath();
      vc.moveTo(498, 118);
      vc.lineTo(511, 144);
      vc.lineTo(485, 144);
      vc.closePath();
      vc.stroke();

      // Left Capacitive Touch Shortcut Column of VW Play (Image 5: colorful illuminated app icons!)
      vc.fillStyle = '#080e1c';
      vc.fillRect(15, 15, 46, 248);
      const dockItems = [
        { ico: '🏠', col: '#38bdf8' },
        { ico: '🎵', col: '#22c55e' },
        { ico: '📱', col: '#60a5fa' },
        { ico: '🚗', col: '#f8fafc' },
        { ico: '⚙️', col: '#94a3b8' }
      ];
      dockItems.forEach((it, idx) => {
        vc.fillStyle = it.col;
        vc.font = '18px Arial';
        vc.textAlign = 'center';
        vc.fillText(it.ico, 38, 48 + idx * 46);
      });

      // 3 Vertical Rounded VW Play Cards side-by-side (Image 5 exact UI!)
      // Card 1: Radio / Navigation
      vc.fillStyle = '#0c1c38';
      vc.strokeStyle = '#1d4ed8';
      vc.lineWidth = 1.5;
      vc.fillRect(68, 24, 122, 198);
      vc.strokeRect(68, 24, 122, 198);
      vc.fillStyle = '#38bdf8';
      vc.font = 'bold 11px sans-serif';
      vc.textAlign = 'center';
      vc.fillText('Autódromo', 129, 48);
      vc.strokeStyle = '#0ea5e9';
      vc.lineWidth = 4;
      vc.beginPath();
      vc.arc(129, 110, 34, 0, Math.PI * 2);
      vc.stroke();
      vc.fillStyle = '#ffffff';
      vc.font = 'bold 12px sans-serif';
      vc.fillText(cornerName ? cornerName.slice(0, 14) : 'RECTA PRINC.', 129, 178);
      vc.fillStyle = '#93c5fd';
      vc.font = '11px monospace';
      vc.fillText(lapTimeStr || '00:00.0', 129, 202);

      // Card 2: Telephone / Bluetooth Media
      vc.fillStyle = '#0c1c38';
      vc.strokeStyle = '#1e3a5f';
      vc.fillRect(198, 24, 122, 198);
      vc.strokeRect(198, 24, 122, 198);
      vc.fillStyle = '#60a5fa';
      vc.font = 'bold 11px sans-serif';
      vc.fillText('Teléfono / Media', 259, 48);
      vc.fillStyle = '#ffffff';
      vc.font = 'bold 13px sans-serif';
      vc.fillText('FM 95.9 BS.AS.', 259, 108);
      vc.fillStyle = '#1e293b';
      vc.fillRect(216, 174, 86, 26);
      vc.fillStyle = '#e2e8f0';
      vc.font = '11px sans-serif';
      vc.fillText('Conectar', 259, 191);

      // Card 3: Vehicle Status (Green-tinted top header as in Image 5!)
      const c3Grad = vc.createLinearGradient(328, 24, 328, 222);
      c3Grad.addColorStop(0, '#0f393b');
      c3Grad.addColorStop(1, '#0c1c38');
      vc.fillStyle = c3Grad;
      vc.strokeStyle = '#10b981';
      vc.fillRect(328, 24, 124, 198);
      vc.strokeRect(328, 24, 124, 198);
      vc.fillStyle = '#4ade80';
      vc.font = 'bold 11px sans-serif';
      vc.fillText('Vehículo', 390, 48);
      vc.fillStyle = '#ffffff';
      vc.font = 'bold 13px sans-serif';
      vc.fillText('Polo Track 1.6', 390, 96);
      vc.fillStyle = '#cbd5e1';
      vc.font = '12px monospace';
      vc.fillText(`Marcha: ${gearStr}`, 390, 126);
      vc.fillText(`${Math.round(rpm)} RPM`, 390, 148);
      vc.fillStyle = '#4ade80';
      vc.font = '11px sans-serif';
      vc.fillText('Estado: OK', 390, 190);

      // Bottom Shortcut Bar inside VW Play Screen (Image 5)
      vc.fillStyle = '#091326';
      vc.fillRect(68, 230, 384, 28);
      vc.fillStyle = '#cbd5e1';
      vc.font = '12px sans-serif';
      vc.fillText('🔊   |   ❄️ A/C   |   📱 App-Connect   |   🚗 Modo Pista', 260, 248);

      // === 2. DUAL HORIZONTAL CENTER AIR VENTS DIRECTLY BELOW SCREEN (y = 282..374) ===
      // Side-by-side vents with thin central divider (Images 5 & 6)
      vc.fillStyle = '#181d26';
      vc.strokeStyle = '#64748b';
      vc.lineWidth = 3;
      vc.fillRect(16, 280, 508, 92);
      vc.strokeRect(16, 280, 508, 92);

      [24, 274].forEach(vx => {
        vc.fillStyle = '#080b10';
        vc.fillRect(vx, 288, 238, 76);
        vc.strokeStyle = '#334155';
        vc.lineWidth = 2;
        for (let sy = 304; sy <= 352; sy += 16) {
          vc.beginPath();
          vc.moveTo(vx + 6, sy);
          vc.lineTo(vx + 232, sy);
          vc.stroke();
        }
        // Chrome/White center vane tab
        vc.fillStyle = '#e2e8f0';
        vc.fillRect(vx + 110, 320, 18, 13);
      });

      // === 3. RED-ILLUMINATED 3-DIAL CLIMATIC A/C PANEL (y = 388..572, Images 5 & 6!) ===
      vc.fillStyle = '#0b0e14';
      vc.fillRect(16, 386, 508, 186);

      // Red-lit A/C and Recirculation buttons in top center (Images 5 & 6)
      vc.fillStyle = '#181c26';
      vc.strokeStyle = '#ef4444';
      vc.lineWidth = 1.5;
      vc.fillRect(178, 398, 78, 28);
      vc.strokeRect(178, 398, 78, 28);
      vc.fillRect(284, 398, 78, 28);
      vc.strokeRect(284, 398, 78, 28);

      vc.fillStyle = '#ef4444';
      vc.font = 'bold 13px Arial';
      vc.textAlign = 'center';
      vc.fillText('A/C', 217, 417);
      vc.fillText('🔄', 323, 417);

      // Left Dial Ring: Red-Illuminated Temperature Ring (Images 5 & 6)
      vc.lineWidth = 5;
      vc.strokeStyle = '#ef4444';
      vc.beginPath();
      vc.arc(105, 496, 54, Math.PI * 0.72, Math.PI * 2.28);
      vc.stroke();
      vc.strokeStyle = '#38bdf8';
      vc.beginPath();
      vc.arc(105, 496, 54, Math.PI * 0.72, Math.PI * 1.15);
      vc.stroke();

      // Center Dial Ring: Red-Illuminated Fan Speeds (0, 1, 2, 3, 4)
      vc.strokeStyle = '#ef4444';
      vc.lineWidth = 3;
      vc.beginPath();
      vc.arc(270, 496, 46, Math.PI * 0.75, Math.PI * 2.25);
      vc.stroke();
      vc.fillStyle = '#ef4444';
      vc.font = 'bold 13px Arial';
      ['0', '1', '2', '3', '4'].forEach((fl, fi) => {
        const fang = Math.PI * 0.88 + fi * 0.31;
        vc.fillText(fl, 270 + Math.cos(fang) * 58, 496 + Math.sin(fang) * 58);
      });

      // Right Dial Ring: Red-Illuminated Airflow Distribution Ring
      vc.strokeStyle = '#ef4444';
      vc.lineWidth = 4;
      vc.beginPath();
      vc.arc(435, 496, 54, Math.PI * 0.72, Math.PI * 2.28);
      vc.stroke();
      ['👤', '🦶', '🦵', '♨️'].forEach((ico, ii) => {
        const iang = Math.PI * 0.85 + ii * 0.42;
        vc.fillText(ico, 435 + Math.cos(iang) * 64, 496 + Math.sin(iang) * 64);
      });

      // === 4. LOWER STORAGE CUBBY WITH DUAL ILLUMINATED USB-C PORTS (y = 576..652, Images 5 & 6!) ===
      vc.fillStyle = '#06080d';
      vc.fillRect(16, 576, 508, 76);
      // Glowing white/cyan dual USB-C ports on the right side of the cubby (visible in both Image 5 and Image 6!)
      vc.fillStyle = '#1e293b';
      vc.strokeStyle = '#64748b';
      vc.lineWidth = 2;
      vc.fillRect(365, 590, 96, 36);
      vc.strokeRect(365, 590, 96, 36);
      vc.fillStyle = '#e0f2fe';
      vc.fillRect(382, 604, 22, 8);
      vc.fillRect(422, 604, 22, 8);

      this.vwPlayTexture.needsUpdate = true;
    }

    // Update Interior Rearview Mirror Canvas
    if (this.mirrorCtx) {
      const mc = this.mirrorCtx;
      mc.fillStyle = '#38bdf8';
      mc.fillRect(0, 0, 256, 30);
      mc.fillStyle = '#2d5a27';
      mc.fillRect(0, 30, 256, 34);
      mc.fillStyle = '#334155';
      mc.beginPath();
      mc.moveTo(110, 30);
      mc.lineTo(146, 30);
      mc.lineTo(230, 64);
      mc.lineTo(26, 64);
      mc.closePath();
      mc.fill();
      mc.strokeStyle = '#f8fafc';
      mc.lineWidth = 3;
      mc.beginPath();
      mc.moveTo(110, 30);
      mc.lineTo(30, 64);
      mc.moveTo(146, 30);
      mc.lineTo(226, 64);
      mc.stroke();
      this.mirrorTexture.needsUpdate = true;
    }
  }

  initSmokePool() {
    const smokeGeo = new THREE.SphereGeometry(0.26, 8, 8);
    for (let i = 0; i < 36; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xe2e8f0,
        transparent: true,
        opacity: 0.0,
        depthWrite: false
      });
      const mesh = new THREE.Mesh(smokeGeo, mat);
      mesh.visible = false;
      this.scene.add(mesh);
      this.smokeParticles.push({
        mesh,
        life: 0,
        maxLife: 0.65,
        vx: 0,
        vy: 0,
        vz: 0
      });
    }
    this.smokeIndex = 0;
  }

  spawnTireSmoke(x, y, z) {
    const p = this.smokeParticles[this.smokeIndex];
    this.smokeIndex = (this.smokeIndex + 1) % this.smokeParticles.length;
    p.life = p.maxLife;
    p.mesh.visible = true;
    p.mesh.position.set(
      x + (Math.random() - 0.5) * 0.25,
      y + 0.12,
      z + (Math.random() - 0.5) * 0.25
    );
    p.mesh.scale.setScalar(0.6);
    p.mesh.material.opacity = 0.42;
    p.vx = (Math.random() - 0.5) * 1.2;
    p.vy = 0.7 + Math.random() * 0.6;
    p.vz = (Math.random() - 0.5) * 1.2;
  }

  updateVisuals(dt, physicsState) {
    this.root.position.set(physicsState.x, physicsState.y, physicsState.z);
    this.root.rotation.y = physicsState.heading;

    this.chassisGroup.rotation.z = physicsState.rollAngle;
    this.chassisGroup.rotation.x = physicsState.pitchAngle;

    const steerVisual = physicsState.steerAngle * 0.85;
    this.wheelPivots.forEach(pivot => {
      pivot.rotation.y = steerVisual;
    });

    const spinDelta = (physicsState.speed / 0.32) * dt;
    this.wheelMeshes.forEach(w => {
      w.rotation.x += spinDelta;
    });

    if (this.steeringWheelGroup) {
      this.steeringWheelGroup.rotation.z = -physicsState.steerAngle * 3.1;
    }

    if (this.gearStickPivot) {
      const g = physicsState.gear;
      let gx = 0;
      let gz = 0;
      if (g === -1) { gx = 0.16; gz = 0.15; }
      else if (g === 1) { gx = 0.12; gz = 0.15; }
      else if (g === 2) { gx = 0.12; gz = -0.15; }
      else if (g === 3) { gx = 0.0;  gz = 0.15; }
      else if (g === 4) { gx = 0.0;  gz = -0.15; }
      else if (g === 5) { gx = -0.12; gz = 0.15; }
      this.gearStickPivot.rotation.z = THREE.MathUtils.lerp(this.gearStickPivot.rotation.z, gx, dt * 14);
      this.gearStickPivot.rotation.x = THREE.MathUtils.lerp(this.gearStickPivot.rotation.x, gz, dt * 14);
    }

    const braking = physicsState.brakeInput > 0.1;
    this.brakeLightMaterials.forEach(mat => {
      mat.map = braking ? this.tailBrakeTex : this.tailOffTex;
      mat.needsUpdate = true;
    });
    if (this.thirdBrakeMat) {
      this.thirdBrakeMat.color.setHex(braking ? 0xff1e27 : 0xb91c1c);
    }

    if (physicsState.slipRatio > 0.28 && Math.abs(physicsState.speed) > 6) {
      const sinH = Math.sin(physicsState.heading);
      const cosH = Math.cos(physicsState.heading);
      [-0.81, 0.81].forEach(lat => {
        const wx = physicsState.x - sinH * 1.28 + cosH * lat;
        const wz = physicsState.z - cosH * 1.28 - sinH * lat;
        if (Math.random() < 0.65) {
          this.spawnTireSmoke(wx, physicsState.y, wz);
        }
      });
    }

    for (const p of this.smokeParticles) {
      if (p.life > 0) {
        p.life -= dt;
        if (p.life <= 0) {
          p.mesh.visible = false;
        } else {
          p.mesh.position.x += p.vx * dt;
          p.mesh.position.y += p.vy * dt;
          p.mesh.position.z += p.vz * dt;
          const progress = 1 - p.life / p.maxLife;
          p.mesh.scale.setScalar(0.6 + progress * 1.9);
          p.mesh.material.opacity = (1 - progress) * 0.36;
        }
      }
    }
  }
}

window.VWPoloTrackCar = VWPoloTrackCar;

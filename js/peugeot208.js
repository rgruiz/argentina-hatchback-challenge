/**
 * Photo-Accurate 3D Peugeot 208 Like MT (1.3L 8V Firefly — Argentina Spec)
 * Built from official Peugeot 208 Argentina reference photography:
 * - Exterior: Parametric shield grille with central Lion crest & "208" hood badge,
 *   triple-claw vertical LED DRL fangs ("3 Garras"), swept feline headlamps,
 *   black panoramic-style roof crown with shark-fin antenna, body-colored door handles,
 *   5-spoke two-tone geometric wheels, full-width black rear band ("P E U G E O T")
 *   connecting 3-claw horizontal LED taillights, "208" & "LIKE" tailgate badges,
 *   and matte-black rear bumper diffuser.
 * - Interior (Peugeot i-Cockpit): Raised head-up instrument cluster (left clockwise km/h
 *   speedometer + right counter-clockwise tr/min tachometer + center Lion LCD) viewed OVER
 *   the compact double-flat 2-spoke steering wheel; floating 10" wide infotainment screen
 *   with satin-silver bottom cradle; dual center vents; row of chrome "Piano Key" switches;
 *   carbon-weave dashboard fascia; and 5-speed manual shifter.
 */
class Peugeot208Car {
  constructor(scene) {
    this.scene = scene;

    this.root = new THREE.Group();
    this.scene.add(this.root);

    this.chassisGroup = new THREE.Group();
    this.root.add(this.chassisGroup);

    // Official Peugeot 208 Argentina Color Swatches (Reference Images 1 & 2)
    this.colorPalettes = {
      okenite:  { body: 0xeef2f6, metalness: 0.14, roughness: 0.18, name: 'Blanco Okenite' },
      quasar:   { body: 0x0c6aa3, metalness: 0.48, roughness: 0.18, name: 'Azul Quasar' },
      artense:  { body: 0x8d939a, metalness: 0.58, roughness: 0.18, name: 'Gris Artense' },
      selenium: { body: 0x525a63, metalness: 0.52, roughness: 0.20, name: 'Gris Selenium' },
      perla:    { body: 0x12151a, metalness: 0.28, roughness: 0.15, name: 'Negro Perla Nera' }
    };
    this.currentColorKey = 'okenite';

    this.envMap = this.createAutomotiveEnvMap();

    this.bodyPaintMat = null;
    this.wheelPivots = [];
    this.wheelMeshes = [];
    this.brakeLightMaterials = [];
    this.thirdBrakeMat = null;

    // Cockpit interior references
    this.cockpitGroup = new THREE.Group();
    this.steeringWheelGroup = null;
    this.gearStickPivot = null;
    this.dashCanvas = null;
    this.dashCtx = null;
    this.dashTexture = null;
    this.infotainmentCanvas = null;
    this.infoCtx = null;
    this.infoTexture = null;
    this.mirrorCanvas = null;
    this.mirrorCtx = null;
    this.mirrorTexture = null;
    this.exteriorGlassMat = null;

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

    const glossBlackMat = new THREE.MeshStandardMaterial({
      color: 0x0b0e14,
      roughness: 0.16,
      metalness: 0.25,
      envMap: this.envMap,
      envMapIntensity: 1.1,
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

    const machinedAlloyMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      metalness: 0.88,
      roughness: 0.16,
      envMap: this.envMap,
      envMapIntensity: 1.35
    });
    const brakeRotorMat = new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      metalness: 0.84,
      roughness: 0.26
    });
    const brakeCaliperMat = new THREE.MeshStandardMaterial({
      color: 0x9ca3af,
      metalness: 0.60,
      roughness: 0.35
    });
    const wheelHubLogoMat = new THREE.MeshStandardMaterial({
      map: this.createPeugeotShieldBadge(0.05).material.map,
      roughness: 0.3,
      metalness: 0.5
    });

    // ========================================================================
    // 1A. PEUGEOT 208 HIGHER CLAMSHELL HOOD & VERTICAL SHARK-NOSE (Cubic Spline)
    // ========================================================================
    const frontHoodControlStations = [
      { z: 0.85, pts: [[0, 0.908, 0], [0.33, 0.910, 0], [0.57, 0.905, 0], [0.71, 0.903, 0], [0.758, 0.902, 0]] },
      { z: 1.26, pts: [[0, 0.888, 0], [0.31, 0.892, 0], [0.55, 0.885, 0], [0.70, 0.880, 0], [0.754, 0.878, 0]] },
      { z: 1.66, pts: [[0, 0.825, 0], [0.29, 0.830, 0], [0.52, 0.815, 0], [0.67, 0.798, 0], [0.726, 0.782, 0]] },
      { z: 1.90, pts: [[0, 0.710, 0], [0.26, 0.712, 0], [0.47, 0.702, -0.01], [0.62, 0.692, -0.025], [0.708, 0.682, -0.04]] },
      { z: 1.98, pts: [[0, 0.565, 0], [0.27, 0.565, 0], [0.48, 0.555, -0.035], [0.62, 0.545, -0.08], [0.710, 0.535, -0.12]] },
      { z: 2.02, pts: [[0, 0.410, 0], [0.29, 0.410, 0], [0.49, 0.405, -0.04], [0.63, 0.398, -0.095], [0.712, 0.390, -0.16]] },
      { z: 2.03, pts: [[0, 0.230, 0], [0.30, 0.230, 0], [0.51, 0.235, -0.04], [0.64, 0.240, -0.10], [0.708, 0.240, -0.17]] }
    ];
    exteriorGroup.add(this.buildLoftedSymmetricSurface(CarCAD.evaluateCubicSpline(frontHoodControlStations, 24), this.bodyPaintMat));

    // Dark Cowl Plenum Deck bridging interior dash bulkhead (z=0.54) to forward windshield base (z=0.86)
    const cowlDeck = new THREE.Mesh(
      new THREE.BoxGeometry(1.46, 0.034, 0.36),
      matteBlackPlasticMat
    );
    cowlDeck.position.set(0, 0.862, 0.70);
    exteriorGroup.add(cowlDeck);

    // ========================================================================
    // 1B. PEUGEOT 208 CURVED REAR TAILGATE & BUMPER SHELL (Cubic Spline)
    // ========================================================================
    const rearTailControlStations = [
      { z: -2.00, pts: [[0, 0.240], [0.34, 0.240], [0.56, 0.250], [0.71, 0.270], [0.755, 0.310]] },
      { z: -2.04, pts: [[0, 0.480], [0.34, 0.480], [0.58, 0.490], [0.74, 0.498], [0.795, 0.468]] },
      { z: -2.01, pts: [[0, 0.585], [0.34, 0.585], [0.58, 0.592], [0.74, 0.600], [0.805, 0.565]] },
      { z: -1.93, pts: [[0, 0.705], [0.35, 0.705], [0.59, 0.712], [0.74, 0.716], [0.795, 0.680]] },
      { z: -1.87, pts: [[0, 0.920], [0.35, 0.920], [0.58, 0.915], [0.71, 0.905], [0.758, 0.880]] },
      { z: -1.72, pts: [[0, 0.960], [0.34, 0.960], [0.57, 0.955], [0.695, 0.945], [0.748, 0.925]] }
    ];
    exteriorGroup.add(this.buildLoftedSymmetricSurface(CarCAD.evaluateCubicSpline(rearTailControlStations, 20), this.bodyPaintMat));

    // ========================================================================
    // 1C. SCULPTED PEUGEOT 208 SIDE BODY, LOWER DOOR CHAMFER, UPWARD BELTLINE
    //     KICK & 32-SEGMENT STAMPED CIRCULAR WHEEL ARCHES (CarCAD Blueprint)
    // ========================================================================
    const peugeotSideBlueprint = {
      zRear: -1.99,
      zFront: 1.86,
      uniformStations: 48,
      archAngularSteps: 26,
      rearArch:  { z: -1.26, y: 0.305, cutR: 0.386, lipX: 0.852, startAngle: -0.35, endAngle: Math.PI + 0.35 },
      frontArch: { z:  1.26, y: 0.305, cutR: 0.386, lipX: 0.852, startAngle: -0.35, endAngle: Math.PI + 0.35 },
      rows: [
        // Row 0: Lower sill (y = 0.170 between wheels)
        [
          [-1.99, 0.295, 0.735],
          [-1.78, 0.210, 0.775],
          [-1.62, 0.176, 0.795],
          [-0.85, 0.170, 0.798],
          [ 0.00, 0.170, 0.800],
          [ 0.85, 0.170, 0.798],
          [ 1.64, 0.185, 0.782],
          [ 1.86, 0.240, 0.708]
        ],
        // Row 1: Sculpted Peugeot 208 diagonal lower door undercut (rises toward rear wheel)
        [
          [-1.99, 0.390, 0.768],
          [-1.75, 0.330, 0.822],
          [-1.48, 0.320, 0.838],
          [-0.82, 0.305, 0.836],
          [ 0.00, 0.275, 0.836],
          [ 0.85, 0.248, 0.840],
          [ 1.60, 0.255, 0.830],
          [ 1.86, 0.310, 0.712]
        ],
        // Row 2: Soft feline rounded mid-door belly & muscular rear haunch swell
        [
          [-1.99, 0.560, 0.798],
          [-1.76, 0.580, 0.836],
          [-1.26, 0.605, 0.870],
          [-0.50, 0.585, 0.868],
          [ 0.35, 0.570, 0.866],
          [ 1.26, 0.555, 0.864],
          [ 1.64, 0.535, 0.816],
          [ 1.86, 0.435, 0.712]
        ],
        // Row 3: Rounded sweeping upper shoulder (smooth normals, NOT creased like Polo)
        [
          [-1.99, 0.705, 0.780],
          [-1.76, 0.860, 0.808],
          [-1.26, 0.910, 0.842],
          [-0.68, 0.895, 0.842],
          [ 0.15, 0.855, 0.842],
          [ 0.86, 0.822, 0.842],
          [ 1.56, 0.768, 0.812],
          [ 1.86, 0.550, 0.710]
        ],
        // Row 4: Iconic Peugeot 208 upward-kicking beltline matching hood col 4 cleanly
        [
          [-1.99, 0.730, 0.750],
          [-1.76, 0.955, 0.748],
          [-1.32, 1.035, 0.745],
          [-1.04, 1.068, 0.752],
          [-0.55, 0.992, 0.764],
          [ 0.15, 0.935, 0.766],
          [ 0.85, 0.902, 0.758],
          [ 1.26, 0.878, 0.754],
          [ 1.66, 0.782, 0.726],
          [ 1.86, 0.682, 0.708]
        ]
      ],
      creaseRows: [1],
      shutLines: [
        // Clamshell front fender -> door shut-line
        {
          pts: [
            [0.758, 0.900, 0.82],
            [0.842, 0.820, 0.83],
            [0.866, 0.555, 0.84],
            [0.840, 0.250, 0.85],
            [0.798, 0.174, 0.86]
          ],
          width: 0.0055,
          material: matteBlackPlasticMat
        },
        // Center B-pillar door seam
        {
          pts: [
            [0.766, 0.960, -0.15],
            [0.842, 0.860, -0.12],
            [0.868, 0.560, -0.10],
            [0.836, 0.285, -0.10],
            [0.800, 0.172, -0.10]
          ],
          width: 0.0055,
          material: matteBlackPlasticMat
        },
        // Curved rear door shut-line hugging front edge of rear wheel arch (Image 3)
        {
          pts: [
            [0.754, 1.055, -1.03],
            [0.838, 0.900, -1.03],
            [0.868, 0.660, -0.94],
            [0.856, 0.420, -0.88],
            [0.802, 0.175, -0.85]
          ],
          width: 0.0055,
          material: matteBlackPlasticMat
        }
      ]
    };
    exteriorGroup.add(CarCAD.buildSculptedSideBody(peugeotSideBlueprint, this.bodyPaintMat));

    // Stamped 32-segment Circular Painted Wheel-Arch Fender Flare Ribbons (z = ±1.26)
    exteriorGroup.add(CarCAD.buildWheelArchFenderRibbon(
      1.26, 0.305, 0.352, 0.396, 0.864, 0.852, -0.34, Math.PI + 0.34, 32, this.bodyPaintMat
    ));
    exteriorGroup.add(CarCAD.buildWheelArchFenderRibbon(
      -1.26, 0.305, 0.352, 0.396, 0.864, 0.852, -0.34, Math.PI + 0.34, 32, this.bodyPaintMat
    ));

    // Subtle dark rocker pinch-weld edge underline between arches
    [-1, 1].forEach(side => {
      const sillTrim = new THREE.Mesh(
        new THREE.BoxGeometry(0.022, 0.020, 1.72),
        matteBlackPlasticMat
      );
      sillTrim.position.set(side * 0.788, 0.172, 0.00);
      exteriorGroup.add(sillTrim);
    });

    // Rounded-Square Fuel Filler Door Seam on Left (+X) Rear Quarter Panel (Image 3)
    const fuelPts208 = CarCAD.evaluateCubicSpline([
      [0.848, 0.900, -1.42],
      [0.848, 0.900, -1.56],
      [0.862, 0.785, -1.56],
      [0.862, 0.785, -1.42],
      [0.848, 0.900, -1.42]
    ], 28).map(p => new THREE.Vector3(p[0], p[1], p[2]));
    exteriorGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(fuelPts208), new THREE.LineBasicMaterial({ color: 0x334155 })));

    // ========================================================================
    // 2. DOMED FASTBACK GLOSS-BLACK ROOF, PROTRUDING SPOILER & WIDE C-PILLAR
    // ========================================================================
    const roofBlackCenterStations = CarCAD.evaluateCubicSpline([
      { z: -1.32, pts: [[0, 1.372], [0.25, 1.372], [0.47, 1.358], [0.55, 1.338]] },
      { z: -0.96, pts: [[0, 1.406], [0.26, 1.406], [0.49, 1.390], [0.57, 1.368]] },
      { z: -0.50, pts: [[0, 1.430], [0.27, 1.430], [0.50, 1.412], [0.585, 1.390]] },
      { z: -0.10, pts: [[0, 1.424], [0.28, 1.424], [0.50, 1.406], [0.580, 1.384]] },
      { z:  0.26, pts: [[0, 1.378], [0.26, 1.378], [0.48, 1.362], [0.565, 1.340]] }
    ], 20);
    exteriorGroup.add(this.buildLoftedSymmetricSurface(roofBlackCenterStations, glossBlackMat));

    // Protruding Gloss-Black Rear Roof Spoiler (visibly juts rearward in Image 3!)
    const spoilerTopStations = [
      { z: -1.56, pts: [[0, 1.358], [0.26, 1.358], [0.52, 1.342], [0.58, 1.322]] },
      { z: -1.31, pts: [[0, 1.374], [0.26, 1.374], [0.54, 1.358], [0.60, 1.338]] }
    ];
    exteriorGroup.add(this.buildLoftedSymmetricSurface(spoilerTopStations, glossBlackMat));

    // Flush Sheet-Metal A-Pillars & Smoothly Arched Body-Colored Cantrails (Cowl z = 0.86)
    const aPillarAndRailInner = CarCAD.evaluateCubicSpline([
      [0.672, 0.900,  0.85],
      [0.635, 1.130,  0.56],
      [0.565, 1.340,  0.26],
      [0.585, 1.390, -0.50],
      [0.570, 1.368, -0.96],
      [0.550, 1.338, -1.32]
    ], 24);
    const aPillarAndRailOuter = CarCAD.evaluateCubicSpline([
      [0.755, 0.895,  0.85],
      [0.708, 1.125,  0.56],
      [0.630, 1.338,  0.26],
      [0.648, 1.386, -0.50],
      [0.632, 1.364, -0.96],
      [0.608, 1.334, -1.32]
    ], 24);
    exteriorGroup.add(this.buildFlushRibbonPair(aPillarAndRailInner, aPillarAndRailOuter, this.bodyPaintMat));

    // Wide Muscular Body-Colored Peugeot 208 C-Pillar (wraps seamlessly behind curved rear window at z = -1.04)
    const cPillarInner = CarCAD.evaluateCubicSpline([
      [0.562, 1.336, -1.32],
      [0.628, 1.150, -1.55],
      [0.708, 0.945, -1.73]
    ], 12);
    const cPillarOuter = CarCAD.evaluateCubicSpline([
      [0.614, 1.332, -1.08],
      [0.695, 1.190, -1.16],
      [0.748, 1.068, -1.04]
    ], 12);
    exteriorGroup.add(this.buildFlushRibbonPair(cPillarInner, cPillarOuter, this.bodyPaintMat));

    // Gloss-Black Front Mirror Sail Triangle
    [-1, 1].forEach(side => {
      const sailPos = [
        side * 0.758, 0.902, 0.83,
        side * 0.752, 0.910, 0.62,
        side * 0.715, 1.070, 0.60
      ];
      const sailGeo = new THREE.BufferGeometry();
      sailGeo.setAttribute('position', new THREE.Float32BufferAttribute(sailPos, 3));
      sailGeo.setIndex(side > 0 ? [0, 1, 2] : [0, 2, 1]);
      sailGeo.computeVertexNormals();
      exteriorGroup.add(new THREE.Mesh(sailGeo, glossBlackMat));
    });

    // Angled Rear Roof Whip Antenna Mast
    const antBase = new THREE.Mesh(
      new THREE.BoxGeometry(0.036, 0.024, 0.06),
      glossBlackMat
    );
    antBase.position.set(0, 1.396, -1.12);
    exteriorGroup.add(antBase);

    const antMast = new THREE.Mesh(
      new THREE.CylinderGeometry(0.003, 0.006, 0.24, 8),
      glossBlackMat
    );
    antMast.position.set(0, 1.480, -1.19);
    antMast.rotation.x = -0.72;
    exteriorGroup.add(antMast);

    // ========================================================================
    // 3. WINDSHIELD, REAR GLASS, CONTOURED 2-PANE TEARDROP GREENHOUSE & MIRRORS
    // ========================================================================
    const wsStations = CarCAD.evaluateCubicSpline([
      { z: 0.26, pts: [[0, 1.372], [0.25, 1.372], [0.46, 1.358], [0.565, 1.340]] },
      { z: 0.56, pts: [[0, 1.142], [0.27, 1.140], [0.50, 1.132], [0.635, 1.128]] },
      { z: 0.85, pts: [[0, 0.904], [0.29, 0.904], [0.53, 0.898], [0.672, 0.895]] }
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
    const rearGlassStations = CarCAD.evaluateCubicSpline([
      { z: -1.73, pts: [[0, 0.955], [0.27, 0.955], [0.51, 0.946], [0.695, 0.938]] },
      { z: -1.53, pts: [[0, 1.162], [0.26, 1.162], [0.48, 1.152], [0.618, 1.140]] },
      { z: -1.32, pts: [[0, 1.368], [0.24, 1.368], [0.45, 1.356], [0.562, 1.336]] }
    ], 12);
    exteriorGroup.add(this.buildLoftedSymmetricSurface(rearGlassStations, rearGlassMat));

    // CarCAD Contoured 2-Pane Peugeot 208 Teardrop Greenhouse (Upward Kicking Beltline + Gloss-Black B-Pillar)
    const peugeotSideWindowPts = {
      samples: 76,
      frameWidth: 0.024,
      frameOut: 0.008,
      pts: [
        // Sweeping feline beltline kicking upward toward rear quarter
        [0.752, 0.918,  0.63],
        [0.764, 0.938,  0.22],
        [0.766, 0.962, -0.18],
        [0.760, 1.005, -0.62],
        [0.748, 1.072, -1.03],
        // Rounded teardrop C-pillar sweep
        [0.722, 1.135, -1.13],
        [0.678, 1.245, -1.16],
        [0.625, 1.325, -1.08],
        // Arched fastback cantrail
        [0.635, 1.360, -0.78],
        [0.648, 1.380, -0.32],
        [0.640, 1.358,  0.12],
        [0.632, 1.332,  0.24],
        // Sleek A-pillar down to mirror triangle
        [0.700, 1.125,  0.54],
        [0.744, 0.955,  0.65]
      ]
    };
    const peugeotBPillar = {
      zBottom: -0.14,
      zTop: -0.24,
      yBottom: 0.955,
      yTop: 1.375,
      xBottom: 0.765,
      xTop: 0.646,
      widthBottom: 0.115,
      widthTop: 0.100,
      thickness: 0.012
    };
    exteriorGroup.add(
      CarCAD.buildGreenhouseWindowAndFrame(
        peugeotSideWindowPts,
        peugeotBPillar,
        null, // 2-pane Peugeot DLO (no quarter divider pillar)
        this.exteriorGlassMat,
        glossBlackMat
      )
    );

    [-1, 1].forEach(side => {
      // Sculpted Rounded Body-Colored Door Handles (rear handle subtly higher with beltline kick!)
      [0.02, -0.70].forEach(zPos => {
        const yHandle = zPos > 0 ? 0.872 : 0.905;
        const pocket = new THREE.Mesh(
          new THREE.BoxGeometry(0.01, 0.030, 0.13),
          new THREE.MeshBasicMaterial({ color: 0x1e293b })
        );
        pocket.position.set(side * 0.835, yHandle - 0.002, zPos);
        exteriorGroup.add(pocket);

        const handleBar = new THREE.Mesh(
          new THREE.CylinderGeometry(0.014, 0.014, 0.14, 12),
          this.bodyPaintMat
        );
        handleBar.rotation.x = Math.PI / 2;
        handleBar.scale.set(0.75, 1.0, 1.0);
        handleBar.position.set(side * 0.850, yHandle, zPos);
        exteriorGroup.add(handleBar);
      });

      // Sculpted Aerodynamic Gloss-Black Wing Mirrors mounted at A-pillar window corner (z = 0.60)
      const mirrorGroup = new THREE.Group();
      mirrorGroup.position.set(side * 0.845, 0.925, 0.60);

      const baseTri = new THREE.Mesh(
        new THREE.BoxGeometry(0.038, 0.072, 0.095),
        glossBlackMat
      );
      baseTri.position.set(side * -0.072, -0.01, 0.02);
      baseTri.rotation.x = 0.45;
      mirrorGroup.add(baseTri);

      const arm = new THREE.Mesh(
        new THREE.CylinderGeometry(0.013, 0.017, 0.075, 10),
        glossBlackMat
      );
      arm.rotation.z = Math.PI / 2;
      arm.position.set(side * -0.042, -0.014, 0.01);
      mirrorGroup.add(arm);

      const cap = new THREE.Mesh(
        new THREE.SphereGeometry(0.074, 18, 12),
        glossBlackMat
      );
      cap.scale.set(1.18, 0.70, 0.86);
      cap.rotation.y = side * -0.20;
      mirrorGroup.add(cap);

      const repeater = new THREE.Mesh(
        new THREE.BoxGeometry(0.105, 0.010, 0.014),
        new THREE.MeshBasicMaterial({ color: 0xf8fafc })
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
    // 4. PEUGEOT 208 FACELIFT FRONT FASCIA (Image 1 Reference):
    //    - Large Trapezoidal Parametric Black Grille + Peugeot Lion Shield Crest
    //    - Small Black "208" Badge centered on Hood Tip
    //    - Signature TRIPLE-CLAW Vertical LED DRL Fangs ("3 Garras")!
    //    - Swept Feline Smoked Headlamps
    // ========================================================================
    const peugeotGrilleTex = this.createPeugeotGrilleTexture();
    const mainGrille = new THREE.Mesh(
      new THREE.PlaneGeometry(1.04, 0.335),
      new THREE.MeshStandardMaterial({ map: peugeotGrilleTex, roughness: 0.35, metalness: 0.3, transparent: true })
    );
    mainGrille.position.set(0, 0.455, 2.022);
    mainGrille.rotation.x = -0.04;
    exteriorGroup.add(mainGrille);

    // Peugeot Lion Shield Emblem centered in Upper Middle of Grille (Image 1)
    const frontShield = this.createPeugeotShieldBadge(0.080);
    frontShield.position.set(0, 0.562, 2.032);
    frontShield.rotation.x = -0.04;
    exteriorGroup.add(frontShield);

    // Small "208" Badge on Front Edge of Hood above Grille (Image 1)
    const hoodBadgeTex = this.create208BadgeTexture(false);
    const hood208Badge = new THREE.Mesh(
      new THREE.PlaneGeometry(0.14, 0.036),
      new THREE.MeshBasicMaterial({ map: hoodBadgeTex, transparent: true })
    );
    hood208Badge.position.set(0, 0.715, 1.908);
    hood208Badge.rotation.x = -0.46;
    exteriorGroup.add(hood208Badge);

    // Clamshell Hood Leading-Edge Shut-Line above grille & headlamps
    const peugeotHoodShutPts = CarCAD.evaluateCubicSpline([
      [-0.708, 0.684, 1.865],
      [-0.470, 0.702, 1.895],
      [ 0.000, 0.710, 1.905],
      [ 0.470, 0.702, 1.895],
      [ 0.708, 0.684, 1.865]
    ], 24).map(p => new THREE.Vector3(p[0], p[1], p[2]));
    exteriorGroup.add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(peugeotHoodShutPts),
      new THREE.LineBasicMaterial({ color: 0x0f172a })
    ));

    // Centered White "208" Showroom Plate on Front Grille (Image 1)
    const frontPlateTex = this.createShowroom208PlateTexture();
    const frontPlate = new THREE.Mesh(
      new THREE.PlaneGeometry(0.42, 0.135),
      new THREE.MeshBasicMaterial({ map: frontPlateTex })
    );
    frontPlate.position.set(0, 0.448, 2.036);
    exteriorGroup.add(frontPlate);

    // SIGNATURE TRIPLE-CLAW VERTICAL LED DRL FANGS ("3 GARRAS" - Image 1)
    const clawDrlTex = this.createTripleClawDRLTexture();
    const clawDrlMat = new THREE.MeshBasicMaterial({ map: clawDrlTex, transparent: true });
    [-1, 1].forEach(side => {
      const clawMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(0.24, 0.245),
        clawDrlMat
      );
      clawMesh.position.set(side * 0.585, 0.408, 1.998);
      clawMesh.rotation.y = side * 0.24;
      clawMesh.rotation.x = -0.03;
      if (side < 0) clawMesh.scale.x = -1;
      exteriorGroup.add(clawMesh);
    });

    // Swept Feline Smoked Headlamps (Image 1)
    const headlampTex = this.createPeugeotHeadlampTexture();
    const shinyHeadlampMat = new THREE.MeshStandardMaterial({
      map: headlampTex,
      emissiveMap: headlampTex,
      emissive: 0xffffff,
      emissiveIntensity: 0.62,
      roughness: 0.05,
      metalness: 0.25,
      envMap: this.envMap,
      envMapIntensity: 1.5
    });
    [-1, 1].forEach(side => {
      const hlLens = new THREE.Mesh(
        new THREE.PlaneGeometry(0.34, 0.132),
        shinyHeadlampMat
      );
      hlLens.position.set(side * 0.575, 0.635, 1.988);
      hlLens.rotation.y = side * 0.24;
      hlLens.rotation.x = -0.07;
      if (side < 0) hlLens.scale.x = -1;
      exteriorGroup.add(hlLens);

      // Wraparound Feline Headlamp Corner & Side Diagonal Fang Slash (visible from side view in Image 3)
      const sideHl = new THREE.Mesh(
        new THREE.PlaneGeometry(0.25, 0.095),
        shinyHeadlampMat
      );
      sideHl.position.set(side * 0.715, 0.648, 1.795);
      sideHl.rotation.y = side * (Math.PI / 2 - 0.22);
      sideHl.rotation.z = side * -0.14;
      if (side > 0) sideHl.scale.x = -1;
      exteriorGroup.add(sideHl);

      const sideFangSlash = new THREE.Mesh(
        new THREE.PlaneGeometry(0.024, 0.21),
        new THREE.MeshBasicMaterial({ color: 0x0f172a, side: THREE.DoubleSide })
      );
      sideFangSlash.position.set(side * 0.716, 0.435, 1.835);
      sideFangSlash.rotation.y = side * (Math.PI / 2 - 0.18);
      sideFangSlash.rotation.x = 0.24;
      exteriorGroup.add(sideFangSlash);
    });

    // ========================================================================
    // 5. PEUGEOT 208 REAR END (Image 2 Reference):
    // ========================================================================
    const rearBandTex = this.createPeugeotRearBandTexture();
    const rearBlackBand = new THREE.Mesh(
      new THREE.PlaneGeometry(1.14, 0.14),
      new THREE.MeshStandardMaterial({ map: rearBandTex, roughness: 0.15, metalness: 0.25 })
    );
    rearBlackBand.position.set(0, 0.818, -1.915);
    rearBlackBand.rotation.y = Math.PI;
    exteriorGroup.add(rearBlackBand);

    this.tailOffTex = this.createPeugeotTaillightTexture(false);
    this.tailBrakeTex = this.createPeugeotTaillightTexture(true);

    [-1, 1].forEach(side => {
      const tailMat = new THREE.MeshBasicMaterial({ map: this.tailOffTex });
      this.brakeLightMaterials.push(tailMat);

      const tailCluster = new THREE.Mesh(
        new THREE.BoxGeometry(0.31, 0.152, 0.14),
        tailMat
      );
      tailCluster.position.set(side * 0.605, 0.818, -1.875);
      tailCluster.rotation.y = side * -0.18;
      exteriorGroup.add(tailCluster);

      // Wraparound Smoked Horizontal Taillight Side Blade (visible from side view in Image 3)
      const sideTail = new THREE.Mesh(
        new THREE.PlaneGeometry(0.24, 0.12),
        tailMat
      );
      sideTail.position.set(side * 0.778, 0.835, -1.75);
      sideTail.rotation.y = side * (Math.PI / 2 + 0.14);
      sideTail.rotation.z = side * 0.12;
      exteriorGroup.add(sideTail);
    });

    // Lower-Left "208" Badge & Lower-Right "LIKE" Badge (Image 2)
    const rear208Plane = new THREE.Mesh(
      new THREE.PlaneGeometry(0.14, 0.036),
      new THREE.MeshBasicMaterial({ map: this.create208BadgeTexture(true), transparent: true })
    );
    rear208Plane.position.set(0.49, 0.665, -1.945);
    rear208Plane.rotation.y = Math.PI;
    exteriorGroup.add(rear208Plane);

    const likeBadgePlane = new THREE.Mesh(
      new THREE.PlaneGeometry(0.16, 0.036),
      new THREE.MeshBasicMaterial({ map: this.createLikeBadgeTexture(), transparent: true })
    );
    likeBadgePlane.position.set(-0.49, 0.665, -1.945);
    likeBadgePlane.rotation.y = Math.PI;
    exteriorGroup.add(likeBadgePlane);

    // Peugeot 208 Rear Tailgate Shut-Lines & Character Crease
    exteriorGroup.add(
      CarCAD.buildSymmetricTrunkLines(
        [
          {
            pts: [
              [0.680, 0.950, -1.735],
              [0.540, 0.880, -1.875],
              [0.490, 0.735, -1.925],
              [0.440, 0.585, -2.014]
            ],
            mirrored: true,
            width: 0.006,
            offsetZ: -0.005
          },
          {
            pts: [
              [-0.440, 0.585, -2.014],
              [ 0.000, 0.582, -2.016],
              [ 0.440, 0.585, -2.014]
            ],
            mirrored: false,
            width: 0.006,
            offsetZ: -0.005
          },
          {
            pts: [
              [-0.470, 0.640, -1.970],
              [ 0.000, 0.638, -1.974],
              [ 0.470, 0.640, -1.970]
            ],
            mirrored: false,
            width: 0.0045,
            offsetZ: -0.004
          }
        ],
        matteBlackPlasticMat
      )
    );

    // Rear Windshield Wiper (pivoting from right as in Image 2)
    const rearWiper = new THREE.Mesh(
      new THREE.BoxGeometry(0.35, 0.016, 0.02),
      matteBlackPlasticMat
    );
    rearWiper.position.set(-0.15, 0.968, -1.735);
    rearWiper.rotation.z = 0.04;
    exteriorGroup.add(rearWiper);

    // High-Mount Red 3rd Brake Light centered in Spoiler (Image 2)
    const thirdBrakeMat = new THREE.MeshBasicMaterial({ color: 0xb91c1c });
    this.thirdBrakeMat = thirdBrakeMat;
    const thirdBrake = new THREE.Mesh(
      new THREE.BoxGeometry(0.32, 0.020, 0.03),
      thirdBrakeMat
    );
    thirdBrake.position.set(0, 1.365, -1.535);
    exteriorGroup.add(thirdBrake);

    // Matte-Black Trapezoidal Rear Bumper Diffuser + Red Corner Reflectors + "208" Plate
    const rearDiffuserTex = this.createPeugeotRearDiffuserTexture();
    const rearValance = new THREE.Mesh(
      new THREE.PlaneGeometry(1.34, 0.255),
      new THREE.MeshStandardMaterial({ map: rearDiffuserTex, roughness: 0.72, metalness: 0.06, transparent: true })
    );
    rearValance.position.set(0, 0.365, -2.032);
    rearValance.rotation.y = Math.PI;
    rearValance.rotation.x = 0.05;
    exteriorGroup.add(rearValance);

    const rearPlate = new THREE.Mesh(
      new THREE.PlaneGeometry(0.42, 0.135),
      new THREE.MeshBasicMaterial({ map: frontPlateTex })
    );
    rearPlate.position.set(0, 0.39, -2.039);
    rearPlate.rotation.y = Math.PI;
    exteriorGroup.add(rearPlate);

    [-1, 1].forEach(side => {
      const refl = new THREE.Mesh(
        new THREE.PlaneGeometry(0.18, 0.024),
        new THREE.MeshBasicMaterial({ color: 0xdc2626 })
      );
      refl.position.set(side * 0.50, 0.30, -2.029);
      refl.rotation.y = Math.PI - side * 0.14;
      exteriorGroup.add(refl);
    });

    // Right-Side Exhaust Tip (Image 2 bottom right)
    const exhaust = new THREE.Mesh(
      new THREE.CylinderGeometry(0.035, 0.038, 0.12, 12),
      matteBlackPlasticMat
    );
    exhaust.rotation.x = Math.PI / 2;
    exhaust.position.set(-0.48, 0.22, -2.008);
    exteriorGroup.add(exhaust);

    // ========================================================================
    // 6. 16" BI-TONE 5-TWIN-SPOKE PEUGEOT ALLOYS + BRAKE DISCS & WELL TUBS
    // ========================================================================
    const wheelPositions = [
      { x: -0.765, y: 0.305, z:  1.26, front: true,  side: -1 },
      { x:  0.765, y: 0.305, z:  1.26, front: true,  side:  1 },
      { x: -0.765, y: 0.305, z: -1.26, front: false, side: -1 },
      { x:  0.765, y: 0.305, z: -1.26, front: false, side:  1 }
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

    const wheelWellGeo = new THREE.CircleGeometry(0.37, 28);
    const wheelWellBarrelGeo = new THREE.CylinderGeometry(0.37, 0.37, 0.24, 28, 1, true, 0, Math.PI);
    wheelWellBarrelGeo.rotateZ(Math.PI / 2);

    wheelPositions.forEach(wp => {
      const wellBack = new THREE.Mesh(wheelWellGeo, matteBlackPlasticMat);
      wellBack.position.set(wp.side * 0.615, wp.y + 0.01, wp.z);
      wellBack.rotation.y = wp.side > 0 ? Math.PI / 2 : -Math.PI / 2;
      exteriorGroup.add(wellBack);

      const wellArchRoof = new THREE.Mesh(wheelWellBarrelGeo, matteBlackPlasticMat);
      wellArchRoof.position.set(wp.side * 0.71, wp.y + 0.01, wp.z);
      exteriorGroup.add(wellArchRoof);

      const steerPivot = new THREE.Group();
      steerPivot.position.set(wp.x, wp.y, wp.z);
      this.root.add(steerPivot);

      const wheelAsm = CarCAD.buildDetailedWheelAssembly({
        radius: 0.305,
        width: 0.195,
        rimRadius: 0.214, // 195/55 R16 sportier larger alloy vs Polo's 15" steel cover
        side: wp.side,
        isRear: !wp.front,
        style: 'peugeot_diamond',
        segments: 40,
        tireMat: tireRubberMat,
        sidewallMat: tireSidewallMat,
        rimMat: machinedAlloyMat,
        spokeMat: glossBlackMat,
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
      new THREE.PlaneGeometry(1.74, 3.88),
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
    // 7. BUILD PHOTO-ACCURATE PEUGEOT i-COCKPIT INTERIOR (Images 3, 4, 5)
    // ========================================================================
    this.buildPeugeotICockpit();
    this.chassisGroup.add(this.cockpitGroup);
  }

  /**
   * Builds the authentic Peugeot i-Cockpit (Images 3, 4 & 5):
   * - Raised Head-Up Analog + LCD Instrument Cluster perched ABOVE the steering wheel
   * - Compact Double-Flat 2-Spoke Steering Wheel with hexagonal Lion Shield horn pad
   * - Carbon-weave dashboard fascia & angled side vents with chrome C-trim
   * - Floating 10" wide-screen infotainment display with satin-silver U-cradle
   * - Dual horizontal center air vents + 7 chrome "Piano Key" toggle switches
   * - 5-speed manual gear shifter & stitched cloth seats
   */
  buildPeugeotICockpit() {
    const dashCharcoalMat = new THREE.MeshStandardMaterial({
      color: 0x1c2028,
      roughness: 0.68,
      metalness: 0.06
    });

    const dashSoftBlackMat = new THREE.MeshStandardMaterial({
      color: 0x12151b,
      roughness: 0.50,
      metalness: 0.08
    });

    const glossBlackTrimMat = new THREE.MeshStandardMaterial({
      color: 0x0d1017,
      roughness: 0.18,
      metalness: 0.28,
      envMap: this.envMap,
      envMapIntensity: 0.85
    });

    const satinSilverMat = new THREE.MeshStandardMaterial({
      color: 0xcbd5e1,
      roughness: 0.25,
      metalness: 0.80,
      envMap: this.envMap,
      envMapIntensity: 0.95
    });

    const carbonWeaveMat = new THREE.MeshStandardMaterial({
      map: this.createCarbonWeaveTexture(),
      roughness: 0.42,
      metalness: 0.16
    });

    const headlinerGreyMat = new THREE.MeshLambertMaterial({ color: 0x9ca3af });
    const seatFabricMat = new THREE.MeshStandardMaterial({
      map: this.createPeugeotSeatFabricTexture(),
      roughness: 0.85,
      metalness: 0.02
    });

    // 1. Cabin Floor Carpet & Inner Door Trim Panels (Image 3 shows sculpted door armrests)
    const floorCarpet = new THREE.Mesh(
      new THREE.BoxGeometry(1.50, 0.05, 1.92),
      dashSoftBlackMat
    );
    floorCarpet.position.set(0, 0.25, -0.10);
    this.cockpitGroup.add(floorCarpet);

    const rearBenchBack = new THREE.Mesh(
      new THREE.BoxGeometry(1.46, 0.68, 0.14),
      seatFabricMat
    );
    rearBenchBack.position.set(0, 0.66, -1.32);
    rearBenchBack.rotation.x = -0.15;
    this.cockpitGroup.add(rearBenchBack);

    const parcelShelf = new THREE.Mesh(
      new THREE.BoxGeometry(1.44, 0.05, 0.42),
      dashSoftBlackMat
    );
    parcelShelf.position.set(0, 0.91, -1.56);
    this.cockpitGroup.add(parcelShelf);

    [-1, 1].forEach(side => {
      const doorCard = new THREE.Mesh(
        new THREE.BoxGeometry(0.06, 0.62, 1.82),
        dashCharcoalMat
      );
      doorCard.position.set(side * 0.73, 0.58, -0.24);
      this.cockpitGroup.add(doorCard);

      const armrest = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, 0.045, 0.54),
        dashSoftBlackMat
      );
      armrest.position.set(side * 0.69, 0.65, 0.08);
      this.cockpitGroup.add(armrest);

      const doorHandle = new THREE.Mesh(
        new THREE.BoxGeometry(0.02, 0.028, 0.075),
        satinSilverMat
      );
      doorHandle.position.set(side * 0.69, 0.76, 0.24);
      this.cockpitGroup.add(doorHandle);
    });

    // 2. Front Seats with White Contrast Stitch & Textured Gray Shoulder Bolsters (Image 3)
    [-0.35, 0.35].forEach(xPos => {
      const seatCushion = new THREE.Mesh(
        new THREE.BoxGeometry(0.45, 0.12, 0.46),
        seatFabricMat
      );
      seatCushion.position.set(xPos, 0.39, -0.18);
      this.cockpitGroup.add(seatCushion);

      const seatBack = new THREE.Mesh(
        new THREE.BoxGeometry(0.45, 0.60, 0.10),
        seatFabricMat
      );
      seatBack.position.set(xPos, 0.72, -0.42);
      seatBack.rotation.x = -0.16;
      this.cockpitGroup.add(seatBack);

      const headrest = new THREE.Mesh(
        new THREE.BoxGeometry(0.22, 0.18, 0.085),
        seatFabricMat
      );
      headrest.position.set(xPos, 1.10, -0.48);
      this.cockpitGroup.add(headrest);
    });

    // 3. Sculpted Peugeot i-Cockpit Dashboard with Carbon-Weave Fascia Band (Image 3)
    const dashLowerBody = new THREE.Mesh(
      new THREE.BoxGeometry(1.46, 0.34, 0.16),
      dashCharcoalMat
    );
    dashLowerBody.position.set(0, 0.65, 0.54);
    this.cockpitGroup.add(dashLowerBody);

    // Lower Carbon-Weave Dashboard Shelf across full width (Image 3 & 4 show carbon weave directly below cluster!)
    const carbonFascia = new THREE.Mesh(
      new THREE.BoxGeometry(1.44, 0.11, 0.18),
      carbonWeaveMat
    );
    carbonFascia.position.set(0, 0.81, 0.48);
    this.cockpitGroup.add(carbonFascia);

    // Slim Gloss-Black Accent Trim on Passenger Side (Image 3)
    const passengerGlossStrip = new THREE.Mesh(
      new THREE.BoxGeometry(0.56, 0.018, 0.02),
      glossBlackTrimMat
    );
    passengerGlossStrip.position.set(-0.42, 0.765, 0.395);
    this.cockpitGroup.add(passengerGlossStrip);

    const glovebox = new THREE.Mesh(
      new THREE.BoxGeometry(0.54, 0.17, 0.015),
      dashSoftBlackMat
    );
    glovebox.position.set(-0.41, 0.57, 0.455);
    this.cockpitGroup.add(glovebox);

    // 4. RAISED HEAD-UP INSTRUMENT CLUSTER (Image 3 & 4)
    //    Positioned HIGH at y = 0.945m so it is read completely OVER the compact steering wheel!
    const clusterBacking = new THREE.Mesh(
      new THREE.BoxGeometry(0.45, 0.185, 0.05),
      dashSoftBlackMat
    );
    clusterBacking.position.set(0.35, 0.945, 0.472);
    clusterBacking.rotation.x = 0.06;
    this.cockpitGroup.add(clusterBacking);

    const clusterTopVisor = new THREE.Mesh(
      new THREE.BoxGeometry(0.47, 0.022, 0.09),
      dashSoftBlackMat
    );
    clusterTopVisor.position.set(0.35, 1.04, 0.452);
    this.cockpitGroup.add(clusterTopVisor);

    this.dashCanvas = document.createElement('canvas');
    this.dashCanvas.width = 640;
    this.dashCanvas.height = 250;
    this.dashCtx = this.dashCanvas.getContext('2d');
    this.dashTexture = new THREE.CanvasTexture(this.dashCanvas);
    this.dashTexture.anisotropy = 4;

    const clusterPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(0.42, 0.165),
      new THREE.MeshBasicMaterial({ map: this.dashTexture })
    );
    clusterPlane.position.set(0.35, 0.945, 0.445);
    clusterPlane.rotation.y = Math.PI;
    clusterPlane.rotation.x = 0.06;
    this.cockpitGroup.add(clusterPlane);

    // 5. Angled Left & Right Outer Air Vents with Chrome C-Trim (Image 3)
    const sideVentTex = this.createPeugeotSideVentTexture();
    const leftVentPanel = new THREE.Mesh(
      new THREE.PlaneGeometry(0.15, 0.095),
      new THREE.MeshBasicMaterial({ map: sideVentTex })
    );
    leftVentPanel.position.set(0.62, 0.835, 0.425);
    leftVentPanel.rotation.y = Math.PI - 0.12;
    this.cockpitGroup.add(leftVentPanel);

    const rightVentPanel = new THREE.Mesh(
      new THREE.PlaneGeometry(0.15, 0.095),
      new THREE.MeshBasicMaterial({ map: sideVentTex })
    );
    rightVentPanel.position.set(-0.62, 0.835, 0.425);
    rightVentPanel.rotation.y = Math.PI + 0.12;
    rightVentPanel.scale.x = -1;
    this.cockpitGroup.add(rightVentPanel);

    // ========================================================================
    // 6. FLOATING 10" WIDE-SCREEN DISPLAY WITH SATIN-SILVER CHIN CRADLE,
    //    DUAL CENTER VENTS & 7 CHROME "PIANO KEY" SWITCHES (Images 3 & 5)
    // ========================================================================
    const centerUpperPanel = new THREE.Mesh(
      new THREE.BoxGeometry(0.37, 0.21, 0.045),
      glossBlackTrimMat
    );
    centerUpperPanel.position.set(-0.01, 0.92, 0.44);
    centerUpperPanel.rotation.y = -0.11; // Angled toward driver's seat (+X)
    this.cockpitGroup.add(centerUpperPanel);

    // Iconic Satin-Silver U-Cradle wrapping bottom & lower sides of the 10" screen (Image 5!)
    const screenSilverBottom = new THREE.Mesh(
      new THREE.BoxGeometry(0.375, 0.014, 0.05),
      satinSilverMat
    );
    screenSilverBottom.position.set(-0.01, 0.812, 0.436);
    screenSilverBottom.rotation.y = -0.11;
    this.cockpitGroup.add(screenSilverBottom);

    this.infotainmentCanvas = document.createElement('canvas');
    this.infotainmentCanvas.width = 560;
    this.infotainmentCanvas.height = 280;
    this.infoCtx = this.infotainmentCanvas.getContext('2d');
    this.infoTexture = new THREE.CanvasTexture(this.infotainmentCanvas);
    this.infoTexture.anisotropy = 4;

    const floatingScreen = new THREE.Mesh(
      new THREE.PlaneGeometry(0.345, 0.18),
      new THREE.MeshBasicMaterial({ map: this.infoTexture })
    );
    floatingScreen.position.set(-0.01, 0.92, 0.415);
    floatingScreen.rotation.y = Math.PI - 0.11;
    this.cockpitGroup.add(floatingScreen);

    // Dual Horizontal Center Air Vents below the silver cradle (Images 3 & 5)
    const centerVentsMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.33, 0.082),
      new THREE.MeshBasicMaterial({ map: this.createPeugeotCenterVentsTexture() })
    );
    centerVentsMesh.position.set(-0.01, 0.745, 0.412);
    centerVentsMesh.rotation.y = Math.PI - 0.11;
    this.cockpitGroup.add(centerVentsMesh);

    // Signature Row of 7 Metallic Chrome "Piano Key" Toggle Switches (Images 3 & 5)
    const pianoKeyBackBar = new THREE.Mesh(
      new THREE.BoxGeometry(0.33, 0.038, 0.045),
      glossBlackTrimMat
    );
    pianoKeyBackBar.position.set(-0.01, 0.678, 0.418);
    pianoKeyBackBar.rotation.y = -0.11;
    this.cockpitGroup.add(pianoKeyBackBar);

    for (let k = 0; k < 7; k++) {
      const kx = -0.125 + k * 0.039;
      const dz = (kx + 0.01) * 0.11;
      const isHazard = k === 3;
      const keyMesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.030, 0.022, 0.028),
        isHazard ? new THREE.MeshBasicMaterial({ color: 0xdc2626 }) : satinSilverMat
      );
      keyMesh.position.set(kx, 0.675, 0.395 + dz);
      keyMesh.rotation.x = 0.25;
      keyMesh.rotation.y = -0.11;
      this.cockpitGroup.add(keyMesh);
    }

    // Lower Gloss-Black Storage Flap & Console Bridge
    const lowerCubby = new THREE.Mesh(
      new THREE.BoxGeometry(0.31, 0.11, 0.05),
      glossBlackTrimMat
    );
    lowerCubby.position.set(-0.01, 0.59, 0.425);
    lowerCubby.rotation.y = -0.11;
    this.cockpitGroup.add(lowerCubby);

    // ========================================================================
    // 7. CENTER TUNNEL, 5-SPEED PEUGEOT MANUAL SHIFTER & HANDBRAKE (Image 3)
    // ========================================================================
    const tunnelConsole = new THREE.Mesh(
      new THREE.BoxGeometry(0.24, 0.24, 0.86),
      dashCharcoalMat
    );
    tunnelConsole.position.set(0.0, 0.39, 0.08);
    this.cockpitGroup.add(tunnelConsole);

    const shiftSurround = new THREE.Mesh(
      new THREE.BoxGeometry(0.15, 0.016, 0.20),
      glossBlackTrimMat
    );
    shiftSurround.position.set(0.0, 0.515, 0.23);
    this.cockpitGroup.add(shiftSurround);

    const shiftSilverBorder = new THREE.Mesh(
      new THREE.BoxGeometry(0.162, 0.010, 0.212),
      satinSilverMat
    );
    shiftSilverBorder.position.set(0.0, 0.510, 0.23);
    this.cockpitGroup.add(shiftSilverBorder);

    const shiftBoot = new THREE.Mesh(
      new THREE.ConeGeometry(0.062, 0.085, 12),
      dashSoftBlackMat
    );
    shiftBoot.position.set(-0.005, 0.555, 0.23);
    this.cockpitGroup.add(shiftBoot);

    this.gearStickPivot = new THREE.Group();
    this.gearStickPivot.position.set(-0.005, 0.53, 0.23);
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
    shiftKnobBall.scale.set(0.92, 1.16, 1.12);
    shiftKnobBall.position.y = 0.145;
    this.gearStickPivot.add(shiftKnobBall);

    const knobSilverInsert = new THREE.Mesh(
      new THREE.CircleGeometry(0.023, 18),
      new THREE.MeshBasicMaterial({ map: this.createShiftKnobHPatternTexture() })
    );
    knobSilverInsert.rotation.x = -Math.PI / 2 + 0.35;
    knobSilverInsert.rotation.z = Math.PI;
    knobSilverInsert.position.set(0, 0.178, -0.008);
    this.gearStickPivot.add(knobSilverInsert);

    const handbrakeLever = new THREE.Mesh(
      new THREE.CylinderGeometry(0.016, 0.020, 0.23, 10),
      dashSoftBlackMat
    );
    handbrakeLever.rotation.x = Math.PI / 2 - 0.28;
    handbrakeLever.position.set(0.055, 0.55, -0.02);
    this.cockpitGroup.add(handbrakeLever);

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
    // 8. COMPACT DOUBLE-FLAT 2-SPOKE PEUGEOT i-COCKPIT STEERING WHEEL (Image 3)
    //    Mounted LOWER at y = 0.775m so driver views raised cluster OVER top rim!
    // ========================================================================
    const steeringCol = new THREE.Mesh(
      new THREE.CylinderGeometry(0.048, 0.060, 0.24, 14),
      dashCharcoalMat
    );
    steeringCol.rotation.x = Math.PI / 2 + 0.20;
    steeringCol.position.set(0.35, 0.755, 0.33);
    this.cockpitGroup.add(steeringCol);

    // Stalks behind steering wheel (Image 3 & 5 show left cruise/indicator stalk)
    [-1, 1].forEach(side => {
      const stalk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.010, 0.013, 0.14, 10),
        dashSoftBlackMat
      );
      stalk.rotation.z = side * (Math.PI / 2 - 0.18);
      stalk.position.set(0.35 + side * 0.11, 0.775, 0.275);
      this.cockpitGroup.add(stalk);
    });

    const wheelMount = new THREE.Group();
    wheelMount.position.set(0.35, 0.775, 0.215);
    wheelMount.rotation.x = 0.18;
    this.cockpitGroup.add(wheelMount);

    this.steeringWheelGroup = new THREE.Group();
    wheelMount.add(this.steeringWheelGroup);

    // Double-Flat Compact Peugeot i-Cockpit Steering Rim (flattened top & bottom!)
    const rimPoints = [];
    const segs = 48;
    for (let i = 0; i < segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      const rx = Math.cos(a) * 0.172;
      let ry = Math.sin(a) * 0.162;
      // Clamp top & bottom slightly to create Peugeot's signature flat-top / flat-bottom rim!
      ry = Math.max(-0.132, Math.min(0.132, ry));
      rimPoints.push(new THREE.Vector3(rx, ry, 0));
    }
    const rimCurve = new THREE.CatmullRomCurve3(rimPoints, true);
    const rimGeo = new THREE.TubeGeometry(rimCurve, 56, 0.0175, 14, true);
    const wheelRim = new THREE.Mesh(rimGeo, dashSoftBlackMat);
    this.steeringWheelGroup.add(wheelRim);

    // 2 Horizontal Spokes ONLY (no bottom spoke, matching Image 3!)
    const hSpoke = new THREE.Mesh(
      new THREE.BoxGeometry(0.32, 0.044, 0.022),
      glossBlackTrimMat
    );
    hSpoke.position.set(0, -0.006, 0);
    this.steeringWheelGroup.add(hSpoke);

    const mfButtonsTex = this.createPeugeotWheelButtonsTexture();
    [-1, 1].forEach(side => {
      const btnIsland = new THREE.Mesh(
        new THREE.PlaneGeometry(0.068, 0.040),
        new THREE.MeshBasicMaterial({ map: mfButtonsTex })
      );
      btnIsland.position.set(side * 0.114, -0.008, -0.012);
      btnIsland.rotation.y = Math.PI;
      if (side < 0) btnIsland.scale.x = -1;
      this.steeringWheelGroup.add(btnIsland);
    });

    // Hexagonal / Shield Horn Pad + Satin-Silver Lower U-Bezel + Peugeot Lion Shield Crest (Image 3!)
    const hexHornShape = new THREE.Shape();
    hexHornShape.moveTo(-0.048, 0.056);
    hexHornShape.lineTo(0.048, 0.056);
    hexHornShape.lineTo(0.072, 0.005);
    hexHornShape.lineTo(0.046, -0.064);
    hexHornShape.lineTo(-0.046, -0.064);
    hexHornShape.lineTo(-0.072, 0.005);
    hexHornShape.closePath();

    const hornExtrudeGeo = new THREE.ExtrudeGeometry(hexHornShape, {
      depth: 0.028,
      bevelEnabled: true,
      bevelThickness: 0.005,
      bevelSize: 0.005,
      bevelSegments: 3
    });
    const hornBoss = new THREE.Mesh(hornExtrudeGeo, dashSoftBlackMat);
    hornBoss.position.set(0, 0, -0.014);
    this.steeringWheelGroup.add(hornBoss);

    // Satin-silver bottom V/U trim hugging the bottom of the horn pad (Image 3!)
    const hornBottomSilver = new THREE.Mesh(
      new THREE.BoxGeometry(0.092, 0.010, 0.032),
      satinSilverMat
    );
    hornBottomSilver.position.set(0, -0.066, -0.002);
    this.steeringWheelGroup.add(hornBottomSilver);

    [-1, 1].forEach(side => {
      const diagTrim = new THREE.Mesh(
        new THREE.BoxGeometry(0.010, 0.068, 0.032),
        satinSilverMat
      );
      diagTrim.position.set(side * 0.057, -0.032, -0.002);
      diagTrim.rotation.z = side * 0.42;
      this.steeringWheelGroup.add(diagTrim);
    });

    const wheelLionCrest = this.createPeugeotShieldBadge(0.032);
    wheelLionCrest.rotation.y = Math.PI;
    wheelLionCrest.position.set(0, -0.004, -0.020);
    this.steeringWheelGroup.add(wheelLionCrest);

    // ========================================================================
    // 9. SUN VISORS, INTERIOR REARVIEW MIRROR & LOW EXTERIOR WIPERS
    // ========================================================================
    [-1, 1].forEach(side => {
      const sunVisor = new THREE.Mesh(
        new THREE.BoxGeometry(0.34, 0.016, 0.12),
        headlinerGreyMat
      );
      sunVisor.position.set(side * 0.32, 1.34, 0.20);
      sunVisor.rotation.x = 0.12;
      this.cockpitGroup.add(sunVisor);
    });

    const mirrorStem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.009, 0.011, 0.08, 8),
      dashSoftBlackMat
    );
    mirrorStem.position.set(0, 1.31, 0.26);
    this.cockpitGroup.add(mirrorStem);

    const mirrorHousing = new THREE.Mesh(
      new THREE.BoxGeometry(0.23, 0.058, 0.02),
      dashSoftBlackMat
    );
    mirrorHousing.position.set(0, 1.27, 0.25);
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
    mirrorGlassPlane.position.set(0, 1.27, 0.238);
    mirrorGlassPlane.rotation.y = Math.PI - 0.10;
    this.cockpitGroup.add(mirrorGlassPlane);

    [-0.18, 0.30].forEach(wx => {
      const wiperArm = new THREE.Mesh(
        new THREE.BoxGeometry(0.42, 0.012, 0.016),
        dashSoftBlackMat
      );
      wiperArm.position.set(wx, 0.900, 0.835);
      wiperArm.rotation.z = -0.04;
      this.cockpitGroup.add(wiperArm);
    });

    this.updateCockpitDisplays(0, 820, '1', 'RECTA PRINCIPAL', '00:00.000');
  }

  // ==========================================================================
  // PHOTO-ACCURATE PEUGEOT 208 TEXTURE GENERATORS (Images 1–5)
  // ==========================================================================

  createPeugeotShieldBadge(radius = 0.075) {
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 128;
    const ctx = c.getContext('2d');

    // Black Shield Crest with Silver Outline & Lion Silhouette
    ctx.fillStyle = '#0b0e14';
    ctx.beginPath();
    ctx.moveTo(22, 16);
    ctx.lineTo(106, 16);
    ctx.lineTo(100, 84);
    ctx.lineTo(64, 116);
    ctx.lineTo(28, 84);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 6;
    ctx.stroke();

    // Stylized Roaring Lion Profile inside the shield
    ctx.fillStyle = '#e2e8f0';
    ctx.beginPath();
    ctx.arc(64, 56, 20, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#0b0e14';
    ctx.beginPath();
    ctx.arc(58, 52, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e2e8f0';
    ctx.font = 'bold 11px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('PEUGEOT', 64, 30);

    const tex = new THREE.CanvasTexture(c);
    return new THREE.Mesh(
      new THREE.PlaneGeometry(radius * 1.8, radius * 2.0),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true })
    );
  }

  createPeugeotGrilleTexture() {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 192;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, 512, 192);

    // Wide trapezoidal parametric shield grille (Image 1)
    ctx.fillStyle = '#0a0d12';
    ctx.beginPath();
    ctx.moveTo(46, 10);
    ctx.lineTo(466, 10);
    ctx.lineTo(418, 182);
    ctx.lineTo(94, 182);
    ctx.closePath();
    ctx.fill();

    // Radiating dark metallic parametric dashes matching Image 1
    ctx.fillStyle = '#475569';
    for (let y = 24; y < 170; y += 18) {
      for (let x = 64; x < 448; x += 26) {
        const tilt = ((x - 256) / 200) * 0.28;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(tilt);
        ctx.fillRect(-7, -2.5, 14, 5);
        ctx.restore();
      }
    }

    ctx.strokeStyle = '#1e2430';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(46, 10);
    ctx.lineTo(466, 10);
    ctx.lineTo(418, 182);
    ctx.lineTo(94, 182);
    ctx.closePath();
    ctx.stroke();

    return new THREE.CanvasTexture(c);
  }

  /**
   * Signature Triple-Claw Vertical LED DRL Fangs ("3 Garras" - Image 1)
   */
  createTripleClawDRLTexture() {
    const c = document.createElement('canvas');
    c.width = 160;
    c.height = 180;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, 160, 180);

    // Gloss-black triangular corner pocket
    ctx.fillStyle = '#0a0d12';
    ctx.beginPath();
    ctx.moveTo(16, 14);
    ctx.lineTo(146, 42);
    ctx.lineTo(128, 168);
    ctx.lineTo(36, 148);
    ctx.closePath();
    ctx.fill();

    // 3 Glowing Bright White Vertical Claw Stripes slanting slightly inward
    ctx.save();
    ctx.shadowColor = '#ffffff';
    ctx.shadowBlur = 10;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 10;
    ctx.lineCap = 'round';
    [46, 78, 110].forEach((bx, idx) => {
      const topY = 26 + idx * 10;
      const botY = 136 + idx * 8;
      ctx.beginPath();
      ctx.moveTo(bx - 8, topY);
      ctx.lineTo(bx + 10, botY);
      ctx.stroke();
    });
    ctx.restore();

    return new THREE.CanvasTexture(c);
  }

  createPeugeotHeadlampTexture() {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 128;
    const ctx = c.getContext('2d');

    ctx.fillStyle = '#0e1118';
    ctx.fillRect(0, 0, 256, 128);

    // Sleek smoked feline projector & reflector bowls (Image 1)
    const g1 = ctx.createRadialGradient(84, 62, 6, 84, 62, 42);
    g1.addColorStop(0, '#ffffff');
    g1.addColorStop(0.5, '#cbd5e1');
    g1.addColorStop(1, '#1e293b');
    ctx.fillStyle = g1;
    ctx.beginPath();
    ctx.arc(84, 62, 40, 0, Math.PI * 2);
    ctx.fill();

    const g2 = ctx.createRadialGradient(178, 66, 4, 178, 66, 34);
    g2.addColorStop(0, '#fffbeb');
    g2.addColorStop(0.55, '#e2e8f0');
    g2.addColorStop(1, '#1e293b');
    ctx.fillStyle = g2;
    ctx.beginPath();
    ctx.arc(178, 66, 32, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 5;
    ctx.strokeRect(2, 2, 252, 124);
    return new THREE.CanvasTexture(c);
  }

  createPeugeotRearBandTexture() {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 80;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#0b0e14';
    ctx.fillRect(0, 0, 512, 80);

    // Subtle horizontal gloss highlight
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(0, 6, 512, 10);

    // Spaced "P E U G E O T" script across the center black tailgate strip (Image 2)
    ctx.fillStyle = '#cbd5e1';
    ctx.font = 'bold 26px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('P   E   U   G   E   O   T', 256, 42);
    return new THREE.CanvasTexture(c);
  }

  createPeugeotTaillightTexture(braking) {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 144;
    const ctx = c.getContext('2d');

    // Gloss-black smoked taillight housing (Image 2)
    ctx.fillStyle = '#090b10';
    ctx.fillRect(0, 0, 256, 144);

    // 3 Horizontal Red LED Claw Bars ("3 Garras" - Image 2!)
    ctx.save();
    ctx.shadowColor = braking ? '#ff1e27' : '#dc2626';
    ctx.shadowBlur = braking ? 16 : 6;
    ctx.fillStyle = braking ? '#ff3b3b' : '#dc2626';
    [28, 60, 92].forEach(ry => {
      ctx.fillRect(28, ry, 198, 16);
    });
    ctx.restore();

    // Small crisp reverse light wedge on bottom inner corner
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(154, 118, 66, 12);

    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 6;
    ctx.strokeRect(3, 3, 250, 138);
    return new THREE.CanvasTexture(c);
  }

  createPeugeotRearDiffuserTexture() {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 128;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, 512, 128);

    ctx.fillStyle = '#12151d';
    ctx.beginPath();
    ctx.moveTo(92, 10);
    ctx.lineTo(420, 10);
    ctx.lineTo(486, 124);
    ctx.lineTo(26, 124);
    ctx.closePath();
    ctx.fill();

    return new THREE.CanvasTexture(c);
  }

  create208BadgeTexture(darkText = true) {
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 40;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, 128, 40);
    ctx.fillStyle = darkText ? '#1e293b' : '#0f172a';
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 2;
    ctx.font = 'italic 900 28px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.strokeText('208', 64, 21);
    ctx.fillText('208', 64, 21);
    return new THREE.CanvasTexture(c);
  }

  createLikeBadgeTexture() {
    const c = document.createElement('canvas');
    c.width = 160;
    c.height = 40;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, 160, 40);
    ctx.fillStyle = '#334155';
    ctx.fillRect(10, 6, 140, 28);
    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 18px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('L I K E  M T', 80, 21);
    return new THREE.CanvasTexture(c);
  }

  createShowroom208PlateTexture() {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 80;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#d1d5db';
    ctx.fillRect(0, 0, 256, 80);
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, 252, 76);
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 42px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('208', 128, 42);
    return new THREE.CanvasTexture(c);
  }

  /**
   * Two-Tone 5-Spoke Geometric Alloy/Cover Design (Images 1 & 2)
   */
  createPeugeotWheelTexture() {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 256;
    const ctx = c.getContext('2d');
    const cx = 128, cy = 128;

    ctx.fillStyle = '#0b0d12';
    ctx.beginPath();
    ctx.arc(cx, cy, 126, 0, Math.PI * 2);
    ctx.fill();

    // Outer machined lip
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(cx, cy, 118, 0, Math.PI * 2);
    ctx.stroke();

    // 5 Bright Machined Silver Geometric Y-Spokes over Gloss Black (Images 1 & 2!)
    for (let i = 0; i < 5; i++) {
      const ang = (i * Math.PI * 2) / 5 - Math.PI / 2;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(ang);

      // Dark inner spoke spine
      ctx.fillStyle = '#1f2430';
      ctx.beginPath();
      ctx.moveTo(-14, 22);
      ctx.lineTo(-22, 112);
      ctx.lineTo(22, 112);
      ctx.lineTo(14, 22);
      ctx.closePath();
      ctx.fill();

      // Bright silver diamond-cut outer Y-blades
      ctx.fillStyle = '#e2e8f0';
      ctx.beginPath();
      ctx.moveTo(-9, 32);
      ctx.lineTo(-24, 110);
      ctx.lineTo(-10, 110);
      ctx.lineTo(-2, 42);
      ctx.closePath();
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(9, 32);
      ctx.lineTo(24, 110);
      ctx.lineTo(10, 110);
      ctx.lineTo(2, 42);
      ctx.closePath();
      ctx.fill();

      ctx.restore();
    }

    // Center Peugeot Lion Cap
    ctx.fillStyle = '#12151c';
    ctx.beginPath();
    ctx.arc(cx, cy, 26, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 11px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('208', cx, cy + 1);

    return new THREE.CanvasTexture(c);
  }

  createCarbonWeaveTexture() {
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 64;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#1b1f27';
    ctx.fillRect(0, 0, 64, 64);
    ctx.fillStyle = '#252a35';
    for (let y = 0; y < 64; y += 8) {
      for (let x = 0; x < 64; x += 8) {
        if ((x + y) % 16 === 0) ctx.fillRect(x, y, 4, 4);
      }
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(16, 2);
    return tex;
  }

  createPeugeotSeatFabricTexture() {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 256;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#161920';
    ctx.fillRect(0, 0, 256, 256);

    ctx.fillStyle = '#333b48';
    ctx.fillRect(0, 0, 40, 256);
    ctx.fillRect(216, 0, 40, 256);

    // Crisp white contrast stitching along bolsters (Image 3)
    ctx.strokeStyle = '#cbd5e1';
    ctx.setLineDash([6, 4]);
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(42, 0); ctx.lineTo(42, 256);
    ctx.moveTo(214, 0); ctx.lineTo(214, 256);
    ctx.stroke();
    return new THREE.CanvasTexture(c);
  }

  createPeugeotSideVentTexture() {
    const c = document.createElement('canvas');
    c.width = 160;
    c.height = 100;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#14171f';
    ctx.fillRect(0, 0, 160, 100);
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 3;
    ctx.strokeRect(10, 10, 140, 80);
    ctx.fillStyle = '#090b10';
    ctx.fillRect(14, 14, 132, 72);
    // Horizontal chrome trim bar across vent (Image 3)
    ctx.fillStyle = '#cbd5e1';
    ctx.fillRect(14, 44, 132, 10);
    return new THREE.CanvasTexture(c);
  }

  createPeugeotCenterVentsTexture() {
    const c = document.createElement('canvas');
    c.width = 320;
    c.height = 80;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#11141c';
    ctx.fillRect(0, 0, 320, 80);
    [12, 172].forEach(vx => {
      ctx.fillStyle = '#07090e';
      ctx.fillRect(vx, 10, 136, 60);
      ctx.strokeStyle = '#2d3340';
      ctx.lineWidth = 2;
      for (let sy = 22; sy <= 58; sy += 12) {
        ctx.beginPath();
        ctx.moveTo(vx + 4, sy);
        ctx.lineTo(vx + 132, sy);
        ctx.stroke();
      }
      ctx.fillStyle = '#e2e8f0';
      ctx.fillRect(vx + 62, 34, 14, 12);
    });
    return new THREE.CanvasTexture(c);
  }

  createPeugeotWheelButtonsTexture() {
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 72;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#0d1017';
    ctx.fillRect(0, 0, 128, 72);
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 4;
    ctx.strokeRect(3, 3, 122, 66);
    ctx.fillStyle = '#cbd5e1';
    ctx.fillRect(56, 10, 16, 52);
    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 13px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('▲', 28, 28);
    ctx.fillText('▼', 28, 54);
    ctx.fillText('📞', 100, 28);
    ctx.fillText('🔊', 100, 54);
    return new THREE.CanvasTexture(c);
  }

  createShiftKnobHPatternTexture() {
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 128;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#11141c';
    ctx.beginPath();
    ctx.arc(64, 64, 62, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(64, 64, 55, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = '#f8fafc';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(28, 64); ctx.lineTo(100, 64);
    ctx.moveTo(32, 38); ctx.lineTo(32, 90);
    ctx.moveTo(64, 38); ctx.lineTo(64, 90);
    ctx.moveTo(96, 38); ctx.lineTo(96, 90);
    ctx.stroke();

    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 16px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('1', 32, 31);
    ctx.fillText('2', 32, 106);
    ctx.fillText('3', 64, 31);
    ctx.fillText('4', 64, 106);
    ctx.fillText('5', 96, 31);
    ctx.fillText('R', 96, 106);
    return new THREE.CanvasTexture(c);
  }

  createRearDefrosterGlassTexture() {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 128;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#0d1522';
    ctx.fillRect(0, 0, 256, 128);
    ctx.strokeStyle = 'rgba(217, 119, 6, 0.35)';
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
  }

  /**
   * Renders the Photo-Accurate Peugeot i-Cockpit Displays (Reference Images 4 & 5):
   * 1. Raised Cluster: Left Clockwise Speedometer (0..250 km/h) + Left Temp Bar |
   *    Center Peugeot Lion Shield + Digital Speed/Gear |
   *    Right Counter-Clockwise Tachometer (0..7 x1000 tr/min) + Right Fuel Bar
   * 2. Floating 10" Wide-Screen Infotainment UI from Image 5
   */
  updateCockpitDisplays(speedKmh, rpm, gearStr, cornerName, lapTimeStr) {
    if (!this.dashCtx) return;
    const ctx = this.dashCtx;
    const W = 640, H = 250;

    ctx.fillStyle = '#080a0f';
    ctx.fillRect(0, 0, W, H);

    // ------------------------------------------------------------------------
    // 1. LEFT DIAL: CLOCKWISE SPEEDOMETER (0..250 km/h) — Image 4 Exact Spec
    // ------------------------------------------------------------------------
    const drawSpeedo = (cx, cy, r) => {
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = '#0d1017';
      ctx.fill();

      // Chrome bottom crescent trim (Image 4)
      ctx.beginPath();
      ctx.arc(cx, cy, r + 2, Math.PI * 0.22, Math.PI * 0.78);
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 3.5;
      ctx.stroke();

      const startAng = Math.PI * 0.72;
      const endAng = Math.PI * 2.28;
      const totalSpan = endAng - startAng;

      // Speedometer numbers matching Image 4: 0, 20, 40, 60, 80, 100, 120, 140, 160, 180, 200, 250
      const marks = [0, 20, 40, 60, 80, 100, 120, 140, 160, 180, 200, 250];
      for (let i = 0; i <= 44; i++) {
        const frac = i / 44;
        const ang = startAng + frac * totalSpan;
        const isMaj = i % 4 === 0;
        ctx.strokeStyle = '#f8fafc';
        ctx.lineWidth = isMaj ? 2.4 : 1.1;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(ang) * (isMaj ? r - 12 : r - 6), cy + Math.sin(ang) * (isMaj ? r - 12 : r - 6));
        ctx.lineTo(cx + Math.cos(ang) * (r - 2), cy + Math.sin(ang) * (r - 2));
        ctx.stroke();
      }

      for (let m = 0; m < marks.length; m++) {
        const frac = m / (marks.length - 1);
        const ang = startAng + frac * totalSpan;
        const tx = cx + Math.cos(ang) * (r - 25);
        const ty = cy + Math.sin(ang) * (r - 25);
        ctx.fillStyle = '#f8fafc';
        ctx.font = 'bold 12px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(marks[m]), tx, ty);
      }

      ctx.fillStyle = '#cbd5e1';
      ctx.font = 'bold 9px Arial';
      ctx.fillText('km/h', cx - 32, cy + 44);

      // Map speedKmh nonlinearly onto Image 4 scale (0..200 uniform, 200..250 final tick)
      const valNorm = speedKmh <= 200
        ? (speedKmh / 200) * (10 / 11)
        : (10 / 11) + ((speedKmh - 200) / 50) * (1 / 11);
      const needleAng = startAng + Math.min(1, Math.max(0, valNorm)) * totalSpan;

      ctx.strokeStyle = '#ff1e27';
      ctx.shadowColor = '#ff1e27';
      ctx.shadowBlur = 7;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(cx - Math.cos(needleAng) * 10, cy - Math.sin(needleAng) * 10);
      ctx.lineTo(cx + Math.cos(needleAng) * (r - 8), cy + Math.sin(needleAng) * (r - 8));
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(cx, cy, 10, 0, Math.PI * 2);
      ctx.fillStyle = '#181c24';
      ctx.fill();
      ctx.restore();
    };

    // ------------------------------------------------------------------------
    // 2. RIGHT DIAL: COUNTER-CLOCKWISE TACHOMETER (0..7 x1000) — Image 4!
    //    0 starts at bottom-right and sweeps COUNTER-CLOCKWISE up & over to 7!
    // ------------------------------------------------------------------------
    const drawCounterClockwiseTach = (cx, cy, r) => {
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = '#0d1017';
      ctx.fill();

      // Chrome bottom crescent trim (Image 4)
      ctx.beginPath();
      ctx.arc(cx, cy, r + 2, Math.PI * 0.22, Math.PI * 0.78);
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 3.5;
      ctx.stroke();

      // Start at bottom-right (0.28 * PI) and sweep counter-clockwise to bottom-left (-1.28 * PI)
      const startAng = Math.PI * 0.28;
      const totalSpan = Math.PI * 1.56;

      for (let i = 0; i <= 35; i++) {
        const frac = i / 35;
        const ang = startAng - frac * totalSpan;
        const isMaj = i % 5 === 0;
        const isRed = frac >= 6.0 / 7.0;
        ctx.strokeStyle = isRed ? '#ef4444' : '#f8fafc';
        ctx.lineWidth = isMaj ? 2.4 : 1.1;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(ang) * (isMaj ? r - 12 : r - 6), cy + Math.sin(ang) * (isMaj ? r - 12 : r - 6));
        ctx.lineTo(cx + Math.cos(ang) * (r - 2), cy + Math.sin(ang) * (r - 2));
        ctx.stroke();
      }

      for (let m = 0; m <= 7; m++) {
        const frac = m / 7;
        const ang = startAng - frac * totalSpan;
        const tx = cx + Math.cos(ang) * (r - 25);
        const ty = cy + Math.sin(ang) * (r - 25);
        ctx.fillStyle = m >= 6 ? '#ef4444' : '#f8fafc';
        ctx.font = 'bold 14px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(m), tx, ty);
      }

      ctx.fillStyle = '#cbd5e1';
      ctx.font = 'bold 9px Arial';
      ctx.fillText('tr/min', cx + 32, cy + 32);
      ctx.fillText('x1000', cx + 32, cy + 43);

      const rpmNorm = Math.min(1, Math.max(0, (rpm / 1000) / 7));
      const needleAng = startAng - rpmNorm * totalSpan;

      ctx.strokeStyle = '#ff1e27';
      ctx.shadowColor = '#ff1e27';
      ctx.shadowBlur = 7;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(cx - Math.cos(needleAng) * 10, cy - Math.sin(needleAng) * 10);
      ctx.lineTo(cx + Math.cos(needleAng) * (r - 8), cy + Math.sin(needleAng) * (r - 8));
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(cx, cy, 10, 0, Math.PI * 2);
      ctx.fillStyle = '#181c24';
      ctx.fill();
      ctx.restore();
    };

    // Far-Left Vertical Coolant Temp Bar (Image 4: 50 .. 90 .. 130 °C)
    ctx.fillStyle = '#94a3b8';
    ctx.font = 'bold 10px Arial';
    ctx.textAlign = 'left';
    ctx.fillText('°C', 14, 88);
    ctx.fillText('130', 12, 102);
    ctx.fillText('90', 14, 134);
    ctx.fillText('50', 14, 166);
    for (let t = 0; t < 6; t++) {
      ctx.fillStyle = t < 3 ? '#f8fafc' : '#334155';
      ctx.fillRect(36, 158 - t * 11, 10, 6);
    }

    drawSpeedo(146, 128, 92);
    drawCounterClockwiseTach(494, 128, 92);

    // Far-Right Vertical Fuel Bar (Image 4: 1 .. 1/2 .. 0)
    ctx.fillStyle = '#94a3b8';
    ctx.font = 'bold 10px Arial';
    ctx.textAlign = 'right';
    ctx.fillText('⛽', 626, 88);
    ctx.fillText('1', 624, 102);
    ctx.fillText('1/2', 628, 134);
    ctx.fillText('0', 624, 166);
    for (let f = 0; f < 6; f++) {
      ctx.fillStyle = f < 5 ? '#f8fafc' : '#334155';
      ctx.fillRect(594, 158 - f * 11, 10, 6);
    }

    // Center Dark Navy/Black Peugeot LCD Screen (Image 4)
    const lx = 262, ly = 42, lw = 116, lh = 166;
    ctx.fillStyle = '#0c182c';
    ctx.fillRect(lx, ly, lw, lh);
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(lx, ly, lw, lh);

    // Mini Peugeot Shield Crest at top of Center LCD
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 2;
    ctx.strokeRect(lx + 44, ly + 10, 28, 28);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 9px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('PEUGEOT', lx + lw / 2, ly + 26);

    // Live Digital Speed & Gear in Center LCD
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 34px monospace';
    ctx.fillText(`${Math.round(speedKmh)}`, lx + lw / 2, ly + 82);
    ctx.fillStyle = '#93c5fd';
    ctx.font = 'bold 11px Arial';
    ctx.fillText(`km/h   |   M${gearStr}`, lx + lw / 2, ly + 106);

    ctx.fillStyle = '#cbd5e1';
    ctx.font = '11px monospace';
    ctx.fillText(lapTimeStr || '00:00.0', lx + lw / 2, ly + 128);

    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.beginPath();
    ctx.moveTo(lx + 10, ly + 138);
    ctx.lineTo(lx + lw - 10, ly + 138);
    ctx.stroke();

    ctx.fillStyle = '#f8fafc';
    ctx.font = '12px Arial';
    ctx.fillText('31 km', lx + lw / 2, ly + 156);

    this.dashTexture.needsUpdate = true;

    // ------------------------------------------------------------------------
    // 3. FLOATING 10" INFOTAINMENT UI (Image 5 Exact Minimalist Dark Spec!)
    // ------------------------------------------------------------------------
    if (this.infoCtx) {
      const ic = this.infoCtx;
      ic.fillStyle = '#0b0d12';
      ic.fillRect(0, 0, 560, 280);

      // Left vertical capacitive touch strip (⏻, +, volume line, -, ▢)
      ic.fillStyle = '#12151c';
      ic.fillRect(0, 0, 54, 280);
      ic.fillStyle = '#cbd5e1';
      ic.font = 'bold 18px Arial';
      ic.textAlign = 'center';
      ic.fillText('⏻', 27, 34);
      ic.fillText('+', 27, 94);
      ic.fillRect(26, 108, 2, 56);
      ic.fillRect(19, 134, 16, 3);
      ic.fillText('−', 27, 192);
      ic.fillText('▢', 27, 250);

      // Right vertical capacitive touch bar (active white tile, circle, settings gear)
      ic.fillStyle = '#12151c';
      ic.fillRect(500, 0, 60, 280);
      ic.fillStyle = '#cbd5e1';
      ic.fillRect(508, 48, 44, 52);
      ic.fillStyle = '#0b0d12';
      ic.font = 'bold 16px Arial';
      ic.fillText('•', 530, 80);
      ic.fillStyle = '#cbd5e1';
      ic.font = '20px Arial';
      ic.fillText('○', 530, 152);
      ic.fillText('⚙', 530, 224);

      // Top Status Bar (Signal bars, clock 10:02, pin)
      ic.fillStyle = '#94a3b8';
      ic.font = 'bold 13px Arial';
      ic.textAlign = 'left';
      ic.fillText('📶  208 LIKE MT', 68, 26);
      ic.textAlign = 'right';
      ic.fillText('10:02  📍', 488, 26);

      // Minimalist 2x4 White Line-Art Icon Grid (Image 5!)
      const gridItems = [
        { ico: '📻', lbl: 'Radio', x: 118, y: 102 },
        { ico: '📞', lbl: 'Phone', x: 222, y: 102 },
        { ico: '▲',  lbl: 'Android Auto', x: 326, y: 102 },
        { ico: '▶',  lbl: 'CarPlay', x: 430, y: 102 },
        { ico: '📱', lbl: 'iPod', x: 118, y: 204 },
        { ico: '🔌', lbl: 'USB', x: 222, y: 204 },
        { ico: 'ᛒ',  lbl: 'Bluetooth', x: 326, y: 204 },
        { ico: '🏁', lbl: cornerName ? cornerName.slice(0, 12) : 'El Gálvez', x: 430, y: 204 }
      ];

      gridItems.forEach(g => {
        ic.fillStyle = '#f8fafc';
        ic.font = '26px Arial';
        ic.textAlign = 'center';
        ic.fillText(g.ico, g.x, g.y);
        ic.fillStyle = '#cbd5e1';
        ic.font = '13px sans-serif';
        ic.fillText(g.lbl, g.x, g.y + 30);
      });

      this.infoTexture.needsUpdate = true;
    }

    // Rearview Mirror Canvas
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

    const spinDelta = (physicsState.speed / 0.315) * dt;
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
      if (g === -1) { gx = -0.14; gz = -0.15; }
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
      [-0.80, 0.80].forEach(lat => {
        const wx = physicsState.x - sinH * 1.26 + cosH * lat;
        const wz = physicsState.z - cosH * 1.26 - sinH * lat;
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

window.Peugeot208Car = Peugeot208Car;

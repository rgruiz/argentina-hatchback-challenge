/**
 * Autódromo Oscar y Juan Gálvez (Buenos Aires) 3D Track Builder
 * Supports Circuito N° 12 (Salotto + Ascari) and Circuito N° 8 (Confitería + Ombú + Tobogán)
 */
class BuenosAiresTrack {
  constructor(scene) {
    this.scene = scene;
    this.trackGroup = new THREE.Group();
    this.scene.add(this.trackGroup);

    this.roadWidth = 15.0; // Generous arcade width for racing & drifting
    this.curbWidth = 1.65;
    this.samples = [];
    this.curve = null;
    this.totalLength = 0;
    this.currentLayout = '12';
    this.sections = [];
    this.timeOfDay = 'day';
    this.emissiveCityMaterials = [];
    this.floodlightLampMaterials = [];
  }

  seededRandom(seed) {
    let s = (seed * 9301 + 49297) % 233280;
    if (s < 0) s += 233280;
    return s / 233280;
  }

  isClearOfTrack(x, z, minClearance) {
    const minSq = minClearance * minClearance;
    const samples = this.samples;
    for (let i = 0; i < samples.length; i += 2) {
      const p = samples[i].point;
      const dx = x - p.x;
      const dz = z - p.z;
      if (dx * dx + dz * dz < minSq) return false;
    }
    return true;
  }

  setTimeOfDay(preset) {
    this.timeOfDay = preset || 'day';
    let winIntensity = 0.08;
    let lampIntensity = 0.35;
    if (this.timeOfDay === 'sunset') {
      winIntensity = 0.45;
      lampIntensity = 0.85;
    } else if (this.timeOfDay === 'dusk') {
      winIntensity = 1.05;
      lampIntensity = 1.5;
    }
    for (const mat of this.emissiveCityMaterials) {
      if (mat) {
        mat.emissiveIntensity = winIntensity;
      }
    }
    for (const mat of this.floodlightLampMaterials) {
      if (mat) {
        mat.emissiveIntensity = lampIntensity;
      }
    }
  }

  build(layoutId = '12') {
    this.currentLayout = String(layoutId);
    this.emissiveCityMaterials = [];
    this.floodlightLampMaterials = [];

    // Clear previous track meshes
    while (this.trackGroup.children.length > 0) {
      const child = this.trackGroup.children[0];
      this.trackGroup.remove(child);
    }

    const waypoints = this.getLayoutWaypoints(this.currentLayout);
    const points3D = waypoints.map(p => new THREE.Vector3(p.x, p.y || 0, p.z));

    this.curve = new THREE.CatmullRomCurve3(points3D, true, 'centripetal', 0.35);
    this.totalLength = this.curve.getLength();

    // Sample dense points along the closed loop for rendering & physics queries
    const numSamples = 720;
    this.samples = [];

    for (let i = 0; i < numSamples; i++) {
      const t = i / numSamples;
      const point = this.curve.getPointAt(t);
      point.y = 0; // Keep track flush with the Autódromo ground plane so it never sinks beneath the grass
      const tangent = this.curve.getTangentAt(t);
      tangent.y = 0;
      tangent.normalize();
      // Right vector on XZ plane: (-tangent.z, 0, tangent.x)
      const right = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();

      // Compute curvature to know where corners & curbs are
      const tPrev = (i - 3 + numSamples) % numSamples / numSamples;
      const tNext = (i + 3) % numSamples / numSamples;
      const tanPrev = this.curve.getTangentAt(tPrev);
      const tanNext = this.curve.getTangentAt(tNext);
      const crossY = tanPrev.x * tanNext.z - tanPrev.z * tanNext.x;
      const curvature = crossY; // sign indicates left vs right turn

      this.samples.push({
        index: i,
        t,
        point,
        tangent,
        right,
        curvature
      });
    }

    this.defineCornerSections(this.currentLayout);
    this.createGroundAndSkyAccents();
    this.createRoadAndCurbs();
    this.createStartFinishAndGrid();
    this.createBuenosAiresLandmarks();
    this.createCornerSignsAndTrees();
    this.createTorreEspacial();
    this.createBuenosAiresHorizon();
    this.setTimeOfDay(this.timeOfDay);
  }

  getLayoutWaypoints(layoutId) {
    if (layoutId === '8') {
      // CIRCUITO N° 8: Recta Principal -> Reutemann -> Confitería -> Ombú -> Tobogán -> Ascari -> Horquilla
      return [
        // Recta Principal (heading +Z from z=-140 to z=+140 at x=-120)
        { x: -120, z: -60, y: 0 },
        { x: -120, z: 20, y: 0 },
        { x: -120, z: 105, y: 0 },
        // Curva 1 (Carlos Reutemann) & Confitería (right-hand sweep into infield)
        { x: -102, z: 165, y: 0 },
        { x: -45,  z: 185, y: 0 },
        { x: 10,   z: 155, y: 0 },
        // Curva del Ombú (left-hand bend around the iconic Ombú tree)
        { x: 15,   z: 95,  y: 0 },
        { x: 55,   z: 65,  y: 0 },
        // El Tobogán (technical S-curve)
        { x: 95,   z: 90,  y: 0 },
        { x: 135,  z: 55,  y: 0 },
        { x: 115,  z: -5,  y: 0 },
        // Back stretch into Chicana de Ascari
        { x: 130,  z: -75, y: 0 },
        { x: 115,  z: -135, y: 0 },
        // Entrada a la Horquilla
        { x: 55,   z: -195, y: 0 },
        { x: -20,  z: -225, y: 0 },
        // La Horquilla (Curva Parga - tight hairpin back onto Recta Principal)
        { x: -92,  z: -235, y: 0 },
        { x: -122, z: -195, y: 0 },
        { x: -120, z: -130, y: 0 }
      ];
    }

    // Default: CIRCUITO N° 12 (El Clásico Veloz: Recta Principal -> S del Ciervo -> Lago -> Curvón Salotto -> Ascari -> Horquilla)
    return [
      // Recta Principal (x = -120, heading +Z)
      { x: -120, z: -60,  y: 0 },
      { x: -120, z: 30,   y: 0 },
      { x: -120, z: 120,  y: 0 },
      // S del Ciervo (fast left-right chicane entering the lake perimeter)
      { x: -132, z: 175,  y: 0 },
      { x: -102, z: 215,  y: 0 },
      // Recta del Lago (flat-out along Lago de Regatas)
      { x: -75,  z: 295,  y: 0 },
      { x: -45,  z: 380,  y: 0 },
      // Curvón Salotto (legendary 180-degree sweeping high-speed turn around the lake)
      { x: 10,   z: 445,  y: 0 },
      { x: 90,   z: 455,  y: 0 },
      { x: 155,  z: 405,  y: 0 },
      { x: 175,  z: 320,  y: 0 },
      // Recta Opuesta (fast return straight)
      { x: 165,  z: 195,  y: 0 },
      { x: 150,  z: 75,   y: 0 },
      // Chicana de Ascari (heavy braking right-left-right chicane)
      { x: 142,  z: -10,  y: 0 },
      { x: 118,  z: -42,  y: 0 },
      { x: 136,  z: -78,  y: 0 },
      // Rumbo a la Horquilla
      { x: 90,   z: -155, y: 0 },
      { x: 10,   z: -215, y: 0 },
      // La Horquilla (Curva Parga hairpin)
      { x: -85,  z: -240, y: 0 },
      { x: -122, z: -200, y: 0 },
      { x: -120, z: -135, y: 0 }
    ];
  }

  defineCornerSections(layoutId) {
    if (layoutId === '8') {
      this.sections = [
        { start: 0.00, end: 0.14, name: 'RECTA PRINCIPAL' },
        { start: 0.14, end: 0.24, name: 'CURVA 1 — REUTEMANN' },
        { start: 0.24, end: 0.35, name: 'CURVA DE LA CONFITERÍA' },
        { start: 0.35, end: 0.47, name: 'CURVA DEL OMBÚ' },
        { start: 0.47, end: 0.64, name: 'EL TOBOGÁN' },
        { start: 0.64, end: 0.78, name: 'RECTA OPUESTA / ASCARI' },
        { start: 0.78, end: 0.92, name: 'LA HORQUILLA (PARGA)' },
        { start: 0.92, end: 1.00, name: 'RECTA PRINCIPAL' }
      ];
    } else {
      this.sections = [
        { start: 0.00, end: 0.13, name: 'RECTA PRINCIPAL' },
        { start: 0.13, end: 0.22, name: 'S DEL CIERVO' },
        { start: 0.22, end: 0.36, name: 'RECTA DEL LAGO' },
        { start: 0.36, end: 0.54, name: 'CURVÓN SALOTTO' },
        { start: 0.54, end: 0.67, name: 'RECTA OPUESTA' },
        { start: 0.67, end: 0.77, name: 'CHICANA DE ASCARI' },
        { start: 0.77, end: 0.92, name: 'LA HORQUILLA (PARGA)' },
        { start: 0.92, end: 1.00, name: 'RECTA PRINCIPAL' }
      ];
    }
  }

  getCornerName(t) {
    for (const s of this.sections) {
      if (t >= s.start && t <= s.end) return s.name;
    }
    return 'RECTA PRINCIPAL';
  }

  createAsphaltTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#2b2f36';
    ctx.fillRect(0, 0, 512, 512);

    // Asphalt grain noise
    for (let i = 0; i < 18000; i++) {
      const x = Math.random() * 512;
      const y = Math.random() * 512;
      const v = 34 + Math.floor(Math.random() * 26);
      ctx.fillStyle = `rgb(${v},${v + 2},${v + 5})`;
      ctx.fillRect(x, y, 2, 2);
    }

    // Subtle darker rubbered-in racing groove in the center
    const grad = ctx.createLinearGradient(0, 0, 512, 0);
    grad.addColorStop(0.0, 'rgba(0,0,0,0)');
    grad.addColorStop(0.25, 'rgba(10,12,15,0.22)');
    grad.addColorStop(0.5, 'rgba(10,12,15,0.35)');
    grad.addColorStop(0.75, 'rgba(10,12,15,0.22)');
    grad.addColorStop(1.0, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 512);

    // Crisp white track edge lines
    ctx.fillStyle = '#e2e8f0';
    ctx.fillRect(10, 0, 10, 512);
    ctx.fillRect(492, 0, 10, 512);

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(1, 110);
    tex.anisotropy = 8;
    return tex;
  }

  createGrassTexture(repeatCount = 130) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#2d5a27';
    ctx.fillRect(0, 0, 256, 256);

    // Mowed stripes & turf texture
    ctx.fillStyle = '#33642c';
    ctx.fillRect(0, 0, 128, 256);

    for (let i = 0; i < 6000; i++) {
      const x = Math.random() * 256;
      const y = Math.random() * 256;
      ctx.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.06)';
      ctx.fillRect(x, y, 2, 2);
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeatCount, repeatCount);
    return tex;
  }

  createGroundAndSkyAccents() {
    // Broad South Buenos Aires base terrain plane (extends cleanly under 360-deg horizon)
    const outerGrassTex = this.createGrassTexture(130);
    const groundGeo = new THREE.PlaneGeometry(3400, 3400);
    const groundMat = new THREE.MeshLambertMaterial({ map: outerGrassTex });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, -0.55, 80);
    ground.receiveShadow = true;
    this.trackGroup.add(ground);

    // Expansive flat Autódromo parkland apron at y = -0.06 under circuit, Torre Espacial & horizon
    const apronTex = this.createGrassTexture(95);
    const apronGeo = new THREE.PlaneGeometry(2100, 2100);
    const apronMat = new THREE.MeshLambertMaterial({ map: apronTex });
    const apron = new THREE.Mesh(apronGeo, apronMat);
    apron.rotation.x = -Math.PI / 2;
    apron.position.set(20, -0.06, 80);
    this.trackGroup.add(apron);
  }

  createRoadAndCurbs() {
    const N = this.samples.length;
    const halfW = this.roadWidth * 0.5;
    const curbW = this.curbWidth;

    const roadPositions = [];
    const roadUVs = [];
    const roadIndices = [];

    const curbPositions = [];
    const curbColors = [];
    const curbIndices = [];
    let curbVertCount = 0;

    // Outer safety guardrail mesh
    const wallDist = halfW + curbW + 5.5;
    const wallHeight = 1.15;
    const wallPositions = [];
    const wallColors = [];
    const wallIndices = [];

    for (let i = 0; i <= N; i++) {
      const s = this.samples[i % N];
      const vCoord = i / N;

      const leftPt = s.point.clone().addScaledVector(s.right, -halfW);
      const rightPt = s.point.clone().addScaledVector(s.right, halfW);

      roadPositions.push(leftPt.x, leftPt.y + 0.02, leftPt.z);
      roadPositions.push(rightPt.x, rightPt.y + 0.02, rightPt.z);

      roadUVs.push(0, vCoord);
      roadUVs.push(1, vCoord);

      if (i < N) {
        const base = i * 2;
        roadIndices.push(base, base + 1, base + 2);
        roadIndices.push(base + 1, base + 3, base + 2);
      }

      // Outer & Inner Perimeter Guardrails (painted classic Autódromo Red/White & Blue/White)
      const wl = s.point.clone().addScaledVector(s.right, -wallDist);
      const wr = s.point.clone().addScaledVector(s.right, wallDist);

      wallPositions.push(wl.x, wl.y, wl.z);
      wallPositions.push(wl.x, wl.y + wallHeight, wl.z);
      wallPositions.push(wr.x, wr.y, wr.z);
      wallPositions.push(wr.x, wr.y + wallHeight, wr.z);

      const stripe = Math.floor(i / 3) % 2 === 0;
      const c1 = stripe ? [0.92, 0.95, 0.98] : [0.08, 0.38, 0.72]; // Argentine Blue & White barriers
      for (let k = 0; k < 4; k++) {
        wallColors.push(c1[0], c1[1], c1[2]);
      }

      if (i < N) {
        const wb = i * 4;
        // Left barrier face
        wallIndices.push(wb, wb + 4, wb + 1);
        wallIndices.push(wb + 1, wb + 4, wb + 5);
        // Right barrier face
        wallIndices.push(wb + 2, wb + 3, wb + 6);
        wallIndices.push(wb + 3, wb + 7, wb + 6);
      }
    }

    // Build Road Mesh
    const roadGeo = new THREE.BufferGeometry();
    roadGeo.setAttribute('position', new THREE.Float32BufferAttribute(roadPositions, 3));
    roadGeo.setAttribute('uv', new THREE.Float32BufferAttribute(roadUVs, 2));
    roadGeo.setIndex(roadIndices);
    roadGeo.computeVertexNormals();

    const roadMat = new THREE.MeshLambertMaterial({
      map: this.createAsphaltTexture()
    });
    const roadMesh = new THREE.Mesh(roadGeo, roadMat);
    this.trackGroup.add(roadMesh);

    // Build Guardrail Mesh
    const wallGeo = new THREE.BufferGeometry();
    wallGeo.setAttribute('position', new THREE.Float32BufferAttribute(wallPositions, 3));
    wallGeo.setAttribute('color', new THREE.Float32BufferAttribute(wallColors, 3));
    wallGeo.setIndex(wallIndices);
    wallGeo.computeVertexNormals();

    const wallMat = new THREE.MeshLambertMaterial({
      vertexColors: true,
      side: THREE.DoubleSide
    });
    this.trackGroup.add(new THREE.Mesh(wallGeo, wallMat));

    // Build Raised 3D Curbs (Pianitos) along all corners and chicanes
    for (let i = 0; i < N; i++) {
      const s0 = this.samples[i];
      const s1 = this.samples[(i + 1) % N];

      // Place curbs wherever there is curvature or near corner entry/exit
      const isCorner = Math.abs(s0.curvature) > 0.008;
      if (!isCorner) continue;

      const isEvenBlock = Math.floor(i / 2) % 2 === 0;
      // Alternating Red/White and Argentine Blue/White curbs
      const color = isEvenBlock
        ? [0.96, 0.96, 0.98]
        : (i % 8 < 4 ? [0.88, 0.14, 0.16] : [0.05, 0.48, 0.85]);

      // Put curbs on both left and right sides of the corner
      [-1, 1].forEach(side => {
        const innerDist = halfW - 0.1;
        const outerDist = halfW + curbW;

        const p0In = s0.point.clone().addScaledVector(s0.right, side * innerDist);
        const p0Out = s0.point.clone().addScaledVector(s0.right, side * outerDist);
        const p1In = s1.point.clone().addScaledVector(s1.right, side * innerDist);
        const p1Out = s1.point.clone().addScaledVector(s1.right, side * outerDist);

        curbPositions.push(
          p0In.x, p0In.y + 0.03, p0In.z,
          p0Out.x, p0Out.y + 0.11, p0Out.z,
          p1In.x, p1In.y + 0.03, p1In.z,
          p1Out.x, p1Out.y + 0.11, p1Out.z
        );

        for (let c = 0; c < 4; c++) {
          curbColors.push(color[0], color[1], color[2]);
        }

        curbIndices.push(
          curbVertCount, curbVertCount + 1, curbVertCount + 2,
          curbVertCount + 1, curbVertCount + 3, curbVertCount + 2
        );
        curbVertCount += 4;
      });
    }

    const curbGeo = new THREE.BufferGeometry();
    curbGeo.setAttribute('position', new THREE.Float32BufferAttribute(curbPositions, 3));
    curbGeo.setAttribute('color', new THREE.Float32BufferAttribute(curbColors, 3));
    curbGeo.setIndex(curbIndices);
    curbGeo.computeVertexNormals();

    const curbMat = new THREE.MeshLambertMaterial({
      vertexColors: true,
      side: THREE.DoubleSide
    });
    this.trackGroup.add(new THREE.Mesh(curbGeo, curbMat));
  }

  createStartFinishAndGrid() {
    const startSample = this.samples[0];
    const pos = startSample.point;
    const tan = startSample.tangent;
    const angle = Math.atan2(tan.x, tan.z);

    // Checkerboard Start/Finish Line on Asphalt
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    const sq = 16;
    for (let y = 0; y < 64; y += sq) {
      for (let x = 0; x < 256; x += sq) {
        ctx.fillStyle = ((x / sq + y / sq) % 2 === 0) ? '#ffffff' : '#111827';
        ctx.fillRect(x, y, sq, sq);
      }
    }
    const lineTex = new THREE.CanvasTexture(canvas);
    const linePlane = new THREE.Mesh(
      new THREE.PlaneGeometry(this.roadWidth - 0.6, 3.2),
      new THREE.MeshBasicMaterial({ map: lineTex })
    );
    linePlane.rotation.x = -Math.PI / 2;
    linePlane.rotation.z = angle;
    linePlane.position.set(pos.x, pos.y + 0.04, pos.z);
    this.trackGroup.add(linePlane);

    // 4 Staggered White Starting Grid U-Boxes behind Start/Finish Line
    const gridCanvas = document.createElement('canvas');
    gridCanvas.width = 128;
    gridCanvas.height = 256;
    const gCtx = gridCanvas.getContext('2d');
    gCtx.clearRect(0, 0, 128, 256);
    gCtx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    // Bottom of canvas (+Y_uv = +tangent front in child plane) gets front stop line; sides extend toward rear
    gCtx.fillRect(8, 232, 112, 16);
    gCtx.fillRect(8, 20, 14, 228);
    gCtx.fillRect(106, 20, 14, 228);

    const gridTex = new THREE.CanvasTexture(gridCanvas);
    const gridMat = new THREE.MeshBasicMaterial({ map: gridTex, transparent: true });
    const gridGeo = new THREE.PlaneGeometry(2.4, 4.6);
    const N = this.samples.length;

    for (let slot = 0; slot < 4; slot++) {
      const idx = (N - 3 - slot * 3) % N;
      const gSample = this.samples[idx];
      const lat = (slot % 2 === 0) ? 2.6 : -2.6;
      const gAngle = Math.atan2(gSample.tangent.x, gSample.tangent.z);

      const boxGroup = new THREE.Group();
      boxGroup.position.set(
        gSample.point.x + gSample.right.x * lat,
        gSample.point.y + 0.035,
        gSample.point.z + gSample.right.z * lat
      );
      boxGroup.rotation.y = gAngle;

      const boxPlane = new THREE.Mesh(gridGeo, gridMat);
      boxPlane.rotation.x = -Math.PI / 2;
      boxGroup.add(boxPlane);
      this.trackGroup.add(boxGroup);
    }

    // Overhead Start/Finish Gantry Bridge ("AUTÓDROMO DE BUENOS AIRES - VW POLO TRACK")
    const gantryGroup = new THREE.Group();
    gantryGroup.position.set(pos.x, pos.y, pos.z);
    gantryGroup.rotation.y = angle;

    const pillarGeo = new THREE.BoxGeometry(1.1, 8.5, 1.1);
    const pillarMat = new THREE.MeshLambertMaterial({ color: 0x001e50 });

    const leftPillar = new THREE.Mesh(pillarGeo, pillarMat);
    leftPillar.position.set(-this.roadWidth * 0.65, 4.25, 0);
    gantryGroup.add(leftPillar);

    const rightPillar = new THREE.Mesh(pillarGeo, pillarMat);
    rightPillar.position.set(this.roadWidth * 0.65, 4.25, 0);
    gantryGroup.add(rightPillar);

    // Banner Texture
    const bCanvas = document.createElement('canvas');
    bCanvas.width = 1024;
    bCanvas.height = 160;
    const bCtx = bCanvas.getContext('2d');
    bCtx.fillStyle = '#001e50';
    bCtx.fillRect(0, 0, 1024, 160);
    bCtx.fillStyle = '#74acdf';
    bCtx.fillRect(0, 0, 1024, 18);
    bCtx.fillStyle = '#ffd100';
    bCtx.fillRect(0, 142, 1024, 18);

    bCtx.fillStyle = '#ffffff';
    bCtx.font = 'italic 900 44px Impact, sans-serif';
    bCtx.textAlign = 'center';
    bCtx.fillText('ARGENTINA HATCHBACK CHALLENGE — BS. AS.', 512, 85);
    bCtx.fillStyle = '#74acdf';
    bCtx.font = 'bold 24px sans-serif';
    bCtx.fillText('OSCAR Y JUAN GÁLVEZ • LARGADA / LLEGADA', 512, 124);

    const bannerTex = new THREE.CanvasTexture(bCanvas);
    const bannerBox = new THREE.Mesh(
      new THREE.BoxGeometry(this.roadWidth * 1.38, 2.3, 1.2),
      new THREE.MeshBasicMaterial({ map: bannerTex })
    );
    bannerBox.position.set(0, 7.6, 0);
    gantryGroup.add(bannerBox);

    this.trackGroup.add(gantryGroup);
  }

  createBuenosAiresLandmarks() {
    // 1. Tiered Concrete Grandstands (Tribunas Oficiales) along Recta Principal (Right / -X side)
    const standCanvas = document.createElement('canvas');
    standCanvas.width = 512;
    standCanvas.height = 256;
    const sCtx = standCanvas.getContext('2d');
    sCtx.fillStyle = '#334155';
    sCtx.fillRect(0, 0, 512, 256);

    const colors = ['#74acdf', '#ffffff', '#ef4444', '#ffd100', '#38bdf8', '#f8fafc', '#1e293b'];
    for (let y = 16; y < 218; y += 8) {
      sCtx.fillStyle = '#1e293b';
      sCtx.fillRect(0, y, 512, 2);
      for (let x = 0; x < 512; x += 6) {
        sCtx.fillStyle = colors[Math.floor(this.seededRandom(x * 13 + y * 37) * colors.length)];
        sCtx.fillRect(x, y + 2, 4, 5);
      }
    }
    sCtx.fillStyle = '#74acdf';
    sCtx.fillRect(0, 222, 512, 11);
    sCtx.fillStyle = '#ffffff';
    sCtx.fillRect(0, 233, 512, 11);
    sCtx.fillStyle = '#74acdf';
    sCtx.fillRect(0, 244, 512, 12);

    const standTex = new THREE.CanvasTexture(standCanvas);
    standTex.wrapS = THREE.RepeatWrapping;
    standTex.repeat.set(5, 1);

    const grandstandGroup = new THREE.Group();
    const standLen = 212;
    const concreteMat = new THREE.MeshLambertMaterial({ color: 0xcbd5e1 });
    const steelMat = new THREE.MeshLambertMaterial({ color: 0x64748b });
    const crowdMat = new THREE.MeshLambertMaterial({ map: standTex });

    // Front concrete apron wall + railing
    const frontWall = new THREE.Mesh(
      new THREE.BoxGeometry(1.0, 2.6, standLen),
      concreteMat
    );
    frontWall.position.set(-140.2, 1.3, 20);
    grandstandGroup.add(frontWall);

    // 3 Stepped Tiered Seating Blocks
    [
      { x: -144.2, h: 5.5, w: 7.5 },
      { x: -151.0, h: 10.2, w: 7.5 },
      { x: -157.8, h: 15.0, w: 7.5 }
    ].forEach(tier => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(tier.w, tier.h, standLen), crowdMat);
      mesh.position.set(tier.x, tier.h * 0.5, 20);
      grandstandGroup.add(mesh);
    });

    // 12 Steel Roof Support Columns (6 front + 6 rear)
    const colGeo = new THREE.BoxGeometry(0.65, 17.8, 0.65);
    for (let k = 0; k < 6; k++) {
      const zCol = -78 + k * 39;
      const rearCol = new THREE.Mesh(colGeo, steelMat);
      rearCol.position.set(-161.0, 8.9, zCol);
      grandstandGroup.add(rearCol);

      const frontCol = new THREE.Mesh(
        new THREE.BoxGeometry(0.45, 14.5, 0.45),
        steelMat
      );
      frontCol.position.set(-141.5, 9.8, zCol);
      grandstandGroup.add(frontCol);
    }

    // Cantilevered Grandstand Overhang Roof + Fascia Trim
    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(25, 1.1, standLen + 6),
      new THREE.MeshLambertMaterial({ color: 0xe2e8f0 })
    );
    roof.position.set(-150.5, 17.6, 20);
    roof.rotation.z = -0.10;
    grandstandGroup.add(roof);

    const roofTrim = new THREE.Mesh(
      new THREE.BoxGeometry(0.8, 1.4, standLen + 6.2),
      new THREE.MeshBasicMaterial({ color: 0x001e50 })
    );
    roofTrim.position.set(-138.2, 16.4, 20);
    grandstandGroup.add(roofTrim);
    this.trackGroup.add(grandstandGroup);

    // 4 Tall Stadium Floodlight Towers (3 behind Grandstands + 1 behind Pit Lane)
    const floodPositions = [
      { x: -170, z: -65, faceX: 1 },
      { x: -170, z:  15, faceX: 1 },
      { x: -170, z:  95, faceX: 1 },
      { x: -75,  z:  15, faceX: -1 }
    ];
    const mastGeo = new THREE.CylinderGeometry(0.45, 0.85, 30, 8);
    const crossBarGeo = new THREE.BoxGeometry(0.5, 0.6, 8.2);
    const housingGeo = new THREE.BoxGeometry(1.1, 3.8, 7.6);
    const bulbFaceGeo = new THREE.PlaneGeometry(7.0, 3.2);

    floodPositions.forEach(fp => {
      const fGroup = new THREE.Group();
      fGroup.position.set(fp.x, 0, fp.z);

      const plinth = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.4, 2.6), concreteMat);
      plinth.position.y = 0.7;
      fGroup.add(plinth);

      const mast = new THREE.Mesh(mastGeo, steelMat);
      mast.position.y = 15;
      fGroup.add(mast);

      const arm = new THREE.Mesh(crossBarGeo, steelMat);
      arm.position.set(fp.faceX * 1.4, 29.8, 0);
      fGroup.add(arm);

      const housing = new THREE.Mesh(housingGeo, steelMat);
      housing.position.set(fp.faceX * 1.8, 29.8, 0);
      housing.rotation.z = fp.faceX * 0.34;
      fGroup.add(housing);

      const lampMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: 0xfff8dc,
        emissiveIntensity: 0.35,
        roughness: 0.2
      });
      this.floodlightLampMaterials.push(lampMat);

      const bulbPanel = new THREE.Mesh(bulbFaceGeo, lampMat);
      bulbPanel.position.set(fp.faceX * 2.35, 29.5, 0);
      bulbPanel.rotation.y = fp.faceX > 0 ? Math.PI / 2 : -Math.PI / 2;
      bulbPanel.rotation.x = 0.32;
      fGroup.add(bulbPanel);

      this.trackGroup.add(fGroup);
    });

    // 2. Detailed Pit Lane Complex (Boxes 01-12), Pit Wall & Upgraded Control Tower
    // Dark Pit Lane Apron neatly fitting between inner Recta barrier (x=-105.35) and Pit Garages (x=-100)
    const pitApron = new THREE.Mesh(
      new THREE.PlaneGeometry(6.0, 196),
      new THREE.MeshLambertMaterial({ color: 0x1e242d })
    );
    pitApron.rotation.x = -Math.PI / 2;
    pitApron.position.set(-102.6, 0.015, 22);
    this.trackGroup.add(pitApron);

    const pitWall = new THREE.Mesh(
      new THREE.BoxGeometry(0.55, 1.05, 182),
      concreteMat
    );
    pitWall.position.set(-105.5, 0.525, 22);
    this.trackGroup.add(pitWall);

    // Numbered Pit Garages Facade Canvas Texture (BOX 01 .. BOX 12)
    const pitCanvas = document.createElement('canvas');
    pitCanvas.width = 1024;
    pitCanvas.height = 192;
    const pCtx = pitCanvas.getContext('2d');
    pCtx.fillStyle = '#e2e8f0';
    pCtx.fillRect(0, 0, 1024, 192);
    pCtx.fillStyle = '#001e50';
    pCtx.fillRect(0, 0, 1024, 40);
    pCtx.fillStyle = '#74acdf';
    pCtx.fillRect(0, 40, 1024, 10);

    const bayW = 1024 / 12;
    for (let b = 0; b < 12; b++) {
      const bx = b * bayW;
      pCtx.fillStyle = '#111827';
      pCtx.fillRect(bx + 10, 74, bayW - 20, 118);
      pCtx.strokeStyle = '#475569';
      pCtx.lineWidth = 2;
      for (let ry = 88; ry < 185; ry += 14) {
        pCtx.beginPath();
        pCtx.moveTo(bx + 12, ry);
        pCtx.lineTo(bx + bayW - 12, ry);
        pCtx.stroke();
      }
      pCtx.fillStyle = '#ffffff';
      pCtx.font = 'bold 16px sans-serif';
      pCtx.textAlign = 'center';
      pCtx.fillText(`BOX ${String(b + 1).padStart(2, '0')}`, bx + bayW * 0.5, 27);
    }

    const pitTex = new THREE.CanvasTexture(pitCanvas);
    const pitWallMat = new THREE.MeshLambertMaterial({ color: 0xdbeafe });
    const pitFacadeMat = new THREE.MeshLambertMaterial({ map: pitTex });
    const pitBuilding = new THREE.Mesh(
      new THREE.BoxGeometry(14, 7.6, 175),
      [
        pitWallMat,   // +X rear wall
        pitFacadeMat, // -X trackside garage doors
        pitWallMat,   // top
        pitWallMat,
        pitWallMat,
        pitWallMat
      ]
    );
    pitBuilding.position.set(-93, 3.8, 25);
    this.trackGroup.add(pitBuilding);

    // Rooftop AC Units & Pit Terrace Railing
    const acGeo = new THREE.BoxGeometry(2.8, 1.2, 3.4);
    for (let a = 0; a < 5; a++) {
      const acUnit = new THREE.Mesh(acGeo, steelMat);
      acUnit.position.set(-91, 8.2, -35 + a * 30);
      this.trackGroup.add(acUnit);
    }

    // Upgraded Autódromo Control Tower ("Torre de Control")
    const towerGroup = new THREE.Group();
    towerGroup.position.set(-92, 0, -48);
    const towerShaft = new THREE.Mesh(
      new THREE.BoxGeometry(8.2, 22, 8.2),
      new THREE.MeshLambertMaterial({ color: 0xf1f5f9 })
    );
    towerShaft.position.y = 11;
    towerGroup.add(towerShaft);

    // Cantilevered Balcony Slab + Dark Wraparound Panoramic Glass Observation Deck
    const balcony = new THREE.Mesh(new THREE.BoxGeometry(13.2, 0.9, 13.2), concreteMat);
    balcony.position.y = 20.6;
    towerGroup.add(balcony);

    const towerGlassMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      emissive: 0x38bdf8,
      emissiveIntensity: 0.14,
      metalness: 0.65,
      roughness: 0.15
    });
    this.emissiveCityMaterials.push(towerGlassMat);
    const obsDeck = new THREE.Mesh(new THREE.BoxGeometry(11.6, 4.2, 11.6), towerGlassMat);
    obsDeck.position.y = 23.1;
    towerGroup.add(obsDeck);

    const towerRoof = new THREE.Mesh(
      new THREE.BoxGeometry(12.8, 1.4, 12.8),
      new THREE.MeshLambertMaterial({ color: 0x001e50 })
    );
    towerRoof.position.y = 25.8;
    towerGroup.add(towerRoof);

    // Roof "CONTROL • EL GÁLVEZ" Sign + Twin Communications Antennas
    const ctrlSign = this.createBillboardBanner('CONTROL • EL GÁLVEZ', 'AUTÓDROMO DE BUENOS AIRES', '#001e50', '#ffd100');
    ctrlSign.scale.set(0.75, 0.55, 1.0);
    ctrlSign.position.set(-6.45, 25.8, 0);
    ctrlSign.rotation.y = -Math.PI / 2;
    towerGroup.add(ctrlSign);

    const antGeo = new THREE.CylinderGeometry(0.08, 0.14, 7.5, 6);
    [-2.8, 2.8].forEach(az => {
      const ant = new THREE.Mesh(antGeo, steelMat);
      ant.position.set(1.5, 30.0, az);
      towerGroup.add(ant);
    });
    this.trackGroup.add(towerGroup);

    // 3. Upgraded Lago de Regatas (Lake + Sandy Shoreline + Pier + Island Grove)
    const lakeCenter = { x: 42, z: 315 };
    const shoreRing = new THREE.Mesh(
      new THREE.RingGeometry(94, 102.5, 44),
      new THREE.MeshLambertMaterial({ color: 0xb9a888, side: THREE.DoubleSide })
    );
    shoreRing.rotation.x = -Math.PI / 2;
    shoreRing.position.set(lakeCenter.x, 0.025, lakeCenter.z);
    this.trackGroup.add(shoreRing);

    const lakeGeo = new THREE.CircleGeometry(96.5, 44);
    const lakeMat = new THREE.MeshPhongMaterial({
      color: 0x0284c7,
      emissive: 0x032b44,
      shininess: 90,
      specular: 0xbae6fd
    });
    const lake = new THREE.Mesh(lakeGeo, lakeMat);
    lake.rotation.x = -Math.PI / 2;
    lake.position.set(lakeCenter.x, 0.05, lakeCenter.z);
    this.trackGroup.add(lake);

    const island = new THREE.Mesh(
      new THREE.CylinderGeometry(24, 28, 1.2, 20),
      new THREE.MeshLambertMaterial({ color: 0x2d5a27 })
    );
    island.position.set(45, 0.4, 320);
    this.trackGroup.add(island);

    // Small grove of broadleaf trees on Lago de Regatas central island
    const treeAssets = this.getSharedTreeAssets();
    [
      { x: 42, z: 324, s: 1.05, type: 0 },
      { x: 51, z: 318, s: 0.90, type: 2 },
      { x: 38, z: 313, s: 0.85, type: 0 },
      { x: 48, z: 328, s: 0.80, type: 1 },
      { x: 54, z: 325, s: 0.92, type: 0 }
    ].forEach((it, idx) => {
      const islandTree = this.createTreeMesh(it.type, it.s, idx * 1.3, treeAssets);
      islandTree.position.set(it.x, 0.95, it.z);
      this.trackGroup.add(islandTree);
    });

    // Rustic Wooden Pier on Southern Shore of Lago de Regatas
    const woodMat = new THREE.MeshLambertMaterial({ color: 0x6b4f35 });
    const dockDeck = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.25, 11.5), woodMat);
    dockDeck.position.set(lakeCenter.x, 0.35, lakeCenter.z - 94);
    this.trackGroup.add(dockDeck);
    const postGeo = new THREE.CylinderGeometry(0.16, 0.16, 1.1, 6);
    [-1.5, 1.5].forEach(px => {
      [-98.5, -94.0, -89.5].forEach(pz => {
        const p = new THREE.Mesh(postGeo, woodMat);
        p.position.set(lakeCenter.x + px, 0.15, lakeCenter.z + pz);
        this.trackGroup.add(p);
      });
    });

    // 4. Majestic Multi-Branch "Árbol del Ombú" in the Central Infield
    const ombuGroup = new THREE.Group();
    ombuGroup.position.set(35, 0, 110);
    const barkMat = new THREE.MeshLambertMaterial({ color: 0x5c4033 });
    const ombuDarkMat = new THREE.MeshLambertMaterial({ color: 0x1b4328 });
    const ombuLightMat = new THREE.MeshLambertMaterial({ color: 0x2c6138 });

    const rootFlare = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 5.0, 3.2, 10), barkMat);
    rootFlare.position.y = 1.6;
    ombuGroup.add(rootFlare);

    const mainTrunk = new THREE.Mesh(new THREE.CylinderGeometry(2.0, 2.9, 6.8, 10), barkMat);
    mainTrunk.position.y = 4.5;
    ombuGroup.add(mainTrunk);

    // 4 Spreading Gnarled Limbs & 6 Organic Dodecahedron Canopy Clusters
    const limbs = [
      { ax:  0.42, az:  0.22, lx: -2.2, ly: 7.2, lz:  2.4, r: 6.2 },
      { ax: -0.38, az:  0.34, lx: -2.8, ly: 7.4, lz: -2.1, r: 5.8 },
      { ax:  0.30, az: -0.42, lx:  2.8, ly: 7.0, lz:  1.9, r: 6.0 },
      { ax: -0.35, az: -0.32, lx:  2.4, ly: 7.3, lz: -2.4, r: 5.6 }
    ];
    limbs.forEach((lb, idx) => {
      const limb = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 1.35, 5.8, 7), barkMat);
      limb.position.set(lb.lx * 0.55, 6.2, lb.lz * 0.55);
      limb.rotation.set(lb.ax, 0, lb.az);
      ombuGroup.add(limb);

      const puff = new THREE.Mesh(
        new THREE.DodecahedronGeometry(lb.r, 1),
        idx % 2 === 0 ? ombuDarkMat : ombuLightMat
      );
      puff.scale.set(1.25, 0.72, 1.25);
      puff.position.set(lb.lx * 1.4, lb.ly + 2.0, lb.lz * 1.4);
      ombuGroup.add(puff);
    });

    // Two central upper crown clusters
    [
      { y: 11.2, x: 0.4, z: 0.2, r: 7.4, mat: ombuLightMat },
      { y: 9.8, x: -0.6, z: -0.5, r: 6.8, mat: ombuDarkMat }
    ].forEach(c => {
      const crown = new THREE.Mesh(new THREE.DodecahedronGeometry(c.r, 1), c.mat);
      crown.scale.set(1.35, 0.65, 1.35);
      crown.position.set(c.x, c.y, c.z);
      ombuGroup.add(crown);
    });

    const ombuShadow = new THREE.Mesh(
      new THREE.CircleGeometry(13.5, 18),
      new THREE.MeshBasicMaterial({ color: 0x0b160c, transparent: true, opacity: 0.36 })
    );
    ombuShadow.rotation.x = -Math.PI / 2;
    ombuShadow.position.y = 0.01;
    ombuGroup.add(ombuShadow);
    this.trackGroup.add(ombuGroup);
  }

  createBillboardBanner(text, subText, bgColor = '#001e50', accentColor = '#00b0f0') {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, 512, 128);
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 10;
    ctx.strokeRect(5, 5, 502, 118);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'italic 900 40px Impact, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(text, 256, 62);

    ctx.fillStyle = accentColor;
    ctx.font = 'bold 22px sans-serif';
    ctx.fillText(subText, 256, 100);

    const tex = new THREE.CanvasTexture(canvas);
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(14, 3.6, 0.5),
      new THREE.MeshBasicMaterial({ map: tex })
    );
    return mesh;
  }

  getSharedTreeAssets() {
    if (this._treeAssets) return this._treeAssets;
    this._treeAssets = {
      trunkMat: new THREE.MeshLambertMaterial({ color: 0x4a3728 }),
      barkDarkMat: new THREE.MeshLambertMaterial({ color: 0x3b2c20 }),
      eucMat1: new THREE.MeshLambertMaterial({ color: 0x28592d }),
      eucMat2: new THREE.MeshLambertMaterial({ color: 0x366d34 }),
      eucMat3: new THREE.MeshLambertMaterial({ color: 0x437c39 }),
      pineMat1: new THREE.MeshLambertMaterial({ color: 0x1a3f22 }),
      pineMat2: new THREE.MeshLambertMaterial({ color: 0x224f2a }),
      jacarandaMat1: new THREE.MeshLambertMaterial({ color: 0x7c6fe6 }),
      jacarandaMat2: new THREE.MeshLambertMaterial({ color: 0x9381ff }),
      shadowMat: new THREE.MeshBasicMaterial({ color: 0x0b160c, transparent: true, opacity: 0.32 }),
      trunkCylGeo: new THREE.CylinderGeometry(0.32, 0.56, 3.8, 6),
      branchCylGeo: new THREE.CylinderGeometry(0.14, 0.24, 2.5, 5),
      crownDodecGeo: new THREE.DodecahedronGeometry(2.3, 0),
      pineConeBotGeo: new THREE.ConeGeometry(2.8, 4.4, 7),
      pineConeMidGeo: new THREE.ConeGeometry(2.2, 4.0, 7),
      pineConeTopGeo: new THREE.ConeGeometry(1.5, 3.4, 7),
      shadowDiscGeo: new THREE.CircleGeometry(2.8, 10)
    };
    return this._treeAssets;
  }

  createTreeMesh(type, scale, rotY, assets) {
    const group = new THREE.Group();
    group.rotation.y = rotY;
    group.scale.set(scale, scale, scale);

    const shadow = new THREE.Mesh(assets.shadowDiscGeo, assets.shadowMat);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.012;
    group.add(shadow);

    const trunk = new THREE.Mesh(
      assets.trunkCylGeo,
      type === 1 ? assets.barkDarkMat : assets.trunkMat
    );
    trunk.position.y = 1.9;
    group.add(trunk);

    if (type === 1) {
      // Type 1: Tiered Parque Roca Pine / Cypress (3 stacked overlapping cones)
      const c1 = new THREE.Mesh(assets.pineConeBotGeo, assets.pineMat1);
      c1.position.set(0.08, 4.2, -0.05);
      group.add(c1);

      const c2 = new THREE.Mesh(assets.pineConeMidGeo, assets.pineMat2);
      c2.position.set(-0.08, 6.2, 0.08);
      c2.rotation.y = 0.7;
      group.add(c2);

      const c3 = new THREE.Mesh(assets.pineConeTopGeo, assets.pineMat1);
      c3.position.set(0.04, 8.0, 0.02);
      c3.rotation.y = 1.4;
      group.add(c3);
    } else if (type === 2) {
      // Type 2: Flowering Jacarandá Porteño (violet-lavender puffs + green accent)
      [
        { rx: 0.42, rz: 0.32, x: -0.6, z: 0.5 },
        { rx: -0.35, rz: -0.38, x: 0.65, z: -0.4 }
      ].forEach(b => {
        const br = new THREE.Mesh(assets.branchCylGeo, assets.trunkMat);
        br.position.set(b.x * 0.55, 3.6, b.z * 0.55);
        br.rotation.set(b.rx, 0, b.rz);
        group.add(br);
      });

      const puffs = [
        { x: -1.1, y: 5.1, z:  0.8, s: 1.05, m: assets.jacarandaMat1 },
        { x:  1.1, y: 5.3, z: -0.6, s: 1.0,  m: assets.jacarandaMat2 },
        { x:  0.1, y: 6.2, z:  0.2, s: 1.15, m: assets.jacarandaMat1 },
        { x: -0.2, y: 4.5, z: -0.9, s: 0.85, m: assets.eucMat2 }
      ];
      puffs.forEach(p => {
        const mesh = new THREE.Mesh(assets.crownDodecGeo, p.m);
        mesh.position.set(p.x, p.y, p.z);
        mesh.scale.set(p.s * 1.15, p.s * 0.78, p.s * 1.15);
        group.add(mesh);
      });
    } else {
      // Type 0: Eucalyptus / Tipa Broadleaf
      [
        { rx: 0.38, rz: -0.34, x: 0.5, z: 0.4 },
        { rx: -0.32, rz: 0.40, x: -0.5, z: -0.35 }
      ].forEach(b => {
        const br = new THREE.Mesh(assets.branchCylGeo, assets.trunkMat);
        br.position.set(b.x * 0.6, 3.7, b.z * 0.6);
        br.rotation.set(b.rx, 0, b.rz);
        group.add(br);
      });

      const puffs = [
        { x:  0.0, y: 6.4, z:  0.0, s: 1.18, m: assets.eucMat2 },
        { x: -1.2, y: 5.2, z:  0.8, s: 0.96, m: assets.eucMat1 },
        { x:  1.2, y: 5.4, z: -0.6, s: 1.02, m: assets.eucMat3 },
        { x:  0.3, y: 4.8, z:  1.1, s: 0.88, m: assets.eucMat1 }
      ];
      puffs.forEach(p => {
        const mesh = new THREE.Mesh(assets.crownDodecGeo, p.m);
        mesh.position.set(p.x, p.y, p.z);
        mesh.scale.set(p.s, p.s * 0.82, p.s);
        group.add(mesh);
      });
    }

    return group;
  }

  createGravelTrapTexture() {
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 128;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#9a8f7b';
    ctx.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 1800; i++) {
      const x = Math.floor(this.seededRandom(i * 17 + 3) * 128);
      const y = Math.floor(this.seededRandom(i * 31 + 7) * 128);
      ctx.fillStyle = i % 3 === 0 ? '#78716c' : (i % 3 === 1 ? '#b5aa94' : '#57534e');
      ctx.fillRect(x, y, 2, 2);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(3, 18);
    return tex;
  }

  createCornerSignsAndTrees() {
    const N = this.samples.length;
    const halfW = this.roadWidth * 0.5;
    const curbW = this.curbWidth;
    const wallDist = halfW + curbW + 5.5;

    // 1. Trackside Sponsor Billboards
    const sponsors = this.currentLayout === '8'
      ? [
          { t: 0.16, side: -1, title: 'CURVA REUTEMANN', sub: 'ARGENTINA HATCHBACK CHALLENGE', bg: '#001e50', ac: '#00b0f0' },
          { t: 0.28, side: -1, title: 'LA CONFITERÍA', sub: 'BUENOS AIRES ARGENTINA', bg: '#0c4a6e', ac: '#74acdf' },
          { t: 0.40, side: -1, title: 'CURVA DEL OMBÚ', sub: 'CIRCUITO N° 8 • EL GÁLVEZ', bg: '#14532d', ac: '#ffd100' },
          { t: 0.54, side:  1, title: 'EL TOBOGÁN', sub: 'SECTOR TÉCNICO • BS. AS.', bg: '#991b1b', ac: '#ffd100' },
          { t: 0.85, side: -1, title: 'LA HORQUILLA', sub: 'CURVA PARGA • EL GÁLVEZ', bg: '#111827', ac: '#74acdf' }
        ]
      : [
          { t: 0.16, side: -1, title: 'S DEL CIERVO', sub: 'ARGENTINA HATCHBACK CHALLENGE', bg: '#001e50', ac: '#00b0f0' },
          { t: 0.30, side: -1, title: 'LAGO DE REGATAS', sub: 'BUENOS AIRES ARGENTINA', bg: '#0c4a6e', ac: '#74acdf' },
          { t: 0.44, side: -1, title: 'CURVÓN SALOTTO', sub: 'A FONDO • CIRCUITO N° 12', bg: '#991b1b', ac: '#ffd100' },
          { t: 0.68, side:  1, title: 'CHICANA DE ASCARI', sub: 'ZONA DE FRENAJE FUERTE', bg: '#001e50', ac: '#ffd100' },
          { t: 0.85, side: -1, title: 'LA HORQUILLA', sub: 'CURVA PARGA • EL GÁLVEZ', bg: '#111827', ac: '#74acdf' }
        ];

    sponsors.forEach(sp => {
      const idx = Math.floor(sp.t * N) % N;
      const s = this.samples[idx];
      const board = this.createBillboardBanner(sp.title, sp.sub, sp.bg, sp.ac);
      const pos = s.point.clone().addScaledVector(s.right, sp.side * (halfW + 8.5));
      board.position.set(pos.x, pos.y + 2.2, pos.z);
      board.lookAt(s.point.x, s.point.y + 1.5, s.point.z);
      this.trackGroup.add(board);
    });

    // 2. Brake Marker Boards (150m, 100m, 50m)
    const brakeZones = [0.14, 0.68, 0.83];
    brakeZones.forEach(zoneT => {
      ['150', '100', '50'].forEach((label, idx) => {
        const markerT = (zoneT - (3 - idx) * 0.015 + 1.0) % 1.0;
        const s = this.samples[Math.floor(markerT * N)];
        const c = document.createElement('canvas');
        c.width = 128;
        c.height = 64;
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#111827';
        ctx.fillRect(0, 0, 128, 64);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 6;
        ctx.strokeRect(3, 3, 122, 58);
        ctx.fillStyle = '#ffd100';
        ctx.font = '900 40px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(label, 64, 47);

        const sign = new THREE.Mesh(
          new THREE.BoxGeometry(2.2, 1.2, 0.2),
          new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c) })
        );
        const p = s.point.clone().addScaledVector(s.right, -(halfW + 3.2));
        sign.position.set(p.x, p.y + 0.9, p.z);
        const angle = Math.atan2(s.tangent.x, s.tangent.z);
        sign.rotation.y = angle;
        this.trackGroup.add(sign);
      });
    });

    // 3. Gravel Runoff Traps ("Camas de Leca") outside High-Speed Corners
    const gravelZones = this.currentLayout === '8'
      ? [
          { start: 0.14, end: 0.22, side: -1 },
          { start: 0.25, end: 0.34, side: -1 },
          { start: 0.50, end: 0.59, side:  1 },
          { start: 0.81, end: 0.90, side: -1 }
        ]
      : [
          { start: 0.13, end: 0.19, side:  1 },
          { start: 0.38, end: 0.52, side: -1 },
          { start: 0.67, end: 0.74, side:  1 },
          { start: 0.80, end: 0.90, side: -1 }
        ];

    const gravelMat = new THREE.MeshLambertMaterial({
      map: this.createGravelTrapTexture(),
      side: THREE.DoubleSide
    });
    gravelZones.forEach(gz => {
      const gPos = [];
      const gUV = [];
      const gIdx = [];
      let vCount = 0;
      const i0 = Math.floor(gz.start * N);
      const i1 = Math.floor(gz.end * N);

      for (let i = i0; i < i1; i++) {
        const s0 = this.samples[i % N];
        const s1 = this.samples[(i + 1) % N];
        const p0In = s0.point.clone().addScaledVector(s0.right, gz.side * (halfW + 1.8));
        const p0Out = s0.point.clone().addScaledVector(s0.right, gz.side * (wallDist - 0.15));
        const p1In = s1.point.clone().addScaledVector(s1.right, gz.side * (halfW + 1.8));
        const p1Out = s1.point.clone().addScaledVector(s1.right, gz.side * (wallDist - 0.15));

        if (!this.isClearOfTrack(p0Out.x, p0Out.z, halfW + 2.5) || !this.isClearOfTrack(p1Out.x, p1Out.z, halfW + 2.5)) {
          continue;
        }
        gPos.push(p0In.x, 0.012, p0In.z, p0Out.x, 0.012, p0Out.z, p1In.x, 0.012, p1In.z, p1Out.x, 0.012, p1Out.z);
        const v0 = (i - i0) / Math.max(1, i1 - i0);
        const v1 = (i + 1 - i0) / Math.max(1, i1 - i0);
        gUV.push(0, v0, 1, v0, 0, v1, 1, v1);
        gIdx.push(vCount, vCount + 1, vCount + 2, vCount + 1, vCount + 3, vCount + 2);
        vCount += 4;
      }
      if (gIdx.length > 0) {
        const gGeo = new THREE.BufferGeometry();
        gGeo.setAttribute('position', new THREE.Float32BufferAttribute(gPos, 3));
        gGeo.setAttribute('uv', new THREE.Float32BufferAttribute(gUV, 2));
        gGeo.setIndex(gIdx);
        gGeo.computeVertexNormals();
        this.trackGroup.add(new THREE.Mesh(gGeo, gravelMat));
      }
    });

    // 4. Stacked Corner Tire Barriers ("Gomas") & Galvanized Guardrail Fence Posts
    const tireWallGeo = new THREE.BoxGeometry(0.85, 1.05, 1.85);
    const tireRedMat = new THREE.MeshLambertMaterial({ color: 0xdc2626 });
    const tireWhiteMat = new THREE.MeshLambertMaterial({ color: 0xf8fafc });
    const tireDarkMat = new THREE.MeshLambertMaterial({ color: 0x1e293b });

    const fencePostGeo = new THREE.BoxGeometry(0.14, 1.45, 0.14);
    const fencePostMat = new THREE.MeshLambertMaterial({ color: 0x94a3b8 });

    for (let i = 0; i < N; i += 2) {
      const s = this.samples[i];

      // Steel guardrail fence posts every 8 samples
      if (i % 8 === 0) {
        [-1, 1].forEach(side => {
          const pPos = s.point.clone().addScaledVector(s.right, side * (wallDist + 0.16));
          if (this.isClearOfTrack(pPos.x, pPos.z, 12.2)) {
            const post = new THREE.Mesh(fencePostGeo, fencePostMat);
            post.position.set(pPos.x, 0.725, pPos.z);
            post.rotation.y = Math.atan2(s.tangent.x, s.tangent.z);
            this.trackGroup.add(post);
          }
        });
      }

      // Alternating Red / White / Charcoal Stacked Tire Barriers on outside of sharp turns
      if (Math.abs(s.curvature) > 0.045) {
        const outSide = -Math.sign(s.curvature);
        const tPos = s.point.clone().addScaledVector(s.right, outSide * (wallDist - 0.65));
        if (this.isClearOfTrack(tPos.x, tPos.z, 13.0)) {
          const m = (i % 6 === 0) ? tireRedMat : (i % 4 === 0 ? tireWhiteMat : tireDarkMat);
          const block = new THREE.Mesh(tireWallGeo, m);
          block.position.set(tPos.x, 0.525, tPos.z);
          block.rotation.y = Math.atan2(s.tangent.x, s.tangent.z);
          this.trackGroup.add(block);
        }
      }
    }

    // 5. Trackside Marshal Cabins ("Puestos de Banderilleros")
    const marshalTs = [0.14, 0.33, 0.48, 0.67, 0.78, 0.89];
    const cabinBodyMat = new THREE.MeshLambertMaterial({ color: 0xf8fafc });
    const cabinRoofMat = new THREE.MeshLambertMaterial({ color: 0x0284c7 });
    const deckMat = new THREE.MeshLambertMaterial({ color: 0x64748b });
    const flagMatYellow = new THREE.MeshBasicMaterial({ color: 0xfacc15, side: THREE.DoubleSide });
    const flagMatGreen = new THREE.MeshBasicMaterial({ color: 0x22c55e, side: THREE.DoubleSide });

    marshalTs.forEach((mt, idx) => {
      const s = this.samples[Math.floor(mt * N) % N];
      const side = idx % 2 === 0 ? -1 : 1;
      const mPos = s.point.clone().addScaledVector(s.right, side * (wallDist + 3.2));
      const distLake = Math.hypot(mPos.x - 42, mPos.z - 315);
      if (!this.isClearOfTrack(mPos.x, mPos.z, 16.5) || distLake < 103) return;

      const cabin = new THREE.Group();
      cabin.position.set(mPos.x, 0, mPos.z);
      cabin.rotation.y = Math.atan2(s.tangent.x, s.tangent.z);

      const deck = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.2, 2.6), deckMat);
      deck.position.y = 0.6;
      cabin.add(deck);

      const booth = new THREE.Mesh(new THREE.BoxGeometry(2.1, 2.2, 2.1), cabinBodyMat);
      booth.position.y = 2.3;
      cabin.add(booth);

      const cap = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.35, 2.7), cabinRoofMat);
      cap.position.y = 3.5;
      cabin.add(cap);

      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.8, 6), fencePostMat);
      pole.position.set(1.1, 4.3, 0.8);
      cabin.add(pole);

      const flag = new THREE.Mesh(
        new THREE.PlaneGeometry(0.85, 0.55),
        idx % 3 === 0 ? flagMatGreen : flagMatYellow
      );
      flag.position.set(1.1, 4.9, 1.2);
      flag.rotation.y = Math.PI / 2;
      cabin.add(flag);

      this.trackGroup.add(cabin);
    });

    // 6. Secondary Overhead Trackside Bridge on Back Straight (t = 0.60 on N°12 / t = 0.66 on N°8)
    const bridgeT = this.currentLayout === '8' ? 0.66 : 0.60;
    const bs = this.samples[Math.floor(bridgeT * N) % N];
    const bPillarDist = wallDist + 1.8;
    const bpL = bs.point.clone().addScaledVector(bs.right, -bPillarDist);
    const bpR = bs.point.clone().addScaledVector(bs.right, bPillarDist);
    if (this.isClearOfTrack(bpL.x, bpL.z, 14.0) && this.isClearOfTrack(bpR.x, bpR.z, 14.0)) {
      const brGroup = new THREE.Group();
      brGroup.position.set(bs.point.x, 0, bs.point.z);
      brGroup.rotation.y = Math.atan2(bs.tangent.x, bs.tangent.z);

      const brPillarMat = new THREE.MeshLambertMaterial({ color: 0x1e293b });
      const brSpanW = bPillarDist * 2 + 1.0;
      [-bPillarDist, bPillarDist].forEach(bx => {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(1.1, 8.8, 1.4), brPillarMat);
        leg.position.set(bx, 4.4, 0);
        brGroup.add(leg);
      });

      const brSign = this.createBillboardBanner('EL GÁLVEZ • BUENOS AIRES', 'AUTÓDROMO OSCAR Y JUAN GÁLVEZ', '#0f172a', '#74acdf');
      brSign.scale.set(brSpanW / 14, 0.72, 2.2);
      brSign.position.set(0, 7.6, 0);
      brGroup.add(brSign);

      this.trackGroup.add(brGroup);
    }

    // 7. Upgraded Multi-Species Parkland Trees (Eucalyptus, Parque Roca Pines & Flowering Jacarandás)
    const treeAssets = this.getSharedTreeAssets();
    const minTreeTrackClearance = halfW + 14.5;

    for (let i = 0; i < N; i += 8) {
      // Skip Recta Principal where Grandstands, Floodlights and Pit Lane sit
      if (i < 95 || i > N - 55) continue;

      const s = this.samples[i];
      [-1, 1].forEach((side, sideIdx) => {
        // Two staggered tree depth bands (inner parkland belt + outer grove belt)
        for (let band = 0; band < 2; band++) {
          const seed = i * 19 + sideIdx * 71 + band * 137;
          const r1 = this.seededRandom(seed);
          const r2 = this.seededRandom(seed + 11);
          const r3 = this.seededRandom(seed + 29);

          // Vary density naturally in outer band
          if (band === 1 && r1 > 0.68) continue;

          const baseDist = band === 0
            ? (wallDist + 3.5 + r1 * 8.5)
            : (wallDist + 18.0 + r1 * 24.0);

          const jitterFwd = (r2 - 0.5) * 8.0;
          const tx = s.point.x + s.right.x * (side * baseDist) + s.tangent.x * jitterFwd;
          const tz = s.point.z + s.right.z * (side * baseDist) + s.tangent.z * jitterFwd;

          if (!this.isClearOfTrack(tx, tz, minTreeTrackClearance)) continue;

          // Keep outside Lago de Regatas & away from Plaza Torre Espacial
          if (Math.hypot(tx - 42, tz - 315) < 107) continue;
          if (Math.hypot(tx - (-310), tz - 320) < 38) continue;

          // Archetype distribution: ~55% Eucalyptus (0), ~27% Pine (1), ~18% Jacarandá (2)
          let treeType = 0;
          if (r3 > 0.82) treeType = 2;
          else if (r3 > 0.55) treeType = 1;

          const treeScale = 0.85 + r2 * 0.60;
          const rotY = r1 * Math.PI * 2;
          const tree = this.createTreeMesh(treeType, treeScale, rotY, treeAssets);
          tree.position.set(tx, 0, tz);
          this.trackGroup.add(tree);
        }
      });
    }
  }

  /**
   * Iconic Buenos Aires "Torre Espacial" (~195m Space-Needle Observation Tower in Villa Soldati / Parque de la Ciudad)
   * Positioned at (-310, 0, 320) just north-west of the Grandstands & S del Ciervo.
   */
  createTorreEspacial() {
    const tGroup = new THREE.Group();
    tGroup.position.set(-310, 0, 320);

    const concreteWhiteMat = new THREE.MeshLambertMaterial({ color: 0xe2e8f0 });
    const concreteGreyMat = new THREE.MeshLambertMaterial({ color: 0x94a3b8 });
    const darkLiftMat = new THREE.MeshLambertMaterial({ color: 0x1e293b });
    const redAccentMat = new THREE.MeshLambertMaterial({ color: 0xdc2626 });

    // Circular Plaza Base & Entrance Pavilion Ring
    const plazaBase = new THREE.Mesh(new THREE.CylinderGeometry(28, 30, 1.5, 24), concreteGreyMat);
    plazaBase.position.y = 0.75;
    tGroup.add(plazaBase);

    const pavilion = new THREE.Mesh(new THREE.CylinderGeometry(14, 15, 4.2, 18), concreteWhiteMat);
    pavilion.position.y = 3.2;
    tGroup.add(pavilion);

    // 6 Splayed Concrete Buttress Legs around Lower Shaft
    const legGeo = new THREE.BoxGeometry(2.6, 28, 8.0);
    for (let k = 0; k < 6; k++) {
      const ang = (k / 6) * Math.PI * 2;
      const legHolder = new THREE.Group();
      legHolder.rotation.y = ang;
      const leg = new THREE.Mesh(legGeo, concreteWhiteMat);
      leg.position.set(0, 13.5, 6.2);
      leg.rotation.x = 0.24;
      legHolder.add(leg);
      tGroup.add(legHolder);
    }

    // Main Tapered 12-Sided Fluted Concrete Shaft (y = 0..118m)
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(4.4, 5.8, 118, 12), concreteWhiteMat);
    shaft.position.y = 59;
    tGroup.add(shaft);

    // 3 Vertical Dark Glass Elevator Shaft Strips
    const elevGeo = new THREE.BoxGeometry(1.6, 102, 1.1);
    for (let e = 0; e < 3; e++) {
      const ang = (e / 3) * Math.PI * 2 + 0.35;
      const eh = new THREE.Group();
      eh.rotation.y = ang;
      const strip = new THREE.Mesh(elevGeo, darkLiftMat);
      strip.position.set(0, 65, 4.7);
      eh.add(strip);
      tGroup.add(eh);
    }

    // Structural Inverted-Cone Support Collar + 12 Radial Support Ribs (y = 106..120m)
    const collarCone = new THREE.Mesh(new THREE.CylinderGeometry(16.2, 4.4, 14, 18), concreteGreyMat);
    collarCone.position.y = 113;
    tGroup.add(collarCone);

    const ribGeo = new THREE.BoxGeometry(0.9, 15.5, 2.6);
    for (let r = 0; r < 12; r++) {
      const ang = (r / 12) * Math.PI * 2;
      const rh = new THREE.Group();
      rh.rotation.y = ang;
      const rib = new THREE.Mesh(ribGeo, concreteWhiteMat);
      rib.position.set(0, 113, 9.8);
      rib.rotation.x = -0.68;
      rh.add(rib);
      tGroup.add(rh);
    }

    // Two-Tier Observation Pod "El Mirador" (y = 120..149m)
    const lowerDeck = new THREE.Mesh(new THREE.CylinderGeometry(16.6, 16.0, 3.0, 24), concreteWhiteMat);
    lowerDeck.position.y = 121.5;
    tGroup.add(lowerDeck);

    const miradorGlassMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      emissive: 0xfde68a,
      emissiveIntensity: 0.14,
      metalness: 0.72,
      roughness: 0.12
    });
    this.emissiveCityMaterials.push(miradorGlassMat);

    const podCore = new THREE.Mesh(new THREE.CylinderGeometry(15.6, 15.6, 14.5, 24), miradorGlassMat);
    podCore.position.y = 130.0;
    tGroup.add(podCore);

    // Mid waist structural concrete belt
    const waistRing = new THREE.Mesh(new THREE.CylinderGeometry(16.3, 16.3, 2.2, 24), concreteWhiteMat);
    waistRing.position.y = 129.8;
    tGroup.add(waistRing);

    // Cantilevered Wide Upper Overhang Disc + Dome Roof
    const upperOverhang = new THREE.Mesh(new THREE.CylinderGeometry(19.5, 18.6, 3.0, 24), concreteWhiteMat);
    upperOverhang.position.y = 138.8;
    tGroup.add(upperOverhang);

    const domeCap = new THREE.Mesh(new THREE.CylinderGeometry(5.5, 18.8, 9.0, 24), concreteWhiteMat);
    domeCap.position.y = 144.8;
    tGroup.add(domeCap);

    // Alternating Red/White Communications Spire (y = 149..195m)
    const spireSegments = [
      { y0: 149, h: 10, r0: 2.0, r1: 1.4, mat: redAccentMat },
      { y0: 159, h: 10, r0: 1.4, r1: 1.0, mat: concreteWhiteMat },
      { y0: 169, h: 10, r0: 1.0, r1: 0.65, mat: redAccentMat },
      { y0: 179, h: 9,  r0: 0.65, r1: 0.40, mat: concreteWhiteMat },
      { y0: 188, h: 7,  r0: 0.40, r1: 0.18, mat: redAccentMat }
    ];
    spireSegments.forEach(sp => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(sp.r1, sp.r0, sp.h, 10), sp.mat);
      m.position.y = sp.y0 + sp.h * 0.5;
      tGroup.add(m);
    });

    // Top Red Aviation Beacon + 6 Observation Deck Obstruction Lights
    const beaconMat = new THREE.MeshBasicMaterial({ color: 0xff2626 });
    const topBeacon = new THREE.Mesh(new THREE.SphereGeometry(1.15, 10, 10), beaconMat);
    topBeacon.position.y = 195.8;
    tGroup.add(topBeacon);

    const subLightGeo = new THREE.SphereGeometry(0.45, 6, 6);
    for (let l = 0; l < 6; l++) {
      const ang = (l / 6) * Math.PI * 2;
      const bulb = new THREE.Mesh(subLightGeo, beaconMat);
      bulb.position.set(Math.cos(ang) * 19.3, 139.5, Math.sin(ang) * 19.3);
      tGroup.add(bulb);
    }

    this.trackGroup.add(tGroup);
  }

  /**
   * 360-degree Buenos Aires Skyline & Distant Parkland Horizon
   * Centered around (20, 0, 80) at radius 540m..860m.
   */
  createBuildingFacadeTextures() {
    const defs = [
      // 0: Cool Modern Glass Tower Grid (Microcentro / Puerto Madero)
      { base: '#1e3a5f', winOff: '#2e517d', winLit: '#fef08a', cols: 8, rows: 16 },
      // 1: Warm Concrete Apartment / Villa Lugano Monoblock Grid
      { base: '#94a3b8', winOff: '#475569', winLit: '#fde68a', cols: 10, rows: 12 },
      // 2: Mid-Rise Suburban / Industrial Block
      { base: '#64748b', winOff: '#334155', winLit: '#fed7aa', cols: 6, rows: 10 }
    ];

    return defs.map((d, idx) => {
      const diffC = document.createElement('canvas');
      diffC.width = 128;
      diffC.height = 256;
      const dCtx = diffC.getContext('2d');

      const emC = document.createElement('canvas');
      emC.width = 128;
      emC.height = 256;
      const eCtx = emC.getContext('2d');

      dCtx.fillStyle = d.base;
      dCtx.fillRect(0, 0, 128, 256);
      eCtx.fillStyle = '#000000';
      eCtx.fillRect(0, 0, 128, 256);

      const cw = 128 / d.cols;
      const ch = 256 / d.rows;
      for (let r = 0; r < d.rows; r++) {
        for (let c = 0; c < d.cols; c++) {
          const rnd = this.seededRandom(idx * 503 + r * 31 + c * 17);
          const lit = rnd > 0.42;
          dCtx.fillStyle = lit ? d.winLit : d.winOff;
          dCtx.fillRect(c * cw + 2, r * ch + 3, Math.max(2, cw - 4), Math.max(3, ch - 6));

          if (lit) {
            eCtx.fillStyle = d.winLit;
            eCtx.fillRect(c * cw + 2, r * ch + 3, Math.max(2, cw - 4), Math.max(3, ch - 6));
          }
        }
      }

      const map = new THREE.CanvasTexture(diffC);
      const emissiveMap = new THREE.CanvasTexture(emC);
      map.wrapS = THREE.RepeatWrapping;
      map.wrapT = THREE.RepeatWrapping;
      emissiveMap.wrapS = THREE.RepeatWrapping;
      emissiveMap.wrapT = THREE.RepeatWrapping;

      const mat = new THREE.MeshStandardMaterial({
        map,
        emissiveMap,
        emissive: 0xffe4b5,
        emissiveIntensity: 0.08,
        roughness: idx === 0 ? 0.25 : 0.72,
        metalness: idx === 0 ? 0.55 : 0.12
      });
      this.emissiveCityMaterials.push(mat);
      return mat;
    });
  }

  createBuenosAiresHorizon() {
    const hGroup = new THREE.Group();
    const cx = 20;
    const cz = 80;

    // Distant Continuous Low Green Tree-Line / Treed Horizon Perimeter Band (r = 515m)
    const treeWallMat = new THREE.MeshLambertMaterial({ color: 0x1e4224, side: THREE.DoubleSide });
    const treeRingSegments = 48;
    const treeRingGeo = new THREE.CylinderGeometry(515, 515, 11, treeRingSegments, 1, true);
    const treeRing = new THREE.Mesh(treeRingGeo, treeWallMat);
    treeRing.position.set(cx, 5.0, cz);
    hGroup.add(treeRing);

    const facadeMats = this.createBuildingFacadeTextures();
    const rooftopSpireMat = new THREE.MeshLambertMaterial({ color: 0xcbd5e1 });
    const aviationRedMat = new THREE.MeshBasicMaterial({ color: 0xff2626 });

    // Place ~96 skyline buildings in a full 360-deg ring (angleDeg 0..360)
    const totalBuildings = 96;
    for (let i = 0; i < totalBuildings; i++) {
      const angDeg = (i / totalBuildings) * 360 + (this.seededRandom(i * 19 + 5) - 0.5) * 2.8;
      const ang = (angDeg * Math.PI) / 180;

      const r1 = this.seededRandom(i * 41 + 11);
      const r2 = this.seededRandom(i * 67 + 23);
      const r3 = this.seededRandom(i * 89 + 37);

      let radius = 560 + r1 * 280;
      let w = 22 + r2 * 24;
      let d = 20 + r3 * 22;
      let h = 22 + r2 * 20;
      let matIdx = 2;

      if (angDeg >= 20 && angDeg <= 105) {
        // North-East: Distant Buenos Aires Microcentro / Puerto Madero Skyline behind Lago de Regatas & Salotto
        radius = 600 + r1 * 240;
        w = 24 + r2 * 22;
        d = 24 + r3 * 20;
        h = 65 + Math.pow(r1, 0.85) * 80; // 65..145m skyscrapers
        matIdx = r2 > 0.35 ? 0 : 1;
      } else if (angDeg >= 120 && angDeg <= 205) {
        // North-West: Villa Lugano / Soldati Housing Monoblocks flanking Torre Espacial
        radius = 540 + r1 * 220;
        w = 34 + r2 * 24;
        d = 18 + r3 * 14;
        h = 28 + r2 * 28; // 28..56m iconic wide monoblock slabs
        matIdx = 1;
      } else {
        // South & East: Villa Riachuelo / Avellaneda Suburban Horizon Blocks
        radius = 550 + r1 * 280;
        w = 24 + r2 * 26;
        d = 22 + r3 * 20;
        h = 16 + r2 * 22; // 16..38m
        matIdx = r3 > 0.5 ? 2 : 1;
      }

      const bx = cx + Math.cos(ang) * radius;
      const bz = cz + Math.sin(ang) * radius;

      const bMesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), facadeMats[matIdx]);
      bMesh.position.set(bx, h * 0.5 - 0.1, bz);
      bMesh.rotation.y = -ang + (r3 - 0.5) * 0.4;
      hGroup.add(bMesh);

      // Tall Microcentro Skyscrapers get Stepped Rooftop Penthouse + Spire + Aviation Dot
      if (h > 85) {
        const pent = new THREE.Mesh(
          new THREE.BoxGeometry(w * 0.55, h * 0.14, d * 0.55),
          rooftopSpireMat
        );
        pent.position.set(bx, h + h * 0.07 - 0.1, bz);
        pent.rotation.y = bMesh.rotation.y;
        hGroup.add(pent);

        if (r2 > 0.45) {
          const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.7, 16, 6), rooftopSpireMat);
          spire.position.set(bx, h + h * 0.14 + 7.5, bz);
          hGroup.add(spire);

          const dot = new THREE.Mesh(new THREE.SphereGeometry(0.9, 6, 6), aviationRedMat);
          dot.position.set(bx, h + h * 0.14 + 15.8, bz);
          hGroup.add(dot);
        }
      }
    }

    this.trackGroup.add(hGroup);
  }

  /**
   * Fast spatial query returning closest track sample, lateral offset, surface type, and progress t
   */
  getTrackInfoAt(x, z, hintIndex = null) {
    const N = this.samples.length;
    let bestIdx = 0;
    let bestDistSq = Infinity;

    if (hintIndex !== null && hintIndex >= 0) {
      // Local search window around previous frame index for O(1) speed
      const windowSize = 35;
      for (let offset = -windowSize; offset <= windowSize; offset++) {
        const idx = (hintIndex + offset + N) % N;
        const p = this.samples[idx].point;
        const dx = x - p.x;
        const dz = z - p.z;
        const dSq = dx * dx + dz * dz;
        if (dSq < bestDistSq) {
          bestDistSq = dSq;
          bestIdx = idx;
        }
      }
    }

    // Fallback full scan if far from hint
    if (bestDistSq > 900) {
      for (let i = 0; i < N; i++) {
        const p = this.samples[i].point;
        const dx = x - p.x;
        const dz = z - p.z;
        const dSq = dx * dx + dz * dz;
        if (dSq < bestDistSq) {
          bestDistSq = dSq;
          bestIdx = i;
        }
      }
    }

    const s = this.samples[bestIdx];
    const dx = x - s.point.x;
    const dz = z - s.point.z;

    // Signed lateral offset from track centerline along right vector
    const lateralOffset = dx * s.right.x + dz * s.right.z;
    const absLat = Math.abs(lateralOffset);
    const halfW = this.roadWidth * 0.5;
    const curbW = this.curbWidth;
    const wallLimit = halfW + curbW + 4.8;

    let surface = 'asphalt';
    let onCurb = false;

    if (absLat > halfW - 0.35 && absLat <= halfW + curbW + 0.25) {
      if (Math.abs(s.curvature) > 0.008) {
        surface = 'curb';
        onCurb = true;
      } else {
        surface = absLat > halfW ? 'grass' : 'asphalt';
      }
    } else if (absLat > halfW + curbW + 0.25) {
      surface = 'grass';
    }

    return {
      index: bestIdx,
      t: s.t,
      sample: s,
      elevation: s.point.y,
      lateralOffset,
      absLateral: absLat,
      surface,
      onCurb,
      wallLimit,
      cornerName: this.getCornerName(s.t)
    };
  }
}

window.BuenosAiresTrack = BuenosAiresTrack;

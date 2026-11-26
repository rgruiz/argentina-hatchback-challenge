/**
 * CarCAD — Lightweight Automotive NURBS/Catmull-Rom Spline-Patch & Blueprint Library
 * Built on Three.js r149 to sculpt true-to-life automotive class-A surfaces,
 * circular stamped wheel-arch fender flares, contoured greenhouse openings,
 * and detailed 40-segment wheel + brake assemblies without external dependencies.
 *
 * Coordinate convention (Right-handed Three.js):
 *   +Z = Front of vehicle
 *   +Y = Up
 *   +X = Left (Driver side in Argentina / LHD)
 *   -X = Right (Passenger side)
 */
(function (global) {
  'use strict';

  const THREE = global.THREE;
  if (!THREE) {
    throw new Error('CarCAD requires THREE to be loaded before js/car-cad.js');
  }

  function clamp(v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
  }

  function smoothstep(edge0, edge1, x) {
    const t = clamp((x - edge0) / (edge1 - edge0 || 1e-6), 0, 1);
    return t * t * (3 - 2 * t);
  }

  /**
   * Finds parameter u in [0, 1] on a monotonic-Z THREE.CatmullRomCurve3 such that getPoint(u).z ~= targetZ.
   */
  function sampleCurveAtZ(curve, targetZ, ascending) {
    let lo = 0;
    let hi = 1;
    const zStart = curve.getPoint(0).z;
    const zEnd = curve.getPoint(1).z;
    if (ascending) {
      if (targetZ <= zStart) return curve.getPoint(0);
      if (targetZ >= zEnd) return curve.getPoint(1);
    } else {
      if (targetZ >= zStart) return curve.getPoint(0);
      if (targetZ <= zEnd) return curve.getPoint(1);
    }

    for (let it = 0; it < 16; it++) {
      const mid = 0.5 * (lo + hi);
      const zm = curve.getPoint(mid).z;
      if (ascending ? zm < targetZ : zm > targetZ) {
        lo = mid;
      } else {
        hi = mid;
      }
    }
    return curve.getPoint(0.5 * (lo + hi));
  }

  /**
   * Evaluate a smooth centripetal Catmull-Rom spline.
   * Supports two input formats:
   *  1) Point list: [[x, y, z], ...] or [[x, y], ...] or [{x,y,z}, ...]
   *     -> returns array of `numSamples` sampled [x, y, z] (or [x, y]) coordinates.
   *  2) Loft station list: [{ z, pts: [[x0, y0], ...] }, ...]
   *     -> builds one centripetal CatmullRomCurve3 per cross-section column, aligns samples
   *        across columns by Z (or parameter t if Z is non-monotonic), and returns
   *        `numSamples` dense [{ z, pts: [[x, y], ...] }] stations.
   */
  function evaluateCubicSpline(controlPoints, numSamples) {
    const samples = Math.max(2, numSamples || 24);
    if (!Array.isArray(controlPoints) || controlPoints.length < 2) {
      return controlPoints ? controlPoints.slice() : [];
    }

    const first = controlPoints[0];

    // Format 2: Loft stations [{ z, pts: [[x, y], ...] }, ...]
    // Supports optional per-point dz offset: [x, y, dz] -> z_point = st.z + dz
    if (first && typeof first === 'object' && !Array.isArray(first) && Array.isArray(first.pts)) {
      const colCount = first.pts.length;
      const curves = [];
      for (let c = 0; c < colCount; c++) {
        const colPts = controlPoints.map(st => {
          const p = st.pts[c] || [0, 0];
          const dz = p.length > 2 ? (p[2] || 0) : 0;
          return new THREE.Vector3(p[0], p[1], st.z + dz);
        });
        curves.push(new THREE.CatmullRomCurve3(colPts, false, 'centripetal', 0.5));
      }

      const zSpine = curves[0];
      const out = [];
      for (let s = 0; s < samples; s++) {
        const t = s / (samples - 1);
        const spinePt = zSpine.getPoint(t);
        const z = spinePt.z;
        const pts = [];
        for (let c = 0; c < colCount; c++) {
          const v = (c === 0) ? spinePt : curves[c].getPoint(t);
          const dz = v.z - z;
          pts.push(Math.abs(dz) > 1e-6 ? [v.x, v.y, dz] : [v.x, v.y]);
        }
        out.push({ z, pts });
      }
      return out;
    }

    // Format 1: 2D or 3D point array
    const is2D = Array.isArray(first) && first.length === 2;
    const vecs = controlPoints.map(p => {
      if (Array.isArray(p)) {
        return new THREE.Vector3(p[0], p[1], p.length > 2 ? p[2] : 0);
      }
      return new THREE.Vector3(p.x || 0, p.y || 0, p.z || 0);
    });

    const curve = new THREE.CatmullRomCurve3(vecs, false, 'centripetal', 0.5);
    const pts = [];
    for (let i = 0; i < samples; i++) {
      const p = curve.getPoint(i / (samples - 1));
      pts.push(is2D ? [p.x, p.y] : [p.x, p.y, p.z]);
    }
    return pts;
  }

  /**
   * Creates a Three.js BufferGeometry from position/index arrays and computes smooth normals.
   */
  function createIndexedGeometry(positions, indices) {
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geom.setIndex(indices);
    geom.computeVertexNormals();
    return geom;
  }

  /**
   * Builds a symmetric Left (+X) & Right (-X) 3D stamped wheel-arch fender flare ribbon.
   * Adds an inward hem return lip inside the arch plus a beveled outer flare face so
   * wheel arches read as crisp sculpted sheetmetal flanges instead of flat polygons.
   */
  function buildWheelArchFenderRibbon(
    wheelZ,
    wheelY,
    innerR,
    outerR,
    xInner,
    xOuter,
    startAngle,
    endAngle,
    segments,
    material
  ) {
    const segs = Math.max(12, segments || 28);
    const a0 = startAngle !== undefined ? startAngle : -0.22;
    const a1 = endAngle !== undefined ? endAngle : Math.PI + 0.22;

    const rMid = innerR + (outerR - innerR) * 0.42;
    const xCrown = Math.max(xInner, xOuter) + 0.008;
    const xHem = xInner - 0.032;

    // Cross-section rings radially around the wheel center:
    // 0: inward return flange deep inside wheelwell
    // 1: sharp lip edge at innerR
    // 2: stamped brow crest
    // 3: outer blend seam flush against fender/quarter panel
    const rings = [
      { r: innerR - 0.004, x: xHem },
      { r: innerR, x: xInner },
      { r: rMid, x: xCrown },
      { r: outerR, x: xOuter }
    ];

    const group = new THREE.Group();
    const ringCount = rings.length;

    [-1, 1].forEach(side => {
      const positions = [];
      const indices = [];

      for (let i = 0; i <= segs; i++) {
        const theta = a0 + (a1 - a0) * (i / segs);
        const cosT = Math.cos(theta);
        const sinT = Math.sin(theta);

        for (let k = 0; k < ringCount; k++) {
          const z = wheelZ + rings[k].r * cosT;
          const y = wheelY + rings[k].r * sinT;
          const x = side * rings[k].x;
          positions.push(x, y, z);
        }
      }

      for (let i = 0; i < segs; i++) {
        for (let k = 0; k < ringCount - 1; k++) {
          const a = i * ringCount + k;
          const b = (i + 1) * ringCount + k;
          const c = (i + 1) * ringCount + (k + 1);
          const d = i * ringCount + (k + 1);

          // On +X side, increasing theta moves +Z -> -Z while increasing k moves radially out.
          // Outward (+X) winding is (a, d, c) and (a, c, b). Reverse on -X side.
          if (side > 0) {
            indices.push(a, d, c, a, c, b);
          } else {
            indices.push(a, c, d, a, b, c);
          }
        }
      }

      const geom = createIndexedGeometry(positions, indices);
      const mesh = new THREE.Mesh(geom, material);
      group.add(mesh);
    });

    return group;
  }

  /**
   * Evaluates a 1D-over-Z profile spline curve `[z, y, x]` at arbitrary `targetZ`.
   */
  function createZProfileEvaluator(ptsZYX) {
    const vecs = ptsZYX.map(p => new THREE.Vector3(p[2], p[1], p[0])); // x=width, y=height, z=longitudinal
    const curve = new THREE.CatmullRomCurve3(vecs, false, 'centripetal', 0.5);
    const z0 = vecs[0].z;
    const z1 = vecs[vecs.length - 1].z;
    const ascending = z1 >= z0;

    return function evalAtZ(z) {
      const clampedZ = ascending ? clamp(z, z0, z1) : clamp(z, z1, z0);
      const v = sampleCurveAtZ(curve, clampedZ, ascending);
      return { x: v.x, y: v.y, z: v.z };
    };
  }

  /**
   * Builds sculpted, high-station-density symmetric Left (+X) & Right (-X) body side panels
   * with genuine circular wheel-arch cutouts, crisp body character crease splits, rocker sills,
   * and optional flush spline panel shut-lines.
   *
   * blueprint = {
   *   zRear: -2.02,
   *   zFront: 2.02,
   *   uniformStations: 48,
   *   archAngularSteps: 22,
   *   frontArch: { z, y, cutR, seamR, lipX },
   *   rearArch:  { z, y, cutR, seamR, lipX },
   *   // Longitudinal profiles: array of [z, y, x] from rear (-Z) to front (+Z)
   *   rows: [
   *     profileRocker,    // row 0: lower sill / bumper bottom
   *     profileUndercut,  // row 1: lower door sculpt / undercut
   *     profileMid,       // row 2: mid-door barrel max beam
   *     profileShoulder,  // row 3: upper shoulder / Tornado character crease
   *     profileBeltline   // row 4: top edge meeting greenhouse & hood fender crest
   *   ],
   *   creaseRows: [3],        // row indices where upper & lower normals split for a razor character line
   *   shutLines: [            // optional recessed dark door/fender panel gaps
   *     { pts: [[x, y, z], ...], width: 0.006, material: shutMat }
   *   ]
   * }
   */
  function buildSculptedSideBody(blueprint, material) {
    const zRear = blueprint.zRear;
    const zFront = blueprint.zFront;
    const baseCount = Math.max(24, blueprint.uniformStations || 48);
    const archSteps = Math.max(12, blueprint.archAngularSteps || 22);

    const arches = [];
    if (blueprint.rearArch) arches.push(blueprint.rearArch);
    if (blueprint.frontArch) arches.push(blueprint.frontArch);

    // 1. Collect dense sorted Z stations, injecting uniform-angle arch samples so
    // circular wheel openings never step or jag along near-vertical sides.
    const rawZ = [];
    for (let i = 0; i < baseCount; i++) {
      rawZ.push(zRear + (zFront - zRear) * (i / (baseCount - 1)));
    }

    arches.forEach(arch => {
      const r = arch.cutR;
      const aMin = arch.startAngle !== undefined ? arch.startAngle : -0.34;
      const aMax = arch.endAngle !== undefined ? arch.endAngle : Math.PI + 0.34;
      for (let k = 0; k <= archSteps; k++) {
        const theta = aMin + (aMax - aMin) * (k / archSteps);
        const z = arch.z + r * Math.cos(theta);
        if (z > zRear + 0.003 && z < zFront - 0.003) {
          rawZ.push(z);
        }
      }
    });

    rawZ.sort((a, b) => a - b);
    const zStations = [];
    for (let i = 0; i < rawZ.length; i++) {
      if (zStations.length === 0 || rawZ[i] - zStations[zStations.length - 1] > 0.0035) {
        zStations.push(rawZ[i]);
      }
    }
    if (Math.abs(zStations[zStations.length - 1] - zFront) > 0.001) {
      zStations[zStations.length - 1] = zFront;
    }

    const rowEvaluators = blueprint.rows.map(createZProfileEvaluator);
    const numRows = rowEvaluators.length;
    const creaseSet = new Set(blueprint.creaseRows || []);

    // Build table of evaluated [x, y, z] per station & logical row
    const stationRows = zStations.map(z => {
      const pts = rowEvaluators.map(fn => fn(z));
      const yBottomNatural = pts[0].y;
      const yTop = pts[numRows - 1].y;

      // Apply exact circular wheel arch cutout on row 0 and adjust rows cleanly above it
      let yBottom = yBottomNatural;
      let onArchLip = false;
      let archLipX = null;

      for (let aIdx = 0; aIdx < arches.length; aIdx++) {
        const arch = arches[aIdx];
        const dz = z - arch.z;
        const r = arch.cutR;
        if (Math.abs(dz) < r) {
          const archY = arch.y + Math.sqrt(Math.max(0, r * r - dz * dz));
          if (archY > yBottom) {
            yBottom = archY;
            onArchLip = true;
            if (arch.lipX !== undefined) {
              archLipX = arch.lipX;
            }
          }
        }
      }

      // Clamp bottom below top safely
      yBottom = Math.min(yBottom, yTop - 0.04);

      const resolved = [];
      for (let r = 0; r < numRows; r++) {
        let x = pts[r].x;
        let y = pts[r].y;

        if (r === 0) {
          y = yBottom;
          if (onArchLip && archLipX !== null) {
            x = archLipX;
          }
        } else if (r === numRows - 1) {
          y = yTop;
        } else {
          // Natural fractional height between rocker and beltline
          const natSpan = Math.max(0.05, yTop - yBottomNatural);
          const frac = clamp((y - yBottomNatural) / natSpan, 0.08 * r, 0.96);
          const archMinY = yBottom + (yTop - yBottom) * Math.min(0.85, frac);

          if (onArchLip) {
            // Smoothly raise lower side rows around wheel arch tops so rows never invert or pinch
            const lift = smoothstep(0.0, 0.25, yBottom - yBottomNatural);
            y = y * (1 - lift) + Math.max(y, archMinY) * lift;

            // Blend lower row width neatly into arch seam x so surface flows cleanly into fender flare
            if (archLipX !== null && r <= 2) {
              const wBlend = lift * (r === 1 ? 0.85 : 0.45);
              x = x * (1 - wBlend) + archLipX * wBlend;
            }
          }

          const prevY = resolved[r - 1].y;
          if (y < prevY + 0.008) {
            y = Math.min(yTop - 0.006 * (numRows - 1 - r), prevY + 0.008);
          }
        }

        resolved.push({ x, y, z });
      }

      return resolved;
    });

    const group = new THREE.Group();
    const numZ = stationRows.length;

    // Build symmetric Left (+X) and Right (-X) body shells.
    // Because crease rows duplicate vertices only for split normals between strips,
    // we iterate logical strips r = 0 .. numRows-2 cleanly!
    [-1, 1].forEach(side => {
      // Build each strip between row r and r+1:
      // Wait: if r and r+1 share vertices when NOT in creaseSet, continuous strips compute smooth normals;
      // when split at a crease row, separate bands keep crisp edge lighting!
      const bands = [];
      let curBand = [0];
      for (let r = 1; r < numRows; r++) {
        curBand.push(r);
        if (creaseSet.has(r) && r < numRows - 1) {
          bands.push(curBand);
          curBand = [r];
        }
      }
      if (curBand.length >= 2) bands.push(curBand);

      bands.forEach(bandRows => {
        const positions = [];
        const indices = [];
        const bLen = bandRows.length;

        for (let i = 0; i < numZ; i++) {
          for (let br = 0; br < bLen; br++) {
            const p = stationRows[i][bandRows[br]];
            positions.push(side * p.x, p.y, p.z);
          }
        }

        for (let i = 0; i < numZ - 1; i++) {
          for (let br = 0; br < bLen - 1; br++) {
            const a = i * bLen + br;
            const b = (i + 1) * bLen + br;
            const c = (i + 1) * bLen + (br + 1);
            const d = i * bLen + (br + 1);

            if (side > 0) {
              indices.push(a, d, c, a, c, b);
            } else {
              indices.push(a, c, d, a, b, c);
            }
          }
        }

        const geom = createIndexedGeometry(positions, indices);
        group.add(new THREE.Mesh(geom, material));
      });
    });

    // Optional flush spline door / fender shut-line ribbons
    if (Array.isArray(blueprint.shutLines)) {
      blueprint.shutLines.forEach(sl => {
        const pts = evaluateCubicSpline(sl.pts, sl.samples || 20);
        const w = (sl.width || 0.0055) * 0.5;
        const offsetX = sl.offsetX !== undefined ? sl.offsetX : 0.0022;
        const mat = sl.material || material;

        [-1, 1].forEach(side => {
          const positions = [];
          const indices = [];
          for (let i = 0; i < pts.length; i++) {
            const p = pts[i];
            const prev = pts[Math.max(0, i - 1)];
            const next = pts[Math.min(pts.length - 1, i + 1)];
            let dz = next[2] - prev[2];
            let dy = next[1] - prev[1];
            const len = Math.hypot(dz, dy) || 1;
            // Perpendicular in YZ plane
            const nz = -dy / len;
            const ny = dz / len;
            const x = side * (Math.abs(p[0]) + offsetX);
            positions.push(x, p[1] - ny * w, p[2] - nz * w);
            positions.push(x, p[1] + ny * w, p[2] + nz * w);
          }
          for (let i = 0; i < pts.length - 1; i++) {
            const a = i * 2;
            const b = a + 1;
            const c = (i + 1) * 2 + 1;
            const d = (i + 1) * 2;
            if (side > 0) {
              indices.push(a, b, c, a, c, d);
            } else {
              indices.push(a, c, b, a, d, c);
            }
          }
          const geom = createIndexedGeometry(positions, indices);
          group.add(new THREE.Mesh(geom, mat));
        });
      });
    }

    return group;
  }

  /**
   * Helper to build an angled, tumblehome-matched 3D pillar slab (for B-pillar or rear quarter bar).
   */
  function buildContouredPillar(cfg, side) {
    const zB = cfg.zBottom;
    const zT = cfg.zTop;
    const yB = cfg.yBottom;
    const yT = cfg.yTop;
    const xB = cfg.xBottom + (cfg.xOffset || 0.003);
    const xT = cfg.xTop + (cfg.xOffset || 0.003);
    const wB = (cfg.widthBottom !== undefined ? cfg.widthBottom : cfg.width || 0.07) * 0.5;
    const wT = (cfg.widthTop !== undefined ? cfg.widthTop : cfg.width || 0.06) * 0.5;
    const depth = cfg.thickness || 0.012;

    const positions = [
      // Outer face (0..3)
      side * xB, yB, zB - wB,
      side * xB, yB, zB + wB,
      side * xT, yT, zT + wT,
      side * xT, yT, zT - wT,
      // Inner backing face (4..7)
      side * (xB - depth), yB, zB - wB,
      side * (xB - depth), yB, zB + wB,
      side * (xT - depth), yT, zT + wT,
      side * (xT - depth), yT, zT - wT
    ];

    let indices;
    if (side > 0) {
      indices = [
        0, 3, 2, 0, 2, 1, // outer (+X)
        4, 5, 6, 4, 6, 7, // inner
        1, 2, 6, 1, 6, 5, // front cap
        0, 4, 7, 0, 7, 3  // rear cap
      ];
    } else {
      indices = [
        0, 2, 3, 0, 1, 2,
        4, 6, 5, 4, 7, 6,
        1, 6, 2, 1, 5, 6,
        0, 7, 4, 0, 3, 7
      ];
    }

    const geom = createIndexedGeometry(positions, indices);
    return new THREE.Mesh(geom, cfg.material);
  }

  /**
   * Builds Left (+X) & Right (-X) curved spline Daylight Opening (DLO) glass,
   * continuous 3D rubber/black perimeter seal frame, slanted B-pillar, and optional quarter divider pillar.
   *
   * sideWindowPts: closed loop control points `[[x, y, z], ...]` OR `{ pts: [[x,y,z],...], samples, frameWidth }`
   */
  function buildGreenhouseWindowAndFrame(sideWindowPts, bPillarConfig, qPillarConfig, glassMat, frameMat) {
    const isObj = !Array.isArray(sideWindowPts) && sideWindowPts && Array.isArray(sideWindowPts.pts);
    const rawPts = isObj ? sideWindowPts.pts : sideWindowPts;
    const loopSamples = (isObj && sideWindowPts.samples) ? sideWindowPts.samples : 72;
    const frameW = (isObj && sideWindowPts.frameWidth) ? sideWindowPts.frameWidth : 0.022;
    const frameOut = (isObj && sideWindowPts.frameOut !== undefined) ? sideWindowPts.frameOut : 0.009;

    const vecs = rawPts.map(p => new THREE.Vector3(Math.abs(p[0]), p[1], p[2]));
    const closedCurve = new THREE.CatmullRomCurve3(vecs, true, 'centripetal', 0.45);

    const loop3D = [];
    for (let i = 0; i < loopSamples; i++) {
      loop3D.push(closedCurve.getPoint(i / loopSamples));
    }

    // 2D contour in (z, y) for clean triangulation via Three.js ShapeUtils
    const contour2D = loop3D.map(p => new THREE.Vector2(p.z, p.y));
    if (THREE.ShapeUtils.isClockWise(contour2D)) {
      contour2D.reverse();
      loop3D.reverse();
    }
    const faces = THREE.ShapeUtils.triangulateShape(contour2D, []);

    const group = new THREE.Group();

    [-1, 1].forEach(side => {
      // 1. Curved Tumblehome Side Window Glass
      const glassPos = [];
      for (let i = 0; i < loop3D.length; i++) {
        glassPos.push(side * loop3D[i].x, loop3D[i].y, loop3D[i].z);
      }
      const glassIdx = [];
      for (let f = 0; f < faces.length; f++) {
        const tri = faces[f];
        // contour2D is CCW in (z, y): e1 x e2 along +z x +y -> (dz, dy) -> (0, 0, -1)?
        // Wait: (z, y) = (u, v). On +X side, screen right is -Z, so CCW in (z,y) faces -X unless reversed.
        // Reverse winding on +X so FrontSide faces +X outward.
        if (side > 0) {
          glassIdx.push(tri[0], tri[2], tri[1]);
        } else {
          glassIdx.push(tri[0], tri[1], tri[2]);
        }
      }
      const glassGeom = createIndexedGeometry(glassPos, glassIdx);
      group.add(new THREE.Mesh(glassGeom, glassMat));

      // 2. Continuous Perimeter Rubber / Gloss-Black DLO Molding Ring
      if (frameMat) {
        const mPos = [];
        const mIdx = [];
        const n = loop3D.length;

        for (let i = 0; i < n; i++) {
          const cur = loop3D[i];
          const prev = loop3D[(i - 1 + n) % n];
          const next = loop3D[(i + 1) % n];

          const dz = next.z - prev.z;
          const dy = next.y - prev.y;
          const len = Math.hypot(dz, dy) || 1;
          // CCW tangent (dz, dy): left-hand inward normal is (-dy, dz)
          const nzIn = -dy / len;
          const nyIn = dz / len;

          const xIn = side * (cur.x + 0.0022);
          const xOut = side * (cur.x + 0.0038);

          // Inner rim (overlapping glass slightly) and outer molding flange
          mPos.push(xIn, cur.y + nyIn * 0.004, cur.z + nzIn * 0.004);
          mPos.push(xOut, cur.y - nyIn * (frameW + frameOut), cur.z - nzIn * (frameW + frameOut));
        }

        for (let i = 0; i < n; i++) {
          const iNext = (i + 1) % n;
          const a = i * 2;
          const b = i * 2 + 1;
          const c = iNext * 2 + 1;
          const d = iNext * 2;

          if (side > 0) {
            mIdx.push(a, c, b, a, d, c);
          } else {
            mIdx.push(a, b, c, a, c, d);
          }
        }

        const moldGeom = createIndexedGeometry(mPos, mIdx);
        group.add(new THREE.Mesh(moldGeom, frameMat));
      }

      // 3. Contoured B-Pillar
      if (bPillarConfig) {
        const bpCfg = Object.assign({ material: frameMat }, bPillarConfig);
        group.add(buildContouredPillar(bpCfg, side));
      }

      // 4. Optional Quarter Glass Divider Pillar
      if (qPillarConfig) {
        const qpCfg = Object.assign({ material: frameMat }, qPillarConfig);
        group.add(buildContouredPillar(qpCfg, side));
      }
    });

    return group;
  }

  /**
   * Builds a detailed 40-segment wheel & brake assembly.
   * Returns `{ spinGroup, staticGroup }` so `spinGroup` rotates with wheel speed
   * while `staticGroup` (brake caliper + knuckle backing) stays stationary on steerPivot/chassis!
   */
  function buildDetailedWheelAssembly(options) {
    const opts = options || {};
    const radius = opts.radius || 0.305;
    const width = opts.width || 0.195;
    const rimRadius = opts.rimRadius || 0.210;
    const side = opts.side || 1; // +1 Left (+X), -1 Right (-X)
    const segs = Math.max(24, opts.segments || 40);
    const style = opts.style || 'polo_cover';

    const tireMat = opts.tireMat;
    const sidewallMat = opts.sidewallMat || tireMat;
    const rimMat = opts.rimMat;
    const spokeMat = opts.spokeMat || rimMat;
    const hubMat = opts.hubMat || rimMat;
    const rotorMat = opts.rotorMat || rimMat;
    const caliperMat = opts.caliperMat || spokeMat;

    const spinGroup = new THREE.Group();
    const staticGroup = new THREE.Group();

    const halfW = width * 0.5;
    const chamferW = 0.018;
    const treadFlatW = width - 2 * chamferW;
    const shoulderR = radius - 0.011;

    // 1. Main high-segment tire tread cylinder
    const treadMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(radius, radius, treadFlatW, segs),
      tireMat
    );
    treadMesh.rotation.z = Math.PI / 2;
    treadMesh.castShadow = true;
    spinGroup.add(treadMesh);

    // 2. Rounded rubber tire shoulder bevels (outer & inner)
    [-1, 1].forEach(endSide => {
      const bevelGeo = endSide > 0
        ? new THREE.CylinderGeometry(shoulderR, radius, chamferW, segs)
        : new THREE.CylinderGeometry(radius, shoulderR, chamferW, segs);
      const bevel = new THREE.Mesh(bevelGeo, tireMat);
      bevel.rotation.z = Math.PI / 2;
      bevel.position.x = endSide * (treadFlatW * 0.5 + chamferW * 0.5);
      spinGroup.add(bevel);
    });

    // 3. True circular tire sidewall rings (NO unequal X/Y scaling)
    const swGeo = new THREE.RingGeometry(rimRadius - 0.002, shoulderR + 0.001, segs);
    const outerSW = new THREE.Mesh(swGeo, sidewallMat);
    outerSW.rotation.y = side * (Math.PI / 2);
    outerSW.position.x = side * (halfW - 0.001);
    spinGroup.add(outerSW);

    const innerSW = new THREE.Mesh(swGeo, sidewallMat);
    innerSW.rotation.y = -side * (Math.PI / 2);
    innerSW.position.x = -side * (halfW - 0.001);
    spinGroup.add(innerSW);

    // 4. Recessed steel/dark inner wheel barrel so openings have 3D depth
    const barrelMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(rimRadius, rimRadius, width * 0.84, segs, 1, true),
      spokeMat
    );
    barrelMesh.rotation.z = Math.PI / 2;
    spinGroup.add(barrelMesh);

    // Dark inner wheelhouse backing disc deep behind brake rotor
    const backDisc = new THREE.Mesh(
      new THREE.CircleGeometry(rimRadius - 0.005, segs),
      new THREE.MeshStandardMaterial({ color: 0x0b0d10, roughness: 0.9, side: THREE.DoubleSide })
    );
    backDisc.rotation.y = side * (Math.PI / 2);
    backDisc.position.x = side * (halfW - 0.088);
    spinGroup.add(backDisc);

    // 5. Spinning Ventilated Steel Brake Disc Rotor
    const rotorRadius = rimRadius * 0.68;
    const rotor = new THREE.Mesh(
      new THREE.CylinderGeometry(rotorRadius, rotorRadius, 0.016, 28),
      rotorMat
    );
    rotor.rotation.z = Math.PI / 2;
    rotor.position.x = side * (halfW - 0.046);
    spinGroup.add(rotor);

    // Subtle brake rotor hat
    const rotorHat = new THREE.Mesh(
      new THREE.CylinderGeometry(0.068, 0.072, 0.022, 20),
      spokeMat
    );
    rotorHat.rotation.z = Math.PI / 2;
    rotorHat.position.x = side * (halfW - 0.042);
    spinGroup.add(rotorHat);

    // 6. Stationary Brake Caliper (attached to staticGroup so it doesn't spin!)
    const caliper = new THREE.Mesh(
      new THREE.BoxGeometry(0.046, 0.092, 0.056),
      caliperMat
    );
    const calZ = (opts.isRear ? 1 : -1) * (rotorRadius * 0.72);
    caliper.position.set(side * (halfW - 0.046), rotorRadius * 0.42, calZ);
    caliper.rotation.x = opts.isRear ? 0.55 : -0.55;
    staticGroup.add(caliper);

    // 7. Outer Rim Lip Ring
    const lipRing = new THREE.Mesh(
      new THREE.RingGeometry(rimRadius - 0.015, rimRadius, segs),
      rimMat
    );
    lipRing.rotation.y = side * (Math.PI / 2);
    lipRing.position.x = side * (halfW + 0.001);
    spinGroup.add(lipRing);

    const faceX = side * (halfW - 0.002);

    // 8. Sculpted Wheel Face Geometry
    if (style === 'peugeot_diamond') {
      // 5 twin diamond-cut Y-spokes with gloss-black pockets (Peugeot 208 Style/Like)
      const spokeCount = 5;
      for (let s = 0; s < spokeCount; s++) {
        const ang = (s / spokeCount) * Math.PI * 2;
        [-0.22, 0.22].forEach(branchOffset => {
          const arm = new THREE.Mesh(
            new THREE.BoxGeometry(0.012, rimRadius - 0.042, 0.026),
            rimMat
          );
          const a = ang + branchOffset * 0.52;
          const midR = 0.036 + (rimRadius - 0.046) * 0.5;
          arm.position.set(faceX - side * 0.002, Math.cos(a) * midR, Math.sin(a) * midR);
          arm.rotation.x = a - branchOffset * 0.28;
          spinGroup.add(arm);

          // Gloss black flank accent behind machined face
          const pocket = new THREE.Mesh(
            new THREE.BoxGeometry(0.010, rimRadius - 0.048, 0.036),
            spokeMat
          );
          pocket.position.set(faceX - side * 0.006, Math.cos(a) * midR, Math.sin(a) * midR);
          pocket.rotation.x = arm.rotation.x;
          spinGroup.add(pocket);
        });
      }
    } else {
      // VW Polo Track matte-black multi-spoke "Tecton" wheel cover (10 sculpted radial spokes)
      const spokeCount = 10;
      for (let s = 0; s < spokeCount; s++) {
        const a = (s / spokeCount) * Math.PI * 2;
        const spoke = new THREE.Mesh(
          new THREE.BoxGeometry(0.012, rimRadius - 0.044, s % 2 === 0 ? 0.026 : 0.019),
          rimMat
        );
        const midR = 0.042 + (rimRadius - 0.048) * 0.5;
        spoke.position.set(faceX - side * 0.001, Math.cos(a) * midR, Math.sin(a) * midR);
        spoke.rotation.x = a;
        spinGroup.add(spoke);
      }

      // Inner cover web ring around center hub
      const hubWeb = new THREE.Mesh(
        new THREE.RingGeometry(0.038, 0.072, 24),
        rimMat
      );
      hubWeb.rotation.y = side * (Math.PI / 2);
      hubWeb.position.x = faceX;
      spinGroup.add(hubWeb);
    }

    // Center hub + lug bolts + crest cap
    const hub = new THREE.Mesh(
      new THREE.CylinderGeometry(0.038, 0.042, 0.014, 24),
      rimMat
    );
    hub.rotation.z = Math.PI / 2;
    hub.position.x = faceX - side * 0.002;
    spinGroup.add(hub);

    const cap = new THREE.Mesh(
      new THREE.CircleGeometry(0.028, 24),
      hubMat
    );
    cap.rotation.y = side * (Math.PI / 2);
    cap.position.x = faceX + side * 0.007;
    spinGroup.add(cap);

    const lugMat = rotorMat;
    const lugCount = style === 'peugeot_diamond' ? 4 : 5;
    for (let l = 0; l < lugCount; l++) {
      const a = (l / lugCount) * Math.PI * 2 + 0.3;
      const lug = new THREE.Mesh(
        new THREE.CylinderGeometry(0.0055, 0.0055, 0.010, 8),
        lugMat
      );
      lug.rotation.z = Math.PI / 2;
      lug.position.set(faceX + side * 0.003, Math.cos(a) * 0.048, Math.sin(a) * 0.048);
      spinGroup.add(lug);
    }

    return { spinGroup, staticGroup };
  }

  /**
   * Builds flush 3D rear trunk / tailgate shut-lines and horizontal creases.
   * Each seam spec: { pts: [[x, y, z], ...], width, offsetZ, samples, mirrored }
   * - mirrored: true  -> builds symmetric Left (+X) and Right (-X) strips
   * - mirrored: false -> builds one centered strip across the supplied 3D path
   */
  function buildSymmetricTrunkLines(seamLoops, material) {
    const group = new THREE.Group();
    if (!Array.isArray(seamLoops)) return group;

    seamLoops.forEach(seam => {
      const pts = evaluateCubicSpline(seam.pts, seam.samples || 24);
      const halfW = (seam.width !== undefined ? seam.width : 0.0055) * 0.5;
      const offsetZ = seam.offsetZ !== undefined ? seam.offsetZ : -0.004;
      const mat = seam.material || material;
      const sides = seam.mirrored === false ? [1] : [-1, 1];

      sides.forEach(side => {
        const positions = [];
        const indices = [];

        for (let i = 0; i < pts.length; i++) {
          const cur = pts[i];
          const prev = pts[Math.max(0, i - 1)];
          const next = pts[Math.min(pts.length - 1, i + 1)];

          const xCur = (seam.mirrored === false ? cur[0] : side * Math.abs(cur[0]));
          const xPrev = (seam.mirrored === false ? prev[0] : side * Math.abs(prev[0]));
          const xNext = (seam.mirrored === false ? next[0] : side * Math.abs(next[0]));

          const dx = xNext - xPrev;
          const dy = next[1] - prev[1];
          const len = Math.hypot(dx, dy) || 1;
          const nx = -dy / len;
          const ny = dx / len;
          const z = cur[2] + offsetZ;

          positions.push(xCur + nx * halfW, cur[1] + ny * halfW, z);
          positions.push(xCur - nx * halfW, cur[1] - ny * halfW, z);
        }

        for (let i = 0; i < pts.length - 1; i++) {
          const a = i * 2;
          const b = a + 1;
          const c = (i + 1) * 2;
          const d = c + 1;
          // Invariant -Z outward winding in XY ribbon plane
          indices.push(a, c, b, b, c, d);
        }

        const geom = createIndexedGeometry(positions, indices);
        group.add(new THREE.Mesh(geom, mat));
      });
    });

    return group;
  }

  global.CarCAD = {
    evaluateCubicSpline,
    buildWheelArchFenderRibbon,
    buildSculptedSideBody,
    buildGreenhouseWindowAndFrame,
    buildDetailedWheelAssembly,
    buildSymmetricTrunkLines
  };
})(window);

import * as THREE from 'three';

/**
 * The printer at work: the carriage slides to and fro along the crossbar, and the cables
 * and filament tube feeding it bend with it, held at their far ends on the frame.
 *
 * The model is one baked mesh — carriage, hot-end, cables and frame all in one
 * primitive — so this does not move a node: it moves vertices. Once, at setup, the mesh
 * is taken apart into its connected pieces (triangles that share a welded vertex), and
 * each piece is sorted against `HEAD_BOX`, the carriage's volume measured off the
 * geometry:
 *
 * - a piece lying wholly inside the box is the carriage, and rides along at weight 1;
 * - a piece with an end inside the box and the rest reaching out of it on one side is a
 *   cable, and its vertices get a weight that falls from 1 at the carriage to 0 at the
 *   far end, so it bows instead of tearing — provided it actually meets the carriage,
 *   below `ATTACH_Y`: the spool post stands on top of the crossbar and dips into the
 *   box's top edge the same way, and it is frame;
 * - a piece that passes straight through the box — the crossbar and its rail — is
 *   frame, and stays put, as does everything that never enters it.
 *
 * A grey vase, half printed, stands on the bed: an open, thin-walled shell whose rim is
 * where the nozzle is, as if the layers so far end there.
 *
 * Each frame then writes `base + weight × offset` into the position buffer. It is a
 * ~4,000-vertex loop with no allocations, and a 50 KB buffer upload — nothing the room
 * notices. Normals are left alone; the travel is a few centimetres and the bend gentle.
 *
 * Everything below is in the model's own frame, Y-up centimetres, measured off the
 * geometry. The mesh's own matrix (the Sketchfab root turns it) is folded in at setup,
 * so the constants read in the same frame `printer.js` seats the machine in.
 */

/** The mesh the carriage is part of. */
const BODY = '_D_Printer_3D_Printer_0';

/** The carriage and hot-end's volume, with a little room round it. */
const HEAD_BOX = new THREE.Box3(new THREE.Vector3(-8, 18, -11), new THREE.Vector3(8, 47, 6));

/**
 * A cable has to reach the carriage itself, below this height, to count as one. The
 * crossbar's top is at y ≈ 46 and the carriage runs up to 47, so a piece that only
 * enters the box above 42 is resting on the beam — the post that holds the spool up —
 * and must not bend with the head.
 */
const ATTACH_Y = 42;

/** How far the carriage runs each way along the crossbar, in centimetres. */
const TRAVEL = 5;

/**
 * The stroke before the sound is allowed: two slow sines a little out of step, so the
 * carriage eases at each end and never quite repeats — the way a head laying a contour
 * wanders rather than ticks.
 */
const STROKE = [
  { amplitude: 0.7, hertz: 0.11 },
  { amplitude: 0.3, hertz: 0.043 },
];

/**
 * The stroke once the sound plays: the carriage's speed is the motors' loudness
 * (`printerSound.js`'s envelope, 0–1, already stretched between the clip's quiet and
 * loud) raised to `CONTRAST` and scaled to `MAX_SPEED` cm/s, so it runs on the bursts
 * and idles in the lulls. It turns at each end of the travel, and also whenever the
 * motors drop under `DIP_LEVEL` after running — a lull is a move ending, and a head
 * that sets off the other way after one reads as following the sound. The speed eases
 * off towards each end so a reversal there is a slow turn, not a bounce.
 */
const MAX_SPEED = 11;
const CONTRAST = 1.6;
const DIP_LEVEL = 0.12;
const END_EASE = 0.7;

/**
 * How a cable's weight falls off along its length. Above 1 the bend gathers at the
 * carriage end and the far end sits still sooner.
 */
const CABLE_FALLOFF = 1.4;

/**
 * The part on the bed: a vase printed up to the nozzle and no further. The bed plate is
 * at y 9 and the nozzle tip at (-0.4, 24.1, 1.9), measured off the geometry, so the rim
 * is `PART_CLEARANCE` under the tip. `VASE_PROFILE` is the outline as `[radius, height]`
 * pairs in centimetres, the height of a *finished* vase — the print stops partway up
 * it, at `VASE_PRINTED` of the way, which is what makes it look unfinished: a belly
 * with no neck yet. Round the outline run `VASE_FLUTES` shallow flutes, twisted by
 * `VASE_TWIST` over the height, the way a "vase mode" print is usually dressed. The
 * wall is `VASE_WALL` thick and open at the top, so the inside shows over the rim.
 */
const BED_Y = 9;
const NOZZLE = new THREE.Vector3(-0.4, 24.1, 1.9);
const PART_CLEARANCE = 0.3;
const VASE_PROFILE = [[3.6, 0], [4.4, 2], [5.6, 7], [5.9, 11], [5.2, 16], [3.8, 20], [3.4, 23], [4.2, 26]];
const VASE_PRINTED = 0.62;
const VASE_FLUTES = 14;
const VASE_FLUTE_DEPTH = 0.07;
const VASE_TWIST = THREE.MathUtils.degToRad(70);
const VASE_WALL = 0.32;
const VASE_SEGMENTS = { around: 84, up: 48 };

/** Grey PLA, matte — authored, so `darkenScene()` must leave it alone. */
const PART_SPEC = { color: 0x8f9094, roughness: 0.82, metalness: 0 };

/** Vertices closer than this are the same vertex — the file is Draco-quantized. */
const WELD = 0.02;

/**
 * Wires the job up on a loaded, seated printer. `sound.level()` is the motors' loudness
 * at the moment being heard, or `null` while there is no sound yet. Returns
 * `{ update(dt) }`.
 */
export function setupPrinterJob(printer, sound) {
  const body = printer.getObjectByName(BODY);
  if (!body?.isMesh) return { update() {} };

  printer.add(buildPart());

  const rig = buildRig(printer, body);
  if (!rig) return { update() {} };

  const { position, base, weights, offsetLocal } = rig;
  const array = position.array;
  const offset = new THREE.Vector3();
  let elapsed = 0;
  // Where the carriage is along the crossbar, in cm off centre, and which way it runs.
  let x = 0;
  let direction = 1;
  let running = false;

  return {
    update(dt) {
      elapsed += dt;
      const level = sound?.level() ?? null;

      if (level === null) {
        let stroke = 0;
        for (const { amplitude, hertz } of STROKE) {
          stroke += amplitude * Math.sin(elapsed * hertz * Math.PI * 2);
        }
        x = TRAVEL * stroke;
      } else {
        const drive = Math.pow(level, CONTRAST);
        if (drive < DIP_LEVEL) {
          if (running) direction = -direction;
          running = false;
        } else {
          running = true;
        }
        const toward = Math.abs(x) / TRAVEL;
        const ease = 1 - END_EASE * toward * toward;
        x += direction * drive * MAX_SPEED * ease * dt;
        if (Math.abs(x) >= TRAVEL) {
          x = Math.sign(x) * TRAVEL;
          direction = -direction;
        }
      }

      // The stroke is along the printer's x; the vertices live in the mesh's own frame.
      offset.copy(offsetLocal).multiplyScalar(x);

      for (let i = 0, j = 0; i < weights.length; i++, j += 3) {
        const w = weights[i];
        array[j] = base[j] + offset.x * w;
        array[j + 1] = base[j + 1] + offset.y * w;
        array[j + 2] = base[j + 2] + offset.z * w;
      }
      position.needsUpdate = true;
    },
  };
}

/**
 * Sorts the mesh into carriage, cable and frame, and returns what the update needs: the
 * position attribute, a copy of its rest pose, a weight per vertex, and the printer's
 * x axis expressed in the mesh's own frame.
 */
function buildRig(printer, body) {
  const geometry = body.geometry;
  const position = geometry.getAttribute('position');
  const index = geometry.getIndex();
  if (!position || !index) return null;

  // Mesh frame → printer frame, for sorting; its linear inverse takes the stroke back.
  printer.updateMatrixWorld(true);
  const toPrinter = new THREE.Matrix4().copy(printer.matrixWorld).invert().multiply(body.matrixWorld);
  const offsetLocal = new THREE.Vector3(1, 0, 0)
    .transformDirection(new THREE.Matrix4().copy(toPrinter).invert());
  // `transformDirection` normalises; the mesh frame is scaled, so put the length back.
  const scale = new THREE.Vector3().setFromMatrixScale(toPrinter);
  offsetLocal.divideScalar(scale.x);

  const count = position.count;
  const points = new Array(count);
  for (let i = 0; i < count; i++) {
    points[i] = new THREE.Vector3().fromBufferAttribute(position, i).applyMatrix4(toPrinter);
  }

  // Weld coincident vertices, then union the triangles into connected pieces.
  const parent = new Int32Array(count);
  const canon = new Map();
  for (let i = 0; i < count; i++) {
    const p = points[i];
    const key = `${Math.round(p.x / WELD)},${Math.round(p.y / WELD)},${Math.round(p.z / WELD)}`;
    const first = canon.get(key);
    parent[i] = first === undefined ? i : first;
    if (first === undefined) canon.set(key, i);
  }
  const find = (i) => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  const union = (a, b) => {
    a = find(a);
    b = find(b);
    if (a !== b) parent[a] = b;
  };
  const tris = index.array;
  for (let t = 0; t < tris.length; t += 3) {
    union(tris[t], tris[t + 1]);
    union(tris[t], tris[t + 2]);
  }

  // Gather each piece's vertices and its bounds.
  const pieces = new Map();
  for (let i = 0; i < count; i++) {
    const root = find(i);
    let piece = pieces.get(root);
    if (!piece) {
      piece = { vertices: [], box: new THREE.Box3(), inside: [] };
      pieces.set(root, piece);
    }
    piece.vertices.push(i);
    piece.box.expandByPoint(points[i]);
    if (HEAD_BOX.containsPoint(points[i])) piece.inside.push(i);
  }

  const weights = new Float32Array(count);
  let carriage = 0;
  for (const piece of pieces.values()) {
    if (piece.inside.length === 0) continue;

    if (piece.inside.length === piece.vertices.length) {
      for (const i of piece.vertices) weights[i] = 1;
      carriage++;
      continue;
    }

    // A piece that runs out of the box on both sides of any axis is frame passing
    // through, not a cable leaving it.
    const { min, max } = piece.box;
    const straddles = ['x', 'y', 'z'].some(
      (axis) => min[axis] < HEAD_BOX.min[axis] && max[axis] > HEAD_BOX.max[axis]
    );
    if (straddles) continue;

    // Resting on the beam, not hanging off the carriage.
    if (!piece.inside.some((i) => points[i].y < ATTACH_Y)) continue;

    weighCable(piece, points, weights);
  }

  if (carriage === 0) return null;

  // The stroke moves vertices past the rest-pose bounds; widen the sphere (it is in the
  // mesh's own units) so culling never clips the carriage at the end of its run.
  geometry.computeBoundingSphere();
  geometry.boundingSphere.radius += TRAVEL / scale.x;

  return {
    position,
    base: Float32Array.from(position.array),
    weights,
    offsetLocal,
  };
}

/** The part being printed, stood on the bed under the nozzle. */
function buildPart() {
  const height = NOZZLE.y - BED_Y - PART_CLEARANCE;
  const geometry = buildVase(height);
  const material = new THREE.MeshStandardMaterial({ name: 'Printer_part', ...PART_SPEC });
  material.userData.keepColor = true;
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'Printer_part';
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.position.set(NOZZLE.x, BED_Y, NOZZLE.z);
  return mesh;
}

/** The finished vase's radius at `h` cm up it, read off `VASE_PROFILE`. */
function vaseRadius(h) {
  const p = VASE_PROFILE;
  for (let i = 1; i < p.length; i++) {
    if (h <= p[i][1]) {
      const t = (h - p[i - 1][1]) / (p[i][1] - p[i - 1][1]);
      return THREE.MathUtils.lerp(p[i - 1][0], p[i][0], t);
    }
  }
  return p[p.length - 1][0];
}

/**
 * The half-printed vase as one indexed geometry, `height` cm tall: an outer skin, an
 * inner skin one wall in from it, a flat rim joining them at the top and a disc closing
 * the bottom. The printed fraction of the finished profile is stretched over the
 * height, so the rim lands under the nozzle whatever the profile says.
 */
function buildVase(height) {
  const { around, up } = VASE_SEGMENTS;
  const finished = VASE_PROFILE[VASE_PROFILE.length - 1][1];
  const printed = finished * VASE_PRINTED;

  const positions = [];
  const indices = [];

  // One ring of `around` vertices at height fraction `v`, `inset` cm inside the skin.
  const ring = (v, inset) => {
    const first = positions.length / 3;
    const y = v * height;
    const base = vaseRadius(v * printed) - inset;
    for (let i = 0; i < around; i++) {
      const a = (i / around) * Math.PI * 2;
      const flute = 1 + VASE_FLUTE_DEPTH * Math.cos(VASE_FLUTES * a + VASE_TWIST * v);
      const r = base * flute;
      positions.push(r * Math.cos(a), y, r * Math.sin(a));
    }
    return first;
  };
  // Quads between two rings. The angle runs clockwise seen from above, so the plain
  // winding faces in; `flip` turns it out.
  const band = (lower, upper, flip) => {
    for (let i = 0; i < around; i++) {
      const j = (i + 1) % around;
      const a = lower + i, b = lower + j, c = upper + i, d = upper + j;
      if (flip) indices.push(a, c, b, b, c, d);
      else indices.push(a, b, c, b, d, c);
    }
  };

  const outer = [];
  const inner = [];
  for (let k = 0; k <= up; k++) {
    const v = k / up;
    outer.push(ring(v, 0));
    inner.push(ring(v, VASE_WALL));
  }
  for (let k = 0; k < up; k++) {
    band(outer[k], outer[k + 1], true);
    band(inner[k], inner[k + 1], false);
  }
  // The rim: outer top ring to inner top ring, facing up.
  band(outer[up], inner[up], true);

  // The bottom: a fan from the centre to the outer base ring, facing down.
  const centre = positions.length / 3;
  positions.push(0, 0, 0);
  for (let i = 0; i < around; i++) {
    indices.push(centre, outer[0] + i, outer[0] + ((i + 1) % around));
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * Weights one cable: 1 where it meets the carriage, 0 at its far end, eased between.
 * The cable's run is taken as the line from the middle of its in-box vertices to the
 * vertex furthest from there, and each vertex is placed along it by projection — so a
 * curved cable still bows smoothly rather than by its distance from the head.
 */
function weighCable(piece, points, weights) {
  const near = new THREE.Vector3();
  for (const i of piece.inside) near.add(points[i]);
  near.divideScalar(piece.inside.length);

  let far = null;
  let farthest = -1;
  for (const i of piece.vertices) {
    const d = points[i].distanceToSquared(near);
    if (d > farthest) {
      farthest = d;
      far = points[i];
    }
  }

  const run = new THREE.Vector3().subVectors(far, near);
  const length = run.lengthSq();
  const rel = new THREE.Vector3();
  for (const i of piece.vertices) {
    const t = THREE.MathUtils.clamp(rel.subVectors(points[i], near).dot(run) / length, 0, 1);
    weights[i] = Math.pow(1 - THREE.MathUtils.smoothstep(t, 0, 1), CABLE_FALLOFF);
  }
}

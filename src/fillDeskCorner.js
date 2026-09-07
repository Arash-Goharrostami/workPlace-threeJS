import * as THREE from 'three';

/** Vertices within this of the top surface count as the tabletop outline. */
const TOP_EPSILON = 0.5;

/** Points this close on an axis are treated as sharing that edge. */
const EDGE_EPSILON = 1.0;

/**
 * A corner triangle bigger than this share of the footprint is the L's own inner
 * notch (~20%), not the chamfer (~4%), and must be left alone.
 */
const MAX_TRIANGLE_AREA_RATIO = 0.1;

/**
 * The desk model's outer corner is cut off by a 45° chamfer. This fills it with a
 * matching prism so the top reads as a complete L. Everything is measured from the
 * live geometry, so it still lands correctly if the desk is re-fitted or rescaled.
 *
 * Returns the patch mesh, or null when no chamfer is found.
 */
export function fillDeskCorner(desk) {
  desk.updateMatrixWorld(true);

  const { outline, topY, underY, material, topUV, topSamples } = readTopSurface(desk);
  if (outline.length < 3 || !material) return null;

  const triangle = findChamfer(outline);
  if (!triangle) return null;

  const shape = new THREE.Shape();
  shape.moveTo(triangle[0].x, triangle[0].y);
  shape.lineTo(triangle[1].x, triangle[1].y);
  shape.lineTo(triangle[2].x, triangle[2].y);
  shape.closePath();

  const thickness = Math.max(topY - underY, 0.5);
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false });
  // The shape is authored in XZ but extrudes along +Z, so lay it flat and flip it
  // so the extrusion runs downward from the surface.
  geometry.rotateX(Math.PI / 2);
  geometry.computeVertexNormals();

  // Continuing the desktop's own UV mapping lets the patch share the desk's exact
  // material, so the texture runs across the joint as one surface.
  const uvMap = fitPlanarUVs(topSamples);
  if (uvMap) applyUVs(geometry, uvMap);

  const patch = new THREE.Mesh(geometry, uvMap ? material : patchMaterial(material, topUV));
  patch.name = 'Desk_corner_patch';
  patch.castShadow = true;
  patch.receiveShadow = true;
  patch.position.y = topY;

  // Parented to the desk so it follows any later transform, but the geometry is
  // already in world units — undo the desk's own transform to keep it in place.
  desk.add(patch);
  patch.applyMatrix4(new THREE.Matrix4().copy(desk.matrixWorld).invert());

  return patch;
}

/**
 * Top-surface outline (unique XZ points), its height, the slab underside, the desk
 * material, and the centroid of the top face's UVs (used to sample its own shade).
 */
function readTopSurface(desk) {
  const vertex = new THREE.Vector3();
  const points = [];
  const uvs = [];
  let topY = -Infinity;
  let material = null;

  desk.traverse((node) => {
    if (!node.isMesh) return;
    material ??= Array.isArray(node.material) ? node.material[0] : node.material;
    const position = node.geometry.attributes.position;
    const uv = node.geometry.attributes.uv;
    for (let i = 0; i < position.count; i++) {
      vertex.fromBufferAttribute(position, i).applyMatrix4(node.matrixWorld);
      points.push(vertex.clone());
      if (uv) uvs.push({ x: vertex.x, y: vertex.y, z: vertex.z, u: uv.getX(i), v: uv.getY(i) });
      if (vertex.y > topY) topY = vertex.y;
    }
  });

  const top = points.filter((p) => p.y > topY - TOP_EPSILON);
  const slab = points.filter((p) => p.y > topY - TOP_EPSILON * 40 && p.y < topY - TOP_EPSILON);
  const underY = slab.length ? Math.max(...slab.map((p) => p.y)) : topY - 1;

  const seen = new Set();
  const outline = [];
  for (const p of top) {
    const key = `${p.x.toFixed(1)},${p.z.toFixed(1)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    outline.push(new THREE.Vector2(p.x, p.z));
  }

  // Centroid of the top face's UV island — a point safely inside the desktop's
  // own region of the texture atlas, away from the wood and frame.
  const topUVs = uvs.filter((entry) => entry.y > topY - TOP_EPSILON);

  const topUV = topUVs.length
    ? new THREE.Vector2(
        topUVs.reduce((sum, entry) => sum + entry.u, 0) / topUVs.length,
        topUVs.reduce((sum, entry) => sum + entry.v, 0) / topUVs.length
      )
    : null;

  return { outline, topY, underY, material, topUV, topSamples: topUVs };
}

/**
 * Finds the cut-off corner: for each footprint corner, the nearest outline point
 * along each of its two edges forms a triangle with it. The chamfer is the small
 * one; the L's inner notch is rejected by area.
 */
function findChamfer(outline) {
  const xs = outline.map((p) => p.x);
  const zs = outline.map((p) => p.y);
  const bounds = {
    minX: Math.min(...xs), maxX: Math.max(...xs),
    minZ: Math.min(...zs), maxZ: Math.max(...zs),
  };
  const footprint = (bounds.maxX - bounds.minX) * (bounds.maxZ - bounds.minZ);

  let best = null;
  for (const cornerX of [bounds.minX, bounds.maxX]) {
    for (const cornerZ of [bounds.minZ, bounds.maxZ]) {
      const corner = new THREE.Vector2(cornerX, cornerZ);
      // Already square if an outline point sits on the corner itself.
      if (outline.some((p) => p.distanceTo(corner) < EDGE_EPSILON)) continue;

      const onX = nearest(outline.filter((p) => Math.abs(p.x - cornerX) < EDGE_EPSILON), corner);
      const onZ = nearest(outline.filter((p) => Math.abs(p.y - cornerZ) < EDGE_EPSILON), corner);
      if (!onX || !onZ) continue;

      const area = Math.abs(corner.x - onZ.x) * Math.abs(corner.y - onX.y) / 2;
      if (area / footprint > MAX_TRIANGLE_AREA_RATIO) continue;
      if (!best || area < best.area) best = { area, points: [corner, onX, onZ] };
    }
  }

  return best?.points ?? null;
}

/** Fallback shade when the base map cannot be sampled (mid-grey laminate). */
const FALLBACK_MAP_SHADE = 0.5;

/** Side of the pixel block averaged around the sample point. */
const SAMPLE_BLOCK = 8;

/** Mean colour of `texture` around `uv`, in linear space, read back via a canvas. */
function sampleMap(texture, uv) {
  const image = texture?.image;
  if (!image?.width || !uv) return new THREE.Color().setScalar(FALLBACK_MAP_SHADE);

  try {
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(image, 0, 0);

    // glTF UVs run top-down, canvas rows run top-down too, so v maps directly.
    const x = THREE.MathUtils.clamp(Math.round(uv.x * image.width), 0, image.width - SAMPLE_BLOCK);
    const y = THREE.MathUtils.clamp(Math.round(uv.y * image.height), 0, image.height - SAMPLE_BLOCK);
    const { data } = context.getImageData(x, y, SAMPLE_BLOCK, SAMPLE_BLOCK);

    let r = 0;
    let g = 0;
    let b = 0;
    for (let i = 0; i < data.length; i += 4) {
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
    }
    const pixels = data.length / 4;
    // setRGB with an explicit colour space already converts into the working space.
    return new THREE.Color().setRGB(
      r / pixels / 255,
      g / pixels / 255,
      b / pixels / 255,
      THREE.SRGBColorSpace
    );
  } catch {
    // Tainted canvas or an image the 2D context can't take — the constant is fine.
    return new THREE.Color().setScalar(FALLBACK_MAP_SHADE);
  }
}

/**
 * Least-squares fit of the top face's UV mapping as an affine function of world XZ
 * (`u = a·x + b·z + c`, likewise for v). The tabletop is planar, so its bake is
 * affine in those coordinates and the patch can extend it exactly.
 *
 * Returns { a, b, c, d, e, f } or null when the samples are degenerate.
 */
function fitPlanarUVs(samples) {
  if (samples.length < 3) return null;

  // Normal equations for [x z 1] · coefficients = target.
  let sxx = 0, sxz = 0, sx = 0, szz = 0, sz = 0, n = 0;
  let sxu = 0, szu = 0, su = 0, sxv = 0, szv = 0, sv = 0;

  for (const s of samples) {
    sxx += s.x * s.x; sxz += s.x * s.z; sx += s.x;
    szz += s.z * s.z; sz += s.z; n += 1;
    sxu += s.x * s.u; szu += s.z * s.u; su += s.u;
    sxv += s.x * s.v; szv += s.z * s.v; sv += s.v;
  }

  const matrix = [
    [sxx, sxz, sx],
    [sxz, szz, sz],
    [sx, sz, n],
  ];
  const uCoefficients = solve3(matrix, [sxu, szu, su]);
  const vCoefficients = solve3(matrix, [sxv, szv, sv]);
  if (!uCoefficients || !vCoefficients) return null;

  const [a, b, c] = uCoefficients;
  const [d, e, f] = vCoefficients;
  return { a, b, c, d, e, f };
}

/** Cramer's rule on a 3x3 system; null when the matrix is singular. */
function solve3(m, rhs) {
  const det = determinant3(m);
  if (Math.abs(det) < 1e-9) return null;

  const result = [];
  for (let column = 0; column < 3; column++) {
    const swapped = m.map((row, i) => row.map((value, j) => (j === column ? rhs[i] : value)));
    result.push(determinant3(swapped) / det);
  }
  return result;
}

function determinant3(m) {
  return (
    m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
    m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
    m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0])
  );
}

/** Writes UVs from the fitted mapping onto every vertex of the patch. */
function applyUVs(geometry, { a, b, c, d, e, f }) {
  const position = geometry.attributes.position;
  const uv = new Float32Array(position.count * 2);

  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const z = position.getZ(i);
    uv[i * 2] = a * x + b * z + c;
    uv[i * 2 + 1] = d * x + e * z + f;
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

function nearest(candidates, target) {
  let best = null;
  for (const p of candidates) {
    if (!best || p.distanceTo(target) < best.distanceTo(target)) best = p;
  }
  return best;
}

/**
 * The desk's material is a single atlas covering top, legs and frame, so any UVs
 * invented for the patch land on an arbitrary region of it (the wood, in practice).
 * The patch therefore drops the maps and keeps only the shading properties, which
 * matches the near-flat desktop surface.
 */
function patchMaterial(source, topUV) {
  const material = source.clone();
  // The desk's rendered surface is its colour times its base map. Dropping the map
  // would leave the patch that much brighter, so fold the desktop's own shade back
  // in — sampled at the top face's UVs, not the whole atlas, which is mostly wood.
  material.color.multiply(sampleMap(source.map, topUV));
  material.map = null;
  material.normalMap = null;
  material.roughnessMap = null;
  material.metalnessMap = null;
  material.aoMap = null;
  // Without maps the shading factors apply globally, so neutralise them.
  material.metalness = 0;
  material.roughness = 1;
  material.name = 'Desk_corner_patch';
  // Tells darkenScene() to tint this like the desk, not like a room surface.
  material.userData.deskLike = true;
  return material;
}

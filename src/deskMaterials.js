import * as THREE from 'three';

/**
 * The desk's materials, taken from the Computer Workspace Pack usdz — the same two
 * that dress its desk: `Dark_Wood_Final` on the tabletop (its Object_3) and
 * `Metal_PBR_Final` on the frame (its Object_16). Run `npm run textures` to refresh
 * the image files from the pack — that step recompresses them on the way in, because the
 * pack stores its normal maps at roughly seven times the size they need.
 *
 * Because this function overwrites `node.material` on every mesh it walks, `desk.glb`
 * needs no textures of its own, and carries none: they were 4.6 MB of its 5.57 that were
 * downloaded, decoded and then thrown away on every load. It is now 77 KB. If you
 * re-import it with `npm run convert -- Desk` you will get the heavy file back — re-run
 * `node scripts/shrink-glb.mjs desk --no-textures` after.
 *
 * The one thing that must survive that stripping is `TEXCOORD_0`: `makeMetalMaterial`
 * pins the frame's four maps to channel 0, the model's own UVs. Only the tabletop's wood
 * uses the planar set this file generates.
 */

const TEXTURE_DIR = 'textures/desk/';

/**
 * Real-world width of the pack's tabletop board (1.8 m) in this scene's units, so
 * the wood grain lands at the same physical size here as it does there.
 */
const WOOD_TEXTURE_SPAN = 180;

/**
 * The tabletop's tint, multiplied into its wood map. The pack's board is a near-black
 * grey (its map averages 39, 39, 39); these are well over 1 on purpose, lifting it
 * into a deep red-brown — a mahogany — with the grain's contrast kept. Only the top
 * takes it; the frame is left as the pack made it.
 */
const WOOD_TINT = new THREE.Color(1.3, 0.55, 0.36);
/** The top's finish: 1 is dead flat, lower brings a sheen back. */
const TOP_ROUGHNESS = 0.92;

/** UV set carrying the planar mapping for the tabletop; 0 stays the model's own. */
const PLANAR_UV_CHANNEL = 1;

/** Vertices within this of the top surface delimit the tabletop slab. */
const TOP_EPSILON = 0.5;

/** A face this flat counts as a horizontal surface. */
const HORIZONTAL = 0.9;

/** Height bin, and the flat area a bin needs before it reads as a shelf board. */
const SHELF_BIN = 1;
const SHELF_MIN_AREA = 1000;

/** Bins closer than this belong to the same board — its top face and its underside. */
const SHELF_MERGE_GAP = 4;

const loader = new THREE.TextureLoader();

/**
 * Splits the desk — one mesh, one material as it comes out of the conversion — into
 * a wood tabletop and a metal frame, cutting at the underside of the top slab. The
 * corner patch joins the tabletop so the surface stays continuous.
 */
export function applyDeskMaterials(desk) {
  desk.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(desk);
  // The top slab takes the tint; the trestles' shelf boards are the same wood untinted.
  const wood = makeWoodMaterial(box, WOOD_TINT, 'desk_wood_top');
  const shelf = makeWoodMaterial(box, null, 'desk_wood_shelf');
  const metal = makeMetalMaterial();
  const cutY = tabletopUndersideY(desk);

  desk.traverse((node) => {
    if (!node.isMesh) return;
    addPlanarUVs(node, box);

    if (node.name === 'Desk_corner_patch') {
      node.material = wood;
      return;
    }
    const shelves = detectShelfBands(node, cutY);
    node.material = splitByMaterial(node, cutY, shelves) ? [wood, shelf, metal] : wood;
  });

  return { wood, shelf, metal };
}

/**
 * The pack's dark wood, mapped planar across our larger L-shaped top — `tint` is
 * multiplied into it where given.
 */
function makeWoodMaterial(box, tint, name) {
  const size = box.getSize(new THREE.Vector3());
  const repeat = new THREE.Vector2(
    Math.max(size.x, 1e-6) / WOOD_TEXTURE_SPAN,
    Math.max(size.z, 1e-6) / WOOD_TEXTURE_SPAN
  );

  // The tinted top is matte — an oiled board, not a lacquered one: the pack's
  // roughness and metalness maps, which give it a sheen, are left off it and the
  // roughness held flat. The untinted shelves keep the pack's finish.
  const material = new THREE.MeshStandardMaterial({
    name,
    ...(tint ? { color: tint } : {}),
    map: texture('Dark_Wood_Final_baseColor.webp', { srgb: true, repeat }),
    ...(tint ? {} : {
      roughnessMap: texture('Dark_Wood_Final_metallicRoughness_rough.webp', { repeat }),
      metalnessMap: texture('Dark_Wood_Final_metallicRoughness_metal_scale0.webp', { repeat }),
    }),
    normalMap: texture('Dark_Wood_Final_normal_norm.webp', { repeat }),
    roughness: tint ? TOP_ROUGHNESS : 1,
    metalness: tint ? 0 : 1,
  });
  material.userData.keepColor = true;
  return material;
}

/** Frame and legs: the pack's metal, on the model's own unwrap. */
function makeMetalMaterial() {
  const material = new THREE.MeshStandardMaterial({
    name: 'desk_metal_frame',
    map: texture('Metal_PBR_Final_baseColor.webp', { srgb: true, channel: 0 }),
    roughnessMap: texture('Metal_PBR_Final_metallicRoughness_rough.webp', { channel: 0 }),
    metalnessMap: texture('Metal_PBR_Final_metallicRoughness_metal_scale0.webp', { channel: 0 }),
    normalMap: texture('Metal_PBR_Final_normal_norm.webp', { channel: 0 }),
    roughness: 1,
    metalness: 1,
  });
  material.userData.keepColor = true;
  return material;
}

/**
 * Loads one map. Only the base colour is colour data; the rest are read channel-wise
 * and must stay linear. The converter wrote metallicRoughness out as two grey
 * images — three samples B for metalness and G for roughness, and grey carries both.
 */
function texture(file, { srgb = false, repeat = null, channel = PLANAR_UV_CHANNEL } = {}) {
  const map = loader.load(TEXTURE_DIR + file);
  map.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.anisotropy = 8;
  map.channel = channel;
  if (repeat) map.repeat.copy(repeat);
  return map;
}

/** Height of the tabletop slab's underside: the highest vertex level below the top. */
function tabletopUndersideY(desk) {
  const vertex = new THREE.Vector3();
  let topY = -Infinity;
  const levels = [];

  desk.traverse((node) => {
    if (!node.isMesh) return;
    const position = node.geometry.attributes.position;
    for (let i = 0; i < position.count; i++) {
      vertex.fromBufferAttribute(position, i).applyMatrix4(node.matrixWorld);
      levels.push(vertex.y);
      if (vertex.y > topY) topY = vertex.y;
    }
  });

  const below = levels.filter((y) => y < topY - TOP_EPSILON);
  return below.length ? Math.max(...below) : topY - 1;
}

/** Walks a mesh's triangles, handing each one its three world-space corners. */
function eachTriangle(mesh, visit) {
  const geometry = mesh.geometry;
  const position = geometry.attributes.position;
  const index = geometry.getIndex();
  const count = index ? index.count : position.count;
  const at = (i) => (index ? index.getX(i) : i);

  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();

  for (let i = 0; i < count; i += 3) {
    const ia = at(i);
    const ib = at(i + 1);
    const ic = at(i + 2);
    a.fromBufferAttribute(position, ia).applyMatrix4(mesh.matrixWorld);
    b.fromBufferAttribute(position, ib).applyMatrix4(mesh.matrixWorld);
    c.fromBufferAttribute(position, ic).applyMatrix4(mesh.matrixWorld);
    visit([ia, ib, ic], a, b, c);
  }
}

/** Signed area and up-ness of a triangle, used to pick out flat surfaces. */
function faceInfo(a, b, c) {
  const ab = new THREE.Vector3().subVectors(b, a);
  const ac = new THREE.Vector3().subVectors(c, a);
  const normal = new THREE.Vector3().crossVectors(ab, ac);
  const area = normal.length() / 2;
  return { area, up: area > 1e-9 ? Math.abs(normal.y / (area * 2)) : 0 };
}

/**
 * Finds the trestles' shelf boards below the tabletop: bin the flat faces by height,
 * keep the bins carrying real area, and merge neighbouring ones so a board's top face
 * and underside come back as a single band. On this desk that yields three.
 */
function detectShelfBands(mesh, cutY) {
  const areaByBin = new Map();

  eachTriangle(mesh, (_, a, b, c) => {
    const y = (a.y + b.y + c.y) / 3;
    if (y >= cutY) return;
    const { area, up } = faceInfo(a, b, c);
    if (up < HORIZONTAL) return;
    const bin = Math.round(y / SHELF_BIN);
    areaByBin.set(bin, (areaByBin.get(bin) ?? 0) + area);
  });

  const levels = [...areaByBin.entries()]
    .filter(([, area]) => area >= SHELF_MIN_AREA)
    .map(([bin]) => bin * SHELF_BIN)
    .sort((p, q) => p - q);

  const bands = [];
  for (const level of levels) {
    const last = bands[bands.length - 1];
    if (last && level - last.max <= SHELF_MERGE_GAP) last.max = level;
    else bands.push({ min: level, max: level });
  }

  // Pad by a bin so a board's own faces sit comfortably inside its band.
  return bands.map(({ min, max }) => ({ min: min - SHELF_BIN, max: max + SHELF_BIN }));
}

/**
 * Reorders the mesh's triangles into three runs — the tabletop, the flat faces of the
 * trestles' shelf boards, and the metal of everything else — and gives it a geometry
 * group per run, so one mesh can carry all three materials in that order.
 *
 * Returns false when every triangle lands on the tabletop — the caller then just
 * assigns the single material.
 */
function splitByMaterial(mesh, cutY, shelves) {
  const top = [];
  const shelf = [];
  const metal = [];

  eachTriangle(mesh, (indices, a, b, c) => {
    const y = (a.y + b.y + c.y) / 3;
    if (y >= cutY) top.push(...indices);
    else if (
      shelves.some((band) => y >= band.min && y <= band.max) &&
      faceInfo(a, b, c).up >= HORIZONTAL
    ) shelf.push(...indices);
    else metal.push(...indices);
  });

  if (!shelf.length && !metal.length) return false;
  mesh.geometry.setIndex([...top, ...shelf, ...metal]);
  mesh.geometry.clearGroups();
  mesh.geometry.addGroup(0, top.length, 0);
  mesh.geometry.addGroup(top.length, shelf.length, 1);
  mesh.geometry.addGroup(top.length + shelf.length, metal.length, 2);
  return true;
}

/**
 * Adds a planar XZ mapping as a second UV set for the tabletop, so its grain runs
 * along the desk like a sawn board. The model's own `uv` is left untouched — the
 * frame's maps need it to follow the leg geometry rather than a flat projection.
 */
function addPlanarUVs(mesh, box) {
  const position = mesh.geometry.attributes.position;
  const size = box.getSize(new THREE.Vector3());
  const spanX = Math.max(size.x, 1e-6);
  const spanZ = Math.max(size.z, 1e-6);

  const vertex = new THREE.Vector3();
  const uv = new Float32Array(position.count * 2);
  for (let i = 0; i < position.count; i++) {
    vertex.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld);
    uv[i * 2] = (vertex.x - box.min.x) / spanX;
    uv[i * 2 + 1] = (vertex.z - box.min.z) / spanZ;
  }
  mesh.geometry.setAttribute('uv1', new THREE.BufferAttribute(uv, 2));
}

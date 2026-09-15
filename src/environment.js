import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

/**
 * How much of the ambient fill light is let through. Below 1 the shadows deepen
 * without the key light's highlights moving, which is the only way to make shadows
 * read darker across the whole scene at once.
 */
const AMBIENT_FILL = 0.78;

/**
 * A touch device is a phone or a tablet, and its GPU pays for every shadow texel
 * sampled. The key light's map is halved there — 1024² is soft enough for a scene
 * seen on a 6-inch screen and a quarter of the fill-rate of the desktop's 2048².
 */
export const COARSE_POINTER = window.matchMedia('(pointer: coarse)').matches;
const SHADOW_MAP_SIZE = COARSE_POINTER ? 1024 : 2048;

/**
 * Image-based lighting from three's built-in room environment (no external HDR
 * file needed) plus a hemisphere fill and a shadow-casting key light.
 * Returns handles the caller needs once the model bounds are known.
 */
export function setupEnvironment(scene, renderer) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  // The IBL and the hemisphere below are what fill the shadows in. Both are held
  // under full strength so a shadow reads as a shadow rather than a faint smudge —
  // turn them up and the shadows wash out, not the highlights.
  scene.environmentIntensity = AMBIENT_FILL;
  scene.background = new THREE.Color(0x0d0f13);
  scene.fog = null;

  const hemi = new THREE.HemisphereLight(0xaebbd4, 0x1c1f26, 0.3 * AMBIENT_FILL);
  scene.add(hemi);

  const key = new THREE.DirectionalLight(0xffffff, 1.6);
  key.castShadow = true;
  key.shadow.mapSize.set(SHADOW_MAP_SIZE, SHADOW_MAP_SIZE);
  key.shadow.bias = -0.0005;
  key.shadow.normalBias = 0.02;
  scene.add(key);
  scene.add(key.target);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.ShadowMaterial({ opacity: 0.42 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // The shadow map is rendered on demand, not every frame. Nothing in this scene
  // moves except the camera, and a camera move does not change a shadow — so the map
  // is drawn when the geometry and lights settle and then left alone.
  //
  // **Anything that moves a light or adds geometry has to call `refreshShadows()`, or
  // its shadow silently will not appear.**
  renderer.shadowMap.autoUpdate = false;
  // A mobile browser drops the WebGL context when the tab is backgrounded for long enough;
  // three rebuilds its own state on restore, but the cached map above is gone with it.
  renderer.domElement.addEventListener('webglcontextrestored', () => refreshShadows());

  const grid = new THREE.GridHelper(1, 20, 0x4a5162, 0x2b303b);
  grid.material.transparent = true;
  grid.material.opacity = 0.55;
  grid.visible = false;
  scene.add(grid);

  /** Redraws the cached shadow map — see `shadowMap.autoUpdate` above. */
  function refreshShadows() {
    renderer.shadowMap.needsUpdate = true;
  }

  /** The box the rig was last fitted to — what the debug panel's Copy view measures against. */
  let bounds = null;

  /** Scale the light rig, floor and grid to the loaded model's bounds. */
  function fitToBounds(box) {
    bounds = box.clone();
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const radius = Math.max(size.length() / 2, 1e-3);

    key.position.set(center.x + radius, box.max.y + radius * 1.4, center.z + radius);
    key.target.position.copy(center);

    const cam = key.shadow.camera;
    cam.left = -radius * 1.4;
    cam.right = radius * 1.4;
    cam.top = radius * 1.4;
    cam.bottom = -radius * 1.4;
    cam.near = radius * 0.05;
    cam.far = radius * 6;
    cam.updateProjectionMatrix();

    ground.scale.setScalar(radius * 8);
    ground.position.set(center.x, box.min.y, center.z);

    grid.scale.setScalar(radius * 4);
    grid.position.set(center.x, box.min.y + radius * 0.001, center.z);

    // The key light and its shadow camera both just moved.
    refreshShadows();
  }

  function dispose() {
    pmrem.dispose();
  }

  return { grid, fitToBounds, refreshShadows, dispose, get bounds() { return bounds; } };
}

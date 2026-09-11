import * as THREE from 'three';
import { loadGLB } from './gltfLoader.js';

/**
 * Three cable combs clipped to the underside of the desk top, ready for the display
 * and tower cabling to be dressed through them. Where each one sits is authored below
 * rather than measured off the desk — they were placed by hand.
 * Run `npm run convert Cable_holder` to (re-)import the model.
 *
 * The source is a Sketchfab "Passacavi" comb exported at 534 x 300 x 1400 units — the
 * exporter's own scale, not this scene's — so it is normalised here: recentred on its
 * footprint, dropped to y = 0 and taken down to a real 5.3 x 3 x 14 cm.
 */

const MODEL_URL = 'models/cableHolder.glb';

/** Takes the source's 1400-unit length down to a 14 cm holder. */
const SCALE = 0.01;

/**
 * Where each comb ended up, in world centimetres and degrees — set by hand in edit
 * mode and copied out of its readout, rotations in the readout's own `YXZ` order.
 *
 * Absolute: move the desk and the row stays where it is. Re-dressing them in edit mode
 * and pasting the numbers back here is the way to follow it.
 */
const HOLDERS = [
  { position: [-2.8, 77.2, -117.5], rotation: [0, 179.8, 90.4] },
  { position: [31.0, 77.4, -117.1], rotation: [0, -180, 90.1] },
  { position: [69.9, 78.1, -124.0], rotation: [0, -178.8, 90.3] },
];

/** Matte black plastic — authored, so `darkenScene()` must leave it alone. */
function plasticMaterial() {
  const material = new THREE.MeshStandardMaterial({
    name: 'cable_holder_plastic', color: 0x1a1a1c, roughness: 0.7, metalness: 0.05,
  });
  material.userData.keepColor = true;
  return material;
}

/**
 * Loads the comb once and hangs three copies from the desk top's underside.
 * Returns the three holders, or null if there is no desk to hang them from.
 */
export async function addCableHolders(parent) {
  const gltf = await loadGLB(MODEL_URL);
  const source = normalise(gltf.scene);
  const material = plasticMaterial();

  // The placements are world-space but `parent` carries an offset of its own, so they
  // have to be converted into its local space or the row floats off the desk.
  parent.updateMatrixWorld(true);

  return HOLDERS.map((spec, i) => {
    const holder = i === 0 ? source : source.clone();
    holder.name = `Cable_holder_${i + 1}`;
    holder.rotation.set(...spec.rotation.map(THREE.MathUtils.degToRad), 'YXZ');
    holder.position.copy(
      parent.worldToLocal(new THREE.Vector3().fromArray(spec.position))
    );

    holder.traverse((node) => {
      if (!node.isMesh) return;
      node.material = material;
      node.castShadow = true;
      node.receiveShadow = true;
    });

    parent.add(holder);
    return holder;
  });
}

/**
 * Recentres the model on its own footprint with y = 0 at its base and brings it down to
 * scene centimetres, so each copy is placed by where it actually sits rather than by
 * whatever offset the exporter baked in.
 */
function normalise(scene) {
  const group = new THREE.Group();
  scene.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(scene);
  const center = box.getCenter(new THREE.Vector3());
  scene.position.set(-center.x, -box.min.y, -center.z);
  scene.scale.setScalar(1);
  group.add(scene);
  group.scale.setScalar(SCALE);
  return group;
}

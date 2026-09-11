import * as THREE from 'three';
import { materialsOf } from '../materials.js';

/**
 * The rim of light around a readable prop.
 *
 * Hover used to lift the prop's own emissive, which lit the object from within — a
 * MacBook that switches on rather than one that is highlighted. This lights up *around*
 * it instead and leaves its shading alone: a copy of the prop's meshes drawn back-faces
 * only, with every vertex pushed out along its normal, so all that survives behind the
 * real prop is a band at the silhouette.
 *
 * The push happens in clip space, scaled by `w`, which keeps the rim the same width on
 * screen whatever the camera's distance. Pushing in local or world space instead would
 * make it swell as the camera closed in, and a prop framed for its own section fills the
 * viewport.
 *
 * Outlines are built on a prop's first hover and kept — a sweep across the desk then
 * costs a `visible` flag rather than a rebuild.
 */

/** Rim width, as a fraction of viewport height. Roughly 2 px at 1080p on hover. */
const HOVER_WIDTH = 0.0022;

/** The open section's prop is held brighter and heavier, since it is the subject. */
const OPEN_WIDTH = 0.0038;

const COLOR = new THREE.Color(0x6ea8fe);

/**
 * A back-face shell. `depthWrite` off so the shell never occludes anything, and
 * `depthTest` left on so it is hidden by whatever stands in front of the prop.
 */
function outlineMaterial(width) {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    transparent: true,
    // Nudged away from the camera in depth. The shell is only pushed sideways, so a
    // flat mesh — a screen plane, a poster — leaves its shell exactly coplanar with the
    // surface it copies, and the two z-fight into a wedge across the prop. Losing every
    // tie leaves the shell where it belongs: behind, showing only past the silhouette.
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
    uniforms: {
      outlineWidth: { value: width },
      outlineColor: { value: COLOR.clone() },
    },
    vertexShader: `
      uniform float outlineWidth;
      void main() {
        vec4 clip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        // The normal taken into clip space the same way, then scaled by w: that
        // cancels the perspective divide, so the offset lands in screen space.
        vec3 view = normalize(normalMatrix * normal);
        vec4 offset = projectionMatrix * vec4(view, 0.0);
        // Not normalised: a face looking straight at the camera projects to almost
        // nothing, and normalising that would both blow it up to full width and hand
        // the direction over to rounding error. Left as it is, the push fades out as a
        // face turns to meet the camera, which is exactly the silhouette.
        clip.xy += offset.xy * outlineWidth * clip.w;
        gl_Position = clip;
      }
    `,
    fragmentShader: `
      uniform vec3 outlineColor;
      void main() {
        gl_FragColor = vec4(outlineColor, 1.0);
      }
    `,
  });
}

/**
 * Outlines for one room. `parent` is what the shells hang off — the model root, never
 * the props themselves: a shell parented to its prop would be walked by the picker's
 * `intersectObjects` and start swallowing the clicks it is meant to advertise.
 */
export function setupOutlines(parent) {
  /** @type {Map<THREE.Object3D, {group: THREE.Group, materials: THREE.ShaderMaterial[]}>} */
  const built = new Map();
  let lit = null;
  let held = null;

  /** Clones the prop's meshes into a shell, in the prop's own world transform. */
  function build(object) {
    const group = new THREE.Group();
    group.name = `${object.name}_outline`;
    const shells = [];

    object.updateMatrixWorld(true);
    object.traverse((node) => {
      if (!node.isMesh || !node.visible || !node.geometry?.attributes.normal) return;
      // Transparent meshes are skipped. The displays carry a glass sheet and a screen
      // wash over the panel, and a shell of those is drawn solid — which put a blue
      // wedge across the monitor rather than a rim around it. Nothing invisible in the
      // room contributes to a silhouette anyway.
      const materials = materialsOf(node);
      if (!materials.length || materials.every((material) => material?.transparent)) return;

      const material = outlineMaterial(HOVER_WIDTH);
      const shell = new THREE.Mesh(node.geometry, material);
      // World-space, then the parent's own offset undone — the same trick `cable.js`
      // uses, and it means the shell needs no live tracking of the prop's transform.
      shell.applyMatrix4(node.matrixWorld);
      shell.applyMatrix4(new THREE.Matrix4().copy(parent.matrixWorld).invert());
      // Never a pick target, and never a shadow caster: it is a hint, not an object.
      shell.raycast = () => {};
      shell.castShadow = false;
      shell.receiveShadow = false;
      shell.renderOrder = 1;

      shells.push(material);
      group.add(shell);
    });

    group.visible = false;
    parent.add(group);
    return { group, materials: shells };
  }

  function entry(object) {
    let made = built.get(object);
    if (!made) {
      made = build(object);
      built.set(object, made);
    }
    return made;
  }

  /** Turns one prop's rim on at the given width, and every other prop's off. */
  function light(object, width) {
    if (lit && lit !== object) entry(lit).group.visible = false;
    lit = object ?? null;
    if (!object) return;

    const made = entry(object);
    for (const material of made.materials) material.uniforms.outlineWidth.value = width;
    made.group.visible = true;
  }

  return {
    /** The pointer moved onto a prop, or off every prop when passed null. */
    hover(object) {
      // A prop being read is held lit; a hover elsewhere must not steal its rim.
      if (held) return;
      light(object, HOVER_WIDTH);
    },

    /**
     * Holds one prop lit while its section is open — heavier than a hover, and immune
     * to the pointer, which is off browsing the panel by then. Null releases it.
     */
    hold(object) {
      held = object ?? null;
      light(object, OPEN_WIDTH);
    },
  };
}

import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

/**
 * One loader for every GLB in the scene, and one copy of the Draco decoder.
 *
 * Each prop module used to build its own `GLTFLoader` and `DRACOLoader`, which meant
 * `draco_decoder.wasm` was fetched and instantiated once per module — four times over
 * on load. The same problem the WorkDesk3D project solves in its `js/gltf.js`.
 *
 * Built on first use rather than at import, so nothing is paid for until a GLB is
 * actually asked for.
 *
 * **Never dispose this loader's decoder.** The per-module versions called
 * `draco.dispose()` after their own load, which was correct while each owned one;
 * doing it to a shared decoder would break every load after the first.
 */

/** Where `npm run apple` installs three's Draco decoder. */
const DECODER_PATH = 'draco/';

let loader = null;

function shared() {
  if (!loader) {
    loader = new GLTFLoader();
    loader.setDRACOLoader(new DRACOLoader().setDecoderPath(DECODER_PATH));
  }
  return loader;
}

/** Loads one GLB. Compressed or not — the decoder is only touched if it is needed. */
export function loadGLB(url) {
  return shared().loadAsync(url);
}

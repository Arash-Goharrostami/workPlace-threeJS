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

/**
 * Loads one GLB. Compressed or not — the decoder is only touched if it is needed.
 *
 * `onProgress` is passed through so that even the room, which reports download progress
 * to the UI, has no reason to build a loader of its own. That mattered: a module with its
 * own bare `GLTFLoader` loads uncompressed models perfectly well and then fails the day
 * its model is Draco-compressed, which is exactly what happened to `desk.glb`.
 */
export function loadGLB(url, onProgress) {
  const bytes = prefetched.get(url);
  if (!bytes) return shared().loadAsync(url, onProgress);
  // Parsed from the prefetched bytes, once: a URL loaded again after that goes back
  // through `loadAsync`, so every caller gets a scene and materials of its own.
  prefetched.delete(url);
  const path = url.slice(0, url.lastIndexOf('/') + 1);
  return bytes.then(
    (buffer) => shared().parseAsync(buffer, path),
    () => shared().loadAsync(url, onProgress),
  );
}

/** URL → the promise of its bytes, for a model asked for ahead of its load. */
const prefetched = new Map();

/**
 * Starts the download of every `urls` entry now, so that a later `loadGLB` of the
 * same URL finds its bytes here (or on the way) instead of only then asking the
 * network. `loadModel.js` places the props one after another because each is put
 * down against the last, which without this left the connection idle through every
 * decode: the room's whole load was download + decode, prop by prop. In the order
 * given — the browser lets a handful through at a time, so the first needed go first.
 *
 * A failed fetch is dropped here without a word; the `loadGLB` for it fetches again
 * the ordinary way and reports any failure as its own.
 */
export function prefetchGLB(urls) {
  for (const url of urls) {
    if (prefetched.has(url)) continue;
    const bytes = fetch(url).then((response) => {
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      return response.arrayBuffer();
    });
    bytes.catch(() => prefetched.delete(url));
    prefetched.set(url, bytes);
  }
}

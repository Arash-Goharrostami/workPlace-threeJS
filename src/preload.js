/**
 * Sounds fetched under the loading bar, so the first key struck and the printer's first
 * turn are heard the moment they are due rather than once their clip has arrived.
 *
 * `preloadAudio()` reads each file as a stream so the bar can count its bytes along with
 * the room's; the bytes are kept here and handed out by `audioBytes()`, which also falls
 * back to a plain fetch, so a caller that runs before — or without — the preload still
 * gets its clip.
 */

/** URL → ArrayBuffer of the file as served. */
const cache = new Map();

/**
 * Fetches `urls` together. `onProgress(loaded, total)` is called as bytes come in, over
 * all of them: `total` grows as each response announces its length, so it is honest
 * once the first headers are back. Resolves when every file is in; one that fails is
 * warned about and left out.
 */
export function preloadAudio(urls, onProgress) {
  const loaded = new Map();
  const total = new Map();
  const report = () => {
    const sum = (m) => [...m.values()].reduce((a, b) => a + b, 0);
    onProgress?.(sum(loaded), sum(total));
  };

  return Promise.all(urls.map(async (url) => {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      const length = Number(response.headers.get('content-length')) || 0;
      total.set(url, length);
      loaded.set(url, 0);
      report();

      const chunks = [];
      let got = 0;
      const reader = response.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        got += value.byteLength;
        loaded.set(url, got);
        report();
      }
      // No Content-Length (a dev server streaming), so the file's own size is its total.
      if (!length) total.set(url, got);
      loaded.set(url, total.get(url));
      report();

      const bytes = new Uint8Array(got);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }
      cache.set(url, bytes.buffer);
    } catch (error) {
      console.warn(`[preload] ${url} failed:`, error);
    }
  }));
}

/**
 * The file's bytes, as a fresh copy — `decodeAudioData` detaches the buffer it is
 * given, and the cache has to survive a second caller.
 */
export async function audioBytes(url) {
  if (!cache.has(url)) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    cache.set(url, await response.arrayBuffer());
  }
  return cache.get(url).slice(0);
}

/** A URL an `<audio>` element can play the cached file from; the file's URL if it is not cached. */
export function audioObjectUrl(url) {
  const bytes = cache.get(url);
  return bytes ? URL.createObjectURL(new Blob([bytes], { type: 'audio/mpeg' })) : url;
}

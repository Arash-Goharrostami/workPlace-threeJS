# WorkPlace

A three.js viewer for a modelled desk setup. `npm run dev` serves it; there is no test
suite.

**Do not verify changes yourself.** Don't start the dev server, drive a browser, take
screenshots or otherwise try the scene — implement the change and stop. Arash loads the
scene and checks it himself; this is the one project where finishing means handing the
work over, not proving it works.

## Model files are camelCase

Everything in `public/models/` is named in camelCase — `macPro.glb`, `proDisplayXdr.glb`,
`benqScreenbarRemote.glb`. Two rules cover the awkward cases:

- **Acronyms take a single capital**: `Xdr`, `Se`, `Usb` — not `XDR`, `SE`, `USB`.
- **A leading digit moves to the end**, since a camelCase name cannot start with one:
  `3d-printer` becomes `printer3d.glb`.

Models arrive named by whoever made them, in every convention there is — `macbook-pro-16`
from Apple, `Mac_Pro` and `SOCKET__DE_PISO` from Sketchfab. **That source name is not
renamed**: the `.usdz` in `tmp/` keeps it, and it stays the argument you pass to
`npm run convert`. Only the file written into `public/models/` is renamed.

The two names are reconciled in **`scripts/model-names.txt`**, one `source<TAB>result` pair
per line. `convert-usdz.sh`, `import-apple-models.sh` and `shrink-glb.mjs` all read it
through `scripts/model-name.sh`, so the convention holds even when a model is re-imported.
A source with no line falls back to a mechanical conversion — add a line only when that
reads badly, as it does for `Black_Computer_Chair_-_Mesh_Back_Support` (`officeChair`).

If you rename a model, `scripts/model-names.txt` and the `MODEL_URL` constant in its
`src/` module have to move together.

Everything in `public/models/` is a GLB. The Magic Mouse arrived as the one OBJ and was
converted with `scripts/obj-to-glb.mjs` — an OBJ spells every coordinate out in ASCII, so
it was 1.97 MB against 75 KB as a compressed GLB. That script preserves `usemtl` names
verbatim, which matters because `src/mouseArea.js` selects the mouse's skin by material
name.

## Keep the models small

Sources are authored for turntable renders and arrive far heavier than this scene needs —
4096² maps on a 7.5 cm prop, quarter-million-triangle cables. `npm run shrink <model>
[maxTextureSize] [quality] [simplifyRatio]` resamples the textures, re-encodes alpha-free
PNGs as JPEG, and cleans and Draco-compresses the geometry.

The originals go to `tmp/originals/`, never into `public/` — `public/` is copied wholesale
into `dist/`, so anything left there ships. Reverting is `mv tmp/originals/<name>.orig.glb
public/models/<name>.glb`.

A model whose materials are replaced at load time should be shrunk with
`--no-textures`, which drops its maps instead of resampling them. `desk.glb` is the worked
example: `src/deskMaterials.js` overwrites every material it loads, so the model's own
4.6 MB of maps were pure download weight, and it went 5.57 MB → 77 KB. Note the flag has
to be passed through npm's `--` (`npm run shrink -- desk --no-textures`) or npm eats it.
Watch what `prune` takes with them — a UV set nothing references *in the file* can still
be wanted at runtime, which is why prune runs with `--keep-attributes`.

`--only prefix,prefix` keeps the meshes on matching nodes and strips the rest, for a model
where most of the file is never rendered. `powerCable.glb` is the case: 95% of its
triangles drew a cable that `buildCable()` draws procedurally, and only its plug and socket
are ever loaded — 4.86 MB to 33 KB. Check what a module actually looks up before reaching
for this.

Loose textures under `public/textures/` are `npm run shrink:textures <dir> [maxSize]
[quality]`, which re-encodes rather than downsamples — the desk's normal maps were 530 KB
and 448 KB for 1024² images that are under 80 KB at q80. `extract-desk-textures.sh` calls
it itself, so `npm run textures` cannot put the heavy versions back.

**Material names are load-bearing.** `src/mouseArea.js` selects the mouse's skin by
matching `glass_top` / `glass_edges` / `aluminium`, and `src/floorSocket.js` finds its back
box by `CAJA`. The compression pass therefore runs `dedup --materials false`: merging
byte-identical materials saves a few bytes of JSON and silently deletes the names. It
collapsed the mouse's nine materials into one the first time.

**Load every GLB through `loadGLB` in `src/gltfLoader.js`.** A module that builds its own
`GLTFLoader` has no Draco decoder, works fine on an uncompressed model, and then fails the
day that model is compressed. `replaceDesks.js` did exactly that, and because `loadModel.js`
skips every prop when the desk swap returns null, one Draco'd `desk.glb` emptied the whole
room. `loadGLB` takes an `onProgress` callback so even the room has no reason to make one.

`simplify` runs twice whenever a ratio is given: meshoptimizer is greedy and one pass
stops well short of what was asked (the guitar answered 0.08 with 0.37). `--coarse` adds
12-bit Draco positions instead of 14, worth about a tenth of the geometry.

The simplify ratio is the only lossy step and is off unless asked for; it changes
silhouettes, so a model that has been decimated needs looking at in the scene, not just
weighed. Alpha is the other thing to check: several models carry cut-outs (the Mac Pro's
front lattice is a texture, not geometry), and a mask lost to a JPEG re-encode shows up as
a solid face rather than a missing one.

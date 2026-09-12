# Workplace 3D Viewer

A [three.js](https://threejs.org) room — Arash Goharrostami's workspace, modelled from
`tmp/Workplace.usdz` and readable as a resume. Built with Vite.

## Run it

```bash
npm install
npm run dev
```

Then open the URL Vite prints. Add `?debug` to the URL for the authoring tools
instead (see [Two modes](#two-modes)). `npm run build` produces a static bundle in `dist/`
(relative asset paths, so it can be hosted from any subdirectory), and
`npm run preview` serves that build.

## Two modes

The page boots as a **resume**: nine props stand in for the nine sections of a CV.
Nothing is drawn on top of them — hovering a readable prop lifts it out of the room's
dark palette and names it in the HUD, and clicking it (or a button in the dock) flies
the camera to it and slides that section in beside it.
Escape or the back button returns to the full room. Everything under `src/resume/`
serves this mode and nothing else.

Which prop carries which section is the table at the top of `src/resume/anchors.js`:

| Section | Prop |
| --- | --- |
| About | `Guitar_on_stand` |
| Experience | `Pro_Display_XDR` |
| Stack | `MacBook_Pro_16` |
| Projects | `Mac_Pro` |
| Education | `Apple_Watch_SE` |
| Writing | `iPad_Pro` |
| References | `AirPods_Max` |
| CV | `Paper_tablet` |
| Contact | `iPhone_15_Pro` |

No camera position in that table is hardcoded. Every prop in this scene is *placed* by
its own module off the desk's or a wall's live bounds, so a typed-in coordinate would
drift the first time a desk constant changed. An anchor names a prop instead, and its
label position and camera framing are computed from that prop's world bounding box at
load time. Moving a prop needs no change here; renaming one does.

An anchor whose prop failed to load is dropped, along with its dock button and its
panel — each prop module swallows its own failures, so any one of them can
legitimately be missing.

The CV is read on the paper tablet itself — the sheet drawn on it is the whole CV on one
page — and clicking that page asks whether to download the PDF, which is
`public/cv/Arash-Goharrostami.pdf`. The copy itself lives in `src/resume/content.js`, as
data rather than markup; `src/resume/panels.js` is the only thing that reads it.

`?debug` swaps all of the above for the tools the scene was arranged with: the
wireframe / grid / FPS panel and the drag-a-prop editor. Neither mode is wired when the
other is running.

## The models

The browser is served GLB files from `public/models/`, not the `.usdz` sources —
three.js's USDZ loader is experimental and does not reliably read the binary USDC
inside them. The GLBs are generated with Blender:

```bash
npm run convert          # every tmp/*.usdz
npm run convert -- Desk  # just one (Paper_Tablet for the e-ink tablet)
npm run shrink macPro 512 85 0.22   # resample + compress one model
npm run textures         # the desk's PBR maps, from the Computer Workspace Pack
npm run apple            # the MacBook Pro 16, Pro Display XDR, guitar, rug, iPad/Pencil/Watch + Draco decoder
npm run split            # separates the Pro Display XDR's mount — re-run after `npm run apple`
npm run wall             # the walls' concrete map, from Gallery_bare_concrete_wall.usdz
npm run floor            # the floor's ceramic tiles, from the WorkDesk3D project
```

That unpacks `tmp/<Source>.usdz` into `tmp/extracted/<Source>/` (so a model's texture
folder travels with its `scene.usdc`), imports it in Blender
(`/Applications/Blender.app`, override with `BLENDER=/path/to/blender`) and exports
`public/models/<camelCase>.glb`. Re-run it whenever a source `.usdz` changes. The
generated GLBs are committed so the viewer runs without Blender installed.

### Naming

Models arrive named by whoever made them — `macbook-pro-16`, `Mac_Pro`, `SOCKET__DE_PISO`
— but everything under `public/models/` is camelCase: `macbookPro16.glb`, `macPro.glb`,
`floorSocket.glb`. Acronyms take a single capital (`proDisplayXdr`) and a leading digit
moves to the end (`printer3d`).

The source name is not renamed. The `.usdz` in `tmp/` keeps it and it stays what you pass
to `npm run convert`; only the output is renamed. `scripts/model-names.txt` maps one to
the other, and `convert-usdz.sh`, `import-apple-models.sh` and `shrink-glb.mjs` all read
it, so re-importing a model cannot quietly put the old name back.

### Weight

The sources are far heavier than the scene needs — 4096x4096 maps on a 7.5 cm prop,
quarter-million-triangle props. `npm run shrink <model> [maxTextureSize] [quality]
[simplifyRatio]` resamples textures, re-encodes alpha-free PNGs as JPEG, and cleans and
Draco-compresses the geometry; the untouched original goes to `tmp/originals/`. The
simplify ratio is the only lossy step and is off unless asked for.

`npm run split` is the one step that edits a model rather than importing it, and it has
to be re-run after `npm run apple` puts the untouched file back. It gives the Pro
Display XDR's mount a node of its own for the portrait display to pivot its turn on,
and repairs the stand's normals. Both are explained in that script's own header. Everything about why it is done in Blender rather than at load
time is in that script's own header.

The desk's own materials come from a third model — the Computer Workspace Pack in
the WorkDesk3D project. `npm run textures` copies its `Dark_Wood_Final` (tabletop)
and `Metal_PBR_Final` (frame) image sets into `public/textures/desk/`; pass a path
to the script to point it at a different pack.

`workplace.glb` is the room. Its two original desks (`Table01_Desk01` and
`Table01_Table01`, an L along the back and right walls) are removed at load time
and replaced by the single `desk.glb` model — see `src/replaceDesks.js`. Its chair
(`Chair01_Chair`) is swapped the same way, for the black mesh-back office chair — see
`src/replaceChair.js`. Note that the replacement is parented to the model root, not to
the old chair's container: that container is a nested Sketchfab import carrying its own
90° turn and 4.8x scale, which lays anything added to it on its back.

## The music

The iPhone's screen carries a working Now Playing card — the iOS media widget, built in
code alongside the rest of the phone. Open the Contact section (the phone) and its
controls are live: play/pause, skip, a seekable progress bar, a volume slider and a
download button that saves the current track. Nothing
ever autoplays; every path to `play()` starts at a click, which is the only thing a
browser will honour.

The three tracks in `public/audio/` — *No Surprises* (Juliana Chahayed's cover), *You're
All I Want* (Cigarettes After Sex) and *i don't know you anymore* (sombr) — are re-encoded
at 96 kbps with their tags stripped (the cover art from those tags is in
`public/audio/covers/`, 256² each), which is about 40% of the download and inaudibly
different coming out of a 7 cm phone; the originals are kept in `tmp/originals/audio/`.
Nothing is fetched until ▶ is tapped, and the card shows a spinner in place of the glyph
while a track buffers. Replacing them is a matter of dropping a camelCase file in
`public/audio/` and editing the `TRACKS` table at the top of `src/resume/phonePlayer.js`.


## Layout

| Path | Purpose |
| --- | --- |
| `src/main.js` | Renderer, camera, orbit controls, render loop |
| `src/environment.js` | IBL, key light + shadows, ground plane, grid |
| `src/loadModel.js` | GLTF loading, recentering, camera auto-fit |
| `src/gltfLoader.js` | One shared GLTF/Draco loader for every model |
| `src/replaceDesks.js` | Swaps the two original desks for the `desk.glb` model |
| `src/replaceChair.js` | Swaps the original chair for the black mesh-back office chair |
| `src/deskMaterials.js` | Splits the desk into wood top / metal frame and textures both |
| `src/clearProps.js` | Empties the room down to desk, chair and shell |
| `src/deskAccessories.js` | Procedural monitor riser and laptop stand on the desk |
| `src/macbook.js` | Loads the MacBook Pro 16 and seats it on the stand |
| `src/proDisplay.js` | Loads both Pro Display XDRs — one on the riser, one turned portrait in the desk's corner |
| `src/printer.js` | Loads the 3D printer and stands it on the desk's right arm |
| `src/paperTablet.js` | Loads the e-ink paper tablet, lays it in front of the printer, and draws the CV on its page |
| `src/floorSocket.js` | Loads the floor socket, seats its back box, centres and uprights it, stands it beside the printer |
| `src/deskApple.js` | Lays the iPad, iPhone, Watch and Pencil in front of the display |
| `src/iphone15Pro.js` | The iPhone 15 Pro, built in code — screen, icons and clock |
| `src/phonePlayer.js` | The Now Playing card on that screen — its parts and its repaints |
| `src/blind.js` | Loads the roller blind and fits it to the window |
| `src/guitar.js` | Loads the guitar on its stand and sets it on the floor |
| `src/carpet.js` | Lays the rug under the chair — runs *before* the chair swap, off the original chair's box |
| `src/deskMat.js` | Felt keyboard mat, generated, laid on the desk's tray |
| `src/peripherals.js` | Magic Keyboard and Trackpad, laid on the mat |
| `src/mouseArea.js` | Small felt pad on the desktop with the Magic Mouse |
| `src/fillDeskCorner.js` | Squares off the desk model's chamfered outer corner |
| `src/extendBackWall.js` | Runs the windowless wall out behind the widened desk |
| `src/wallMaterials.js` | Dresses the room's walls in bare concrete |
| `src/floorMaterial.js` | Lays WorkDesk3D's ceramic tiles across the floor |
| `src/materials.js` | Shared `materialsOf()` helper |
| `src/resume/index.js` | Resume mode: sequences the four modules below |
| `src/resume/content.js` | Every word the room says, as data |
| `src/resume/portfolioPage.js` | The CV condensed to one A4 sheet, drawn to a canvas for the paper tablet |
| `src/resume/anchors.js` | Which prop is which section, framed off its live bounds |
| `src/resume/flight.js` | Eased camera travel, lens shift and orbit clamping |
| `src/resume/picking.js` | Hover glow and click-to-open on the props themselves |
| `src/resume/panels.js` | Builds the reading sidebar from `content.js` |
| `src/resume/sheetPrompt.js` | The CV read on the paper tablet: a click on its page asks whether to download the PDF |
| `src/debugPanel.js` | Wireframe / grid / auto-rotate / FPS toggles (`?debug`) |
| `src/overlay.js` | Load progress and error messages |
| `scripts/split-display-mount.py` | Gives the Pro Display XDR's mount its own node, and repairs the stand's normals |
| `scripts/` | USDZ → GLB conversion |

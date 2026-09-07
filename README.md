# Workplace 3D Viewer

A [three.js](https://threejs.org) viewer for `tmp/Workplace.usdz`, built with Vite.

## Run it

```bash
npm install
npm run dev
```

Then open the URL Vite prints. `npm run build` produces a static bundle in `dist/`
(relative asset paths, so it can be hosted from any subdirectory), and
`npm run preview` serves that build.

## The models

The browser is served GLB files from `public/models/`, not the `.usdz` sources —
three.js's USDZ loader is experimental and does not reliably read the binary USDC
inside them. The GLBs are generated with Blender:

```bash
npm run convert          # every tmp/*.usdz
npm run convert -- Desk  # just one
npm run textures         # the desk's PBR maps, from the Computer Workspace Pack
npm run apple            # the MacBook Pro 16, Pro Display XDR, printer, guitar, rug, iPad/Pencil/Watch + Draco decoder
npm run wall             # the walls' concrete map, from Gallery_bare_concrete_wall.usdz
npm run floor            # the floor's ceramic tiles, from the WorkDesk3D project
```

That unpacks `tmp/<Name>.usdz` into `tmp/extracted/<Name>/` (so a model's texture
folder travels with its `scene.usdc`), imports it in Blender
(`/Applications/Blender.app`, override with `BLENDER=/path/to/blender`) and exports
`public/models/<Name>.glb`. Re-run it whenever a source `.usdz` changes. The
generated GLBs are committed so the viewer runs without Blender installed.

The desk's own materials come from a third model — the Computer Workspace Pack in
the WorkDesk3D project. `npm run textures` copies its `Dark_Wood_Final` (tabletop)
and `Metal_PBR_Final` (frame) image sets into `public/textures/desk/`; pass a path
to the script to point it at a different pack.

`Workplace.glb` is the room. Its two original desks (`Table01_Desk01` and
`Table01_Table01`, an L along the back and right walls) are removed at load time
and replaced by the single `Desk.glb` model — see `src/replaceDesks.js`. Its chair
(`Chair01_Chair`) is swapped the same way, for the black mesh-back office chair — see
`src/replaceChair.js`. Note that the replacement is parented to the model root, not to
the old chair's container: that container is a nested Sketchfab import carrying its own
90° turn and 4.8x scale, which lays anything added to it on its back.

## Layout

| Path | Purpose |
| --- | --- |
| `src/main.js` | Renderer, camera, orbit controls, render loop |
| `src/environment.js` | IBL, key light + shadows, ground plane, grid |
| `src/loadModel.js` | GLTF loading, recentering, camera auto-fit |
| `src/gltfLoader.js` | One shared GLTF/Draco loader for every model |
| `src/replaceDesks.js` | Swaps the two original desks for the `Desk.glb` model |
| `src/replaceChair.js` | Swaps the original chair for the black mesh-back office chair |
| `src/deskMaterials.js` | Splits the desk into wood top / metal frame and textures both |
| `src/clearProps.js` | Empties the room down to desk, chair and shell |
| `src/deskAccessories.js` | Procedural monitor riser and laptop stand on the desk |
| `src/macbook.js` | Loads the MacBook Pro 16 and seats it on the stand |
| `src/proDisplay.js` | Loads the Pro Display XDR and stands it on the riser |
| `src/printer.js` | Loads the 3D printer and stands it on the desk's right arm |
| `src/deskApple.js` | Lays the iPad, iPhone, Watch and Pencil in front of the display |
| `src/iphone15Pro.js` | The iPhone 15 Pro, built in code — screen, icons and clock |
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
| `src/debugPanel.js` | Wireframe / grid / auto-rotate / FPS toggles |
| `src/overlay.js` | Load progress and error messages |
| `scripts/` | USDZ → GLB conversion |

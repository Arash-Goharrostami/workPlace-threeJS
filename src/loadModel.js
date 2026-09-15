import * as THREE from 'three';
import { replaceDesks } from './replaceDesks.js';
import { replaceChair } from './replaceChair.js';
import { loadGLB } from './gltfLoader.js';
import { materialsOf } from './materials.js';
import { darkenScene } from './darkenScene.js';
import { extendBackWall } from './extendBackWall.js';
import { applyWallMaterials } from './wallMaterials.js';
import { dressSkirting } from './skirting.js';
import { applyFloorMaterial } from './floorMaterial.js';
import { clearProps } from './clearProps.js';
import { addDeskAccessories } from './deskAccessories.js';
import { addMacbook } from './macbook.js';
import { addScreenbar } from './screenbar.js';
import { addScreenbarCable } from './screenbarCable.js';
import { addStickyNotes } from './stickyNotes.js';
import { addProDisplay, addSideDisplay } from './proDisplay.js';
import { addHomePodMini } from './homePodMini.js';
import { addHomePodCable } from './homePodCable.js';
import { addPrinter } from './printer.js';
import { addPaperTablet } from './paperTablet.js';
import { addBooks } from './books.js';
import { addBooksSet } from './booksSet.js';
import { addFigurines } from './figurines.js';
import { addPenDisplay } from './penDisplay.js';
import { addBlenderMug } from './blenderMug.js';
import { addFilamentSpools } from './filamentSpools.js';
import { addPrinterCable } from './printerCable.js';
import { addChargerCables } from './chargerCables.js';
import { addDeskApple } from './deskApple.js';
import { addBlind } from './blind.js';
import { addGuitar } from './guitar.js';
import { addDumbbells } from './dumbbells.js';
import { addCarpet } from './carpet.js';
import { addMacProCable } from './macProCable.js';
import { addMacbookUsbCable } from './macbookUsbCable.js';
import { addDisplayCables } from './displayCables.js';
import { addDeskMat } from './deskMat.js';
import { addPeripherals } from './peripherals.js';
import { addMouseArea } from './mouseArea.js';
import { addWallOutlet } from './wallOutlet.js';
import { addWallFrames } from './wallFrames.js';
import { addWallStory } from './wallStory.js';
import { addMacPro } from './macPro.js';
import { addPowerStrips } from './powerStrips.js';
import { addCableHolders } from './cableHolders.js';
import { addScreenbarRemote } from './screenbarRemote.js';
import { addAirPodsMax } from './airpodsMax.js';
import { addFloorSocket } from './floorSocket.js';
import { applyHomeView } from './homeView.js';
import { preloadAudio } from './preload.js';
import { STARTUP_URL } from './overlay.js';
import { CLIP_URL as TYPING_URL } from './typingPrompt.js';
import { CLIP_URL as PRINTER_URL } from './printerSound.js';

const MODEL_URL = 'models/workplace.glb';

/**
 * Loads the converted Workplace model, recenters it on the origin and frames
 * the camera to its bounds. Progress and failures are reported through `ui`.
 */
/**
 * The props, in the order the chain below places them — one name per `place()` call,
 * so the list's length is the count the loading screen shows. The HomePod cable is
 * placed once per speaker, hence twice here. A `place()` with a name not on the list
 * warns, so the two cannot drift apart silently.
 */
const OBJECTS = [
  'desk',
  'laptop',
  'display',
  'homepod cable',
  'homepod cable',
  'screenbar',
  'screenbar cable',
  'sticky notes',
  'printer',
  'paper tablet',
  'books',
  'book set',
  'pen display',
  'figurines',
  'mug',
  'filament spools',
  'printer cable',
  'charger cables',
  'side display',
  'apple gear',
  'screenbar remote',
  'airpods max',
  'peripherals',
  'mouse',
  'mac pro',
  'cable holders',
  'floor socket',
  'wall outlet',
  'wall frames',
  'wall story',
  'power strips',
  'mac pro cable',
  'usb-c cable',
  'display cables',
  'blind',
  'guitar',
  'dumbbells',
  'carpet',
  'chair',
];

export function loadModel({ scene, camera, controls, environment, ui }) {
  // One tally for the room and the opening's sounds: the bar counts every byte of both,
  // and the loading screen stays until all are in — so the first key struck and the
  // printer's first turn are heard on time (see `preload.js`).
  const tally = { model: [0, 0], audio: [0, 0] };
  const report = () => {
    const loaded = tally.model[0] + tally.audio[0];
    const total = tally.model[1] + tally.audio[1];
    ui.progress(total ? loaded / total : 0, loaded, total);
  };
  // The room's props, counted as they land: the bar is theirs once the bytes are in.
  let placed = 0;
  const place = async (name, promise) => {
    if (!OBJECTS.includes(name)) console.warn(`[objects] '${name}' is not in OBJECTS`);
    ui.objects(placed, OBJECTS.length, name);
    const result = await promise;
    placed += 1;
    ui.objects(placed, OBJECTS.length, name);
    return result;
  };
  const audioReady = preloadAudio([STARTUP_URL, TYPING_URL, PRINTER_URL], (loaded, total) => {
    tally.audio = [loaded, total];
    report();
  });

  return new Promise((resolve) => {
    loadGLB(MODEL_URL, (event) => {
      if (event.lengthComputable) {
        tally.model = [event.loaded, event.total];
      } else if (event.loaded) {
        // No length to count against: what has come in is all the room can say.
        tally.model = [event.loaded, event.loaded];
      }
      report();
    })
      .then(async (gltf) => {
        const model = gltf.scene;

        model.traverse((node) => {
          if (!node.isMesh) return;
          // The floor is the bottom of the world — it can only cast onto itself. The
          // walls do cast: the key light is above and outside, so they are what shade
          // the room's interior.
          node.castShadow = !isFloor(node);
          node.receiveShadow = true;
          // Blender's glTF export can leave double-sided flags off on thin panels.
          for (const mat of materialsOf(node)) {
            if (mat.map) mat.map.anisotropy = 8;
          }
        });

        // Recenter horizontally and drop the model onto y = 0.
        const raw = new THREE.Box3().setFromObject(model);
        const center = raw.getCenter(new THREE.Vector3());
        model.position.set(-center.x, -raw.min.y, -center.z);
        scene.add(model);
        // Flush the new position through before anything downstream measures the
        // model: setFromObject reads matrixWorld, so a stale one silently yields
        // model-local boxes that later get treated as world-space.
        model.updateMatrixWorld(true);

        const swap = await place('desk', replaceDesks(model).catch((error) => {
          console.warn('[desk swap] failed:', error);
          return null;
        }));
        if (swap) {
          console.info(
            `[desk swap] new desk covers ${(swap.coverage * 100).toFixed(0)}% of the old footprint`
          );
          if (swap.orphans.length) {
            console.warn('[desk swap] no desk under:', swap.orphans.join(', '));
          }
        }

        // The widened desk overhangs the back wall's end; run the wall out to meet it.
        const backWall = swap ? extendBackWall(model, swap.box) : null;

        // After the stretch, so the concrete is projected onto the wall's final size.
        applyWallMaterials(model);
        applyFloorMaterial(model);
        // The window wall's skirting overshoots the wall at both ends; trim it to fit.
        dressSkirting(model);

        const removed = clearProps(model);
        if (removed.length) console.info(`[props] cleared: ${removed.join(', ')}`);

        const accessories = swap ? addDeskAccessories(model, swap.box) : null;
        if (accessories) {
          await place('laptop', addMacbook(model, accessories.stand).catch((error) => {
            console.warn('[macbook] failed to load:', error);
          }));

          const mainDisplay = await place('display', addProDisplay(model, accessories.riser).catch((error) => {
            console.warn('[display] failed to load:', error);
            return null;
          }));

          // A pair, one on each free end of the riser plate either side of the display's
          // foot — so they need the riser, and nothing else. Built in code, so there is
          // nothing to await and nothing to fail on the network.
          const homepods = addHomePodMini(model, accessories.riser);
          // Each lead is authored against its own speaker by name and ends plugged into
          // the back of the display. These do wait: the Type-C plug comes out of the
          // USB-C pack.
          for (const homepod of homepods) {
            await place('homepod cable', addHomePodCable(model, homepod).catch((error) => {
              console.warn('[homepod cable] failed to load:', error);
            }));
          }

          // Hangs off the display's top edge, so it has to wait for it.
          const bar = await place('screenbar', addScreenbar(model, mainDisplay).catch((error) => {
            console.warn('[screenbar] failed to load:', error);
            return null;
          }));

          // Its lead is measured from the bar, so it follows it.
          await place('screenbar cable', addScreenbarCable(model, bar).catch((error) => {
            console.warn('[screenbar cable] failed to load:', error);
          }));

          // Stuck to the display's bezel, so they only need the display.
          await place('sticky notes', addStickyNotes(model, mainDisplay).catch((error) => {
            console.warn('[sticky notes] failed to load:', error);
          }));
          await place('printer', addPrinter(model, swap.box, accessories.stand).catch((error) => {
            console.warn('[printer] failed to load:', error);
          }));

          // Laid at an authored spot of its own, so it needs nothing but somewhere to lie.
          await place('paper tablet', addPaperTablet(model).catch((error) => {
            console.warn('[paper tablet] failed to load:', error);
          }));

          // Three loose books past the tablet, each at an authored spot of its own.
          await place('books', addBooks(model).catch((error) => {
            console.warn('[books] failed to load:', error);
          }));

          // Six more on the left of the desk, four closed and two open, each a prop of its own.
          await place('book set', addBooksSet(model).catch((error) => {
            console.warn('[book set] failed to load:', error);
          }));

          // A pen display on its stand, on the right of the desk, at an authored spot of its own.
          await place('pen display', addPenDisplay(model).catch((error) => {
            console.warn('[pen display] failed to load:', error);
          }));

          // Two figurines standing at authored spots of their own; each catches for itself.
          await place('figurines', addFigurines(model));

          // A mug standing on the left of the desk, at an authored spot of its own.
          await place('mug', addBlenderMug(model).catch((error) => {
            console.warn('[blender mug] failed to load:', error);
          }));

          // Stands on the floor at an authored spot of its own, so it needs nothing
          // but somewhere to hang.
          await place('filament spools', addFilamentSpools(model).catch((error) => {
            console.warn('[filament spools] failed to load:', error);
          }));

          // The lead is authored in world space, but it ends inside the printer, so it
          // goes in after the machine is seated.
          await place('printer cable', addPrinterCable(model).catch((error) => {
            console.warn('[printer cable] failed to load:', error);
          }));

          // Two spare leads left lying on the desk in front of the printer; authored
          // in world space, so they need nothing but somewhere to hang.
          await place('charger cables', addChargerCables(model).catch((error) => {
            console.warn('[charger cables] failed to load:', error);
          }));
          await place('side display', addSideDisplay(model).catch((error) => {
            console.warn('[side display] failed to load:', error);
          }));
          await place('apple gear', addDeskApple(
            model,
            swap.box,
            model.getObjectByName('Pro_Display_XDR')
          ).catch((error) => {
            console.warn('[desk apple] failed to load:', error);
          }));
          await place('screenbar remote', addScreenbarRemote(model).catch((error) => {
            console.warn('[screenbar remote] failed to load:', error);
          }));
          await place('airpods max', addAirPodsMax(model).catch((error) => {
            console.warn('[airpods max] failed to load:', error);
          }));
          const mat = addDeskMat(model, swap.desk);
          await place('peripherals', addPeripherals(model, mat).catch((error) => {
            console.warn('[peripherals] failed to load:', error);
          }));
          await place('mouse', addMouseArea(model, swap.desk).catch((error) => {
            console.warn('[mouse] failed to load:', error);
          }));
          await place('mac pro', addMacPro(model, swap.desk, model.getObjectByName('floor')).catch((error) => {
            console.warn('[mac pro] failed to load:', error);
          }));
          await place('cable holders', addCableHolders(model).catch((error) => {
            console.warn('[cable holders] failed to load:', error);
          }));

          await place('floor socket', addFloorSocket(model, swap.box).catch((error) => {
            console.warn('[socket] failed to load:', error);
          }));
        }

        // `extendBackWall` only hands back the wall when it actually stretched it,
        // so fall back to the blank wall by name.
        const outlet = await place('wall outlet', addWallOutlet(
          model,
          backWall ?? model.getObjectByName('wall1'),
          model.getObjectByName('floor')
        ).catch((error) => {
          console.warn('[outlet] failed to load:', error);
          return null;
        }));

        // Hung at an authored spot of its own, so it needs nothing but somewhere to hang.
        await place('wall frames', addWallFrames(model).catch((error) => {
          console.warn('[wall frames] failed to load:', error);
        }));

        // The site's story, on the back wall's outer face. Drawn, not loaded.
        await place('wall story', Promise.resolve().then(() => addWallStory(model)).catch((error) => {
          console.warn('[wall story] failed:', error);
        }));

        await place('power strips', addPowerStrips(model, model.getObjectByName('floor'), outlet).catch((error) => {
          console.warn('[power strips] failed to load:', error);
        }));

        // Its own route and both its ends are authored in world space, so unlike the
        // strips it needs nothing but somewhere to hang.
        await place('mac pro cable', addMacProCable(model).catch((error) => {
          console.warn('[mac pro cable] failed to load:', error);
        }));

        // Both ends are props of their own, so it goes in after the laptop and tower.
        if (swap) {
          await place('usb-c cable', addMacbookUsbCable(model).catch((error) => {
            console.warn('[macbook usb-c] failed to load:', error);
          }));

          // The display's own two leads: they need the outlet as well as the desk's
          // props, so they wait until everything they hang off is in.
          await place('display cables', addDisplayCables(model).catch((error) => {
            console.warn('[display cables] failed to load:', error);
          }));
        }

        // Depends on the window alone, so it runs whether or not the desk swap landed.
        await place('blind', addBlind(model).catch((error) => {
          console.warn('[blind] failed to load:', error);
        }));

        if (swap) {
          await place('guitar', addGuitar(model, swap.box, model.getObjectByName('floor')).catch((error) => {
            console.warn('[guitar] failed to load:', error);
          }));

          // Lies on the floor in front of the guitar, so it waits for it.
          await place('dumbbells', addDumbbells(
            model,
            model.getObjectByName('Guitar_on_stand'),
            model.getObjectByName('floor')
          ).catch((error) => {
            console.warn('[dumbbells] failed to load:', error);
          }));
        }

        // Laid off the *original* chair, before the swap: the rug is placed from the
        // chair's own box, so reading the replacement instead would drag it to a
        // different spot on the floor.
        const carpet = await place('carpet', addCarpet(
          model,
          model.getObjectByName('Chair01_Chair'),
          model.getObjectByName('floor'),
          swap?.desk
        ).catch((error) => {
          console.warn('[carpet] failed to load:', error);
          return null;
        }));

        await place('chair', replaceChair(
          model,
          swap?.box,
          carpet,
          model.getObjectByName('Guitar_on_stand')
        ).catch((error) => {
          console.warn('[chair swap] failed:', error);
        }));

        darkenScene(model);

        // Recomputed after the swap so the auto-fit and light rig see the new desk.
        const box = new THREE.Box3().setFromObject(model);
        environment.fitToBounds(box);
        frameCamera(box, camera, controls);

        // The room is in; the bar closes on the sounds, if they are still coming.
        tally.model = [tally.model[1], tally.model[1]];
        await audioReady;
        ui.objects(OBJECTS.length, OBJECTS.length);
        ui.hide();
        resolve(model);
      })
      .catch((error) => {
        ui.error(`Could not load ${MODEL_URL}. ${error?.message ?? error}`);
        resolve(null);
      });
  });
}

/** Whether a mesh belongs to the room's floor, which never needs to cast. */
function isFloor(node) {
  for (let o = node; o; o = o.parent) {
    if (o.name === 'floor') return true;
  }
  return false;
}

/** Places the camera at the room's home view, and sets how far orbiting may zoom. */
function frameCamera(box, camera, controls) {
  const { distance, radius } = applyHomeView(box, camera, controls);
  controls.minDistance = radius * 0.1;
  controls.maxDistance = distance * 6;
  controls.update();
}

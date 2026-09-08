import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { replaceDesks } from './replaceDesks.js';
import { replaceChair } from './replaceChair.js';
import { materialsOf } from './materials.js';
import { darkenScene } from './darkenScene.js';
import { extendBackWall } from './extendBackWall.js';
import { applyWallMaterials } from './wallMaterials.js';
import { applyFloorMaterial } from './floorMaterial.js';
import { clearProps } from './clearProps.js';
import { addDeskAccessories } from './deskAccessories.js';
import { addMacbook } from './macbook.js';
import { addScreenbar } from './screenbar.js';
import { addProDisplay, addSideDisplay } from './proDisplay.js';
import { addPrinter } from './printer.js';
import { addDeskApple } from './deskApple.js';
import { addBlind } from './blind.js';
import { addGuitar } from './guitar.js';
import { addCarpet } from './carpet.js';
import { addMacProCable } from './macProCable.js';
import { addMacbookUsbCable } from './macbookUsbCable.js';
import { addDisplayCables } from './displayCables.js';
import { addDeskMat } from './deskMat.js';
import { addPeripherals } from './peripherals.js';
import { addMouseArea } from './mouseArea.js';
import { addWallOutlet } from './wallOutlet.js';
import { addMacPro } from './macPro.js';
import { addPowerStrips } from './powerStrips.js';
import { addCableHolders } from './cableHolders.js';
import { addScreenbarRemote } from './screenbarRemote.js';
import { addAirPodsMax } from './airpodsMax.js';
import { addFloorSocket } from './floorSocket.js';
import { applyHomeView } from './homeView.js';

const MODEL_URL = 'models/Workplace.glb';

/**
 * Loads the converted Workplace model, recenters it on the origin and frames
 * the camera to its bounds. Progress and failures are reported through `ui`.
 */
export function loadModel({ scene, camera, controls, environment, ui }) {
  const loader = new GLTFLoader();

  return new Promise((resolve) => {
    loader.load(
      MODEL_URL,
      async (gltf) => {
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

        ui.progressText('Placing desk…');
        const swap = await replaceDesks(model).catch((error) => {
          console.warn('[desk swap] failed:', error);
          return null;
        });
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

        const removed = clearProps(model);
        if (removed.length) console.info(`[props] cleared: ${removed.join(', ')}`);

        const accessories = swap ? addDeskAccessories(model, swap.box) : null;
        if (accessories) {
          ui.progressText('Placing laptop…');
          await addMacbook(model, accessories.stand).catch((error) => {
            console.warn('[macbook] failed to load:', error);
          });

          // Its perch on the lid is authored, so it needs nothing but somewhere to hang.
          await addScreenbar(model).catch((error) => {
            console.warn('[screenbar] failed to load:', error);
          });
          await addProDisplay(model, accessories.riser).catch((error) => {
            console.warn('[display] failed to load:', error);
          });
          await addPrinter(model, swap.box, accessories.stand).catch((error) => {
            console.warn('[printer] failed to load:', error);
          });
          await addSideDisplay(model, swap.box).catch((error) => {
            console.warn('[side display] failed to load:', error);
          });
          await addDeskApple(
            model,
            swap.box,
            model.getObjectByName('Pro_Display_XDR')
          ).catch((error) => {
            console.warn('[desk apple] failed to load:', error);
          });
          await addScreenbarRemote(model).catch((error) => {
            console.warn('[screenbar remote] failed to load:', error);
          });
          await addAirPodsMax(model).catch((error) => {
            console.warn('[airpods max] failed to load:', error);
          });
          const mat = addDeskMat(model, swap.desk);
          await addPeripherals(model, mat).catch((error) => {
            console.warn('[peripherals] failed to load:', error);
          });
          await addMouseArea(model, swap.desk).catch((error) => {
            console.warn('[mouse] failed to load:', error);
          });
          await addMacPro(model, swap.desk, model.getObjectByName('floor')).catch((error) => {
            console.warn('[mac pro] failed to load:', error);
          });
          await addCableHolders(model).catch((error) => {
            console.warn('[cable holders] failed to load:', error);
          });

          await addFloorSocket(model, swap.box).catch((error) => {
            console.warn('[socket] failed to load:', error);
          });
        }

        // `extendBackWall` only hands back the wall when it actually stretched it,
        // so fall back to the blank wall by name.
        const outlet = await addWallOutlet(
          model,
          backWall ?? model.getObjectByName('wall1'),
          model.getObjectByName('floor')
        ).catch((error) => {
          console.warn('[outlet] failed to load:', error);
          return null;
        });

        await addPowerStrips(model, model.getObjectByName('floor'), outlet).catch((error) => {
          console.warn('[power strips] failed to load:', error);
        });

        // Its own route and both its ends are authored in world space, so unlike the
        // strips it needs nothing but somewhere to hang.
        await addMacProCable(model).catch((error) => {
          console.warn('[mac pro cable] failed to load:', error);
        });

        // Both ends are props of their own, so it goes in after the laptop and tower.
        if (swap) {
          await addMacbookUsbCable(model).catch((error) => {
            console.warn('[macbook usb-c] failed to load:', error);
          });

          // The display's own two leads: they need the outlet as well as the desk's
          // props, so they wait until everything they hang off is in.
          await addDisplayCables(model).catch((error) => {
            console.warn('[display cables] failed to load:', error);
          });

        }

        // Depends on the window alone, so it runs whether or not the desk swap landed.
        await addBlind(model).catch((error) => {
          console.warn('[blind] failed to load:', error);
        });

        if (swap) {
          await addGuitar(model, swap.box, model.getObjectByName('floor')).catch((error) => {
            console.warn('[guitar] failed to load:', error);
          });
        }

        // Laid off the *original* chair, before the swap: the rug is placed from the
        // chair's own box, so reading the replacement instead would drag it to a
        // different spot on the floor.
        const carpet = await addCarpet(
          model,
          model.getObjectByName('Chair01_Chair'),
          model.getObjectByName('floor'),
          swap?.desk
        ).catch((error) => {
          console.warn('[carpet] failed to load:', error);
          return null;
        });

        await replaceChair(
          model,
          swap?.box,
          carpet,
          model.getObjectByName('Guitar_on_stand')
        ).catch((error) => {
          console.warn('[chair swap] failed:', error);
        });

        darkenScene(model);

        // Recomputed after the swap so the auto-fit and light rig see the new desk.
        const box = new THREE.Box3().setFromObject(model);
        environment.fitToBounds(box);
        frameCamera(box, camera, controls);

        ui.hide();
        resolve(model);
      },
      (event) => {
        if (event.lengthComputable) {
          ui.progress(event.loaded / event.total);
        } else if (event.loaded) {
          ui.progressText(`Loading model… ${(event.loaded / 1e6).toFixed(1)} MB`);
        }
      },
      (error) => {
        ui.error(`Could not load ${MODEL_URL}. ${error?.message ?? error}`);
        resolve(null);
      }
    );
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

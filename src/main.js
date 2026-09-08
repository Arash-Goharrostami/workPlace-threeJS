import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { setupEnvironment } from './environment.js';
import { loadModel } from './loadModel.js';
import { setupDebugPanel } from './debugPanel.js';
import { setupEditor } from './editor.js';
import { setupResume } from './resume/index.js';
import { ui } from './overlay.js';

// The room has two modes. By default it is a resume: the props themselves are the
// interface, and clicking one opens a section. `?debug` swaps that for the authoring tools — the
// wireframe/grid panel and the drag-a-prop editor the scene was arranged with.
const DEBUG = new URLSearchParams(window.location.search).has('debug');
document.body.classList.toggle('is-debug', DEBUG);

// The viewport can report 0 while the page is still hidden (e.g. an embedded
// preview pane), which would poison camera.aspect with NaN — always clamp to 1.
const viewportSize = () => ({
  width: Math.max(1, window.innerWidth),
  height: Math.max(1, window.innerHeight),
});

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(viewportSize().width, viewportSize().height);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.8;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(50, viewportSize().width / viewportSize().height, 0.1, 1000);
camera.position.set(6, 4, 6);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.autoRotateSpeed = 0.8;

const environment = setupEnvironment(scene, renderer);
const stats = DEBUG ? setupDebugPanel({ scene, camera, controls, environment }) : null;

// The shadow map is cached (see environment.js), so it is drawn once the room and
// every prop it loads have settled — all of which the promise waits on.
// Both the editor and the resume's anchors are built from the props the scene
// actually ended up with, so neither can be set up before the load resolves.
let resume = null;
loadModel({ scene, camera, controls, environment, ui }).then((model) => {
  environment.refreshShadows();
  if (!model) return;
  if (DEBUG) setupEditor({ scene, camera, renderer, controls, model, environment });
  else resume = setupResume({ scene, camera, renderer, controls, model });
});

function handleResize() {
  const { width, height } = viewportSize();
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
}

window.addEventListener('resize', handleResize);
// Catches the case where the page is laid out after the first frame.
new ResizeObserver(handleResize).observe(document.body);

renderer.setAnimationLoop(() => {
  // Before `controls.update()`: a flight writes the camera position that the damping
  // in `controls` then settles.
  resume?.update();
  controls.update();
  renderer.render(scene, camera);
  stats?.update();
});

// Handy for debugging from the browser console. `resume` is filled in once the room
// has loaded, and stays null in `?debug` mode.
window.__viewer = { renderer, scene, camera, controls, get resume() { return resume; } };

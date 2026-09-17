// The loading screen's own entry — the first module script in `index.html`, so the
// cube is drawn as soon as three.js and the loader are in, while the rest of `main.js`'s
// graph is still downloading. The module starts itself on import.
import './loadingCube.js';

/**
 * `CanvasRenderingContext2D.roundRect` arrived in Safari 16 and Chrome 99. The screens
 * and the Notes window draw with it, and on an iPhone still on iOS 15 or an older
 * Android browser the missing method threw while the room was being built and left
 * the page black. This puts a plain path-based version in its place where it is absent.
 * Imported first in `main.js`, before anything draws.
 */
if (typeof CanvasRenderingContext2D !== 'undefined' && !CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function roundRect(x, y, w, h, radii = 0) {
    let r = Array.isArray(radii) ? radii[0] ?? 0 : radii;
    if (typeof r === 'object') r = r.x ?? 0;
    r = Math.max(0, Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2));
    this.moveTo(x + r, y);
    this.lineTo(x + w - r, y);
    this.arcTo(x + w, y, x + w, y + r, r);
    this.lineTo(x + w, y + h - r);
    this.arcTo(x + w, y + h, x + w - r, y + h, r);
    this.lineTo(x + r, y + h);
    this.arcTo(x, y + h, x, y + h - r, r);
    this.lineTo(x, y + r);
    this.arcTo(x, y, x + r, y, r);
    this.closePath();
  };
}

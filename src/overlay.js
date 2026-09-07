const el = document.getElementById('overlay');
const text = document.getElementById('overlay-text');
const bar = document.getElementById('bar');

export const ui = {
  progress(fraction) {
    bar.style.width = `${Math.round(fraction * 100)}%`;
    text.textContent = `Loading model… ${Math.round(fraction * 100)}%`;
  },
  progressText(message) {
    text.textContent = message;
  },
  hide() {
    bar.style.width = '100%';
    el.classList.add('hidden');
  },
  error(message) {
    el.classList.remove('hidden');
    el.classList.add('error');
    text.textContent = message;
  },
};

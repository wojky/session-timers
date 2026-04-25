/**
 * settings.js — Settings panel open/close logic.
 */

const btn      = document.getElementById('settings-btn');
const panel    = document.getElementById('settings-panel');
const overlay  = document.getElementById('settings-overlay');
const closeBtn = document.getElementById('settings-close');

export function openSettings() {
  panel.classList.remove('closed');
  overlay.classList.remove('hidden');
  btn.classList.add('open');
  btn.setAttribute('aria-expanded', 'true');
}

export function closeSettings() {
  panel.classList.add('closed');
  overlay.classList.add('hidden');
  btn.classList.remove('open');
  btn.setAttribute('aria-expanded', 'false');
}

btn.addEventListener('click', () => {
  panel.classList.contains('closed') ? openSettings() : closeSettings();
});
closeBtn.addEventListener('click', closeSettings);
overlay.addEventListener('click', closeSettings);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeSettings();
});

/**
 * ui.js — DOM helpers for updating timer cards and modal.
 */

/** Converts total seconds to "mm:ss" string. */
export function secondsToDisplay(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/**
 * Parses a "mm:ss" string to total seconds.
 * Returns null if the format is invalid.
 * @param {string} value
 * @returns {number|null}
 */
export function displayToSeconds(value) {
  const match = value.trim().match(/^(\d{1,3}):(\d{2})$/);
  if (!match) return null;
  const minutes = parseInt(match[1], 10);
  const seconds = parseInt(match[2], 10);
  if (seconds > 59) return null;
  return minutes * 60 + seconds;
}

/**
 * Updates the visual state of a timer card:
 * - display value
 * - active ring / indicator dot
 * - play/pause icons and label
 * - status badge
 *
 * @param {string} id
 * @param {number} seconds
 * @param {boolean} running
 */
export function updateCard(id, seconds, running) {
  const card = document.querySelector(`[data-timer-id="${id}"]`);
  if (!card) return;

  // Display input (only update when not focused — avoid overwriting user typing)
  const display = card.querySelector('.timer-display');
  if (document.activeElement !== display) {
    display.value = secondsToDisplay(seconds);
  }

  // Running indicator dot
  const dot = card.querySelector('.timer-indicator');
  if (running) {
    dot.classList.remove('bg-slate-600');
    dot.classList.add('bg-emerald-400', 'animate-pulse');
  } else {
    dot.classList.add('bg-slate-600');
    dot.classList.remove('bg-emerald-400', 'animate-pulse');
  }

  // Active ring on card
  if (running) {
    card.classList.add('active');
  } else {
    card.classList.remove('active');
  }

  // Play/Pause icons
  const iconPlay = card.querySelector('.icon-play');
  const iconPause = card.querySelector('.icon-pause');
  const toggleLabel = card.querySelector('.toggle-label');

  if (running) {
    iconPlay.classList.add('hidden');
    iconPause.classList.remove('hidden');
    toggleLabel.textContent = 'Pauza';
  } else {
    iconPlay.classList.remove('hidden');
    iconPause.classList.add('hidden');
    toggleLabel.textContent = seconds > 0 ? 'Wznów' : 'Start';
  }

  // Status badge
  const badge = card.querySelector('.timer-status-badge');
  if (running) {
    badge.textContent = 'Aktywny';
    badge.classList.remove('bg-slate-700', 'text-slate-400');
    badge.classList.add('bg-emerald-900/60', 'text-emerald-400');
  } else {
    badge.textContent = seconds > 0 ? 'Wstrzymany' : 'Zatrzymany';
    badge.classList.add('bg-slate-700', 'text-slate-400');
    badge.classList.remove('bg-emerald-900/60', 'text-emerald-400');
  }
}

// ── Modal ─────────────────────────────────────────────────────────────────────

const modal = document.getElementById('reset-modal');
const modalConfirm = document.getElementById('modal-confirm');
const modalCancel = document.getElementById('modal-cancel');

let _resolveFn = null;

/** Shows the reset confirmation modal. Returns a promise that resolves to true/false. */
export function confirmReset() {
  return new Promise((resolve) => {
    _resolveFn = resolve;
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    modalConfirm.focus();
  });
}

function closeModal(result) {
  modal.classList.add('hidden');
  modal.classList.remove('flex');
  _resolveFn?.(result);
  _resolveFn = null;
}

modalConfirm.addEventListener('click', () => closeModal(true));
modalCancel.addEventListener('click', () => closeModal(false));
modal.addEventListener('click', (e) => {
  if (e.target === modal) closeModal(false);
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !modal.classList.contains('hidden')) {
    closeModal(false);
  }
});

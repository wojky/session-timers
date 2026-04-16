/**
 * app.js — Entry point. Wires timers.js + ui.js to the DOM.
 */

import {
  TIMER_IDS,
  setOnTick,
  toggleTimer,
  resetTimer,
  setTimerSeconds,
  getTimerState,
} from './timers.js';

import {
  updateCard,
  confirmReset,
  displayToSeconds,
  secondsToDisplay,
} from './ui.js';

// ── Initialise cards ──────────────────────────────────────────────────────────

TIMER_IDS.forEach((id) => {
  const { seconds, running } = getTimerState(id);
  updateCard(id, seconds, running);
});

// ── Tick callback ─────────────────────────────────────────────────────────────

setOnTick((id, seconds) => {
  const { running } = getTimerState(id);
  updateCard(id, seconds, running);
});

// ── Button event delegation ───────────────────────────────────────────────────

document.getElementById('timers-container').addEventListener('click', async (e) => {
  const card = e.target.closest('[data-timer-id]');
  if (!card) return;
  const id = card.dataset.timerId;

  if (e.target.closest('.timer-toggle')) {
    toggleTimer(id);
    const { seconds, running } = getTimerState(id);
    updateCard(id, seconds, running);
    return;
  }

  if (e.target.closest('.timer-reset')) {
    const confirmed = await confirmReset();
    if (confirmed) {
      resetTimer(id);
      updateCard(id, 0, false);
    }
  }
});

// ── Manual time editing ───────────────────────────────────────────────────────

document.getElementById('timers-container').addEventListener('change', (e) => {
  const display = e.target.closest('.timer-display');
  if (!display) return;

  const card = display.closest('[data-timer-id]');
  if (!card) return;
  const id = card.dataset.timerId;

  const parsed = displayToSeconds(display.value);
  if (parsed !== null) {
    setTimerSeconds(id, parsed);
    const { running } = getTimerState(id);
    updateCard(id, parsed, running);
  } else {
    // Revert to current value on invalid input
    const { seconds, running } = getTimerState(id);
    display.value = secondsToDisplay(seconds);
    display.classList.add('border-red-500');
    setTimeout(() => display.classList.remove('border-red-500'), 1200);
  }
});

// Auto-format: allow only digits and colon; enforce mm:ss on blur
document.getElementById('timers-container').addEventListener('keydown', (e) => {
  const display = e.target.closest('.timer-display');
  if (!display) return;

  // Allow: digits, backspace, delete, arrows, tab, colon
  const allowed = /^[\d:]$/.test(e.key);
  const control = ['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Tab', 'Enter'].includes(e.key);
  if (!allowed && !control) {
    e.preventDefault();
  }
  if (e.key === 'Enter') {
    display.blur();
  }
});

// ── Session panel toggle ──────────────────────────────────────────────────────

const sessionToggle = document.getElementById('session-toggle');
const sessionPanel = document.getElementById('session-panel');
const sessionChevron = document.getElementById('session-chevron');

sessionToggle.addEventListener('click', () => {
  const isCollapsed = sessionPanel.classList.toggle('collapsed');
  sessionChevron.classList.toggle('rotate', isCollapsed);
  sessionToggle.setAttribute('aria-expanded', String(!isCollapsed));
});

// ── Session date/time — persist to sessionStorage ─────────────────────────────

const dateInput = document.getElementById('session-date');
const timeInput = document.getElementById('session-time');

// Restore from sessionStorage
const savedDate = sessionStorage.getItem('session-date');
const savedTime = sessionStorage.getItem('session-time');
if (savedDate) dateInput.value = savedDate;
if (savedTime) timeInput.value = savedTime;

dateInput.addEventListener('change', () => {
  sessionStorage.setItem('session-date', dateInput.value);
});
timeInput.addEventListener('change', () => {
  sessionStorage.setItem('session-time', timeInput.value);
});

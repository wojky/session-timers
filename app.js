/**
 * app.js — Entry point. Wires timers.js + ui.js to the DOM.
 */

// ── PWA service worker ────────────────────────────────────────────────────────
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').then((reg) => {
    // Show update banner if a new SW is already waiting
    if (reg.waiting) showUpdateBanner(reg.waiting);

    // SW found update during this session
    reg.addEventListener('updatefound', () => {
      const newSW = reg.installing;
      newSW.addEventListener('statechange', () => {
        if (newSW.state === 'installed' && navigator.serviceWorker.controller) {
          showUpdateBanner(newSW);
        }
      });
    });
  }).catch(() => {});
}

function showUpdateBanner(sw) {
  const banner = document.getElementById('update-banner');
  if (!banner) return;
  banner.classList.remove('translate-y-full', 'opacity-0');
  banner.classList.add('translate-y-0', 'opacity-100');

  document.getElementById('update-reload').addEventListener('click', () => {
    sw.postMessage('SKIP_WAITING');
    navigator.serviceWorker.addEventListener('controllerchange', () => location.reload());
  });

  document.getElementById('update-dismiss').addEventListener('click', () => {
    banner.classList.add('translate-y-full', 'opacity-0');
  });
}

import {
  TIMER_IDS,
  setOnTick,
  setOnStateChange,
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

import { recordStart, recordPause, clearTimerHistory, clearAllHistory } from './history.js';
import { renderStats } from './stats.js';

// ── State change → history ─────────────────────────────────────────────────────
setOnStateChange((id, event, seconds) => {
  if (event === 'start') recordStart(id);
  if (event === 'pause') recordPause(id, seconds);
});

// ── Initialise cards (restore from localStorage) ──────────────────────────────

const _lsSeconds = (() => {
  try { return JSON.parse(localStorage.getItem('session-timer-seconds') ?? 'null') ?? {}; }
  catch (_) { return {}; }
})();

TIMER_IDS.forEach((id) => {
  const saved = _lsSeconds[id];
  if (saved > 0) setTimerSeconds(id, saved);
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
      clearTimerHistory(id);
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
// ── View toggle (timers ↔ stats) ───────────────────────────────────────────

const _timersPanel = document.getElementById('timers-container');
const _statsPanel  = document.getElementById('stats-panel');
const _btnTimers   = document.getElementById('view-btn-timers');
const _btnStats    = document.getElementById('view-btn-stats');

const ACTIVE_BTN   = ['text-indigo-400', 'bg-slate-700'];
const INACTIVE_BTN = ['text-slate-500', 'hover:text-slate-300'];

function setView(view) {
  const goStats = view === 'stats';
  _timersPanel.classList.toggle('hidden', goStats);
  _statsPanel.classList.toggle('hidden', !goStats);

  // Hide session info section when on stats view
  const sessionSection = document.getElementById('session-toggle')?.closest('section');
  sessionSection?.classList.toggle('hidden', goStats);

  // Toggle button styles
  _btnTimers.classList.toggle('text-indigo-400', !goStats);
  _btnTimers.classList.toggle('bg-slate-700',    !goStats);
  _btnTimers.classList.toggle('text-slate-500',   goStats);
  _btnStats.classList.toggle('text-indigo-400',   goStats);
  _btnStats.classList.toggle('bg-slate-700',      goStats);
  _btnStats.classList.toggle('text-slate-500',   !goStats);

  if (goStats) renderStats();
}

document.querySelectorAll('[data-set-view]').forEach((btn) => {
  btn.addEventListener('click', () => setView(btn.dataset.setView));
});

// ── New session ───────────────────────────────────────────────────────────────

document.getElementById('btn-new-session').addEventListener('click', async () => {
  const confirmed = await confirmReset({
    title:        'Nowa sesja?',
    body:         'Wszystkie timery zostaną wyzerowane i historia wyczyszczona. Czy na pewno chcesz kontynuować?',
    confirmLabel: 'Zacznij nową',
  });
  if (!confirmed) return;

  TIMER_IDS.forEach((id) => {
    resetTimer(id);
    updateCard(id, 0, false);
  });
  clearAllHistory();

  const dateEl = document.getElementById('session-date');
  const timeEl = document.getElementById('session-time');
  if (dateEl) dateEl.value = '';
  if (timeEl) timeEl.value = '';
  sessionStorage.removeItem('session-date');
  sessionStorage.removeItem('session-time');

  setView('timers');
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

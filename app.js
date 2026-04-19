/**
 * app.js — Entry point. Wires timers.js + ui.js to the DOM.
 */

// ── PWA service worker ────────────────────────────────────────────────────────
if ('serviceWorker' in navigator) {
  // Auto-reload when a new SW takes control (after skipWaiting + clients.claim).
  // Guard prevents reload loops.
  let _swRefreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (_swRefreshing) return;
    _swRefreshing = true;
    window.location.reload();
  });

  navigator.serviceWorker.register('./sw.js').then((reg) => {
    // If a new SW is already waiting (rare edge case), activate it now.
    if (reg.waiting) reg.waiting.postMessage('SKIP_WAITING');

    reg.addEventListener('updatefound', () => {
      const newSW = reg.installing;
      newSW.addEventListener('statechange', () => {
        if (newSW.state === 'installed' && navigator.serviceWorker.controller) {
          // skipWaiting is called automatically by the SW, so nothing to do here.
          // The controllerchange listener above will handle the reload.
        }
      });
    });
  }).catch(() => {});
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

import { recordStart, recordPause, clearTimerHistory, clearAllHistory, history } from './history.js';
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
// ── Session date/time — persist to sessionStorage ─────────────────────────────

const dateInput = document.getElementById('session-date');
const timeInput = document.getElementById('session-time');

// Restore from sessionStorage
const savedDate = sessionStorage.getItem('session-date');
const savedTime = sessionStorage.getItem('session-time');
if (savedDate && dateInput) dateInput.value = savedDate;
if (savedTime && timeInput) timeInput.value = savedTime;

if (dateInput) {
  dateInput.addEventListener('change', () => {
    sessionStorage.setItem('session-date', dateInput.value);
  });
}
if (timeInput) {
  timeInput.addEventListener('change', () => {
    sessionStorage.setItem('session-time', timeInput.value);
  });
}

// ── CSV export ────────────────────────────────────────────────────────────────

document.getElementById('btn-export-csv')?.addEventListener('click', () => {
  const date = dateInput?.value || '';
  const time = timeInput?.value || '';

  const rows = [['Lp.', 'Licznik', 'Start (czas lokalny)', 'Czas trwania (ms)']];
  history.forEach((entry, i) => {
    const startLocal = new Date(entry.startedAt).toLocaleString('pl-PL');
    rows.push([
      String(i + 1),
      entry.label,
      startLocal,
      String(entry.duration),
    ]);
  });

  const csv = rows.map((r) => r.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(',')).join('\r\n');
  const blob = new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const datePart = date || 'brak-daty';
  const timePart = time ? time.replace(':', '-') : 'brak-godziny';
  const filename = `${datePart}_${timePart}.csv`;

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
});

// ── Timer visibility toggles ──────────────────────────────────────────────────

const _LS_VISIBILITY_KEY = 'session-timer-visibility';

function _loadVisibility() {
  try { return JSON.parse(localStorage.getItem(_LS_VISIBILITY_KEY) ?? 'null') ?? {}; }
  catch (_) { return {}; }
}

function _applyVisibility(id, visible) {
  const card = document.querySelector(`[data-timer-id="${id}"]`);
  if (card) card.classList.toggle('hidden', !visible);
}

const _savedVisibility = _loadVisibility();

document.querySelectorAll('.timer-visibility-toggle').forEach((checkbox) => {
  const id = checkbox.dataset.targetTimer;

  // Restore saved state
  if (Object.prototype.hasOwnProperty.call(_savedVisibility, id)) {
    checkbox.checked = _savedVisibility[id];
    _applyVisibility(id, _savedVisibility[id]);
  }

  checkbox.addEventListener('change', () => {
    _applyVisibility(id, checkbox.checked);
    const vis = _loadVisibility();
    vis[id] = checkbox.checked;
    localStorage.setItem(_LS_VISIBILITY_KEY, JSON.stringify(vis));
  });
});

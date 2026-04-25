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

import { recordStart, recordPause, clearTimerHistory, clearAllHistory, history, recordNote, setNoteRating, TIMER_LABELS } from './history.js';
import { renderStats } from './stats.js';
import { closeSettings } from './settings.js';

// ── State change → history ─────────────────────────────────────────────────────
setOnStateChange((id, event, seconds) => {
  if (event === 'start') recordStart(id, seconds);
  if (event === 'pause') recordPause(id, seconds);
});

// ── Total time display ───────────────────────────────────────────────────────

const _totalTimeDisplay = document.getElementById('total-time-display');

function updateTotalTime() {
  const totalSeconds = TIMER_IDS.reduce((sum, id) => sum + getTimerState(id).seconds, 0);
  if (_totalTimeDisplay) _totalTimeDisplay.textContent = secondsToDisplay(totalSeconds);
}

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
updateTotalTime();

// ── Tick callback ─────────────────────────────────────────────────────────────

setOnTick((id, seconds) => {
  const { running } = getTimerState(id);
  updateCard(id, seconds, running);
  updateTotalTime();
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
      updateTotalTime();
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
    updateTotalTime();
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
  const now = new Date();
  const newDate = now.toLocaleDateString('en-CA');
  const newTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  if (dateEl) dateEl.value = newDate;
  if (timeEl) timeEl.value = newTime;
  sessionStorage.setItem('session-date', newDate);
  sessionStorage.setItem('session-time', newTime);

  setView('timers');
});
// ── Session date/time — persist to sessionStorage ─────────────────────────────

const dateInput = document.getElementById('session-date');
const timeInput = document.getElementById('session-time');

// Restore from sessionStorage; if nothing saved, prefill with current date/time
const savedDate = sessionStorage.getItem('session-date');
const savedTime = sessionStorage.getItem('session-time');

if (dateInput) {
  if (savedDate) {
    dateInput.value = savedDate;
  } else {
    const now = new Date();
    dateInput.value = now.toLocaleDateString('en-CA'); // YYYY-MM-DD
    sessionStorage.setItem('session-date', dateInput.value);
  }
}
if (timeInput) {
  if (savedTime) {
    timeInput.value = savedTime;
  } else {
    const now = new Date();
    timeInput.value = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    sessionStorage.setItem('session-time', timeInput.value);
  }
}

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

const _exportDialog    = document.getElementById('export-dialog');
const _exportInput     = document.getElementById('export-custom-name');
const _exportPreview   = document.getElementById('export-filename-preview');
const _exportConfirm   = document.getElementById('export-dialog-confirm');
const _exportCancel    = document.getElementById('export-dialog-cancel');
const _exportClose     = document.getElementById('export-dialog-close');

function _buildExportFilename(custom) {
  const date = dateInput?.value || '';
  const time = timeInput?.value || '';
  const datePart = date || 'brak-daty';
  const timePart = time ? time.replace(':', '-') : 'brak-godziny';
  const customPart = custom.trim().replace(/[^a-zA-Z0-9_\-ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
  return customPart ? `${datePart}_${timePart}_${customPart}.csv` : `${datePart}_${timePart}.csv`;
}

function _doExportCSV(filename) {
  const rows = [['Lp.', 'Licznik', 'Start (czas lokalny)', 'Czas trwania (ms)', 'Komentarz']];
  history.forEach((entry, i) => {
    const startLocal = new Date(entry.startedAt).toLocaleString('pl-PL');
    rows.push([
      String(i + 1),
      entry.label,
      startLocal,
      String(entry.duration),
      entry.text != null
        ? `${{ like: '1', dislike: '-1' }[entry.rating] ?? '0'}*${entry.text}`
        : '',
    ]);
  });
  const csv = rows.map((r) => r.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(',')).join('\r\n');
  const blob = new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

document.getElementById('btn-export-csv')?.addEventListener('click', () => {
  closeSettings();

  _exportInput.value = '';
  _exportPreview.textContent = _buildExportFilename('');
  _exportDialog.showModal();
});

_exportInput?.addEventListener('input', () => {
  _exportPreview.textContent = _buildExportFilename(_exportInput.value);
});

function _closeExportDialog() {
  _exportDialog.close();
}

_exportClose?.addEventListener('click', _closeExportDialog);
_exportCancel?.addEventListener('click', _closeExportDialog);
_exportDialog?.addEventListener('click', (e) => { if (e.target === _exportDialog) _closeExportDialog(); });

_exportConfirm?.addEventListener('click', () => {
  const filename = _buildExportFilename(_exportInput.value);
  _closeExportDialog();
  _doExportCSV(filename);
});

// ── CSV import ────────────────────────────────────────────────────────────────

document.getElementById('btn-import-csv')?.addEventListener('change', (e) => {
  const file = e.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (ev) => {
    const text = (ev.target.result ?? '').replace(/^\uFEFF/, ''); // strip BOM
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) return;

    // Parse CSV rows (handles quoted fields with escaped quotes)
    function parseRow(line) {
      const cells = [];
      let cur = '';
      let inQ = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (inQ) {
          if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
          else if (ch === '"') inQ = false;
          else cur += ch;
        } else {
          if (ch === '"') inQ = true;
          else if (ch === ',') { cells.push(cur); cur = ''; }
          else cur += ch;
        }
      }
      cells.push(cur);
      return cells;
    }

    // Build label→id map from TIMER_LABELS
    const labelToId = Object.fromEntries(
      Object.entries(TIMER_LABELS).map(([id, label]) => [label, id])
    );

    let imported = 0;
    for (let i = 1; i < lines.length; i++) {
      const cols = parseRow(lines[i]);
      // columns: Lp., Licznik, Start (czas lokalny), Czas trwania (ms), Komentarz
      const label    = cols[1]?.trim() ?? '';
      const duration = parseInt(cols[3] ?? '0', 10);
      const comment  = cols[4]?.trim() ?? '';

      // Reconstruct startedAt: derive from cumulativeTotal when available, else estimate
      // We use index as fallback offset since we can't reliably parse locale-formatted dates
      const startedAt = Date.now() - (lines.length - i) * 1000;

      const id = labelToId[label];
      if (!id && label !== 'Notatka') continue; // skip unknown rows

      if (label === 'Notatka' && comment) {
        // Parse rating prefix: "1*", "-1*", "0*"
        let rating = null;
        let text = comment;
        const prefixMatch = comment.match(/^(-?[01])\*(.*)$/s);
        if (prefixMatch) {
          rating = prefixMatch[1] === '1' ? 'like' : prefixMatch[1] === '-1' ? 'dislike' : null;
          text = prefixMatch[2];
        }
        history.push({ id: 'note', label: 'Notatka', startedAt, duration: 0, cumulativeTotal: 0, text, rating });
      } else if (id) {
        const cumulativeTotal = history.reduce((s, x) => s + x.duration, 0) + duration;
        history.push({ id, label, startedAt, duration, cumulativeTotal });
      }
      imported++;
    }

    if (imported > 0) {
      try { localStorage.setItem('session-timer-history', JSON.stringify(history)); } catch (_) {}
      setView('stats');
    }

    // Reset input so same file can be re-imported if needed
    e.target.value = '';
  };
  reader.readAsText(file, 'utf-8');
});

// ── Speech-to-text (record modal) ─────────────────────────────────────────────

const _recordDialog      = document.getElementById('record-dialog');
const _recordDialogClose = document.getElementById('record-dialog-close');
const _recordBtnMic      = document.getElementById('record-btn-mic');
const _recordBtnSave     = document.getElementById('record-btn-save');
const _recordBtnClear    = document.getElementById('record-btn-clear');
const _recordTranscript  = document.getElementById('record-transcript');
const _recordStatusDot   = document.getElementById('record-status-dot');
const _recordStatusLabel = document.getElementById('record-status-label');

document.getElementById('btn-record').addEventListener('click', () => {
  _recordDialog.showModal();
});
_recordDialogClose.addEventListener('click', () => {
  _stopRecognition();
  _recordDialog.close();
});
_recordDialog.addEventListener('click', (e) => {
  if (e.target === _recordDialog) { _stopRecognition(); _recordDialog.close(); }
});

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let _recognition = null;
let _isRecording = false;
let _finalTranscript = '';
let _recordingStartedAt = null;
let _recordingTrainingSeconds = 0;

function _setRecordingState(active) {
  _isRecording = active;
  _recordBtnMic.classList.toggle('recording', active);
  _recordStatusDot.style.backgroundColor = active ? '#ef4444' : '#475569';
  _recordStatusLabel.textContent = active ? 'Słucham…' : 'Gotowy';
}

function _renderTranscript(interim = '') {
  if (!_finalTranscript && !interim) {
    _recordTranscript.innerHTML = '<span class="text-slate-600 italic">Naciśnij mikrofon, aby rozpocząć...</span>';
    return;
  }
  _recordTranscript.textContent = _finalTranscript + (interim ? interim : '');
}

function _stopRecognition() {
  if (_recognition) { _recognition.stop(); }
  _setRecordingState(false);
}

_recordBtnMic.addEventListener('click', () => {
  if (!SpeechRecognition) {
    _recordStatusLabel.textContent = 'Przeglądarka nie wspiera tej funkcji';
    _recordStatusDot.style.backgroundColor = '#f59e0b';
    return;
  }

  if (_isRecording) {
    _stopRecognition();
    return;
  }

  _recordingStartedAt = Date.now();
  _recordingTrainingSeconds = TIMER_IDS.reduce((sum, id) => sum + getTimerState(id).seconds, 0);
  _recognition = new SpeechRecognition();
  _recognition.lang = 'pl-PL';
  _recognition.continuous = true;
  _recognition.interimResults = true;

  _recognition.onstart = () => _setRecordingState(true);
  _recognition.onend   = () => _setRecordingState(false);
  _recognition.onerror = (e) => {
    _setRecordingState(false);
    if (e.error === 'not-allowed') {
      _recordStatusLabel.textContent = 'Brak dostępu do mikrofonu';
      _recordStatusDot.style.backgroundColor = '#f59e0b';
    }
  };
  _recognition.onresult = (e) => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const t = e.results[i][0].transcript;
      if (e.results[i].isFinal) _finalTranscript += t;
      else interim += t;
    }
    _renderTranscript(interim);
  };

  _recognition.start();
});

_recordBtnSave.addEventListener('click', () => {
  const text = _finalTranscript.trim();
  if (!text) return;
  _stopRecognition();
  recordNote(text, _recordingStartedAt ?? Date.now(), _recordingTrainingSeconds);
  _finalTranscript = '';
  _recordingStartedAt = null;
  _recordingTrainingSeconds = 0;
  _renderTranscript();
  _recordStatusLabel.textContent = 'Gotowy';
  _recordStatusDot.style.backgroundColor = '#475569';
  _updateNotesBadge();
  _recordDialog.close();
});

_recordBtnClear.addEventListener('click', () => {
  _stopRecognition();
  _finalTranscript = '';
  _recordingStartedAt = null;
  _recordingTrainingSeconds = 0;
  _renderTranscript();
});

// ── Notes modal ───────────────────────────────────────────────────────────────

const _notesDialog      = document.getElementById('notes-dialog');
const _notesDialogClose = document.getElementById('notes-dialog-close');
const _notesList        = document.getElementById('notes-list');
const _notesCountBadge  = document.getElementById('notes-count-badge');

let _notesFilter = ''; // '' = all, 'like', 'dislike'

const _RATING_SVG = {
  like: `<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z"/><path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg>`,
  dislike: `<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3H10z"/><path d="M17 2h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17"/></svg>`,
};

const _RATING_CFG = {
  like:    { activeBg: 'bg-green-800',  activeBorder: 'border-green-600',  activeText: 'text-green-400' },
  dislike: { activeBg: 'bg-red-900',    activeBorder: 'border-red-700',    activeText: 'text-red-400'  },
};

function _updateNotesBadge() {
  const count = history.filter((e) => e.id === 'note').length;
  if (_notesCountBadge) {
    _notesCountBadge.textContent = String(count);
    _notesCountBadge.classList.toggle('hidden', count === 0);
  }
}

function _renderNotesList() {
  const allNotes = history.filter((e) => e.id === 'note');
  const notes = _notesFilter
    ? allNotes.filter((n) => n.rating === _notesFilter)
    : allNotes;

  _notesList.innerHTML = '';

  if (notes.length === 0) {
    _notesList.innerHTML = '<p class="text-sm text-slate-500 italic text-center py-4">Brak notatek</p>';
    return;
  }

  notes.forEach((n) => {
    const ts = n.trainingSeconds ?? 0;
    const m = Math.floor(ts / 60);
    const s = ts % 60;
    const trainingTime = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;

    const el = document.createElement('div');
    el.className = 'flex items-start gap-2 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5';

    // Rating buttons column
    const ratingDiv = document.createElement('div');
    ratingDiv.className = 'flex flex-col gap-1 flex-shrink-0 pt-0.5';

    (['like', 'dislike']).forEach((r) => {
      const cfg = _RATING_CFG[r];
      const btn = document.createElement('button');
      const isActive = n.rating === r;
      btn.className = `w-7 h-7 flex items-center justify-center rounded-lg border transition-colors ${
        isActive
          ? `${cfg.activeBg} ${cfg.activeBorder} ${cfg.activeText}`
          : 'border-slate-700 text-slate-500 hover:border-slate-500 hover:text-slate-300'
      }`;
      btn.innerHTML = _RATING_SVG[r];
      btn.title = r;
      btn.addEventListener('click', () => {
        setNoteRating(n, n.rating === r ? null : r);
        _renderNotesList();
      });
      ratingDiv.appendChild(btn);
    });

    // Text column
    const textDiv = document.createElement('div');
    textDiv.className = 'flex flex-col gap-0.5 flex-1 min-w-0';
    textDiv.innerHTML = `<span class="text-[10px] text-slate-500 font-mono">@ ${trainingTime} treningu</span><p class="text-sm text-slate-200 whitespace-pre-wrap break-words">${n.text.replace(/</g, '&lt;')}</p>`;

    el.appendChild(textDiv);
    el.appendChild(ratingDiv);
    _notesList.appendChild(el);
  });
}

function _openNotesModal() {
  _notesFilter = '';
  // Reset filter button styles
  document.querySelectorAll('.notes-filter-btn').forEach((btn) => {
    const active = btn.dataset.notesFilter === '';
    btn.classList.toggle('bg-slate-700', active);
    btn.classList.toggle('text-slate-200', active);
    btn.classList.toggle('border-slate-600', active);
    btn.classList.toggle('text-slate-400', !active);
    btn.classList.toggle('border-slate-700', !active);
  });
  _renderNotesList();
  _notesDialog.showModal();
}

document.getElementById('btn-notes')?.addEventListener('click', _openNotesModal);
_notesDialogClose.addEventListener('click', () => _notesDialog.close());
_notesDialog.addEventListener('click', (e) => { if (e.target === _notesDialog) _notesDialog.close(); });

document.querySelectorAll('.notes-filter-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    _notesFilter = btn.dataset.notesFilter;
    document.querySelectorAll('.notes-filter-btn').forEach((b) => {
      const active = b.dataset.notesFilter === _notesFilter;
      b.classList.toggle('bg-slate-700', active);
      b.classList.toggle('text-slate-200', active);
      b.classList.toggle('border-slate-600', active);
      b.classList.toggle('text-slate-400', !active);
      b.classList.toggle('border-slate-700', !active);
    });
    _renderNotesList();
  });
});

// Init badge on load
_updateNotesBadge();

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

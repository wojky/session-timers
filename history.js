/**
 * history.js — Records timer segment history.
 *
 * Each entry represents one continuous run of a single timer:
 * {
 *   id:               string,   // timer id
 *   label:            string,   // human-readable label
 *   startedAt:        number,   // Date.now() when segment started
 *   duration:         number,   // milliseconds this segment ran
 *   cumulativeTotal:  number,   // total milliseconds across ALL segments so far
 * }
 */

export const TIMER_LABELS = {
  dead:         'Martwy czas',
  active:       'Czas aktywny',
  coaching:     'Coaching',
  motor:        'Motoryka',
  instructions: 'Tłumaczenie instrukcji',
};

/** @type {Array<{id:string, label:string, startedAt:number, duration:number, cumulativeTotal:number}>} */
export const history = [];

const _LS_KEY = 'session-timer-history';

// Restore persisted history from localStorage on module init
try {
  const stored = localStorage.getItem(_LS_KEY);
  if (stored) {
    const parsed = JSON.parse(stored);
    if (Array.isArray(parsed)) history.push(...parsed);
  }
} catch (_) {}

// Wall-clock timestamp when each timer last started (null = not running)
const _segmentStart = { dead: null, active: null, coaching: null, motor: null, instructions: null };

/** Call when a timer starts. Records the wall-clock start time. */
export function recordStart(id) {
  _segmentStart[id] = Date.now();
}

/**
 * Call when a timer pauses/stops.
 * Calculates the segment duration and pushes an entry to history.
 * @param {string} id
 * @param {number} currentSeconds – total elapsed seconds on the timer at pause time
 */
export function recordPause(id, currentSeconds) {
  const started = _segmentStart[id];
  if (started === null) return; // never recorded a start — skip

  const wallDuration = Date.now() - started;
  _segmentStart[id] = null;

  // Use wall-clock duration; fall back to 0 if somehow negative
  const duration = Math.max(0, wallDuration);
  if (duration < 100) return; // sub-100ms tap — not worth recording

  const cumulativeTotal = history.reduce((sum, e) => sum + e.duration, 0) + duration;

  const entry = {
    id,
    label: TIMER_LABELS[id] ?? id,
    startedAt: started,
    duration,
    cumulativeTotal,
  };

  history.push(entry);
  _saveHistory();
  _logHistory();
}

/** Removes all history entries for a given timer (on reset). */
export function clearTimerHistory(id) {
  const removed = history.splice(0, history.length, ...history.filter((e) => e.id !== id));
  if (removed.length !== history.length) _logHistory();
  _saveHistory();
}

/**
 * Sets the rating of a note entry and persists history.
 * @param {object} entry — reference to the note entry in history array
 * @param {'like'|'dislike'|'neutral'|null} rating
 */
export function setNoteRating(entry, rating) {
  entry.rating = rating;
  _saveHistory();
}

/** Clears the entire history and removes it from localStorage. */
export function clearAllHistory() {
  history.splice(0);
  try {
    localStorage.removeItem(_LS_KEY);
    localStorage.removeItem('session-timer-seconds');
  } catch (_) {}
}

/**
 * Saves a voice note to history.
 * @param {string} text — transcribed text
 * @param {number} startedAt — Date.now() when recording started
 * @param {number} trainingSeconds — total timer seconds at moment of recording start
 */
export function recordNote(text, startedAt, trainingSeconds = 0) {
  const entry = {
    id: 'note',
    label: 'Notatka',
    startedAt,
    duration: 0,
    cumulativeTotal: 0,
    text,
    trainingSeconds,
  };
  history.push(entry);
  _saveHistory();
}

function _saveHistory() {
  try { localStorage.setItem(_LS_KEY, JSON.stringify(history)); } catch (_) {}
}

function _logHistory() {
  console.group(`%cSession Timer — Historia (${history.length} segment${history.length === 1 ? '' : 'ów'})`, 'color:#6366f1;font-weight:bold');
  history.forEach((e, i) => {
    console.log(
      `%c#${i + 1}%c ${e.label}%c — ${_fmt(e.duration)} (łącznie: ${_fmt(e.cumulativeTotal)}) @ ${new Date(e.startedAt).toLocaleTimeString('pl')}`,
      'color:#94a3b8',
      'color:#f8fafc;font-weight:600',
      'color:#94a3b8'
    );
  });
  console.groupEnd();
}

function _fmt(ms) {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

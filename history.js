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

import { TIMER_IDS, COACHING_DURING_TIMER_IDS, getTimerState } from './timers.js';

export const TIMER_LABELS = {
  dead:         'Martwy czas',
  active:       'Czas aktywny',
  coaching:     'Coaching',
  motor:        'Motoryka',
  instructions: 'Tłumaczenie instrukcji',
  technique:    'Technika',
  coachingDuring: 'Coaching w trakcie — Czas aktywny',
  coachingDuringMotor: 'Coaching w trakcie — Motoryka',
  coachingDuringTechnique: 'Coaching w trakcie — Technika',
};

/** @type {Array<{id:string, label:string, startedAt:number, duration:number, cumulativeTotal:number, recordId?:string, containsIn?:string}>} */
export const history = [];

const _LS_KEY = 'session-timer-history';

let _recordIdCounter = 0;

function _newRecordId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  _recordIdCounter += 1;
  return `entry-${Date.now().toString(36)}-${_recordIdCounter.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createRecordId() {
  return _newRecordId();
}

// Restore persisted history from localStorage on module init
try {
  const stored = localStorage.getItem(_LS_KEY);
  if (stored) {
    const parsed = JSON.parse(stored);
    if (Array.isArray(parsed)) {
      parsed.forEach((entry) => {
        if (!entry.recordId) entry.recordId = _newRecordId();
        history.push(entry);
      });
    }
  }
} catch (_) {}

// Wall-clock timestamp when each timer last started (null = not running)
const _segmentStart = {};
// Seconds value on the timer at the moment of last start (for precise duration calc)
const _segmentStartSeconds = {};
const _segmentRecordId = {};
const _segmentContainsIn = {};

/**
 * Call when a timer starts.
 * @param {string} id
 * @param {number} seconds – current elapsed seconds on the timer at start time
 */
export function recordStart(id, seconds, containsIn = null) {
  _segmentStart[id] = Date.now();
  _segmentStartSeconds[id] = seconds ?? 0;
  _segmentRecordId[id] = _newRecordId();
  _segmentContainsIn[id] = containsIn;
  return _segmentRecordId[id];
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

  _segmentStart[id] = null;

  // Use seconds-delta (same unit as timer display) to stay in sync with what the
  // user sees. Wall-clock ms would accumulate fractional-second drift on each resume
  // because _wallStart is anchored to floored integer seconds.
  const duration = Math.max(0, (currentSeconds - _segmentStartSeconds[id]) * 1000);
  if (duration === 0) {
    delete _segmentRecordId[id];
    delete _segmentContainsIn[id];
    return; // nothing elapsed — skip
  }

  const cumulativeTotal = history.reduce((sum, e) => sum + e.duration, 0) + duration;

  const entry = {
    id,
    label: TIMER_LABELS[id] ?? id,
    startedAt: started,
    duration,
    cumulativeTotal,
    recordId: _segmentRecordId[id],
  };
  if (_segmentContainsIn[id]) entry.containsIn = _segmentContainsIn[id];

  history.push(entry);
  delete _segmentRecordId[id];
  delete _segmentContainsIn[id];
  _saveHistory();
  _logHistory();
}

export function getTagEntries() {
  return history
    .filter((entry) => entry.id === 'tag')
    .sort((a, b) => Number(Boolean(b.isStartTag)) - Number(Boolean(a.isStartTag))
      || (a.trainingSeconds ?? 0) - (b.trainingSeconds ?? 0)
      || a.startedAt - b.startedAt);
}

export function ensureStartTag() {
  const existing = history.find((entry) => entry.id === 'tag' && entry.isStartTag);
  if (existing) return existing;

  const firstEntry = history
    .filter((entry) => entry.id !== 'tag')
    .sort((a, b) => a.startedAt - b.startedAt)[0];
  const startedAt = firstEntry
    ? firstEntry.startedAt - (Number(firstEntry.trainingSeconds) || 0) * 1000
    : Date.now();
  const tag = {
    id: 'tag',
    label: 'Start treningu',
    startedAt,
    duration: 0,
    cumulativeTotal: 0,
    recordId: _newRecordId(),
    trainingSeconds: 0,
    isStartTag: true,
  };
  history.push(tag);
  history.sort((a, b) => a.startedAt - b.startedAt);
  _saveHistory();
  return tag;
}

export function createTag(label, trainingSeconds, startedAt = Date.now()) {
  const name = label.trim();
  if (!name) throw new Error('Nazwa tagu nie może być pusta.');

  const tag = {
    id: 'tag',
    label: name,
    startedAt,
    duration: 0,
    cumulativeTotal: 0,
    recordId: _newRecordId(),
    trainingSeconds: Math.max(0, Number(trainingSeconds) || 0),
  };
  history.push(tag);
  history.sort((a, b) => a.startedAt - b.startedAt);
  _saveHistory();
  return tag;
}

export function renameTag(recordId, label) {
  const tag = history.find((entry) => entry.id === 'tag' && entry.recordId === recordId);
  if (!tag) throw new Error('Nie znaleziono tagu do edycji.');
  const name = label.trim();
  if (!name) throw new Error('Nazwa tagu nie może być pusta.');
  tag.label = name;
  _saveHistory();
}

function _timestampAtTrainingSeconds(targetSeconds) {
  const timerEntries = getHistorySnapshot()
    .filter((entry) => TIMER_IDS.includes(entry.id) && entry.duration > 0)
    .sort((a, b) => a.startedAt - b.startedAt);
  if (timerEntries.length === 0) {
    const startTag = history.find((entry) => entry.id === 'tag' && entry.isStartTag);
    return (startTag?.startedAt ?? Date.now()) + targetSeconds * 1000;
  }

  let elapsedSeconds = 0;
  for (const entry of timerEntries) {
    const durationSeconds = entry.duration / 1000;
    if (targetSeconds <= elapsedSeconds + durationSeconds) {
      return Math.round(entry.startedAt + (targetSeconds - elapsedSeconds) * 1000);
    }
    elapsedSeconds += durationSeconds;
  }

  const lastEntry = timerEntries[timerEntries.length - 1];
  return Math.round(lastEntry.startedAt + lastEntry.duration + (targetSeconds - elapsedSeconds) * 1000);
}

export function updateTagTimestamp(recordId, trainingSeconds) {
  const tag = history.find((entry) => entry.id === 'tag' && entry.recordId === recordId);
  if (!tag) throw new Error('Nie znaleziono tagu do edycji.');
  if (tag.isStartTag) throw new Error('Nie można zmienić czasu taga początku treningu.');

  const seconds = Number(trainingSeconds);
  if (!Number.isFinite(seconds) || seconds < 0) {
    throw new Error('Czas taga musi być liczbą nieujemną.');
  }

  tag.trainingSeconds = Math.floor(seconds);
  tag.startedAt = _timestampAtTrainingSeconds(tag.trainingSeconds);
  history.sort((a, b) => a.startedAt - b.startedAt);
  _saveHistory();
}

export function deleteTag(recordId) {
  const index = history.findIndex((entry) => entry.id === 'tag' && entry.recordId === recordId);
  if (index < 0) throw new Error('Nie znaleziono taga do usunięcia.');
  if (history[index].isStartTag) throw new Error('Nie można usunąć taga początku treningu.');

  history.splice(index, 1);
  _saveHistory();
}

export function getHistorySnapshot() {
  const entries = history.slice();
  [...TIMER_IDS, ...COACHING_DURING_TIMER_IDS].forEach((id) => {
    const startedAt = _segmentStart[id];
    if (startedAt == null) return;

    const duration = Math.max(0, (getTimerState(id).seconds - _segmentStartSeconds[id]) * 1000);
    if (duration === 0) return;

    const entry = {
      id,
      label: TIMER_LABELS[id] ?? id,
      startedAt,
      duration,
      cumulativeTotal: 0,
      recordId: _segmentRecordId[id],
    };
    if (_segmentContainsIn[id]) entry.containsIn = _segmentContainsIn[id];
    entries.push(entry);
  });
  return entries;
}

/** Removes all history entries for a given timer (on reset). */
export function clearTimerHistory(id) {
  const recordIds = new Set(
    history.filter((entry) => entry.id === id && entry.recordId).map((entry) => entry.recordId)
  );
  const retained = history.filter((entry) => entry.id !== id && !recordIds.has(entry.containsIn));
  const removedCount = history.length - retained.length;
  history.splice(0, history.length, ...retained);
  if (removedCount > 0) _logHistory();
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
    recordId: _newRecordId(),
    text,
    trainingSeconds,
  };
  history.push(entry);
  _saveHistory();
}

/** Returns elapsed timer time at a wall-clock timestamp. */
export function getTrainingSecondsAt(timestamp) {
  const at = Number(timestamp);
  if (!Number.isFinite(at)) return 0;

  const elapsedMs = history.reduce((total, entry) => {
    if (!TIMER_IDS.includes(entry.id)) return total;
    const start = Number(entry.startedAt);
    const duration = Number(entry.duration);
    if (!Number.isFinite(start) || !Number.isFinite(duration) || duration <= 0 || start >= at) return total;
    return total + Math.max(0, Math.min(at, start + duration) - start);
  }, 0);

  return Math.floor(elapsedMs / 1000);
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

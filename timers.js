/**
 * timers.js — Core timer state and logic.
 * Each timer holds its elapsed milliseconds and running state.
 * This module is stateful but framework-agnostic.
 */

export const TIMER_IDS = ['active', 'dead', 'coaching', 'instructions', 'motor'];

/**
 * @typedef {Object} TimerState
 * @property {number}        ms          – total elapsed milliseconds (precise)
 * @property {boolean}       running     – whether the interval is ticking
 * @property {number|null}   intervalId  – setInterval handle
 */

/** @type {Record<string, TimerState>} */
const state = {};

/**
 * Wall-clock reference point per timer.
 * _wallStart[id] = Date.now() - state[id].ms  (set on each startTimer call)
 * @type {Record<string, number>}
 */
const _wallStart = {};

const _LS_SECONDS_KEY = 'session-timer-seconds';

function _loadSeconds() {
  try {
    const stored = localStorage.getItem(_LS_SECONDS_KEY);
    if (stored) return JSON.parse(stored);
  } catch (_) {}
  return {};
}

function _saveSeconds() {
  try {
    const data = {};
    TIMER_IDS.forEach((id) => { data[id] = Math.floor(state[id].ms / 1000); });
    localStorage.setItem(_LS_SECONDS_KEY, JSON.stringify(data));
  } catch (_) {}
}

const _saved = _loadSeconds();
TIMER_IDS.forEach((id) => {
  // Persist/restore at second granularity; internally track ms for precision
  state[id] = { ms: (_saved[id] ?? 0) * 1000, running: false, intervalId: null };
});

/**
 * Callback invoked on every tick with (timerId, seconds).
 * @type {((id: string, seconds: number) => void) | null}
 */
let onTick = null;

/**
 * Callback invoked on start/pause events with (timerId, event: 'start'|'pause', seconds).
 * @type {((id: string, event: 'start'|'pause', seconds: number) => void) | null}
 */
let onStateChange = null;

export function setOnTick(cb) {
  onTick = cb;
}

export function setOnStateChange(cb) {
  onStateChange = cb;
}

/** Returns the currently running timer id, or null. */
export function getRunningId() {
  return TIMER_IDS.find((id) => state[id].running) ?? null;
}

/** Starts the given timer. If another is running, pauses it first. */
export function startTimer(id) {
  const running = getRunningId();
  if (running && running !== id) {
    pauseTimer(running);
  }
  if (state[id].running) return;

  state[id].running = true;
  onStateChange?.(id, 'start', Math.floor(state[id].ms / 1000));
  // Anchor wall-clock from the precise ms value — no fractional-second loss on resume
  _wallStart[id] = Date.now() - state[id].ms;
  state[id].intervalId = setInterval(() => {
    state[id].ms = Date.now() - _wallStart[id];
    _saveSeconds();
    onTick?.(id, Math.floor(state[id].ms / 1000));
  }, 1000);
}

/** Pauses the given timer without resetting it. */
export function pauseTimer(id) {
  if (!state[id].running) return;
  // Capture precise elapsed ms BEFORE clearing the interval
  state[id].ms = Date.now() - _wallStart[id];
  clearInterval(state[id].intervalId);
  state[id].intervalId = null;
  state[id].running = false;
  _saveSeconds();
  onStateChange?.(id, 'pause', Math.floor(state[id].ms / 1000));
  onTick?.(id, Math.floor(state[id].ms / 1000));
}

/** Toggles start/pause for the given timer. */
export function toggleTimer(id) {
  if (state[id].running) {
    pauseTimer(id);
  } else {
    startTimer(id);
  }
}

/** Resets the given timer to zero (does NOT confirm — caller must handle UX). */
export function resetTimer(id) {
  pauseTimer(id);
  state[id].ms = 0;
  delete _wallStart[id];
  _saveSeconds();
  onTick?.(id, 0);
}

/**
 * Directly sets the elapsed seconds for a timer (e.g. from manual input).
 * Keeps running state unchanged.
 */
export function setTimerSeconds(id, seconds) {
  state[id].ms = Math.max(0, seconds) * 1000;
  // Re-anchor wall-clock if timer is currently running
  if (state[id].running) {
    _wallStart[id] = Date.now() - state[id].ms;
  }
  _saveSeconds();
}

export function getTimerState(id) {
  const s = state[id];
  return { ms: s.ms, seconds: Math.floor(s.ms / 1000), running: s.running };
}

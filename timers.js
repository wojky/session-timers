/**
 * timers.js — Core timer state and logic.
 * Each timer holds its elapsed seconds and running state.
 * This module is stateful but framework-agnostic.
 */

export const TIMER_IDS = ['dead', 'active', 'coaching', 'instructions'];

/**
 * @typedef {Object} TimerState
 * @property {number}   seconds   – total elapsed seconds
 * @property {boolean}  running   – whether the interval is ticking
 * @property {number|null} intervalId – setInterval handle
 */

/** @type {Record<string, TimerState>} */
const state = {};

TIMER_IDS.forEach((id) => {
  state[id] = { seconds: 0, running: false, intervalId: null };
});

/**
 * Callback invoked on every tick with (timerId, seconds).
 * @type {((id: string, seconds: number) => void) | null}
 */
let onTick = null;

export function setOnTick(cb) {
  onTick = cb;
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
  state[id].intervalId = setInterval(() => {
    state[id].seconds += 1;
    onTick?.(id, state[id].seconds);
  }, 1000);
}

/** Pauses the given timer without resetting it. */
export function pauseTimer(id) {
  if (!state[id].running) return;
  clearInterval(state[id].intervalId);
  state[id].intervalId = null;
  state[id].running = false;
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
  state[id].seconds = 0;
  onTick?.(id, 0);
}

/**
 * Directly sets the elapsed seconds for a timer (e.g. from manual input).
 * Keeps running state unchanged.
 */
export function setTimerSeconds(id, seconds) {
  state[id].seconds = Math.max(0, seconds);
}

export function getTimerState(id) {
  return { ...state[id] };
}

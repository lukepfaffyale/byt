/**
 * Today's 3: each day my Sym seals three throws and its person takes three taps to fool it.
 * What is kept is on this device only: the last day it was played and how many days it has been played.
 * Nothing here is sent to the server, nothing is lost by missing a day, and the gap is never named.
 */
const DAY_KEY = 'byt.duel.day'
const DAYS_KEY = 'byt.duel.days'
export const DUEL_ROUNDS = 3

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

/** Was Today's 3 played today on this device? True when storage is off, so the Sym never asks in a loop. */
export function duelDone(): boolean {
  try {
    return localStorage.getItem(DAY_KEY) === today()
  } catch {
    return true
  }
}

/** Which day of playing this would be on this device: 1 on the first day. */
export function duelDay(): number {
  try {
    return (Number(localStorage.getItem(DAYS_KEY)) || 0) + 1
  } catch {
    return 1
  }
}

/** Today's 3 is done: remember the day and count it once. */
export function markDuel(): void {
  try {
    if (localStorage.getItem(DAY_KEY) === today()) return
    localStorage.setItem(DAYS_KEY, String((Number(localStorage.getItem(DAYS_KEY)) || 0) + 1))
    localStorage.setItem(DAY_KEY, today())
  } catch {
    // storage is off in this browser: the rounds still count on the server as always
  }
}

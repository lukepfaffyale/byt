/** Motion is off when the person turned it off in the game, or, if they never chose, when the device asks for less motion. */
export function still(): boolean {
  try {
    const saved = localStorage.getItem('byt_motion')
    if (saved) return saved !== 'on'
  } catch {
    // no storage: fall through to the device setting
  }
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

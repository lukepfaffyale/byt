/** Motion is off only when the person turned it off in the game. With no choice made it is on, for everyone
 * (the owner's decision of 2026-11-23: the device's reduced-motion setting no longer decides the start). */
export function still(): boolean {
  try {
    const saved = localStorage.getItem('byt_motion')
    if (saved) return saved !== 'on'
  } catch {
    // no storage: motion stays on
  }
  return false
}

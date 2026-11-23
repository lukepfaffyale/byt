import { useEffect, useState } from 'react'
import { api, type Ripple } from './api'

/**
 * The circle, in one line, with this person's own numbers: taps became blocks, blocks let the Sym be asked, and
 * being asked paid credits back. Every number is counted from the person's own rows. A part that has not happened
 * yet is said in words, never shown as a zero. One tap opens the whole picture.
 */
export function LoopLine(props: { pulse: number; onOpen: () => void }) {
  const { pulse, onOpen } = props
  const [ripple, setRipple] = useState<Ripple | null>(null)
  const [earning, setEarning] = useState<boolean | null>(null)

  useEffect(() => {
    let cancelled = false
    api.ripple().then((r) => { if (!cancelled) setRipple(r) }).catch(() => undefined)
    api.jobs().then((j) => { if (!cancelled) setEarning(j.data_income) }).catch(() => undefined)
    return () => { cancelled = true }
  }, [pulse])

  const c = ripple?.counts
  if (!c) return null
  const taps = Math.round(c.taps ?? 0)
  if (taps === 0) return null
  const asks = Math.round(c.asks ?? 0)
  const back = Math.round(((c.ask_credits ?? 0) + (c.check_credits ?? 0)) * 100) / 100
  const asked = asks > 0 ? `asked ${asks} ${asks === 1 ? 'time' : 'times'}` : earning ? 'can be asked' : 'earning is off'
  const came = back > 0 ? `${back} credits back` : 'nothing back yet'
  return (
    <button className="link loop-line" onClick={onOpen}
      aria-label={`My circle: ${taps} taps became ${taps} blocks. My Sym: ${asked}. ${came}. Open my circle.`}>
      <span>{taps} {taps === 1 ? 'tap' : 'taps'}</span>
      <span className="loop-mid">{taps} {taps === 1 ? 'block' : 'blocks'}</span>
      <span>{asked}</span>
      <span>{came}</span>
    </button>
  )
}

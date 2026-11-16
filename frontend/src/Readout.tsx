import { useEffect, useRef, useState } from 'react'
import { still } from './motion'

/** The next round number at or above a value (1, 2 or 5 times a power of ten), so a number has a scale to sit on. */
function roundAbove(v: number): number {
  if (v <= 0) return 100
  const p = Math.pow(10, Math.floor(Math.log10(v)))
  return [1, 2, 5, 10].map((m) => m * p).find((top) => v <= top) ?? 10 * p
}

/**
 * A number shown as an instrument: it counts up to its value, and a mark shows where it sits on a scale.
 * With motion off it shows the value at once. A screen reader hears the final value only.
 */
export function Readout(props: { value: number; label: React.ReactNode; prefix?: string; of?: number }) {
  const { value, label, prefix = '', of } = props
  const [shown, setShown] = useState(0)
  const from = useRef(0)

  useEffect(() => {
    const start = performance.now()
    const a = from.current
    const span = still() ? 0 : 700
    let raf = 0
    const step = (t: number) => {
      const k = span ? Math.min(1, (t - start) / span) : 1
      const v = k === 1 ? value : a + (value - a) * (1 - Math.pow(1 - k, 3))
      from.current = v
      setShown(v)
      if (k < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [value])

  const top = of ?? roundAbove(value)
  const at = top > 0 ? Math.min(1, Math.max(0, value / top)) : 0
  const text = Number.isInteger(value) ? String(Math.round(shown)) : shown.toFixed(2)
  return (
    <div className="readout">
      <p className="stat">
        <span className="sr-only">{prefix}{value}</span>
        <span aria-hidden="true">{prefix}{text}</span>
      </p>
      <div className="scale" aria-hidden="true">
        <span className="scale-mark" style={{ left: `${at * 100}%` }} />
        <span className="scale-end">0</span>
        <span className="scale-end">{top}</span>
      </div>
      <p className="stat-label">{label}</p>
    </div>
  )
}

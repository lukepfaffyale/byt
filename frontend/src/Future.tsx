import { useEffect, useRef, useState } from 'react'
import { clamp, deepSpace, ease, makeDust, seeded } from './neural'

/**
 * The deep space every scene shares, behind a whole page: dark above, a low warm haze, far dust that barely moves,
 * and the lit edge of a world. It is only a backdrop, so it is hidden from screen readers and takes no taps.
 */
export function Backdrop({ calm }: { calm: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const dust = makeDust(seeded(2049), 260)
    let timer = 0
    const draw = () => {
      const w = canvas.clientWidth
      const h = canvas.clientHeight
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = Math.max(1, w)
        canvas.height = Math.max(1, h)
      }
      deepSpace(ctx, w, h, calm ? 0 : performance.now() / 1000, dust, true)
    }
    draw()
    // the far background moves so slowly that a few pictures a second are enough
    if (!calm) timer = window.setInterval(draw, 90)
    window.addEventListener('resize', draw)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('resize', draw)
    }
  }, [calm])
  return <canvas ref={canvasRef} className="backdrop" aria-hidden="true" />
}

/** Words that write themselves in, like a readout. The whole line is always there for a screen reader. */
export function Typed({ text, calm }: { text: string; calm: boolean }) {
  const [shown, setShown] = useState(calm ? text.length : 0)
  useEffect(() => {
    if (calm) return
    let n = 0
    const timer = window.setInterval(() => {
      n += 2
      setShown(n)
      if (n >= text.length) window.clearInterval(timer)
    }, 16)
    return () => window.clearInterval(timer)
  }, [text, calm])
  return (
    <>
      <span className="sr-only">{text}</span>
      <span aria-hidden="true">
        {text.slice(0, shown)}
        {shown < text.length && <span className="caret" />}
      </span>
    </>
  )
}

/** A number that runs up to its value when it appears, like a counter on an instrument. */
export function Tick({ to, calm }: { to: number; calm: boolean }) {
  const [shown, setShown] = useState(calm ? to : 0)
  useEffect(() => {
    if (calm) return
    let raf = 0
    const began = performance.now()
    const step = (now: number) => {
      const p = clamp((now - began) / 900)
      setShown(Math.round(to * ease(p)))
      if (p < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [to, calm])
  return <>{(calm ? to : shown).toLocaleString()}</>
}

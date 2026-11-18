import { useEffect, useRef } from 'react'
import { Typed } from './Future'
import { TAU, along, body, clamp, seeded, shoot, trace, wander, type V } from './neural'

/**
 * My Sym inside a gate. It answers every tap in its own voice, and the progress through the gate is drawn as
 * the path it is forging: each tap grows the path one step and leaves a light where the tap was.
 *
 * The lines are written by code from what just happened. The path shows a real count (taps done of taps in the
 * gate); its shape is a drawing.
 */
export function SymLive(props: { say: string; label: string; done: number; total: number; pulse: number; calm: boolean }) {
  const { say, label, done, total, pulse, calm } = props
  const boxRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const now = useRef({ done, total, pulse, at: 0 })
  const redraw = useRef<() => void>(() => undefined)
  useEffect(() => {
    if (now.current.pulse !== pulse) now.current.at = performance.now()
    now.current.done = done
    now.current.total = total
    now.current.pulse = pulse
    redraw.current()
  }, [done, total, pulse])

  useEffect(() => {
    const box = boxRef.current
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!box || !canvas || !ctx) return
    const rand = seeded(409)
    const path = wander(rand, 30, 5, 0.018)
    const arms = Array.from({ length: 5 }, () => shoot(rand, 5, 7))
    const see = (q: V): V => [q[0], q[1], 1]
    let grown = calm ? -1 : 0
    let raf = 0

    const draw = (time: number) => {
      const w = box.clientWidth
      const h = box.clientHeight
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.max(1, Math.round(w * dpr))
        canvas.height = Math.max(1, Math.round(h * dpr))
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)
      const t = calm ? 3 : time / 1000
      const s = now.current
      const want = s.total > 0 ? clamp(s.done / s.total) : 0
      // the path does not jump to its new length: it grows there
      grown = calm || grown < 0 ? want : grown + (want - grown) * 0.09
      const burst = calm || s.at === 0 ? 0 : 1 - clamp((time - s.at) / 650)
      // the body sits low on the left, and the path runs along the foot of the panel, under the words
      const from: V = [44, h - 30, 0]
      const to: V = [w - 22, h - 18, 0]

      ctx.globalCompositeOperation = 'lighter'
      // the way still to go: one faint ring for each tap not yet made
      for (let k = 1; k <= s.total; k++) {
        const q = along(path, from, to, k / s.total)
        const made = k / s.total <= grown + 0.001
        ctx.beginPath()
        ctx.arc(q[0], q[1], made ? 2.6 : 2, 0, TAU)
        if (made) {
          ctx.fillStyle = k === s.done ? `rgba(255, 246, 224, ${0.75 + 0.25 * burst})` : 'rgba(255, 205, 150, 0.8)'
          ctx.fill()
        } else {
          ctx.strokeStyle = 'rgba(134, 211, 230, 0.32)'
          ctx.lineWidth = 0.8
          ctx.stroke()
        }
      }
      trace(ctx, see, path, from, to, Math.max(0.012, grown), 0.55 + 0.4 * burst, '255, 205, 150', t, 0.5)
      if (!calm && grown > 0.04) {
        const f = (t * 0.5) % 1
        const q = along(path, from, to, f * grown)
        ctx.fillStyle = `rgba(255, 246, 224, ${0.9 * Math.sin(Math.PI * f)})`
        ctx.beginPath()
        ctx.arc(q[0], q[1], 1.7, 0, TAU)
        ctx.fill()
      }
      const breath = calm ? 1 : 0.88 + 0.12 * Math.sin(t * 1.6)
      body(ctx, see, from, 7 + 4 * want + 6 * burst, '255, 205, 150', Math.min(1.35, breath + 0.55 * burst), arms, 1)
      ctx.globalCompositeOperation = 'source-over'
      if (!calm) raf = requestAnimationFrame(draw)
    }
    redraw.current = () => {
      if (calm) requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    window.addEventListener('resize', redraw.current)
    const again = redraw.current
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', again)
      redraw.current = () => undefined
    }
  }, [calm])

  return (
    <div ref={boxRef} className="sym-live" role="progressbar" aria-label="Your progress in this gate" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done}>
      <canvas ref={canvasRef} className="sym-cue-life" aria-hidden="true" />
      <div className="sym-cue-say">
        <span className="line-top">{label}</span>
        <p><Typed key={say} text={say} calm={calm} /></p>
      </div>
    </div>
  )
}

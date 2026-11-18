import { useEffect, useRef, useState } from 'react'
import { Typed } from './Future'
import { TAU, along, body, clamp, ease, seeded, shoot, trace, wander, type V } from './neural'

/**
 * My Sym, present on a page: a living cell body that speaks in the first person and asks for one thing.
 * A path grows out of it toward the button, the way it grows toward other people on the welcome screen,
 * and once it arrives signals keep running to the button: the Sym is reaching for the next tap.
 *
 * Every line is written by code from counts. No model writes them. The path is a drawing, not a record.
 */
export function SymCue(props: { say: string; more?: string[]; go?: string; act?: () => void; calm: boolean; formed: number; who?: string; rgb?: string; crew?: boolean }) {
  const { say, more = [], go = '', act, calm, formed, who = 'My Sym', rgb = '255, 205, 150', crew = false } = props
  const boxRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const goRef = useRef<HTMLButtonElement>(null)
  const eager = useRef(false)
  const flare = useRef(0)
  // the Sym does not go quiet: after a while it says something more, then asks again
  const [turn, setTurn] = useState(0)
  useEffect(() => {
    setTurn(0)
    if (calm || more.length === 0) return
    const timer = window.setInterval(() => setTurn((n) => n + 1), 11000)
    return () => window.clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [say, calm, more.length])
  const line = turn % 2 === 1 && more.length > 0 ? more[((turn - 1) / 2) % more.length] : say

  useEffect(() => {
    const box = boxRef.current
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!box || !canvas || !ctx) return
    const rand = seeded(say.length * 131 + go.length * 17 + 5)
    const path = wander(rand, 24, 4, 0.07)
    const arms = Array.from({ length: 5 }, () => shoot(rand, 5, 7))
    const see = (q: V): V => [q[0], q[1], 1]
    const began = performance.now()
    let raf = 0

    const draw = (now: number) => {
      const w = box.clientWidth
      const h = box.clientHeight
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.max(1, Math.round(w * dpr))
        canvas.height = Math.max(1, Math.round(h * dpr))
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)
      const t = calm ? 3 : now / 1000
      const age = calm ? 99 : (now - began) / 1000
      const from: V = [44, Math.min(h / 2, 50), 0]
      const b = goRef.current
      const frame = box.getBoundingClientRect()
      const r = b?.getBoundingClientRect()
      const to: V = r ? [r.left - frame.left - 4, r.top - frame.top + r.height / 2, 0] : [w - 24, h - 20, 0]
      const grow = ease(clamp((age - 0.5) / 1.5))
      const lit = clamp((now - flare.current) / 700)
      const burst = flare.current > 0 ? 1 - lit : 0

      ctx.globalCompositeOperation = 'lighter'
      trace(ctx, see, path, from, to, grow, 0.5 + 0.4 * burst, rgb, t, 1 - clamp(age - 2.4))
      if (grow >= 1 && !calm) {
        // signals run to the button, and faster when a hand is near it
        const pace = eager.current ? 0.9 : 0.34
        for (let k = 0; k < 3; k++) {
          const f = (t * pace + k / 3) % 1
          const q = along(path, from, to, f)
          ctx.fillStyle = `rgba(255, 246, 224, ${0.9 * Math.sin(Math.PI * f)})`
          ctx.beginPath()
          ctx.arc(q[0], q[1], 1.8, 0, TAU)
          ctx.fill()
        }
      }
      const breath = calm ? 1 : 0.88 + 0.12 * Math.sin(t * 1.6)
      // a crew is more than one: two smaller bodies keep close to the first
      if (crew) {
        body(ctx, see, [from[0] - 20, from[1] - 20, 0], 4.5, rgb, 0.8 * breath, [], 1)
        body(ctx, see, [from[0] - 16, from[1] + 22, 0], 4, rgb, 0.7 * breath, [], 1)
      }
      body(ctx, see, from, 6 + 5 * formed + 5 * burst, rgb, Math.min(1.3, breath + 0.5 * burst), arms, 1)
      ctx.globalCompositeOperation = 'source-over'
      if (!calm) raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    const again = () => {
      if (calm) requestAnimationFrame(draw)
    }
    window.addEventListener('resize', again)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', again)
    }
  }, [say, go, calm, formed, rgb, crew])

  const near = (on: boolean) => () => {
    eager.current = on
  }
  return (
    <div ref={boxRef} className="sym-cue" role="region" aria-label={`${who} asks`}>
      <canvas ref={canvasRef} className="sym-cue-life" aria-hidden="true" />
      <div className="sym-cue-say">
        <span className="line-top">{who}</span>
        <p><Typed key={line} text={line} calm={calm} /></p>
      </div>
      {go && act && (
        <button ref={goRef} className="primary sym-cue-go" onMouseEnter={near(true)} onMouseLeave={near(false)} onFocus={near(true)} onBlur={near(false)}
          onClick={() => {
            flare.current = performance.now()
            act()
          }}>{go}</button>
      )}
    </div>
  )
}

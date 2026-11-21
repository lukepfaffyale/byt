import { useEffect, useRef } from 'react'
import { TAU, along, body, clamp, deepSpace, ease, makeDust, seeded, shoot, trace, wander, type V, type Wander } from './neural'

export type Flow = { a: number; b: number; credits: number }

/** The 16 corners of a tesseract. The 8 with an even number of minus signs hold the bodies; no two of those touch. */
const CORNERS: number[][] = Array.from({ length: 16 }, (_, i) => [0, 1, 2, 3].map((b) => ((i >> b) & 1 ? 1 : -1)))
const SEATS = CORNERS.filter((c) => c.filter((v) => v < 0).length % 2 === 0)
const WARM = '255, 214, 150'
const COOL = '150, 205, 235'

/**
 * The economy as nerve cells in a large dark. Each kind of wallet is a cell body, held at a corner of a shape
 * with four directions that slowly turns, so the bodies drift past each other. Where credits really moved between
 * two kinds, a path is forged between them: it searches, sends out side shoots, and connects. Then signals run
 * along it, more of them where more credits moved. Totals only: no person, seat or answer is drawn.
 */
export function WorldField(props: { names: string[]; flows: Flow[]; pick: number | null; socket?: [number, number]; calm: boolean; label: string }) {
  const { names, flows, pick, socket, calm, label } = props
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const live = useRef({ flows, pick })

  useEffect(() => {
    live.current = { flows, pick }
  }, [flows, pick])

  const shape = flows.map((f) => `${f.a}>${f.b}`).join(',')
  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const rand = seeded(1977)
    const dust = makeDust(rand, 160)
    const arms = names.map((_, i) => Array.from({ length: i === 0 ? 8 : 5 }, () => shoot(rand, 5, i === 0 ? 0.07 : 0.05)))
    const paths = new Map<string, Wander>()
    const pathOf = (a: number, b: number) => {
      const k = a < b ? `${a}-${b}` : `${b}-${a}` // credits both ways between two bodies share one path
      let path = paths.get(k)
      if (!path) {
        path = wander(rand, 26, 4, 0.09)
        paths.set(k, path)
      }
      return path
    }
    const reach = wander(rand, 22, 4, 0.12) // the one path that is drawn but not built: it grows part of the way, and stops
    let w = 0
    let h = 0
    let raf = 0
    const began = performance.now()
    const size = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
      w = canvas.clientWidth
      h = canvas.clientHeight
      canvas.width = Math.max(1, Math.round(w * dpr))
      canvas.height = Math.max(1, Math.round(h * dpr))
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    const draw = (now: number) => {
      const t = calm ? 2.2 : 2.2 + (now - began) / 1000
      const age = calm ? 99 : (now - began) / 1000
      // turn through two planes of four dimensions, then bring each corner down to three
      const a4 = t * 0.11
      const b4 = t * 0.07
      const at: V[] = SEATS.map(([x0, y0, z0, w0]) => {
        const x = x0 * Math.cos(a4) - w0 * Math.sin(a4)
        const q = x0 * Math.sin(a4) + w0 * Math.cos(a4)
        const y = y0 * Math.cos(b4) - z0 * Math.sin(b4)
        const z = y0 * Math.sin(b4) + z0 * Math.cos(b4)
        const k = 1.5 / (2.7 - q)
        return [x * k, y * k, z * k]
      })
      const scale = Math.min(w * 0.3, h * 0.43)
      const wide = Math.min(1.7, Math.max(1, (w / h) * 0.8)) // a wide picture spreads the bodies sideways
      // as the shape turns, a body can swing far out: the whole picture draws in just enough to keep every body
      // and its name inside the frame
      let farX = 1
      let farY = 1
      for (const q of at) {
        const near = 4 / (4 - q[2])
        farX = Math.max(farX, Math.abs(q[0] * near * scale * wide))
        farY = Math.max(farY, Math.abs(q[1] * near * scale))
      }
      const fit = Math.min(1, (w * 0.42) / farX, (h * 0.32) / farY)
      const see = (q: V): V => {
        const near = 4 / (4 - q[2])
        return [w / 2 + q[0] * near * scale * wide * fit, h * 0.46 - q[1] * near * scale * fit, near]
      }
      deepSpace(ctx, w, h, calm ? 0 : t, dust, false)
      const { flows: links, pick: held } = live.current
      const most = Math.max(1, ...links.map((l) => l.credits))
      links.forEach((l, i) => {
        // paths are forged one after another when the map opens
        const grow = ease(clamp((age - 0.3 - i * 0.22) / 1.6))
        if (grow <= 0) return
        const lit = held === null || l.a === held || l.b === held
        const weight = Math.sqrt(l.credits / most)
        const path = pathOf(l.a, l.b)
        trace(ctx, see, path, at[Math.min(l.a, l.b)], at[Math.max(l.a, l.b)], grow, (lit ? 0.35 + 0.6 * weight : 0.08), lit ? WARM : COOL, t, 1 - clamp((age - 2.2 - i * 0.22) / 1.2))
        if (grow >= 1 && lit && !calm) {
          const count = 1 + Math.round(weight * 3)
          for (let n = 0; n < count; n++) {
            const f = (t * (0.16 + 0.1 * weight) + n / count + i * 0.37) % 1
            const s = see(along(path, at[Math.min(l.a, l.b)], at[Math.max(l.a, l.b)], l.a < l.b ? f : 1 - f))
            ctx.fillStyle = 'rgba(255, 246, 224, 0.95)'
            ctx.beginPath()
            ctx.arc(s[0], s[1], 2.2 * s[2], 0, TAU)
            ctx.fill()
          }
        }
      })
      if (socket) trace(ctx, see, reach, at[socket[0]], at[socket[1]], calm ? 0.55 : 0.45 + 0.1 * Math.sin(t * 0.5), 0.5, COOL, t, 1)
      names.forEach((_, i) => {
        const dim = held !== null && held !== i && !links.some((l) => (l.a === held && l.b === i) || (l.b === held && l.a === i))
        body(ctx, see, at[i], i === 0 ? 0.075 : 0.05, held === i ? WARM : i === 0 ? '245, 247, 251' : COOL, (dim ? 0.3 : 1) * (calm ? 1 : 0.9 + 0.1 * Math.sin(t * 1.4 + i)), arms[i], scale)
      })
      ctx.globalCompositeOperation = 'source-over'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      // every word on the map gets a dark plate and a place of its own: a word that would land on another
      // steps down (a name) or up (a number) until it is clear
      const plates: [number, number, number, number][] = []
      const place = (words: string, x: number, y: number, step: number, color: string) => {
        const half = ctx.measureText(words).width / 2 + 6
        const cx = Math.max(half + 2, Math.min(w - half - 2, x))
        let cy = Math.max(11, Math.min(h - 11, y))
        for (let tries = 0; tries < 8 && plates.some((q) => Math.abs(q[0] - cx) < q[2] + half && Math.abs(q[1] - cy) < q[3] + 9); tries++) cy += step
        plates.push([cx, cy, half, 9])
        ctx.fillStyle = 'rgba(2, 4, 9, 0.8)'
        ctx.fillRect(cx - half, cy - 9, half * 2, 18)
        ctx.fillStyle = color
        ctx.fillText(words, cx, cy + 0.5)
      }
      ctx.font = "500 11px 'Helvetica Neue', Helvetica, Arial, sans-serif"
      names.forEach((words, i) => {
        const s = see(at[i])
        place(words.toUpperCase().split('').join(' '), s[0], s[1] + (i === 0 ? 0.2 : 0.15) * scale * s[2] + 4, 19, held === i ? '#ffe2a8' : 'rgba(210, 217, 230, 0.92)')
      })
      if (held !== null) {
        ctx.font = "400 12px 'Helvetica Neue', Helvetica, Arial, sans-serif"
        links.forEach((l) => {
          if (l.a !== held && l.b !== held) return
          const s = see(along(pathOf(l.a, l.b), at[Math.min(l.a, l.b)], at[Math.max(l.a, l.b)], l.a < l.b ? 0.38 : 0.62))
          place(String(Math.round(l.credits)), s[0], s[1] - 8, -19, '#ffe2a8')
        })
      }
      ctx.textBaseline = 'alphabetic'
      if (!calm) raf = requestAnimationFrame(draw)
    }
    const watch = new ResizeObserver(() => {
      size()
      if (calm) draw(performance.now())
    })
    watch.observe(canvas)
    size()
    if (calm) draw(performance.now())
    else raf = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(raf)
      watch.disconnect()
    }
    // the picture is rebuilt when the set of paths changes; counts and the picked body are read live
  }, [names, shape, socket, calm])

  useEffect(() => {
    // with motion off there is no loop, so a new pick asks for one new still picture
    if (calm) canvasRef.current?.dispatchEvent(new Event('resize'))
  }, [pick, calm])

  return <canvas ref={canvasRef} className="world-field" role="img" aria-label={label} />
}

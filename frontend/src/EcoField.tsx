import { useEffect, useRef } from 'react'
import { body, shoot } from './neural'

type V = [number, number, number]
const HUES = ['#ffd98a', '#bfe6ff', '#a6e6c3', '#ffab9b', '#d9c2ff', '#ffc2e2']
const TAU = Math.PI * 2
const MOST = 96 // Syms drawn; past this the count is still said in words
const MOTES = 900 // points in the core; past this each point stands for more than one thing known

/** The same numbers give the same scene every time, so nothing jumps when the screen reloads. */
function seeded(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const cross = (a: V, b: V): V => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const unit = (a: V): V => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1
  return [a[0] / l, a[1] / l, a[2] / l]
}
/** Two directions that span the flat ring an orbit lies in. */
function plane(n: V): [V, V] {
  const u = unit(cross(n, Math.abs(n[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0]))
  return [u, cross(n, u)]
}
const ring = (u: V, v: V, r: number, a: number): V => {
  const c = Math.cos(a) * r
  const s = Math.sin(a) * r
  return [u[0] * c + v[0] * s, u[1] * c + v[1] * s, u[2] * c + v[2] * s]
}

type Body = { real: boolean; you: boolean; live: boolean; hue: string; R: number; n: V; u: V; v: V; w: number; ph: number; f: number[]; p: number[]; trail: V[] }
type Seat = { agency: boolean; ph: number; spin: number }
type Spark = { kind: 'know' | 'pay'; body: number; seat: number; born: number; life: number; bend: V; hue: string }
type Props = { people: number; standIns: number; today: number; agencies: number; creators: number; known: number; knownMine: number; fresh: number; calm: boolean; label: string }

// the three tracks the stand-ins keep to: tilt, turn, size and speed. Clockwork on purpose.
const TRACKS = [{ tilt: 0.14, turn: 0, R: 0.68, w: 0.1 }, { tilt: -0.24, turn: 2.1, R: 0.93, w: -0.075 }, { tilt: 0.33, turn: 4.2, R: 1.17, w: 0.055 }]
const trackPlane = (k: number): [V, V, V] => {
  const { tilt, turn } = TRACKS[k]
  const n: V = [Math.sin(tilt) * Math.cos(turn), Math.cos(tilt), Math.sin(tilt) * Math.sin(turn)]
  return [n, ...plane(n)]
}
/**
 * The whole game as one living thing in space. The core is what is known together: one point of light for each
 * thing a person showed or checked, and the reader's own points are the brightest. A person and their Sym move as
 * a pair, and no two move alike: they speed up, drift and wander, because people do. A stand-in is an empty ring
 * that keeps to a track like clockwork. Light runs from people into the core, and pay runs back out from the seats.
 * Drawn from counts only. Drag it, or use the arrow keys, to turn it.
 */
export function EcoField(props: Props) {
  const { people, standIns, today, agencies, creators, known, knownMine, fresh, calm, label } = props
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const view = useRef({ yaw: 0.5, pitch: 0.5, held: null as null | { x: number; y: number } })

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const rand = seeded(409)
    const pick = (n: number) => Math.floor(rand() * n)

    // ---- who is here ----
    const all = people + standIns
    const n = Math.min(MOST, all)
    const shownPeople = people > 0 ? Math.max(1, Math.round((people / Math.max(1, all)) * n)) : 0
    const shownLive = people > 0 ? Math.min(shownPeople, Math.max(today > 0 ? 1 : 0, Math.round((today / people) * shownPeople))) : 0
    const bodies: Body[] = []
    for (let i = 0; i < shownPeople; i++) {
      const nrm = unit([rand() * 2 - 1, (rand() * 2 - 1) * 0.9, rand() * 2 - 1])
      const [u, v] = plane(nrm)
      bodies.push({ real: true, you: i === 0, live: i < shownLive, hue: HUES[i % HUES.length], R: 0.52 + 0.66 * rand(), n: nrm, u, v,
        w: (0.1 + 0.2 * rand()) * (rand() < 0.5 ? -1 : 1), ph: rand() * TAU, f: [0.23 + rand() * 0.5, 0.17 + rand() * 0.4, 0.3 + rand() * 0.6, 1.4 + rand() * 1.8, 1.1 + rand() * 1.5, 1.7 + rand() * 1.4],
        p: Array.from({ length: 6 }, () => rand() * TAU), trail: [] })
    }
    const holds = n - shownPeople
    for (let j = 0; j < holds; j++) {
      const k = j % TRACKS.length
      const [nrm, u, v] = trackPlane(k)
      const onTrack = Math.ceil((holds - k) / TRACKS.length)
      bodies.push({ real: false, you: false, live: false, hue: '#e3e8f2', R: TRACKS[k].R, n: nrm, u, v, w: TRACKS[k].w, ph: (TAU * Math.floor(j / TRACKS.length)) / Math.max(1, onTrack), f: [], p: [], trail: [] })
    }
    const seats: Seat[] = [...Array.from({ length: Math.min(8, agencies) }, () => true), ...Array.from({ length: Math.min(8, creators) }, () => false)]
      .map((agency, i, list) => ({ agency, ph: (TAU * i) / list.length + 0.4, spin: 0.3 + rand() * 0.4 }))
    const seatArms = seats.map(() => Array.from({ length: 5 }, () => shoot(rand, 4, 0.035)))

    // ---- what is known: one mote each ----
    const count = Math.min(MOTES, known)
    const mineCount = known > 0 ? Math.round((knownMine / known) * count) : 0
    const motes = Array.from({ length: count }, (_, i) => {
      const [u, v] = plane(unit([rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1]))
      const r = 0.04 + 0.3 * Math.pow(rand(), 0.62)
      return { u, v, r, w: ((0.22 + 0.5 * rand()) / (0.35 + r * 3)) * (rand() < 0.5 ? -1 : 1), ph: rand() * TAU, hue: i < mineCount ? -1 : pick(HUES.length) }
    })

    const place = (b: Body, t: number): V => {
      if (!b.real) return ring(b.u, b.v, b.R, b.ph + b.w * t)
      // a person never holds a clean orbit: the pace, the reach and the height all wander
      const a = b.ph + b.w * t + 0.7 * Math.sin(t * b.f[0] + b.p[0])
      const at = ring(b.u, b.v, b.R * (1 + 0.14 * Math.sin(t * b.f[1] + b.p[1])), a)
      const lift = 0.17 * Math.sin(t * b.f[2] + b.p[2]) + 0.05 * Math.sin(t * b.f[3] + b.p[3])
      return [at[0] + b.n[0] * lift, at[1] + b.n[1] * lift, at[2] + b.n[2] * lift]
    }
    const human = (b: Body, at: V, t: number): V => [
      at[0] + 0.06 * Math.sin(t * b.f[3] + b.p[3]), at[1] + 0.06 * Math.sin(t * b.f[4] + b.p[4]), at[2] + 0.06 * Math.cos(t * b.f[5] + b.p[5]),
    ]
    const seatAt = (s: Seat, t: number): V => ring([1, 0, 0], [0, 0.22, 0.975], 1.42, s.ph + t * 0.045)

    let sparks: Spark[] = []
    let pulses: number[] = []
    let w = 0
    let h = 0
    let raf = 0
    let last = performance.now()
    let t = 20
    let sinceSpark = 0
    let sincePay = 0
    let sincePulse = 2
    let frame = 0

    const size = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
      w = canvas.clientWidth
      h = canvas.clientHeight
      canvas.width = Math.max(1, Math.round(w * dpr))
      canvas.height = Math.max(1, Math.round(h * dpr))
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    const draw = () => {
      const { yaw, pitch } = view.current
      const cy = Math.cos(yaw)
      const sy = Math.sin(yaw)
      const cp = Math.cos(pitch)
      const sp = Math.sin(pitch)
      const scale = Math.min(w * 0.31, h * 0.4)
      const mx = w / 2
      const my = h / 2
      // turn a point in space into a spot on the screen, and how near it is
      const see = (q: V): V => {
        const x = q[0] * cy + q[2] * sy
        const z0 = -q[0] * sy + q[2] * cy
        const y = q[1] * cp - z0 * sp
        const near = 3.4 / (3.4 - (q[1] * sp + z0 * cp))
        return [mx + x * near * scale, my - y * near * scale, near]
      }
      const line = (a: V, b: V) => {
        const p = see(a)
        const q = see(b)
        ctx.moveTo(p[0], p[1])
        ctx.lineTo(q[0], q[1])
      }
      ctx.clearRect(0, 0, w, h)

      // the tracks the stand-ins keep to
      ctx.strokeStyle = 'rgba(214, 228, 255, 0.13)'
      ctx.beginPath()
      TRACKS.forEach((track, k) => {
        if (holds <= k) return
        const [, u, v] = trackPlane(k)
        for (let i = 0; i < 64; i++) line(ring(u, v, track.R, (TAU * i) / 64), ring(u, v, track.R, (TAU * (i + 1)) / 64))
      })
      ctx.stroke()

      // news moving outward from the core
      for (const born of pulses) {
        const age = (t - born) / 4.5
        ctx.strokeStyle = `rgba(255, 226, 160, ${0.35 * (1 - age)})`
        ctx.lineWidth = 1
        ctx.beginPath()
        const r = 0.3 + 1.25 * age
        for (let i = 0; i < 56; i++) line([Math.cos((TAU * i) / 56) * r, 0, Math.sin((TAU * i) / 56) * r], [Math.cos((TAU * (i + 1)) / 56) * r, 0, Math.sin((TAU * (i + 1)) / 56) * r])
        ctx.stroke()
      }

      // the core: light first, then one mote for each thing known
      ctx.globalCompositeOperation = 'lighter'
      const breath = 1 + 0.06 * Math.sin(t * 0.9)
      const glow = ctx.createRadialGradient(mx, my, 0, mx, my, scale * 0.62 * breath)
      glow.addColorStop(0, 'rgba(255, 255, 255, 0.5)')
      glow.addColorStop(0.3, 'rgba(255, 226, 160, 0.24)')
      glow.addColorStop(1, 'rgba(191, 230, 255, 0)')
      ctx.fillStyle = glow
      ctx.fillRect(mx - scale, my - scale, scale * 2, scale * 2)
      for (let hue = -1; hue < HUES.length; hue++) {
        ctx.fillStyle = hue < 0 ? '#fff4d6' : HUES[hue]
        ctx.globalAlpha = hue < 0 ? 1 : 0.8
        for (const m of motes) {
          if (m.hue !== hue) continue
          const q = see(ring(m.u, m.v, m.r, m.ph + m.w * t))
          const d = (hue < 0 ? 2.5 : 1.8) * q[2]
          ctx.fillRect(q[0] - d / 2, q[1] - d / 2, d, d)
        }
      }
      ctx.globalAlpha = 1

      // where everybody is now
      const spots = bodies.map((b) => place(b, t))
      if (frame % 3 === 0) bodies.forEach((b, i) => {
        if (!b.real) return
        b.trail.push(spots[i])
        if (b.trail.length > 34) b.trail.shift()
      })

      // what moves between them: knowing runs in to the core, pay runs out from the seats
      for (const s of sparks) {
        const age = (t - s.born) / s.life
        const to = spots[s.body]
        const from: V = s.kind === 'know' ? to : seatAt(seats[s.seat], t)
        const end: V = s.kind === 'know' ? [0, 0, 0] : to
        const k = s.kind === 'know' ? age * age : age
        const arc = Math.sin(Math.PI * age) * 0.28
        const q = see([from[0] + (end[0] - from[0]) * k + s.bend[0] * arc, from[1] + (end[1] - from[1]) * k + s.bend[1] * arc, from[2] + (end[2] - from[2]) * k + s.bend[2] * arc])
        ctx.fillStyle = s.hue
        ctx.globalAlpha = Math.min(1, 4 * age, 4 * (1 - age))
        ctx.beginPath()
        ctx.arc(q[0], q[1], (s.kind === 'pay' ? 2.6 : 2.1) * q[2], 0, TAU)
        ctx.fill()
      }
      ctx.globalAlpha = 1

      // two people who pass close reach for each other, and let go as they part
      ctx.lineWidth = 0.8
      for (let i = 0; i < shownPeople; i++) for (let j = i + 1; j < shownPeople; j++) {
        const apart = Math.hypot(spots[i][0] - spots[j][0], spots[i][1] - spots[j][1], spots[i][2] - spots[j][2])
        if (apart > 0.5) continue
        const a = see(spots[i])
        const b = see(spots[j])
        const tie = ctx.createLinearGradient(a[0], a[1], b[0], b[1])
        tie.addColorStop(0, bodies[i].hue)
        tie.addColorStop(1, bodies[j].hue)
        ctx.strokeStyle = tie
        ctx.globalAlpha = 0.75 * (1 - apart / 0.5)
        ctx.beginPath()
        ctx.moveTo(a[0], a[1])
        ctx.lineTo(b[0], b[1])
        ctx.stroke()
      }

      // the path each person just took
      ctx.lineWidth = 1.4
      bodies.forEach((b) => {
        if (b.trail.length < 2) return
        ctx.strokeStyle = b.hue
        for (let i = 1; i < b.trail.length; i++) {
          ctx.globalAlpha = 0.85 * (i / b.trail.length) ** 2
          ctx.beginPath()
          line(b.trail[i - 1], b.trail[i])
          ctx.stroke()
        }
      })
      ctx.globalAlpha = 1
      ctx.globalCompositeOperation = 'source-over'

      // everyone, far ones first
      const order = bodies.map((b, i) => ({ b, at: spots[i], q: see(spots[i]) })).sort((x, y) => x.q[2] - y.q[2])
      for (const { b, at, q } of order) {
        const depth = Math.min(1, Math.max(0.45, (q[2] - 0.65) * 1.8))
        if (!b.real) {
          ctx.globalAlpha = 0.3 + 0.5 * depth
          ctx.strokeStyle = b.hue
          ctx.lineWidth = 0.9
          ctx.beginPath()
          ctx.arc(q[0], q[1], 3.4 * q[2], 0, TAU)
          ctx.stroke()
          continue
        }
        const r = (b.you ? 5.4 : 4.2) * q[2]
        const soul = see(human(b, at, t))
        ctx.globalAlpha = 0.45 + 0.55 * depth
        ctx.globalCompositeOperation = 'lighter'
        const halo = ctx.createRadialGradient(q[0], q[1], 0, q[0], q[1], r * (b.live ? 5 + Math.sin(t * 2.2 + b.ph) : 3.4))
        halo.addColorStop(0, b.hue + 'aa')
        halo.addColorStop(1, b.hue + '00')
        ctx.fillStyle = halo
        ctx.beginPath()
        ctx.arc(q[0], q[1], r * 6, 0, TAU)
        ctx.fill()
        ctx.globalCompositeOperation = 'source-over'
        ctx.strokeStyle = b.hue
        ctx.lineWidth = 0.6
        ctx.beginPath()
        ctx.moveTo(q[0], q[1])
        ctx.lineTo(soul[0], soul[1])
        ctx.stroke()
        ctx.fillStyle = b.hue
        ctx.beginPath()
        ctx.arc(q[0], q[1], r, 0, TAU)
        ctx.fill()
        ctx.fillStyle = '#ffffff'
        ctx.beginPath()
        ctx.arc(soul[0], soul[1], 1.9 * soul[2], 0, TAU)
        ctx.fill()
        if (b.you) {
          ctx.globalAlpha = 1
          ctx.strokeStyle = '#ffd98a'
          ctx.lineWidth = 1.2
          ctx.beginPath()
          ctx.arc(q[0], q[1], r + 5, 0, TAU)
          ctx.stroke()
          ctx.fillStyle = '#f5f7fb'
          ctx.font = "600 10px 'Helvetica Neue', Helvetica, Arial, sans-serif"
          ctx.textAlign = 'center'
          ctx.fillText('Y O U', q[0], q[1] - r - 10)
        }
      }

      // the seats: an agency is a warm body, a creator a cool one, each with its small arms
      ctx.globalCompositeOperation = 'lighter'
      seats.forEach((s, i) => body(ctx, see, seatAt(s, t), 0.05, s.agency ? '255, 190, 120' : '134, 211, 230', 0.95 + 0.05 * Math.sin(t * 1.3 + i), seatArms[i], scale))
      ctx.globalCompositeOperation = 'source-over'
    }

    const step = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      t += dt
      frame += 1
      if (!view.current.held) view.current.yaw += dt * 0.06
      sinceSpark += dt
      sincePay += dt
      sincePulse += dt
      if (shownPeople > 0 && sinceSpark > 0.09) {
        sinceSpark = 0
        const body = shownLive > 0 && rand() < 0.7 ? pick(shownLive) : pick(shownPeople)
        sparks.push({ kind: 'know', body, seat: 0, born: t, life: 2.2 + rand() * 1.6, bend: unit([rand() - 0.5, rand() - 0.5, rand() - 0.5]), hue: bodies[body].hue })
      }
      if (shownPeople > 0 && seats.length > 0 && sincePay > 0.7) {
        sincePay = 0
        sparks.push({ kind: 'pay', body: pick(shownPeople), seat: pick(seats.length), born: t, life: 2.6, bend: unit([rand() - 0.5, rand() - 0.5, rand() - 0.5]), hue: '#ffe2a0' })
      }
      if (fresh > 0 && sincePulse > Math.max(1.6, 9 / fresh)) {
        sincePulse = 0
        pulses.push(t)
      }
      sparks = sparks.filter((s) => t - s.born < s.life)
      pulses = pulses.filter((born) => t - born < 4.5)
      draw()
      raf = requestAnimationFrame(step)
    }

    const watch = new ResizeObserver(() => {
      size()
      if (calm) draw()
    })
    watch.observe(canvas)
    size()
    if (calm) draw()
    else raf = requestAnimationFrame(step)

    // drag to turn it; a still picture is redrawn after each turn
    const down = (e: PointerEvent) => {
      view.current.held = { x: e.clientX, y: e.clientY }
      canvas.setPointerCapture(e.pointerId)
    }
    const move = (e: PointerEvent) => {
      const held = view.current.held
      if (!held) return
      view.current.yaw += (e.clientX - held.x) * 0.008
      view.current.pitch = Math.max(-1.2, Math.min(1.2, view.current.pitch + (e.clientY - held.y) * 0.006))
      view.current.held = { x: e.clientX, y: e.clientY }
      if (calm) draw()
    }
    const up = () => { view.current.held = null }
    const key = (e: KeyboardEvent) => {
      const turn: Record<string, [number, number]> = { ArrowLeft: [-0.12, 0], ArrowRight: [0.12, 0], ArrowUp: [0, -0.1], ArrowDown: [0, 0.1] }
      const by = turn[e.key]
      if (!by) return
      e.preventDefault()
      view.current.yaw += by[0]
      view.current.pitch = Math.max(-1.2, Math.min(1.2, view.current.pitch + by[1]))
      if (calm) draw()
    }
    canvas.addEventListener('pointerdown', down)
    canvas.addEventListener('pointermove', move)
    canvas.addEventListener('pointerup', up)
    canvas.addEventListener('pointercancel', up)
    canvas.addEventListener('keydown', key)
    return () => {
      cancelAnimationFrame(raf)
      watch.disconnect()
      canvas.removeEventListener('pointerdown', down)
      canvas.removeEventListener('pointermove', move)
      canvas.removeEventListener('pointerup', up)
      canvas.removeEventListener('pointercancel', up)
      canvas.removeEventListener('keydown', key)
    }
  }, [people, standIns, today, agencies, creators, known, knownMine, fresh, calm])

  return (
    <div className="eco">
      <canvas ref={canvasRef} className="eco-canvas" role="img" tabIndex={0} aria-label={`${label} Drag it, or press the arrow keys, to turn it.`} />
      <p className="eco-known" aria-hidden="true">
        <span>{known.toLocaleString()}</span>
        known together
      </p>
    </div>
  )
}

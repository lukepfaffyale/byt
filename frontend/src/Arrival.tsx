import { useEffect, useRef, useState } from 'react'
import { api, type Commons } from './api'
import { Tick, Typed } from './Future'
import { TAU, along, body, clamp, deepSpace, ease, makeDust, seeded, shoot, trace, wander, type V, type Wander } from './neural'

type Kind = 'you' | 'person' | 'hold' | 'agency' | 'creator'
type Role = 'player' | 'agency' | 'creator'
const HUE: Record<Kind, string> = { you: '255, 244, 222', person: '255, 226, 188', hold: '150, 168, 196', agency: '255, 191, 122', creator: '134, 211, 230' }
const SIZE: Record<Kind, number> = { you: 0.052, person: 0.034, hold: 0.02, agency: 0.046, creator: 0.046 }
const ROLE_OF: Record<Kind, Role | null> = { you: 'player', person: 'player', hold: null, agency: 'agency', creator: 'creator' }
const MOST_KNOWN = 1500

/**
 * The first thing after signing in: the whole game seen from far off. It begins as one point of light, which is
 * you. A path grows out of you and finds someone, then theirs finds the next, and the view draws back until
 * everyone is in sight. Then the three roles are offered.
 *
 * What is real: how many bodies of each kind there are, and how many small lights (one for each thing known,
 * up to a limit). What is drawn: where each body sits, which bodies are joined, and the order the paths grow in.
 * Nobody is named and no body stands for one known person, apart from the one marked as you.
 */
export function Arrival(props: {
  calm: boolean
  next?: { id: string; title: string; done: number }
  intent?: 'agency' | 'creator'
  onPlay: (gateId: string) => void
  onJourney: () => void
  onSeat: (seat: 'agency' | 'creator') => void
  onEnter: () => void
}) {
  const { calm, next, intent, onPlay, onJourney, onSeat, onEnter } = props
  const [data, setData] = useState<Commons | null>(null)
  const [beat, setBeat] = useState(-1)
  const [done, setDone] = useState(calm)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const hover = useRef<Role | null>(null)
  const skip = useRef(false)
  const headRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    let cancelled = false
    // if the counts cannot be had, do not hold anyone at the door: the pages behind say what went wrong
    api.commons().then((c) => { if (!cancelled) setData(c) }).catch(() => { if (!cancelled) onEnter() })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx || !data) return
    const rand = seeded(1701)

    // ---- who is in the picture ----
    const kinds: Kind[] = ['you']
    for (let i = 1; i < Math.min(data.people, 48); i++) kinds.push('person')
    for (let i = 0; i < Math.min(data.stand_ins, 36); i++) kinds.push('hold')
    for (let i = 0; i < Math.min(data.agencies, 12); i++) kinds.push('agency')
    for (let i = 0; i < Math.min(data.creators, 12); i++) kinds.push('creator')
    const n = kinds.length
    const at: V[] = kinds.map((_, i) => {
      if (i === 0) return [0.5, 0.05, 0.2]
      const r = 0.3 + 1.45 * Math.sqrt(rand())
      const turn = rand() * TAU
      return [r * Math.cos(turn), (rand() - 0.5) * 0.75 * (1 - r / 2.3), r * Math.sin(turn)]
    })
    const arms = kinds.map(() => Array.from({ length: 4 }, () => shoot(rand, 5, 0.03)))
    const far = (a: number, b: number) => Math.hypot(at[a][0] - at[b][0], at[a][1] - at[b][1], at[a][2] - at[b][2])

    // ---- the paths: each body is reached from the nearest one already reached, starting from you ----
    const depth = new Array<number>(n).fill(0)
    const reached = new Array<boolean>(n).fill(false)
    reached[0] = true
    const links: { a: number; b: number; w: Wander; start: number }[] = []
    for (let step = 1; step < n; step++) {
      let best = -1
      let from = 0
      let least = Infinity
      for (let i = 0; i < n; i++) {
        if (reached[i]) continue
        for (let j = 0; j < n; j++) {
          if (!reached[j]) continue
          const d = far(i, j) * (1 + 0.25 * depth[j])
          if (d < least) {
            least = d
            best = i
            from = j
          }
        }
      }
      reached[best] = true
      depth[best] = depth[from] + 1
      links.push({ a: from, b: best, w: wander(rand, 22, 3, 0.1), start: depth[from] })
    }
    // a few more, so the whole is a web and not a tree
    const joined = new Set(links.map((l) => `${Math.min(l.a, l.b)}-${Math.max(l.a, l.b)}`))
    for (let i = 0; i < n && links.length < n * 1.5; i += 2) {
      let near = -1
      let least = 0.95
      for (let j = 0; j < n; j++) {
        if (j === i || joined.has(`${Math.min(i, j)}-${Math.max(i, j)}`)) continue
        const d = far(i, j)
        if (d < least) {
          least = d
          near = j
        }
      }
      if (near < 0) continue
      joined.add(`${Math.min(i, near)}-${Math.max(i, near)}`)
      links.push({ a: i, b: near, w: wander(rand, 22, 2, 0.12), start: Math.max(depth[i], depth[near]) + 1.4 })
    }
    const deepest = Math.max(1, ...depth)
    const GROW = Math.min(0.95, 6 / deepest)
    const FORGE = 1.6
    const END = FORGE + (deepest + 2.4) * GROW + 0.8

    // ---- one small light for each thing known, strung along the paths ----
    const known = Math.min(data.known, MOST_KNOWN)
    const mine = data.known > 0 ? Math.round((data.known_mine / data.known) * known) : 0
    const motes = links.length === 0 ? [] : Array.from({ length: known }, (_, i) => {
      const l = links[Math.floor(rand() * links.length)]
      const k = rand()
      const p = along(l.w, at[l.a], at[l.b], k)
      const spread = 0.05 * Math.pow(rand(), 2)
      return { p: [p[0] + (rand() - 0.5) * spread, p[1] + (rand() - 0.5) * spread, p[2] + (rand() - 0.5) * spread] as V, when: (l.start + k) * GROW, mine: i < mine, ph: rand() * TAU }
    })

    const dust = makeDust(seeded(7), 320)
    let seen = false
    try {
      seen = window.localStorage.getItem('byt.arrived') === '1'
      window.localStorage.setItem('byt.arrived', '1')
    } catch {
      seen = false
    }
    // slow enough to read every line; a little quicker on later visits. A tap still skips it.
    const speed = seen ? 0.95 : 0.7
    const began = performance.now()
    let raf = 0
    let ended = false
    let lastBeat = -1

    const draw = (now: number) => {
      const w = canvas.clientWidth
      const h = canvas.clientHeight
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.max(1, Math.round(w * dpr))
        canvas.height = Math.max(1, Math.round(h * dpr))
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const t = calm ? 40 : now / 1000
      const T = calm || skip.current ? END + 1 : ((now - began) / 1000) * speed
      const f = T - FORGE

      if (!calm) {
        const b = T < 0.3 ? -1 : f < 0.2 ? 0 : T < END * 0.42 ? 1 : T < END * 0.76 ? 2 : 3
        if (b !== lastBeat) {
          lastBeat = b
          setBeat(b)
        }
        if (T >= END && !ended) {
          ended = true
          setDone(true)
        }
      }

      // ---- the eye: it starts close to you, and draws back and up until everyone is in sight ----
      const p = ease(clamp(T / END))
      const dist = 0.8 + 2.5 * p
      const tall = h > w
      const aim: V = [at[0][0] * (1 - p), at[0][1] * (1 - p), at[0][2] * (1 - p)]
      const yaw = 0.6 + t * 0.045
      const pitch = 0.14 + 0.3 * p
      const cy = Math.cos(yaw)
      const sy = Math.sin(yaw)
      const cp = Math.cos(pitch)
      const sp = Math.sin(pitch)
      const F = Math.min(w, h * 1.25) * 0.98
      // at the end the picture sits in the upper part of the screen, above the words
      const mid = h / 2 - p * h * (tall ? 0.26 : 0.2)
      const see = (q: V): V => {
        const x = q[0] - aim[0]
        const y = q[1] - aim[1]
        const z = q[2] - aim[2]
        const x1 = x * cy - z * sy
        const z1 = x * sy + z * cy
        const y2 = y * cp - z1 * sp
        const s = 1 / Math.max(0.18, dist + y * sp + z1 * cp)
        return [w / 2 + x1 * s * F, mid - y2 * s * F, Math.min(2.6, s * 3.3)]
      }
      const scale = F / 3.3

      deepSpace(ctx, w, h, t, dust, true)
      ctx.globalCompositeOperation = 'lighter'
      const role = hover.current
      const dim = (k: Kind) => (role === null ? 1 : ROLE_OF[k] === role ? 1.25 : 0.3)

      // ---- the paths, each one growing from a body that has been reached toward one that has not ----
      links.forEach((l, i) => {
        const grow = clamp(f / GROW - l.start)
        if (grow <= 0) return
        const pale = kinds[l.b] === 'hold' || kinds[l.a] === 'hold'
        const tone = pale ? HUE.hold : kinds[l.b] === 'agency' || kinds[l.b] === 'creator' ? HUE[kinds[l.b]] : '255, 214, 160'
        const strength = (pale ? 0.3 : 0.55) * Math.min(dim(kinds[l.a]), dim(kinds[l.b]))
        trace(ctx, see, l.w, at[l.a], at[l.b], grow, strength, tone, t, 1 - clamp(f / GROW - l.start - 1.5))
        if (grow >= 1 && !calm) {
          const q = see(along(l.w, at[l.a], at[l.b], (t * 0.22 + i * 0.37) % 1))
          ctx.fillStyle = `rgba(255, 246, 224, ${0.85 * strength * 1.6})`
          ctx.beginPath()
          ctx.arc(q[0], q[1], 1.5 * q[2], 0, TAU)
          ctx.fill()
        }
      })

      // ---- what is known: small lights along the paths ----
      for (const m of motes) {
        if (f < m.when) continue
        const q = see(m.p)
        const a = (m.mine ? 0.95 : 0.55) * (calm ? 0.8 : 0.55 + 0.45 * Math.sin(t * 1.7 + m.ph)) * clamp((f - m.when) * 2)
        ctx.fillStyle = m.mine ? `rgba(255, 191, 122, ${a})` : `rgba(190, 226, 240, ${a})`
        const d = (m.mine ? 2 : 1.4) * Math.max(0.8, q[2])
        ctx.fillRect(q[0] - d / 2, q[1] - d / 2, d, d)
      }

      // ---- the bodies: each lights when a path reaches it ----
      kinds.forEach((k, i) => {
        const lit = i === 0 ? clamp(T / 0.9) : clamp((f - depth[i] * GROW) / 0.45)
        if (lit <= 0) return
        const breath = calm ? 1 : 0.9 + 0.1 * Math.sin(t * 1.4 + i)
        body(ctx, see, at[i], SIZE[k] * (0.6 + 0.4 * ease(lit)), HUE[k], (k === 'hold' ? 0.5 : 1) * lit * breath * Math.min(1.2, dim(k)), lit > 0.6 ? arms[i] : [], scale)
      })
      ctx.globalCompositeOperation = 'source-over'

      // ---- the one body that is named: you ----
      const me = see(at[0])
      const mark = clamp(T / 1.2)
      ctx.strokeStyle = `rgba(255, 244, 222, ${0.55 * mark})`
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.arc(me[0], me[1], (14 + (calm ? 0 : 3 * Math.sin(t * 2))) * Math.max(0.8, Math.min(1.6, me[2])), 0, TAU)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(me[0] + 16, me[1] - 16)
      ctx.lineTo(me[0] + 34, me[1] - 34)
      ctx.lineTo(me[0] + 62, me[1] - 34)
      ctx.stroke()
      ctx.font = "600 11px 'Helvetica Neue', Helvetica, Arial, sans-serif"
      ctx.fillStyle = `rgba(255, 244, 222, ${0.9 * mark})`
      ctx.textAlign = 'left'
      ctx.fillText('Y O U', me[0] + 38, me[1] - 40)

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
  }, [data, calm])

  // the keyboard can end the opening too
  useEffect(() => {
    if (done) {
      headRef.current?.focus({ preventScroll: true })
      return
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        finish()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [done])

  function finish() {
    skip.current = true
    setDone(true)
  }

  if (!data) {
    return (
      <div className="arrival">
        <p className="arrival-beat" aria-live="polite">Finding everyone.</p>
      </div>
    )
  }

  const people = `${data.people} ${data.people === 1 ? 'person is' : 'people are'} here.`
  const beats = [
    'This is you.',
    'Every tap you make forges a path.',
    `${people} ${(data.people + data.bots).toLocaleString()} Syms are awake.`,
    `Together they know ${data.known.toLocaleString()} things. Here, what people know is the money.`,
  ]
  const play = () => (next ? onPlay(next.id) : onJourney())
  const lead: Role = intent && !(intent === 'agency' ? data.has_agency : data.has_creator) ? intent : 'player'
  const roles: { id: Role; name: string; n: number; what: string; go: string; act: () => void }[] = [
    { id: 'player', name: 'Player', n: data.people, what: 'Tap. Your Sym learns you.',
      go: !next ? 'My Journey' : data.taps_mine === 0 ? `Start: ${next.title}` : next.done > 0 ? `Continue: ${next.title}` : `Play: ${next.title}`, act: play },
    { id: 'agency', name: 'Agency', n: data.agencies, what: 'Ask Syms. Each answer pays its owner.',
      go: data.has_agency ? 'My agency' : 'Open an agency', act: () => onSeat('agency') },
    { id: 'creator', name: 'Creator', n: data.creators, what: 'Build steps. Each pass pays you.',
      go: data.has_creator ? 'My studio' : 'Open a studio', act: () => onSeat('creator') },
  ]
  const look = (id: Role | null) => () => {
    hover.current = id
  }

  return (
    <div className={done ? 'arrival done' : 'arrival'} role="dialog" aria-modal="true" aria-label="Welcome to BYT" onClick={done ? undefined : finish}>
      <canvas ref={canvasRef} className="arrival-space" aria-hidden="true" />
      <p className="sr-only">
        A picture of everyone in the game as points of light in space, joined by paths that grow outward from you. {people} {data.people + data.bots} Syms are awake.
        There are {data.agencies} agencies and {data.creators} creators. Together they know {data.known} things, and {data.known_mine} of those came from you.
      </p>
      <p className="arrival-mark" aria-hidden="true">BYT</p>
      {!done && <button className="link arrival-skip" onClick={finish}>Skip</button>}
      {!done && beat >= 0 && (
        <p className="arrival-beat"><Typed key={beat} text={beats[beat]} calm={calm} /></p>
      )}
      {done && (
        <>
          <dl className="arrival-read">
            <div><dt>People</dt><dd><Tick to={data.people} calm={calm} /></dd></div>
            <div><dt>Syms</dt><dd><Tick to={data.people + data.bots} calm={calm} /></dd></div>
            <div><dt>Known by all</dt><dd><Tick to={data.known} calm={calm} /></dd></div>
            <div><dt>Known from you</dt><dd><Tick to={data.known_mine} calm={calm} /></dd></div>
          </dl>
          <div className="arrival-end">
            <h1 ref={headRef} tabIndex={-1}>Welcome, {data.nickname}.</h1>
            <p className="arrival-said">You are one light among them. Choose the part you play.</p>
            <ul className="arrival-roles">
              {roles.map((r) => (
                <li key={r.id}>
                  <button className={r.id === lead ? 'arrival-role lead' : 'arrival-role'}
                    onClick={r.act} onMouseEnter={look(r.id)} onMouseLeave={look(null)} onFocus={look(r.id)} onBlur={look(null)}>
                    <span className="arrival-role-top"><span className="arrival-role-name">{r.name}</span><span className="arrival-role-n">{r.n}</span></span>
                    <span className="arrival-role-what">{r.what}</span>
                    <span className="arrival-role-go">{r.id === lead && (data.taps_mine === 0 || lead !== 'player') ? 'My Sym: start here. ' : ''}{r.go}</span>
                  </button>
                </li>
              ))}
            </ul>
            <button className="link arrival-in" onClick={onEnter}>See everyone</button>
          </div>
        </>
      )}
    </div>
  )
}

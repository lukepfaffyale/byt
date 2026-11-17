import { useEffect, useRef, useState } from 'react'

export type SphereArea = {
  key: string
  name: string
  color: string
  level: number
  earned: number
  /** clusters only: how many this group stands for (null when hidden), and one size for each point drawn */
  count?: number | null
  hidden?: boolean
  dots?: number[]
}

type Props = {
  /** 0 = scattered light, 1 = a fully formed twin */
  coherence: number
  /** change this number to send one wave of light through the twin (for example after each pick) */
  pulseKey?: number
  /** 'dot' is the small twin that sits beside the BYT mark */
  variant?: 'hero' | 'mini' | 'dot'
  label: string
  /** one colored slice of the sphere for each area of the mind; without it the sphere is plain light */
  areas?: SphereArea[]
  /** false = one still picture, redrawn only when the twin changes */
  motion?: boolean
  /** how fast the sphere turns: 1 is the usual speed, 0 holds it still while the points keep moving */
  speed?: number
  /** 'fill' = each slice fills from the bottom; 'clusters' = each slice is one tight group of points */
  mode?: 'fill' | 'clusters'
  /** the collective sky: one far, faint point behind the sphere for every twin in the game */
  sky?: number
  /** color comes from other people: 0 draws the sphere in white, 1 in the full color of each area */
  together?: number
  /** called when the player taps a point: the key of the area that point belongs to */
  onPick?: (areaKey: string) => void
  /** the twin is its own control: drag it down or spread two fingers to make it bigger (1), drag it up or
   * pinch to make it smaller (-1), tap it twice to open or close the full screen (0) */
  onSize?: (step: 1 | -1 | 0) => void
  /** a name for each of the four directions of the frame around the sphere */
  axes?: string[]
  /** called when the player taps the name of a direction: 0 to 3, in the order of `axes` */
  onAxis?: (index: number) => void
  /** which directions are live now (the seat you are in, time while the story plays): drawn in gold */
  axesOn?: boolean[]
  /** the brain only: one marked point for each belief the twin holds, in the area it belongs to, with its topic */
  hubs?: { area: string; name: string; told?: boolean }[]
  /** called when the player taps one of those points */
  onHub?: (index: number) => void
  /** where the picture is in time: 1 is now, 0 is the start. The frame turns through its fourth direction as time moves */
  time?: number
}

type Node = {
  x: number; y: number; z: number; seed: number; drift: number; rank: number; lon: number; up: number
  /** the same point's place in the brain, the area of the brain it sits in (-1 for none), and how far it is from that area's seed */
  bx: number; by: number; bz: number; region: number; far: number
}
type Link = { a: number; b: number; rank: number }
type RGB = [number, number, number]
type Tip = { x: number; y: number; name: string; lines: string[] }

const COUNT = 620
const BALL = 0.62 // the size of the sphere inside the frame
const NEIGHBORS = 3
const EYE4 = 2.2 // how far the eye sits along the fourth direction
const SPARKS = 30
const REACH = 16 // how close, in pixels, the pointer must be to a point
const GOLD: RGB = [255, 214, 130]
const ICE: RGB = [190, 230, 255]
const DIM: RGB = [120, 136, 168]
const CROSS: RGB = [232, 238, 250]
const SKY: RGB[] = [[143, 208, 255], [185, 162, 255], [255, 159, 184], [143, 230, 192], [111, 224, 224], [255, 176, 112], [230, 220, 255]]

function rgb(hex: string): RGB {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

// the 16 corners of the tesseract and the 32 edges that join them (two corners that differ in one direction)
const CORNERS: number[][] = Array.from({ length: 16 }, (_, i) => [0, 1, 2, 3].map((d) => ((i >> d) & 1 ? 0.5 : -0.5)))
const EDGES: [number, number][] = []
for (let a = 0; a < 16; a++) for (let d = 0; d < 4; d++) if (!((a >> d) & 1)) EDGES.push([a, a | (1 << d)])

/** Where each area of the mind starts in the brain: its seed. x is to the side (both halves), y is up, z is to the front.
 * The places are loose textbook links, the same ones the game names in words. Nothing here measures a brain. */
const SEEDS: { key: string; at: [number, number, number] }[] = [
  { key: 'executive', at: [0.3, 0.22, 0.9] }, // planning: the front
  { key: 'reasoning', at: [0.62, 0.5, 0.35] }, // working things out: front and side
  { key: 'reward', at: [0.15, 0.05, 0.25] }, // wanting new things: deep, toward the front
  { key: 'social', at: [0.8, -0.05, -0.05] }, // understanding people: the sides
  { key: 'imagination', at: [0.25, 0.6, -0.55] }, // imagination: the middle, toward the back
  { key: 'habit', at: [0.2, -0.05, -0.2] }, // habits: deep
  { key: 'motor', at: [0, -0.5, -0.62] }, // reaction speed: the small brain at the back, underneath
]
const SMALL = 56 // points in the small brain at the back

function makeNodes(): Node[] {
  // points spread evenly over a sphere (golden-angle spiral)
  return Array.from({ length: COUNT }, (_, i) => {
    const y = 1 - (2 * (i + 0.5)) / COUNT
    const r = Math.sqrt(1 - y * y)
    const theta = i * 2.399963
    const x = Math.cos(theta) * r
    const z = Math.sin(theta) * r
    // the same point in the brain: two halves with a gap between them, folds on the surface, a flatter underside,
    // some points deep inside, and a small brain at the back
    let bx: number, by: number, bz: number
    let region = SEEDS.length - 1
    if (i >= COUNT - SMALL) {
      const j = i - (COUNT - SMALL)
      const sy = 1 - (2 * (j + 0.5)) / SMALL
      const sr = Math.sqrt(1 - sy * sy)
      bx = Math.cos(j * 2.399963) * sr * 0.36
      by = -0.5 + sy * 0.19
      bz = -0.62 + Math.sin(j * 2.399963) * sr * 0.24
    } else {
      const deep = i % 6 === 0
      const out = (deep ? 0.3 + 0.4 * Math.random() : 0.93 + 0.07 * Math.random()) * (1 + 0.07 * Math.sin(x * 11 + z * 7) * Math.sin(y * 9 + z * 5))
      bx = x * out * 0.8
      bx += (bx < 0 ? -1 : 1) * 0.06
      by = y * out * 0.68
      if (by < -0.25) by = -0.25 + (by + 0.25) * 0.5
      by += 0.1
      bz = z * out * 1.02
      let best = 1e9
      SEEDS.slice(0, -1).forEach((s, k) => {
        const d = (Math.abs(bx) - s.at[0]) ** 2 + (by - s.at[1]) ** 2 + (bz - s.at[2]) ** 2
        if (d < best) {
          best = d
          region = k
        }
      })
    }
    const seedAt = SEEDS[region].at
    const far = Math.hypot(Math.abs(bx) - seedAt[0], by - seedAt[1], bz - seedAt[2]) + Math.random() * 0.03
    return {
      x, y, z, bx: bx * 1.32, by: by * 1.32, bz: bz * 1.32, region, far,
      seed: Math.random() * Math.PI * 2,
      drift: 0.35 + Math.random() * 0.65,
      rank: Math.random(),
      lon: (Math.atan2(z, x) + Math.PI) / (2 * Math.PI), // 0 to 1 around the sphere: which slice the point is in
      // 0 at the bottom of the sphere, 1 at the top; a little noise softens the edge
      up: (y + 1) / 2 + (Math.random() - 0.5) * 0.06,
    }
  })
}

function makeLinks(nodes: Node[], brain: boolean): Link[] {
  // each point joins its nearest neighbors, so the shape reads as one connected mind
  const seen = new Set<string>()
  const links: Link[] = []
  nodes.forEach((n, i) => {
    const near = nodes
      .map((m, j) => ({ j, d: brain ? (n.bx - m.bx) ** 2 + (n.by - m.by) ** 2 + (n.bz - m.bz) ** 2 : (n.x - m.x) ** 2 + (n.y - m.y) ** 2 + (n.z - m.z) ** 2 }))
      .filter((e) => e.j !== i)
      .sort((p, q) => p.d - q.d)
      .slice(0, NEIGHBORS)
    for (const { j } of near) {
      const key = i < j ? `${i}-${j}` : `${j}-${i}`
      if (seen.has(key)) continue
      seen.add(key)
      links.push({ a: i, b: j, rank: Math.max(nodes[i].rank, nodes[j].rank) * 0.55 + Math.random() * 0.25 })
    }
  })
  return links
}

/**
 * The twin: a brain of connected points of light for a player (a sphere of groups for an agency or a creator),
 * held inside a tesseract (a cube in four dimensions). In the brain each area of the mind starts as one seed and
 * grows outward from it as the twin learns: more points light, and lit points that sit near each other join.
 * Fine strands reach from the brain to other twins as this twin works with them. The frame turns through the fourth direction, so its inner cube passes through the outer
 * one and back. Its four directions stand for what the twin is tied to: player, agency, creator, time.
 * Each slice of the sphere is one area of the mind, in its own color. Light fills a slice from the
 * bottom up as the twin learns that area, so a slice is a ladder seen in three dimensions. Points
 * turn gold where a skill step is finished. Pale lines join one area to another.
 * Point at a dot to see its area; tap it to open that area.
 */
export function TwinForm({ coherence, pulseKey = 0, variant = 'hero', label, areas, motion = true, speed = 1, mode = 'fill', sky = 0, together = 1, onPick, axes, onSize, onAxis, axesOn, time = 1, hubs, onHub }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const target = useRef({ coherence, pulse: 0, areas, onPick, speed, mode, sky, together, axes, onSize, onAxis, axesOn, time, hubs, onHub })
  const redraw = useRef<(() => void) | null>(null)
  const [tip, setTip] = useState<Tip | null>(null)

  useEffect(() => {
    target.current.coherence = coherence
    target.current.areas = areas
    target.current.onPick = onPick
    target.current.speed = speed
    target.current.mode = mode
    target.current.sky = sky
    target.current.together = together
    target.current.axes = axes
    target.current.onSize = onSize
    target.current.onAxis = onAxis
    target.current.axesOn = axesOn
    target.current.time = time
    target.current.hubs = hubs
    target.current.onHub = onHub
    // a drag on the twin belongs to the twin, so the page does not scroll under the finger
    if (canvasRef.current) canvasRef.current.style.touchAction = 'none'
    redraw.current?.()
  }, [coherence, areas, onPick, speed, mode, sky, together, axes, onSize, onAxis, axesOn, time, hubs, onHub])

  useEffect(() => {
    if (pulseKey > 0) target.current.pulse = 1
  }, [pulseKey])

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const still = !motion
    const nodes = makeNodes()
    const sphereLinks = makeLinks(nodes, false)
    const brainLinks = makeLinks(nodes, true)
    const sparks = Array.from({ length: SPARKS }, (_, i) => ({ link: i * 37, phase: Math.random() }))
    const home = new Int16Array(COUNT) // fill: the area each point belongs to
    let shape = target.current.mode === 'clusters' ? 0 : 1 // 0 the sphere, 1 the brain; it eases from one to the other
    const px = new Float32Array(COUNT)
    const py = new Float32Array(COUNT)
    const depth = new Float32Array(COUNT)
    const lit = new Float32Array(COUNT) // 0 hidden, below 1 unformed, 1 and above formed (higher = in the wave)
    const slice = new Int16Array(COUNT)
    const tone: RGB[] = Array.from({ length: COUNT }, () => ICE)
    const gold = new Uint8Array(COUNT)
    const weight = new Float32Array(COUNT) // clusters: the size of a point, or -1 when the point is not in a group
    const fillAt = new Float32Array(COUNT) // fill: where a point sits in its own slice, 0 first to light, 1 last
    const spot = new Float32Array(4) // one placed point: screen x, screen y, depth, height
    let grouped: SphereArea[] | null = null
    let cut = 0

    // fill: inside each slice the points are put in order from the bottom up, so every area fills at the same pace
    const layout = (n: number) => {
      cut = n
      const bins: number[][] = Array.from({ length: n }, () => [])
      const keys = (target.current.areas ?? []).map((a) => a.key)
      nodes.forEach((p, i) => {
        // in the brain a point belongs to the area whose seed it grew from; an area the brain has no place for takes a slice
        const k = keys.indexOf(SEEDS[p.region].key)
        home[i] = k >= 0 ? k : Math.min(n - 1, Math.floor(p.lon * n))
        bins[home[i]].push(i)
      })
      for (const bin of bins) {
        // each area lights from its seed outward, so it grows like a living thing and not like a bar
        bin.sort((a, b) => nodes[a].far - nodes[b].far).forEach((i, j) => {
          fillAt[i] = (j + 0.5) / bin.length
        })
      }
    }

    // clusters: in each slice, the points nearest its middle become the group, one point for each member drawn
    const regroup = (map: SphereArea[]) => {
      grouped = map
      weight.fill(-1)
      map.forEach((area, k) => {
        const sizes = area.dots ?? []
        if (sizes.length === 0) return
        const angle = ((k + 0.5) / map.length) * 2 * Math.PI - Math.PI
        const mx = Math.cos(angle)
        const mz = Math.sin(angle)
        nodes
          .map((n, i) => ({ i, d: (n.x - mx) ** 2 + n.y ** 2 + (n.z - mz) ** 2 }))
          .filter((e) => weight[e.i] < 0) // a point belongs to one group only
          .sort((p, q) => p.d - q.d)
          .slice(0, sizes.length)
          .forEach((e, j) => {
            weight[e.i] = sizes[j]
            slice[e.i] = k
          })
      })
    }
    const started = performance.now()
    let shown = target.current.coherence
    let frame = 0
    let hover = -1
    let hoverAxis = -1 // the name of a direction under the pointer
    let hoverHub = -1 // a belief's point under the pointer
    let shownTime = target.current.time
    const ax = new Float32Array(4).fill(-1e6) // where each direction's name was drawn
    const ay = new Float32Array(4).fill(-1e6)
    const hx = new Float32Array(12).fill(-1e6) // where each belief's point was drawn
    const hy = new Float32Array(12).fill(-1e6)
    let held = 0 // the turning slows to a stop while a point is under the pointer
    let turned = still ? 0.6 : 0
    let lean = 0 // how far the player has tipped the sphere toward or away from them
    let through = 0 // how far the player has turned the frame through the fourth direction
    let coast = 0 // after a flick the sphere keeps turning and slows down
    let twist = 0 // the angle of the line between two fingers
    // a hand on the sphere: where the pointer was last, and how far it has moved since it came down
    let grab: { x: number; y: number; moved: number } | null = null
    let grabbedAt = -1e9
    const REST = 5000 // after the player turns the sphere, it holds still this long before it turns by itself again
    let last = started

    const draw = (now: number) => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
      const w = canvas.clientWidth
      const h = canvas.clientHeight
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr)
        canvas.height = Math.round(h * dpr)
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)

      const t = still ? 8 : (now - started) / 1000
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      held += ((hover >= 0 ? 1 : 0) - held) * 0.12
      const resting = grab !== null || now - grabbedAt < REST
      turned += still || resting ? 0 : dt * 0.2 * target.current.speed * (1 - held)
      if (!still && !grab && Math.abs(coast) > 0.0004) {
        turned += coast
        coast *= 0.94
        grabbedAt = now
      }
      shown += (target.current.coherence - shown) * (still ? 1 : 0.04)
      target.current.pulse *= 0.955
      const c = Math.max(0, Math.min(1, shown))
      const pulse = still ? 0 : target.current.pulse
      const map = target.current.areas && target.current.areas.length > 0 ? target.current.areas : null
      // the color of an area is mixed in from white as the twin connects with others
      const mix = Math.max(0, Math.min(1, target.current.together))
      const colors = map ? map.map((a) => rgb(a.color).map((v) => 255 + (v - 255) * mix) as RGB) : []
      const clusters = !!map && target.current.mode === 'clusters'
      const links = clusters ? sphereLinks : brainLinks
      shape += ((clusters ? 0 : 1) - shape) * (still ? 1 : 0.07)
      if (clusters && map !== grouped) regroup(map)
      if (map && !clusters && map.length !== cut) layout(map.length)
      const cx = w / 2
      const cy = h / 2
      const radius = Math.min(w, h) * 0.37
      const size = Math.max(0.5, Math.min(2.4, radius / 115))
      // one wave of light runs from the top of the sphere to the bottom after each pick
      const wave = pulse > 0.02 ? 1.3 - (1 - pulse) * 2.6 : 9

      const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius * 2.2)
      glow.addColorStop(0, `rgba(255, 232, 170, ${0.16 + 0.26 * c + 0.2 * pulse})`)
      glow.addColorStop(0.32, `rgba(150, 205, 255, ${0.07 + 0.09 * c})`)
      glow.addColorStop(1, 'rgba(0, 0, 0, 0)')
      ctx.fillStyle = glow
      ctx.fillRect(0, 0, w, h)

      // the collective sky: every other twin is a far point of light. It sits behind the sphere, never behind words
      const far = Math.min(600, target.current.sky)
      for (let i = 0; i < far; i++) {
        const a = Math.sin(i * 12.9898) * 43758.5453
        const b = Math.sin(i * 78.233) * 12543.123
        const fx = a - Math.floor(a)
        const fy = b - Math.floor(b)
        const drift = still ? 0 : Math.sin(t * 0.07 + i) * 6
        const blink = still ? 0.75 : 0.6 + 0.4 * Math.sin(t * 0.6 + i * 1.7)
        ctx.beginPath()
        ctx.arc(fx * w + drift, fy * h + drift * 0.4, (0.6 + 0.9 * ((i * 7) % 5) / 4) * Math.min(1.6, size), 0, Math.PI * 2)
        // the others are in color
        const hue = SKY[i % SKY.length]
        ctx.fillStyle = `rgba(${hue[0]}, ${hue[1]}, ${hue[2]}, ${0.6 * blink})`
        ctx.fill()
      }

      ctx.globalCompositeOperation = 'lighter'

      const spin = turned
      const cosS = Math.cos(spin)
      const sinS = Math.sin(spin)
      // the turn through the fourth direction: the inner cube swells, passes through the outer one, and comes back
      // time is the fourth direction: as the story moves, the frame turns through it and settles when it reaches now
      shownTime += (target.current.time - shownTime) * (still ? 1 : 0.08)
      const fourth = 0.55 + turned * 0.7 + through + (1 - shownTime) * 1.6
      const cosW = Math.cos(fourth)
      const sinW = Math.sin(fourth)
      const tilt = 0.38 + lean + (still || resting ? 0 : 0.06 * Math.sin(t * 0.23))
      const cosT = Math.cos(tilt)
      const sinT = Math.sin(tilt)
      const share = 0.4 + 0.6 * c

      // four dimensions to the screen: turn, look down the fourth direction, tilt, look down the third.
      // The up direction is never turned, so the bottom of every ladder stays at the bottom
      // The sphere lives in three directions; the frame around it has a fourth, and only the frame turns through it
      const place = (x0: number, y0: number, z0: number, w0: number, frame: boolean) => {
        const xa = x0 * cosS + z0 * sinS
        const za = -x0 * sinS + z0 * cosS
        const xb = frame ? xa * cosW + w0 * sinW : xa
        const f = frame ? EYE4 / (EYE4 - (-xa * sinW + w0 * cosW)) : 1
        const y2 = y0 * f * cosT - za * f * sinT
        const z2 = y0 * f * sinT + za * f * cosT
        const persp = 3.2 / (3.2 - z2)
        spot[0] = cx + xb * f * radius * persp
        spot[1] = cy - y2 * radius * persp // up on the shape is up on the screen
        spot[2] = z2
        spot[3] = y2
      }

      // the frame: the 32 edges of a tesseract around the sphere. Its four directions are the bigger things
      // the twin is tied to: the player, the agency, the creator, and time
      const fx = new Float32Array(16)
      const fy = new Float32Array(16)
      CORNERS.forEach((v, i) => {
        place(v[0], v[1], v[2], v[3], true)
        fx[i] = spot[0]
        fy[i] = spot[1]
      })
      ctx.beginPath()
      for (const [a, b] of EDGES) {
        ctx.moveTo(fx[a], fy[a])
        ctx.lineTo(fx[b], fy[b])
      }
      // the frame stays in the background: thin, and a little brighter as the twin forms
      ctx.strokeStyle = `rgba(223, 230, 242, ${0.09 + 0.09 * c})`
      ctx.lineWidth = 0.7
      ctx.stroke()
      for (let i = 0; i < 16; i++) {
        ctx.beginPath()
        ctx.arc(fx[i], fy[i], 1 * size, 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(223, 230, 242, 0.45)'
        ctx.fill()
      }
      const names = target.current.axes
      if (names && Math.min(w, h) >= 260) {
        // one name at the far end of each of the four edges that leave the first corner
        ctx.beginPath()
        for (let d = 0; d < 4; d++) {
          ctx.moveTo(fx[0], fy[0])
          ctx.lineTo(fx[1 << d], fy[1 << d])
        }
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)'
        ctx.lineWidth = 1
        ctx.stroke()
        ctx.font = `600 ${Math.round(Math.max(9, Math.min(13, radius / 22)))}px system-ui, sans-serif`
        ctx.textAlign = 'center'
        const live = target.current.axesOn ?? []
        const can = !!target.current.onAxis
        names.slice(0, 4).forEach((name, d) => {
          const i = 1 << d
          const away = Math.hypot(fx[i] - cx, fy[i] - cy) || 1
          ax[d] = fx[i] + ((fx[i] - cx) / away) * 22
          ay[d] = fy[i] + ((fy[i] - cy) / away) * 16
          const lit = live[d] || hoverAxis === d
          if (lit) {
            // the direction you are in, or are about to take, is drawn as a gold edge from the first corner
            ctx.beginPath()
            ctx.moveTo(fx[0], fy[0])
            ctx.lineTo(fx[i], fy[i])
            ctx.strokeStyle = 'rgba(255, 214, 130, 0.95)'
            ctx.lineWidth = 2
            ctx.stroke()
          }
          if (can && lit) {
            // the direction you are in, or point at, gets a ring; the others are only their names
            ctx.beginPath()
            ctx.arc(fx[i], fy[i], 4.5 * size, 0, Math.PI * 2)
            ctx.strokeStyle = 'rgba(255, 214, 130, 1)'
            ctx.lineWidth = 1.2
            ctx.stroke()
          }
          ctx.fillStyle = lit ? 'rgba(255, 224, 160, 1)' : 'rgba(235, 240, 250, 0.62)'
          ctx.fillText(name.toUpperCase(), ax[d], ay[d] + 4)
        })
      } else {
        ax.fill(-1e6)
      }

      for (let i = 0; i < COUNT; i++) {
        const p = nodes[i]
        let formed: boolean
        if (clusters && map) {
          formed = weight[i] >= 0
          gold[i] = formed && map[slice[i]].earned > 0 ? 1 : 0
          tone[i] = formed ? colors[slice[i]] : DIM
          // points outside every group stay faint, so the sphere reads as a place full of twins not yet reached
          lit[i] = formed ? 1 : p.rank < 0.62 ? 0.3 + 0.12 * (still ? 0.5 : 0.5 + 0.5 * Math.sin(t * 0.8 + p.seed * 5)) : 0
          if (!formed) slice[i] = -1
        } else if (map) {
          const k = home[i]
          const area = map[k]
          formed = fillAt[i] <= area.level
          slice[i] = k
          gold[i] = formed && area.earned > 0 && fillAt[i] <= area.earned * area.level ? 1 : 0
          tone[i] = formed ? colors[k] : DIM
          // unformed points are still there, faint, so the whole ladder can be seen
          lit[i] = formed ? 1 : p.rank < 0.55 ? 0.38 : 0
        } else {
          formed = p.rank <= share
          slice[i] = -1
          gold[i] = 0
          const mix = p.rank / share
          tone[i] = [GOLD[0] + (ICE[0] - GOLD[0]) * mix, GOLD[1] + (ICE[1] - GOLD[1]) * mix, GOLD[2] + (ICE[2] - GOLD[2]) * mix]
          lit[i] = formed ? 1 : 0
        }
        if (lit[i] === 0) continue
        // unformed light drifts away from the body; taught light holds its place
        const free = map ? (formed ? 0.04 : 0.3) : (1 - c) ** 2
        const loose = free * p.drift * (0.6 + 0.25 * Math.sin(t * 0.5 + p.seed))
        const k2 = BALL * (1 + loose * 1.1) * (1 + 0.02 * Math.sin(t * 1.3 + p.seed))
        const sway = still ? 0 : 0.035 * Math.sin(t * 0.7 + p.seed * 3)
        const qx = p.x + (p.bx - p.x) * shape
        const qy = p.y + (p.by - p.y) * shape
        const qz = p.z + (p.bz - p.z) * shape
        place(
          (qx + sway * qz) * k2,
          qy * k2 + (map ? 0 : (1 - c) * 0.08 * Math.sin(t * 0.4 + p.seed * 2)),
          (qz - sway * qx) * k2,
          0,
          false,
        )
        px[i] = spot[0]
        py[i] = spot[1]
        depth[i] = Math.max(0, Math.min(1, (spot[2] / BALL + 2.2) / 4.4))
        if (formed) lit[i] = 1 + Math.max(0, 1 - Math.abs(-spot[3] / BALL - wave) * 3.2) * 1.6
      }

      // a seat's sphere: the seat is a core of light at the centre, and a line runs from it to each group.
      // A group the seat has reached is gold, and signals travel out along its line and back: asking, answering
      if (clusters && map) {
        place(0, 0, 0, 0, false)
        const coreX = spot[0]
        const coreY = spot[1]
        const sumX = new Float32Array(map.length)
        const sumY = new Float32Array(map.length)
        const members = new Float32Array(map.length)
        for (let i = 0; i < COUNT; i++) {
          if (weight[i] < 0 || slice[i] < 0) continue
          sumX[slice[i]] += px[i]
          sumY[slice[i]] += py[i]
          members[slice[i]] += 1
        }
        const beat = still ? 1 : 1 + 0.12 * Math.sin(t * 1.4)
        const core = ctx.createRadialGradient(coreX, coreY, 0, coreX, coreY, 26 * size * beat)
        core.addColorStop(0, 'rgba(255, 244, 214, 0.95)')
        core.addColorStop(0.35, 'rgba(255, 214, 130, 0.35)')
        core.addColorStop(1, 'rgba(255, 214, 130, 0)')
        ctx.fillStyle = core
        ctx.beginPath()
        ctx.arc(coreX, coreY, 26 * size * beat, 0, Math.PI * 2)
        ctx.fill()
        ctx.font = `600 ${Math.round(Math.max(8, Math.min(11, radius / 26)))}px system-ui, sans-serif`
        ctx.textAlign = 'center'
        for (let k = 0; k < map.length; k++) {
          let gx: number
          let gy: number
          if (members[k] === 0) {
            // a group too small to show still has its place on the sphere: an empty ring, with no twin drawn in it
            const angle = ((k + 0.5) / map.length) * 2 * Math.PI - Math.PI
            place(Math.cos(angle) * BALL, 0, Math.sin(angle) * BALL, 0, false)
            gx = spot[0]
            gy = spot[1]
            ctx.beginPath()
            ctx.setLineDash([3, 4])
            ctx.arc(gx, gy, 10 * size, 0, Math.PI * 2)
            ctx.strokeStyle = `rgba(${colors[k][0] | 0}, ${colors[k][1] | 0}, ${colors[k][2] | 0}, 0.5)`
            ctx.lineWidth = 1
            ctx.stroke()
            ctx.setLineDash([])
          } else {
            gx = sumX[k] / members[k]
            gy = sumY[k] / members[k]
          }
          if (Math.min(w, h) >= 260) {
            ctx.fillStyle = `rgba(${colors[k][0] | 0}, ${colors[k][1] | 0}, ${colors[k][2] | 0}, ${members[k] === 0 ? 0.5 : 0.85})`
            ctx.fillText(map[k].name.replace(/^(Strongest in|Needs to grow): /, '').toUpperCase(), gx, gy + (members[k] === 0 ? 24 : 34) * size)
          }
          const reached = map[k].earned > 0
          const col = reached ? GOLD : colors[k]
          const bendX = (coreX + gx) / 2 + (gy - coreY) * 0.16
          const bendY = (coreY + gy) / 2 - (gx - coreX) * 0.16
          ctx.beginPath()
          ctx.moveTo(coreX, coreY)
          ctx.quadraticCurveTo(bendX, bendY, gx, gy)
          ctx.strokeStyle = `rgba(${col[0] | 0}, ${col[1] | 0}, ${col[2] | 0}, ${reached ? 0.55 : 0.2})`
          ctx.lineWidth = reached ? 1.3 : 0.8
          ctx.stroke()
          if (!still) {
            // one signal goes out; where the seat has reached the group, another comes back
            for (const back of reached ? [false, true] : [false]) {
              const f0 = (t * (reached ? 0.32 : 0.14) + k * 0.37 + (back ? 0.5 : 0)) % 1
              const f = back ? 1 - f0 : f0
              const g = 1 - f
              ctx.beginPath()
              ctx.arc(g * g * coreX + 2 * g * f * bendX + f * f * gx, g * g * coreY + 2 * g * f * bendY + f * f * gy, (reached ? 2 : 1.3) * size, 0, Math.PI * 2)
              ctx.fillStyle = `rgba(${col[0] | 0}, ${col[1] | 0}, ${col[2] | 0}, ${reached ? 1 : 0.6})`
              ctx.fill()
            }
          }
        }
      }

      // the links: inside one area they carry its color; between two areas they are pale, the cross connections
      ctx.lineWidth = Math.max(0.6, 0.55 * size)
      for (const l of links) {
        if (lit[l.a] < 1 || lit[l.b] < 1) continue
        const same = slice[l.a] === slice[l.b]
        if ((!map || !same) && l.rank > c) continue
        const near = (depth[l.a] + depth[l.b]) / 2
        const hot = Math.max(lit[l.a], lit[l.b])
        const col = map && same ? tone[l.a] : CROSS
        ctx.beginPath()
        ctx.moveTo(px[l.a], py[l.a])
        ctx.lineTo(px[l.b], py[l.b])
        // links inside one area carry the picture; the pale links between areas stay faint so the areas read
        ctx.strokeStyle = `rgba(${col[0] | 0}, ${col[1] | 0}, ${col[2] | 0}, ${Math.min(0.9, (0.1 + 0.5 * near * near) * (0.55 + 0.45 * c) * hot * (map && !same ? 0.45 : 1))})`
        ctx.stroke()
      }

      // signals travel along the links once the twin has enough of them
      if (!still && c > 0.2) {
        for (const s of sparks) {
          const l = links[s.link % links.length]
          if (lit[l.a] < 1 || lit[l.b] < 1) continue
          const f = (t * 0.45 + s.phase) % 1
          ctx.beginPath()
          ctx.arc(px[l.a] + (px[l.b] - px[l.a]) * f, py[l.a] + (py[l.b] - py[l.a]) * f, 1.3 * size, 0, Math.PI * 2)
          ctx.fillStyle = 'rgba(255, 244, 214, 0.95)'
          ctx.fill()
        }
      }

      for (let i = 0; i < COUNT; i++) {
        if (lit[i] === 0) continue
        const col = gold[i] ? GOLD : tone[i]
        const sameArea = hover >= 0 && slice[i] === slice[hover] && slice[i] >= 0
        const alpha = (0.28 + 0.72 * depth[i]) * (0.7 + 0.3 * c) * lit[i] * (hover >= 0 && !sameArea ? 0.45 : 1)
        // in a seat's sphere every twin breathes in its own time: a crowd, not a chart
        const alive = clusters && weight[i] >= 0 && !still ? 1 + 0.2 * Math.sin(t * 1.3 + nodes[i].seed * 4) : 1
        const grow = clusters && weight[i] >= 0 ? (0.8 + 1.5 * weight[i]) * alive : gold[i] ? 1.7 : lit[i] > 1.2 ? 1.35 : lit[i] < 1 ? 0.7 : 1
        ctx.beginPath()
        ctx.arc(px[i], py[i], (0.7 + 1.5 * depth[i]) * size * grow * (sameArea ? 1.25 : 1), 0, Math.PI * 2)
        ctx.fillStyle = `rgba(${col[0] | 0}, ${col[1] | 0}, ${col[2] | 0}, ${Math.min(1, alpha)})`
        ctx.fill()
      }

      // strands to other twins: the more this twin has worked with others, the more of them reach out from it
      if (map && !clusters && far > 0) {
        const strands = Math.round(mix * 7)
        ctx.lineWidth = 0.6
        for (let s = 0; s < strands; s++) {
          let from = (s * 43 + 11) % COUNT
          for (let tries = 0; tries < 24 && (lit[from] < 1 || depth[from] < 0.35); tries++) from = (from + 17) % COUNT
          if (lit[from] < 1) continue
          const j = (s * 5 + 1) % far
          const a = Math.sin(j * 12.9898) * 43758.5453
          const b = Math.sin(j * 78.233) * 12543.123
          const drift = still ? 0 : Math.sin(t * 0.07 + j) * 6
          const tx = (a - Math.floor(a)) * w + drift
          const ty = (b - Math.floor(b)) * h + drift * 0.4
          const mx = (px[from] + tx) / 2 + (ty - py[from]) * 0.18
          const my = (py[from] + ty) / 2 - (tx - px[from]) * 0.18
          const hue = SKY[j % SKY.length]
          ctx.beginPath()
          ctx.moveTo(px[from], py[from])
          ctx.quadraticCurveTo(mx, my, tx, ty)
          ctx.strokeStyle = `rgba(${hue[0]}, ${hue[1]}, ${hue[2]}, 0.15)`
          ctx.stroke()
          if (!still) {
            const f = (t * 0.18 + s * 0.31) % 1
            const g = 1 - f
            ctx.beginPath()
            ctx.arc(g * g * px[from] + 2 * g * f * mx + f * f * tx, g * g * py[from] + 2 * g * f * my + f * f * ty, 1.1 * size, 0, Math.PI * 2)
            ctx.fillStyle = `rgba(${hue[0]}, ${hue[1]}, ${hue[2]}, 0.9)`
            ctx.fill()
          }
        }
      }

      // beliefs: each one the twin holds is a marked point in the area it belongs to, named by its topic.
      // A belief the player said and chose to keep is gold; one learned from taps is white.
      hx.fill(-1e6)
      const marks = map && !clusters && shape > 0.6 && Math.min(w, h) >= 260 ? (target.current.hubs ?? []).slice(0, 12) : []
      ctx.font = `600 ${Math.round(Math.max(9, Math.min(12, radius / 24)))}px system-ui, sans-serif`
      ctx.textAlign = 'left'
      marks.forEach((hub, n) => {
        const seed = SEEDS.find((s) => s.key === hub.area)?.at ?? [0.12, 0.25, 0.05]
        const side = n % 2 === 0 ? 1 : -1
        const lift = ((n >> 1) % 3 - 1) * 0.14
        place(seed[0] * side * 1.32 * BALL, (seed[1] + lift) * 1.32 * BALL, seed[2] * 1.32 * BALL, 0, false)
        hx[n] = spot[0]
        hy[n] = spot[1]
        const tint = hub.told ? '255, 214, 130' : '255, 255, 255'
        const on = hoverHub === n
        // a slow breath, each belief in its own time, so the brain is never quite still
        const breath = still ? 1 : 1 + 0.18 * Math.sin(t * 1.1 + n * 1.7)
        ctx.beginPath()
        ctx.arc(spot[0], spot[1], (on ? 6.5 : 4) * size * breath, 0, Math.PI * 2)
        ctx.strokeStyle = `rgba(${tint}, ${on ? 1 : 0.7})`
        ctx.lineWidth = on ? 1.6 : 1
        ctx.stroke()
        if (on) {
          // the name shows only for the belief you point at, so the picture is not covered in words
          const text = `${hub.name.toUpperCase()}${hub.told ? ' · YOU TOLD ME' : ''}`
          const wide = ctx.measureText(text).width
          ctx.globalCompositeOperation = 'source-over'
          ctx.fillStyle = 'rgba(0, 0, 0, 0.78)'
          ctx.fillRect(spot[0] + 10 * size, spot[1] - 9, wide + 12, 18)
          ctx.fillStyle = `rgba(${tint}, 1)`
          ctx.fillText(text, spot[0] + 10 * size + 6, spot[1] + 4)
          ctx.globalCompositeOperation = 'lighter'
        }
      })

      if (hover >= 0 && lit[hover] > 0) {
        ctx.beginPath()
        ctx.arc(px[hover], py[hover], 7 * size, 0, Math.PI * 2)
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)'
        ctx.lineWidth = 1
        ctx.stroke()
      }

      ctx.globalCompositeOperation = 'source-over'
      if (!still) frame = requestAnimationFrame(draw)
    }

    const again = () => {
      if (still) frame = requestAnimationFrame(draw)
    }

    // the name of a direction, or its corner, under the pointer: -1 when there is none
    const axisAt = (ev: PointerEvent): number => {
      if (!target.current.onAxis) return -1
      const box = canvas.getBoundingClientRect()
      const mx = ev.clientX - box.left
      const my = ev.clientY - box.top
      for (let d = 0; d < 4; d++) {
        if (Math.abs(mx - ax[d]) < 44 && Math.abs(my - ay[d]) < 20) return d
      }
      return -1
    }

    // a belief's point under the pointer: -1 when there is none
    const hubAt = (ev: PointerEvent): number => {
      if (!target.current.onHub) return -1
      const box = canvas.getBoundingClientRect()
      const mx = ev.clientX - box.left
      const my = ev.clientY - box.top
      for (let n = 0; n < 12; n++) {
        if (Math.abs(mx - hx[n]) < 13 && Math.abs(my - hy[n]) < 13) return n
      }
      return -1
    }

    const nearest = (ev: PointerEvent): number => {
      const map = target.current.areas
      if (!map || map.length === 0) return -1
      const box = canvas.getBoundingClientRect()
      const mx = ev.clientX - box.left
      const my = ev.clientY - box.top
      let best = -1
      let bestD = REACH * REACH
      for (let i = 0; i < COUNT; i++) {
        if (lit[i] === 0 || depth[i] < 0.45 || slice[i] < 0) continue // only points on the near side that belong to an area
        const d = (px[i] - mx) ** 2 + (py[i] - my) ** 2
        if (d < bestD) {
          bestD = d
          best = i
        }
      }
      return best
    }

    // the gestures that move the twin between its three places
    const fingers = new Map<number, { x: number; y: number }>()
    let downAt: { x: number; y: number } | null = null
    let spread = 0
    let fired = false
    let lastTap = 0
    let wheeled = 0
    const resize = (step: 1 | -1 | 0) => {
      fired = true
      target.current.onSize?.(step)
    }
    const onDown = (ev: PointerEvent) => {
      fingers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY })
      if (fingers.size === 1) {
        downAt = { x: ev.clientX, y: ev.clientY }
        fired = false
        // a pointer that comes down on the sphere takes hold of it; one that comes down around it moves the twin
        const box = canvas.getBoundingClientRect()
        const reach = Math.min(box.width, box.height) * 0.37 * BALL * 1.15
        const onBall = Math.hypot(ev.clientX - box.left - box.width / 2, ev.clientY - box.top - box.height / 2) <= reach
        grab = onBall ? { x: ev.clientX, y: ev.clientY, moved: 0 } : null
        coast = 0
      } else if (fingers.size === 2) {
        const [p, q] = [...fingers.values()]
        twist = Math.atan2(p.y - q.y, p.x - q.x)
        grab = null
        const [a, b] = [...fingers.values()]
        spread = Math.hypot(a.x - b.x, a.y - b.y)
      }
      try {
        canvas.setPointerCapture(ev.pointerId)
      } catch {
        // the drag still works while the pointer stays over the twin
      }
    }
    // turn the sphere and its frame by hand: sideways spins them, up and down tips them
    const turn = (dx: number, dy: number) => {
      turned += dx
      lean = Math.max(-1.2, Math.min(1, lean + dy))
      grabbedAt = performance.now()
      again()
    }
    // turn the frame through the fourth direction, apart from the sphere
    const pass = (by: number) => {
      through += by
      grabbedAt = performance.now()
      again()
    }
    const onKey = (ev: KeyboardEvent) => {
      if (ev.shiftKey && (ev.key === 'ArrowLeft' || ev.key === 'ArrowRight')) {
        ev.preventDefault()
        pass(ev.key === 'ArrowLeft' ? -0.2 : 0.2)
        return
      }
      const step: Record<string, [number, number]> = { ArrowLeft: [-0.2, 0], ArrowRight: [0.2, 0], ArrowUp: [0, -0.12], ArrowDown: [0, 0.12] }
      const move = step[ev.key]
      if (!move) return
      ev.preventDefault()
      turn(move[0], move[1])
    }
    const onCancel = (ev: PointerEvent) => {
      fingers.delete(ev.pointerId)
      if (fingers.size === 0) downAt = null
      grab = null
    }
    const onWheel = (ev: WheelEvent) => {
      ev.preventDefault()
      if (!ev.ctrlKey) {
        // the wheel turns the frame through the fourth direction
        pass(ev.deltaY * 0.002)
        return
      }
      // a pinch on a trackpad arrives as a wheel with the control key held
      if (!target.current.onSize) return
      const now = performance.now()
      if (now - wheeled < 600) return
      wheeled = now
      resize(ev.deltaY < 0 ? 1 : -1)
    }

    const onMove = (ev: PointerEvent) => {
      if (fingers.has(ev.pointerId)) {
        fingers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY })
        if (fingers.size === 2) {
          const [a, b] = [...fingers.values()]
          // two fingers that turn around each other turn the frame through the fourth direction
          const angle = Math.atan2(a.y - b.y, a.x - b.x)
          let by = angle - twist
          if (by > Math.PI) by -= 2 * Math.PI
          if (by < -Math.PI) by += 2 * Math.PI
          twist = angle
          if (Math.abs(by) > 0.002) pass(by)
          if (spread > 0 && !fired && target.current.onSize) {
            const ratio = Math.hypot(a.x - b.x, a.y - b.y) / spread
            if (ratio > 1.3) resize(1)
            else if (ratio < 0.77) resize(-1)
          }
        }
        if (grab && fingers.size === 1) {
          const dx = ev.clientX - grab.x
          const dy = ev.clientY - grab.y
          grab.x = ev.clientX
          grab.y = ev.clientY
          grab.moved += Math.abs(dx) + Math.abs(dy)
          if (grab.moved > 6) {
            canvas.style.cursor = 'grabbing'
            if (hover >= 0) {
              hover = -1
              setTip(null)
            }
            if (ev.shiftKey) {
              pass(dx * 0.008)
            } else {
              turn(dx * 0.008, dy * 0.006)
              coast = dx * 0.008
            }
            return
          }
        }
      }
      const mark = hubAt(ev)
      if (mark !== hoverHub) {
        hoverHub = mark
        again()
      }
      if (mark >= 0) {
        canvas.style.cursor = 'pointer'
        if (hover >= 0) {
          hover = -1
          setTip(null)
        }
        return
      }
      const over = axisAt(ev)
      if (over !== hoverAxis) {
        hoverAxis = over
        again()
      }
      if (over >= 0) {
        canvas.style.cursor = 'pointer'
        if (hover >= 0) {
          hover = -1
          setTip(null)
        }
        return
      }
      const i = nearest(ev)
      if (i === hover) return
      hover = i
      canvas.style.cursor = i >= 0 ? 'pointer' : target.current.onSize ? 'grab' : ''
      const map = target.current.areas
      if (i < 0 || !map) {
        setTip(null)
      } else {
        const area = map[slice[i]]
        const lines = target.current.mode === 'clusters'
          ? [area.hidden || area.count == null ? 'This group is too small to show.' : `${area.count} in this group.`,
             gold[i] ? 'Gold: you have reached this group' : 'You have not reached this group yet',
             'A larger point is further along. Size never comes from money.']
          : [`This area is ${Math.round(area.level * 100)} percent filled.`,
             gold[i] ? 'Gold: a skill step you finished' : lit[i] >= 1 ? 'Lit: this part is filled' : 'Faint: this part is not filled yet']
        setTip({ x: px[i], y: py[i], name: area.name, lines })
      }
      again()
    }
    const onLeave = () => {
      hover = -1
      hoverHub = -1
      hoverAxis = -1
      canvas.style.cursor = ''
      setTip(null)
      again()
    }
    const onClick = (ev: PointerEvent) => {
      const start = downAt
      const many = fingers.size > 1
      fingers.delete(ev.pointerId)
      if (fingers.size === 0) downAt = null
      const held = grab
      grab = null
      if (held && held.moved > 6) {
        canvas.style.cursor = 'grab'
        return
      }
      if (many || fired || !start) return
      const dx = ev.clientX - start.x
      const dy = ev.clientY - start.y
      // a drag down makes the twin bigger; a drag up sends it back toward its home at the top
      if (!held && target.current.onSize && Math.abs(dy) > 44 && Math.abs(dy) > Math.abs(dx) * 1.2) {
        resize(dy > 0 ? 1 : -1)
        return
      }
      if (Math.hypot(dx, dy) > 10) return
      const mark = hubAt(ev)
      if (mark >= 0) {
        target.current.onHub?.(mark)
        return
      }
      const picked = axisAt(ev)
      if (picked >= 0) {
        target.current.onAxis?.(picked)
        return
      }
      const i = nearest(ev)
      const map = target.current.areas
      if (i >= 0 && map && target.current.onPick) {
        target.current.onPick(map[slice[i]].key)
        return
      }
      // two taps on the open space of the twin open or close the full screen
      const now = performance.now()
      if (now - lastTap < 380) {
        lastTap = 0
        resize(0)
      } else {
        lastTap = now
      }
    }

    frame = requestAnimationFrame(draw)
    window.addEventListener('resize', again)
    canvas.addEventListener('pointermove', onMove)
    canvas.addEventListener('pointerleave', onLeave)
    canvas.addEventListener('pointerup', onClick)
    canvas.addEventListener('pointerdown', onDown)
    canvas.addEventListener('keydown', onKey)
    canvas.addEventListener('pointercancel', onCancel)
    canvas.addEventListener('wheel', onWheel, { passive: false })
    // with motion off there is no loop, so a change in the twin asks for one new still picture
    redraw.current = again
    return () => {
      redraw.current = null
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', again)
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerleave', onLeave)
      canvas.removeEventListener('pointerup', onClick)
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('keydown', onKey)
      canvas.removeEventListener('pointercancel', onCancel)
      canvas.removeEventListener('wheel', onWheel)
    }
  }, [motion])

  return (
    <div className={`twin-wrap twin-${variant}`}>
      <canvas ref={canvasRef} className="twin" role="img" aria-label={label} tabIndex={variant === 'dot' ? undefined : 0} />
      {tip && (
        <div className="twin-tip" role="status" style={{ left: tip.x, top: tip.y }}>
          <strong>{tip.name}</strong>
          {tip.lines.map((line) => <span key={line}>{line}</span>)}
          {onPick && <span className="twin-tip-go">Tap for more</span>}
        </div>
      )}
    </div>
  )
}

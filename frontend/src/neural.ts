/**
 * One way of drawing shared by the scenes: a path that is forged, the way a nerve cell grows toward another.
 * A path leaves one body, wanders, sends out short side shoots that find nothing and stop, and at last reaches
 * the other body. Once it has arrived, the side shoots fade and signals can run along it.
 */
export type V = [number, number, number]
/** Turns a point in space into a spot on the screen: x, y, and how near it is (1 is the middle distance). */
export type See = (q: V) => V
/** The shape of one path, apart from where it starts and ends: sideways drift at each step, and its side shoots. */
export type Wander = { off: V[]; twigs: { at: number; off: V[] }[] }

export const TAU = Math.PI * 2
export const clamp = (p: number) => Math.max(0, Math.min(1, p))
export const ease = (p: number) => p * p * (3 - 2 * p)

/** The same seed gives the same numbers, so a scene does not jump when it is drawn again. */
export function seeded(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const unit = (a: V): V => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1
  return [a[0] / l, a[1] / l, a[2] / l]
}

/** A short crooked shoot from a point: used for side shoots, and for the small arms around a cell body. */
export function shoot(rand: () => number, steps: number, stride: number): V[] {
  let dir = unit([rand() - 0.5, rand() - 0.5, rand() - 0.5])
  let p: V = [0, 0, 0]
  const out: V[] = [p]
  for (let j = 0; j < steps; j++) {
    dir = unit([dir[0] + 0.7 * (rand() - 0.5), dir[1] + 0.7 * (rand() - 0.5), dir[2] + 0.7 * (rand() - 0.5)])
    p = [p[0] + dir[0] * stride, p[1] + dir[1] * stride, p[2] + dir[2] * stride]
    out.push(p)
  }
  return out
}

/** Make the shape of one path. `sway` is how far it may drift from the straight line, as a share of its length. */
export function wander(rand: () => number, steps = 26, twigs = 5, sway = 0.13): Wander {
  const ph = Array.from({ length: 6 }, () => rand() * TAU)
  const fr = [0.5 + rand() * 0.7, 0.5 + rand() * 0.7, 0.5 + rand() * 0.7]
  const amp = sway * (0.6 + 0.8 * rand())
  const off: V[] = []
  for (let i = 0; i < steps; i++) {
    const s = i / (steps - 1)
    const env = Math.sin(Math.PI * s) * amp
    off.push([
      env * (Math.sin(fr[0] * s * TAU + ph[0]) + 0.1 * Math.sin(3 * s * TAU + ph[3])),
      env * (Math.sin(fr[1] * s * TAU + ph[1]) + 0.1 * Math.sin(4 * s * TAU + ph[4])),
      env * 0.8 * (Math.sin(fr[2] * s * TAU + ph[2]) + 0.1 * Math.sin(3 * s * TAU + ph[5])),
    ])
  }
  return { off, twigs: Array.from({ length: twigs }, () => ({ at: 2 + Math.floor(rand() * Math.max(1, steps - 5)), off: shoot(rand, 4 + Math.floor(rand() * 5), 0.03) })) }
}

/** The point a share `k` of the way along a path from a to b. */
export function along(w: Wander, a: V, b: V, k: number): V {
  const n = w.off.length - 1
  const x = clamp(k) * n
  const i = Math.min(n - 1, Math.floor(x))
  const f = x - i
  const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])
  const s = x / n
  const o0 = w.off[i]
  const o1 = w.off[i + 1]
  return [a[0] + (b[0] - a[0]) * s + (o0[0] + (o1[0] - o0[0]) * f) * len, a[1] + (b[1] - a[1]) * s + (o0[1] + (o1[1] - o0[1]) * f) * len, a[2] + (b[2] - a[2]) * s + (o0[2] + (o1[2] - o0[2]) * f) * len]
}

/**
 * Draw a path from a toward b, as far as it has grown (0 to 1). While it grows its tip searches: a bright point
 * with fine feelers. `shoots` (0 to 1) is how much of the side shoots still shows. `rgb` is "r, g, b".
 * The caller sets how light adds up; this only strokes.
 */
export function trace(ctx: CanvasRenderingContext2D, see: See, w: Wander, a: V, b: V, grow: number, alpha: number, rgb: string, t: number, shoots: number): void {
  if (grow <= 0 || alpha <= 0) return
  const n = w.off.length - 1
  const last = Math.floor(clamp(grow) * n)
  const pts: V[] = []
  for (let i = 0; i <= last; i++) pts.push(see(along(w, a, b, i / n)))
  const tip = see(along(w, a, b, grow))
  pts.push(tip)
  const stroke = (width: number, strength: number) => {
    ctx.beginPath()
    ctx.moveTo(pts[0][0], pts[0][1])
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1])
    ctx.strokeStyle = `rgba(${rgb}, ${strength})`
    ctx.lineWidth = width * tip[2]
    ctx.stroke()
  }
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  stroke(5, alpha * 0.1)
  stroke(2.2, alpha * 0.22)
  stroke(0.9, alpha * 0.95)
  if (shoots > 0.02) {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])
    for (const twig of w.twigs) {
      const out = clamp((grow * n - twig.at) / 5)
      if (out <= 0) continue
      const root = along(w, a, b, twig.at / n)
      ctx.beginPath()
      const reach = Math.max(1, Math.round(out * (twig.off.length - 1)))
      for (let j = 0; j <= reach; j++) {
        const q = see([root[0] + twig.off[j][0] * len * 2.4, root[1] + twig.off[j][1] * len * 2.4, root[2] + twig.off[j][2] * len * 2.4])
        if (j === 0) ctx.moveTo(q[0], q[1])
        else ctx.lineTo(q[0], q[1])
      }
      ctx.strokeStyle = `rgba(${rgb}, ${alpha * 0.55 * shoots})`
      ctx.lineWidth = 0.7 * tip[2]
      ctx.stroke()
    }
  }
  if (grow < 1) {
    // the searching tip: a bright point, and fine feelers that never hold still
    ctx.fillStyle = `rgba(255, 246, 224, ${alpha})`
    ctx.beginPath()
    ctx.arc(tip[0], tip[1], 2.4 * tip[2], 0, TAU)
    ctx.fill()
    ctx.strokeStyle = `rgba(255, 246, 224, ${alpha * 0.7})`
    ctx.lineWidth = 0.6
    ctx.beginPath()
    for (let k = 0; k < 4; k++) {
      const turn = k * 1.7 + Math.sin(t * 7 + k * 2.3) * 0.9
      const far = (6 + 5 * Math.sin(t * 11 + k)) * tip[2]
      ctx.moveTo(tip[0], tip[1])
      ctx.lineTo(tip[0] + Math.cos(turn) * far, tip[1] + Math.sin(turn) * far)
    }
    ctx.stroke()
  }
}

/** A cell body: soft light with a bright middle, and its small arms. `arms` come from `shoot`. */
export function body(ctx: CanvasRenderingContext2D, see: See, at: V, size: number, rgb: string, strength: number, arms: V[][], scale: number): void {
  const q = see(at)
  const r = size * scale * q[2]
  const light = ctx.createRadialGradient(q[0], q[1], 0, q[0], q[1], r * 4.5)
  light.addColorStop(0, `rgba(${rgb}, ${0.5 * strength})`)
  light.addColorStop(0.3, `rgba(${rgb}, ${0.14 * strength})`)
  light.addColorStop(1, `rgba(${rgb}, 0)`)
  ctx.fillStyle = light
  ctx.beginPath()
  ctx.arc(q[0], q[1], r * 4.5, 0, TAU)
  ctx.fill()
  ctx.lineCap = 'round'
  for (const arm of arms) {
    ctx.beginPath()
    arm.forEach((p, j) => {
      const s = see([at[0] + p[0], at[1] + p[1], at[2] + p[2]])
      if (j === 0) ctx.moveTo(s[0], s[1])
      else ctx.lineTo(s[0], s[1])
    })
    ctx.strokeStyle = `rgba(${rgb}, ${0.5 * strength})`
    ctx.lineWidth = 0.9 * q[2]
    ctx.stroke()
  }
  const core = ctx.createRadialGradient(q[0], q[1], 0, q[0], q[1], r)
  core.addColorStop(0, `rgba(255, 250, 238, ${Math.min(1, 0.95 * strength)})`)
  core.addColorStop(0.6, `rgba(${rgb}, ${0.8 * strength})`)
  core.addColorStop(1, `rgba(${rgb}, 0)`)
  ctx.fillStyle = core
  ctx.beginPath()
  ctx.arc(q[0], q[1], r, 0, TAU)
  ctx.fill()
}

/** The far background every scene shares: dark above, a low warm haze, far dust, and the lit edge of a world. */
export function deepSpace(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, dust: Float32Array, solid: boolean): void {
  ctx.globalCompositeOperation = 'source-over'
  ctx.clearRect(0, 0, w, h)
  if (solid) {
    const sky = ctx.createLinearGradient(0, 0, 0, h)
    sky.addColorStop(0, '#02050a')
    sky.addColorStop(0.6, '#04060a')
    sky.addColorStop(0.85, '#0e0906')
    sky.addColorStop(1, '#020203')
    ctx.fillStyle = sky
    ctx.fillRect(0, 0, w, h)
  }
  ctx.globalCompositeOperation = 'lighter'
  const haze = (x: number, y: number, r: number, color: string) => {
    const fog = ctx.createRadialGradient(x, y, 0, x, y, r)
    fog.addColorStop(0, color)
    fog.addColorStop(1, 'rgba(0, 0, 0, 0)')
    ctx.fillStyle = fog
    ctx.fillRect(x - r, y - r, r * 2, r * 2)
  }
  const drift = Math.sin(t * 0.05)
  // the haze belongs to a scene that fills the screen; on a page it would show the edge of the picture
  if (solid) haze(w * (0.22 + 0.05 * drift), h * 0.86, w * 0.6, 'rgba(255, 138, 48, 0.1)')
  if (solid) haze(w * (0.8 - 0.04 * drift), h * 0.16, w * 0.55, 'rgba(60, 150, 170, 0.07)')
  // far dust: it barely moves, which is what makes the space feel large
  ctx.fillStyle = '#dfe8f5'
  for (let i = 0; i < dust.length; i += 3) {
    const x = (((dust[i] + t * 0.0025 * dust[i + 2]) % 1) + 1) % 1
    ctx.globalAlpha = 0.12 + 0.5 * dust[i + 2] * (0.7 + 0.3 * Math.sin(t * 0.6 + i))
    const d = 0.6 + 1.1 * dust[i + 2]
    ctx.fillRect(x * w, dust[i + 1] * h, d, d)
  }
  ctx.globalAlpha = 1
  if (solid) {
    const limb = w * 1.9
    ctx.beginPath()
    ctx.arc(w * 0.5, h * 0.93 + limb, limb, Math.PI * 1.2, Math.PI * 1.8)
    ctx.strokeStyle = 'rgba(255, 196, 130, 0.45)'
    ctx.lineWidth = 1
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(w * 0.5, h * 0.93 + limb + 3, limb, Math.PI * 1.2, Math.PI * 1.8)
    ctx.strokeStyle = 'rgba(255, 150, 70, 0.12)'
    ctx.lineWidth = 7
    ctx.stroke()
  }
}

export function makeDust(rand: () => number, count: number): Float32Array {
  const dust = new Float32Array(count * 3)
  for (let i = 0; i < dust.length; i += 3) {
    dust[i] = rand()
    dust[i + 1] = rand()
    dust[i + 2] = Math.pow(rand(), 3)
  }
  return dust
}

/** Break words into lines no wider than `most` pixels, at most `lines` of them. */
export function wrapWords(ctx: CanvasRenderingContext2D, words: string, most: number, lines: number): string[] {
  const out: string[] = []
  let now = ''
  for (const word of words.split(' ')) {
    const next = now ? `${now} ${word}` : word
    if (ctx.measureText(next).width <= most || !now) now = next
    else {
      out.push(now)
      now = word
    }
  }
  if (now) out.push(now)
  if (out.length > lines) {
    out.length = lines
    out[lines - 1] = `${out[lines - 1].replace(/[.,;:]$/, '')}...`
  }
  return out
}

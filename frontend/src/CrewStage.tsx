import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import type { CrewScript } from './crewScripts'
import { still } from './motion'
import { TAU, along, body, clamp, deepSpace, ease, makeDust, seeded, shoot, trace, wander, wrapWords, type V, type Wander } from './neural'

const PACE = 2600 // one line: a path is forged in about two seconds, then there is time to read
const TRAVEL = 1900
// where each of the five is in space: the boss, its three crew, and who they reach
const HOME: V[] = [[-1.25, 0.04, 0], [-0.36, 0.62, 0.22], [-0.2, 0, -0.3], [-0.36, -0.6, 0.22], [1.02, 0.02, 0]]
const MOST = 36 // Syms drawn in the group; the true count is said in words
const WARM = '255, 214, 150'
const COOL = '134, 211, 230'
const PALE = '174, 185, 204'
const HUES = ['255, 217, 138', '191, 230, 255', '166, 230, 195', '255, 171, 155', '217, 194, 255', '255, 194, 226']

/** A number that counts up when its moment comes, so the work is felt as it lands. */
function Count({ to, state }: { to: number; state: 'wait' | 'run' | 'done' }) {
  const [shown, setShown] = useState(0)
  useEffect(() => {
    if (state !== 'run') return
    let raf = 0
    const began = performance.now()
    const tick = (now: number) => {
      const p = clamp((now - began) / 1100)
      setShown(Math.round(to * ease(p)))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [state, to])
  return <>{state === 'wait' ? 0 : state === 'done' ? to : shown}</>
}

/**
 * A boss, its crew and who they reach, as nerve cells in a very large dark. Nothing is joined at the start.
 * Each line of the replay forges a path: it leaves the one who speaks, searches, sends out side shoots that find
 * nothing, and at last reaches the one who hears. Where the crew reaches a group, the path branches to every Sym
 * in it and each Sym wakes as it is touched. Once a path exists, later lines are signals that run along it.
 * At the end everything dims and the answer stands alone: one bar for each choice, with its real share.
 * Every count comes from the run that just happened. With motion off, one still picture is drawn and every line
 * is listed. The lines are always a list a screen reader can read.
 */
export function CrewStage(props: { script: CrewScript; doneLabel: string; onDone: () => void; waiting?: boolean }) {
  const { script, doneLabel, onDone, waiting } = props
  const [calm] = useState(still)
  const [at, setAt] = useState(() => (calm ? script.steps.length : 0))
  const over = at >= script.steps.length
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const beat = useRef({ at, start: 0 })

  useEffect(() => {
    beat.current = { at, start: performance.now() }
    if (over) return
    const timer = window.setTimeout(() => setAt((v) => v + 1), PACE)
    return () => window.clearTimeout(timer)
  }, [at, over])

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const rand = seeded(2049)
    const crowd = script.one ? 0 : Math.min(MOST, Math.max(1, script.crowd ?? 8))
    const pale = script.crowd ? Math.round(((script.samples ?? 0) / script.crowd) * crowd) : 0
    const dust = makeDust(rand, 240)
    // one path for each pair that ever speaks, laid from the one who speaks first
    const key = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`)
    const paths = new Map<string, { w: Wander; a: number; b: number }>()
    for (const s of script.steps) if (!paths.has(key(s.from, s.to))) paths.set(key(s.from, s.to), { w: wander(rand, 30, 6, 0.11), a: s.from, b: s.to })
    const arms = HOME.map((_, i) => Array.from({ length: i === 0 ? 9 : 5 }, () => shoot(rand, 5, i === 0 ? 0.05 : 0.03)))
    // the group: each Sym has its own place, its own small arms, and its own branch from where the path arrives
    const field: V[] = Array.from({ length: crowd }, (_, j) => {
      const y = 1 - (2 * (j + 0.5)) / crowd
      const r = Math.sqrt(1 - y * y)
      const deep = 0.45 + 0.55 * ((j * 0.618) % 1)
      return [HOME[4][0] + r * Math.cos(j * 2.39996) * 0.56 * deep, HOME[4][1] + y * 0.5 * deep, HOME[4][2] + r * Math.sin(j * 2.39996) * 0.46 * deep]
    })
    const branch = field.map(() => wander(rand, 9, 1, 0.16))
    const symArms = field.map(() => [shoot(rand, 3, 0.022), shoot(rand, 3, 0.022)])
    const split = (script.split ?? []).slice(0, 5)
    // the answer: one body for each choice, and one fine path into it for each Sym that chose it.
    // The paths leave from the middle of the group, never from one Sym, so nobody's choice is shown
    const answered = Math.min(MOST, Math.max(1, script.crowd ?? crowd))
    const rise = Math.min(0.42, 1.5 / Math.max(1, split.length - 1))
    const answers = split.map((c, k) => ({
      at: [-0.3 - 0.12 * Math.abs(k - (split.length - 1) / 2) * rise, ((split.length - 1) / 2 - k) * rise + 0.04, 0.1] as V,
      arms: Array.from({ length: 4 }, () => shoot(rand, 4, 0.03)),
      fibers: Array.from({ length: c.share > 0 ? Math.max(1, Math.round(c.share * answered)) : 0 }, () => wander(rand, 28, 0, 0.1)),
    }))

    let w = 0
    let h = 0
    let raf = 0
    const size = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
      w = canvas.clientWidth
      h = canvas.clientHeight
      canvas.width = Math.max(1, Math.round(w * dpr))
      canvas.height = Math.max(1, Math.round(h * dpr))
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    const draw = (now: number) => {
      const t = now / 1000
      const state = beat.current
      const done = state.at >= script.steps.length
      const step = done ? null : script.steps[state.at]
      const p = step ? clamp((now - state.start) / TRAVEL) : 1
      // at the end, everything else dims so the answer stands alone
      const end = done && split.length > 0 ? (calm ? 1 : ease(clamp((now - state.start) / 1400))) : 0
      const show = 1 - 0.86 * end
      const showGroup = 1 - 0.3 * end
      const before = new Set<string>()
      let touched = false // has anyone reached the group before this line
      for (let i = 0; i < Math.min(state.at, script.steps.length); i++) {
        before.add(key(script.steps[i].from, script.steps[i].to))
        if (script.steps[i].from === 4 || script.steps[i].to === 4) touched = true
      }

      const yaw = calm ? 0.1 : 0.16 * Math.sin(t * 0.13)
      const pitch = 0.14
      const cy = Math.cos(yaw)
      const sy = Math.sin(yaw)
      const cp = Math.cos(pitch)
      const sp = Math.sin(pitch)
      const scale = Math.min(w * 0.25, h * 0.28) * (1 + 0.06 * (Math.min(state.at, script.steps.length) / script.steps.length))
      const see = (q: V): V => {
        const x = q[0] * cy + q[2] * sy
        const z = -q[0] * sy + q[2] * cy
        const near = 4 / (4 - (q[1] * sp + z * cp))
        return [w / 2 + x * near * scale, h * 0.31 - (q[1] * cp - z * sp) * near * scale, near]
      }
      const dot = (q: V, r: number, color: string) => {
        const s = see(q)
        ctx.fillStyle = color
        ctx.beginPath()
        ctx.arc(s[0], s[1], r * s[2], 0, TAU)
        ctx.fill()
      }

      deepSpace(ctx, w, h, calm ? 0 : t, dust, true)

      // ---- the paths ----
      const usesGroup = !!step && crowd > 0 && (step.from === 4 || step.to === 4)
      for (const [k, path] of paths) {
        const a = HOME[path.a]
        const b = HOME[path.b]
        const live = !!step && key(step.from, step.to) === k
        if (!live && !before.has(k)) continue
        const firstTime = live && !before.has(k)
        // a first contact with a group spends its first part on the trunk and the rest on the branches
        const grow = firstTime ? ease(clamp(p / (usesGroup && !touched ? 0.62 : 0.9))) : 1
        trace(ctx, see, path.w, a, b, grow, (live ? 0.95 : 0.3) * show, live ? WARM : COOL, t, firstTime ? 1 - clamp((p - 0.9) / 0.1) : 0)
        if (live && step && !firstTime && !calm) {
          // the path is already there: this line is a signal that runs along it
          for (let n = 0; n < 4; n++) {
            const f = clamp(p * 1.5 - n * 0.14)
            if (f <= 0 || f >= 1) continue
            dot(along(path.w, a, b, step.from === path.a ? ease(f) : 1 - ease(f)), 2.8, `rgba(255, 246, 224, ${show})`)
          }
        }
        if (live && step && p > 0.86 && p < 1) {
          // contact: a ring opens where the path arrives
          const s = see(HOME[step.to])
          const open = (p - 0.86) / 0.14
          ctx.strokeStyle = `rgba(255, 240, 210, ${0.8 * (1 - open) * show})`
          ctx.lineWidth = 1.2
          ctx.beginPath()
          ctx.arc(s[0], s[1], (8 + 44 * open) * s[2], 0, TAU)
          ctx.stroke()
        }
      }

      // ---- the group: the path that arrives branches to every Sym, and each one wakes as it is touched ----
      for (let j = 0; j < crowd; j++) {
        const order = j / crowd
        let grown = touched || done || calm ? 1 : 0
        if (usesGroup && !touched) grown = ease(clamp((p - 0.55) / 0.45 - order * 0.5) * 2 > 1 ? 1 : clamp((p - 0.55) / 0.45 - order * 0.5) * 2)
        const tone = j < pale ? PALE : HUES[j % HUES.length]
        if (grown > 0) trace(ctx, see, branch[j], HOME[4], field[j], grown, (usesGroup ? 0.6 : 0.2) * show, usesGroup ? WARM : tone, t, 0)
        if (usesGroup && step && touched && !calm) {
          // signals on the branches: out to each Sym when it is asked, back from each Sym when it answers
          const f = step.to === 4 ? clamp((p - 0.5) / 0.4 - order * 0.2) : clamp(p / 0.4 - order * 0.3)
          if (f > 0 && f < 1) dot(along(branch[j], HOME[4], field[j], step.to === 4 ? f : 1 - f), 1.9, `rgba(${j < pale ? PALE : '255, 246, 224'}, ${show})`)
        }
        body(ctx, see, field[j], 0.028, tone, (0.3 + 0.7 * grown) * (j < pale ? 0.6 : 1) * showGroup, grown > 0.5 ? symArms[j] : [], scale)
      }

      // ---- the five bodies ----
      const speaks = (i: number) => !!step && step.from === i
      const hears = (i: number) => !!step && step.to === i && p > 0.86
      const beatOf = (i: number) => (speaks(i) || hears(i) ? 1 : 0.6) * show * (calm ? 1 : 0.92 + 0.08 * Math.sin(t * 1.6 + i))
      body(ctx, see, HOME[0], 0.085, WARM, beatOf(0), arms[0], scale)
      for (let c = 1; c <= 3; c++) body(ctx, see, HOME[c], 0.05, speaks(c) || hears(c) ? WARM : COOL, beatOf(c), arms[c], scale)
      if (crowd === 0) body(ctx, see, HOME[4], 0.07, speaks(4) || hears(4) ? WARM : '190, 214, 255', beatOf(4), arms[4], scale)

      // ---- names, set small and wide ----
      ctx.globalCompositeOperation = 'source-over'
      ctx.textAlign = 'center'
      const name = (words: string, at: V, below: number, lit: boolean) => {
        const s = see(at)
        ctx.font = "500 10px 'Helvetica Neue', Helvetica, Arial, sans-serif"
        ctx.fillStyle = lit ? `rgba(255, 226, 168, ${show})` : `rgba(210, 217, 230, ${0.85 * show})`
        ctx.fillText(words.toUpperCase().split('').join(' '), s[0], s[1] + below * scale * s[2])
      }
      name(script.cast[0], HOME[0], 0.4, speaks(0) || hears(0))
      for (let c = 1; c <= 3; c++) name(script.cast[c], HOME[c], c === 3 ? 0.26 : -0.2, speaks(c) || hears(c))
      name(script.cast[4], HOME[4], crowd ? 0.72 : 0.34, speaks(4) || hears(4))

      // ---- the answer: the group's paths gather into one body for each choice ----
      if (end > 0) {
        const top = Math.max(...split.map((c) => c.share), 0.01)
        const total = answers.reduce((n, a) => n + a.fibers.length, 0) || 1
        ctx.globalCompositeOperation = 'lighter'
        let drawn = 0
        answers.forEach((a, k) => {
          const tone = HUES[k % HUES.length]
          a.fibers.forEach((fiber, i) => {
            // each path is forged a moment after the one before, so the answer is seen arriving
            const grow = ease(clamp(end * 1.7 - (drawn / total) * 0.7))
            drawn += 1
            trace(ctx, see, fiber, HOME[4], a.at, grow, 0.5, tone, t, 0)
            if (grow >= 1 && !calm) {
              const f = (t * 0.22 + i * 0.37 + k * 0.19) % 1
              dot(along(fiber, HOME[4], a.at, f), 1.7, 'rgba(255, 246, 224, 0.9)')
            }
          })
          const share = split[k].share
          body(ctx, see, a.at, 0.03 + 0.07 * Math.sqrt(share / top), tone, end * (calm ? 1 : 0.92 + 0.08 * Math.sin(t * 1.5 + k)), a.arms, scale)
        })
        ctx.globalCompositeOperation = 'source-over'
        if (w < 560) {
          // a phone: there is no room beside the bodies, so the answers are a short list across the top,
          // each with its share and the color of its body
          ctx.textAlign = 'left'
          const rowH = 34
          answers.forEach((_, k) => {
            const y = 84 + k * rowH  // below the title of the stage
            ctx.fillStyle = `rgba(2, 5, 10, ${0.78 * end})`
            ctx.fillRect(8, y - 22, w - 16, rowH - 4)
            ctx.fillStyle = `rgba(${HUES[k % HUES.length]}, ${end})`
            ctx.fillRect(8, y - 22, 3, rowH - 4)
            ctx.font = "200 24px 'Helvetica Neue', Helvetica, Arial, sans-serif"
            ctx.fillStyle = `rgba(245, 247, 251, ${end})`
            ctx.fillText(`${Math.round(split[k].share * 100)}%`, 18, y)
            ctx.font = "300 13px 'Helvetica Neue', Helvetica, Arial, sans-serif"
            ctx.fillStyle = `rgba(198, 206, 222, ${end})`
            ctx.fillText(wrapWords(ctx, split[k].label, w - 96, 1)[0] ?? '', 78, y - 2)
          })
        }
        ctx.textAlign = 'right'
        if (w >= 560) answers.forEach((a, k) => {
          const q = see(a.at)
          const x = q[0] - (0.03 + 0.07 * Math.sqrt(split[k].share / top)) * scale * 2.2 - 14
          ctx.font = "200 30px 'Helvetica Neue', Helvetica, Arial, sans-serif"
          ctx.fillStyle = `rgba(245, 247, 251, ${end})`
          ctx.fillText(`${Math.round(split[k].share * 100)}%`, x, q[1] + 2)
          ctx.font = "300 13px 'Helvetica Neue', Helvetica, Arial, sans-serif"
          ctx.fillStyle = `rgba(198, 206, 222, ${end})`
          wrapWords(ctx, split[k].label, Math.min(300, x - 24), 2).forEach((words, row) => ctx.fillText(words, x, q[1] + 22 + row * 16))
        })
      }
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
  }, [script, calm])

  const now = over ? null : script.steps[at]
  const line = now ?? script.steps[script.steps.length - 1]

  // the scene is the whole window, so it is drawn on the page itself, outside the paged area of a screen
  return createPortal(
    <section className={calm ? 'crew calm' : 'crew'} aria-labelledby="crew-h">
      <canvas ref={canvasRef} className="crew-scene" role="img"
        aria-label={`${script.cast[0]} sends ${script.cast[1]}, ${script.cast[2]} and ${script.cast[3]} to ${script.cast[4]}. Each line they say is listed after this picture.`} />
      <h1 id="crew-h">{script.title}</h1>
      <div className="crew-hud">
        {!calm && line && !over && (
          <p className="crew-say" key={at} aria-hidden="true">
            <span className="line-top">{script.cast[line.from]} to {script.cast[line.to]}</span>
            {line.say}
          </p>
        )}
        {!calm && (
          <div className="crew-ticks" role="group" aria-label="Go to one line">
            {script.steps.map((s, i) => (
              <button key={i} className={i < at ? 'tick done' : i === at ? 'tick now' : 'tick'} aria-label={`Line ${i + 1}: ${script.cast[s.from]} to ${script.cast[s.to]}`} onClick={() => setAt(i)} />
            ))}
          </div>
        )}
        {script.stats && script.stats.length > 0 && (
          <dl className="pair crew-stats">
            {script.stats.map((s) => (
              <div key={s.label} className={at >= s.at ? 'on' : undefined}>
                <dt>{s.label}</dt>
                <dd><Count to={s.value} state={calm || at > s.at ? 'done' : at === s.at ? 'run' : 'wait'} /></dd>
              </div>
            ))}
          </dl>
        )}
        <div className="actions crew-actions">
          {over
            ? <button className="primary" disabled={waiting} onClick={onDone}>{waiting ? 'Still working.' : doneLabel}</button>
            : <button className="secondary" onClick={() => setAt(script.steps.length)}>Skip</button>}
          {over && !calm && <button className="link" onClick={() => setAt(0)}>Watch it again</button>}
        </div>
        <ol className={calm ? 'crew-log' : 'crew-log sr-only'} aria-live="polite">
          {script.steps.slice(0, Math.min(at + 1, script.steps.length)).map((s, i) => (
            <li key={i} className={i === at ? 'now' : ''}>
              <span className="line-top">{script.cast[s.from]} to {script.cast[s.to]}</span>
              <span>{s.say}</span>
            </li>
          ))}
        </ol>
        <p className="fine">{script.note}</p>
      </div>
    </section>,
    document.body,
  )
}

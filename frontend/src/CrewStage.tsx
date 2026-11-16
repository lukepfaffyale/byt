import { useEffect, useState } from 'react'

import type { CrewScript } from './crewScripts'

const SPOT: [number, number][] = [[160, 30], [56, 112], [160, 112], [264, 112], [160, 196]]
const LINKS: [number, number][] = [[0, 1], [0, 2], [0, 3], [1, 4], [2, 4], [3, 4]]
const CLOUD: [number, number][] = [[-26, -6], [-14, 8], [-4, -10], [8, 6], [20, -6], [30, 8], [-34, 10], [0, 12]]
const PACE = 1150

/** Motion is off when the person turned it off in the game, or, if they never chose, when the device asks for less motion. */
function still(): boolean {
  try {
    const saved = localStorage.getItem('byt_motion')
    if (saved) return saved !== 'on'
  } catch {
    // no storage: fall through to the device setting
  }
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * A picture of a boss, its crew and who they reach, with each line they say. It plays one line at a time.
 * With motion turned off, every line is shown at once. The lines are also a list a screen reader can read.
 */
export function CrewStage(props: { script: CrewScript; doneLabel: string; onDone: () => void; waiting?: boolean }) {
  const { script, doneLabel, onDone, waiting } = props
  const [at, setAt] = useState(() => (still() ? script.steps.length : 0))
  const over = at >= script.steps.length
  const [calm] = useState(still)

  useEffect(() => {
    if (over) return
    const t = window.setTimeout(() => setAt((v) => v + 1), PACE)
    return () => window.clearTimeout(t)
  }, [at, over])

  const now = over ? null : script.steps[at]
  const lit = (a: number, b: number) => now !== null && ((now.from === a && now.to === b) || (now.from === b && now.to === a))

  return (
    <section className={calm ? 'crew calm' : 'crew'} aria-labelledby="crew-h">
      <h1 id="crew-h">{script.title}</h1>
      <svg className="crew-map" viewBox="0 0 320 232" role="img" aria-label={`${script.cast[0]} sends ${script.cast[1]}, ${script.cast[2]} and ${script.cast[3]} to ${script.cast[4]}.`}>
        {LINKS.map(([a, b]) => (
          <line key={`${a}-${b}`} x1={SPOT[a][0]} y1={SPOT[a][1]} x2={SPOT[b][0]} y2={SPOT[b][1]} className={lit(a, b) ? 'crew-link on' : 'crew-link'} />
        ))}
        {now && (
          <circle key={at} r="4" className="crew-pulse">
            <animate attributeName="cx" from={SPOT[now.from][0]} to={SPOT[now.to][0]} dur="0.9s" fill="freeze" />
            <animate attributeName="cy" from={SPOT[now.from][1]} to={SPOT[now.to][1]} dur="0.9s" fill="freeze" />
          </circle>
        )}
        {SPOT.map(([x, y], i) => {
          const speaking = now !== null && now.from === i
          const heard = now !== null && now.to === i
          return (
            <g key={i} className={`crew-node ${speaking ? 'speaking' : heard ? 'heard' : ''} ${i === 0 ? 'boss' : ''}`}>
              {i === 4 && !script.one
                ? CLOUD.map(([dx, dy], k) => <circle key={k} cx={x + dx} cy={y + dy} r="4" />)
                : <circle cx={x} cy={y} r={i === 0 ? 13 : 9} />}
              <text x={x} y={i === 4 ? y + 30 : y - (i === 0 ? 19 : 15)} textAnchor="middle">{script.cast[i]}</text>
            </g>
          )
        })}
      </svg>
      <div className="actions crew-actions">
        {over
          ? <button className="primary big" disabled={waiting} onClick={onDone}>{waiting ? 'Still working.' : doneLabel}</button>
          : <button className="secondary" onClick={() => setAt(script.steps.length)}>Skip</button>}
      </div>
      <ol className="crew-log" reversed aria-live="polite">
        {script.steps.map((s, i) => ({ s, i })).slice(0, Math.min(at + 1, script.steps.length)).reverse().map(({ s, i }) => (
          <li key={i} className={i === at ? 'now' : ''}>
            <span className="line-top">{script.cast[s.from]} to {script.cast[s.to]}</span>
            <span>{s.say}</span>
          </li>
        ))}
      </ol>
      <p className="fine">{script.note}</p>
    </section>
  )
}

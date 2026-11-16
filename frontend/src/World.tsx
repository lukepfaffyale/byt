import { useEffect, useState } from 'react'
import { api, type World } from './api'
import { Tabs } from './Deck'
import { still } from './motion'

type Node = 'twins' | 'agencies' | 'creators' | 'fund' | 'held' | 'game' | 'outside' | 'ai'
const NODE_OF: Record<string, Node> = {
  player: 'twins', agency: 'agencies', creator: 'creators', fund: 'fund', escrow: 'held', platform: 'game', samples: 'game',
  bank: 'outside', requesters: 'outside',
}
const NODES: Node[] = ['twins', 'agencies', 'creators', 'fund', 'held', 'game', 'outside', 'ai']
const NAME: Record<Node, string> = {
  twins: 'Twins', agencies: 'Agencies', creators: 'Creators', fund: 'Growth fund', held: 'Held for work', game: 'The game',
  outside: 'Outside', ai: 'AI',
}
const ABOUT: Record<Node, string> = {
  twins: 'Every twin and its owner. They earn here.',
  agencies: 'They pay twins for answers, post jobs and back skills.',
  creators: 'They build skill steps and earn when the steps are used.',
  fund: 'It pays every player who passes a skill step.',
  held: 'Credits an agency set aside for a job or a skill. What is not used goes back.',
  game: 'Fees for crews and claims, and the pay of free twins.',
  outside: 'Play credits that people added, and the first job requesters.',
  ai: 'An AI can plug in here: it would read what people checked, with their yes. This point is drawn, not built.',
}

/** The 16 corners of a tesseract. The 8 with an even number of minus signs hold the nodes; no two of those touch. */
const CORNERS: number[][] = Array.from({ length: 16 }, (_, i) => [0, 1, 2, 3].map((b) => ((i >> b) & 1 ? 1 : -1)))
const EDGES: [number, number][] = []
for (let a = 0; a < 16; a++) for (let b = a + 1; b < 16; b++) if (CORNERS[a].filter((v, k) => v !== CORNERS[b][k]).length === 1) EDGES.push([a, b])
const SEATS = CORNERS.map((c, i) => (c.filter((v) => v < 0).length % 2 === 0 ? i : -1)).filter((i) => i >= 0)

/** Turn a corner through two planes of four dimensions, then bring it down to the flat screen. */
function project(c: number[], t: number): [number, number, number] {
  const [x0, y0, z0, w0] = c
  const a = t * 0.31
  const b = t * 0.19
  const x = x0 * Math.cos(a) - w0 * Math.sin(a)
  const w = x0 * Math.sin(a) + w0 * Math.cos(a)
  const y = y0 * Math.cos(b) - z0 * Math.sin(b)
  const z = y0 * Math.sin(b) + z0 * Math.cos(b)
  const near4 = 1 / (3.6 - w)
  const near3 = 1 / (4 - z * near4 * 3)
  return [x * near4 * near3, y * near4 * near3, near4 * near3]
}

/**
 * The whole game as a graph inside a turning tesseract. Each corner that holds a node is a kind of wallet, and each
 * bright edge is credits that really moved between two of them. Tap a node to read it. Totals only: no person,
 * seat or answer is named.
 */
export function WorldView({ compact }: { compact?: boolean }) {
  const [world, setWorld] = useState<World | null>(null)
  const [t, setT] = useState(2.2)
  const [pick, setPick] = useState<Node | null>(null)
  const [why, setWhy] = useState('income')
  const calm = still()

  useEffect(() => {
    let cancelled = false
    const load = () => api.world().then((w) => { if (!cancelled) setWorld(w) }).catch(() => undefined)
    void load()
    const timer = window.setInterval(load, 10000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [])

  useEffect(() => {
    if (calm) return
    let raf = 0
    let last = performance.now()
    const step = (now: number) => {
      if (now - last > 40) {
        const gone = (now - last) / 1000
        setT((v) => v + gone)
        last = now
      }
      raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [calm])

  if (!world) return <p className="muted" aria-live="polite">Loading the world.</p>

  const links = new Map<string, { a: Node; b: Node; credits: number }>()
  for (const f of world.flows) {
    const a = NODE_OF[f.src]
    const b = NODE_OF[f.dst]
    if (!a || !b || a === b) continue
    const link = links.get(`${a}>${b}`) ?? { a, b, credits: 0 }
    link.credits += f.credits
    links.set(`${a}>${b}`, link)
  }
  const flows = [...links.values()]
  const top = Math.max(1, ...flows.map((l) => l.credits))
  const held = (n: Node) => Math.round(Object.entries(world.balances).filter(([k]) => NODE_OF[k] === n).reduce((sum, [, v]) => sum + v, 0))
  const twins = world.twins_members + world.twins_free + world.twins_forming
  const said = `${twins} twins, ${world.agencies} agencies and ${world.creators} creators. ${world.checked_answers} answers checked by their owners.`
  // fit every corner inside the frame, with room left for the names under the nodes
  const raw = CORNERS.map((c) => project(c, t))
  const fit = 1 / Math.max(...raw.map(([x, y]) => Math.max(Math.abs(x) / 138, Math.abs(y) / 112)))
  const at = raw.map(([x, y, depth]): [number, number, number] => [180 + x * fit, 142 + y * fit, depth])
  const spot = (n: Node) => at[SEATS[NODES.indexOf(n)]]
  const into = pick ? flows.filter((l) => l.b === pick) : []
  const out = pick ? flows.filter((l) => l.a === pick) : []

  return (
    <section className={calm ? 'world calm' : 'world'} aria-label="The world of BYT">
      {!compact && <p className="world-title">One economy. People and AI, each needing the other.</p>}
      <svg className="world-map" viewBox="0 0 360 300" role="img" aria-label={`A map of where credits move, drawn inside a turning four-sided cube. ${said}`}>
        {EDGES.map(([a, b]) => (
          <line key={`${a}-${b}`} className="world-lattice" x1={at[a][0]} y1={at[a][1]} x2={at[b][0]} y2={at[b][1]} />
        ))}
        {flows.map((l) => {
          const [x1, y1] = spot(l.a)
          const [x2, y2] = spot(l.b)
          const lit = !pick || l.a === pick || l.b === pick
          return (
            <g key={`${l.a}>${l.b}`} className={lit ? 'world-link' : 'world-link dim'}>
              <line className="world-flow" x1={x1} y1={y1} x2={x2} y2={y2} strokeWidth={0.6 + 2.2 * Math.sqrt(l.credits / top)} />
              {pick && lit && <text className="world-sub" x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 3} textAnchor="middle">{Math.round(l.credits)}</text>}
            </g>
          )
        })}
        <line className="world-socket" x1={spot('twins')[0]} y1={spot('twins')[1]} x2={spot('ai')[0]} y2={spot('ai')[1]} />
        {NODES.map((n) => {
          const [x, y, depth] = spot(n)
          const r = (n === 'twins' ? 10 : 6) * (0.55 + depth * 6)
          return (
            <g key={n} className={`world-node ${n}${pick === n ? ' on' : ''}`} opacity={0.6 + Math.min(0.4, depth * 4)}>
              <circle cx={x} cy={y} r={r} />
              <text x={x} y={y + r + 10} textAnchor="middle">{NAME[n]}</text>
            </g>
          )
        })}
      </svg>
      <div className="chips world-keys" role="group" aria-label="Read one part of the map">
        {NODES.map((n) => (
          <button key={n} className="chip" aria-pressed={pick === n} onClick={() => setPick(pick === n ? null : n)}>{NAME[n]}</button>
        ))}
      </div>
      <p className="world-pick" aria-live="polite">
        {pick ? (
          <>
            {ABOUT[pick]}
            {pick !== 'ai' && pick !== 'outside' && ` Holds ${held(pick)} credits.`}
            {into.length > 0 && ` In: ${into.map((l) => `${Math.round(l.credits)} from ${NAME[l.a].toLowerCase()}`).join(', ')}.`}
            {out.length > 0 && ` Out: ${out.map((l) => `${Math.round(l.credits)} to ${NAME[l.b].toLowerCase()}`).join(', ')}.`}
          </>
        ) : 'Every bright line is credits that really moved. Tap a name to follow it.'}
      </p>
      {compact ? (
        <dl className="pair world-pair">
          <div><dt>Twins</dt><dd>{twins}</dd></div>
          <div><dt>Checked answers</dt><dd>{world.checked_answers}</dd></div>
          <div><dt>Corrections</dt><dd>{world.corrections}</dd></div>
          <div><dt>Insights</dt><dd>{world.certs_insight}</dd></div>
        </dl>
      ) : (
        <>
          <Tabs label="Read the world" value={why} onChange={setWhy}
            tabs={[{ id: 'income', label: 'Income' }, { id: 'ai', label: 'For AI' }, { id: 'people', label: 'For people' },
              { id: 'now', label: 'Numbers' }, { id: 'real', label: 'Real today' }]} />
          {why === 'now' ? (
            <dl className="pair world-pair">
              <div><dt>Twins</dt><dd>{twins}</dd><dd className="muted">{world.twins_members} earn · {world.twins_free} free</dd></div>
              <div><dt>Checked</dt><dd>{world.checked_answers}</dd><dd className="muted">{world.corrections} corrected</dd></div>
              <div><dt>Insights</dt><dd>{world.certs_insight}</dd><dd className="muted">new things found</dd></div>
              <div><dt>Seats</dt><dd>{world.agencies + world.creators}</dd><dd className="muted">{world.open_jobs} open {world.open_jobs === 1 ? 'job' : 'jobs'} · {world.built_steps} {world.built_steps === 1 ? 'step' : 'steps'}</dd></div>
              <div><dt>AI runs</dt><dd>{world.agent_runs}</dd><dd className="muted">${world.agent_cost_usd.toFixed(3)} real cost</dd></div>
            </dl>
          ) : (
            <p className="world-say">
              {why === 'income' && 'Your twin earns when it answers for you and you check it. There are no odds and no bets. Nothing here asks you to beat a machine at its own game.'}
              {why === 'ai' && `An AI can guess what most people want. It cannot know when it is wrong about you. ${world.checked_answers} checked answers, ${world.corrections} corrections and ${world.certs_insight} insights are that proof so far, each given with a yes from a living person.`}
              {why === 'people' && 'The same AI can then make things that fit real people, and the people who taught it are paid and keep the say. Agencies pay for answers. Creators are paid when their skills are used. The growth fund pays you for getting better.'}
              {why === 'real' && 'Every bright line on the map is a real move in the books of this game. The credits are play money, and this is a class project. The AI point is drawn, not built.'}
            </p>
          )}
        </>
      )}
    </section>
  )
}

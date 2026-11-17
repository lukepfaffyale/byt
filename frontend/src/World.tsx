import { useEffect, useState } from 'react'
import { api, type World } from './api'
import { Tabs } from './Deck'
import { still } from './motion'
import { WorldField } from './WorldField'

type Node = 'twins' | 'agencies' | 'creators' | 'fund' | 'held' | 'game' | 'outside' | 'ai'
const NODE_OF: Record<string, Node> = {
  player: 'twins', agency: 'agencies', creator: 'creators', fund: 'fund', escrow: 'held', platform: 'game', samples: 'game',
  bank: 'outside', requesters: 'outside',
}
const NODES: Node[] = ['twins', 'agencies', 'creators', 'fund', 'held', 'game', 'outside', 'ai']
const NAME: Record<Node, string> = {
  twins: 'Syms', agencies: 'Agencies', creators: 'Creators', fund: 'Growth fund', held: 'Held for work', game: 'The game',
  outside: 'Outside', ai: 'AI',
}
const NAMES = NODES.map((n) => NAME[n])
const SOCKET: [number, number] = [NODES.indexOf('twins'), NODES.indexOf('ai')]
const ABOUT: Record<Node, string> = {
  twins: 'Every Sym and its owner. They earn here.',
  agencies: 'They pay Syms for answers, post jobs and back skills.',
  creators: 'They build skill steps and earn when the steps are used.',
  fund: 'It pays every player who passes a skill step.',
  held: 'Credits an agency set aside for a job or a skill. What is not used goes back.',
  game: 'Fees for crews and claims, and the pay of free Syms.',
  outside: 'Play credits that people added, and the first job requesters.',
  ai: 'An AI can plug in here: it would read what people checked, with their yes. This path is drawn part of the way, and is not built.',
}

/**
 * The whole game as nerve cells in a large dark. Each body is a kind of wallet, and each path between two of them
 * is credits that really moved. A path is forged when the map opens: it searches, then connects, then carries
 * signals. Tap a name to read it. Totals only: no person, seat or answer is named.
 */
export function WorldView({ compact, split }: { compact?: boolean; split?: boolean }) {
  const [world, setWorld] = useState<World | null>(null)
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
  const held = (n: Node) => Math.round(Object.entries(world.balances).filter(([k]) => NODE_OF[k] === n).reduce((sum, [, v]) => sum + v, 0))
  const twins = world.twins_members + world.twins_free + world.twins_forming
  const said = `${twins} Syms, ${world.agencies} agencies and ${world.creators} creators. ${world.checked_answers} answers checked by their owners.`
  const into = pick ? flows.filter((l) => l.b === pick) : []
  const out = pick ? flows.filter((l) => l.a === pick) : []

  if (split) {
    // inside the Everyone screen: the map goes on one side, and the reading of it on the other
    return (
      <>
        <div className="commons-view">
          <WorldField names={NAMES} socket={SOCKET} calm={calm} pick={pick ? NODES.indexOf(pick) : null}
            flows={flows.map((l) => ({ a: NODES.indexOf(l.a), b: NODES.indexOf(l.b), credits: l.credits }))}
            label={`A map of where credits move, drawn as paths between cell bodies in space. ${said}`} />
        </div>
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
          ) : 'Every path is credits that really moved between kinds of wallet. The credits are play money. The path to AI is drawn, not built. Tap a name to follow it.'}
        </p>
        <dl className="pair world-pair">
          <div><dt>Checked</dt><dd>{world.checked_answers}</dd><dd className="muted">{world.corrections} corrected</dd></div>
          <div><dt>Insights</dt><dd>{world.certs_insight}</dd><dd className="muted">new things found</dd></div>
          <div><dt>AI runs</dt><dd>{world.agent_runs}</dd><dd className="muted">${world.agent_cost_usd.toFixed(3)} real cost</dd></div>
        </dl>
      </>
    )
  }

  return (
    <section className={calm ? 'world calm' : 'world'} aria-label="The world of BYT">
      {!compact && <p className="world-title">One economy. People and AI, each needing the other.</p>}
      <WorldField names={NAMES} socket={SOCKET} calm={calm} pick={pick ? NODES.indexOf(pick) : null}
        flows={flows.map((l) => ({ a: NODES.indexOf(l.a), b: NODES.indexOf(l.b), credits: l.credits }))}
        label={`A map of where credits move, drawn as paths between cell bodies in space. ${said}`} />
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
        ) : 'Every path is credits that really moved. Tap a name to follow it.'}
      </p>
      {compact ? (
        <dl className="pair world-pair">
          <div><dt>Syms</dt><dd>{twins}</dd></div>
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
              <div><dt>Syms</dt><dd>{twins}</dd><dd className="muted">{world.twins_members} earn · {world.twins_free} free</dd></div>
              <div><dt>Checked</dt><dd>{world.checked_answers}</dd><dd className="muted">{world.corrections} corrected</dd></div>
              <div><dt>Insights</dt><dd>{world.certs_insight}</dd><dd className="muted">new things found</dd></div>
              <div><dt>Seats</dt><dd>{world.agencies + world.creators}</dd><dd className="muted">{world.open_jobs} open {world.open_jobs === 1 ? 'job' : 'jobs'} · {world.built_steps} {world.built_steps === 1 ? 'step' : 'steps'}</dd></div>
              <div><dt>AI runs</dt><dd>{world.agent_runs}</dd><dd className="muted">${world.agent_cost_usd.toFixed(3)} real cost</dd></div>
            </dl>
          ) : (
            <p className="world-say">
              {why === 'income' && 'Your Sym earns when it answers for you and you check it. There are no odds and no bets. Nothing here asks you to beat a machine at its own game.'}
              {why === 'ai' && `An AI can guess what most people want. It cannot know when it is wrong about you. ${world.checked_answers} checked answers, ${world.corrections} corrections and ${world.certs_insight} insights are that proof so far, each given with a yes from a living person.`}
              {why === 'people' && 'The same AI can then make things that fit real people, and the people who taught it are paid and keep the say. Agencies pay for answers. Creators are paid when their skills are used. The growth fund pays you for getting better.'}
              {why === 'real' && 'Every path on the map is a real move in the books of this game. The credits are play money, and this is a class project. The AI path is drawn, not built.'}
            </p>
          )}
        </>
      )}
    </section>
  )
}

import { useEffect, useState } from 'react'
import { api, type Brief, type Creator, type Meets } from './api'
import { CrewStage } from './CrewStage'
import { buildScript, claimScript, groupScript, meetScript, type CrewScript } from './crewScripts'
import { MeetPanel, MetList } from './Meet'
import { More } from './More'
import { Tabs } from './Deck'
import { usePager } from './pager'
import { Rows } from './Rows'
import { Readout } from './Readout'
import { WalletCard } from './WalletCard'

export type SeatView = 'desk' | 'results' | 'money'
type Task = 'survey' | 'test' | 'skill' | 'make' | 'meet'

const TASKS: [Task, string, string][] = [
  ['survey', 'Ask a group', 'One question to a whole group. You see totals.'],
  ['test', 'Test a skill', 'See how strong a group is in one skill. You see totals.'],
  ['skill', 'Claim a step', 'Take a waiting step, so it is yours to build.'],
  ['make', 'Build my step', 'Pick the cards for a step you claimed. Then players can play it.'],
  ['meet', 'Meet one Sym', 'Pay a royalty to see one Sym and who it is.'],
]

export function SplitBars({ rows }: { rows: { label: string; share: number }[] }) {
  return (
    <ul className="bars split-bars">
      {rows.map((row) => (
        <li key={row.label} className="bar">
          <span className="bar-head as-row">
            <span className="bar-name">{row.label}</span>
            <span className="bar-n">{Math.round(row.share * 100)}</span>
            <span className="meter" aria-hidden="true"><span style={{ width: `${row.share * 100}%` }} /></span>
          </span>
        </li>
      ))}
    </ul>
  )
}

/** The seat for people who make skills. Everything is a tap: pick a job, pick from the lists, send the crew. */
export function CreatorDesk(props: { view: SeatView; onView: (view: SeatView) => void; announce: (text: string) => void }) {
  const { view, onView, announce } = props
  const [seat, setSeat] = useState<Creator | null>(null)
  const [meets, setMeets] = useState<Meets | null>(null)
  const [error, setError] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [task, setTask] = useState<Task>('skill')
  const [topic, setTopic] = useState<string | null>(null)
  const [group, setGroup] = useState('all')
  const [got, setGot] = useState<'briefs' | 'met'>('briefs')
  const back = usePager(seat?.briefs ?? [], 2, 'briefs')
  const [cards, setCards] = useState<string[]>([])
  const [replay, setReplay] = useState<CrewScript | null>(null)

  function fail(e: unknown) {
    setError(e instanceof Error ? e.message : 'There was a problem. Please try again.')
    setBusy(false)
  }

  useEffect(() => {
    let cancelled = false
    api
      .creator()
      .then((mine) => {
        if (cancelled) return
        setSeat(mine)
        if (mine.exists) return api.meets('creator').then((m) => { if (!cancelled) setMeets(m) })
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'There was a problem. Please try again.')
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (!seat) return error ? <p className="error" role="alert">{error}</p> : <p className="muted" aria-live="polite">Loading.</p>

  if (!seat.exists) {
    return (
      <section aria-labelledby="creator-h" className="mine">
        <h1 id="creator-h">You can also be the one who makes skills.</h1>
        <p className="lead">Open a creator seat. Send your crew to learn what Syms need.</p>
        {error && <p className="error" role="alert">{error}</p>}
        <form onSubmit={(e) => {
          e.preventDefault()
          setBusy(true)
          api
            .openCreator(name.trim())
            .then((mine) => {
              setSeat(mine)
              setBusy(false)
              return api.meets('creator').then(setMeets)
            })
            .catch(fail)
        }}>
          <label htmlFor="creator-name">Creator name (made up, not a real company)</label>
          <input id="creator-name" value={name} onChange={(e) => setName(e.target.value)} minLength={2} maxLength={30}
            pattern="[A-Za-z0-9][A-Za-z0-9 _\-&]*" required autoComplete="off" />
          <button className="primary big" disabled={busy || name.trim().length < 2}>Open my creator seat</button>
        </form>
        <More>
          The name is the only thing you type. After that, everything is a tap. Your wallet starts empty: add play
          credits on My Money. Other seats see only how many creators there are, never a name.
        </More>
      </section>
    )
  }

  if (replay) {
    return <CrewStage script={replay} doneLabel="See what came back" onDone={() => { setReplay(null); onView('results') }} />
  }

  function sent(out: Creator, script: (b: Brief) => CrewScript) {
    setSeat(out)
    setBusy(false)
    setError('')
    setTopic(null)
    setCards([])
    announce('Your crew is back.')
    setReplay(script(out.briefs[0]))
  }

  function send() {
    if (!seat || !task || task === 'meet' || task === 'make' || !topic) return
    setBusy(true)
    const boss = seat.name
    if (task === 'skill') {
      const skill = seat.skills.find((s) => s.id === topic)
      api.brief('skill', topic, 'all')
        .then((out) => sent(out, (b) => claimScript({ boss, skill: skill?.name ?? '', step: skill?.waiting[0] ?? '', fee: b.spent })))
        .catch(fail)
      return
    }
    api.brief(task, topic, group)
      .then((out) => sent(out, (b) => groupScript({
        boss, what: b.title, group: b.audience, twins: b.twins, samples: b.sample_twins, spent: b.spent, fee: b.fee, extra: 0, min: seat.min_twins, test: b.kind === 'test',
      })))
      .catch(fail)
  }

  const audiences = (
    <div className="chips" role="group" aria-label="Who to ask">
      <span className="chips-label">Who to ask</span>
      {seat.audiences.filter((a) => !a.id.startsWith('view-')).map((a) => (
        <button key={a.id} className="chip" aria-pressed={group === a.id} onClick={() => setGroup(a.id)}>{a.name}</button>
      ))}
    </div>
  )
  const picked = seat.skills.find((s) => s.id === topic)
  const pack = task === 'make' ? seat.packs.find((p) => p.id === topic) : undefined

  function build() {
    if (!seat || !pack || cards.length !== seat.step_cards) return
    setBusy(true)
    const boss = seat.name
    const step = pack.step
    const royalty = seat.step_royalty
    api.buildStep(pack.id, cards)
      .then((out) => sent(out, (b) => buildScript({ boss, step, cards: cards.length, fee: b.spent, royalty })))
      .catch(fail)
  }

  return (
    <section aria-labelledby="creator-h" className="mine">
      <h1 id="creator-h" className="sr-only">Creator studio</h1>
      <Readout value={seat.budget} label={<>credits in my wallet · {seat.name}</>} />
      {error && <p className="error" role="alert">{error}</p>}

      {view === 'desk' && (
        <>
          {seat.needs.length > 0 && (
            <ul className="lines">
              {seat.needs.map((n) => (
                <li key={n.skill} className="gold">
                  <span className="line-top">Agencies are paying for this skill</span>
                  <span>{n.name} · {n.left} credits left</span>
                  <span className="muted">{n.built ? 'A step is built. Each pass pays the player and its creator.' : 'No step is built yet. Claim one and build it.'}</span>
                </li>
              ))}
            </ul>
          )}
          {seat.wanted.length > 0 && (
            <>
              <p className="line-top">What agencies are asking about</p>
              <Rows pageKey="wanted" size={3} wide empty="" rows={seat.wanted.map((w) => ({
                id: w.skill, top: `${w.agencies} ${w.agencies === 1 ? 'agency' : 'agencies'}`, label: w.name, gold: w.waiting > 0,
                n: w.waiting > 0 ? `${w.waiting} to build` : w.built ? 'built' : '',
                detail: <>{w.agencies} {w.agencies === 1 ? 'agency has' : 'agencies have'} asked about this skill, through a question, a job or by backing it. {w.waiting > 0 ? `${w.waiting} of its steps ${w.waiting === 1 ? 'is' : 'are'} still waiting for a creator.` : 'Every step of it that can be built is built.'} You never see which agency.</>,
              }))} />
              {seat.emerging.map((p) => (
                <p key={p.a + p.b} className="fine">New need: {p.agencies} agencies want {p.a} and {p.b} together.</p>
              ))}
            </>
          )}
          <Tabs label="What my crew does" value={task} onChange={(id) => { setTask(id); setTopic(null); setCards([]); setError('') }}
            tabs={TASKS.map(([id, label]) => ({ id, label }))} />
          <p className="fine">{TASKS.find(([id]) => id === task)?.[2]}</p>

          {task === 'survey' && (
            <>
              <div className="chips" role="group" aria-label="Pick a question">
                <span className="chips-label">Which question</span>
                {seat.questions.map((q) => (
                  <button key={q.id} className="chip wide" aria-pressed={topic === q.id} onClick={() => setTopic(q.id)}>
                    <span className="chip-kind">{q.kind}</span> {q.question}
                  </button>
                ))}
              </div>
              {topic && audiences}
            </>
          )}

          {task === 'test' && (
            <>
              <div className="chips" role="group" aria-label="Pick a skill">
                <span className="chips-label">Which skill</span>
                {seat.skills.map((s) => (
                  <button key={s.id} className="chip" aria-pressed={topic === s.id} onClick={() => setTopic(s.id)}>{s.name}</button>
                ))}
              </div>
              {topic && audiences}
            </>
          )}

          {task === 'skill' && (
            <>
              <div className="chips" role="group" aria-label="Pick a skill">
                <span className="chips-label">Which skill</span>
                {seat.skills.map((s) => (
                  <button key={s.id} className="chip" aria-pressed={topic === s.id} disabled={s.waiting.length === 0} onClick={() => setTopic(s.id)}>
                    {s.name} · {s.waiting.length} waiting
                  </button>
                ))}
              </div>
              {picked && <p className="fine">Next waiting step: {picked.waiting[0]}. Claiming it costs {seat.claim_fee} credits. Then you build it.</p>}
            </>
          )}

          {task === 'make' && (
            <>
              {seat.packs.length === 0 && <p className="fine">You have no step to build. Claim a skill step first.</p>}
              {seat.packs.length > 0 && (
                <div className="chips" role="group" aria-label="Pick a step to build">
                  <span className="chips-label">Which step</span>
                  {seat.packs.map((p) => (
                    <button key={p.id} className="chip" aria-pressed={topic === p.id} onClick={() => { setTopic(p.id); setCards([]) }}>{p.skill} · {p.step}</button>
                  ))}
                </div>
              )}
              {pack && (
                <>
                  <div className="chips" role="group" aria-label={`Tap ${seat.step_cards} cards for this step`}>
                    <span className="chips-label" aria-live="polite">Tap {seat.step_cards} cards · {cards.length} picked</span>
                    {pack.cards.map((c) => {
                      const on = cards.includes(c.id)
                      return (
                        <button key={c.id} className="chip wide" aria-pressed={on} disabled={!on && cards.length >= seat.step_cards}
                          onClick={() => setCards(on ? cards.filter((x) => x !== c.id) : [...cards, c.id])}>
                          {c.prompt} <span className="muted">{c.options.join(' / ')}</span>
                        </button>
                      )
                    })}
                  </div>
                  <p className="fine">Building costs {seat.crew_fee} credits. You earn {seat.step_royalty} credits each time another player passes your step.</p>
                  <button className="primary big" disabled={busy || cards.length !== seat.step_cards} onClick={build}>Send my crew to build it</button>
                </>
              )}
            </>
          )}

          {task && task !== 'meet' && task !== 'make' && topic && (
            <>
              {task !== 'skill' && (
                <p className="fine">Each Sym that answers gets {seat.pay} credit. Your crew costs {seat.crew_fee} credits. You pay only if {seat.min_twins} or more Syms match.</p>
              )}
              <button className="primary big" disabled={busy} onClick={send}>Send my crew</button>
            </>
          )}

          {task === 'meet' && meets && (
            <MeetPanel seat="creator" meets={meets} onError={fail}
              onMet={(out, groupName) => {
                setMeets(out)
                setError('')
                api.creator().then(setSeat).catch(fail)
                announce('Your crew met one Sym.')
                setReplay(meetScript({ boss: seat.name, group: groupName, nickname: out.met[0]?.nickname ?? '', price: out.price, fee: out.fee }))
              }} />
          )}
          <More>
            You never type a question. You pick from lists, so no one can ask for something private. Your crew is a
            computer program, not AI, so there is no AI cost. You pay a small crew fee to the game. For a group you
            see totals only, and only when at least {seat.min_twins} Syms match. A skill step is built from cards
            the game wrote. You pick which ones. You do not see the right answers.
          </More>
        </>
      )}

      {view === 'results' && (
        <>
          {seat.briefs.length === 0 && (!meets || meets.met.length === 0) && <p className="fine">Nothing has come back yet. Send your crew from My Studio.</p>}
          <Tabs label="What came back" value={got} onChange={setGot}
            tabs={[{ id: 'briefs', label: 'From my crew', n: seat.briefs.length }, { id: 'met', label: 'Syms met', n: meets?.met.length ?? 0 }]} />
          {got === 'briefs' && <ul className="lines">
            {back.rows.map((b) => (
              <li key={b.created_at + b.title}>
                <span className="line-top">{b.kind === 'skill' || b.kind === 'build' ? 'Skill' : b.kind === 'test' ? 'Test' : 'Question'} · {b.audience}{b.twins > 0 ? ` · ${b.twins} Syms` : ''} · {b.spent} credits</span>
                <span>{b.title}</span>
                {b.split.length > 0 && <SplitBars rows={b.split} />}
                <span className="muted">{b.note || `${b.sample_twins} of the ${b.twins} Syms are free Syms with no name. Some are made up, to fill the game while it is small.`}</span>
              </li>
            ))}
          </ul>}
          {got === 'briefs' && back.pager}
          {got === 'met' && meets && <MetList meets={meets} />}
        </>
      )}

      {view === 'money' && (
        <>
          <WalletCard key={seat.briefs.length + (meets?.met.length ?? 0)} seat="creator" onChange={() => { api.creator().then(setSeat).catch(fail) }} />
          <p className="fine">
            {seat.reach_earned} credits from agencies that reached my players. {seat.sponsor_earned} from agencies that back my skills.
            {seat.made.length === 0 ? ` Build a skill step to earn ${seat.step_royalty} credits each time another player passes it.` : ` ${seat.made.reduce((n, m) => n + m.passes, 0)} passes of the steps I built. You never see who.`}
          </p>
        </>
      )}
    </section>
  )
}

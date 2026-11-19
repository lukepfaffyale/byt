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
import { Failed } from './Retry'
import { CueSlot, SymCue } from './SymCue'
import { Worth } from './Worth'
import { still } from './motion'
import { credits } from './words'

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
  const [picking, setPicking] = useState(false)  // the pop-out where the creator taps the cards
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

  if (!seat) return error ? <Failed error={error} /> : <p className="muted" aria-live="polite">Loading.</p>

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

  function build(picks: string[] = cards) {
    if (!seat || !pack || picks.length !== seat.step_cards) return
    setBusy(true)
    const boss = seat.name
    const step = pack.step
    const royalty = seat.step_royalty
    api.buildStep(pack.id, picks)
      .then((out) => sent(out, (b) => buildScript({ boss, step, cards: picks.length, fee: b.spent, royalty })))
      .catch(fail)
  }

  // what the crew asks for: one line and one tap. Code writes it from this studio's own counts; no model does.
  const start = (to: Task, what: string | null) => {
    onView('desk')
    setTask(to)
    setTopic(what)
    setCards([])
    setError('')
  }
  const open = seat.skills.find((s) => s.waiting.length > 0)
  const paid = seat.needs.find((n) => !n.built && (seat.skills.find((s) => s.id === n.skill)?.waiting.length ?? 0) > 0)
  // what to build, from where Syms stand: the skill most Syms are new to that still has a step to claim,
  // and the skill most are already strong in. Counts of Syms only.
  const weak = [...seat.skills].filter((s) => s.waiting.length > 0).sort((a, b) => b.new - a.new)[0]
  const best = [...seat.skills].sort((a, b) => b.strong - a.strong)[0]
  const waiting = seat.skills.reduce((n, s) => n + s.waiting.length, 0)
  const passes = seat.made.reduce((n, m) => n + m.passes, 0)
  const earned = seat.made.reduce((n, m) => n + m.earned, 0)
  const cue: { say: string; go?: string; act?: () => void; alt?: string; altAct?: () => void } =
    task === 'make' && pack
      ? cards.length === seat.step_cards
        ? { say: `That is all ${seat.step_cards} cards. Send us, and we build ${pack.step}.`, go: 'Build it', act: () => build(), alt: 'Change my picks', altAct: () => setPicking(true) }
        : { say: `${pack.step} needs ${seat.step_cards} cards. Who picks them? If we pick, we build it right away. Building costs ${seat.crew_fee} credits.`,
            go: 'You pick', act: () => build(pack.cards.map((c) => c.id).slice(0, seat.step_cards)), alt: 'I pick', altAct: () => setPicking(true) }
      : task === 'skill' && picked && picked.waiting.length > 0
        ? { say: `${picked.waiting[0]} is free to claim. ${seat.claim_fee} credits, and it is yours to build.`, go: 'Send my crew', act: send }
        : seat.packs.length > 0
          ? { say: `You claimed ${seat.packs[0].step}. Tap ${seat.step_cards} cards, and we build it. Each pass pays you ${seat.step_royalty} credits.`, go: 'Build my step', act: () => start('make', seat.packs[0].id) }
          : seat.budget < seat.claim_fee
            ? { say: `Your wallet holds ${seat.budget} credits, and a claim costs ${seat.claim_fee}. Add play credits, and we start.`, go: 'My money', act: () => onView('money') }
            : paid
              ? { say: `Agencies have put ${paid.left} credits behind ${paid.name}, and no step is built. Claim one, and that pay is yours to earn.`, go: `Claim: ${paid.name}`, act: () => start('skill', paid.skill) }
              : weak && weak.new > 0
                ? { say: `${weak.new} of ${weak.new + weak.partway + weak.strong} Syms are new to ${weak.name}, and its next step is not built. Build it, and they have a way to grow. Each pass pays you ${seat.step_royalty} credits.`, go: `Build for: ${weak.name}`, act: () => start('skill', weak.id) }
              : open
                ? { say: `${waiting} ${waiting === 1 ? 'step is' : 'steps are'} waiting for a creator. Claim ${open.waiting[0]} in ${open.name}, and we start.`, go: `Claim: ${open.waiting[0]}`, act: () => start('skill', open.id) }
                : seat.made.length > 0
                  ? { say: `Your steps were passed ${passes} ${passes === 1 ? 'time' : 'times'} and earned ${earned} credits. Ask a group what they need next.`, go: 'Ask a group', act: () => start('survey', null) }
                  : { say: 'Send us out with one question, and we find what Syms need.', go: 'Ask a group', act: () => start('survey', null) }

  // on the results page the crew says what the studio's work has paid, then asks for the next thing to build
  const paidOut = {
    say: `${seat.made.length > 0 ? `Your steps were passed ${passes} ${passes === 1 ? 'time' : 'times'} and earned you ${credits(earned)} credits. Each pass paid the player too.` : `We have run ${seat.briefs.length} ${seat.briefs.length === 1 ? 'errand' : 'errands'} for you. Nothing you built has been passed yet.`} What do we build next?`,
    go: seat.packs.length > 0 ? 'Build my step' : open ? `Claim: ${open.waiting[0]}` : 'Ask a group',
    act: () => (seat.packs.length > 0 ? start('make', seat.packs[0].id) : open ? start('skill', open.id) : start('survey', null)),
  }

  return (
    <section aria-labelledby="creator-h" className="mine">
      <h1 id="creator-h" className="sr-only">Creator studio</h1>
      {view === 'results' && got === 'briefs' && (
        <>
          <CueSlot><SymCue who="My crew" crew rgb="134, 211, 230" say={paidOut.say} go={paidOut.go} act={paidOut.act} calm={still()} formed={0.6} /></CueSlot>
          {seat.briefs.length > 0 && <Worth seat="creator" moment="studio" who="My crew" />}
        </>
      )}
      {view === 'desk' && (
        <CueSlot><SymCue who="My crew" crew rgb="134, 211, 230" say={cue.say} go={busy ? undefined : cue.go} act={cue.act} alt={busy ? undefined : cue.alt} altAct={cue.altAct} calm={still()} formed={0.6}
          more={[...(best && best.strong > 0 ? [`${best.strong} Syms are already strong in ${best.name}. A harder step there keeps them growing.`] : []), 'Each step you build lets every Sym do more, and pays you each time one passes.', `You have ${seat.budget} credits in your wallet.`, 'The game adds 10 percent on top of what a crew job pays out. That is how it earns.']} /></CueSlot>
      )}
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
              {pack && <p className="fine">Building costs {seat.crew_fee} credits. You earn {seat.step_royalty} credits each time another player passes your step. Tell the crew above who picks the cards.</p>}
              {pack && picking && (
                <div className="pick-pop" role="dialog" aria-modal="true" aria-label={`Pick ${seat.step_cards} cards for ${pack.step}`}
                  onKeyDown={(e) => { if (e.key === 'Escape') setPicking(false) }} onClick={(e) => { if (e.target === e.currentTarget) setPicking(false) }}>
                  <div className="pick-pop-box">
                    <span className="line-top" aria-live="polite">{pack.step} · tap {seat.step_cards} cards · {cards.length} picked</span>
                    <div className="chips pick-pop-cards" role="group" aria-label="The cards to pick from">
                      {pack.cards.map((c, i) => {
                        const on = cards.includes(c.id)
                        return (
                          <button key={c.id} className="chip wide" aria-pressed={on} autoFocus={i === 0} disabled={!on && cards.length >= seat.step_cards}
                            onClick={() => setCards(on ? cards.filter((x) => x !== c.id) : [...cards, c.id])}>
                            {c.prompt} <span className="muted">{c.options.join(' / ')}</span>
                          </button>
                        )
                      })}
                    </div>
                    <div className="pick-pop-foot">
                      <button className="link" onClick={() => setPicking(false)}>Close</button>
                      <button className="primary" disabled={busy || cards.length !== seat.step_cards} onClick={() => { setPicking(false); build() }}>Build it</button>
                    </div>
                  </div>
                </div>
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

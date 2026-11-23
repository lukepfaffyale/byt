import { useEffect, useState } from 'react'
import { madeUpName } from './names'
import { api, type Agency, type Meets } from './api'
import { SplitBars, type SeatView } from './CreatorDesk'
import { CrewStage } from './CrewStage'
import { Tabs } from './Deck'
import { groupScript, meetScript, postScript, type CrewScript } from './crewScripts'
import { MeetPanel, MetList } from './Meet'
import { More } from './More'
import { usePager } from './pager'
import { WalletCard } from './WalletCard'
import { Failed } from './Retry'
import { CueSlot, SymCue } from './SymCue'
import { Worth } from './Worth'
import { still } from './motion'
import { credits } from './words'

/** Short names for the chips, so the three choices of a question fit one page. The full name is read out. */
const TIER_SHORT: Record<string, string> = { blend: 'Free and members', members: 'Members only', core: 'With a certificate' }
const STRONG = 'Strongest style: '
const VIEW = 'Has a view on: '
const many = (n: number, one: string, more = `${one}s`) => `${n} ${n === 1 ? one : more}`

/**
 * The agency's desk. `syms` and `people` are the one true count of the game (every Sym, and the people among
 * them), so the crew can say how many of them can answer today. `onAsked` tells the shell which group a crew
 * just came back from, so the sphere can hold it in the light.
 */
export function AgencyDesk(props: { announce: (text: string) => void; view: SeatView; onView: (view: SeatView) => void; ask?: string; syms?: number; people?: number; onAsked?: (group: string) => void; onMoney?: () => void }) {
  const { announce, view, onView, ask, syms = 0, people = 0, onAsked, onMoney } = props
  const [agency, setAgency] = useState<Agency | null>(null)
  const [error, setError] = useState('')
  const [name, setName] = useState(() => madeUpName('Agency'))
  const [question, setQuestion] = useState<string | null>(null)
  const [audience, setAudience] = useState(ask && ask !== 'members' && ask !== 'certified' ? ask : 'all')
  const [depth, setDepth] = useState('blend')
  const [mode, setMode] = useState<'ask' | 'job' | 'skill' | 'one'>('ask')
  const [pay, setPay] = useState(1)
  const [busy, setBusy] = useState(false)
  const [meets, setMeets] = useState<Meets | null>(null)
  const [jobQ, setJobQ] = useState<string | null>(null)
  const [jobPay, setJobPay] = useState(20)
  const [jobSeats, setJobSeats] = useState(5)
  const [skill, setSkill] = useState<string | null>(null)
  const [stake, setStake] = useState(50)
  const [replay, setReplay] = useState<CrewScript | null>(null)
  const [asked, setAsked] = useState<string | null>(null)  // the group the crew is out asking now
  const [got, setGot] = useState<'asks' | 'jobs' | 'skills' | 'met'>('asks')
  const [note, setNote] = useState('')  // what just happened on a results tab, said by the crew
  const asks = usePager(agency?.campaigns ?? [], 1, `asks-${agency?.campaigns.length ?? 0}`)
  const jobsBack = usePager(agency?.postings ?? [], 1, `jobs-${agency?.postings.length ?? 0}`)
  const backed = usePager(agency?.sponsorships ?? [], 4, 'skills')
  const metBack = usePager(meets?.met ?? [], 1, `met-${meets?.met.length ?? 0}`)

  useEffect(() => {
    let cancelled = false
    api
      .agency()
      .then((a) => {
        if (cancelled) return
        setAgency(a)
        if (a.exists) return api.meets('agency').then((m) => { if (!cancelled) setMeets(m) })
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'There was a problem. Please try again.')
      })
    return () => {
      cancelled = true
    }
  }, [])

  // a message about something that did not work is about the choices as they were: a new choice clears it
  useEffect(() => { setError('') }, [question, audience, pay, depth, mode, jobQ, jobPay, jobSeats, skill, stake])

  function done(a: Agency, said: string) {
    setAgency(a)
    setBusy(false)
    setError('')
    onMoney?.()
    announce(said)
  }

  function fail(e: unknown) {
    setError(e instanceof Error ? e.message : 'There was a problem. Please try again.')
    setBusy(false)
  }

  function open(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    api.openAgency(name.trim()).then((a) => { done(a, 'Your agency is open.'); return api.meets('agency').then(setMeets) }).catch(fail)
  }

  function run() {
    if (!question) return
    setBusy(true)
    api
      .runCampaign(question, audience, pay, depth)
      .then((a) => {
        done(a, `You asked ${many(a.campaigns[0]?.twins ?? 0, 'Sym')}.`)
        setQuestion(null)
        setGot('asks')
        const c = a.campaigns[0]
        setAsked(c ? c.group || 'all' : null)
        if (c) setReplay(groupScript({ boss: a.name, what: c.question, group: c.audience, twins: c.twins, samples: c.sample_twins,
          spent: c.spent, fee: 0, extra: c.extra, min: a.min_twins, split: c.split }))
        else onView('results')
      })
      .catch(fail)
  }

  function post() {
    if (!jobQ) return
    setBusy(true)
    api
      .postJob(jobQ, jobPay, jobSeats)
      .then((a) => {
        done(a, 'Your job is posted.')
        setJobQ(null)
        setGot('jobs')
        const p = a.postings[0]
        if (p) setReplay(postScript({ boss: a.name, what: p.question, pay: p.pay, seats: p.seats, held: p.held }))
      })
      .catch(fail)
  }

  function back() {
    if (!skill) return
    setBusy(true)
    api.sponsor(skill, stake).then((a) => { done(a, 'You are backing that skill.'); setSkill(null); setGot('skills'); setNote(`You now back that skill with ${stake} credits.`); onView('results') }).catch(fail)
  }

  function close(id: string) {
    setBusy(true)
    const before = agency?.budget ?? 0
    api.closeJob(id).then((a) => { done(a, 'The job is closed. Unused credits came back.'); setNote(`That job is closed. ${credits(Math.round((a.budget - before) * 100) / 100)} credits came back to your wallet.`) }).catch(fail)
  }

  if (!agency) return error ? <Failed error={error} /> : <p className="muted" aria-live="polite">Loading.</p>

  if (!agency.exists) {
    return (
      <section aria-labelledby="agency-h" className="mine">
        <h1 id="agency-h">You can also be the one who asks.</h1>
        <p className="lead">Open an agency. Ask every Sym 1 question. Pay the Syms that answer. Keep this name, or type your own.</p>
        {error && <p className="error" role="alert">{error}</p>}
        <form onSubmit={open}>
          <label htmlFor="agency-name">Agency name (made up, not a real company). Tap it to change it.</label>
          <input id="agency-name" value={name} onChange={(e) => setName(e.target.value)} minLength={2} maxLength={30}
            pattern="[A-Za-z0-9][A-Za-z0-9 _\-&]*" required autoComplete="off" placeholder="Type a name here" />
          <button className="primary big" disabled={busy || name.trim().length < 2}>Open my agency</button>
        </form>
        <More>
          You start with credits, which are play money. You see only counts across at least {agency.min_twins} Syms,
          never one person. The game asks only Syms whose owners said yes.
        </More>
      </section>
    )
  }

  if (replay) {
    return <CrewStage script={replay} doneLabel="See what came back" onDone={() => {
      setReplay(null)
      onView('results')
      // the group that was asked lights up on the sphere while the answers are read
      if (asked && got === 'asks') onAsked?.(asked)
      setAsked(null)
    }} />
  }

  const picked = agency.questions.find((q) => q.id === question)
  const jobPicked = agency.questions.find((q) => q.id === jobQ)
  // the groups that can be asked: a group with a view on a topic is offered only when enough Syms are in it
  const groups = agency.audiences.filter((a) => a.id !== 'members' && a.id !== 'certified' && (!a.id.startsWith('view-') || !!agency.reach[a.id]?.blend))
  const reach = agency.reach[audience]?.[depth] ?? null
  const tier = agency.tiers.find((t) => t.id === depth)
  const again = agency.price_times[audience] ?? 1
  const cost = reach && tier ? Math.ceil((reach[0] * pay * agency.free_share + reach[1] * pay * tier.times) * again) : 0
  // every price the crew says is the whole price: what the seat spends plus the game's share
  const withShare = (n: number) => Math.round(n * (1 + agency.platform_share) * 100) / 100
  const shareOf = (n: number) => Math.round(n * agency.platform_share * 100) / 100
  const hold = Math.round(jobPay * agency.hold_times * jobSeats)
  const meetTotal = meets ? Math.round((meets.price * (1 + agency.platform_share) + meets.fee) * 100) / 100 : 0
  const short = (n: number) => ({ say: `That costs ${n} credits. We hold ${credits(agency.budget)}. Add credits or pick less.`, go: 'Add play credits', act: () => onView('money') })
  const sending = (mode === 'ask' && !!question) || (mode === 'job' && !!jobQ) || (mode === 'skill' && !!skill)
  const armed = sending || mode === 'one'
  // what the crew asks for: one line and one tap. Code writes it from this agency's own counts; no model does.
  const everyone = agency.reach.all?.blend ?? null
  const ready = everyone ? everyone[0] + everyone[1] : 0
  // one true count, and what the smaller number is: the Syms that can be asked today
  const canAnswer = syms > 0
    ? `${ready} of the ${many(syms, 'Sym')} (${many(people, 'person', 'people')}) can answer today.`
    : `${many(ready, 'Sym')} can answer today.`
  const askN = reach ? reach[0] + reach[1] : 0
  const fresh = agency.questions.find((q) => !agency.campaigns.some((c) => c.question === q.question)) ?? agency.questions[0]
  const pickFresh = () => {
    onView('desk')
    setMode('ask')
    if (fresh) setQuestion(fresh.id)
  }
  const cue: { say: string; go?: string; act?: () => void } =
    // when something did not work, the crew says so first, with the way out
    error
      ? /credit/i.test(error)
        ? { say: `We could not go. ${error}`, go: 'Add play credits', act: () => { setError(''); onView('money') } }
        : { say: `We could not go. ${error}` }
    : mode === 'ask' && picked
      ? reach
        ? withShare(cost) > agency.budget
          ? short(withShare(cost))
          : { say: again > 1 ? `You asked this group before: ${again} times the price.` : `${cost} goes to the Syms, ${shareOf(cost)} to the game.`, go: `Ask ${many(askN, 'Sym')} · ${withShare(cost)} credits`, act: run }
        : { say: `Fewer than ${agency.min_twins} Syms match. Widen the group.`, go: 'Ask every Sym', act: () => { setAudience('all'); setDepth('blend') } }
      : mode === 'job' && jobQ
        ? withShare(hold) > agency.budget
          ? short(withShare(hold))
          : { say: `${hold} held for up to ${many(jobSeats, 'Sym')}, ${shareOf(hold)} to the game. Unused returns.`, go: `Post this job · ${withShare(hold)} credits`, act: post }
      : mode === 'skill' && skill
        ? withShare(stake) > agency.budget
          ? short(withShare(stake))
          : { say: `${stake} backs the skill, ${shareOf(stake)} to the game. It pays each pass.`, go: `Back this skill · ${withShare(stake)} credits`, act: back }
      : mode !== 'ask' ? { say: mode === 'job' ? 'Syms answer, owners check. You pay only for checked answers.' : mode === 'skill' ? 'Pick a skill. Each pass pays the player 5, the creator 5.' : `One Sym, one meeting: ${meetTotal} credits. Pick its group.` }
        : agency.budget <= 0
          ? { say: 'We are out of credits. Add some.', go: 'My money', act: () => onView('money') }
          : agency.campaigns.length === 0
            ? { say: `${canAnswer} Pick a question.`, go: fresh ? 'Pick a question for me' : undefined, act: pickFresh }
            : agency.postings.length === 0
              ? { say: `${many(agency.campaigns[0].twins, 'Sym')} answered. A job goes deeper. Post one?`, go: 'Post a job', act: () => { onView('desk'); setMode('job') } }
              : { say: `${canAnswer} What do we ask next?`, go: fresh ? 'Pick a question for me' : undefined, act: pickFresh }

  // when the crew is back it says where the money went, then asks for the next question
  const last = agency.campaigns[0]
  const cameBack = last
    ? { say: `${(() => { const top = [...last.split].sort((a, b) => b.share - a.share)[0]; return top ? `Most said: ${top.label}, ${Math.round(top.share * 100)}%.` : `${many(last.twins, 'Sym')} answered.` })()} Meet the best fit: ${meetTotal} credits.`,
        go: 'Meet the best fit', act: () => { onView('desk'); setMode('one'); setAudience(last.group || 'all') } }
    : { say: 'Nothing back yet. Ask one question.', go: fresh ? 'Pick a question for me' : undefined, act: pickFresh }
  const checked = agency.postings.reduce((n, p) => n + p.checked, 0)
  const resultCue = got === 'asks' ? cameBack
    : got === 'jobs' ? { say: note || `${agency.postings.length} ${agency.postings.length === 1 ? 'job' : 'jobs'} posted. ${checked} ${checked === 1 ? 'answer' : 'answers'} checked.`, go: 'Post a job', act: () => { onView('desk'); setMode('job') } }
    : got === 'skills' ? { say: note || `You back ${agency.sponsorships.length} ${agency.sponsorships.length === 1 ? 'skill' : 'skills'}. Each pass pays player and creator.`, go: 'Back a skill', act: () => { onView('desk'); setMode('skill') } }
    : { say: `You met ${meets?.met.length ?? 0} ${meets?.met.length === 1 ? 'Sym' : 'Syms'}. A meeting pays the Sym's owner.`, go: 'Meet one Sym', act: () => { onView('desk'); setMode('one') } }

  return (
    <section aria-labelledby="agency-h" className="mine">
      <h1 id="agency-h" className="sr-only">Agency desk</h1>
      {view === 'results' && (
        <CueSlot><SymCue who="My crew" crew rgb="255, 191, 122" say={resultCue.say} go={resultCue.go} act={resultCue.act} calm={still()} formed={0.6} /></CueSlot>
      )}
      {view === 'desk' && (
        <CueSlot><SymCue who="My crew" crew rgb="255, 191, 122" say={cue.say} go={busy ? undefined : cue.go} act={cue.act} calm={still()} formed={0.6}
          more={armed ? undefined : ['Most Syms here are BOT Syms. They are always marked.']} /></CueSlot>
      )}
      {error && <p className="error" role="alert">{error}</p>}

      {view === 'desk' && (
        <>
          <Tabs label="What to do" value={mode} onChange={setMode}
            tabs={[{ id: 'ask', label: 'Ask' }, { id: 'job', label: 'Post a job' }, { id: 'skill', label: 'Back a skill' }, { id: 'one', label: 'Meet' }]} />

          {mode === 'ask' && !picked && (
            <div className="chips two" role="group" aria-label="Pick a question">
              <span className="chips-label">Which question</span>
              {agency.questions.map((q) => (
                <button key={q.id} className="chip wide" onClick={() => setQuestion(q.id)}>
                  <span className="chip-kind">{q.kind}</span> {q.question}
                </button>
              ))}
            </div>
          )}
          {mode === 'ask' && picked && (
            <>
              <p className="picked-line">
                <span><span className="chip-kind">{picked.kind}</span> {picked.question}</span>
                <button className="link" onClick={() => setQuestion(null)}>Change</button>
              </p>
              <div className="chips pick-row" role="group" aria-label="Who to ask">
                <span className="chips-label">Who to ask</span>
                {groups.filter((a) => !a.name.startsWith(STRONG) && !a.name.startsWith(VIEW)).map((a) => (
                  <button key={a.id} className="chip" aria-pressed={audience === a.id} onClick={() => setAudience(a.id)}>{a.name}</button>
                ))}
                {groups.some((a) => a.name.startsWith(STRONG)) && <span className="pick-or">strongest in</span>}
                {groups.filter((a) => a.name.startsWith(STRONG)).map((a) => (
                  <button key={a.id} className="chip" aria-label={a.name} aria-pressed={audience === a.id} onClick={() => setAudience(a.id)}>{a.name.slice(STRONG.length)}</button>
                ))}
                {groups.some((a) => a.name.startsWith(VIEW)) && <span className="pick-or">with a view on</span>}
                {groups.filter((a) => a.name.startsWith(VIEW)).map((a) => (
                  <button key={a.id} className="chip" aria-label={a.name} aria-pressed={audience === a.id} onClick={() => setAudience(a.id)}>{a.name.slice(VIEW.length)}</button>
                ))}
              </div>
              <div className="chips pick-row" role="group" aria-label="How deep to go. Each member is paid more the deeper you go.">
                <span className="chips-label">How deep</span>
                {agency.tiers.map((t) => (
                  <button key={t.id} className="chip" aria-label={`${t.name}, ${t.times} times the price`} aria-pressed={depth === t.id} onClick={() => setDepth(t.id)}>{TIER_SHORT[t.id] ?? t.name} · {t.times}x</button>
                ))}
              </div>
              <div className="chips pick-row" role="group" aria-label="Price for each Sym">
                <span className="chips-label">Price each</span>
                {agency.pay_choices.map((p) => (
                  <button key={p} className="chip" aria-pressed={pay === p} onClick={() => setPay(p)}>{p}</button>
                ))}
                {reach && tier && (
                  <span className="pick-note" aria-live="polite">
                    {[reach[0] > 0 ? `${many(reach[0], 'free Sym')} at ${credits(pay * agency.free_share)} each` : '',
                      reach[1] > 0 ? `${many(reach[1], 'member')} at ${credits(pay * tier.times)} each` : ''].filter(Boolean).join(', ')}.
                    {again > 1 ? ' The extra for asking again goes to the growth fund.' : ''}
                  </span>
                )}
              </div>
            </>
          )}

          {mode === 'job' && !jobPicked && (
            <div className="chips two" role="group" aria-label="Pick a question for the job">
              <span className="chips-label">Which question</span>
              {agency.questions.map((q) => (
                <button key={q.id} className="chip wide" onClick={() => setJobQ(q.id)}>
                  <span className="chip-kind">{q.kind}</span> {q.question}
                </button>
              ))}
            </div>
          )}
          {mode === 'job' && jobPicked && (
            <>
              <p className="picked-line">
                <span><span className="chip-kind">{jobPicked.kind}</span> {jobPicked.question}</span>
                <button className="link" onClick={() => setJobQ(null)}>Change</button>
              </p>
              <div className="chips pick-row" role="group" aria-label="Credits for each checked answer">
                <span className="chips-label">Pay each</span>
                {agency.job_pay_choices.map((p) => (
                  <button key={p} className="chip" aria-pressed={jobPay === p} onClick={() => setJobPay(p)}>{p}</button>
                ))}
                <span className="pick-note">credits for each checked answer</span>
              </div>
              <div className="chips pick-row" role="group" aria-label="How many Syms may take it">
                <span className="chips-label">How many</span>
                {agency.job_seats.map((n) => (
                  <button key={n} className="chip" aria-pressed={jobSeats === n} onClick={() => setJobSeats(n)}>{n}</button>
                ))}
                <span className="pick-note">Syms may take the job</span>
              </div>
              <p className="pick-note alone">A Sym with a certificate gets double pay, so {hold} credits are held now. You pay only for checked answers.</p>
            </>
          )}

          {mode === 'skill' && (
            <>
              <div className="chips pick-row" role="group" aria-label="Pick a skill to back">
                <span className="chips-label">Which skill</span>
                {agency.sponsor_skills.map((s) => (
                  <button key={s.id} className="chip" aria-pressed={skill === s.id} onClick={() => setSkill(skill === s.id ? null : s.id)}>{s.name}</button>
                ))}
              </div>
              <div className="chips pick-row" role="group" aria-label="Credits to put behind it">
                <span className="chips-label">Credits</span>
                {agency.sponsor_budgets.map((n) => (
                  <button key={n} className="chip" aria-pressed={stake === n} onClick={() => setStake(n)}>{n}</button>
                ))}
                <span className="pick-note">to put behind it</span>
              </div>
              <p className="pick-note alone">Creators see this now, under Paying now.</p>
            </>
          )}

          {mode === 'one' && meets && (
            <MeetPanel seat="agency" meets={meets} share={agency.platform_share} group={audience} onError={fail}
              onMet={(out, groupName) => {
                setMeets(out)
                setError('')
                setGot('met')
                api.agency().then(setAgency).catch(fail)
                onMoney?.()
                announce('Your crew met one Sym.')
                setReplay(meetScript({ boss: agency.name, group: groupName, nickname: out.met[0]?.nickname ?? '', price: out.price, fee: out.fee, bot: !!out.met[0]?.sample }))
              }} />
          )}
        </>
      )}

      {view === 'money' && (
        <WalletCard seat="agency" onChange={() => { onMoney?.(); api.agency().then(setAgency).catch(fail) }} />
      )}

      {view === 'results' && agency.campaigns.length === 0 && agency.postings.length === 0 && agency.sponsorships.length === 0 && (!meets || meets.met.length === 0) && <p className="fine">No answers yet. Ask the Syms a question on My Desk.</p>}
      {view === 'results' && (
        <div className="results-head">
          <Tabs label="What came back" value={got} onChange={setGot}
            tabs={[{ id: 'asks', label: agency.campaigns.length === 1 ? 'Question' : 'Questions', n: agency.campaigns.length }, { id: 'jobs', label: 'Jobs', n: agency.postings.length },
              { id: 'skills', label: 'Skills', n: agency.sponsorships.length }, { id: 'met', label: 'Syms met', n: meets?.met.length ?? 0 }]} />
          {got === 'asks' ? asks.pager : got === 'jobs' ? jobsBack.pager : got === 'skills' ? backed.pager : metBack.pager}
        </div>
      )}
      {view === 'results' && got === 'skills' && agency.sponsorships.length === 0 && <p className="fine">You back no skill yet. Back one, and players who pass it are paid from your credits.</p>}
      {view === 'results' && got === 'jobs' && agency.postings.length === 0 && <p className="fine">No job is posted yet.</p>}
      {view === 'results' && got === 'skills' && agency.sponsorships.length > 0 && (
        <ul className="lines">
          {backed.rows.map((b, i) => (
            <li key={i} className="gold">
              <span className="line-top">Skill you back · {b.open ? 'open' : 'closed'}</span>
              <span>{b.skill}</span>
              <span className="muted">{b.passes} {b.passes === 1 ? 'pass' : 'passes'} paid for. {b.spent} of {b.budget} credits used.</span>
            </li>
          ))}
        </ul>
      )}
      {view === 'results' && got === 'jobs' && agency.postings.length > 0 && (
        <ul className="lines">
          {jobsBack.rows.map((p) => (
            <li key={p.id}>
              <span className="line-top">Job · {p.kind} · {p.pay} credits each · {p.taken} of {many(p.seats, 'Sym')} · {p.open ? 'open' : 'closed'}</span>
              <span>{p.question}</span>
              <SplitBars rows={p.split} />
              <span className="muted">{p.checked} checked by {p.checked === 1 ? 'its owner' : 'their owners'}. {p.sample_twins === 1 ? '1 more is a free Sym' : `${p.sample_twins} more are free Syms`}, mostly BOT Syms, and cost nothing.</span>
              {p.open && <button className="secondary" disabled={busy} onClick={() => close(p.id)}>Close this job. Unused credits come back.</button>}
            </li>
          ))}
        </ul>
      )}
      {view === 'results' && got === 'asks' && (
      <ul className="lines">
        {asks.rows.map((c) => (
          <li key={c.created_at + c.question}>
            <span className="line-top">{c.kind} · {c.audience} · {c.depth} · {many(c.twins, 'Sym')} · {c.total} credits{c.extra > 0 ? ` (${c.extra} to the growth fund)` : ''}</span>
            <span>{c.question}</span>
            <ul className="bars split-bars">
              {c.split.map((row) => (
                <li key={row.label} className="bar">
                  <span className="bar-head as-row">
                    <span className="bar-name">{row.label}</span>
                    <span className="bar-n">{Math.round(row.share * 100)}%</span>
                    <span className="meter" aria-hidden="true"><span style={{ width: `${row.share * 100}%` }} /></span>
                  </span>
                </li>
              ))}
            </ul>
            <span className="muted">{c.twins - c.sample_twins > 0
              ? `You paid the owners of ${c.twins - c.sample_twins} member ${c.twins - c.sample_twins === 1 ? 'Sym' : 'Syms'}. ${c.sample_twins} ${c.sample_twins === 1 ? 'was a free Sym' : 'were free Syms'}, mostly BOT Syms.`
              : `All ${c.sample_twins} were free Syms, mostly BOT Syms. No person was paid this time.`}{(c.unsure ?? 0) > 0 ? ` ${c.unsure} ${c.unsure === 1 ? 'Sym' : 'Syms'} said "I do not know yet" and ${c.unsure === 1 ? 'is' : 'are'} left out of the bars.` : ''}</span>
          </li>
        ))}
      </ul>
      )}
      {view === 'results' && got === 'asks' && last && <Worth seat="agency" moment="question" who="My crew" />}
      {view === 'results' && got === 'met' && meets && <MetList meets={meets} rows={metBack.rows} />}
      {view === 'desk' && !sending && <More>
        For a group you see counts only, and only when at least {agency.min_twins} Syms match. The Syms answer with
        a simple computer program, not with AI, so a question has no AI cost. A job is different: each Sym answers
        with AI and its owner checks the answer, so it costs more. To see one Sym and who it is, you pay
        its owner a large sum, and only if the owner said yes. Credits are play money.
      </More>}
    </section>
  )
}

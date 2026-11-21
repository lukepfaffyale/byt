import { useEffect, useState } from 'react'
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

export function AgencyDesk(props: { announce: (text: string) => void; view: SeatView; onView: (view: SeatView) => void; ask?: string }) {
  const { announce, view, onView, ask } = props
  const [agency, setAgency] = useState<Agency | null>(null)
  const [error, setError] = useState('')
  const [name, setName] = useState('')
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
  const [got, setGot] = useState<'asks' | 'jobs' | 'skills' | 'met'>('asks')
  const [note, setNote] = useState('')  // what just happened on a results tab, said by the crew
  const asks = usePager(agency?.campaigns ?? [], 1, `asks-${agency?.campaigns.length ?? 0}`)
  const jobsBack = usePager(agency?.postings ?? [], 1, `jobs-${agency?.postings.length ?? 0}`)
  const backed = usePager(agency?.sponsorships ?? [], 4, 'skills')

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
        done(a, `You asked ${a.campaigns[0]?.twins ?? 0} Syms.`)
        setQuestion(null)
        setGot('asks')
        const c = a.campaigns[0]
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
        <p className="lead">Open an agency. Ask every Sym 1 question. Pay the Syms that answer.</p>
        {error && <p className="error" role="alert">{error}</p>}
        <form onSubmit={open}>
          <label htmlFor="agency-name">Agency name (made up, not a real company)</label>
          <input id="agency-name" value={name} onChange={(e) => setName(e.target.value)} minLength={2} maxLength={30}
            pattern="[A-Za-z0-9][A-Za-z0-9 _\-&]*" required autoComplete="off" />
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
    return <CrewStage script={replay} doneLabel="See what came back" onDone={() => { setReplay(null); onView('results') }} />
  }

  const picked = agency.questions.find((q) => q.id === question)
  const reach = agency.reach[audience]?.[depth] ?? null
  const tier = agency.tiers.find((t) => t.id === depth)
  const again = agency.price_times[audience] ?? 1
  const cost = reach && tier ? Math.ceil((reach[0] * pay * agency.free_share + reach[1] * pay * tier.times) * again) : 0
  // every price the crew says is the whole price: what the seat spends plus the game's share
  const withShare = (n: number) => Math.round(n * (1 + agency.platform_share) * 100) / 100
  const shareOf = (n: number) => Math.round(n * agency.platform_share * 100) / 100
  const hold = Math.round(jobPay * agency.hold_times * jobSeats)
  const meetTotal = meets ? Math.round((meets.price * (1 + agency.platform_share) + meets.fee) * 100) / 100 : 0
  const short = (n: number, what: string) => ({ say: `${what} costs ${n} credits in all, and your agency holds ${credits(agency.budget)}. Add play credits, or pick less.`, go: 'Add play credits', act: () => onView('money') })
  const armed = (mode === 'ask' && !!question) || (mode === 'job' && !!jobQ) || (mode === 'skill' && !!skill) || mode === 'one'
  // what the crew asks for: one line and one tap. Code writes it from this agency's own counts; no model does.
  const everyone = agency.reach.all?.blend ?? null
  const ready = everyone ? everyone[0] + everyone[1] : 0
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
          ? short(withShare(cost), `Asking ${reach[0] + reach[1]} Syms at that price`)
          : { say: `Good one. ${reach[0] + reach[1]} Syms can answer it, for ${withShare(cost)} credits in all: ${cost} to the Syms, ${shareOf(cost)} for the game.`, go: `Ask ${reach[0] + reach[1]} Syms · ${withShare(cost)} credits`, act: run }
        : { say: `Too few Syms match that group. Widen it, and we can go.`, go: 'Ask every Sym', act: () => { setAudience('all'); setDepth('blend') } }
      : mode === 'job' && jobQ
        ? withShare(hold) > agency.budget
          ? short(withShare(hold), 'That job')
          : { say: `That job costs ${withShare(hold)} credits in all now: ${hold} held for the Syms, ${shareOf(hold)} for the game. What is not used comes back to you.`, go: `Post this job · ${withShare(hold)} credits`, act: post }
      : mode === 'skill' && skill
        ? withShare(stake) > agency.budget
          ? short(withShare(stake), 'Backing that skill')
          : { say: `Backing that skill costs ${withShare(stake)} credits in all: ${stake} behind the skill, ${shareOf(stake)} for the game. Players who pass it are paid from it.`, go: `Back this skill · ${withShare(stake)} credits`, act: back }
      : mode !== 'ask' ? { say: mode === 'job' ? 'A job goes deeper than a question. Pick one, and each owner checks what their Sym says.' : mode === 'skill' ? 'Back a skill, and players who pass it are paid from your credits.' : `One Sym, one meeting: ${meetTotal} credits in all. Pick its group below, then tap Meet.` }
        : agency.budget <= 0
          ? { say: 'We are out of credits. Add play credits, and we go again.', go: 'My money', act: () => onView('money') }
          : agency.campaigns.length === 0
            ? { say: `We are ready. ${ready} Syms can answer today. Pick a question, and we carry it to them.`, go: fresh ? 'Pick a question for me' : undefined, act: pickFresh }
            : agency.postings.length === 0
              ? { say: `${agency.campaigns[0].twins} Syms answered your last question. A job goes deeper: each owner checks the answer. Shall we post one?`, go: 'Post a job', act: () => { onView('desk'); setMode('job') } }
              : { say: `You have asked ${agency.campaigns.length} ${agency.campaigns.length === 1 ? 'question' : 'questions'} and posted ${agency.postings.length} ${agency.postings.length === 1 ? 'job' : 'jobs'}. ${ready} Syms are still here. What do we ask next?`, go: fresh ? 'Pick a question for me' : undefined, act: pickFresh }

  // when the crew is back it says where the money went, then asks for the next question
  const last = agency.campaigns[0]
  const cameBack = last
    ? { say: `${last.twins} Syms answered. ${credits(last.spent - last.extra)} credits went to them${last.extra > 0 ? `, and ${credits(last.extra)} to the growth fund` : ''}. Want to act on it? Meet the Sym in that group that fits best: ${meetTotal} credits in all, and its owner is paid.`,
        go: 'Meet the best fit', act: () => { onView('desk'); setMode('one'); setAudience(last.group || 'all') } }
    : { say: 'Nothing has come back yet. Send us out with one question.', go: fresh ? 'Pick a question for me' : undefined, act: pickFresh }
  const checked = agency.postings.reduce((n, p) => n + p.checked, 0)
  const resultCue = got === 'asks' ? cameBack
    : got === 'jobs' ? { say: note || `You have posted ${agency.postings.length} ${agency.postings.length === 1 ? 'job' : 'jobs'}. Owners have checked ${checked} ${checked === 1 ? 'answer' : 'answers'} so far.`, go: 'Post a job', act: () => { onView('desk'); setMode('job') } }
    : got === 'skills' ? { say: note || `You back ${agency.sponsorships.length} ${agency.sponsorships.length === 1 ? 'skill' : 'skills'}. Each pass pays the player and the creator from your credits.`, go: 'Back a skill', act: () => { onView('desk'); setMode('skill') } }
    : { say: `You have met ${meets?.met.length ?? 0} ${meets?.met.length === 1 ? 'Sym' : 'Syms'} one to one. Each meeting paid its owner.`, go: 'Meet one Sym', act: () => { onView('desk'); setMode('one') } }

  return (
    <section aria-labelledby="agency-h" className="mine">
      <h1 id="agency-h" className="sr-only">Agency desk</h1>
      {view === 'results' && (
        <CueSlot><SymCue who="My crew" crew rgb="255, 191, 122" say={resultCue.say} go={resultCue.go} act={resultCue.act} calm={still()} formed={0.6} /></CueSlot>
      )}
      {view === 'desk' && (
        <CueSlot><SymCue who="My crew" crew rgb="255, 191, 122" say={cue.say} go={busy ? undefined : cue.go} act={cue.act} calm={still()} formed={0.6}
          more={armed ? undefined : [`You have ${credits(agency.budget)} credits. Every answer you buy pays the owner of the Sym.`, 'Most Syms here are BOT Syms for now, made up to fill the game. They are always marked.', 'You only ever see totals, never one person. That is the deal that keeps people here.', 'The game adds 10 percent on top of what you spend. That is how it earns.']} /></CueSlot>
      )}
      {error && <p className="error" role="alert">{error}</p>}

      {view === 'desk' && (
        <>
          <Tabs label="What to do" value={mode} onChange={setMode}
            tabs={[{ id: 'ask', label: 'Ask' }, { id: 'job', label: 'Post a job' }, { id: 'skill', label: 'Back a skill' }, { id: 'one', label: 'Meet' }]} />

          {mode === 'ask' && (
            <>
              <div className="chips" role="group" aria-label="Pick a question">
                {agency.questions.filter((q) => !question || q.id === question).map((q) => (
                  <button key={q.id} className="chip wide" aria-pressed={question === q.id} onClick={() => setQuestion(question === q.id ? null : q.id)}>
                    <span className="chip-kind">{q.kind}</span> {q.question}
                  </button>
                ))}
              </div>
              {picked && (
                <>
                  <div className="chips" role="group" aria-label="Who to ask">
                    <span className="chips-label">Who to ask</span>
                    {agency.audiences.filter((a) => a.id !== 'members' && a.id !== 'certified' && (!a.id.startsWith('view-') || !!agency.reach[a.id]?.blend)).map((a) => (
                      <button key={a.id} className="chip" aria-pressed={audience === a.id} onClick={() => setAudience(a.id)}>{a.name}</button>
                    ))}
                  </div>
                  <div className="chips" role="group" aria-label="How deep to go">
                    <span className="chips-label">How deep to go · each member is paid more the deeper you go</span>
                    {agency.tiers.map((t) => (
                      <button key={t.id} className="chip" aria-pressed={depth === t.id} onClick={() => setDepth(t.id)}>{t.name} · {t.times}x</button>
                    ))}
                  </div>
                  <div className="chips" role="group" aria-label="Price for each Sym">
                    <span className="chips-label">Price for each Sym</span>
                    {agency.pay_choices.map((p) => (
                      <button key={p} className="chip" aria-pressed={pay === p} onClick={() => setPay(p)}>{p}</button>
                    ))}
                  </div>
                  <p className="quote" aria-live="polite">
                    {reach && tier ? (
                      <>
                        <span className="quote-n">{cost}</span>
                        <span>
                          credits to the Syms, {withShare(cost)} in all. {reach[0] > 0 ? `${reach[0]} free ${reach[0] === 1 ? 'Sym' : 'Syms'} at ${pay * agency.free_share} each. ` : ''}
                          {reach[1]} {reach[1] === 1 ? 'member' : 'members'} at {pay * tier.times} each.
                          {again > 1 ? ` You asked this group before, so it costs ${again} times as much. The extra goes to the growth fund.` : ''}
                        </span>
                      </>
                    ) : (
                      <span>Fewer than {agency.min_twins} Syms match here, so no one can be asked. Pick a wider group or a wider tier. One Sym alone costs {agency.meet_price} credits.</span>
                    )}
                  </p>
                </>
              )}
            </>
          )}

          {mode === 'job' && (
            <>
              <p className="fine">A job pays more than a question. Each Sym answers with AI. Then its owner checks the answer. You pay only for checked answers.</p>
              <div className="chips" role="group" aria-label="Pick a question for the job">
                {agency.questions.filter((q) => !jobQ || q.id === jobQ).map((q) => (
                  <button key={q.id} className="chip wide" aria-pressed={jobQ === q.id} onClick={() => setJobQ(jobQ === q.id ? null : q.id)}>
                    <span className="chip-kind">{q.kind}</span> {q.question}
                  </button>
                ))}
              </div>
              {jobQ && (
                <>
                  <div className="chips" role="group" aria-label="Credits for each checked answer">
                    <span className="chips-label">Credits for each checked answer</span>
                    {agency.job_pay_choices.map((p) => (
                      <button key={p} className="chip" aria-pressed={jobPay === p} onClick={() => setJobPay(p)}>{p}</button>
                    ))}
                  </div>
                  <div className="chips" role="group" aria-label="How many Syms may take it">
                    <span className="chips-label">How many Syms may take it</span>
                    {agency.job_seats.map((n) => (
                      <button key={n} className="chip" aria-pressed={jobSeats === n} onClick={() => setJobSeats(n)}>{n}</button>
                    ))}
                  </div>
                  <p className="quote">
                    <span className="quote-n">{hold}</span>
                    <span>credits held now, {withShare(hold)} in all. A Sym with a certificate gets double pay. What is not used comes back.</span>
                  </p>
                </>
              )}
            </>
          )}

          {mode === 'skill' && (
            <>
              <p className="fine">Pick a skill you need. Each time a player passes a step of it, you pay the player 5 credits and the creator 5 credits. Creators see that the skill is wanted.</p>
              <div className="chips" role="group" aria-label="Pick a skill to back">
                {agency.sponsor_skills.map((s) => (
                  <button key={s.id} className="chip" aria-pressed={skill === s.id} onClick={() => setSkill(skill === s.id ? null : s.id)}>{s.name}</button>
                ))}
              </div>
              {skill && (
                <>
                  <div className="chips" role="group" aria-label="Credits to put behind it">
                    <span className="chips-label">Credits to put behind it</span>
                    {agency.sponsor_budgets.map((n) => (
                      <button key={n} className="chip" aria-pressed={stake === n} onClick={() => setStake(n)}>{n}</button>
                    ))}
                  </div>
                </>
              )}
            </>
          )}

          {mode === 'one' && meets && (
            <MeetPanel seat="agency" meets={meets} share={agency.platform_share} group={audience} onError={fail}
              onMet={(out, groupName) => {
                setMeets(out)
                setError('')
                setGot('met')
                api.agency().then(setAgency).catch(fail)
                announce('Your crew met one Sym.')
                setReplay(meetScript({ boss: agency.name, group: groupName, nickname: out.met[0]?.nickname ?? '', price: out.price, fee: out.fee, bot: !!out.met[0]?.sample }))
              }} />
          )}
        </>
      )}

      {view === 'money' && (
        <WalletCard key={agency.budget} seat="agency" onChange={() => { api.agency().then(setAgency).catch(fail) }} />
      )}

      {view === 'results' && agency.campaigns.length === 0 && agency.postings.length === 0 && agency.sponsorships.length === 0 && (!meets || meets.met.length === 0) && <p className="fine">No answers yet. Ask the Syms a question on My Desk.</p>}
      {view === 'results' && (
        <div className="results-head">
          <Tabs label="What came back" value={got} onChange={setGot}
            tabs={[{ id: 'asks', label: 'Questions', n: agency.campaigns.length }, { id: 'jobs', label: 'Jobs', n: agency.postings.length },
              { id: 'skills', label: 'Skills backed', n: agency.sponsorships.length }, { id: 'met', label: 'Syms met', n: meets?.met.length ?? 0 }]} />
          {got === 'asks' ? asks.pager : got === 'jobs' ? jobsBack.pager : got === 'skills' ? backed.pager : null}
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
              <span className="line-top">Job · {p.kind} · {p.pay} credits each · {p.taken} of {p.seats} Syms · {p.open ? 'open' : 'closed'}</span>
              <span>{p.question}</span>
              <SplitBars rows={p.split} />
              <span className="muted">{p.checked} checked by {p.checked === 1 ? 'its owner' : 'their owners'}. {p.sample_twins} more are free Syms, mostly BOT Syms, and cost nothing.</span>
              {p.open && <button className="secondary" disabled={busy} onClick={() => close(p.id)}>Close this job. Unused credits come back.</button>}
            </li>
          ))}
        </ul>
      )}
      {view === 'results' && got === 'asks' && (
      <ul className="lines">
        {asks.rows.map((c) => (
          <li key={c.created_at + c.question}>
            <span className="line-top">{c.kind} · {c.audience} · {c.depth} · {c.twins} Syms · {c.total} credits{c.extra > 0 ? ` (${c.extra} to the growth fund)` : ''}</span>
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
            <span className="muted">{c.sample_twins} of the {c.twins} are free Syms, mostly BOT Syms.</span>
          </li>
        ))}
      </ul>
      )}
      {view === 'results' && got === 'asks' && last && <Worth seat="agency" moment="question" who="My crew" />}
      {view === 'results' && got === 'met' && meets && <MetList meets={meets} />}
      {view === 'desk' && <More>
        For a group you see counts only, and only when at least {agency.min_twins} Syms match. The Syms answer with
        a simple computer program, not with AI, so a question has no AI cost. A job is different: each Sym answers
        with AI and its owner checks the answer, so it costs more. To see one Sym and who it is, you pay
        its owner a large sum, and only if the owner said yes. Credits are play money.
      </More>}
    </section>
  )
}

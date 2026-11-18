import { useEffect, useState } from 'react'
import { api, type Agency, type Meets } from './api'
import { SplitBars, type SeatView } from './CreatorDesk'
import { CrewStage } from './CrewStage'
import { Tabs } from './Deck'
import { groupScript, meetScript, postScript, type CrewScript } from './crewScripts'
import { MeetPanel, MetList } from './Meet'
import { More } from './More'
import { usePager } from './pager'
import { Readout } from './Readout'
import { WalletCard } from './WalletCard'
import { Failed } from './Retry'
import { SymCue } from './SymCue'
import { Worth } from './Worth'
import { still } from './motion'
import { credits } from './words'

const brief = (words: string) => (words.length > 30 ? `${words.slice(0, 28).trimEnd()}...` : words)

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
  const asks = usePager(agency?.campaigns ?? [], 1, 'asks')
  const jobsBack = usePager(agency?.postings ?? [], 1, 'jobs')
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
        const p = a.postings[0]
        if (p) setReplay(postScript({ boss: a.name, what: p.question, pay: p.pay, seats: p.seats, held: p.held }))
      })
      .catch(fail)
  }

  function back() {
    if (!skill) return
    setBusy(true)
    api.sponsor(skill, stake).then((a) => { done(a, 'You are backing that skill.'); setSkill(null); onView('results') }).catch(fail)
  }

  function close(id: string) {
    setBusy(true)
    api.closeJob(id).then((a) => done(a, 'The job is closed. Unused credits came back.')).catch(fail)
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
    mode === 'ask' && picked
      ? reach
        ? { say: `Good one. ${reach[0] + reach[1]} Syms can answer it, for ${cost} credits, plus ${Math.round(cost * agency.platform_share * 100) / 100} for the game. Say the word and we go.`, go: 'Ask the Syms', act: run }
        : { say: `Too few Syms match that group. Widen it, and we can go.`, go: 'Ask every Sym', act: () => { setAudience('all'); setDepth('blend') } }
      : mode !== 'ask' ? { say: mode === 'job' ? 'A job goes deeper than a question. Pick one, and each owner checks what their Sym says.' : mode === 'skill' ? 'Back a skill, and players who pass it are paid from your credits.' : 'One Sym, one meeting. Its person said yes to this, and is paid for it.' }
        : agency.budget <= 0
          ? { say: 'We are out of credits. Add play credits, and we go again.', go: 'My money', act: () => onView('money') }
          : agency.campaigns.length === 0
            ? { say: `We are ready. ${ready} Syms can answer today. Pick a question, and we carry it to them.`, go: fresh ? `Ask: ${brief(fresh.question)}` : undefined, act: pickFresh }
            : agency.postings.length === 0
              ? { say: `${agency.campaigns[0].twins} Syms answered your last question. A job goes deeper: each owner checks the answer. Shall we post one?`, go: 'Post a job', act: () => { onView('desk'); setMode('job') } }
              : { say: `You have asked ${agency.campaigns.length} ${agency.campaigns.length === 1 ? 'question' : 'questions'} and posted ${agency.postings.length} ${agency.postings.length === 1 ? 'job' : 'jobs'}. ${ready} Syms are still here. What do we ask next?`, go: fresh ? `Ask: ${brief(fresh.question)}` : undefined, act: pickFresh }

  // when the crew is back it says where the money went, then asks for the next question
  const last = agency.campaigns[0]
  const cameBack = last
    ? { say: `Your last question reached ${last.twins} Syms. ${credits(last.spent - last.extra)} credits went to them and the people behind them${last.extra > 0 ? `, and ${credits(last.extra)} to the growth fund` : ''}. That is the money this place runs on. What do we ask next?`,
        go: fresh ? `Ask: ${brief(fresh.question)}` : undefined, act: pickFresh }
    : { say: 'Nothing has come back yet. Send us out with one question.', go: fresh ? `Ask: ${brief(fresh.question)}` : undefined, act: pickFresh }

  return (
    <section aria-labelledby="agency-h" className="mine">
      <h1 id="agency-h" className="sr-only">Agency desk</h1>
      {view === 'results' && got === 'asks' && (
        <>
          <SymCue who="My crew" crew rgb="255, 191, 122" say={cameBack.say} go={cameBack.go} act={cameBack.act} calm={still()} formed={0.6} />
          {last && <Worth seat="agency" moment="question" who="My crew" />}
        </>
      )}
      {view === 'desk' && (
        <SymCue who="My crew" crew rgb="255, 191, 122" say={cue.say} go={busy ? undefined : cue.go} act={cue.act} calm={still()} formed={0.6}
          more={[`You have ${agency.budget} credits. Every answer you buy pays a real person.`, 'You only ever see totals, never one person. That is the deal that keeps people here.', 'The game adds 10 percent on top of what you spend. That is how it earns.']} />
      )}
      {view !== 'money' && !(view === 'results' && got === 'met') && <Readout value={agency.budget} label={<>credits left · {agency.name}</>} />}
      {error && <p className="error" role="alert">{error}</p>}

      {view === 'desk' && (
        <>
          <Tabs label="What to do" value={mode} onChange={setMode}
            tabs={[{ id: 'ask', label: 'Ask a group' }, { id: 'job', label: 'Post a job' }, { id: 'skill', label: 'Back a skill' }, { id: 'one', label: 'Meet one Sym' }]} />

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
                          credits. {reach[0] > 0 ? `${reach[0]} free ${reach[0] === 1 ? 'twin' : 'twins'} at ${pay * agency.free_share} each. ` : ''}
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
                    <span className="quote-n">{Math.round(jobPay * agency.hold_times * jobSeats)}</span>
                    <span>credits held now. A Sym with a certificate gets double pay. A tenth more goes to creators whose skills that Sym's owner passed. What is not used comes back.</span>
                  </p>
                  <button className="primary big" disabled={busy} onClick={post}>Post this job</button>
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
                  <button className="primary big" disabled={busy} onClick={back}>Back this skill</button>
                </>
              )}
            </>
          )}

          {mode === 'one' && meets && (
            <MeetPanel seat="agency" meets={meets} group={audience} onError={fail}
              onMet={(out, groupName) => {
                setMeets(out)
                setError('')
                api.agency().then(setAgency).catch(fail)
                announce('Your crew met one Sym.')
                setReplay(meetScript({ boss: agency.name, group: groupName, nickname: out.met[0]?.nickname ?? '', price: out.price, fee: out.fee }))
              }} />
          )}
        </>
      )}

      {view === 'money' && (
        <WalletCard key={agency.budget} seat="agency" onChange={() => { api.agency().then(setAgency).catch(fail) }} />
      )}

      {view === 'results' && agency.campaigns.length === 0 && agency.postings.length === 0 && agency.sponsorships.length === 0 && (!meets || meets.met.length === 0) && <p className="fine">No answers yet. Ask the Syms a question on My Desk.</p>}
      {view === 'results' && (
        <Tabs label="What came back" value={got} onChange={setGot}
          tabs={[{ id: 'asks', label: 'Questions', n: agency.campaigns.length }, { id: 'jobs', label: 'Jobs', n: agency.postings.length },
            { id: 'skills', label: 'Skills backed', n: agency.sponsorships.length }, { id: 'met', label: 'Syms met', n: meets?.met.length ?? 0 }]} />
      )}
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
      {view === 'results' && got === 'skills' && backed.pager}
      {view === 'results' && got === 'jobs' && agency.postings.length > 0 && (
        <ul className="lines">
          {jobsBack.rows.map((p) => (
            <li key={p.id}>
              <span className="line-top">Job · {p.kind} · {p.pay} credits each · {p.taken} of {p.seats} Syms · {p.open ? 'open' : 'closed'}</span>
              <span>{p.question}</span>
              <SplitBars rows={p.split} />
              <span className="muted">{p.checked} checked by {p.checked === 1 ? 'its owner' : 'their owners'}. {p.sample_twins} more are free Syms with no name, which cost nothing. Some are made up.</span>
              {p.open && <button className="secondary" disabled={busy} onClick={() => close(p.id)}>Close this job. Unused credits come back.</button>}
            </li>
          ))}
        </ul>
      )}
      {view === 'results' && got === 'jobs' && jobsBack.pager}
      {view === 'results' && got === 'asks' && (
      <ul className="lines">
        {asks.rows.map((c) => (
          <li key={c.created_at + c.question}>
            <span className="line-top">{c.kind} · {c.audience} · {c.depth} · {c.twins} Syms · {c.spent} credits{c.extra > 0 ? ` (${c.extra} to the growth fund)` : ''}</span>
            <span>{c.question}</span>
            <ul className="bars split-bars">
              {c.split.map((row) => (
                <li key={row.label} className="bar">
                  <span className="bar-head as-row">
                    <span className="bar-name">{row.label}</span>
                    <span className="bar-n">{Math.round(row.share * 100)}</span>
                    <span className="meter" aria-hidden="true"><span style={{ width: `${row.share * 100}%` }} /></span>
                  </span>
                </li>
              ))}
            </ul>
            <span className="muted">{c.sample_twins} of the {c.twins} Syms are free Syms with no name. Some are made up, to fill the game while it is small.</span>
          </li>
        ))}
      </ul>
      )}
      {view === 'results' && got === 'asks' && asks.pager}
      {view === 'results' && got === 'met' && meets && <MetList meets={meets} />}
      <More>
        For a group you see counts only, and only when at least {agency.min_twins} Syms match. The Syms answer with
        a simple computer program, not with AI, so a question has no AI cost. A job is different: each Sym answers
        with AI and its owner checks the answer, so it costs more. To see one Sym and who it is, you pay
        its owner a large royalty, and only if the owner said yes. Credits are play money.
      </More>
    </section>
  )
}

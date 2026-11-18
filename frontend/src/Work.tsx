import { useEffect, useRef, useState } from 'react'
import { Readout } from './Readout'
import { api, type Job, type JobResult, type JobsOut } from './api'
import { Tabs } from './Deck'
import { usePager } from './pager'
import { CrewStage } from './CrewStage'
import { jobScript } from './crewScripts'
import { More } from './More'
import { Failed } from './Retry'

type Stage = { name: 'list' } | { name: 'running'; job: Job; done?: Job } | { name: 'review'; job: Job; correcting: boolean } | { name: 'result'; result: JobResult }

type Reward = { say: string; go: string; act: () => void } | null

export function Work({ announce, onChange, onReward }: { announce: (text: string) => void; onChange: () => void; onReward: (told: Reward) => void }) {
  const [jobs, setJobs] = useState<Job[] | null>(null)
  const [credits, setCredits] = useState(0)
  const [certified, setCertified] = useState(false)
  const [data, setData] = useState({ on: false, credits: 0, answers: 0 })
  const [meet, setMeet] = useState({ on: false, price: 0, times: 0 })
  const [tab, setTab] = useState<'jobs' | 'away'>('jobs')
  const [auto, setAuto] = useState({ per_day: 0, choices: [0], earned: 0, upkeep: 0 })
  const watched = useRef(false) // the picture of the twin at work has played to its end

  function take(out: JobsOut) {
    setJobs(out.jobs)
    setCredits(out.credits)
    setCertified(out.certified)
    setData({ on: out.data_income, credits: out.data_credits, answers: out.data_answers })
    setMeet({ on: out.one_to_one, price: out.meet_price, times: out.meets })
    setAuto({ per_day: out.auto_per_day, choices: out.auto_choices, earned: out.earned_credits, upkeep: out.upkeep_credits })
  }
  const [stage, setStage] = useState<Stage>({ name: 'list' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  // jobs the twin can act on come first, then locked ones, then finished ones
  const order = { review: 0, open: 1, locked: 2, done: 3 } as Record<string, number>
  const sorted = [...(jobs ?? [])].sort((a, b) => (order[a.state] ?? 9) - (order[b.state] ?? 9))
  const { rows: jobPage, pager } = usePager(sorted, 3, 'jobs')

  function fail(e: unknown) {
    setError(e instanceof Error ? e.message : 'There was a problem. Please try again.')
    setBusy(false)
  }

  function load() {
    api
      .jobs()
      .then(take)
      .catch(fail)
  }

  useEffect(() => {
    let cancelled = false
    api
      .jobs()
      .then((out) => {
        if (!cancelled) take(out)
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'There was a problem. Please try again.')
      })
    return () => {
      cancelled = true
    }
  }, [])

  function send(job: Job) {
    setError('')
    onReward(null)
    if (job.state === 'review') {
      setStage({ name: 'review', job, correcting: job.answer === null })
      return
    }
    watched.current = false
    setStage({ name: 'running', job })
    announce('Your Sym is working.')
    api
      .runJob(job.id)
      .then((done) => {
        announce('Your Sym answered. Please check its answer.')
        // the picture plays to its end (or is skipped) before the answer is shown
        if (watched.current) setStage({ name: 'review', job: done, correcting: done.answer === null })
        else setStage({ name: 'running', job, done })
      })
      .catch((e: unknown) => {
        fail(e)
        setStage({ name: 'list' })
      })
  }

  function review(job: Job, verdict: 'approved' | 'corrected', choice: string | null) {
    setBusy(true)
    api
      .reviewJob(job.id, verdict, choice)
      .then((result) => {
        setBusy(false)
        setStage({ name: 'result', result })
        announce(`Your Sym earned ${result.credits_earned} credits.`)
        onChange()
        // my Sym closes the loop: what the check did, what it paid, and one tap to the next job
        const more = sorted.find((j) => j.id !== job.id && (j.state === 'open' || j.state === 'review'))
        onReward({
          say: `${verdict === 'approved' ? 'You said I got it right.' : 'You set me right, and I learned from it.'} ${result.credits_earned > 0 ? `That job paid us ${result.credits_earned} credits, and you hold ${result.credits} now.` : 'That one paid nothing this time.'} ${more ? 'Another job is waiting.' : 'That was the last job for now. More will come.'}`,
          go: more ? (more.state === 'open' ? 'Send my Sym again' : 'Check the next answer') : 'Back to my jobs',
          act: more ? () => send(more) : back,
        })
      })
      .catch(fail)
  }

  function back() {
    onReward(null)
    setStage({ name: 'list' })
    load()
  }

  if (stage.name === 'running') {
    const done = stage.done
    return (
      <CrewStage script={jobScript({ requester: stage.job.requester, pay: stage.job.pay })} doneLabel="Check its answer" waiting={!done}
        onDone={() => {
          watched.current = true
          if (done) setStage({ name: 'review', job: done, correcting: done.answer === null })
        }} />
    )
  }

  if (stage.name === 'review') {
    const job = stage.job
    const answer = job.options.find((o) => o.id === job.answer)
    return (
      <section aria-labelledby="work-h" className="play">
        <p className="muted">{job.requester_kind} · {job.requester}</p>
        <h1 id="work-h" className="prompt">{job.question}</h1>
        {error && <p className="error" role="alert">{error}</p>}
        {answer && !stage.correcting && (
          <>
            <div className="said">
              <span className="line-top">Your Sym answered for you</span>
              <strong>{answer.label}</strong>
              {job.reason && <span className="muted">"{job.reason}"</span>}
              <span className="fine">{job.twin_kind === 'model' ? 'The AI Sym' : 'The practice Sym (it does not use AI)'}</span>
            </div>
            <button className="primary big" disabled={busy} onClick={() => review(job, 'approved', null)}>Yes, that is right</button>
            <button className="link" disabled={busy} onClick={() => setStage({ name: 'review', job, correcting: true })}>
              No, that is not right
            </button>
          </>
        )}
        {(stage.correcting || !answer) && (
          <>
            <p className="muted">{answer ? 'Tap the answer you would give. Your Sym learns from it.' : 'Your Sym did not know. Tap your answer, and your Sym will learn from it.'}</p>
            <div className="options">
              {job.options.filter((o) => o.id !== job.answer).map((o) => (
                <button key={o.id} className="option" disabled={busy} onClick={() => review(job, 'corrected', o.id)}>
                  {o.label}
                </button>
              ))}
            </div>
          </>
        )}
      </section>
    )
  }

  if (stage.name === 'result') {
    const r = stage.result
    return (
      <section aria-labelledby="work-h" className="mine">
        <h1 id="work-h" className="sr-only">Your Sym was paid</h1>
        <p className="stat">+{r.credits_earned}</p>
        <p className="stat-label">credits your Sym earned · {r.credits} in total</p>
        <p className="fine">{r.note}</p>
        {r.insight && (
          <p className="cert">
            <span className="cert-kind">Insight certificate</span>
            <strong>{r.insight.level}</strong>
            <span>{Math.round(r.insight.accuracy * r.insight.n)} of {r.insight.n} other Syms answer as you do</span>
          </p>
        )}

        <h2>From your taps to the whole group</h2>
        <ol className="lines chain">
          <li><span className="line-top">You</span><span>{r.taps} taps. Each tap tells your Sym something.</span></li>
          <li><span className="line-top">Your Sym</span><span>{r.beliefs} {r.beliefs === 1 ? 'belief' : 'beliefs'} about you, made from those taps</span></li>
          <li><span className="line-top">The job</span><span>1 answer for {r.job.requester}, given as you would give it</span></li>
          <li>
            <span className="line-top">The whole group · {r.twins} Syms answered</span>
            <ul className="bars split-bars">
              {r.split.map((row) => (
                <li key={row.label} className={`bar ${row.yours ? 'leading' : ''}`}>
                  <span className="bar-head as-row">
                    <span className="bar-name">{row.label}{row.yours ? ' (you)' : ''}</span>
                    <span className="bar-n">{Math.round(row.share * 100)}</span>
                    <span className="meter" aria-hidden="true"><span style={{ width: `${row.share * 100}%` }} /></span>
                  </span>
                </li>
              ))}
            </ul>
          </li>
          <li><span className="line-top">How it is used</span><span>{r.job.feeds}</span></li>
        </ol>
        <p className="fine">
          {r.sample_twins} of the {r.twins} Syms are made-up sample Syms. So these numbers are only an example
          until more people play. Credits are play money.
        </p>
        <button className="link" onClick={back}>See all jobs</button>
      </section>
    )
  }

  return (
    <section aria-labelledby="work-h" className="mine">
      <h1 id="work-h" className="sr-only">Work</h1>
      {tab === 'jobs' && <Readout value={credits} label={<>credits your Sym holds{certified ? ' · it has a certificate, so it earns double' : ''}</>} />}
      {error && (jobs ? <p className="error" role="alert">{error}</p> : <Failed error={error} />)}
      {!jobs && !error && <p className="muted" aria-live="polite">Loading.</p>}
      <Tabs label="Work" value={tab} onChange={setTab}
        tabs={[
          { id: 'jobs', label: 'Jobs to do', n: sorted.filter((j) => j.state === 'open' || j.state === 'review').length },
          { id: 'away', label: 'While I am away', n: [data.on, meet.on, auto.per_day > 0].filter(Boolean).length + ' on' },
        ]} />
      {jobs && tab === 'jobs' && (
        <ul className="lines">
          {jobPage.map((j) => (
            <li key={j.id} className={`job ${j.state}`}>
              <span className="line-top">{j.requester_kind} · {j.requester} · {j.pay} credits</span>
              <span>{j.question}</span>
              {j.state === 'locked' && <span className="muted">Opens after you finish {j.after_gates} {j.after_gates === 1 ? 'gate' : 'gates'}</span>}
              {j.state === 'done' && <span className="muted">Done · earned {j.credits} credits</span>}
              {(j.state === 'open' || j.state === 'review') && (
                <button className="secondary gate-go" onClick={() => send(j)}>{j.state === 'open' ? 'Send my Sym' : 'Check its answer'}</button>
              )}
            </li>
          ))}
        </ul>
      )}
      {tab === 'jobs' && pager}
      {tab === 'away' && (
        <>
      <ul className="lines">
        <li>
          <span className="line-top">Earn while you are away · {data.credits} credits from {data.answers} {data.answers === 1 ? 'question' : 'questions'}</span>
          <span>
            {data.on ? 'On. ' : 'Off. '}
            Agencies and creators may ask your Sym a question. They see only counts across many Syms, never one person.
          </span>
          <button className="secondary gate-go" aria-pressed={data.on}
            onClick={() => api.consent(!data.on).then(take).catch(fail)}>
            {data.on ? 'Turn off' : 'Let my Sym earn'}
          </button>
        </li>
        <li>
          <span className="line-top">One to one · {meet.price} credits each time · met {meet.times} {meet.times === 1 ? 'time' : 'times'}</span>
          <span>
            {meet.on ? 'On. ' : 'Off. '}
            A seat may pay you {meet.price} credits to meet your Sym alone. It sees your nickname, your two strongest
            areas and your Sym's answers. It does not see your taps.
          </span>
          <button className="secondary gate-go" aria-pressed={meet.on}
            onClick={() => api.oneToOne(!meet.on).then(take).catch(fail)}>
            {meet.on ? 'Turn off' : 'Let my Sym be met'}
          </button>
        </li>
        <li>
          <span className="line-top">Work by itself · {auto.per_day === 0 ? 'off' : `up to ${auto.per_day} ${auto.per_day === 1 ? 'job' : 'jobs'} a day`}</span>
          <span>
            Your Sym may start jobs without you. It is paid only after you check each answer.
            So far it earned {auto.earned} credits and cost {auto.upkeep} to run.
          </span>
          <span className="chips" role="group" aria-label="Jobs my Sym may start by itself each day">
            {auto.choices.map((n) => (
              <button key={n} className="chip" aria-pressed={auto.per_day === n} onClick={() => api.auto(n).then(take).catch(fail)}>{n === 0 ? 'Off' : n}</button>
            ))}
          </span>
        </li>
      </ul>
        </>
      )}
      <More>
        Your Sym answers as you would. You say if the answer is right, or you correct it. A Sym with a certificate
        earns double. The companies that ask are made up, and credits are play money.
      </More>
    </section>
  )
}

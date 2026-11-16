import { useEffect, useState } from 'react'
import { api, type RpsOut } from './api'
import { Tabs } from './Deck'
import { More } from './More'
import { Rows } from './Rows'

const NAME: Record<string, string> = { r: 'Rock', p: 'Paper', s: 'Scissors' }
const SAID = { you: 'You win this round.', twin: 'My twin wins this round.', draw: 'A draw.' }

/** Three simple marks, drawn here: a stone, a sheet and two blades. */
function Mark({ t }: { t: string }) {
  return (
    <svg viewBox="0 0 40 40" className="rps-mark" aria-hidden="true">
      {t === 'r' && <path d="M9 24c0-8 5-14 12-14s11 5 11 12-5 10-12 10S9 30 9 24z" />}
      {t === 'p' && <path d="M12 7h13l5 5v21H12z M25 7v5h5" />}
      {t === 's' && <path d="M10 9l20 20 M30 9L10 29 M8 31a3 3 0 1 0 6 0a3 3 0 1 0-6 0 M26 31a3 3 0 1 0 6 0a3 3 0 1 0-6 0" />}
    </svg>
  )
}

/**
 * Rock, paper, scissors against my own twin. The twin has already chosen from how I threw before; I tap a throw
 * and both are shown, with the habit it used. After enough rounds my twin plays every other twin, each one
 * throwing the way its owner throws.
 */
export function Rps({ announce }: { announce: (text: string) => void }) {
  const [state, setState] = useState<RpsOut | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [tab, setTab] = useState<'score' | 'tells' | 'league'>('score')

  useEffect(() => {
    let cancelled = false
    api.rps().then((s) => { if (!cancelled) setState(s) })
      .catch((e: unknown) => { if (!cancelled) setError(e instanceof Error ? e.message : 'There was a problem. Please try again.') })
    return () => {
      cancelled = true
    }
  }, [])

  function play(t: string) {
    if (busy) return
    setBusy(true)
    api.throwRps(t)
      .then((s) => {
        setState(s)
        setError('')
        if (s.round) announce(`You threw ${NAME[s.round.mine]}. Your twin threw ${NAME[s.round.twin]}. ${SAID[s.round.outcome]} ${s.round.why}`)
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'There was a problem. Please try again.'))
      .finally(() => setBusy(false))
  }

  if (!state) return error ? <p className="error" role="alert">{error}</p> : <p className="muted" aria-live="polite">Loading.</p>
  const round = state.round
  const called = state.rounds > 0 ? Math.round((state.twin / state.rounds) * 100) : 0

  return (
    <section aria-labelledby="rps-h" className="mine rps">
      <h1 id="rps-h" className="sr-only">Rock, paper, scissors against my twin</h1>
      <div className="twin-line">
        <span className="line-top">My twin</span>
        <p>
          {state.rounds === 0
            ? 'I have chosen my throw. I do not know how you play yet, so beat me while you can.'
            : round ? round.why
              : `I have watched ${state.rounds} of your throws. I read your throw right ${called} percent of the time: each time I win, I knew what you would throw. I have chosen my next throw.`}
        </p>
      </div>
      <div className="rps-throws" role="group" aria-label="Pick your throw">
        {(['r', 'p', 's'] as const).map((t) => (
          <button key={t} className="rps-throw" disabled={busy} onClick={() => play(t)}>
            <Mark t={t} />
            <span>{NAME[t]}</span>
          </button>
        ))}
      </div>
      <p className={round ? `rps-round ${round.outcome}` : 'rps-round'} aria-live="polite">
        {round ? (
          <>
            <span className="rps-side"><Mark t={round.mine} /><span className="line-top">You · {NAME[round.mine]}</span></span>
            <strong>{SAID[round.outcome]}</strong>
            <span className="rps-side"><Mark t={round.twin} /><span className="line-top">My twin · {NAME[round.twin]}</span></span>
          </>
        ) : <span className="muted">My twin's throw is sealed. Tap yours.</span>}
      </p>
      {error && <p className="error" role="alert">{error}</p>}
      <Tabs label="Rock, paper, scissors" value={tab} onChange={setTab}
        tabs={[
          { id: 'score', label: 'Score', n: `${state.you}-${state.twin}` },
          { id: 'tells', label: 'How I read you', n: state.tells.length },
          { id: 'league', label: 'Twin league', n: state.need > 0 ? `in ${state.need}` : `${state.rank}/${state.of}` },
        ]} />
      {tab === 'score' && (
        <>
          <dl className="pair">
            <div><dt>It read you</dt><dd>{state.twin}</dd><dd className="muted">my twin won</dd></div>
            <div><dt>You fooled it</dt><dd>{state.you}</dd><dd className="muted">you won</dd></div>
            <div><dt>Draws</dt><dd>{state.draws}</dd><dd className="muted">it expected something else</dd></div>
          </dl>
          <p className="rps-strip" aria-label="The last rounds, newest first">
            {state.last.map((r, i) => <span key={i} className={`rps-dot ${r.outcome}`} title={`${NAME[r.mine]} against ${NAME[r.twin]}`}>{r.outcome === 'you' ? 'W' : r.outcome === 'twin' ? 'L' : '='}</span>)}
            {state.last.length === 0 && <span className="muted">No rounds yet.</span>}
          </p>
        </>
      )}
      {tab === 'tells' && (
        <Rows pageKey="tells" wide empty="I need a few more rounds before I can see a habit. Keep playing."
          rows={state.tells.map((t, i) => ({
            id: `t${i}`, top: `After ${NAME[t.after]}`, label: `you throw ${NAME[t.then].toLowerCase()}`, n: `${t.n}/${t.of}`,
            detail: <>So after you throw {NAME[t.after].toLowerCase()}, I expect {NAME[t.then].toLowerCase()} and I get ready to beat it. Change the habit and I have to learn again.</>,
          }))} />
      )}
      {tab === 'league' && (state.need > 0 ? (
        <p className="fine">Play {state.need} more {state.need === 1 ? 'round' : 'rounds'}. Then my twin plays every other twin. Each twin throws the way its owner throws.</p>
      ) : (
        <Rows pageKey="league" size={4} wide empty="No other twins yet."
          rows={state.rivals.map((r, i) => ({
            id: `r${i}`, top: r.won > r.lost ? 'Won' : r.won < r.lost ? 'Lost' : 'Even', gold: r.won > r.lost,
            label: `${r.name}${r.free ? ' · free twin' : ''}`, n: `${r.won}-${r.lost}`,
            detail: <>21 rounds. My twin won {r.won}, lost {r.lost} and drew {r.drawn}. Both twins threw the way their owners throw.</>,
          }))} />
      ))}
      <More label="About this game">
        Your twin picks its throw before you tap, from your earlier throws only. A simple computer program does
        this, not AI, so it costs nothing. The game stores your throws. Other twins in the league have a number,
        never a name, and they see only wins and losses.
      </More>
    </section>
  )
}

import { useEffect, useState, type ReactNode } from 'react'
import { api, type RpsOut } from './api'
import { More } from './More'
import { Failed } from './Retry'

const CUP: Record<string, string> = { a: 'Left', b: 'Middle', c: 'Right' }

/** A cup, drawn here. The light shows under it once a round is over. */
function Cup({ lit, looked }: { lit: boolean; looked: boolean }) {
  return (
    <svg viewBox="0 0 40 40" className="rps-mark" aria-hidden="true">
      <path d="M11 10h18l4 20H7z" />
      {lit && <circle cx="20" cy="24" r="4" className="hide-light" />}
      {looked && <path d="M14 36h12" />}
    </svg>
  )
}

/**
 * Hide the light: a second duel against my own Sym. I hide a light under one of three cups. My Sym sealed its
 * guess before I tapped, from where I hid it before. If it looks where the light is, it read me. If not, I fooled it.
 * A simple computer program makes the guess. No AI is used, and nothing here is paid.
 */
export function Hide({ announce, games }: { announce: (text: string) => void; games: ReactNode }) {
  const [state, setState] = useState<RpsOut | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    api.hide().then((s) => { if (!cancelled) { setState(s); setError('') } })
      .catch((e: unknown) => { if (!cancelled) setError(e instanceof Error ? e.message : 'There was a problem. Please try again.') })
    return () => {
      cancelled = true
    }
  }, [])

  function play(cup: string) {
    if (busy) return
    setBusy(true)
    api.hideAt(cup)
      .then((s) => {
        setState(s)
        setError('')
        if (s.round) announce(`You hid it ${CUP[s.round.mine].toLowerCase()}. Your Sym looked ${CUP[s.round.twin].toLowerCase()}. ${s.round.outcome === 'twin' ? 'It found the light.' : 'You fooled it.'} ${s.round.why}`)
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'There was a problem. Please try again.'))
      .finally(() => setBusy(false))
  }

  if (!state) {
    return error ? <Failed error={error} /> : <p className="muted" aria-live="polite">Loading.</p>
  }
  const round = state.round
  const tell = state.tells[0]

  return (
    <section aria-labelledby="hide-h" className="mine rps">
      <h1 id="hide-h" className="sr-only">Hide the light from my Sym</h1>
      {games}
      <div className="twin-line">
        <span className="line-top">My Sym</span>
        <p>
          {state.rounds === 0
            ? 'Hide the light under a cup. I have sealed my guess. I do not know your habits yet.'
            : round ? round.why
              : `I have watched you hide it ${state.rounds} ${state.rounds === 1 ? 'time' : 'times'}. I found it ${state.twin}. My next guess is sealed.`}
        </p>
      </div>
      <div className="rps-throws" role="group" aria-label="Pick a cup to hide the light under">
        {(['a', 'b', 'c'] as const).map((c) => (
          <button key={c} className="rps-throw" disabled={busy} onClick={() => play(c)}>
            <Cup lit={round?.mine === c} looked={round?.twin === c} />
            <span>{CUP[c]}</span>
          </button>
        ))}
      </div>
      <p className={round ? `rps-round ${round.outcome}` : 'rps-round'} aria-live="polite">
        {round
          ? <strong>{round.outcome === 'twin' ? `I looked ${CUP[round.twin].toLowerCase()}. Found it.` : `I looked ${CUP[round.twin].toLowerCase()}. You fooled me.`}</strong>
          : <span className="muted">My Sym's guess is sealed. Tap a cup.</span>}
      </p>
      {error && <p className="error" role="alert">{error}</p>}
      <dl className="pair">
        <div><dt>It read you</dt><dd>{state.twin}</dd><dd className="muted">it found the light</dd></div>
        <div><dt>You fooled it</dt><dd>{state.you}</dd><dd className="muted">it looked elsewhere</dd></div>
      </dl>
      {tell && <p className="fine">A habit I found: after {CUP[tell.after].toLowerCase()}, you hide it {CUP[tell.then].toLowerCase()} {tell.n} of {tell.of} times.</p>}
      <More label="About this game">
        Your Sym seals its guess before you tap, from where you hid the light before. A simple computer program does
        it. No AI is used and nothing is paid. Change your habit and it has to learn again. The game built this duel.
        Next, creators build duels like it, and are paid when their duels are played.
      </More>
    </section>
  )
}

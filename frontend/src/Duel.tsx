import { useEffect, useState, type ReactNode } from 'react'
import { api, type RpsOut } from './api'
import { DUEL_ROUNDS, markDuel } from './daily'
import { More } from './More'
import { Failed } from './Retry'

export type DuelGame = 'hide' | 'sync' | 'keeper'

/** What each duel says. In every one my Sym seals its move before I tap, from my earlier moves in that duel. */
const GAME: Record<DuelGame, {
  title: string
  picks: [string, string][] // the letter sent to the server, and the word on the tile
  first: string // what my Sym says before the first round
  sealed: string // the line under the tiles before a round
  good: (sym: string) => string // I took the round
  bad: (sym: string) => string // my Sym took the round, or we missed
  mine: string // the label of my good rounds
  theirs: string // the label of the other rounds
  habit: (after: string, then: string) => string
  about: string
}> = {
  hide: {
    title: 'Hide the light from my Sym',
    picks: [['a', 'Left'], ['b', 'Middle'], ['c', 'Right']],
    first: 'Hide the light under a cup. I have sealed my guess. I do not know your habits yet.',
    sealed: "My Sym's guess is sealed. Tap a cup.",
    good: (s) => `I looked ${s}. You fooled me.`,
    bad: (s) => `I looked ${s}. Found it.`,
    mine: 'You fooled it', theirs: 'It found the light',
    habit: (a, t) => `after ${a}, you hide it ${t}`,
    about: 'Your Sym seals its guess before you tap, from where you hid the light before.',
  },
  sync: {
    title: 'Think alike with my Sym',
    picks: [['d', 'Sun'], ['e', 'Moon'], ['f', 'Star']],
    first: 'Pick a sign. I pick one too. We both win when we match. My pick is sealed.',
    sealed: "My Sym's pick is sealed. Tap yours.",
    good: (s) => `I picked the ${s} too. We matched.`,
    bad: (s) => `I picked the ${s}. Not this time.`,
    mine: 'We matched', theirs: 'We missed',
    habit: (a, t) => `after the ${a}, you pick the ${t}`,
    about: 'You are on the same side here. Your Sym seals the sign it thinks you will pick, from your earlier picks.',
  },
  keeper: {
    title: 'Keeper: save the shot of my Sym',
    picks: [['g', 'Left'], ['h', 'Middle'], ['i', 'Right']],
    first: 'I shoot. You dive. My shot is sealed. I aim where you dive least.',
    sealed: "My Sym's shot is sealed. Tap where you dive.",
    good: (s) => `I shot ${s}. You saved it.`,
    bad: (s) => `I shot ${s}. Goal.`,
    mine: 'You saved', theirs: 'It scored',
    habit: (a, t) => `after ${a}, you dive ${t}`,
    about: 'Here you read your Sym. It seals its shot before you tap, and aims where you have dived least.',
  },
}

/** One small drawing for each tile, made here from plain lines. `lit` marks my pick, `sym` marks my Sym's move. */
function Mark({ game, at, lit, sym }: { game: DuelGame; at: number; lit: boolean; sym: boolean }) {
  return (
    <svg viewBox="0 0 40 40" className="rps-mark" aria-hidden="true">
      {game === 'hide' && <path d="M11 10h18l4 20H7z" />}
      {game === 'hide' && lit && <circle cx="20" cy="24" r="4" className="hide-light" />}
      {game === 'sync' && at === 0 && <path d="M20 13a7 7 0 1 0 0.01 0z M20 4v5 M20 31v5 M4 20h5 M31 20h5 M9 9l3 3 M28 28l3 3 M31 9l-3 3 M12 28l-3 3" />}
      {game === 'sync' && at === 1 && <path d="M26 8a13 13 0 1 0 6 19a10 10 0 0 1-6-19z" />}
      {game === 'sync' && at === 2 && <path d="M20 5l4.300 9.300 10 1.200-7.500 6.800 2.200 10L20 27.200 11 32.300l2.200-10-7.500-6.800 10-1.200z" />}
      {game === 'keeper' && <path d="M5 32V9h30v23 M5 32h30" />}
      {game === 'keeper' && (lit || sym) && <circle cx={[11, 20, 29][at]} cy={lit ? 24 : 16} r={lit ? 4 : 3} className={sym && !lit ? 'hide-light' : undefined} />}
      {game !== 'keeper' && sym && <path d="M14 37h12" />}
    </svg>
  )
}

/**
 * A duel between me and my own Sym. A simple computer program makes my Sym's move. No AI is used and nothing is
 * paid. The game built these duels; duels are a creator's ground, and building more of them is how a creator
 * is meant to earn.
 */
export function Duel({ game, announce, games }: { game: DuelGame; announce: (text: string) => void; games: ReactNode }) {
  const [state, setState] = useState<RpsOut | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [visit, setVisit] = useState({ rounds: 0, good: 0 }) // the rounds of this visit: three make Today's 3
  const g = GAME[game]
  const word = (letter: string) => (g.picks.find(([id]) => id === letter)?.[1] ?? letter).toLowerCase()

  useEffect(() => {
    let cancelled = false
    api.duel(game).then((s) => { if (!cancelled) { setState(s); setError('') } })
      .catch((e: unknown) => { if (!cancelled) setError(e instanceof Error ? e.message : 'There was a problem. Please try again.') })
    return () => {
      cancelled = true
    }
  }, [game])

  function play(pick: string) {
    if (busy) return
    setBusy(true)
    api.duelPick(game, pick)
      .then((s) => {
        setState(s)
        setError('')
        if (!s.round) return
        const good = s.round.outcome === 'you'
        setVisit((v) => {
          if (v.rounds + 1 === DUEL_ROUNDS) markDuel()
          return { rounds: v.rounds + 1, good: v.good + (good ? 1 : 0) }
        })
        announce(`${good ? g.good(word(s.round.twin)) : g.bad(word(s.round.twin))} ${s.round.why}`)
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'There was a problem. Please try again.'))
      .finally(() => setBusy(false))
  }

  if (!state) {
    return error ? <Failed error={error} /> : <p className="muted" aria-live="polite">Loading.</p>
  }
  const round = state.round
  const tell = state.tells[0]
  const others = state.twin + state.draws

  return (
    <section aria-labelledby="duel-h" className="mine rps">
      <h1 id="duel-h" className="sr-only">{g.title}</h1>
      {games}
      <div className="twin-line">
        <span className="line-top">My Sym</span>
        <p>
          {visit.rounds === DUEL_ROUNDS ? `Today: ${g.mine.toLowerCase()} ${visit.good} of ${DUEL_ROUNDS}. Play on, or come back tomorrow.`
            : state.rounds === 0 ? g.first
              : round ? round.why
                : `We have played ${state.rounds} ${state.rounds === 1 ? 'round' : 'rounds'}. My next move is sealed.`}
        </p>
      </div>
      <div className="rps-throws" role="group" aria-label="Pick one">
        {g.picks.map(([id, name], at) => (
          <button key={id} className="rps-throw" disabled={busy} onClick={() => play(id)}>
            <Mark game={game} at={at} lit={round?.mine === id} sym={round?.twin === id} />
            <span>{name}</span>
          </button>
        ))}
      </div>
      <p className={round ? `rps-round ${round.outcome}` : 'rps-round'} aria-live="polite">
        {round
          ? <strong>{round.outcome === 'you' ? g.good(word(round.twin)) : g.bad(word(round.twin))}</strong>
          : <span className="muted">{g.sealed}</span>}
      </p>
      {error && <p className="error" role="alert">{error}</p>}
      <dl className="pair">
        <div><dt>{g.mine}</dt><dd>{state.you}</dd><dd className="muted">of {state.rounds}</dd></div>
        <div><dt>{g.theirs}</dt><dd>{others}</dd><dd className="muted">of {state.rounds}</dd></div>
      </dl>
      {tell && <p className="fine">A habit I found: {g.habit(word(tell.after), word(tell.then))} {tell.n} of {tell.of} times.</p>}
      <More label="About this game">
        {g.about} A simple computer program does it. No AI is used and nothing is paid. Change your habit and it has
        to learn again. The game built this duel. Next, creators build duels like it, and are paid when their duels
        are played.
      </More>
    </section>
  )
}

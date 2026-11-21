import { usePager } from './pager'
import { useState } from 'react'
import { api, type Meets } from './api'

type Seat = 'agency' | 'creator'

/** Pick a group, pay the royalty, meet one twin from it. The seat cannot name a twin: the game picks it. */
export function MeetPanel(props: { seat: Seat; meets: Meets; share: number; group?: string; onMet: (out: Meets, group: string) => void; onError: (e: unknown) => void }) {
  const { seat, meets, share, onMet, onError } = props
  const [group, setGroup] = useState(props.group ?? 'all')
  const [busy, setBusy] = useState(false)
  const forGame = Math.round(meets.price * share * 100) / 100
  const cost = Math.round((meets.price + meets.fee + forGame) * 100) / 100

  function go() {
    setBusy(true)
    api
      .meet(seat, group)
      .then((out) => onMet(out, meets.audiences.find((a) => a.id === group)?.name ?? ''))
      .catch(onError)
      .finally(() => setBusy(false))
  }

  return (
    <>
      <div className="chips" role="group" aria-label="Which group the Sym comes from">
        <span className="chips-label">A Sym from which group</span>
        {meets.audiences.filter((a) => !a.id.startsWith('view-')).map((a) => (
          <button key={a.id} className="chip" aria-pressed={group === a.id} onClick={() => setGroup(a.id)}>{a.name}</button>
        ))}
      </div>
      <button className="primary big" disabled={busy} onClick={go}>Meet one Sym for {cost} credits</button>
      <p className="fine">
        {meets.price} to the Sym's owner, {meets.fee} for your crew, {forGame} for the game. You see its nickname and its answers.
        The game picks the Sym, and only from Syms whose owner said yes. Many Syms here are BOT Syms for now.
      </p>
    </>
  )
}

/** The twins this seat paid to meet. */
export function MetList({ meets }: { meets: Meets }) {
  const { rows, pager } = usePager(meets.met, 1, `met-${meets.met.length}`)
  if (meets.met.length === 0) return null
  return (
    <>
      {pager}
      <ul className="lines met-list">
        {rows.map((m) => (
          <li key={m.at}>
            <span className="line-top">{new Date(m.at).toLocaleDateString()} · {m.paid} credits to its owner</span>
            {m.open ? (
              <>
                <span><strong>{m.nickname}</strong>{m.sample ? ' (a BOT Sym: made up, not a person)' : ''}</span>
                <span className="muted">Strongest in: {m.strongest.join(' and ')}</span>
                <ul className="met-answers">
                  {m.answers.map((a) => (
                    <li key={a.question}><span className="muted">{a.question}</span><span>{a.answer}</span></li>
                  ))}
                </ul>
              </>
            ) : (
              <span className="muted">The owner of this Sym turned one to one off. You cannot see it now.</span>
            )}
          </li>
        ))}
      </ul>
    </>
  )
}

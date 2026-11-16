import { usePager } from './pager'
import { useState } from 'react'
import { api, type Meets } from './api'
import { More } from './More'

type Seat = 'agency' | 'creator'

/** Pick a group, pay the royalty, meet one twin from it. The seat cannot name a twin: the game picks it. */
export function MeetPanel(props: { seat: Seat; meets: Meets; group?: string; onMet: (out: Meets, group: string) => void; onError: (e: unknown) => void }) {
  const { seat, meets, onMet, onError } = props
  const [group, setGroup] = useState(props.group ?? 'all')
  const [busy, setBusy] = useState(false)
  const cost = meets.price + meets.fee

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
      <div className="chips" role="group" aria-label="Which group the twin comes from">
        <span className="chips-label">A twin from which group</span>
        {meets.audiences.map((a) => (
          <button key={a.id} className="chip" aria-pressed={group === a.id} onClick={() => setGroup(a.id)}>{a.name}</button>
        ))}
      </div>
      <p className="fine">
        Meeting one twin costs {cost} credits. {meets.price} go to the twin's owner as a royalty. {meets.fee} go to the game for your crew.
      </p>
      <button className="primary big" disabled={busy} onClick={go}>Meet one twin</button>
      <More>
        Asking a group is cheap and shows totals only. Meeting one twin costs much more, because you see who it is:
        its nickname and its answers. You can only meet a twin whose owner said yes. You pick the group and the game
        picks the twin. If the owner later says no, the twin is hidden from you again.
      </More>
    </>
  )
}

/** The twins this seat paid to meet. */
export function MetList({ meets }: { meets: Meets }) {
  const { rows, pager } = usePager(meets.met, 1, 'met')
  if (meets.met.length === 0) return null
  return (
    <>
      <h2>Twins I met one to one</h2>
      <ul className="lines">
        {rows.map((m) => (
          <li key={m.at}>
            <span className="line-top">{new Date(m.at).toLocaleDateString()} · royalty {m.paid} credits</span>
            {m.open ? (
              <>
                <span><strong>{m.nickname}</strong>{m.sample ? ' (a made-up sample twin)' : ''}</span>
                <span className="muted">Strongest in: {m.strongest.join(' and ')}</span>
                <ul className="met-answers">
                  {m.answers.map((a) => (
                    <li key={a.question}><span className="muted">{a.question}</span><span>{a.answer}</span></li>
                  ))}
                </ul>
              </>
            ) : (
              <span className="muted">The owner of this twin turned one to one off. You cannot see it now.</span>
            )}
          </li>
        ))}
      </ul>
      {pager}
    </>
  )
}

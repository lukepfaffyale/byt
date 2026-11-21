import { useEffect, useState } from 'react'
import { api, type FeedbackOut } from './api'

type Seat = 'player' | 'agency' | 'creator'
type Moment = 'gate' | 'job' | 'question' | 'studio'

/**
 * One question after a moment, answered by one tap: was that worth it. Nothing is typed. The answer is stored
 * with the seat, the moment and the day, and with no player id, so it cannot be tied to a person.
 */
export function Worth({ seat, moment, who = 'My Sym' }: { seat: Seat; moment: Moment; who?: string }) {
  const [said, setSaid] = useState(false)
  // asked once in a visit for each seat and moment, so it never nags
  const mark = `byt.worth.${seat}.${moment}`
  const [asked] = useState(() => {
    try {
      return window.sessionStorage.getItem(mark) === '1'
    } catch {
      return false
    }
  })
  if (asked && !said) return null
  if (said) return <p className="worth fine" role="status">{who}: Thank you. No name goes with it.</p>
  const tap = (answer: 'yes' | 'unsure' | 'no') => () => {
    setSaid(true)
    try {
      window.sessionStorage.setItem(mark, '1')
    } catch {
      // private mode: it will simply be asked again
    }
    api.feedback(seat, moment, answer).catch(() => undefined)
  }
  return (
    <div className="worth chips" role="group" aria-label="Was that worth it?">
      <span className="chips-label">{who} asks: was that worth it?</span>
      <button className="chip" onClick={tap('yes')}>Yes</button>
      <button className="chip" onClick={tap('unsure')}>Not sure</button>
      <button className="chip" onClick={tap('no')}>No</button>
    </div>
  )
}

const SEAT: Record<string, string> = { player: 'Players', agency: 'Agencies', creator: 'Creators' }
const MOMENT: Record<string, string> = { gate: 'after a gate', job: 'after checking a job', question: 'after asking Syms', studio: 'after a studio job' }

/** What people said, as counts. Shown on the About page. */
export function WorthTotals() {
  const [data, setData] = useState<FeedbackOut | null>(null)
  useEffect(() => {
    let cancelled = false
    api.feedbackTotals().then((out) => { if (!cancelled) setData(out) }).catch(() => undefined)
    return () => { cancelled = true }
  }, [])
  if (!data) return null
  return (
    <>
      <h2>What people say</h2>
      {data.total === 0 && <p className="fine">No one has answered yet. After a gate, a job or a question, one tap says if it was worth it.</p>}
      {data.total > 0 && (
        <ul className="lines">
          {data.rows.map((r) => (
            <li key={`${r.seat}-${r.moment}`}>
              <span className="line-top">{SEAT[r.seat] ?? r.seat} · {MOMENT[r.moment] ?? r.moment}</span>
              <span>{r.yes} said yes, {r.unsure} were not sure, {r.no} said no.</span>
            </li>
          ))}
        </ul>
      )}
      <p className="fine">These are taps, stored with no name and no player number. BOT Syms do not answer.</p>
    </>
  )
}

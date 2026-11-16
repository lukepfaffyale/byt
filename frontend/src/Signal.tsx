import { useEffect, useState } from 'react'
import { api } from './api'
import { still } from './motion'

type Event = { at: string; who: string; label: string; detail: string; credits: number }
const WHO = { player: 'My twin', agency: 'My agency crew', creator: 'My creator crew' } as const

function ago(at: string): string {
  const min = Math.max(0, Math.round((Date.now() - new Date(at).getTime()) / 60000))
  if (min < 1) return 'now'
  if (min < 60) return `${min} min ago`
  if (min < 1440) return `${Math.round(min / 60)} h ago`
  return `${Math.round(min / 1440)} d ago`
}

const signed = (n: number) => `${n > 0 ? '+' : ''}${n}`

/**
 * The signal: one line where the twin and the crews report what they just did, on every screen.
 * The twin also asks here before it works, so the human is the one who says yes. Tap the line for the last moves.
 */
export function Signal(props: { tick: string; jobs: number; onWork: () => void }) {
  const { tick, jobs, onWork } = props
  const [events, setEvents] = useState<Event[]>([])
  const [open, setOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    api
      .wallets()
      .then((w) => {
        if (cancelled) return
        const all = w.wallets.flatMap((purse) => purse.lines.map((l) => ({ ...l, who: WHO[purse.seat] })))
        setEvents(all.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 8))
      })
      .catch(() => {
        // the signal is an extra: when it cannot load, the screens below still work
      })
    return () => {
      cancelled = true
    }
  }, [tick])

  const last = events[0]
  return (
    <aside className={still() ? 'signal calm' : 'signal'} aria-label="Signal from my twin and my crews">
      <button className="signal-head" aria-expanded={open} aria-controls="signal-list" onClick={() => setOpen(!open)}>
        <span className="signal-dot" aria-hidden="true" />
        <span className="line-top">Signal</span>
        <span className="signal-now">
          {last ? `${last.who} · ${last.label} · ${signed(last.credits)} · ${ago(last.at)}` : 'Quiet. Nothing has moved yet.'}
        </span>
      </button>
      {jobs > 0 && (
        <button className="signal-ask" onClick={onWork}>
          <span className="line-top">My twin asks</span> {jobs === 1 ? 'A job is open.' : `${jobs} jobs are open.`} May I go to work?
        </button>
      )}
      <ol id="signal-list" className="signal-list" hidden={!open}>
        {events.map((e, i) => (
          <li key={e.at + e.label + i}>
            <span className="line-top">{e.who} · {ago(e.at)}</span>
            <span className="signal-n">{signed(e.credits)}</span>
            <span>{e.label}</span>
          </li>
        ))}
        {events.length === 0 && <li><span>Nothing yet. Play a gate, or send your twin to work.</span></li>}
      </ol>
    </aside>
  )
}

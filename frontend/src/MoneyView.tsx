import { useEffect, useState } from 'react'
import { api, type Money, type PlanOption } from './api'
import { Tabs } from './Deck'
import { WalletCard, type Extra } from './WalletCard'
import { Failed } from './Retry'

type Seat = 'player' | 'agency' | 'creator'
const SEAT_TAB: Record<Seat, string> = { player: 'My Sym', agency: 'My agency', creator: 'My studio' }

/**
 * My money on one screen. The twin says in one line where things stand and offers the best next move.
 * Below it is one ledger; tap to change wallet, stream or page. Nothing here needs a scroll.
 */
export function MoneyView(props: { onChange?: () => void; onMove?: (id: string) => void }) {
  const [money, setMoney] = useState<Money | null>(null)
  const [seats, setSeats] = useState<Seat[]>(['player'])
  const [seat, setSeat] = useState<Seat>('player')
  const [best, setBest] = useState<PlanOption | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    Promise.all([api.money(), api.wallets(), api.plan()])
      .then(([m, w, p]) => {
        if (cancelled) return
        setMoney(m)
        setSeats(w.wallets.map((x) => x.seat))
        setBest(p.options[0] ?? null)
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'There was a problem. Please try again.')
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (error) return <Failed error={error} />
  if (!money) return <p className="muted" aria-live="polite">Loading.</p>

  const streams: [string, number][] = [['work', money.work_credits], ['questions from agencies', money.data_credits], ['skill steps', money.growth_credits]]
  const top = streams.reduce((a, b) => (b[1] > a[1] ? b : a))
  const costCredits = Math.round(money.cost_usd * 1000) / 10
  const says = money.earned === 0
    ? 'I have not earned anything yet. Send me to a job and I will start.'
    : `I have earned ${money.earned} credits. Most came from ${top[0]}. Running me has cost about ${costCredits} ${costCredits === 1 ? 'credit' : 'credits'}.`
  const cost: Extra = {
    id: 'Run', label: 'Run cost', n: `$${money.cost_usd.toFixed(3)}`,
    rows: [
      ...money.cost_by_agent.map((a) => ({ top: `${a.runs} ${a.runs === 1 ? 'run' : 'runs'}`, label: a.agent, n: `$${a.usd.toFixed(4)}` })),
      { top: 'share', label: `You played ${money.active_days} of the last 14 days`, n: `${Math.round(money.income_share * 100)}%`,
        detail: 'This is the share your Sym receives of what agencies pay it. A Sym whose owner has not played for 7 days receives less.' },
      { top: 'fund', label: 'The growth fund holds', n: String(money.fund), detail: 'It pays every player who passes a skill step.' },
      { top: 'rule', label: 'How the cost is paid', n: '', detail: `The cost is real. The game measures it each time this Sym uses AI. When your wallet holds enough, it pays that cost as a token fee. When it does not, the game pays. ${money.price_note}` },
    ],
    empty: 'Your Sym has not used AI yet.',
  }

  return (
    <section aria-labelledby="money-h" className="mine money">
      <h1 id="money-h" className="sr-only">Money</h1>
      <div className="twin-line">
        <span className="line-top">My Sym</span>
        <p>{says}</p>
        {best && props.onMove && (
          <button className="secondary" onClick={() => props.onMove?.(best.id)}>
            {best.title}{best.credits > 0 ? ` · +${best.credits}` : ''}
          </button>
        )}
      </div>
      {seats.length > 1 && (
        <Tabs tabs={seats.map((s) => ({ id: s, label: SEAT_TAB[s] }))} value={seat} onChange={setSeat} label="Choose a wallet" />
      )}
      <WalletCard key={seat} seat={seat} onChange={props.onChange} extra={seat === 'player' ? [cost] : []} />
    </section>
  )
}

import { useEffect, useState } from 'react'
import { api, type Money, type PlanOption, type WalletLine } from './api'
import { WalletCard, type Extra } from './WalletCard'
import { Failed } from './Retry'
import { EARNED, streamSums } from './streams'

type Seat = 'player' | 'agency' | 'creator'
const SEAT_TAB: Record<Seat, string> = { player: 'My Sym', agency: 'Agency', creator: 'Studio' }
const SEAT_FULL: Record<Seat, string> = { player: 'The wallet of my Sym', agency: 'The wallet of my agency', creator: 'The wallet of my studio' }
/** What each stream of income is, in the Sym's own words. The stream names are the ones on the chips below. */
const STREAM_IS: Record<string, string> = {
  Work: 'jobs I did and you checked',
  Data: 'answers that seats paid for',
  'One to one': 'seats that paid to meet me',
  Growth: 'skill steps you passed',
  Royalties: 'skill steps you built',
}
const two = (n: number) => String(Math.round(n * 100) / 100)

export type MoneyCue = { say: string; go: string; act: () => void }

/**
 * My money on one screen. My Sym says in one line where things stand and offers the best next move: the line
 * is handed to the shell (`onCue`), so it is said in the Sym's own panel and not a second time on the page.
 * Below it is one ledger; tap to change wallet, stream or page. Nothing here needs a scroll.
 */
export function MoneyView(props: { onChange?: () => void; onMove?: (id: string) => void; onCue?: (cue: MoneyCue | null) => void }) {
  const { onMove, onCue } = props
  const [money, setMoney] = useState<Money | null>(null)
  const [seats, setSeats] = useState<Seat[]>(['player'])
  const [seat, setSeat] = useState<Seat>('player')
  const [best, setBest] = useState<PlanOption | null>(null)
  const [lines, setLines] = useState<WalletLine[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    Promise.all([api.money(), api.wallets(), api.plan()])
      .then(([m, w, p]) => {
        if (cancelled) return
        setMoney(m)
        setSeats(w.wallets.map((x) => x.seat))
        setLines(w.wallets.find((x) => x.seat === 'player')?.lines ?? [])
        setBest(p.options[0] ?? null)
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'There was a problem. Please try again.')
      })
    return () => {
      cancelled = true
    }
  }, [])

  // the line is counted from the same wallet moves as the chips below it, so the two always agree
  const sums = streamSums(lines)
  const income = sums.filter(([id, n]) => EARNED.includes(id) && n > 0)
  const earned = income.reduce((n, [, v]) => n + v, 0)
  const top = income.reduce<[string, number] | null>((a, b) => (!a || b[1] > a[1] ? b : a), null)
  // one credit stands for one cent. The AI cost is what was measured; the wallet paid part of it as token fees.
  const ran = money ? Math.round(money.cost_usd * 10000) / 100 : 0
  const paid = Math.min(ran, -(sums.find(([id]) => id === 'AI cost')?.[1] ?? 0))
  const running = ran <= 0 ? ''
    : paid <= 0 ? ` Running me cost ${two(ran)} credits of AI, and the game paid for it.`
    : paid >= ran ? ` Running me cost ${two(ran)} credits of AI, paid from this wallet.`
    : ` Running me cost ${two(ran)} credits of AI: ${two(paid)} from this wallet, the rest paid by the game.`
  const says = !money ? ''
    : !top ? 'I have not earned anything yet. Send me to a job and I will start.'
    : `I have earned ${two(earned)} credits. Most came from ${top[0]} (${two(top[1])}): ${STREAM_IS[top[0]] ?? 'what I did for you'}.${running}`
  const go = best ? best.title : ''
  const bestId = best?.id ?? ''

  useEffect(() => {
    if (!onCue) return
    onCue(says && go && onMove ? { say: says, go, act: () => onMove(bestId) } : null)
    // the shell keeps the last line until this screen hands it a new one
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [says, go, bestId])

  if (error) return <Failed error={error} />
  if (!money) return <p className="muted" aria-live="polite">Loading.</p>

  const cost: Extra = {
    id: 'Run', label: 'Run cost', n: `$${money.cost_usd.toFixed(3)}`,
    rows: [
      ...money.cost_by_agent.map((a) => ({ top: `${a.runs} ${a.runs === 1 ? 'run' : 'runs'}`, label: a.agent, n: `$${a.usd.toFixed(4)}` })),
      { top: 'share', label: `You played ${money.active_days} of the last 14 days`, n: `${Math.round(money.income_share * 100)}%`,
        detail: 'This is the share your Sym receives of what agencies pay it. A Sym whose owner has not played for 7 days receives less.' },
      { top: 'fund', label: 'The growth fund holds', n: String(money.fund), detail: 'It pays every player who passes a skill step.' },
      { top: 'rule', label: 'How the cost is paid', n: '', detail: `The cost is real. The game measures it each time this Sym uses AI. When your wallet holds enough, it pays that cost as a token fee (the AI cost stream). When it does not, the game pays. ${money.price_note}` },
    ],
    empty: 'Your Sym has not used AI yet.',
  }

  return (
    <section aria-labelledby="money-h" className="mine money">
      <h1 id="money-h" className="sr-only">Money</h1>
      {/* the line is here too when no shell takes it (and always for a screen reader in reading order) */}
      {!onCue && <div className="twin-line"><span className="line-top">My Sym</span><p>{says}</p></div>}
      <WalletCard key={seat} seat={seat} rows={3} onChange={props.onChange} extra={seat === 'player' ? [cost] : []}
        aside={seats.length > 1 && (
          <div className="chips hold-seats" role="group" aria-label="Choose a wallet">
            {seats.map((s) => (
              <button key={s} className="chip" aria-label={SEAT_FULL[s]} aria-pressed={seat === s} onClick={() => setSeat(s)}>{SEAT_TAB[s]}</button>
            ))}
          </div>
        )} />
    </section>
  )
}

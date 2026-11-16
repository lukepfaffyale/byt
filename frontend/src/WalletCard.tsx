import { useEffect, useState } from 'react'
import { api, type WalletLine, type Wallets } from './api'
import { Tabs, type Tab } from './Deck'
import { ago, usePager } from './pager'
import { More } from './More'
import { Readout } from './Readout'

const SEAT_NAME = { player: 'my wallet', agency: 'my agency wallet', creator: 'my creator wallet' }

/** Each kind of move belongs to one stream, so the ledger can be read one stream at a time. */
const STREAM: Record<string, string> = {
  work: 'Work', data: 'Data', royalty: 'One to one', growth: 'Growth', sponsor: 'Growth', maker: 'Royalties', reach: 'Royalties',
  fee: 'AI cost', crew: 'Fees', claim: 'Fees', deposit: 'Added', grant: 'Added', hold: 'Held', release: 'Held',
  samples: 'Twins', fund_in: 'Fund',
}
const streamOf = (m: WalletLine) => (m.kind === 'data' && m.credits < 0 ? 'Twins' : STREAM[m.kind] ?? 'Other')

function amount(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2)
}
const signed = (n: number) => (n > 0 ? `+${amount(n)}` : n < 0 ? `-${amount(-n)}` : '0')

export type Extra = { id: string; label: string; n: string; rows: { top: string; label: string; n: string; detail?: string }[]; empty: string }

/**
 * One wallet as a ledger that fits one screen: what it holds, what came in against what went out, and the moves
 * one stream at a time, a few rows at a time. Tap a stream to sort, tap a row to see why, tap an arrow for older rows.
 * The other side of a move is named by what it is (an agency, the growth fund), never by who it is.
 */
export function WalletCard(props: { seat: 'player' | 'agency' | 'creator'; onChange?: () => void; extra?: Extra[] }) {
  const { seat, onChange, extra = [] } = props
  const [all, setAll] = useState<Wallets | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [said, setSaid] = useState('')
  const [stream, setStream] = useState('All')
  const [open, setOpen] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  useEffect(() => {
    let cancelled = false
    api
      .wallets()
      .then((w) => {
        if (!cancelled) setAll(w)
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'There was a problem. Please try again.')
      })
    return () => {
      cancelled = true
    }
  }, [])

  function add(credits: number) {
    setBusy(true)
    api
      .deposit(seat, credits)
      .then((w) => {
        setAll(w)
        setError('')
        setAdding(false)
        setSaid(`${credits} play credits were added to your wallet.`)
        onChange?.()
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'There was a problem. Please try again.'))
      .finally(() => setBusy(false))
  }

  const wallet = all?.wallets.find((w) => w.seat === seat)
  const lines = wallet?.lines ?? []
  const sums = new Map<string, number>()
  for (const m of lines) sums.set(streamOf(m), (sums.get(streamOf(m)) ?? 0) + m.credits)
  const tabs: Tab<string>[] = [
    { id: 'All', label: 'All', n: lines.length },
    ...[...sums.entries()].map(([id, n]) => ({ id, label: id, n: signed(Math.round(n * 100) / 100) })),
    ...extra.map((x) => ({ id: x.id, label: x.label, n: x.n })),
  ]
  const shown = tabs.some((t) => t.id === stream) ? stream : 'All'
  const special = extra.find((x) => x.id === shown)
  const rows = special
    ? special.rows.map((r, i) => ({ id: `${special.id}${i}`, ...r }))
    : lines.filter((m) => shown === 'All' || streamOf(m) === shown)
      .map((m, i) => ({ id: `${m.at}${m.kind}${i}`, top: ago(m.at), label: m.label, n: signed(m.credits), detail: m.detail }))
  const { rows: page, pager } = usePager(rows, 5, `${seat}|${shown}`)

  if (error && !all) return <p className="error" role="alert">{error}</p>
  if (!all) return <p className="muted" aria-live="polite">Loading.</p>
  if (!wallet) return null
  const moved = wallet.came_in + wallet.went_out

  return (
    <div className="ledger">
      <Readout value={wallet.balance} label={<>credits in {SEAT_NAME[seat]}</>} />
      <div className="flow" role="img" aria-label={`${amount(wallet.came_in)} credits came in. ${amount(wallet.went_out)} credits went out.`}>
        <span className="flow-n in">+{amount(wallet.came_in)}<span className="flow-name">in</span></span>
        <span className="flow-bar"><span style={{ width: `${moved > 0 ? (wallet.came_in / moved) * 100 : 50}%` }} /></span>
        <span className="flow-n">-{amount(wallet.went_out)}<span className="flow-name">out</span></span>
      </div>
      <Tabs tabs={tabs} value={shown} onChange={(id) => { setStream(id); setOpen(null) }} label="Sort the moves by stream" />
      {rows.length === 0 ? (
        <p className="muted ledger-empty">{special ? special.empty : 'Nothing has moved in or out of this wallet yet.'}</p>
      ) : (
        <ul className="ledger-rows">
          {page.map((r) => (
            <li key={r.id}>
              <button className="ledger-row" aria-expanded={r.detail ? open === r.id : undefined} disabled={!r.detail}
                onClick={() => setOpen(open === r.id ? null : r.id)}>
                <span className="ledger-at">{r.top}</span>
                <span className="ledger-what">{r.label}</span>
                <span className={r.n.startsWith('+') ? 'ledger-n in' : 'ledger-n'}>{r.n}</span>
                {open === r.id && r.detail && <span className="ledger-why">{r.detail}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="ledger-foot">
        {pager}
        {adding ? (
          <span className="chips" role="group" aria-label="Add play credits">
            {all.deposit_choices.map((n) => (
              <button key={n} className="chip" disabled={busy} onClick={() => add(n)}>+{n}</button>
            ))}
            <button className="link" onClick={() => setAdding(false)}>Close</button>
          </span>
        ) : (
          <button className="link" onClick={() => setAdding(true)}>Add play credits</button>
        )}
        <More label="About credits">{all.note}</More>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      <p className="sr-only" aria-live="polite">{said}</p>
    </div>
  )
}

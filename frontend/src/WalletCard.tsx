import { useEffect, useState } from 'react'
import { api, type Wallets } from './api'
import { Tabs, type Tab } from './Deck'
import { ago, usePager } from './pager'
import { More } from './More'
import { Failed } from './Retry'
import { streamOf, streamSums } from './streams'

function amount(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2)
}
const signed = (n: number) => (n > 0 ? `+${amount(n)}` : n < 0 ? `-${amount(-n)}` : '0')

export type Extra = { id: string; label: string; n: string; rows: { top: string; label: string; n: string; detail?: string }[]; empty: string }

/**
 * One wallet as a ledger that fits one screen: what it holds first, then what came in against what went out,
 * and the moves one stream at a time, a few rows at a time. Tap a stream to sort, tap a row to see why, tap an
 * arrow for older rows. The other side of a move is named by what it is (an agency, the growth fund), never by who it is.
 */
export function WalletCard(props: { seat: 'player' | 'agency' | 'creator'; onChange?: () => void; extra?: Extra[]; rows?: number; aside?: React.ReactNode }) {
  const { seat, onChange, extra = [], rows: size = 4, aside } = props
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
        // said in plain sight, with the new balance, so the tap is seen to have worked
        setSaid(`Added ${credits}. You now hold ${amount(w.wallets.find((x) => x.seat === seat)?.balance ?? 0)}.`)
        onChange?.()
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'There was a problem. Please try again.'))
      .finally(() => setBusy(false))
  }

  const wallet = all?.wallets.find((w) => w.seat === seat)
  const lines = wallet?.lines ?? []
  // the streams keep one fixed order, so a chip never changes place when a new move comes in
  const tabs: Tab<string>[] = [
    { id: 'All', label: 'All', n: lines.length },
    ...streamSums(lines).map(([id, n]) => ({ id, label: id, n: signed(n) })),
    ...extra.map((x) => ({ id: x.id, label: x.label, n: x.n })),
  ]
  const shown = tabs.some((t) => t.id === stream) ? stream : 'All'
  const special = extra.find((x) => x.id === shown)
  const rows = special
    ? special.rows.map((r, i) => ({ id: `${special.id}${i}`, ...r }))
    : lines.filter((m) => shown === 'All' || streamOf(m) === shown)
      .map((m, i) => ({ id: `${m.at}${m.kind}${i}`, top: ago(m.at), label: m.label, n: signed(m.credits), detail: m.detail }))
  const { rows: page, pager } = usePager(rows, size, `${seat}|${shown}`)

  if (error && !all) return <Failed error={error} />
  if (!all) return <p className="muted" aria-live="polite">Loading.</p>
  if (!wallet) return null
  const moved = wallet.came_in + wallet.went_out

  return (
    <div className="ledger">
      <div className="hold-row">
        <p className="hold">
          <span className="hold-n">{amount(wallet.balance)}</span>
          <span className="hold-name">credits in this wallet</span>
          <span className="hold-moved"><span className="in">+{amount(wallet.came_in)}</span> in · -{amount(wallet.went_out)} out</span>
        </p>
        {aside || (
          <div className="flow" role="img" aria-label={`Of all the credits that moved, ${moved > 0 ? Math.round((wallet.came_in / moved) * 100) : 50} percent came in.`}>
            <span className="flow-bar"><span style={{ width: `${moved > 0 ? (wallet.came_in / moved) * 100 : 50}%` }} /></span>
          </div>
        )}
      </div>
      {said && <p className="hold-said" role="status">{said}</p>}
      <Tabs tabs={tabs} value={shown} onChange={(id) => { setStream(id); setOpen(null) }} label="Sort the moves by stream" />
      {rows.length === 0 ? (
        <p className="muted ledger-empty">{special ? special.empty : 'Nothing has moved in or out of this wallet yet.'}</p>
      ) : (
        // an open row shows its reason in the room of the other rows, so the list never grows past its page
        <ul className="ledger-rows" style={{ '--rows': Math.min(size, rows.length) } as React.CSSProperties}>
          {page.filter((r) => !page.some((x) => x.id === open && x.detail) || r.id === open).map((r) => (
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
            <button className="secondary" onClick={() => setAdding(false)}>Close</button>
          </span>
        ) : (
          <button className="secondary" onClick={() => { setAdding(true); setSaid('') }}>Add play credits</button>
        )}
        <More label="About credits">{all.note}</More>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  )
}

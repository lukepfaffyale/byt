import { useState } from 'react'
import { usePager } from './pager'

export type Row = { id: string; top: string; label: string; n?: string; detail?: React.ReactNode; gold?: boolean }

/** A short list that never needs a scroll: a few rows at a time, tap a row to open it, tap an arrow for more. */
export function Rows(props: { rows: Row[]; pageKey: string; empty: string; size?: number; wide?: boolean }) {
  const { rows, pageKey, empty, size = 5, wide } = props
  const [open, setOpen] = useState<string | null>(null)
  const { rows: page, pager } = usePager(rows, size, pageKey)
  if (rows.length === 0) return <p className="muted ledger-empty">{empty}</p>
  return (
    <>
      <ul className={wide ? 'ledger-rows wide' : 'ledger-rows'}>
        {page.map((r) => (
          <li key={r.id}>
            <button className={open === r.id ? 'ledger-row open' : 'ledger-row'} aria-expanded={r.detail ? open === r.id : undefined} disabled={!r.detail}
              onClick={() => setOpen(open === r.id ? null : r.id)}>
              <span className={r.gold ? 'ledger-at gold' : 'ledger-at'}>{r.top}</span>
              <span className="ledger-what">{r.label}</span>
              <span className="ledger-n">{r.n ?? ''}</span>
              {open === r.id && r.detail && <span className="ledger-why">{r.detail}</span>}
            </button>
          </li>
        ))}
      </ul>
      {pager}
    </>
  )
}

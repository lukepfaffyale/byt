import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { usePager } from './pager'

export type Row = { id: string; top: string; label: string; n?: string; detail?: React.ReactNode; gold?: boolean }

/**
 * A pop-out over the page, for the detail of one thing a person tapped. It never moves the list under it.
 * Close, the Escape key and a tap outside all close it, and the keyboard goes back to where it was.
 */
export function Pop({ label, onClose, children }: { label: string; onClose: () => void; children: React.ReactNode }) {
  const [opener] = useState<Element | null>(() => document.activeElement)
  const shut = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    shut.current?.focus()
    return () => {
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus()
    }
  }, [opener])
  return createPortal(
    <div className="pick-pop" role="dialog" aria-modal="true" aria-label={label}
      onKeyDown={(e) => { if (e.key === 'Escape') onClose() }} onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="pick-pop-box mine-pop">
        <div className="mine-pop-body">{children}</div>
        <div className="pick-pop-foot">
          <span />
          <button ref={shut} className="primary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

/** Puts a view's small tools (its pager, its More) on the row of the sub-tabs, so they share one page with the list. */
export function Tools({ slot, children }: { slot: HTMLElement | null | undefined; children: React.ReactNode }) {
  return slot ? createPortal(children, slot) : null
}

/** A row of choices where one is on. Used for the three groups, the sub-tabs under them and the parts of one view. */
export function Pick<T extends string>(props: { label: string; value: T; onChange: (id: T) => void; className: string; items: { id: T; label: string; n?: number }[] }) {
  return (
    <div className={props.className} role="group" aria-label={props.label}>
      {props.items.map((t) => (
        <button key={t.id} type="button" aria-pressed={props.value === t.id} onClick={() => props.onChange(t.id)}>
          {t.label}{t.n !== undefined && <span className="mine-n">{t.n}</span>}
        </button>
      ))}
    </div>
  )
}

/**
 * A short list that never needs a scroll: a few rows at a time, tap a row to open it, tap an arrow for more.
 * On My Sym (where a slot is given) a row opens in a pop-out, so the list keeps its place, and the arrows for
 * more rows sit in the slot beside the sub-tabs. On the other screens a row opens in place, as before.
 */
export function Rows(props: { rows: Row[]; pageKey: string; empty: string; size?: number; wide?: boolean; slot?: HTMLElement | null }) {
  const { rows, pageKey, empty, size = 5, wide, slot } = props
  const pop = slot !== undefined
  const [open, setOpen] = useState<string | null>(null)
  const { rows: page, pager } = usePager(rows, size, pageKey)
  const shown = pop ? rows.find((r) => r.id === open && r.detail) : undefined
  if (rows.length === 0) return <p className="muted ledger-empty">{empty}</p>
  return (
    <>
      <ul className={wide ? 'ledger-rows wide' : 'ledger-rows'}>
        {page.map((r) => (
          <li key={r.id}>
            {pop ? (
              <button className="ledger-row" aria-haspopup={r.detail ? 'dialog' : undefined} disabled={!r.detail} onClick={() => setOpen(r.id)}>
                <span className={r.gold ? 'ledger-at gold' : 'ledger-at'}>{r.top}</span>
                <span className="ledger-what">{r.label}</span>
                <span className="ledger-n">{r.n ?? ''}</span>
              </button>
            ) : (
              <button className={open === r.id ? 'ledger-row open' : 'ledger-row'} aria-expanded={r.detail ? open === r.id : undefined} disabled={!r.detail}
                onClick={() => setOpen(open === r.id ? null : r.id)}>
                <span className={r.gold ? 'ledger-at gold' : 'ledger-at'}>{r.top}</span>
                <span className="ledger-what">{r.label}</span>
                <span className="ledger-n">{r.n ?? ''}</span>
                {open === r.id && r.detail && <span className="ledger-why">{r.detail}</span>}
              </button>
            )}
          </li>
        ))}
      </ul>
      {pop ? <Tools slot={slot}>{pager}</Tools> : pager}
      {shown && (
        <Pop label={shown.label} onClose={() => setOpen(null)}>
          <p className="line-top">{shown.top}{shown.n ? ` · ${shown.n}` : ''}</p>
          <p className="mine-pop-title">{shown.label}</p>
          <p>{shown.detail}</p>
        </Pop>
      )}
    </>
  )
}

import { useId, useState } from 'react'
import { createPortal } from 'react-dom'

/**
 * A small "More" button. A tap opens a short note in a pop-out over the page, and a tap closes it.
 * It does not open when a pointer passes over it, and it never covers the controls it sits beside.
 */
export function More({ label = 'More about this screen', children }: { label?: string; children: React.ReactNode }) {
  const id = useId()
  const [open, setOpen] = useState(false)

  return (
    <span className="more">
      <button type="button" className="more-mark" aria-expanded={open} aria-controls={id} aria-label={label} onClick={() => setOpen(!open)}>
        More
      </button>
      {open && createPortal(
        <div className="pick-pop" role="dialog" aria-modal="true" aria-label={label}
          onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false) }} onClick={(e) => { if (e.target === e.currentTarget) setOpen(false) }}>
          <div className="pick-pop-box">
            <p id={id} className="more-text">{children}</p>
            <div className="pick-pop-foot">
              <span />
              <button className="primary" autoFocus onClick={() => setOpen(false)}>Close</button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </span>
  )
}

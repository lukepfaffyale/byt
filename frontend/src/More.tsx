import { useId, useState } from 'react'

/** A short screen with more behind it: a small mark that opens a note on hover, on focus or on tap. */
export function More({ label = 'More about this screen', children }: { label?: string; children: React.ReactNode }) {
  const id = useId()
  const [pinned, setPinned] = useState(false)
  const [near, setNear] = useState(false)
  const open = pinned || near

  return (
    <span className="more" onMouseEnter={() => setNear(true)} onMouseLeave={() => setNear(false)}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          setPinned(false)
          setNear(false)
        }
      }}>
      <button type="button" className="more-mark" aria-expanded={open} aria-controls={id} aria-label={label}
        onClick={() => setPinned(!pinned)} onFocus={() => setNear(true)} onBlur={() => setNear(false)}>
        More
      </button>
      <span id={id} role="note" className="more-note" hidden={!open}>{children}</span>
    </span>
  )
}

import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * A screen that does not scroll. On a wide window the content of a screen is laid out in pages that are each
 * as tall as the space left, and a tap turns the page. Nothing is cut off and nothing needs a scroll wheel.
 * On a narrow window (a phone) the content flows down the page as usual and this adds nothing.
 *
 * The pages are made by the browser's own column layout, so every screen gets them without being rewritten.
 * Moving by keyboard into something on a later page turns to that page by itself.
 */
export function Pages({ children, calm }: { children: React.ReactNode; calm: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  const [page, setPage] = useState(0)
  const [count, setCount] = useState(1)

  const measure = useCallback(() => {
    const el = ref.current
    if (!el) return
    const step = el.clientWidth + GAP
    const paged = getComputedStyle(el).overflowX === 'hidden'
    // count the pages that hold something a person can see: a hidden label must not add an empty page
    let far = 0
    if (paged) {
      const left = el.getBoundingClientRect().left - el.scrollLeft
      for (const node of el.querySelectorAll<HTMLElement>('*')) {
        if (node.offsetWidth < 4 || node.offsetHeight < 4 || node.classList.contains('sr-only')) continue
        far = Math.max(far, node.getBoundingClientRect().right - left)
      }
    }
    const n = paged && step > GAP ? Math.max(1, Math.ceil((far - 4) / step)) : 1
    setCount(n)
    setPage(Math.min(n - 1, Math.round(el.scrollLeft / step)))
  }, [])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    // many small changes (a line being typed out) ask for one count, at the next frame
    let due = 0
    const soon = () => {
      if (due) return
      due = requestAnimationFrame(() => {
        due = 0
        measure()
      })
    }
    soon()
    const sizes = new ResizeObserver(soon)
    sizes.observe(el)
    const changes = new MutationObserver(soon)
    changes.observe(el, { childList: true, subtree: true, characterData: true })
    window.addEventListener('resize', soon)
    return () => {
      cancelAnimationFrame(due)
      sizes.disconnect()
      changes.disconnect()
      window.removeEventListener('resize', soon)
    }
  }, [measure])

  const turn = (to: number) => {
    const el = ref.current
    if (!el) return
    el.scrollTo({ left: to * (el.clientWidth + GAP), behavior: calm ? 'auto' : 'smooth' })
  }

  return (
    <div className="pages">
      <div ref={ref} className="pages-flow" onScroll={measure}>{children}</div>
      {count > 1 && (
        <nav className="pages-nav" aria-label="Pages of this screen">
          <button className="secondary" disabled={page === 0} onClick={() => turn(page - 1)}>Back</button>
          <span aria-live="polite">Page {page + 1} of {count}</span>
          <button className="primary" disabled={page >= count - 1} onClick={() => turn(page + 1)}>Next</button>
        </nav>
      )}
    </div>
  )
}

const GAP = 48 // the space between two pages, the same number as in the style sheet

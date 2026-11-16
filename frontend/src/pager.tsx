import { useState } from 'react'

/** How long ago something happened, in a few characters. */
export function ago(at: string): string {
  const min = Math.max(0, Math.round((Date.now() - new Date(at).getTime()) / 60000))
  if (min < 1) return 'now'
  if (min < 60) return `${min} min`
  if (min < 1440) return `${Math.round(min / 60)} h`
  return `${Math.round(min / 1440)} d`
}

/** A few rows at a time, with two taps to move. The page resets when the key changes (a new tab, a new list). */
export function usePager<T>(items: T[], size: number, key: string) {
  const [at, setAt] = useState({ key, page: 0 })
  const pages = Math.max(1, Math.ceil(items.length / size))
  const page = at.key === key ? Math.min(at.page, pages - 1) : 0
  const go = (next: number) => setAt({ key, page: Math.max(0, Math.min(pages - 1, next)) })
  return {
    rows: items.slice(page * size, page * size + size),
    pager: pages > 1 && (
      <div className="pager" role="group" aria-label="More rows">
        <button className="pager-go" disabled={page === 0} onClick={() => go(page - 1)} aria-label="Newer rows">&lsaquo;</button>
        <span className="pager-at" aria-live="polite">{page + 1} / {pages}</span>
        <button className="pager-go" disabled={page >= pages - 1} onClick={() => go(page + 1)} aria-label="Older rows">&rsaquo;</button>
      </div>
    ),
  }
}

import { useEffect, useState } from 'react'
import { api, type SymCode } from './api'
import { More } from './More'
import { Failed } from './Retry'

const LETTERS: { id: 'T' | 'G' | 'A' | 'C'; name: string; what: string; color: string }[] = [
  { id: 'T', name: 'Taps', what: 'each pick you made as a player', color: '#e8eefa' },
  { id: 'G', name: 'Growth', what: 'each thing you proved', color: '#ffd682' },
  { id: 'A', name: 'Agency', what: 'each thing you did as an agency', color: '#ffbf7a' },
  { id: 'C', name: 'Creator', what: 'each thing you did as a creator', color: '#86d3e6' },
]
const SHOWN = 96  // the newest blocks drawn, so the strand, its key and its counts share one page
const COLOR = Object.fromEntries(LETTERS.map((l) => [l.id, l.color]))

/**
 * The Sym's code: one block for each thing its person did, in the order they did it. Four letters, like the four
 * bases of DNA: T a tap, G a proof, A an agency act, C a creator act. A tap takes the color of the area of the
 * mind it fell in. The server builds it from the person's own rows; the line is written by counting, not by a model.
 */
export function CodeView({ brief = false }: { brief?: boolean }) {
  const [code, setCode] = useState<SymCode | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let cancelled = false
    api.code().then((c) => { if (!cancelled) setCode(c) })
      .catch((e: unknown) => { if (!cancelled) setError(e instanceof Error ? e.message : 'There was a problem. Please try again.') })
    return () => { cancelled = true }
  }, [])
  if (error) return <Failed error={error} />
  if (!code) return <p className="fine" role="status">Reading my code...</p>
  const hidden = code.total - Math.min(code.bases.length, SHOWN)
  return (
    <div className="code">
      <p className="code-line">My Sym: {code.line}</p>
      <div className="code-strand" role="img"
        aria-label={`My Sym's code: ${code.total} blocks. ${LETTERS.map((l) => `${code.counts[l.id] ?? 0} ${l.name}`).join(', ')}.`}>
        {hidden > 0 && <span className="code-more">+{hidden} earlier</span>}
        {code.bases.slice(-SHOWN).map((b, i) => (
          <span key={i} className={b.apart ? 'code-base code-apart' : 'code-base'} style={{ color: b.color || COLOR[b.letter], animationDelay: `${Math.min(i, 160) * 8}ms` }}>{b.letter}</span>
        ))}
        {code.total === 0 && <span className="code-more">No blocks yet</span>}
      </div>
      {code.others > 0 && (
        <p className="code-stats">
          <span><strong>{code.same}</strong> of {code.others} other Syms match me</span>
          <span>the nearest matches <strong>{code.near[0]}</strong> of {code.near[1]}</span>
          <span><strong>{code.apart}</strong> bright blocks are picks that are more mine</span>
        </p>
      )}
      {!brief && <ul className="code-key">
        {LETTERS.map((l) => (
          <li key={l.id}>
            <span className="code-base" style={{ color: l.color }}>{l.id}</span>
            <span><strong>{code.counts[l.id] ?? 0}</strong> {l.name}: {l.what}</span>
          </li>
        ))}
      </ul>}
      <More>
        {code.gaps.length > 0 ? `No blocks yet in: ${code.gaps.join(', ')}. ` : ''}Each block is one thing you did, in order. T is a tap as a player, in the color of the area it fell in. G is something you proved:
        a gate finished, a job checked, a certificate. A is something you did as an agency, C as a creator. Blocks are what I am made of.
        The lines between Syms are how we reach each other. A bright block is a pick where most other Syms went another way. No pick is better than another: a code is worth more when it is true, not when it is strange. The other Syms include BOT Syms, whose picks are random. This is a record of choices in a game. It measures no body and no brain.
      </More>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { api, type SymCode } from './api'
import { More } from './More'
import { Pop, Tools } from './Rows'
import { Failed } from './Retry'

const LETTERS: { id: 'T' | 'G' | 'A' | 'C'; name: string; what: string; color: string }[] = [
  { id: 'T', name: 'Taps', what: 'each pick you made as a player', color: '#e8eefa' },
  { id: 'G', name: 'Growth', what: 'each thing you proved', color: '#ffd682' },
  { id: 'A', name: 'Agency', what: 'each thing you did as an agency', color: '#ffbf7a' },
  { id: 'C', name: 'Creator', what: 'each thing you did as a creator', color: '#86d3e6' },
]
const SHOWN = 96  // the newest blocks drawn after a gate
const SHOWN_MINE = 56  // on My Sym: three short rows, so the strand, its key and its counts share one page
const COLOR = Object.fromEntries(LETTERS.map((l) => [l.id, l.color]))
const NAME = Object.fromEntries(LETTERS.map((l) => [l.id, l.name]))

/** One block, with the plain facts of its story. The server sends the person's own row, and the others as counts only. */
type Base = SymCode['bases'][number] & { what?: string; gate?: string; prompt?: string; picked?: string; same?: number; of?: number }

/**
 * The Sym's code: one block for each thing its person did, in the order they did it. Four letters, like the four
 * bases of DNA: T a tap, G a proof, A an agency act, C a creator act. A tap takes the color of the area of the
 * mind it fell in. The server builds it from the person's own rows; the line is written by counting, not by a model.
 * A tap on a block opens its story in a pop-out. On My Sym the small More button sits in the slot beside the sub-tabs.
 */
export function CodeView({ brief = false, slot }: { brief?: boolean; slot?: HTMLElement | null }) {
  const [code, setCode] = useState<SymCode | null>(null)
  const [error, setError] = useState('')
  const [open, setOpen] = useState<number | null>(null)
  useEffect(() => {
    let cancelled = false
    api.code().then((c) => { if (!cancelled) setCode(c) })
      .catch((e: unknown) => { if (!cancelled) setError(e instanceof Error ? e.message : 'There was a problem. Please try again.') })
    return () => { cancelled = true }
  }, [])
  if (error) return <Failed error={error} />
  if (!code) return <p className="fine" role="status">Reading my code...</p>
  const bases: Base[] = code.bases.slice(-(brief ? SHOWN : SHOWN_MINE))
  const hidden = code.total - bases.length
  const picked = open === null ? undefined : bases[open]
  const more = (
    <More>
      {code.gaps.length > 0 ? `No blocks yet in: ${code.gaps.join(', ')}. ` : ''}Each block is one thing you did, in order. Tap a block to see what it was. T is a tap as a player, in the color of the area it fell in. G is something you proved:
      a gate finished, a job checked, a certificate. A is something you did as an agency, C as a creator. Blocks are what I am made of.
      The lines between Syms are how we reach each other. A bright block is a pick where most other Syms went another way. No pick is better than another: a code is worth more when it is true, not when it is strange. The other Syms include BOT Syms, whose picks are random. This is a record of choices in a game. It measures no body and no brain.
    </More>
  )
  return (
    <div className={brief ? 'code' : 'code code-mine'}>
      <p className="code-line">{brief
        // after the first gate: one short line. The whole story is on My Sym, under Code.
        ? <>My code: <strong>{code.total} blocks</strong>. {code.others === 0 ? '' : code.same === 0 ? `No other Sym of ${code.others} has these.` : `${code.same} of ${code.others} Syms match.`}</>
        : <>My Sym: {code.line}</>}</p>
      <div className="code-strand" role="group"
        aria-label={`My Sym's code: ${code.total} blocks. ${LETTERS.map((l) => `${code.counts[l.id] ?? 0} ${l.name}`).join(', ')}. Tap a block to see what it was.`}>
        {hidden > 0 && <span className="code-more">+{hidden} earlier</span>}
        {bases.map((b, i) => (
          <button key={i} type="button" className={b.apart ? 'code-base code-apart' : 'code-base'} aria-haspopup="dialog"
            aria-label={`Block ${hidden + i + 1}: ${b.letter}, ${b.what || NAME[b.letter]}${b.apart ? ', a pick that is more mine' : ''}`}
            style={{ color: b.color || COLOR[b.letter], animationDelay: `${Math.min(i, 160) * 8}ms` }} onClick={() => setOpen(i)}>{b.letter}</button>
        ))}
        {code.total === 0 && <span className="code-more">No blocks yet</span>}
      </div>
      {!brief && <ul className="code-key">
        {LETTERS.map((l) => (
          <li key={l.id}>
            <span className="code-base" style={{ color: l.color }}>{l.id}</span>
            <span><strong>{code.counts[l.id] ?? 0}</strong> {l.name}</span>
          </li>
        ))}
        {code.others > 0 && (
          <li>
            <span className="code-base code-apart" style={{ color: COLOR.T }} aria-hidden="true">T</span>
            <span><strong>{code.apart}</strong> more mine</span>
          </li>
        )}
      </ul>}
      {/* after the first gate the strand speaks for itself: the long note lives on My Sym, under Code */}
      {brief ? null : slot === undefined ? more : <Tools slot={slot}>{more}</Tools>}
      {picked && open !== null && (
        <Pop label={`Block ${hidden + open + 1} of my code`} onClose={() => setOpen(null)}>
          <p className="code-pop-head">
            <span className={picked.apart ? 'code-base code-apart' : 'code-base'} style={{ color: picked.color || COLOR[picked.letter] }} aria-hidden="true">{picked.letter}</span>
            <span className="line-top">{picked.letter} · {NAME[picked.letter]} · block {hidden + open + 1} of {code.total}</span>
          </p>
          {picked.prompt ? (
            <>
              {picked.gate && <p className="line-top">{picked.gate}</p>}
              <p className="mine-pop-title">{picked.prompt}</p>
              <p>You picked: {picked.picked}</p>
              {picked.of ? (
                <p className="muted">
                  {picked.same} of {picked.of} other Syms picked the same. {picked.apart ? 'Most other Syms went the other way.' : (picked.same ?? 0) * 2 > picked.of ? 'Most other Syms picked this too.' : 'The other Syms were split.'}
                </p>
              ) : (
                <p className="muted">Too few other Syms have answered this card to compare.</p>
              )}
            </>
          ) : (
            <>
              <p className="mine-pop-title">{picked.what || LETTERS.find((l) => l.id === picked.letter)?.what}</p>
              <p className="muted">{NAME[picked.letter]}: {LETTERS.find((l) => l.id === picked.letter)?.what}.</p>
            </>
          )}
        </Pop>
      )}
    </div>
  )
}

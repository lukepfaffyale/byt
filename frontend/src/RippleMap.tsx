import { useEffect, useState } from 'react'
import { api, type Ripple } from './api'
import { Rows } from './Rows'

type Seat = 'player' | 'agency' | 'creator' | 'everyone'
const AT: Record<Seat, [number, number]> = { player: [62, 112], agency: [190, 36], creator: [190, 188], everyone: [306, 112] }
const NAME: Record<Seat, string> = { player: 'Me', agency: 'My agency', creator: 'My studio', everyone: 'Everyone' }
const SAY: Record<Seat, string> = { player: 'me', agency: 'my agency', creator: 'my studio', everyone: 'everyone' }

/**
 * What one person set moving, drawn between their own seats and everyone else. Each line is a real count from the
 * books: taps that became answers, answers that were paid for, steps that were built and passed. Tap a seat to read it.
 */
/** The six ways the circle can turn. Each is drawn faint until a count from the books is drawn over it. */
const PATHS: { src: Seat; dst: Seat; say: string; at?: number }[] = [
  { src: 'player', dst: 'everyone', say: 'my taps' },
  { src: 'everyone', dst: 'player', say: 'pay me' },
  { src: 'agency', dst: 'everyone', say: 'asks, pays' },
  { src: 'everyone', dst: 'creator', say: 'pass steps' },
  { src: 'creator', dst: 'everyone', say: 'new steps' },
  { src: 'agency', dst: 'creator', say: 'shows needs', at: 0.2 },
]

export function RippleMap(props: { calm: boolean; onSeat: (seat: 'agency' | 'creator') => void; agencies?: number; botAgencies?: number }) {
  const { calm, onSeat, agencies = 0, botAgencies = 0 } = props
  const [data, setData] = useState<Ripple | null>(null)
  const [pick, setPick] = useState<Seat>('player')
  const [earning, setEarning] = useState<boolean | null>(null)
  const [turn, setTurn] = useState(0)

  useEffect(() => {
    let cancelled = false
    api.ripple().then((r) => { if (!cancelled) setData(r) }).catch(() => undefined)
    api.jobs().then((j) => { if (!cancelled) setEarning(j.data_income) }).catch(() => undefined)
    return () => { cancelled = true }
  }, [turn])

  if (!data) return <p className="muted" aria-live="polite">Following what you set moving.</p>

  const open: Record<Seat, boolean> = { player: true, agency: data.agency, creator: data.creator, everyone: true }
  const pairs = new Map<string, { src: Seat; dst: Seat; n: number }>()
  for (const l of data.links) {
    const key = `${l.src}>${l.dst}`
    const pair = pairs.get(key) ?? { src: l.src as Seat, dst: l.dst as Seat, n: 0 }
    pair.n += l.n
    pairs.set(key, pair)
  }
  const flows = [...pairs.values()]
  const top = Math.max(1, ...flows.map((f) => f.n))
  const mine = data.links.filter((l) => l.src === pick || l.dst === pick)
  const said = data.links.map((l) => l.text).join(' ')

  const asks = Math.round(data.counts?.asks ?? 0)
  return (
    <>
      <p className="line-top ripple-say">Arrows show the way. <span className="ripple-out">Out: what I give.</span> <span className="ripple-in">Back: what comes to me.</span></p>
      <svg className="commons-map ripple" viewBox="0 0 360 224" role="img"
        aria-label={`My circle: what I give goes out to everyone, and what comes back is paid to me and my seats. ${said || 'Nothing has moved yet.'}`}>
        <defs>
          <marker id="ripple-tip-out" viewBox="0 0 8 8" refX="6" refY="4" markerWidth="7" markerHeight="7" markerUnits="userSpaceOnUse" orient="auto"><path d="M0 0 L8 4 L0 8 Z" className="ripple-tip out" /></marker>
          <marker id="ripple-tip-in" viewBox="0 0 8 8" refX="6" refY="4" markerWidth="7" markerHeight="7" markerUnits="userSpaceOnUse" orient="auto"><path d="M0 0 L8 4 L0 8 Z" className="ripple-tip in" /></marker>
          <marker id="ripple-tip-none" viewBox="0 0 8 8" refX="6" refY="4" markerWidth="5" markerHeight="5" markerUnits="userSpaceOnUse" orient="auto"><path d="M0 0 L8 4 L0 8 Z" className="ripple-tip none" /></marker>
        </defs>
        {PATHS.map((p) => {
          // each way is its own curve: the way out bows to one side and the way back to the other, so they never sit
          // on top of each other, and each ends in an arrowhead just short of the seat it goes to
          const [ax, ay] = AT[p.src]
          const [bx, by] = AT[p.dst]
          const len = Math.hypot(bx - ax, by - ay) || 1
          const ux = (bx - ax) / len
          const uy = (by - ay) / len
          const bow = p.src === 'agency' && p.dst === 'creator' ? 0 : 20
          const ra = (p.src === 'everyone' ? 15 : 10) + 3
          const rb = (p.dst === 'everyone' ? 15 : 10) + 5
          const x1 = ax + ux * ra, y1 = ay + uy * ra
          const x2 = bx - ux * rb, y2 = by - uy * rb
          const cx = (x1 + x2) / 2 - uy * bow, cy = (y1 + y2) / 2 + ux * bow
          const flow = pairs.get(`${p.src}>${p.dst}`)
          const n = flow?.n ?? 0
          const back = p.src === 'everyone' // from everyone to me or to one of my seats
          const lit = n > 0 && (p.src === pick || p.dst === pick)
          // the words sit on the outside of the curve, a third of the way along the two long ways so they clear the middle
          const t = p.at ?? (p.src === 'player' ? 0.34 : p.dst === 'player' ? 0.66 : 0.5)
          const px = (1 - t) * (1 - t) * x1 + 2 * (1 - t) * t * cx + t * t * x2
          const py = (1 - t) * (1 - t) * y1 + 2 * (1 - t) * t * cy + t * t * y2
          const out = bow ? 8 : 0
          const kind = n > 0 ? (back ? 'in' : 'out') : 'none'
          return (
            <g key={`${p.src}>${p.dst}`} className={n > 0 ? (lit ? 'ripple-link' : 'ripple-link dim') : 'ripple-ghost'}>
              <path d={`M${x1} ${y1} Q${cx} ${cy} ${x2} ${y2}`} markerEnd={`url(#ripple-tip-${kind})`}
                className={n > 0 ? `ripple-flow ${kind}${calm ? ' still' : ''}` : undefined}
                strokeWidth={n > 0 ? 0.9 + 2.2 * Math.sqrt(n / top) : undefined} />
              <text className={n > 0 ? `ripple-n ${kind}` : undefined} x={px - uy * out - (p.at ? 26 : 0)} y={py + ux * out + 2.5} textAnchor="middle">
                {n > 0 ? `${p.say} · ${n}` : p.say}
              </text>
            </g>
          )
        })}
        {(Object.keys(AT) as Seat[]).map((seat) => {
          const [x, y] = AT[seat]
          return (
            <g key={seat} className={`ripple-seat ${seat}${open[seat] ? '' : ' closed'}${pick === seat ? ' on' : ''}`}>
              <circle cx={x} cy={y} r={seat === 'everyone' ? 15 : 10} />
              <text x={x} y={y + (seat === 'agency' ? -15 : seat === 'everyone' ? 27 : 22)} textAnchor="middle">{NAME[seat]}</text>
            </g>
          )
        })}
      </svg>
      <div className="chips world-keys" role="group" aria-label="Read one seat">
        {(Object.keys(AT) as Seat[]).map((seat) => (
          <button key={seat} className="chip" aria-pressed={pick === seat} onClick={() => setPick(seat)}>{NAME[seat]}</button>
        ))}
      </div>
      {!open[pick] ? (
        <p className="world-say">
          You have no {pick === 'agency' ? 'agency' : 'studio'} yet. {pick === 'agency'
            ? 'An agency asks Syms questions and pays them. Your own Sym can be one of them, so you see your taps come back as answers.'
            : 'A studio builds skill steps. You see who plays what you made, and each pass pays you.'}{' '}
          <button className="link" onClick={() => onSeat(pick === 'agency' ? 'agency' : 'creator')}>Open {pick === 'agency' ? 'an agency' : 'a studio'}</button>
        </p>
      ) : (
        <Rows pageKey={pick} size={3} wide
          empty={pick !== 'player' ? 'Nothing has moved here yet. One tap starts it.'
            : earning === false ? 'My Sym is not in the pool yet.'
              : asks === 0 ? `I can be asked now. ${botAgencies} of ${agencies} agencies are BOT agencies.` : 'Nothing has moved here yet. One tap starts it.'}
          rows={mine.map((l, i) => ({ id: `${pick}${i}`, top: `${SAY[l.src as Seat]} to ${SAY[l.dst as Seat]}`, label: l.text,
            n: l.credits > 0 ? `${l.credits} cr` : '', gold: l.credits > 0 }))} />
      )}
      {pick === 'player' && earning === false && (
        <button className="secondary" onClick={() => { api.consent(true).then(() => setTurn((n) => n + 1)).catch(() => undefined) }}>Let my Sym earn</button>
      )}
      <p className="fine ripple-close">Alone a Sym is black and white. Color comes from other people.<br />Together we build toward something greater.</p>
    </>
  )
}

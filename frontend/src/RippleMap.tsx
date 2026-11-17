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
export function RippleMap(props: { calm: boolean; onSeat: (seat: 'agency' | 'creator') => void }) {
  const { calm, onSeat } = props
  const [data, setData] = useState<Ripple | null>(null)
  const [pick, setPick] = useState<Seat>('player')

  useEffect(() => {
    let cancelled = false
    api.ripple().then((r) => { if (!cancelled) setData(r) }).catch(() => undefined)
    return () => { cancelled = true }
  }, [])

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

  return (
    <>
      <svg className="commons-map ripple" viewBox="0 0 360 224" role="img"
        aria-label={`What you set moving, drawn as lines between you, your agency, your studio and everyone else. ${said || 'Nothing has moved yet.'}`}>
        {flows.map((f) => {
          const [x1, y1] = AT[f.src]
          const [x2, y2] = AT[f.dst]
          const len = Math.hypot(x2 - x1, y2 - y1) || 1
          // two lines between the same seats sit side by side, one for each way
          const ox = (-(y2 - y1) / len) * 4
          const oy = ((x2 - x1) / len) * 4
          const lit = f.src === pick || f.dst === pick
          return (
            <g key={`${f.src}>${f.dst}`} className={lit ? 'ripple-link' : 'ripple-link dim'}>
              <line className={calm ? 'ripple-flow still' : 'ripple-flow'} x1={x1 + ox} y1={y1 + oy} x2={x2 + ox} y2={y2 + oy}
                strokeWidth={0.8 + 2.4 * Math.sqrt(f.n / top)} />
              {lit && <text className="ripple-n" x={(x1 + x2) / 2 + ox * 2.4} y={(y1 + y2) / 2 + oy * 2.4 + 2} textAnchor="middle">{f.n}</text>}
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
        <Rows pageKey={pick} size={3} wide empty="Nothing has moved here yet. One tap starts it."
          rows={mine.map((l, i) => ({ id: `${pick}${i}`, top: `${SAY[l.src as Seat]} to ${SAY[l.dst as Seat]}`, label: l.text,
            n: l.credits > 0 ? `${l.credits} cr` : '', gold: l.credits > 0 }))} />
      )}
    </>
  )
}

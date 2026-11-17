import { useEffect, useState } from 'react'
import { api, type Commons } from './api'
import { Tabs } from './Deck'
import { Rows } from './Rows'
import { still } from './motion'
import { RippleMap } from './RippleMap'

const HUES = ['#ffd98a', '#bfe6ff', '#a6e6c3', '#ffab9b', '#d9c2ff', '#ffc2e2']
const WHEN: Record<string, string> = { now: 'Now', today: 'Today', week: 'This week', earlier: 'Earlier' }
const CX = 180
const CY = 112
const MOST = 96 // points drawn; past this the count is still said in words
const TURN = Math.PI * (3 - Math.sqrt(5)) // the angle a sunflower uses, so points never line up

type Dot = { x: number; y: number; real: boolean; you: boolean; live: boolean; hue: string; wait: number }

/** Every Sym gets a place around the pool. People are spread evenly among the stand-ins, so the color is everywhere. */
function places(people: number, standIns: number, today: number): Dot[] {
  const all = people + standIns
  const n = Math.min(MOST, all)
  const shown = all > 0 ? Math.round((people / all) * n) : 0
  const dots: Dot[] = []
  let real = 0
  for (let i = 0; i < n; i++) {
    const isReal = Math.floor(((i + 1) * shown) / n) > Math.floor((i * shown) / n)
    const r = 42 + 62 * Math.sqrt((i + 0.5) / n)
    const a = i * TURN + 0.6
    dots.push({ x: CX + r * 1.5 * Math.cos(a), y: CY + r * Math.sin(a), real: isReal, you: isReal && real === 0,
      live: isReal && real < Math.max(1, Math.round((today / Math.max(1, people)) * shown)), hue: HUES[real % HUES.length], wait: (i * 0.37) % 5 })
    if (isReal) real += 1
  }
  return dots
}

/**
 * The first thing a person sees after signing in: everyone who is here, around what they know together.
 * A person is a point of color. A stand-in is an empty ring that holds a place until a person comes.
 * Counts and nameless lines only: no one is named, and no answer is shown.
 */
export function CommonsView(props: { next?: { id: string; title: string; done: number }; onPlay: (gateId: string) => void; onJourney: () => void; onSeat: (seat: 'agency' | 'creator') => void }) {
  const { next, onPlay, onJourney, onSeat } = props
  const [data, setData] = useState<Commons | null>(null)
  const [tab, setTab] = useState('now')
  const calm = still()

  useEffect(() => {
    let cancelled = false
    const load = () => api.commons().then((c) => { if (!cancelled) setData(c) }).catch(() => undefined)
    void load()
    const timer = window.setInterval(load, 15000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [])

  if (!data) return <p className="muted" aria-live="polite">Finding everyone.</p>

  const dots = places(data.people, data.stand_ins, data.people_today)
  const people = dots.filter((d) => d.real)
  const fresh = data.happenings.filter((h) => h.when === 'now' || h.when === 'today').length
  const sparks = calm || people.length === 0 ? [] : Array.from({ length: Math.min(6, Math.max(1, fresh)) }, (_, i) => people[(i * 5 + 1) % people.length])
  const seats = [...Array.from({ length: Math.min(8, data.agencies) }, () => 'agency'), ...Array.from({ length: Math.min(8, data.creators) }, () => 'creator')]
  const said = `${data.people} ${data.people === 1 ? 'person is' : 'people are'} here. ${data.stand_ins} stand-ins hold places until more people come. ${data.people_today} played today.`
  const share = data.known > 0 ? Math.round((data.known_mine / data.known) * 100) : 0

  return (
    <section className={calm ? 'commons calm' : 'commons'} aria-labelledby="commons-h">
      <div className="commons-top">
        <div>
          <h1 id="commons-h">Welcome, {data.nickname}.</h1>
          <p className="muted commons-said">{said}</p>
        </div>
        <button className="primary" onClick={() => (next ? onPlay(next.id) : onJourney())}>
          {next ? `${next.done > 0 ? 'Continue' : 'Start'}: ${next.title}` : 'My Journey'}
        </button>
      </div>
      <Tabs label="Read the game" value={tab} onChange={setTab}
        tabs={[{ id: 'now', label: 'Happening', n: fresh }, { id: 'known', label: 'Known', n: data.known }, { id: 'mine', label: 'My effect', n: `${share}%` }, { id: 'why', label: 'Why' }]} />
      {tab !== 'mine' && <svg className="commons-map" viewBox="0 0 360 224" role="img"
        aria-label={`Everyone in the game, drawn as points around one pool of light. ${said} Together they know ${data.known} things, and ${data.known_mine} of those came from you.`}>
        <defs>
          <radialGradient id="pool">
            <stop offset="0" stopColor="#ffffff" stopOpacity="0.95" />
            <stop offset="0.45" stopColor="#ffe2a0" stopOpacity="0.5" />
            <stop offset="1" stopColor="#bfe6ff" stopOpacity="0" />
          </radialGradient>
        </defs>
        {people.map((d, i) => <line key={`s${i}`} className="commons-strand" x1={d.x} y1={d.y} x2={CX} y2={CY} stroke={d.hue} />)}
        <circle className="commons-pool" cx={CX} cy={CY} r={34} fill="url(#pool)" />
        {sparks.map((d, i) => (
          <circle key={`k${i}`} className="commons-spark" r={1.6} fill={d.hue}>
            <animate attributeName="cx" values={`${d.x};${CX}`} dur="3.2s" begin={`${i * 0.9}s`} repeatCount="indefinite" />
            <animate attributeName="cy" values={`${d.y};${CY}`} dur="3.2s" begin={`${i * 0.9}s`} repeatCount="indefinite" />
            <animate attributeName="opacity" values="0;1;1;0" dur="3.2s" begin={`${i * 0.9}s`} repeatCount="indefinite" />
          </circle>
        ))}
        {dots.map((d, i) => (
          <g key={i} className="commons-dot" style={{ animationDelay: `-${d.wait}s` }}>
            {d.live && <circle className="commons-halo" cx={d.x} cy={d.y} r={5.5} stroke={d.hue} style={{ animationDelay: `-${d.wait}s` }} />}
            {d.real ? <circle cx={d.x} cy={d.y} r={d.you ? 3.4 : 2.6} fill={d.hue} /> : <circle className="commons-hold" cx={d.x} cy={d.y} r={2.8} />}
            {d.you && <circle className="commons-you" cx={d.x} cy={d.y} r={7} />}
            {d.you && <text x={d.x} y={d.y - 10} textAnchor="middle">You</text>}
          </g>
        ))}
        {seats.map((kind, i) => {
          const a = (i / Math.max(1, seats.length)) * Math.PI * 2 - Math.PI / 2
          const x = CX + 168 * Math.cos(a)
          const y = CY + 106 * Math.sin(a)
          return kind === 'agency'
            ? <rect key={`a${i}`} className="commons-seat" x={x - 2.6} y={y - 2.6} width={5.2} height={5.2} transform={`rotate(45 ${x} ${y})`} />
            : <rect key={`c${i}`} className="commons-seat" x={x - 2.4} y={y - 2.4} width={4.8} height={4.8} />
        })}
        <text className="commons-known" x={CX} y={CY + 3} textAnchor="middle">{data.known.toLocaleString()}</text>
        <text className="commons-sub" x={CX} y={CY + 14} textAnchor="middle">known together</text>
      </svg>}
      {tab !== 'mine' && <p className="commons-key" aria-hidden="true">
        <span><i className="key-person" /> a person</span>
        <span><i className="key-hold" /> a stand-in, holding a place</span>
        <span><i className="key-agency" /> agency</span>
        <span><i className="key-creator" /> creator</span>
      </p>}
      {tab === 'now' && (
        <Rows pageKey="now" size={3} wide empty="Nothing yet. You can be the first."
          rows={data.happenings.map((h, i) => ({ id: String(i), top: WHEN[h.when] ?? h.when, label: h.text, n: h.mine ? 'you' : '', gold: h.mine }))} />
      )}
      {tab === 'known' && (
        <dl className="pair commons-pair">
          <div><dt>Taps</dt><dd>{data.taps}</dd><dd className="muted">what people chose</dd></div>
          <div><dt>Checks</dt><dd>{data.checks}</dd><dd className="muted">a person checked a Sym</dd></div>
          <div><dt>Told</dt><dd>{data.told}</dd><dd className="muted">said to a Sym, and kept</dd></div>
          <div><dt>Lessons</dt><dd>{data.lessons}</dd><dd className="muted">a Sym was wrong, and changed</dd></div>
          <div><dt>Proof</dt><dd>{data.proofs}</dd><dd className="muted">certificates earned</dd></div>
        </dl>
      )}
      {tab === 'mine' && <RippleMap calm={calm} onSeat={onSeat} />}
      {tab === 'why' && (
        <p className="world-say">
          Here, what people know is the money. Nobody can make more of it alone. A Sym only knows what its person showed it,
          and it only counts once that person checked it. Credits keep count of who gave what. Your Sym answers for pay only after your yes.
        </p>
      )}
    </section>
  )
}

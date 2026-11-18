import { useCallback, useEffect, useState } from 'react'
import { flushSync } from 'react-dom'
import { AgencyDesk } from './AgencyDesk'
import { CreatorDesk, type SeatView } from './CreatorDesk'
import { api, ApiError, type Bin, type Gate, type Me, type Sphere, type SphereFrame, type Hub, type Vertical, type PlanOption } from './api'
import { GatePlay } from './GatePlay'
import { Signal } from './Signal'
import { TwinTalk } from './TwinTalk'
import { Backdrop } from './Future'
import { Failed, RetryZone } from './Retry'
import { CommonsView } from './Commons'
import { Mine } from './Mine'
import { MoneyView } from './MoneyView'
import { Rps } from './Rps'
import { Start } from './Start'
import { TwinForm } from './TwinForm'
import { Work } from './Work'

type Screen = { name: 'journey' } | { name: 'gate'; gateId: string } | { name: 'mine'; area?: string; at?: number; tab?: 'beliefs' } | { name: 'work' } | { name: 'agency'; view: SeatView; ask?: string } | { name: 'creator'; view: SeatView } | { name: 'money' } | { name: 'arena' } | { name: 'world' } | { name: 'commons' } | { name: 'about' }

const PLAYER_MENU: [name: 'commons' | 'journey' | 'work' | 'mine' | 'money' | 'arena' | 'world', label: string][] = [
  ['commons', 'Everyone'],
  ['journey', 'My Journey'],
  ['work', 'My Work'],
  ['mine', 'My Sym'],
  ['money', 'My Money'],
]
const SEAT_MENU: Record<'agency' | 'creator', [view: SeatView, label: string][]> = {
  agency: [['desk', 'My Desk'], ['results', 'My Results'], ['money', 'My Money']],
  creator: [['desk', 'My Studio'], ['results', 'My Results'], ['money', 'My Money']],
}

type Display = 'full' | 'glance'
/** Where the twin sits: 'mini' beside the BYT mark, 'stage' in its usual place, 'wall' over the whole screen. */
type Dock = 'mini' | 'stage' | 'wall'
const DOCK_KEY = 'byt_dock'
const HINT_KEY = 'byt_hint'
const PLACES: Dock[] = ['mini', 'stage', 'wall']
const AXES = ['Player', 'Creator', 'Agency', 'Time']
const TWIN_LABEL = 'Your Sym is a turning brain made of connected points of light. Each area of your mind grows outward from one seed as you play, each belief your Sym holds is a ringed point named by its topic, and fine strands reach from it to other Syms. It sits inside a frame with four directions: player, agency, creator and time. Tap the name of a direction to stand in that seat, or tap Time to play your story. Drag it, or press the arrow keys, to turn it. Hold Shift to turn the frame through its fourth direction.'
/** A screen in a room (a projector) asks for the wall in the address; there the story plays by itself. */
const ROOM = new URLSearchParams(window.location.search).get('view') === 'wall'

function readDock(): Dock {
  if (ROOM) return 'wall'
  try {
    if (localStorage.getItem(DOCK_KEY) === 'mini') return 'mini'
  } catch {
    // no storage: the usual place
  }
  return 'stage'
}
type Look = 'mono' | 'light'
const LOOK_KEY = 'byt_look'

/** Mono: black and white, no glow, color only inside the sphere. Light: the gold and light look. */
function readLook(): Look {
  try {
    const saved = localStorage.getItem(LOOK_KEY)
    if (saved === 'mono' || saved === 'light') return saved
  } catch {
    // no storage: the default look
  }
  return 'mono'
}

/** Which layout to show. The address can ask for Glance (?view=glance). A very small or very short
 * screen (a watch, glasses, a car, a phone on its side) starts in Glance. Everything else starts in Full. */
function readDisplay(): Display {
  const asked = new URLSearchParams(window.location.search).get('view')
  if (asked === 'glance') return 'glance'
  if (asked === 'full' || asked === 'wall') return 'full'
  return window.matchMedia('(max-height: 430px), (max-width: 300px)').matches ? 'glance' : 'full'
}

const MOTION_KEY = 'byt_motion'
const SPEED_KEY = 'byt_speed'

/** How fast the sphere turns: 0 holds it still, 1 is the usual speed, 2 is twice as fast. */
function readSpeed(): number {
  try {
    const saved = Number(localStorage.getItem(SPEED_KEY))
    if (localStorage.getItem(SPEED_KEY) !== null && saved >= 0 && saved <= 2) return saved
  } catch {
    // no storage: the usual speed
  }
  return 0.6
}

/** The player's own choice wins. With no choice yet, follow the device setting. */
function readMotion(): boolean {
  try {
    const saved = localStorage.getItem(MOTION_KEY)
    if (saved) return saved === 'on'
  } catch {
    // no storage: fall through to the device setting
  }
  return !window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function nowAreasOf(sphere: Sphere | null): Vertical[] {
  return sphere?.verticals ?? []
}

const KIND_LABEL: Record<string, string> = {
  preference: 'Picks',
  strategy: 'Strategy',
  pattern: 'Pattern',
  feedback: 'Reaction',
  battle: 'Sym battle',
  logic: 'Logic',
  reflex: 'Speed',
}

export default function App() {
  const [signedIn, setSignedIn] = useState(api.hasToken())
  const [me, setMe] = useState<Me | null>(null)
  const [gates, setGates] = useState<Gate[]>([])
  const [bins, setBins] = useState<Bin[]>([])
  const [openBin, setOpenBin] = useState<string | null>(null)
  const [screen, setScreen] = useState<Screen>({ name: 'commons' })
  const [error, setError] = useState('')
  const [live, setLive] = useState('')
  const [intent, setIntent] = useState<'agency' | 'creator' | undefined>(undefined)
  const [pulse, setPulse] = useState(0)
  const [areas, setAreas] = useState<Vertical[]>([])
  const [hubs, setHubs] = useState<Hub[]>([])
  const [history, setHistory] = useState<SphereFrame[]>([])
  const [seatSphere, setSeatSphere] = useState<{ seat: string; view: string; sphere: Sphere } | null>(null)
  // a moment in the past that the sphere is showing, for one seat; null means now
  const [past, setPast] = useState<{ who: string; index: number } | null>(null)
  const [playing, setPlaying] = useState(false)
  const [display, setDisplay] = useState<Display>(readDisplay)
  const [look, setLook] = useState<Look>(readLook)
  const [dock, setDock] = useState<Dock>(readDock)
  const [motion, setMotion] = useState(readMotion)
  // one switch stills every moving thing on every page
  useEffect(() => {
    document.body.classList.toggle('calm', !motion)
  }, [motion])

  const [hint, setHint] = useState(() => {
    try {
      return localStorage.getItem(HINT_KEY) !== 'done'
    } catch {
      return true
    }
  })

  function moveTwin(next: Dock) {
    if (next === dock) return
    // the twin glides from one place to the next, where the browser can do that and motion is on
    const glide = (document as Document & { startViewTransition?: (change: () => void) => unknown }).startViewTransition
    if (motion && glide) glide.call(document, () => flushSync(() => setDock(next)))
    else setDock(next)
    setHint(false)
    try {
      if (next !== 'wall') localStorage.setItem(DOCK_KEY, next)
      localStorage.setItem(HINT_KEY, 'done')
    } catch {
      // the choice still holds until the page is closed
    }
  }
  /** One step bigger (1), one step smaller (-1), or open and close the full screen (0). */
  function sizeTwin(step: 1 | -1 | 0) {
    if (step === 0) moveTwin(dock === 'wall' ? 'stage' : 'wall')
    else moveTwin(PLACES[Math.max(0, Math.min(2, PLACES.indexOf(dock) + step))])
  }
  /** Go to a screen. If the twin fills the screen, it steps back down first so the screen can be seen. */
  function open(next: Screen) {
    setScreen(next)
    setDock((d) => (d === 'wall' ? 'stage' : d))
  }

  useEffect(() => {
    if (dock !== 'wall') return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDock('stage')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dock])

  useEffect(() => {
    document.documentElement.dataset.look = look
  }, [look])

  function toggleLook() {
    const next: Look = look === 'mono' ? 'light' : 'mono'
    setLook(next)
    try {
      localStorage.setItem(LOOK_KEY, next)
    } catch {
      // the choice still holds until the page is closed
    }
  }
  const seatName = screen.name === 'agency' || screen.name === 'creator' ? screen.name : null
  const seatView = screen.name === 'agency' || screen.name === 'creator' ? screen.view : ''

  useEffect(() => {
    if (!seatName) return
    let cancelled = false
    api
      .seatSphere(seatName)
      .then((sphere) => {
        if (!cancelled) setSeatSphere({ seat: seatName, view: seatView, sphere })
      })
      .catch(() => {
        // the seat still works without its sphere
      })
    return () => {
      cancelled = true
    }
  }, [seatName, seatView])

  const frameCount = (seatName ? (seatSphere?.seat === seatName ? seatSphere.sphere.history.length : 0) : history.length) + 1
  useEffect(() => {
    if (!playing) return
    const timer = window.setInterval(() => {
      setPast((p) => {
        if (!p || p.index + 1 >= frameCount - 1) {
          setPlaying(false)
          return null
        }
        return { who: p.who, index: p.index + 1 }
      })
    }, 1100)
    return () => window.clearInterval(timer)
  }, [playing, frameCount])
  // on a wall in a room the story plays by itself, again and again
  useEffect(() => {
    if (!ROOM || dock !== 'wall' || playing || frameCount < 2) return
    const timer = window.setTimeout(() => {
      setPast({ who: seatName ?? 'player', index: 0 })
      setPlaying(true)
    }, 6000)
    return () => window.clearTimeout(timer)
  }, [dock, playing, frameCount, seatName])
  const [speed, setSpeed] = useState(readSpeed)
  const [group, setGroup] = useState<string | null>(null)
  const [plan, setPlan] = useState<PlanOption[]>([])

  function changeSpeed(next: number) {
    setSpeed(next)
    try {
      localStorage.setItem(SPEED_KEY, String(next))
    } catch {
      // the choice still holds until the page is closed
    }
  }

  function toggleMotion() {
    const next = !motion
    setMotion(next)
    try {
      localStorage.setItem(MOTION_KEY, next ? 'on' : 'off')
    } catch {
      // the choice still holds until the page is closed
    }
  }

  const refresh = useCallback(() => {
    Promise.all([api.me(), api.journey(), api.sphere(), api.plan()])
      .then(([m, j, sp, pl]) => {
        setPlan(pl.options)
        setMe(m)
        setGates(j.gates)
        setBins(j.bins)
        setAreas(sp.verticals)
        setHubs(sp.hubs ?? [])
        setHistory(sp.history)
        setError('')
      })
      .catch((e: unknown) => {
        if (e instanceof ApiError && e.status === 401) {
          api.forget()
          setSignedIn(false)
        } else {
          setError(e instanceof Error ? e.message : 'There was a problem. Please try again.')
        }
      })
  }, [])

  useEffect(() => {
    if (signedIn) refresh()
  }, [signedIn, refresh])

  if (!signedIn) {
    return (
      <Shell
        live={live}
        read="My Sym · not formed yet"
        twin={<TwinForm coherence={0.04} variant="hero" motion={motion} label="Your Sym is not formed yet. It is many small points of light." />}
        motion={motion}
        onMotion={toggleMotion}
        look={look}
        onLook={toggleLook}
      >
        <Start onStarted={(seat) => {
          if (seat !== 'player') setIntent(seat)  // everyone meets the game first; the Sym then points at the seat they came for
          setSignedIn(true)
        }} />
      </Shell>
    )
  }

  const seat = screen.name === 'agency' || screen.name === 'creator' ? screen : null
  const go = (id: string) => {
    if (id.startsWith('gate:')) setScreen({ name: 'gate', gateId: id.slice(5) })
    else if (id.startsWith('retry:')) {
      // a missed certificate, tried again: the old answers to that gate are cleared first
      const gateId = id.slice(6)
      api.retry(gateId).then(() => { refresh(); setScreen({ name: 'gate', gateId }) })
        .catch((e: unknown) => setError(e instanceof Error ? e.message : 'There was a problem. Please try again.'))
    } else if (id === 'work' || id === 'mine' || id === 'money' || id === 'arena') setScreen({ name: id } as Screen)
  }
  const next = gates.find((g) => g.unlocked && g.done < g.total)
  const formed = me && me.gates_total > 0 ? me.gates_done / me.gates_total : 0
  // the sphere of the seat you are in, at the moment you are looking at
  const who = seat?.name ?? 'player'
  const mine: Sphere | null = seat
    ? (seatSphere?.seat === seat.name ? seatSphere.sphere : null)
    : { verticals: areas, links: 0, history, mode: 'fill', balance: null }
  const picked = group ? nowAreasOf(mine).find((a) => a.key === group) ?? null : null
  const nowAreas = nowAreasOf(mine)
  const frames: SphereFrame[] = mine
    ? [{ label: 'The start', at: '', levels: nowAreas.map(() => 0), earned: nowAreas.map(() => 0) }, ...mine.history]
    : []
  const at = past && past.who === who && past.index < frames.length - 1 ? past.index : null
  const shown = at === null ? nowAreas : nowAreas.map((a, i) => ({ ...a, level: frames[at].levels[i] ?? 0, earned: frames[at].earned[i] ?? 0 }))
  const toggleStory = () => {
    if (frames.length < 2) return
    if (playing) {
      setPlaying(false)
    } else {
      setPast({ who, index: 0 })
      setPlaying(true)
    }
  }
  // the four directions of the frame are controls: three seats to stand in, and time to move through
  const takeAxis = (index: number) => {
    if (index === 0) setScreen({ name: 'journey' })
    else if (index === 1) setScreen({ name: 'creator', view: 'desk' })
    else if (index === 2) setScreen({ name: 'agency', view: 'desk' })
    else toggleStory()
  }
  const story = frames.length > 1 && (
    <div className="story">
      <button className="link" onClick={toggleStory}>
        {playing ? 'Stop' : 'Play my story'}
      </button>
      {(playing || at !== null) && <input type="range" min={0} max={frames.length - 1} value={at ?? frames.length - 1} aria-label="Move through time"
        aria-valuetext={at === null ? 'Now' : frames[at].label}
        onChange={(e) => {
          const v = Number(e.target.value)
          setPlaying(false)
          setPast(v >= frames.length - 1 ? null : { who, index: v })
        }} />}
      {(playing || at !== null) && <span className="story-label">{at === null ? 'Now' : at === 0 ? 'The start' : `After: ${frames[at].label}`}</span>}
    </div>
  )
  const twin = (
    <TwinForm
      coherence={seat ? 0.9 : 0.14 + 0.86 * formed}
      pulseKey={pulse}
      variant={dock === 'mini' ? 'dot' : dock === 'wall' || screen.name === 'journey' ? 'hero' : 'mini'}
      axes={dock === 'mini' ? undefined : AXES}
      onAxis={dock === 'mini' ? undefined : takeAxis}
      hubs={seat || dock === 'mini' ? undefined : hubs}
      onHub={() => open({ name: 'mine', tab: 'beliefs', at: Date.now() })}
      axesOn={[!seat, seat?.name === 'creator', seat?.name === 'agency', playing || at !== null]}
      time={at === null || frames.length < 2 ? 1 : at / (frames.length - 1)}
      onSize={dock === 'mini' ? undefined : sizeTwin}
      areas={shown}
      focus={dock === 'mini' ? undefined : group ?? undefined}
      motion={motion}
      speed={speed}
      sky={me?.twins ?? 0}
      together={seat ? 1 : me?.together ?? 0}
      mode={mine?.mode ?? 'fill'}
      onPick={dock === 'mini' ? undefined : (key) => setGroup(key)}
      label={`${TWIN_LABEL} It is ${Math.round(formed * 100)} percent formed.${dock === 'mini' ? '' : ' The list after it names each colored area.'}`}
    />
  )

  if (display !== 'full') {
    // Glance: one look, nothing to tap (a small screen, glasses, a car).
    const percent = Math.round(formed * 100)
    return (
      <div className={`ambient ambient-${display}`}>
        <div className="ambient-twin">
          <TwinForm coherence={seat ? 0.9 : 0.14 + 0.86 * formed} pulseKey={pulse} variant="hero" areas={shown} motion={motion}
            speed={speed} sky={me?.twins ?? 0} together={seat ? 1 : me?.together ?? 0} mode={mine?.mode ?? 'fill'}
            label={`${TWIN_LABEL} It is ${percent} percent formed.`} />
        </div>
        <div className="ambient-read">
          <p className="stat">{percent}</p>
          <p className="stat-label">percent formed · my Sym</p>
          <dl className="pair">
            <div><dt>Credits</dt><dd>{me?.credits ?? 0}</dd></div>
            <div><dt>Certificates</dt><dd>{me?.certs ?? 0}</dd></div>
            <div><dt>Jobs ready</dt><dd>{me?.jobs_open ?? 0}</dd></div>
            <div><dt>Syms</dt><dd>{me?.twins ?? 0}</dd></div>
          </dl>
        </div>
        <button className="link ambient-exit" onClick={() => setDisplay('full')}>Full view</button>
        <p className="sr-only" aria-live="polite">{live}</p>
      </div>
    )
  }

  return (
    <Shell
      live={live}
      twin={twin}
      compact={screen.name !== 'journey' && dock !== 'wall'}
      alone={screen.name === 'commons' && dock !== 'wall'}
      dock={dock}
      onDock={moveTwin}
      hint={hint}
      onDisplay={setDisplay}
      look={look}
      onLook={toggleLook}
      motion={motion}
      onMotion={toggleMotion}
      story={story}
      speed={speed}
      onSpeed={changeSpeed}
      groupCard={
        picked && (
          <div className="group-card" role="region" aria-label={picked.name}>
            <span className="line-top"><span className="swatch" style={{ background: picked.color }} aria-hidden="true" /> {picked.name}</span>
            {picked.details.map((line) => <span key={line}>{line}</span>)}
            {mine?.balance != null && <span className="muted">Your balance across groups: {Math.round(mine.balance * 100)} of 100. Reaching every group evenly scores highest.</span>}
            <span className="group-actions">
              {!seat && picked.next_gate && (
                <button className="secondary gate-go" onClick={() => open({ name: 'gate', gateId: picked.next_gate ?? '' })}>Play: {picked.next_title}</button>
              )}
              {!seat && <button className="link" onClick={() => open({ name: 'mine', area: picked.key, at: Date.now() })}>See this area</button>}
              {seat?.name === 'agency' && !picked.hidden && picked.count !== null && !['agencies', 'creators'].includes(picked.key) && (
                <button className="secondary gate-go" onClick={() => open({ name: 'agency', view: 'desk', ask: picked.key === 'forming' ? 'all' : picked.key })}>Ask this group</button>
              )}
              <button className="link" onClick={() => setGroup(null)}>Close</button>
            </span>
          </div>
        )
      }
      legend={
        (
          <ul className="legend" aria-label={seat ? 'The areas of this seat' : 'The areas of your Sym'}>
            {shown.map((a) => (
              <li key={a.key}>
                <button className="legend-item" aria-pressed={group === a.key}
                  onClick={() => setGroup(group === a.key ? null : a.key)}>
                  <span className="swatch" style={{ background: seat ? a.color : `color-mix(in srgb, ${a.color} ${Math.round((me?.together ?? 0) * 100)}%, #ffffff)` }} aria-hidden="true" />
                  <span className="legend-name">{a.name}</span>
                </button>
              </li>
            ))}
          </ul>
        )
      }
      read={seat ? `You are in the ${seat.name === 'agency' ? 'Agency' : 'Creator'} seat` : `My Sym · ${Math.round(formed * 100)} percent formed · ${Math.round((me?.together ?? 0) * 100)} percent in color · ${me?.twins ?? 0} Syms in the sky`}
      onAbout={() => setScreen({ name: 'about' })}
      nav={
        seat ? (
          <nav aria-label={seat.name === 'agency' ? 'Agency menu' : 'Creator menu'}>
            <button className="link" onClick={() => setScreen({ name: 'commons' })}>Everyone</button>
            {SEAT_MENU[seat.name].map(([view, label]) => (
              <button key={view} className="link" aria-current={seat.view === view ? 'page' : undefined}
                onClick={() => setScreen({ name: seat.name, view } as Screen)}>
                {label}
              </button>
            ))}
          </nav>
        ) : (
          <nav aria-label="My menu">
            {PLAYER_MENU.map(([name, label]) => (
              <button key={name} className="link" aria-current={screen.name === name ? 'page' : undefined}
                onClick={() => setScreen({ name } as Screen)}>
                {label}
              </button>
            ))}
          </nav>
        )
      }
      seats={
        <nav className="seats" aria-label="Choose your seat">
          <span className="seats-label">Seat</span>
          <button className="link" aria-current={!seat ? 'true' : undefined} onClick={() => setScreen({ name: 'journey' })}>Player</button>
          <button className="link" aria-current={seat?.name === 'agency' ? 'true' : undefined} onClick={() => setScreen({ name: 'agency', view: 'desk' })}>Agency</button>
          <button className="link" aria-current={seat?.name === 'creator' ? 'true' : undefined} onClick={() => setScreen({ name: 'creator', view: 'desk' })}>Creator</button>
        </nav>
      }
      status={me ? `${me.nickname} · ${me.credits} ${me.credits === 1 ? 'credit' : 'credits'} · ${me.certs} ${me.certs === 1 ? 'certificate' : 'certificates'}` : ''}
    >
      {me && screen.name !== 'gate' && screen.name !== 'about' && (
        <Signal tick={`${me.credits}|${me.jobs_open}|${screen.name}|${seat?.view ?? ''}`} jobs={screen.name === 'work' ? 0 : me.jobs_open}
          onWork={() => setScreen({ name: 'work' })} />
      )}
      {me && !seat && screen.name !== 'gate' && screen.name !== 'about' && screen.name !== 'world' && screen.name !== 'commons' && screen.name !== 'arena' && (
        <TwinTalk where={screen.name} announce={setLive}
          onLearned={() => { setPulse((n) => n + 1); refresh() }}
          onMove={go} />
      )}
      {error && <Failed error={error} again={refresh} />}

      {screen.name === 'journey' && (
        <section aria-labelledby="journey-h">
          <h1 id="journey-h">{formed >= 1 ? 'My Sym is fully formed.' : 'My Sym is forming.'}</h1>
          <p className="muted">Gates are short, and you only tap. Each gate you finish helps your Sym form.</p>
          {next ? (
            <button className="primary big" onClick={() => setScreen({ name: 'gate', gateId: next.id })}>
              {next.done > 0 ? 'Continue' : 'Start'}: {next.title}
            </button>
          ) : (
            gates.length > 0 && <p className="notice">You finished every gate in the game. More gates will come later.</p>
          )}
          {plan.some((o) => !next || o.id !== `gate:${next.id}`) && (
            <>
              <h2>Where your time counts most now</h2>
              <ul className="plan">
                {plan.filter((o) => !next || o.id !== `gate:${next.id}`).map((o) => (
                  <li key={o.id + o.title}>
                    <button className="plan-go" onClick={() => go(o.id)}>
                      <span className="plan-n">{o.credits > 0 ? `+${o.credits}` : `${o.minutes} min`}</span>
                      <span className="plan-what">{o.title}</span>
                      <span className="muted">{o.why}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
          <div className="bins" role="group" aria-label="Kinds of gates">
            {bins.map((b) => {
              const mine = gates.filter((g) => g.bin === b.id)
              const cleared = mine.filter((g) => g.done === g.total).length
              return (
                <button key={b.id} className="bin" aria-expanded={openBin === b.id} aria-controls="bin-panel"
                  onClick={() => setOpenBin(openBin === b.id ? null : b.id)}>
                  <span className="bin-name">{b.name}</span>
                  <span className="bin-count">{mine.length - cleared}</span>
                  <span className="muted">{mine.length - cleared === 1 ? 'gate' : 'gates'} to play · {cleared} done</span>
                </button>
              )
            })}
            <button className="bin" onClick={() => setScreen({ name: 'arena' })}>
              <span className="bin-name">Arena</span>
              <span className="bin-count" aria-hidden="true">&#9675;</span>
              <span className="muted">rock, paper, scissors against my Sym</span>
            </button>
          </div>
          <div id="bin-panel">
            {openBin && gates.every((g) => g.bin !== openBin || g.done === g.total) && (
              <p className="muted">You finished every gate here. You can see your answers on the "My Sym" screen. More gates will come later.</p>
            )}
            {openBin && gates.some((g) => g.bin === openBin && g.done < g.total) && (
              <ol className="gates">
                {gates.map((g, i) => {
                  const complete = g.done === g.total
                  if (g.bin !== openBin || complete) return null
                  const state = g.unlocked ? 'Open' : 'Locked'
                  return (
                    <li key={g.id} className={`gate ${g.unlocked ? 'open' : 'locked'}`}>
                      <span className="gate-n" aria-hidden="true">{i + 1}</span>
                      <span className="gate-body">
                        <span className="gate-title">{g.title}</span>
                        <span className="muted">
                          {KIND_LABEL[g.kind] ?? g.kind}
                          {g.difficulty ? `, ${g.difficulty}` : ''} · {g.done} of {g.total}
                        </span>
                      </span>
                      {g.unlocked ? (
                        <button className="secondary gate-go" onClick={() => setScreen({ name: 'gate', gateId: g.id })}>Play</button>
                      ) : (
                        <span className="gate-state">{state}</span>
                      )}
                    </li>
                  )
                })}
              </ol>
            )}
          </div>
        </section>
      )}

      {screen.name === 'gate' && (
        <GatePlay
          key={screen.gateId}
          gateId={screen.gateId}
          gateKind={gates.find((g) => g.id === screen.gateId)?.kind ?? ''}
          announce={setLive}
          onProgress={() => {
            setPulse((n) => n + 1)
            refresh()
          }}
          onExit={() => {
            setScreen({ name: 'journey' })
            refresh()
          }}
        />
      )}

      {screen.name === 'work' && <Work announce={setLive} onChange={refresh} />}

      {screen.name === 'agency' && (
        <AgencyDesk key={screen.ask ?? 'desk'} announce={setLive} view={screen.view} ask={screen.ask} onView={(view) => setScreen({ name: 'agency', view })} />
      )}

      {screen.name === 'creator' && <CreatorDesk view={screen.view} announce={setLive} onView={(view) => setScreen({ name: 'creator', view })} />}

      {screen.name === 'money' && <MoneyView onChange={refresh} onMove={go} />}

      {screen.name === 'arena' && <Rps announce={setLive} />}

      {screen.name === 'mine' && (
        <Mine
          key={`${screen.area ?? ''}:${screen.tab ?? ''}:${screen.at ?? 0}`}
          area={screen.area}
          start={screen.tab}
          onPlay={(gateId) => setScreen({ name: 'gate', gateId })}
          onDeleted={() => {
            api.forget()
            setMe(null)
            setGates([])
            setScreen({ name: 'journey' })
            setSignedIn(false)
          }}
        />
      )}

      {screen.name === 'commons' && (
        <CommonsView next={next} onPlay={(gateId) => setScreen({ name: 'gate', gateId })} onJourney={() => setScreen({ name: 'journey' })}
          onSeat={(seat) => setScreen({ name: seat, view: 'desk' } as Screen)} plan={plan} onGo={go} intent={intent} />
      )}

      {screen.name === 'about' && (
        <section aria-labelledby="about-h">
          <h1 id="about-h">About BYT</h1>
          <p>Beat your Sym. Benefit from your Sym. Be everywhere.</p>
          <p>Color comes from other people. A Sym on its own is black and white.</p>
          <p>
            BYT is the game. Symbolon is the name for who makes it. Long ago in Greece, two people who made a promise
            broke a small token in two, and each kept a half. Later, one half proved who you were by fitting the
            other. That token was called a symbolon. Your Sym is your other half: it is not a copy of you, and nothing
            it believes counts until it fits.
          </p>
          <p>
            BYT is a class project. You play short gates. Your taps build a Sym, and the Sym belongs to you. Soon,
            your Sym will try to guess your picks. A Sym that guesses well enough earns a certificate.
          </p>
          <p>
            We made every drawing and every brand in this game for this project. Nothing here is official, licensed
            or for sale. All credits and payments in the game are play money.
          </p>
        </section>
      )}
    </Shell>
  )
}

function Shell(props: { children: React.ReactNode; nav?: React.ReactNode; twin?: React.ReactNode; status?: string; live: string; onAbout?: () => void; seats?: React.ReactNode; read?: string; legend?: React.ReactNode; story?: React.ReactNode; motion?: boolean; onMotion?: () => void; speed?: number; onSpeed?: (next: number) => void; groupCard?: React.ReactNode; compact?: boolean; alone?: boolean; dock?: Dock; onDock?: (next: Dock) => void; hint?: boolean; onDisplay?: (next: Display) => void; look?: Look; onLook?: () => void }) {
  const dock = props.dock ?? 'stage'
  const wall = dock === 'wall'
  return (
    <>
      <Backdrop calm={props.motion === false} />
      <header inert={wall}>
        <span className="brand-row">
          <span className="brand">BYT</span>
          {dock === 'mini' && (
            <button className="twin-home" onClick={() => props.onDock?.('stage')} title="Bring my Sym down">
              {props.twin}
              <span className="sr-only">Bring my Sym down</span>
            </button>
          )}
        </span>
        {props.nav}
        {props.seats}
        {props.status && <p className="status">{props.status}</p>}
      </header>
      {dock !== 'mini' && !props.alone && (
      <div className={`stage ${props.compact ? 'compact' : ''} ${wall ? 'stage-wall' : ''}`} role={wall ? 'dialog' : undefined} aria-label={wall ? 'My Sym, full screen' : undefined}>
        {props.onDock && (
          <div className="dock" role="group" aria-label="The size of my Sym">
            <button className="link" aria-label="Make my Sym smaller" title="Smaller" onClick={() => props.onDock?.(wall ? 'stage' : 'mini')}>
              <span aria-hidden="true">&minus;</span>
            </button>
            <button className="link" aria-label="Make my Sym bigger" title="Bigger" disabled={wall} onClick={() => props.onDock?.('wall')}>
              <span aria-hidden="true">+</span>
            </button>
          </div>
        )}
        {props.onDock && props.hint && <p className="dock-hint">Drag the sphere to turn it. Drag the space around it down to grow it, or up to put it away.</p>}
        {props.twin}
        <div className="stage-foot">
          {props.read && <p className="stage-read">{props.read}</p>}
          {props.legend}
          {props.groupCard}
          {props.story}
        </div>
      </div>
      )}
      <main className={props.alone ? 'solo wide' : dock === 'mini' ? 'solo' : undefined} inert={wall}><RetryZone>{props.children}</RetryZone></main>
      <p className="sr-only" aria-live="polite">{props.live}</p>
      <footer inert={wall}>
        <p className="muted">BYT by Symbolon. This is a class project. It uses play money only. It is for adults only.</p>
        <span className="foot-links">
          {props.onMotion && <button className="link" aria-pressed={props.motion} onClick={props.onMotion}>Motion: {props.motion ? 'on' : 'off'}</button>}
          {props.onLook && <button className="link" onClick={props.onLook}>Look: {props.look}</button>}
          {props.onDisplay && <button className="link" onClick={() => props.onDisplay?.('glance')}>Glance</button>}
          {props.onAbout && <button className="link" onClick={props.onAbout}>About</button>}
        </span>
      </footer>
    </>
  )
}

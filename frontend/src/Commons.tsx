import { useEffect, useState } from 'react'
import { api, type Commons, type PlanOption } from './api'
import { Tabs } from './Deck'
import { Rows } from './Rows'
import { still } from './motion'
import { RippleMap } from './RippleMap'
import { EcoField } from './EcoField'
import { Tick, Typed } from './Future'
import { WorldView } from './World'

const WHEN: Record<string, string> = { now: 'Now', today: 'Today', week: 'This week', earlier: 'Earlier' }
/**
 * The first thing a person sees after signing in: everyone who is here, around what they know together.
 * A person is a point of color. A stand-in is an empty ring that holds a place until a person comes.
 * Counts and nameless lines only: no one is named, and no answer is shown.
 */
export function CommonsView(props: { next?: { id: string; title: string; done: number }; onPlay: (gateId: string) => void; onJourney: () => void; onSeat: (seat: 'agency' | 'creator') => void
  plan: PlanOption[]; onGo: (id: string) => void; intent?: 'agency' | 'creator' }) {
  const { next, onPlay, onJourney, onSeat, plan, onGo, intent } = props
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

  const fresh = data.happenings.filter((h) => h.when === 'now' || h.when === 'today').length
  const said = `${data.people} ${data.people === 1 ? 'person is' : 'people are'} here. ${data.bots} BOT Syms, one for each country, play here too. They are made up, not people, and they keep the game moving while it is small. ${data.people_today} played today.`
  // what the Sym asks for next: one line and one tap. Counting only, no model.
  const play = () => (next ? onPlay(next.id) : onJourney())
  const first = plan.find((o) => !next || o.id !== `gate:${next.id}`)
  const lead: { say: string; go: string; act: () => void } =
    intent && !(intent === 'agency' ? data.has_agency : data.has_creator)
      ? intent === 'agency'
        ? { say: 'You came as an agency. Agencies ask Syms questions and pay the people behind them. Open your desk, and ask your first one.', go: 'Open my agency', act: () => onSeat('agency') }
        : { say: 'You came as a creator. Creators build the skill steps that Syms grow on. Open your studio, and build your first one.', go: 'Open my studio', act: () => onSeat('creator') }
      : data.taps_mine === 0
        ? { say: 'I am your Sym. I know nothing about you yet. Tap once, and I start to form.', go: next ? `Start: ${next.title}` : 'Start', act: play }
        : next && next.done > 0
          ? { say: 'We stopped part way. A few more taps and this gate is done.', go: `Continue: ${next.title}`, act: play }
          : first
            ? { say: first.why, go: first.title, act: () => onGo(first.id) }
            : { say: next ? 'Each gate you play helps me know you better.' : 'You finished every gate. Look at what we set moving.', go: next ? `Start: ${next.title}` : 'My Journey', act: play }
  const roles: { id: string; name: string; n: number; what: string; life: string; go: string; act: () => void }[] = [
    { id: 'player', name: 'Players', n: data.people, what: 'A player taps, and a Sym learns them.', life: 'They bring the color. Nothing is known here until a person shows it.',
      go: next ? 'Play' : 'My Journey', act: play },
    { id: 'agency', name: 'Agencies', n: data.agencies, what: `An agency asks Syms questions and posts jobs. ${data.bot_agencies} of these are run by BOT Syms.`, life: 'They bring the pay. Every answer they buy pays the owner of a Sym.',
      go: data.has_agency ? 'My agency' : 'Open one', act: () => onSeat('agency') },
    { id: 'creator', name: 'Creators', n: data.creators, what: `A creator builds skill steps. ${data.bot_creators} of these are run by BOT Syms.`, life: 'They bring the growth. Each step lets Syms do more, and pays its maker.',
      go: data.has_creator ? 'My studio' : 'Open one', act: () => onSeat('creator') },
  ]
  const share = data.known > 0 ? Math.round((data.known_mine / data.known) * 100) : 0

  return (
    <section className={calm ? 'commons calm' : 'commons'} aria-labelledby="commons-h">
      <div className="commons-top">
        <div>
          <h1 id="commons-h">Welcome, {data.nickname}.</h1>
          <p className="muted commons-said">{said}</p>
        </div>
      </div>
      <div className="commons-grid">
      <div className="commons-lead" role="region" aria-label="What my Sym asks for next">
        <span className="line-top">My Sym</span>
        <p aria-live="polite"><Typed key={lead.say} text={lead.say} calm={calm} /></p>
        <button className="primary" onClick={lead.act}>{lead.go}</button>
      </div>
      <Tabs label="Read the game" value={tab} onChange={setTab}
        tabs={[{ id: 'now', label: 'Happening', n: fresh }, { id: 'known', label: 'Known', n: data.known }, { id: 'mine', label: 'My effect', n: `${share}%` }, { id: 'flow', label: 'Economy' }, { id: 'why', label: 'Roles' }]} />
      {tab !== 'mine' && tab !== 'flow' && <div className="commons-view"><EcoField people={data.people} standIns={data.stand_ins} today={data.people_today} agencies={data.agencies} creators={data.creators}
        known={data.known} knownMine={data.known_mine} fresh={fresh} calm={calm}
        label={`Everyone in the game, moving in space around a core of light. ${said} Together they know ${data.known} things, and ${data.known_mine} of those came from you.`} />
      <p className="commons-key" aria-hidden="true">
        <span><i className="key-person" /> a person and their Sym</span>
        <span><i className="key-hold" /> a BOT Sym (made up, not a person)</span>
        <span><i className="key-agency" /> agency</span>
        <span><i className="key-creator" /> creator</span>
        <span>drag to turn</span>
      </p></div>}
      {tab === 'now' && (
        <Rows pageKey="now" size={3} wide empty="Nothing yet. You can be the first."
          rows={data.happenings.map((h, i) => ({ id: String(i), top: WHEN[h.when] ?? h.when, label: h.text, n: h.mine ? 'you' : '', gold: h.mine }))} />
      )}
      {tab === 'known' && (
        <>
        <dl className="pair commons-pair">
          <div><dt>Taps</dt><dd><Tick to={data.taps} calm={calm} /></dd><dd className="muted">what people chose</dd></div>
          <div><dt>Checks</dt><dd><Tick to={data.checks} calm={calm} /></dd><dd className="muted">a person checked a Sym</dd></div>
          <div><dt>Told</dt><dd><Tick to={data.told} calm={calm} /></dd><dd className="muted">said to a Sym, and kept</dd></div>
          <div><dt>Lessons</dt><dd><Tick to={data.lessons} calm={calm} /></dd><dd className="muted">a Sym was wrong, and changed</dd></div>
          <div><dt>Proof</dt><dd><Tick to={data.proofs} calm={calm} /></dd><dd className="muted">certificates earned</dd></div>
        </dl>
        {/* the same two numbers as the welcome screen, with what each one counts */}
        <p className="commons-mine">
          Known together is taps, checks, told and lessons added up: {data.known.toLocaleString()}. Proof is counted apart.
          {' '}{data.known_mine.toLocaleString()} of them came from you: {data.taps_mine} {data.taps_mine === 1 ? 'tap' : 'taps'}, {data.checks_mine} {data.checks_mine === 1 ? 'check' : 'checks'}, {data.told_mine} told and {data.lessons_mine} {data.lessons_mine === 1 ? 'lesson' : 'lessons'}.
        </p>
        </>
      )}
      {tab === 'mine' && <RippleMap calm={calm} onSeat={onSeat} />}
      {tab === 'flow' && <WorldView split />}
      {tab === 'why' && (
        <>
          <ul className="roles">
            {roles.map((r) => (
              <li key={r.id}>
                <button className="role" onClick={r.act}>
                  <span className="role-n">{r.n}</span>
                  <span className="role-name">{r.name}</span>
                  <span className="role-what">{r.what} {r.life}</span>
                  <span className="role-go">{r.go}</span>
                </button>
              </li>
            ))}
          </ul>
          <p className="muted roles-why">Here, what people know is the money. Credits keep count of who gave what. Your Sym answers for pay only after your yes.</p>
        </>
      )}
      </div>
    </section>
  )
}

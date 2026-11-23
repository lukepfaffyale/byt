import { useCallback, useEffect, useRef, useState } from 'react'
import { api, type BattleResult, type Board, type Card, type Cert, type Gate, type Learned, type ResponseOut } from './api'
import { Tabs } from './Deck'
import { still } from './motion'
import { Rows } from './Rows'
import { Failed } from './Retry'
import { SymLive } from './SymLive'
import { SymCue } from './SymCue'
import { Worth } from './Worth'
import { CodeView } from './Code'
import { credits } from './words'
import './play.css'

const SURE: [number, string][] = [[3, 'Sure'], [2, 'Maybe'], [1, 'Guess']]
/** A reflex card says its time limit in its prompt. The limit is shown as a small number by the ring instead. */
const LIMIT = /\s*You have [\d.]+ seconds?\./
const LESSON: Record<string, string> = { changed: 'Rewrote', new: 'New', dropped: 'Dropped', count: 'Counted', held: 'Held' }

/** What the server sends back for one answer. The last two are new and are read here only. */
type SureRows = { level: number; right: number; total: number }[]
type Answer = ResponseOut & { sure_gate?: SureRows; right_choice?: string | null }

type Props = {
  gateId: string
  gateKind: string
  announce: (text: string) => void
  onProgress: () => void
  onExit: () => void
  /** after a battle the lit step is the Sym's work */
  onWork?: () => void
  /** the whole circle, with this person's numbers on it */
  onCircle?: () => void
  /** the gate my Sym wants after this one, so one tap goes straight on */
  nextUp?: { id: string; title: string }
  onNext?: (gateId: string) => void
}

/** the first gate: its picks write the first blocks of the Sym's code, so its finish shows that code */
const CALIBRATOR = 'style-1'
/** the last of the three parts of the calibration: its end is the close of the opening scene */
const CLOSE = 'quick-hands'
/** what my Sym says on the first card of each part of the calibration */
const PART: Record<string, string> = {
  'style-1': 'Part 1 of 3. Tap what you like.',
  'strategy-easy': 'Part 2 of 3. Win in one move.',
  'quick-hands': 'Part 3 of 3. Tap the ring fast.',
}
/** A battle tap faster than this is too fast to have read the card: my Sym holds it and asks for one more tap. */
const FAST_MS = 700
/** and it asks at most this many times in one battle, so it is never a nag */
const FAST_ASKS = 2
/** Cards of the first battle that ask the same thing in new words: [option a, option b] is what each side stands for.
 * This mirrors the traits in backend/data/cards/05_battle_taste.json. If a trait changes there, change it here. */
const SAME: Record<string, [string, string]> = {
  'bt-01': ['bold', 'classic'], 'bt-02': ['classic', 'bold'], 'bt-05': ['classic', 'bold'],
  'bt-06': ['save', 'splurge'], 'bt-08': ['save', 'splurge'],
}
const SAME_PAIRS: [string, string][] = [['bt-01', 'bt-02'], ['bt-01', 'bt-05'], ['bt-02', 'bt-05'], ['bt-06', 'bt-08']]

/** How often the person matched themself on those pairs, from this visit's own picks. A count, never a grade:
 * it changes no score, no certificate and no pay. Empty unless every one of the cards was picked in this visit. */
function selfLine(picked: Record<string, string>): string {
  const side = (id: string) => (picked[id] === 'a' ? SAME[id][0] : picked[id] === 'b' ? SAME[id][1] : '')
  if (Object.keys(SAME).some((id) => !side(id))) return ''
  const same = SAME_PAIRS.filter(([one, two]) => side(one) === side(two)).length
  return same >= 3 ? `Same idea, new words: you matched yourself ${same} of ${SAME_PAIRS.length}.` : 'Some picks pulled two ways. I learn that too.'
}

/** The best tap on the reaction rings, kept on this device only: the best ever and the best of this week (a week is
 * one season). Nothing here is sent to the server, and it is never shown as a score against other people. */
const RING_KEY = 'byt-ring-best'
function seasonNow(): string {
  const d = new Date()
  const day = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  day.setUTCDate(day.getUTCDate() + 4 - (day.getUTCDay() || 7)) // the Thursday of this week names its year
  const first = Date.UTC(day.getUTCFullYear(), 0, 1)
  return `${day.getUTCFullYear()}-W${Math.ceil(((day.getTime() - first) / 86400000 + 1) / 7)}`
}
function ringBest(): { ever: number; week: number } | null {
  try {
    const kept = JSON.parse(localStorage.getItem(RING_KEY) ?? 'null') as { ever?: number; season?: string; week?: number } | null
    if (!kept || typeof kept.ever !== 'number') return null
    return { ever: kept.ever, week: kept.season === seasonNow() && typeof kept.week === 'number' ? kept.week : 0 }
  } catch {
    return null
  }
}
function noteRing(ms: number): void {
  try {
    const now = ringBest()
    const week = now && now.week > 0 ? Math.min(now.week, ms) : ms
    localStorage.setItem(RING_KEY, JSON.stringify({ ever: now ? Math.min(now.ever, ms) : ms, season: seasonNow(), week }))
  } catch {
    // storage is off in this browser: the best of this visit is still shown
  }
}

/** Which side of a pair each option of a Calibrator card stands for: [option a, option b]. This mirrors the traits
 * in backend/data/cards/01_style.json (the server does not send traits to the browser). If a trait changes there,
 * change it here. style-05 is left out: its pair has only one card. */
const LEAN: Record<string, [string, string]> = {
  'style-01': ['bold', 'classic'], 'style-02': ['comfort', 'look'], 'style-03': ['bold', 'classic'], 'style-04': ['classic', 'bold'],
  'style-06': ['bold', 'classic'], 'style-07': ['comfort', 'look'], 'style-08': ['comfort', 'look'],
}
const LEAN_NAME: Record<string, string> = { bold: 'Bold', classic: 'Classic', comfort: 'Comfort', look: 'Looks' }

/** One true line about the person from their own picks in the first gate: a count, never a verdict. */
function leanLine(picked: Record<string, string>): string {
  const seen = Object.keys(LEAN).filter((id) => picked[id] === 'a' || picked[id] === 'b')
  if (seen.length < 7) return ''
  const count: Record<string, number> = { bold: 0, classic: 0, comfort: 0, look: 0 }
  for (const id of seen) count[LEAN[id][picked[id] === 'a' ? 0 : 1]] += 1
  const over = (a: string, b: string) => (count[a] >= count[b] ? [a, b] : [b, a])
  if (count.comfort === 3 || count.look === 3) {
    const [top, low] = over('comfort', 'look')
    return `${LEAN_NAME[top]} over ${LEAN_NAME[low].toLowerCase()}: 3 of 3.`
  }
  if (count.bold === 2 && count.classic === 2) return 'Bold or classic: 2 and 2. For you, it depends.'
  const [top, low] = over('bold', 'classic')
  return `${LEAN_NAME[top]} over ${LEAN_NAME[low].toLowerCase()}: ${count[top]} of 4.`
}

export function GatePlay({ gateId, gateKind, announce, onProgress, onExit, onWork, onCircle, nextUp, onNext }: Props) {
  const isBattle = gateKind === 'battle'
  const [gate, setGate] = useState<Gate | null>(null)
  const [cards, setCards] = useState<Card[]>([])
  const [index, setIndex] = useState(0)
  const [result, setResult] = useState<Answer | null>(null)
  const [earned, setEarned] = useState(0)
  const [cert, setCert] = useState<Cert | null>(null)
  const [bonus, setBonus] = useState(0)
  const [sponsored, setSponsored] = useState(0)
  const [battle, setBattle] = useState<BattleResult | null>(null)
  const [twinKind, setTwinKind] = useState('')
  const [sure, setSure] = useState<Record<string, number>>({})
  const [tally, setTally] = useState({ twin: 0, crowd: 0, done: 0 })
  const [learned, setLearned] = useState<Learned | null>(null)
  const [chosen, setChosen] = useState<string | null>(null)
  // a battle tap that came too fast to be read: it is held here, unsent, until one more tap says it is the true pick
  const [doubt, setDoubt] = useState<string | null>(null)
  const doubts = useRef(0)
  const [mark, setMark] = useState<{ need: number | null; right: number } | null>(null)
  // how sure against how right, for the cards of this gate only. The record over every gate is on My Sym.
  const [, setRecord] = useState<SureRows>([])
  const [flown, setFlown] = useState(0) // answers given on this visit: each one sends up one block
  const [after, setAfter] = useState<'learned' | 'areas'>('learned')
  const [run, setRun] = useState(0) // how many battle cards in a row my Sym has called
  const [busy, setBusy] = useState(false)
  const [streak, setStreak] = useState(0)
  const [error, setError] = useState('')
  const shownAt = useRef(0)
  const pending = useRef<Promise<void>[]>([])
  const leave = useCallback(() => {
    void Promise.allSettled(pending.current).then(onExit)
  }, [onExit])
  const toWork = useCallback(() => {
    void Promise.allSettled(pending.current).then(onWork ?? onExit)
  }, [onWork, onExit])
  const goNext = useCallback(() => {
    if (nextUp && onNext) void Promise.allSettled(pending.current).then(() => onNext(nextUp.id))
  }, [nextUp, onNext])
  const promptRef = useRef<HTMLHeadingElement>(null)
  // with motion on, a result is one short beat and the next card comes by itself. With motion off (or a device
  // that asks for less motion) nothing moves on a timer: the result stays until Next card is tapped.
  const moveOn = useRef(0)
  const lock = useRef(false) // a pick is on its way: a second tap in the same beat does nothing
  // the circle: what my Sym was asked and paid while this gate was played, and whether it may be asked at all
  const poolBefore = useRef<{ answers: number; credits: number } | null>(null)
  const [pool, setPool] = useState<{ on: boolean; answers: number; credits: number } | null>(null)
  const [world, setWorld] = useState<{ agencies: number; bots: number; syms: number; botSyms: number } | null>(null)
  // what was done in this visit to the gate: how long each turn took, what was picked, and each ring tapped in time.
  // These are the same numbers the server stores with each answer; nothing extra is sent.
  const paces = useRef<number[]>([])
  const picked = useRef<Record<string, string>>({})
  const hits = useRef<number[]>([])
  const [blocks, setBlocks] = useState<number | null>(null) // every block of my code so far
  const [job, setJob] = useState<number | null>(null) // what the first open job pays
  const [justOn, setJustOn] = useState(false)
  const [earnAsked, setEarnAsked] = useState(() => {
    try {
      return sessionStorage.getItem('byt.earn.asked') === '1'
    } catch {
      return false
    }
  })
  const resultAt = useRef(0)
  // when a gate ends my Sym says what it was worth and offers the next one: one tap and the loop goes on
  const onward = nextUp && onNext ? goNext : leave
  const onwardGo = nextUp && onNext ? (nextUp.title.length > 18 ? 'Next' : `Next: ${nextUp.title}`) : 'My Journey'
  const nextRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      // In a battle the twin commits its predictions first. It cannot change them once the cards are shown.
      if (isBattle) {
        const started = await api.startBattle(gateId)
        if (!cancelled) {
          setTwinKind(started.twin_kind)
          setSure(started.sure)
        }
      }
      const out = await api.gateCards(gateId)
      if (cancelled) return
      setGate(out.gate)
      setCards(out.cards)
    }
    load().catch((e: unknown) => {
      if (!cancelled) setError(e instanceof Error ? e.message : 'There was a problem. Please try again.')
    })
    return () => {
      cancelled = true
    }
  }, [gateId, isBattle])

  const card = cards[index]
  const finished = gate !== null && index >= cards.length

  useEffect(() => {
    let cancelled = false
    api.jobs().then((j) => { if (!cancelled) poolBefore.current = { answers: j.data_answers, credits: j.data_credits } }).catch(() => undefined)
    return () => { cancelled = true }
  }, [gateId])
  useEffect(() => {
    if (!finished) return
    let cancelled = false
    api.jobs().then((j) => {
      if (cancelled) return
      setPool({ on: j.data_income, answers: j.data_answers, credits: j.data_credits })
      setJob(j.jobs.find((x) => x.state === 'open')?.pay ?? null)
    }).catch(() => {
      // the count could not be read: the gate still ends with its Next button, and the question waits for next time
      if (!cancelled) { setEarnAsked(true); setPool({ on: false, answers: 0, credits: 0 }) }
    })
    api.commons().then((c) => { if (!cancelled) setWorld({ agencies: c.agencies, bots: c.bot_agencies, syms: c.people + c.bots, botSyms: c.bots }) }).catch(() => undefined)
    if (gateId === CLOSE) api.code().then((c) => { if (!cancelled) setBlocks(c.total) }).catch(() => undefined)
    return () => { cancelled = true }
  }, [finished, gateId])
  // while this gate was played: how many times my Sym was asked, and what that paid. Never shown as a zero.
  const askedNow = pool && poolBefore.current ? Math.max(0, pool.answers - poolBefore.current.answers) : 0
  const gainedNow = pool && poolBefore.current ? Math.max(0, Math.round((pool.credits - poolBefore.current.credits) * 100) / 100) : 0
  const earnAsk = pool !== null && !pool.on && !earnAsked && !justOn
  const letEarn = () => {
    api.consent(true)
      .then((j) => {
        setPool({ on: j.data_income, answers: j.data_answers, credits: j.data_credits })
        setJustOn(true)
        announce('Your Sym can be asked now.')
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'There was a problem. Please try again.'))
  }
  const notNow = () => {
    try {
      sessionStorage.setItem('byt.earn.asked', '1')
    } catch {
      // the answer still holds until this page is closed
    }
    setEarnAsked(true)
  }
  // every board card with a right answer asks how sure, so no answer is left out of the record
  const askSure = !!card?.board && card.board.game !== 'reflex'

  useEffect(() => {
    if (!card) return
    shownAt.current = performance.now()
    promptRef.current?.focus({ preventScroll: true })
  }, [card])

  useEffect(() => {
    if (result) nextRef.current?.focus({ preventScroll: true })
  }, [result])
  useEffect(() => () => window.clearTimeout(moveOn.current), [])

  // the end of a battle is counted and studied once. The two callbacks are read through refs, so a new render of
  // the shell (which hands down new functions) does not ask the server again and run into the rate limit.
  const say = useRef(announce)
  const moved = useRef(onProgress)
  useEffect(() => {
    say.current = announce
    moved.current = onProgress
  }, [announce, onProgress])
  useEffect(() => {
    if (!finished || !isBattle) return
    let cancelled = false
    const announce = (text: string) => say.current(text)
    const onProgress = () => moved.current()
    api
      .battle(gateId)
      .then((b) => {
        if (cancelled) return
        setBattle(b)
        announce(`Your Sym guessed ${b.twin_matches} of ${b.n} picks. The crowd's guess (what most people pick) got ${b.baseline_matches} right. Your Sym is now studying what it got wrong.`)
        // the loss is fed back: the twin studies its misses and its beliefs are rewritten
        return api.learn(gateId).then((l) => {
          if (cancelled) return
          setLearned(l)
          onProgress()
          announce(l.misses === 0 ? 'Your Sym got every card right. Its beliefs held.' : `Your Sym studied ${l.misses} wrong ${l.misses === 1 ? 'guess' : 'guesses'} and made ${l.lessons.length} ${l.lessons.length === 1 ? 'change' : 'changes'} to what it believes.`)
        })
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'There was a problem. Please try again.')
      })
    return () => {
      cancelled = true
    }
  }, [finished, isBattle, gateId])

  const advance = useCallback(() => {
    window.clearTimeout(moveOn.current)
    setResult(null)
    setChosen(null)
    setDoubt(null)
    setIndex((i) => i + 1)
  }, [])

  const pick = useCallback(
    async (choice: string, sure?: number, took?: number) => {
      if (!card || busy || result) return
      const ms = took ?? Math.max(0, Math.round(performance.now() - shownAt.current))
      if (isBattle && !card.board && doubt === null && ms < FAST_MS && doubts.current < FAST_ASKS) {
        // nothing is sent yet. The tile stays lit and both tiles stay live: the same one keeps the pick, the other
        // changes it. The time that is saved runs from the card showing to that last tap.
        doubts.current += 1
        setDoubt(choice)
        setChosen(choice)
        announce('That was fast. Tap your true pick.')
        return
      }
      setDoubt(null)
      paces.current.push(ms)
      picked.current[card.id] = choice
      if (card.board?.game === 'reflex' && choice === 'hit') {
        hits.current.push(ms)
        noteRing(ms)
      }
      setError('')
      if (!card.board && !isBattle && card.kind !== 'logic') {
        // No right answer to wait for: the tile lights for a beat, the next card comes, and the save runs behind.
        if (lock.current) return
        lock.current = true
        setChosen(choice)
        const saving = api
          .respond(card.id, choice, ms)
          .then((out) => {
            setEarned((n) => n + out.points_earned)
            onProgress()
          })
          .catch((e: unknown) => setError(e instanceof Error ? e.message : 'The game could not save a pick.'))
        pending.current.push(saving)
        announce('Saved.')
        setFlown((n) => n + 1)
        const on = () => {
          lock.current = false
          setChosen(null)
          setIndex((i) => i + 1)
        }
        if (still()) on()
        else window.setTimeout(on, 160)
        return
      }
      setBusy(true)
      setChosen(choice)
      try {
        const out: Answer = await api.respond(card.id, choice, ms, sure)
        setFlown((n) => n + 1)
        setEarned((n) => n + out.points_earned)
        if (out.sure_gate && out.sure_gate.length > 0) setRecord(out.sure_gate)
        if (!isBattle) setStreak((n) => (out.is_correct ? n + 1 : 0))
        if (out.cert) setCert(out.cert)
        if (out.cert_right !== null) setMark({ need: out.cert_need, right: out.cert_right })
        if (out.bonus > 0) setBonus(out.bonus)
        if (out.sponsored > 0) setSponsored(out.sponsored)
        onProgress()
        if (isBattle) {
          setTally((t) => ({ twin: t.twin + (out.twin_match ? 1 : 0), crowd: t.crowd + (out.crowd_match ? 1 : 0), done: t.done + 1 }))
          setRun((n) => (out.twin_match ? n + 1 : 0))
          announce(`Your Sym said: ${out.twin_choice}. ${out.twin_match ? 'Your Sym was right.' : 'Your Sym was wrong. It will study this after the battle.'}`)
        } else {
          const said = card.board?.game === 'pattern' ? (out.is_correct ? 'You saw the pattern.' : 'The dot went to another square. It is marked on the board.')
            : card.board?.game === 'reflex' ? (out.is_correct ? 'In time.' : 'Just late.')
              : card.board ? (out.is_correct ? 'That move wins.' : 'That move does not win.') : out.is_correct ? 'That is right.' : 'That is not right.'
          announce(`${said} You get ${out.points_earned} points.`)
        }
        setResult(out)
        resultAt.current = performance.now()
        if (!still()) {
          const beat = isBattle ? (out.twin_match ? 1100 : 1500) : card.board ? (card.board.game === 'pattern' ? 1500 : 1100) : 1000
          moveOn.current = window.setTimeout(advance, beat)
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'There was a problem. Please try again.')
      } finally {
        setBusy(false)
      }
    },
    [card, busy, result, isBattle, doubt, announce, onProgress, advance],
  )

  // Keyboard shortcuts for plain option cards: arrows for two options, number keys for any.
  useEffect(() => {
    if (!card || card.board || result) return
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey || !card) return
      const n = card.options.length
      if (n === 2 && e.key === 'ArrowLeft') void pick(card.options[0].id)
      else if (n === 2 && e.key === 'ArrowRight') void pick(card.options[1].id)
      else if (/^[1-9]$/.test(e.key) && Number(e.key) <= n) void pick(card.options[Number(e.key) - 1].id)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [card, result, pick])

  if (error && !gate) {
    return (
      <section>
        <Failed error={error} />
        <button className="link" onClick={onExit}>Go back to Journey</button>
      </section>
    )
  }
  if (!gate) {
    return (
      <section className="studying" aria-live="polite">
        {isBattle ? (
          <>
            <h1>Sealing my guesses.</h1>
            <p className="muted">They are saved before you see a card.</p>
          </>
        ) : (
          <p>Loading the gate.</p>
        )}
      </section>
    )
  }

  if (finished && isBattle) {
    return (
      <section aria-labelledby="done-h" className="gate-done">
        <h1 id="done-h" tabIndex={-1} className="sr-only">{battle?.cert ? 'Your Sym knows you.' : 'The battle is over.'}</h1>
        {battle && (
          <p className="done-hero" aria-label={`Your Sym guessed ${battle.twin_matches} of ${battle.n}. The crowd's guess got ${battle.baseline_matches}.`}>
            <span className="done-num lead"><strong>{battle.twin_matches}<small> / {battle.n}</small></strong> my Sym</span>
            <span className="done-num"><strong>{battle.baseline_matches}<small> / {battle.n}</small></strong> the crowd</span>
          </p>
        )}
        {battle && selfLine(picked.current) && <p className="done-fact">{selfLine(picked.current)}</p>}
        {!battle && !error && <p aria-live="polite">Counting the results.</p>}
        {battle && (
          <>
            <SymCue who={`My Sym${battle.twin_kind === 'offline' ? ' · practice Sym, no AI' : ''}`} calm={still()} formed={1}
              go={nextUp && onNext ? 'See my jobs' : onwardGo} act={nextUp && onNext ? toWork : onward}
              alt={nextUp && onNext ? onwardGo : undefined} altAct={nextUp && onNext ? onward : undefined}
              say={`I called ${battle.twin_matches} of ${battle.n}. The crowd got ${battle.baseline_matches}.${battle.cert ? ' Certificate earned.' : ''}${!learned ? ' Studying my misses.' : learned.misses > 0 ? ` I made ${learned.lessons.length} ${learned.lessons.length === 1 ? 'change' : 'changes'}.` : ''}${nextUp && onNext ? ' Now I can work for you.' : ''}${pool?.on && askedNow > 0 ? ` While you played, I was asked ${askedNow} ${askedNow === 1 ? 'time' : 'times'}. +${credits(gainedNow)} credits.` : ''}`} />
            {battle.cert ? (
              <p className="cert">
                <span className="cert-kind">Certificate</span>
                <strong>Sym: {battle.cert.topic} · {Math.round(battle.cert.accuracy * 100)}% on {battle.cert.n} unseen picks</strong>
              </p>
            ) : (
              <p className="fine">{battle.note}</p>
            )}
            <Tabs label="After the battle" value={after} onChange={setAfter}
              tabs={[
                { id: 'learned', label: 'Learned', n: learned ? learned.lessons.length : '...' },
                { id: 'areas', label: 'Areas', n: battle.areas.length },
              ]} />
            {after === 'learned' && !learned && <p className="muted" aria-live="polite">My Sym is studying its wrong guesses.</p>}
            {after === 'learned' && learned && (
              <>
                <Rows pageKey="lessons" size={3} wide empty="Nothing changed." rows={learned.lessons.map((l, i) => ({
                  id: `l${i}`, top: LESSON[l.kind] ?? l.kind, gold: l.kind !== 'held', label: l.after || l.before,
                  detail: l.kind === 'changed' ? <>About {l.topic}. Before the battle I believed: {l.before}</>
                    : l.kind === 'dropped' ? <>I no longer believe this. The battle showed it was wrong.</>
                      : l.kind === 'count' ? <>On the card "{l.topic}". {l.before}.</>
                        : l.kind === 'new' ? <>A new belief about {l.topic}. I did not hold it before the battle.</> : undefined,
                }))} />
              </>
            )}
            {after === 'areas' && (
              <>
                <ul className="bars split-bars">
                  {battle.areas.map((a) => (
                    <li key={a.key} className="bar">
                      <span className="bar-head as-row">
                        <span className="bar-name"><span className="swatch" style={{ background: a.color }} aria-hidden="true" /> {a.name}</span>
                        <span className="bar-n">{a.right}/{a.total}</span>
                        <span className="meter" aria-hidden="true"><span style={{ width: `${(a.right / a.total) * 100}%`, background: a.color }} /></span>
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="fine">How many of your picks in each area my Sym had guessed. The areas are loose links. Nothing here measures a brain.</p>
              </>
            )}
          </>
        )}
        {error && <p className="error" role="alert">{error}</p>}
        <div className="done-foot">
          <Worth seat="player" moment="gate" />
          {nextUp && <button className="link" onClick={leave}>My Journey</button>}
        </div>
      </section>
    )
  }

  // ---- the calibration: one true line about the person at the end of each part, from this visit's own numbers ----
  const part = gateId in PART
  const close = gateId === CLOSE
  const took = Math.round(paces.current.reduce((n, ms) => n + ms, 0) / 1000)
  const whole = paces.current.length === cards.length && took > 0 && took <= 60 // the person looked away: say nothing
  const best = hits.current.length > 0 ? Math.min(...hits.current) : null
  const fact = !finished || !part ? ''
    : gateId === CALIBRATOR ? leanLine(picked.current)
      : close ? (blocks !== null ? `You gave ${blocks} inputs. I kept every one.` : '') : ''
  const pace = !finished || !part || !whole ? ''
    : ''  // in the first minute, fewer words: the pace lines are left out (a tester said there was too much to read)
  const quick = finished && close ? (best !== null ? `Quickest tap: ${(best / 1000).toFixed(2)} s on this device.` : 'Tricky rings. Your taps are kept.') : ''
  const kept = finished && close ? ringBest() : null
  const season = kept && kept.week > 0 ? `Best this week: ${(kept.week / 1000).toFixed(2)} s. Best ever: ${(kept.ever / 1000).toFixed(2)} s.` : ''
  const light = finished && close && world ? `One light among them. ${world.botSyms} of the Syms are BOT Syms.` : ''
  const toJob = close && !earnAsk && job !== null && !!pool?.on

  if (finished) {
    return (
      <section aria-labelledby="done-h" className={earnAsk ? 'gate-done asking' : 'gate-done'}>
        <h1 id="done-h" tabIndex={-1} className="sr-only">Gate finished: {gate.title}</h1>
        {/* a tap is a block of my Sym's code: that is what was made here, and what the rest of the game runs on */}
        {close && blocks !== null
          ? <p className="done-hero"><span className="done-num lead"><strong>{blocks}</strong> blocks · my code</span></p>
          : <p className="done-hero"><span className="done-num lead"><strong>+{gate.total}</strong> {gate.total === 1 ? 'block' : 'blocks'}</span></p>}
        {(gateId === CALIBRATOR || close) && <CodeView brief />}
        {fact && <p className="done-fact">{fact}</p>}
        {(pace || light || quick || season) && (
          <p className="fine done-facts">
            {[pace, quick, season, light].filter(Boolean).map((line) => <span key={line}>{line}</span>)}
          </p>
        )}
        {/* until the game knows whether earning is on, there is no button: the one question must not be skipped by a fast tap */}
        <SymCue calm={still()} formed={1} go={pool === null ? undefined : earnAsk ? 'Let my Sym earn' : toJob ? 'See the job' : onwardGo} act={earnAsk ? letEarn : toJob ? toWork : onward}
          alt={earnAsk ? 'Not now' : toJob && nextUp && onNext ? onwardGo : undefined} altAct={earnAsk ? notNow : toJob && nextUp && onNext ? onward : undefined}
          say={justOn && !close ? `I am in. ${world ? `${world.agencies} agencies` : 'Agencies'} can ask me now.`
            : earnAsk && close ? 'I am ready. May I earn while you rest?'
            : earnAsk ? `${gate.total} ${gate.total === 1 ? 'tap' : 'taps'}, ${gate.total} ${gate.total === 1 ? 'block' : 'blocks'}. I can answer questions for pay. May I?`
            : close ? `Now I can work while you rest.${job !== null ? ` A job pays ${job}.` : ''}`
              : pool === null ? `${gate.total} ${gate.total === 1 ? 'tap' : 'taps'}, ${gate.total} ${gate.total === 1 ? 'block' : 'blocks'}.`
              : `${pool?.on && askedNow > 0 ? `While you played, I was asked ${askedNow} ${askedNow === 1 ? 'time' : 'times'}. +${credits(gainedNow)} credits.`
                : pool?.on ? `${gate.total} more ${gate.total === 1 ? 'block' : 'blocks'}. I can be asked now.`
                  : `${gate.total} ${gate.total === 1 ? 'tap' : 'taps'} kept. ${gate.total} more ${gate.total === 1 ? 'block' : 'blocks'}.`}${bonus + sponsored > 0 ? ` We earned ${credits(bonus + sponsored)} credits.` : ''}`} />
        {earnAsk && (
          <p className="fine">
            They see totals only. Never your name.<br />
            {world ? `Play money. ${world.bots} of ${world.agencies} askers are BOT agencies.` : 'Play money. Most askers today are BOT agencies.'} Turn it off any time.
          </p>
        )}
        {!earnAsk && earned > 0 && !part && <p className="fine">{earned} points</p>}
        {close && onCircle && !earnAsk && <button className="link" onClick={() => { void Promise.allSettled(pending.current).then(onCircle) }}>See my circle</button>}
        {cert && (
          <p className="cert">
            <span className="cert-kind">Certificate</span>
            <strong>{cert.topic}, {cert.level} · {Math.round(cert.accuracy * cert.n)} of {cert.n}</strong>
          </p>
        )}
        {!cert && mark && mark.need !== null && !part && <p className="fine">{mark.right} of {mark.need}. A certificate needs {mark.need}.</p>}
        <div className="done-foot">
          <Worth seat="player" moment="gate" />
          {nextUp && <button className="link" onClick={leave}>My Journey</button>}
        </div>
      </section>
    )
  }

  // my Sym answers each tap in its own voice. Code writes the line from what just happened; no model does.
  const left = cards.length - index
  const last = left === 1
  // the bet my Sym made before the gate began, and how it came out. A miss is never the player's fault here.
  const betSay = (bet: boolean, got: boolean | null) =>
    bet ? (got ? 'I bet yes. Right.' : 'I bet on you. Hard one.') : got ? 'I bet no. You beat me.' : 'Hard one. I thought so.'
  // a few words at most, and nothing on most cards: the path filling one light for each tap says the rest
  const symSay = result && isBattle
    ? (result.twin_match ? (run >= 2 ? `Called it. ${run} in a row.` : 'Called it.') : 'You surprised me.')
    : result
      ? result.twin_bet !== null
        ? betSay(result.twin_bet, result.is_correct)
        : result.is_correct ? (streak >= 3 ? `${streak} in a row.` : 'Yes.') : 'Next one.'
      : isBattle
        ? doubt !== null ? 'That was fast. Tap your true pick.'
          : (sure[card.id] === undefined ? 'Sealed.' : `Sealed. ${sure[card.id]}% sure.`)
        : card.board?.game === 'pattern' && card.bet_sure !== null
          ? 'My bet is in.'
          : index === 0 ? (PART[gateId] ?? 'Tap. I learn.')
            : last ? 'Last one.'
              : index === Math.ceil(cards.length / 2) ? 'Half way.' : ''
  // a board gate says its rule once. From the second card on, the same words are a small line.
  const shown = card.board?.game === 'reflex' ? card.prompt.replace(LIMIT, '') : card.prompt
  const before = index > 0 ? cards[index - 1] : null
  const again = !!card.board && !!before?.board && (before.board.game === 'reflex' ? before.prompt.replace(LIMIT, '') : before.prompt) === shown
  const auto = !still()

  // with motion off nothing moves on a timer: the same tiles show the result, and one button goes on
  const nextButton = result && !auto && (
    <button ref={nextRef} className="primary big next-card" onClick={advance}>{last ? 'Finish' : 'Next'}</button>
  )
  const options = card.options
  const short = options.every((o) => o.label.length <= (options.length === 3 ? 12 : 22))

  return (
    <section aria-labelledby="card-h" className={auto ? 'play moving' : 'play'}
      // a tap on the card ends the wait early, but not a doubled tap that lands as the result arrives
      onClick={result && auto ? () => { if (performance.now() - resultAt.current > 350) advance() } : undefined}>
      <SymLive say={symSay} done={index + (result ? 1 : 0)} total={cards.length} pulse={index * 2 + (result ? 1 : 0)} calm={still()}
        label={`${index + 1} / ${cards.length} · ${isBattle ? `Battle${twinKind === 'offline' ? ' · practice Sym, no AI' : ''}` : gate.title}`} />
      {isBattle && (
        <p className="duel" aria-label={`So far: your Sym ${tally.twin}, the crowd's guess ${tally.crowd}, of ${tally.done} cards.`}>
          <span><strong>{tally.twin}</strong> my Sym</span>
          <span><strong>{tally.crowd}</strong> the crowd</span>
        </p>
      )}
      <h1 id="card-h" key={`p-${card.id}`} ref={promptRef} tabIndex={-1} className={again ? 'prompt again' : 'prompt'}>{shown}</h1>

      {flown > 0 && !still() && !card.board && <span className="t-fly" aria-hidden="true"><TBlock key={flown} /></span>}
      {card.board ? (
        <div className={`play-row game-${card.board.game}`}>
          {card.board.game === 'reflex' ? (
            <ReflexView key={card.id} board={card.board} disabled={busy || result !== null} onDone={(outcome, ms) => void pick(outcome, undefined, ms)} />
          ) : (
            <BoardView board={card.board} options={card.options.map((o) => o.id)} disabled={busy || result !== null} chosen={chosen}
              answer={result?.right_choice ?? null} onPick={askSure ? setChosen : (move) => void pick(move)} />
          )}
          {/* what comes next sits beside the board, so a card is one page: how sure, then how it went */}
          <div className="play-side">
            {!result && chosen && (
              <div className="chips sure" role="group" aria-label="How sure are you?">
                <span className="chips-label">How sure?</span>
                {SURE.map(([level, name]) => (
                  <button key={level} className="chip" disabled={busy} onClick={() => void pick(chosen, level)}>{name}</button>
                ))}
              </div>
            )}
            {result && <p className={`beat ${result.is_correct ? 'right' : 'wrong'}`} role="status">{result.is_correct ? '✓' : card.board?.game === 'reflex' ? '' : 'Not this time.'} <strong>+{result.points_earned}</strong></p>}
            {nextButton}
          </div>
        </div>
      ) : (
        // the choices stay on screen. The pick lights, a tag lands where my Sym guessed, and the next card comes.
        <>
          <div key={`o-${card.id}`} className={`options n${options.length}${short ? ' short' : ''}`}>
            {options.map((o, i) => {
              const mine = chosen === o.id
              const syms = result !== null && isBattle && (result.twin_choice === o.label || (options.length === 2 && !options.some((x) => x.label === result.twin_choice) && mine === result.twin_match))
              const how = `${mine ? ' picked' : ''}${syms ? ' sym-here' : ''}${result && mine && !isBattle ? (result.is_correct ? ' right' : ' wrong') : ''}`
              return (
                <button key={o.id} className={`option${how}`} disabled={busy || result !== null || (chosen !== null && doubt === null)} onClick={() => void pick(o.id)}>
                  <span className="key" aria-hidden="true">{i + 1}</span>
                  {o.label}
                  {syms && <span className="sym-tag">Sym</span>}
                  {mine && !isBattle && result && <span className="pts">{result.is_correct ? '✓ ' : ''}+{result.points_earned}</span>}
                </button>
              )
            })}
          </div>
          {nextButton}
        </>
      )}
      {error && <p className="error" role="alert">{error}</p>}
      {!(result && !auto) && <button className="link" onClick={(e) => { e.stopPropagation(); leave() }}>Leave</button>}
    </section>
  )
}

/**
 * One answer becomes one block of the Sym's code: a small lit T rises from the card toward the Sym and fades.
 * It is drawn only when motion is on (the caller asks still()). The script runs the motion, as the Sym's own
 * drawing does, so it follows the game's motion switch.
 */
function TBlock() {
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const move = ref.current?.animate?.(
      [
        { opacity: 0, transform: 'translate(0, 0) scale(0.6)' },
        { opacity: 1, transform: 'translate(-6px, -14px) scale(1.15)', offset: 0.18 },
        { opacity: 1, transform: 'translate(-40px, -80px) scale(0.95)', offset: 0.7 },
        { opacity: 0, transform: 'translate(-64px, -118px) scale(0.7)' },
      ],
      { duration: 1300, easing: 'ease-out', fill: 'both' },
    )
    return () => move?.cancel()
  }, [])
  return <span ref={ref} className="t-block">T</span>
}

function BoardView(props: { board: Board; options: string[]; disabled: boolean; chosen?: string | null; answer?: string | null; onPick: (choice: string) => void }) {
  const { board, options, disabled, onPick } = props
  const name = (mark: string) => (mark === '.' ? 'empty' : mark)
  const chosen = props.chosen ?? null
  const answer = props.answer ?? null

  if (board.game === 'pattern') return <PatternView key={board.seq.join('|')} board={board} disabled={disabled} chosen={props.chosen ?? null} answer={props.answer ?? null} onPick={onPick} />

  if (board.game === 'tictactoe') {
    return (
      <div className="ttt" role="group" aria-label="Tic-tac-toe board. Pick an empty square.">
        {board.rows.flatMap((row, r) =>
          [...row].map((mark, c) => {
            const move = `${r},${c}`
            const label = `Row ${r + 1}, column ${c + 1}, ${name(mark)}`
            const mine = chosen === move
            const wins = answer === move
            return mark === '.' && options.includes(move) ? (
              <button key={move} className={`cell empty${mine ? ' picked' : ''}${wins ? ' answer' : ''}`} aria-pressed={mine}
                aria-label={`${label}${mine ? '. Your move' : ''}${wins ? '. The move that wins' : ''}`} disabled={disabled} onClick={() => onPick(move)}>
                {mine || wins ? board.to_move || 'X' : ''}
              </button>
            ) : (
              <span key={move} className={`cell mark-${mark}`} role="img" aria-label={label}>{mark}</span>
            )
          }),
        )}
      </div>
    )
  }

  const cols = board.rows[0].length
  return (
    <div className="c4" role="group" aria-label="Four in a row board. Pick a column for your piece.">
      <div className="c4-drops" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
        {Array.from({ length: cols }, (_, c) => (
          <button
            key={c}
            className={`drop${chosen === String(c) ? ' picked' : ''}${answer === String(c) ? ' answer' : ''}`}
            aria-pressed={chosen === String(c)}
            aria-label={`Put your piece in column ${c + 1}${answer === String(c) ? '. The move that wins' : ''}`}
            disabled={disabled || !options.includes(String(c))}
            onClick={() => onPick(String(c))}
          >
            ↓<span aria-hidden="true">{c + 1}</span>
          </button>
        ))}
      </div>
      <div className="c4-grid" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
        {board.rows.flatMap((row, r) =>
          [...row].map((mark, c) => (
            <span key={`${r},${c}`} className={`disc mark-${mark === '.' ? 'none' : mark}`} role="img" aria-label={`Row ${r + 1}, column ${c + 1}, ${name(mark)}`}>
              {mark === '.' ? '' : mark}
            </span>
          )),
        )}
      </div>
    </div>
  )
}

const NTH = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth']

/**
 * Dots flash on a grid one after another, then the player taps where the next one will be. When the flashing ends,
 * each square keeps the numbers of its flashes, so the game tests seeing the rule and not memory. With motion off
 * the numbers are shown at once. A screen reader hears the order in the label of each square.
 */
function PatternView(props: { board: Board; disabled: boolean; chosen: string | null; answer: string | null; onPick: (choice: string) => void }) {
  const { board, disabled, chosen, answer, onPick } = props
  const calm = still()
  const [lit, setLit] = useState(calm ? board.seq.length : -1)
  const [run, setRun] = useState(0)
  const watching = lit < board.seq.length

  useEffect(() => {
    if (calm) return
    let step = -1
    const timer = window.setInterval(() => {
      step += 1
      setLit(step)
      if (step >= board.seq.length) window.clearInterval(timer)
    }, 480)
    return () => window.clearInterval(timer)
  }, [calm, board.seq.length, run])

  const cols = board.rows[0].length
  return (
    <div className="pattern-wrap">
      <div className={`pattern n${board.rows.length * cols}`} style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}
        role="group" aria-label={`A grid of ${board.rows.length * cols} squares. ${board.seq.length} dots flashed, one after another. Pick the square for the next dot.`}>
        {board.rows.flatMap((row, r) =>
          [...row].map((_, c) => {
            const id = `${r},${c}`
            const hits = board.seq.map((cell, i) => (cell === id ? i : -1)).filter((i) => i >= 0)
            const on = watching && board.seq[lit] === id
            // once the pick is stored the server says where the dot went, and the board shows it
            const here = answer === id
            const missed = answer !== null && chosen === id && !here
            return (
              <button key={id} className={on ? 'pcell on' : here ? 'pcell picked answer' : missed ? 'pcell missed' : chosen === id ? 'pcell picked' : 'pcell'} aria-pressed={chosen === id} disabled={disabled || watching} onClick={() => onPick(id)}
                aria-label={`Row ${r + 1}, column ${c + 1}${hits.length ? `, flashed ${hits.map((i) => NTH[i] ?? `number ${i + 1}`).join(' and ')}` : ', did not flash'}${here ? '. The next dot went here' : missed ? '. Your pick' : ''}`}>
                {on && <span className="pdot" />}
                {!watching && (hits.length > 0 || here || missed) && (
                  <span className="pnum">
                    {hits.map((i) => i + 1).join(' · ')}
                    {here && <strong className="pnext">{hits.length ? ' · ' : ''}{board.seq.length + 1}</strong>}
                    {missed && <span className="pmine">{hits.length ? ' · ' : ''}you</span>}
                  </span>
                )}
              </button>
            )
          }),
        )}
      </div>
      <p className="pattern-foot">
        <span className="muted" aria-live="polite">{watching ? `Dot ${Math.max(1, lit + 1)} of ${board.seq.length}` : answer ? `The next dot is marked ${board.seq.length + 1}.` : ''}</span>
        {!calm && !watching && !disabled && <button className="link" onClick={() => { setLit(-1); setRun((n) => n + 1) }}>Watch again</button>}
      </p>
    </div>
  )
}

const MISS: Record<string, string> = { slow: 'Just late.', early: 'Early. Wait for the full ring.', wrong: 'That was the other ring.' }

/**
 * One reaction drill. A ring waits for a time no one can guess, then fills; the player taps it as fast as they can.
 * "side" shows two rings and fills one. "wait" may flash an empty ring first, which must not be tapped.
 * The time from the signal to the tap is measured here, in the browser. Nothing moves or flashes more than once.
 */
function ReflexView(props: { board: Board; disabled: boolean; onDone: (outcome: string, ms: number) => void }) {
  const { board, disabled, onDone } = props
  const mode = board.rows[0]
  const limit = Number(board.to_move)
  const [stage, setStage] = useState<'wait' | 'decoy' | 'go' | 'done'>('wait')
  const [side, setSide] = useState(0)
  const [said, setSaid] = useState('Wait for the ring to fill.')
  const goAt = useRef(0)
  const over = useRef(false)
  const report = useRef(onDone)

  useEffect(() => {
    report.current = onDone
  }, [onDone])

  useEffect(() => {
    const timers: number[] = []
    const first = 1200 + Math.random() * 1800
    if (mode === 'wait' && Math.random() < 0.7) {
      timers.push(window.setTimeout(() => setStage((s) => (s === 'wait' ? 'decoy' : s)), first * 0.5))
      timers.push(window.setTimeout(() => setStage((s) => (s === 'decoy' ? 'wait' : s)), first * 0.5 + 450))
    }
    timers.push(window.setTimeout(() => {
      if (over.current) return
      setSide(Math.random() < 0.5 ? 0 : 1)
      goAt.current = performance.now()
      setStage('go')
      setSaid('Now.')
    }, first))
    timers.push(window.setTimeout(() => {
      if (over.current) return
      over.current = true
      setStage('done')
      setSaid(MISS.slow)
      report.current('slow', limit + 1500)
    }, first + limit + 1500))
    return () => timers.forEach((t) => window.clearTimeout(t))
  }, [mode, limit])

  function tap(which: number) {
    if (over.current || disabled) return
    over.current = true
    const ms = stage === 'go' ? Math.round(performance.now() - goAt.current) : 0
    const outcome = stage !== 'go' ? 'early' : mode === 'side' && which !== side ? 'wrong' : ms <= limit ? 'hit' : 'slow'
    setStage('done')
    // seconds on this device only: a phone or laptop adds its own delay, so no normal time is ever shown beside it
    const secs = (ms / 1000).toFixed(2)
    setSaid(outcome === 'hit' ? `${secs} s on this device.` : outcome === 'slow' ? `${secs} s. ${MISS.slow}` : MISS[outcome])
    report.current(outcome, ms)
  }

  const rings = mode === 'side' ? [0, 1] : [0]
  return (
    <div className="reflex">
      <div className="reflex-rings">
        {rings.map((r) => {
          const full = stage === 'go' && (mode !== 'side' || r === side)
          return (
            <button key={r} className={full ? 'ring full' : stage === 'decoy' ? 'ring decoy' : 'ring'} disabled={disabled || stage === 'done'}
              aria-label={mode === 'side' ? (r === 0 ? 'Left ring' : 'Right ring') : 'The ring'} onPointerDown={() => tap(r)}
              onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); tap(r) } }} />
          )
        })}
      </div>
      <p className="muted" role="status" aria-live="assertive">{said}</p>
    </div>
  )
}


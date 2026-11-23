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
  /** the gate my Sym wants after this one, so one tap goes straight on */
  nextUp?: { id: string; title: string }
  onNext?: (gateId: string) => void
}

/** the first gate: its picks write the first blocks of the Sym's code, so its finish shows that code */
const CALIBRATOR = 'style-1'

export function GatePlay({ gateId, gateKind, announce, onProgress, onExit, nextUp, onNext }: Props) {
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
  const goNext = useCallback(() => {
    if (nextUp && onNext) void Promise.allSettled(pending.current).then(() => onNext(nextUp.id))
  }, [nextUp, onNext])
  const promptRef = useRef<HTMLHeadingElement>(null)
  // with motion on, a result is one short beat and the next card comes by itself. With motion off (or a device
  // that asks for less motion) nothing moves on a timer: the result stays until Next card is tapped.
  const moveOn = useRef(0)
  const lock = useRef(false) // a pick is on its way: a second tap in the same beat does nothing
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
    setIndex((i) => i + 1)
  }, [])

  const pick = useCallback(
    async (choice: string, sure?: number, took?: number) => {
      if (!card || busy || result) return
      const ms = took ?? Math.max(0, Math.round(performance.now() - shownAt.current))
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
            : card.board?.game === 'reflex' ? (out.is_correct ? 'In time.' : 'Not this time.')
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
    [card, busy, result, isBattle, announce, onProgress, advance],
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
        {!battle && !error && <p aria-live="polite">Counting the results.</p>}
        {battle && (
          <>
            <SymCue who={`My Sym${battle.twin_kind === 'offline' ? ' · practice Sym, no AI' : ''}`} calm={still()} formed={1} go={onwardGo} act={onward}
              say={`I called ${battle.twin_matches} of ${battle.n}. The crowd got ${battle.baseline_matches}.${battle.cert ? ' Certificate earned.' : ''}${!learned ? ' Studying my misses.' : learned.misses > 0 ? ` I made ${learned.lessons.length} ${learned.lessons.length === 1 ? 'change' : 'changes'}.` : ''}`} />
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

  if (finished) {
    return (
      <section aria-labelledby="done-h" className="gate-done">
        <h1 id="done-h" tabIndex={-1} className="sr-only">Gate finished: {gate.title}</h1>
        <p className="done-hero"><span className="done-num lead"><strong>+{earned}</strong> points</span></p>
        {gateId === CALIBRATOR && <CodeView brief />}
        <SymCue calm={still()} formed={1} go={onwardGo} act={onward}
          say={`${gate.total} ${gate.total === 1 ? 'tap' : 'taps'} kept.${bonus + sponsored > 0 ? ` We earned ${credits(bonus + sponsored)} credits.` : ''}`} />
        {cert && (
          <p className="cert">
            <span className="cert-kind">Certificate</span>
            <strong>{cert.topic}, {cert.level} · {Math.round(cert.accuracy * cert.n)} of {cert.n}</strong>
          </p>
        )}
        {!cert && mark && mark.need !== null && <p className="fine">{mark.right} of {mark.need}. A certificate needs {mark.need}.</p>}
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
    bet ? (got ? 'I bet yes. Right.' : 'I bet yes. Wrong.') : got ? 'I bet no. You beat me.' : 'I bet no. Right.'
  // a few words at most, and nothing on most cards: the path filling one light for each tap says the rest
  const symSay = result && isBattle
    ? (result.twin_match ? (run >= 2 ? `Called it. ${run} in a row.` : 'Called it.') : 'You surprised me.')
    : result
      ? result.twin_bet !== null
        ? betSay(result.twin_bet, result.is_correct)
        : result.is_correct ? (streak >= 3 ? `${streak} in a row.` : 'Yes.') : 'Next one.'
      : isBattle
        ? (sure[card.id] === undefined ? 'Sealed.' : `Sealed. ${sure[card.id]}% sure.`)
        : card.board?.game === 'pattern' && card.bet_sure !== null
          ? 'My bet is in.'
          : index === 0 ? 'Tap. I learn.'
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
            {result && <p className={`beat ${result.is_correct ? 'right' : 'wrong'}`} role="status">{result.is_correct ? '✓' : 'Not this time.'} <strong>+{result.points_earned}</strong></p>}
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
                <button key={o.id} className={`option${how}`} disabled={busy || result !== null || chosen !== null} onClick={() => void pick(o.id)}>
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

const MISS: Record<string, string> = { slow: 'Too slow.', early: 'Too soon. Wait for the full ring.', wrong: 'That was the other ring.' }

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
    setSaid(outcome === 'hit' ? `${ms} thousandths of a second.` : outcome === 'slow' ? `${ms} thousandths of a second. ${MISS.slow}` : MISS[outcome])
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


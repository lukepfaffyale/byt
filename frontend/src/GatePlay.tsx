import { useCallback, useEffect, useRef, useState } from 'react'
import { api, type BattleResult, type Board, type Card, type Cert, type Gate, type Learned, type ResponseOut } from './api'
import { Tabs } from './Deck'
import { still } from './motion'
import { Rows } from './Rows'
import { Failed } from './Retry'
import { SymLive } from './SymLive'
import { SymCue } from './SymCue'
import { Worth } from './Worth'
import { credits, stop } from './words'

// what my Sym says after a tap that has no right answer: short, and true of every tap
const KEPT = ['Kept.', 'Got it.', 'That tells me something.', 'Noted.']

const SURE: [number, string][] = [[3, 'Sure'], [2, 'Think so'], [1, 'A guess']]
const LESSON: Record<string, string> = { changed: 'Rewrote', new: 'New', dropped: 'Dropped', count: 'Counted', held: 'Held' }

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

export function GatePlay({ gateId, gateKind, announce, onProgress, onExit, nextUp, onNext }: Props) {
  const isBattle = gateKind === 'battle'
  const [gate, setGate] = useState<Gate | null>(null)
  const [cards, setCards] = useState<Card[]>([])
  const [index, setIndex] = useState(0)
  const [result, setResult] = useState<ResponseOut | null>(null)
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
  const [calls, setCalls] = useState({ right: 0, total: 0 })
  const [record, setRecord] = useState<ResponseOut['sure_record']>([])
  const [after, setAfter] = useState<'learned' | 'areas' | 'score'>('learned')
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
  // when a gate ends my Sym says what it was worth and offers the next one: one tap and the loop goes on
  const onward = nextUp && onNext ? goNext : leave
  const onwardGo = nextUp && onNext ? `Next: ${nextUp.title}` : 'Back to my Journey'
  const onwardSay = nextUp && onNext ? ` Next up: ${stop(nextUp.title)}` : ''
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
  // asking how sure costs a tap, so it is asked on every second board card: enough to fill the record
  const askSure = !!card?.board && card.board.game !== 'reflex' && index % 2 === 0

  useEffect(() => {
    if (!card) return
    shownAt.current = performance.now()
    promptRef.current?.focus()
  }, [card])

  useEffect(() => {
    if (result) nextRef.current?.focus()
  }, [result])

  useEffect(() => {
    if (!finished || !isBattle) return
    let cancelled = false
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
  }, [finished, isBattle, gateId, announce, onProgress])

  const advance = useCallback(() => {
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
        // No right answer to wait for: move on at once and save in the background.
        const saving = api
          .respond(card.id, choice, ms)
          .then((out) => {
            setEarned((n) => n + out.points_earned)
            onProgress()
          })
          .catch((e: unknown) => setError(e instanceof Error ? e.message : 'The game could not save a pick.'))
        pending.current.push(saving)
        announce('Saved.')
        setIndex((i) => i + 1)
        return
      }
      setBusy(true)
      try {
        const out = await api.respond(card.id, choice, ms, sure)
        setEarned((n) => n + out.points_earned)
        if (out.twin_bet !== null) {
          const called = out.twin_bet === out.is_correct
          setCalls((c) => ({ right: c.right + (called ? 1 : 0), total: c.total + 1 }))
        }
        if (out.sure_record.length > 0) setRecord(out.sure_record)
        if (!isBattle) setStreak((n) => (out.is_correct ? n + 1 : 0))
        if (out.cert) setCert(out.cert)
        if (out.cert_right !== null) setMark({ need: out.cert_need, right: out.cert_right })
        if (out.bonus > 0) setBonus(out.bonus)
        if (out.sponsored > 0) setSponsored(out.sponsored)
        onProgress()
        if (isBattle) {
          setTally((t) => ({ twin: t.twin + (out.twin_match ? 1 : 0), crowd: t.crowd + (out.crowd_match ? 1 : 0), done: t.done + 1 }))
          announce(`Your Sym said: ${out.twin_choice}. ${out.twin_match ? 'Your Sym was right.' : 'Your Sym was wrong. It will study this after the battle.'}`)
        } else {
          const said = card.board ? (out.is_correct ? 'That move wins.' : 'That move does not win.') : out.is_correct ? 'That is right.' : 'That is not right.'
          announce(`${said} You get ${out.points_earned} points.`)
        }
        setResult(out)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'There was a problem. Please try again.')
      } finally {
        setBusy(false)
      }
    },
    [card, busy, result, isBattle, announce, onProgress],
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
            <p className="twin-says">I am learning about you.</p>
            <h1>Your Sym is making its guesses now.</h1>
            <p className="muted">Your Sym saves its guesses before you see any card. It cannot change them later.</p>
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
        <h1 id="done-h" tabIndex={-1}>{battle?.cert ? 'Your Sym knows you.' : 'The battle is over.'}</h1>
        {!battle && !error && <p aria-live="polite">Counting the results.</p>}
        {battle && (
          <>
            <SymCue who={`My Sym${battle.twin_kind === 'offline' ? ' · practice Sym, no AI' : ''}`} calm={still()} formed={1} go={onwardGo} act={onward}
              say={`I guessed ${battle.twin_matches} of your ${battle.n} picks before you made them. The crowd's guess got ${battle.baseline_matches}. ${!learned ? 'I am studying what I got wrong.'
                : learned.misses === 0 ? 'I got every one right, so my beliefs held.'
                  : `I studied my ${learned.misses} wrong ${learned.misses === 1 ? 'guess' : 'guesses'} and made ${learned.lessons.length} ${learned.lessons.length === 1 ? 'change' : 'changes'} to what I believe about you.`}${battle.cert ? ' We earned a certificate.' : ''}${onwardSay}`} />
            <Tabs label="After the battle" value={after} onChange={setAfter}
              tabs={[
                { id: 'learned', label: 'What I learned', n: learned ? learned.lessons.length : '...' },
                { id: 'areas', label: 'Where I know you', n: battle.areas.length },
                { id: 'score', label: 'Score', n: `${battle.twin_matches}/${battle.n}` },
              ]} />
            {after === 'learned' && !learned && <p className="muted" aria-live="polite">My Sym is studying its wrong guesses.</p>}
            {after === 'learned' && learned && (
              <>
                <Rows pageKey="lessons" size={4} wide empty="Nothing changed." rows={learned.lessons.map((l, i) => ({
                  id: `l${i}`, top: LESSON[l.kind] ?? l.kind, gold: l.kind !== 'held', label: l.after || l.before,
                  detail: l.kind === 'changed' ? <>About {l.topic}. Before the battle I believed: {l.before}</>
                    : l.kind === 'dropped' ? <>I no longer believe this. The battle showed it was wrong.</>
                      : l.kind === 'count' ? <>On the card "{l.topic}". {l.before}.</>
                        : l.kind === 'new' ? <>A new belief about {l.topic}. I did not hold it before the battle.</> : undefined,
                }))} />
                <p className="fine">Your {learned.picks_added} picks in this battle now count as proof. My next battle uses cards I have not seen.</p>
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
                <p className="fine">Each pick you made falls in one area. The number is how many of those my Sym had guessed. The areas are loose textbook links. Nothing here measures a brain.</p>
              </>
            )}
            {after === 'score' && (
              <>
                <dl className="pair">
                  <div><dt>My Sym</dt><dd>{battle.twin_matches}</dd><dd className="muted">of {battle.n}</dd></div>
                  <div><dt>The crowd's guess</dt><dd>{battle.baseline_matches}</dd><dd className="muted">what most people pick</dd></div>
                  <div><dt>Every battle so far</dt><dd>{battle.record.join(' · ')}</dd><dd className="muted">oldest first</dd></div>
                </dl>
                {battle.cert ? (
                  <p className="cert">
                    <span className="cert-kind">Certificate</span>
                    <strong>Sym: {battle.cert.topic}</strong>
                    <span>{Math.round(battle.cert.accuracy * 100)} percent right on {battle.cert.n} picks your Sym had not seen</span>
                  </p>
                ) : (
                  <p className="muted">{battle.note}</p>
                )}
              </>
            )}
          </>
        )}
        {error && <p className="error" role="alert">{error}</p>}
        <Worth seat="player" moment="gate" />
        {nextUp && <button className="link" onClick={leave}>Go back to Journey</button>}
      </section>
    )
  }

  if (finished) {
    return (
      <section aria-labelledby="done-h" className="gate-done">
        <h1 id="done-h" tabIndex={-1}>Gate finished: {gate.title}</h1>
        <SymCue calm={still()} formed={1} go={onwardGo} act={onward}
          say={`That gate is mine to keep: ${cards.length} ${cards.length === 1 ? 'tap' : 'taps'}, and ${earned} points for you.${bonus > 0 ? ` You passed a skill step, so the growth fund paid us ${credits(bonus)} credits.` : ''}${sponsored > 0 ? ` An agency backs this skill, and paid us ${credits(sponsored)} more.` : ''}${cert ? ' And you earned a certificate.' : ''}${onwardSay}`} />
        {cert && (
          <p className="cert">
            <span className="cert-kind">Certificate</span>
            <strong>{cert.topic}, {cert.level}</strong>
            <span>You solved {Math.round(cert.accuracy * cert.n)} of {cert.n}</span>
          </p>
        )}
        {!cert && mark && (
          <p className="fine">
            {mark.need === null
              ? 'This gate is too short to earn a certificate. A full score here could still be luck.'
              : `No certificate this time. It needed ${mark.need} right and you got ${mark.right}. A certificate is only given for a score that guessing would almost never reach. It cannot be bought.`}
          </p>
        )}
        {record.some((r) => r.total > 0) && (
          <>
            <div className="twin-line">
              <span className="line-top">My Sym</span>
              <p>
                {calls.total > 0 && `I called ${calls.right} of ${calls.total} of your answers before you gave them.`}
                {(() => {
                  const top = record.find((r) => r.level === 3)
                  if (!top || top.total === 0) return ' Tap Sure when you are sure, and I can tell you how often that holds.'
                  return ` When you say you are sure, you are right ${top.right} of ${top.total} times. ${top.right / top.total >= 0.8 ? 'You can trust that feeling.' : 'Slow down when you feel sure.'}`
                })()}
              </p>
            </div>
            <dl className="pair">
              {SURE.map(([level, name]) => {
                const row = record.find((r) => r.level === level)
                return <div key={level}><dt>{name}</dt><dd>{row && row.total ? `${row.right}/${row.total}` : '0'}</dd><dd className="muted">right when you said this</dd></div>
              })}
            </dl>
          </>
        )}
        <Worth seat="player" moment="gate" />
        {nextUp && <button className="link" onClick={leave}>Go back to Journey</button>}
      </section>
    )
  }

  // my Sym answers each tap in its own voice. Code writes the line from what just happened; no model does.
  const left = cards.length - index
  const bet = (yes: boolean) => (yes ? 'get it' : 'miss it')
  const symSay = result && isBattle
    ? (result.twin_match ? 'I guessed that. I know you here.' : 'I was wrong about you. I will study this one after the battle.')
    : result
      ? result.twin_bet !== null
        ? `I bet you would ${bet(result.twin_bet)}, ${result.twin_bet_sure} percent sure. ${result.twin_bet === result.is_correct ? 'I called it.' : 'I was wrong about you.'}`
        : result.is_correct ? (streak >= 3 ? `That is ${streak} right in a row. Keep going.` : 'That was right. Keep going.') : 'Not that one. The next one is yours.'
      : isBattle
        ? `My guess is sealed. ${sure[card.id] === undefined ? 'Tap, and we see if I know you.' : sure[card.id] >= 75 ? `I am ${sure[card.id]} percent sure. I think I know you here.`
          : sure[card.id] >= 45 ? `I am ${sure[card.id]} percent sure.` : `I am only ${sure[card.id]} percent sure. This one is hard for me.`}`
        : card.board?.game === 'pattern' && card.bet_sure !== null
          ? `I have bet on whether you get this one. I am ${card.bet_sure} percent sure of my bet.`
          : index === 0 ? 'I am watching. Tap, and I learn.'
            : left === 1 ? 'One more tap, and this gate is mine to keep.'
              : index === Math.ceil(cards.length / 2) ? `Half way. ${left} more and I know you better.`
                : `${KEPT[index % KEPT.length]} ${left} to go.`

  return (
    <section aria-labelledby="card-h" className="play">
      <SymLive say={symSay} done={index + (result ? 1 : 0)} total={cards.length} pulse={index * 2 + (result ? 1 : 0)} calm={still()}
        label={`My Sym · ${gate.title} · ${index + 1} of ${cards.length}${isBattle && twinKind === 'offline' ? ' · practice Sym, no AI' : ''}`} />
      {isBattle && (
        <p className="duel" aria-label={`So far: your Sym ${tally.twin}, the crowd's guess ${tally.crowd}, of ${tally.done} cards.`}>
          <span><strong>{tally.twin}</strong> my Sym</span>
          <span><strong>{tally.crowd}</strong> the crowd</span>
          <span><strong>{tally.done}</strong> played</span>
        </p>
      )}
      <h1 id="card-h" ref={promptRef} tabIndex={-1} className="prompt">{card.prompt}</h1>

      {card.board ? (
        card.board.game === 'reflex' ? (
          <ReflexView key={card.id} board={card.board} disabled={busy || result !== null} onDone={(outcome, ms) => void pick(outcome, undefined, ms)} />
        ) : (
          <BoardView board={card.board} options={card.options.map((o) => o.id)} disabled={busy || result !== null} chosen={chosen}
            onPick={askSure ? setChosen : (move) => void pick(move)} />
        )
      ) : (
        <div className={`options n${card.options.length}`}>
          {card.options.map((o, i) => (
            <button key={o.id} className="option" disabled={busy || result !== null} onClick={() => void pick(o.id)}>
              <span className="key" aria-hidden="true">{i + 1}</span>
              {o.label}
            </button>
          ))}
        </div>
      )}

      {result && isBattle && (
        <div className={`result ${result.twin_match ? 'right' : 'wrong'}`}>
          <p>
            <strong>{result.twin_match ? '✓ Your Sym was right.' : '✗ Your Sym was wrong.'}</strong> Your Sym said: {result.twin_choice}
            {result.twin_sure !== null && `, ${result.twin_sure} percent sure`}. The crowd's guess was {result.crowd_match ? 'right' : 'wrong'}.
          </p>
          {result.twin_because && <p className="leaned"><span className="line-top">{result.twin_match ? 'The belief that got it right' : 'The belief that failed'}</span> {result.twin_because}</p>}
          {!result.twin_match && <p className="fine">I will study this after the battle and change what I believe.</p>}
          <button ref={nextRef} className="primary" onClick={advance}>Next</button>
        </div>
      )}
      {card.board && chosen && !result && (
        <div className="chips sure" role="group" aria-label="How sure are you?">
          <span className="chips-label">
            {card.board.game === 'pattern' ? '' : `You picked: ${card.options.find((o) => o.id === chosen)?.label ?? chosen}. `}How sure are you?
          </span>
          {SURE.map(([level, name]) => (
            <button key={level} className="chip" disabled={busy} onClick={() => void pick(chosen, level)}>{name}</button>
          ))}
        </div>
      )}
      {result && !isBattle && (
        <div className={`result ${result.is_correct ? 'right' : 'wrong'}`}>
          <p>
            <strong>{card.board?.game === 'reflex' ? (result.is_correct ? '✓ In time.' : '✗ Not this time.') : card.board?.game === 'pattern' ? (result.is_correct ? '✓ You saw the pattern.' : '✗ The dot went somewhere else.') : card.board ? (result.is_correct ? '✓ That move wins.' : '✗ That move does not win.') : result.is_correct ? '✓ That is right.' : '✗ That is not right.'}</strong> +{result.points_earned} points
            {result.others_total !== null && result.others_total > 0 && `. ${result.others_right} of ${result.others_total} other players got this one.`}
          </p>
          <button ref={nextRef} className="primary" onClick={advance}>Next</button>
        </div>
      )}
      {error && <p className="error" role="alert">{error}</p>}
      <button className="link" onClick={leave}>Leave this gate</button>
    </section>
  )
}

function BoardView(props: { board: Board; options: string[]; disabled: boolean; chosen?: string | null; onPick: (choice: string) => void }) {
  const { board, options, disabled, onPick } = props
  const name = (mark: string) => (mark === '.' ? 'empty' : mark)

  if (board.game === 'pattern') return <PatternView key={board.seq.join('|')} board={board} disabled={disabled} chosen={props.chosen ?? null} onPick={onPick} />

  if (board.game === 'tictactoe') {
    return (
      <div className="ttt" role="group" aria-label="Tic-tac-toe board. Pick an empty square.">
        {board.rows.flatMap((row, r) =>
          [...row].map((mark, c) => {
            const move = `${r},${c}`
            const label = `Row ${r + 1}, column ${c + 1}, ${name(mark)}`
            return mark === '.' && options.includes(move) ? (
              <button key={move} className="cell empty" aria-label={label} disabled={disabled} onClick={() => onPick(move)} />
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
            className="drop"
            aria-label={`Put your piece in column ${c + 1}`}
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
function PatternView(props: { board: Board; disabled: boolean; chosen: string | null; onPick: (choice: string) => void }) {
  const { board, disabled, chosen, onPick } = props
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
    }, 650)
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
            return (
              <button key={id} className={on ? 'pcell on' : chosen === id ? 'pcell picked' : 'pcell'} aria-pressed={chosen === id} disabled={disabled || watching} onClick={() => onPick(id)}
                aria-label={`Row ${r + 1}, column ${c + 1}${hits.length ? `, flashed ${hits.map((i) => NTH[i] ?? `number ${i + 1}`).join(' and ')}` : ', did not flash'}`}>
                {on && <span className="pdot" />}
                {!watching && <span className="pnum">{hits.map((i) => i + 1).join(' · ')}</span>}
              </button>
            )
          }),
        )}
      </div>
      <p className="pattern-foot">
        <span className="muted" aria-live="polite">{watching ? `Dot ${Math.max(1, lit + 1)} of ${board.seq.length}` : 'The numbers show the order. Where is the next dot?'}</span>
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


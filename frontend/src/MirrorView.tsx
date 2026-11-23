import { useEffect, useState } from 'react'
import { api, type Axis, type Mirror, type SkillRef, type Told } from './api'
import { More } from './More'
import { usePager } from './pager'
import { Pick, Pop, Tools } from './Rows'
import { Failed } from './Retry'

const SIGNS = ['aries', 'taurus', 'gemini', 'cancer', 'leo', 'virgo', 'libra', 'scorpio', 'sagittarius', 'capricorn', 'aquarius', 'pisces']
const ANIMALS = ['rat', 'ox', 'tiger', 'rabbit', 'dragon', 'snake', 'horse', 'goat', 'monkey', 'rooster', 'dog', 'pig']
const BANDS = ['Very low', 'Low', 'Average', 'High', 'Very high']
const LETTER_KEYS = ['ei', 'sn', 'tf', 'jp'] as const
const VERDICT: Record<Axis['verdict'], string> = {
  aligned: 'Same as what you told your Sym.',
  differs: 'Your picks and your own view differ here. Both can be true.',
  open: 'Not clear yet: your Sym needs more picks.',
  'not told': '',
}
type Part = 'guess' | 'letters' | 'styles' | 'stars'
const STAR_PAGES: ('sign' | 'animal')[] = ['sign', 'animal']

function cap(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1)
}

/** One line of a list of bars: its name, its number and a thin meter. A tap opens what it means in a pop-out. */
function Bar(props: { name: string; share: number; lead?: boolean; onOpen: () => void }) {
  return (
    <li className={`bar ${props.lead ? 'leading' : ''}`}>
      <button className="bar-head" aria-haspopup="dialog" onClick={props.onOpen}>
        <span className="bar-name">{props.name}</span>
        <span className="bar-n">{Math.round(props.share * 100)}</span>
        <span className="meter" aria-hidden="true"><span style={{ width: `${props.share * 100}%` }} /></span>
      </button>
    </li>
  )
}

function SkillLinks({ skills, onSkill }: { skills: SkillRef[]; onSkill: (id: string) => void }) {
  if (skills.length === 0) return null
  return (
    <p className="grow">
      <span className="line-top">Skills that help</span>
      {skills.map((k) => (
        <button key={k.id} className="chip" onClick={() => onSkill(k.id)}>{k.name}</button>
      ))}
    </p>
  )
}

/**
 * Who I am, one view at a time: my type, my mind (thinking styles) and my brain (areas of the mind). Each view
 * fits one page. A tap on a line opens what it means in a pop-out. The small tools (arrows, More) sit in the slot
 * beside the sub-tabs.
 */
export function MirrorView({ view, onSkill, open, slot }: { view: 'type' | 'mind' | 'brain'; onSkill: (id: string) => void; open?: string; slot?: HTMLElement | null }) {
  const [mirror, setMirror] = useState<Mirror | null>(null)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [openRow, setOpenRow] = useState<string | null>(open ?? null)
  const [part, setPart] = useState<Part>('guess')
  const stylePages = usePager(mirror?.styles ?? [], 2, 'styles')
  const starPages = usePager(STAR_PAGES, 1, 'stars')

  useEffect(() => {
    let cancelled = false
    api
      .mirror()
      .then((m) => {
        if (!cancelled) setMirror(m)
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'There was a problem. Please try again.')
      })
    return () => {
      cancelled = true
    }
  }, [])

  function save(change: Partial<Told>) {
    if (!mirror) return
    const next = { ...mirror.told, ...change }
    setMirror({ ...mirror, told: next })
    setStatus('Saving.')
    api
      .tell(next)
      .then((m) => {
        setMirror(m)
        setStatus('Saved.')
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'There was a problem. Please try again.'))
  }

  function clear() {
    api
      .untell()
      .then((m) => {
        setMirror(m)
        setStatus('Cleared.')
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'There was a problem. Please try again.'))
  }

  if (error) return <Failed error={error} />
  if (!mirror) return <p className="muted" aria-live="polite">Loading.</p>

  const told = mirror.told
  const anyTold = Object.values(told).some((v) => v !== null)
  const tools = (kids: React.ReactNode) => (slot === undefined ? kids : <Tools slot={slot}>{kids}</Tools>)
  const close = () => setOpenRow(null)

  if (view === 'mind') {
    const style = mirror.styles.find((s) => s.key === openRow)
    const path = mirror.paths.find((p) => `path-${p.kind}` === openRow)
    return (
      <div className="mirror mine-mirror">
        {mirror.paths.length > 0 && (
          <ul className="mine-paths">
            {mirror.paths.map((p) => (
              <li key={p.kind}>
                <button className="mine-path" aria-haspopup="dialog" onClick={() => setOpenRow(`path-${p.kind}`)}>
                  <span className="line-top">{p.kind === 'specialise' ? 'You pick most' : 'You pick least'}</span>
                  <span className="path-style">{p.style}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <ul className="bars mine-bars">
          {mirror.styles.map((s) => (
            <Bar key={s.key} name={s.name} share={s.share} lead={mirror.top_styles.includes(s.key)} onOpen={() => setOpenRow(s.key)} />
          ))}
        </ul>
        {tools(<More>Tap a line to open it. The number is the percent of times you picked that style. A simple computer program counts it.</More>)}
        {style && (
          <Pop label={style.name} onClose={close}>
            <p className="line-top">Thinking style · {Math.round(style.share * 100)} percent</p>
            <p className="mine-pop-title">{style.name}</p>
            <p>{style.about}</p>
            <p className="line-top">From your picks in this game:</p>
            <p><span className="line-top">What it helps with</span> {style.strength}</p>
            <p><span className="line-top">The trade-off</span> {style.watch}</p>
            <p className="muted">
              You picked this {style.picks} of the {style.chances} times you could{style.told !== null ? `. You told your Sym: ${BANDS[style.told - 1].toLowerCase()}` : ''}.
            </p>
            <SkillLinks skills={style.skills} onSkill={onSkill} />
          </Pop>
        )}
        {path && (
          <Pop label={path.kind === 'specialise' ? 'You pick most' : 'You pick least'} onClose={close}>
            <p className="line-top">{path.kind === 'specialise' ? 'You pick most' : 'You pick least'}</p>
            <p className="mine-pop-title">{path.style}</p>
            <p>{path.kind === 'specialise' ? 'You pick this style the most. These skills build on it.' : 'You pick this style the least. These games let you try it.'}</p>
            <SkillLinks skills={path.skills} onSkill={onSkill} />
          </Pop>
        )}
      </div>
    )
  }

  if (view === 'brain') {
    const f = mirror.faculties.find((x) => x.key === openRow)
    return (
      <div className="mirror mine-mirror">
        <p className="fine" style={{ margin: 0 }}>These bars count your picks. They do not score ability or a brain.</p>
        <ul className="bars mine-bars">
          {mirror.faculties.map((x) => (
            <Bar key={x.key} name={x.name} share={x.share} onOpen={() => setOpenRow(x.key)} />
          ))}
        </ul>
        {tools(<More>Tap a line to open it. The number is the percent of times you picked that area. The brain areas are loose textbook links. Nothing here measures a brain.</More>)}
        {f && (
          <Pop label={f.name} onClose={close}>
            <p className="line-top">Area · {f.picks} of {f.chances} picks</p>
            <p className="mine-pop-title">{f.name}</p>
            <p>{f.about}</p>
            <p><span className="line-top">Did you know</span> {f.fact}</p>
            <p className="muted">You picked this {f.picks} of the {f.chances} times you could. Science books loosely link this kind of thinking to: {f.region}. This is a picture, not a scan.</p>
            {f.feeds.length > 0 && (
              <p><span className="line-top">What feeds it</span> {f.feeds.join(' · ')}</p>
            )}
            <SkillLinks skills={f.skills} onSkill={onSkill} />
          </Pop>
        )}
      </div>
    )
  }

  const axis = mirror.axes.find((a) => a.name === openRow)
  return (
    <div className="mirror mine-mirror">
      {tools(
        <>
          <span className="mine-type" role="img" aria-label={`A guess for your type: ${mirror.axes.map((a) => a.suggested ?? 'not clear yet').join(', ')}`}>
            {mirror.suggested_type.split('').map((ch, i) => (
              <span key={i} className={ch === '.' ? 'open' : ''} aria-hidden="true">{ch === '.' ? '?' : ch}</span>
            ))}
          </span>
          {part === 'styles' && stylePages.pager}
          {part === 'stars' && starPages.pager}
          <More>
            {part === 'guess'
              ? `A guess from ${mirror.picks_used} picks. A mirror, not a test. It can change as you play. `
              : 'You do not have to tell your Sym anything. Tap only what you want the game to store. The game never sends it to the AI model, and you can clear it. Star sign and year animal are here for one test: can stars call your picks better than your Sym? We test it. We do not assume it. '}
            These cards are our own. A simple computer program reads your picks. This is not the official test of any publisher.
          </More>
        </>,
      )}
      <p className="fine" style={{ margin: 0 }}>This is a game mirror. It is not a personality test.</p>
      <Pick className="mine-parts" label="A guess, and what you told your Sym" value={part} onChange={setPart}
        items={[{ id: 'guess', label: 'A guess' }, { id: 'letters', label: 'My letters' }, { id: 'styles', label: 'My styles' }, { id: 'stars', label: 'Stars' }]} />

      {part === 'guess' && (
        <ul className="mine-axes">
          {mirror.axes.map((a) => {
            const total = a.first_picks + a.second_picks
            return (
              <li key={a.name}>
                <button className="mine-axis" aria-haspopup="dialog" onClick={() => setOpenRow(a.name)}
                  aria-label={`${a.name}: ${a.first} ${a.first_picks}, ${a.second} ${a.second_picks}`}>
                  <span className="line-top">{a.name}</span>
                  <span className={`axis-letter ${a.suggested === a.first ? 'on' : ''}`}>{a.first}<sub>{a.first_picks}</sub></span>
                  <span className="meter split" aria-hidden="true">
                    <span style={{ width: total ? `${(a.first_picks / total) * 100}%` : '50%' }} />
                  </span>
                  <span className={`axis-letter ${a.suggested === a.second ? 'on' : ''}`}><sub>{a.second_picks}</sub>{a.second}</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
      {axis && (
        <Pop label={axis.name} onClose={close}>
          <p className="line-top">{axis.name}</p>
          <p className="mine-pop-title">{axis.suggested
            ? `You lean ${axis.suggested}: ${Math.max(axis.first_picks, axis.second_picks)} picks to ${Math.min(axis.first_picks, axis.second_picks)}.`
            : `Too close to call: ${axis.first_picks} to ${axis.second_picks}.`}</p>
          <p>You picked {axis.first} {axis.first_picks} {axis.first_picks === 1 ? 'time' : 'times'} and {axis.second} {axis.second_picks} {axis.second_picks === 1 ? 'time' : 'times'}.</p>
          {VERDICT[axis.verdict] && <p className="muted">{VERDICT[axis.verdict]}{axis.told ? ` You said: ${axis.told}.` : ''}</p>}
        </Pop>
      )}

      {part !== 'guess' && (
        <div className="tell-panel mine-tell">
          {part === 'letters' && (
            <div className="mine-letters">
              {mirror.axes.map((a, i) => {
                const key = LETTER_KEYS[i]
                return (
                  <div className="chips" role="group" aria-label={`${a.name}: your letter`} key={key}>
                    <span className="chips-label">{a.name}</span>
                    {[a.first, a.second].map((letter) => (
                      <button key={letter} className="chip" aria-pressed={told[key] === letter}
                        onClick={() => save({ [key]: told[key] === letter ? null : letter } as Partial<Told>)}>
                        {letter}
                      </button>
                    ))}
                  </div>
                )
              })}
            </div>
          )}

          {part === 'styles' && stylePages.rows.map((s) => (
            <div className="chips mine-bands" role="group" aria-label={`${s.name}: your own rating`} key={s.key}>
              <span className="chips-label">{s.name}</span>
              {BANDS.map((band, i) => (
                <button key={band} className="chip" aria-pressed={told[s.key] === i + 1}
                  onClick={() => save({ [s.key]: told[s.key] === i + 1 ? null : i + 1 } as Partial<Told>)}>
                  {band}
                </button>
              ))}
            </div>
          ))}

          {part === 'stars' && starPages.rows[0] === 'sign' && (
            <div className="chips mine-stars" role="group" aria-label="Your star sign">
              <span className="chips-label">Star sign</span>
              {SIGNS.map((sign) => (
                <button key={sign} className="chip" aria-pressed={told.sign === sign}
                  onClick={() => save({ sign: told.sign === sign ? null : sign })}>
                  {cap(sign)}
                </button>
              ))}
            </div>
          )}
          {part === 'stars' && starPages.rows[0] === 'animal' && (
            <div className="chips mine-stars" role="group" aria-label="Your year animal">
              <span className="chips-label">Year animal</span>
              {ANIMALS.map((animal) => (
                <button key={animal} className="chip" aria-pressed={told.animal === animal}
                  onClick={() => save({ animal: told.animal === animal ? null : animal })}>
                  {cap(animal)}
                </button>
              ))}
            </div>
          )}

          <div className="mine-foot">
            <button className="link" disabled={!anyTold} onClick={clear}>Clear what I told my Sym</button>
            <span className="muted" role="status" aria-live="polite">{status}</span>
          </div>
        </div>
      )}
    </div>
  )
}

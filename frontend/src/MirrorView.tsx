import { useEffect, useState } from 'react'
import { api, type Axis, type Mirror, type SkillRef, type Told } from './api'
import { Tabs } from './Deck'
import { More } from './More'

const SIGNS = ['aries', 'taurus', 'gemini', 'cancer', 'leo', 'virgo', 'libra', 'scorpio', 'sagittarius', 'capricorn', 'aquarius', 'pisces']
const ANIMALS = ['rat', 'ox', 'tiger', 'rabbit', 'dragon', 'snake', 'horse', 'goat', 'monkey', 'rooster', 'dog', 'pig']
const BANDS = ['Very low', 'Low', 'Average', 'High', 'Very high']
const LETTER_KEYS = ['ei', 'sn', 'tf', 'jp'] as const
const VERDICT: Record<Axis['verdict'], string> = {
  aligned: 'Same as what you told your twin',
  differs: 'Different from what you told your twin',
  open: 'Not clear yet: your twin needs more picks',
  'not told': '',
}

function cap(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1)
}

function Bar(props: {
  id: string
  name: string
  share: number
  lead?: boolean
  open: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <li className={`bar ${props.lead ? 'leading' : ''}`}>
      <button className="bar-head" aria-expanded={props.open} aria-controls={`bar-${props.id}`} onClick={props.onToggle}>
        <span className="bar-name">{props.name}</span>
        <span className="bar-n">{Math.round(props.share * 100)}</span>
        <span className="meter" aria-hidden="true"><span style={{ width: `${props.share * 100}%` }} /></span>
      </button>
      <div id={`bar-${props.id}`} className="bar-more" hidden={!props.open}>{props.children}</div>
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

export function MirrorView({ view, onSkill, open }: { view: 'type' | 'mind' | 'brain'; onSkill: (id: string) => void; open?: string }) {
  const [mirror, setMirror] = useState<Mirror | null>(null)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [openRow, setOpenRow] = useState<string | null>(open ?? null)
  const [part, setPart] = useState<'guess' | 'letters' | 'styles' | 'stars'>('guess')

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

  if (error) return <p className="error" role="alert">{error}</p>
  if (!mirror) return <p className="muted" aria-live="polite">Loading.</p>

  const told = mirror.told
  const anyTold = Object.values(told).some((v) => v !== null)

  if (view === 'mind') {
    return (
      <div className="mirror">
        {mirror.paths.length > 0 && (
          <ul className="paths">
            {mirror.paths.map((p) => (
              <li key={p.kind}>
                <span className="line-top">{p.kind === 'specialise' ? 'Your strong side' : 'Your side to grow'}</span>
                <span className="path-style">{p.style}</span>
                <span className="path-skills">
                  {p.skills.map((k) => (
                    <button key={k.id} className="chip" onClick={() => onSkill(k.id)}>{k.name}</button>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        )}
        <ul className="bars">
          {mirror.styles.map((s) => (
            <Bar key={s.key} id={s.key} name={s.name} share={s.share} lead={mirror.top_styles.includes(s.key)}
              open={openRow === s.key} onToggle={() => setOpenRow(openRow === s.key ? null : s.key)}>
              <p>{s.about}</p>
              <p><span className="line-top">At your best</span> {s.strength}</p>
              <p><span className="line-top">Be careful of</span> {s.watch}</p>
              <p className="muted">
                You picked this {s.picks} of the {s.chances} times you could{s.told !== null ? `. You told your twin: ${BANDS[s.told - 1].toLowerCase()}` : ''}.
              </p>
              <SkillLinks skills={s.skills} onSkill={onSkill} />
            </Bar>
          ))}
        </ul>
        <More>Tap a line to open it. The number is the percent of times you picked that style. A simple computer program counts it.</More>
      </div>
    )
  }

  if (view === 'brain') {
    return (
      <div className="mirror">
        <ul className="bars">
          {mirror.faculties.map((f) => (
            <Bar key={f.key} id={f.key} name={f.name} share={f.share}
              open={openRow === f.key} onToggle={() => setOpenRow(openRow === f.key ? null : f.key)}>
              <p>{f.about}</p>
              <p><span className="line-top">Did you know</span> {f.fact}</p>
              <p className="muted">You picked this {f.picks} of the {f.chances} times you could. Textbooks loosely link it to: {f.region}.</p>
              {f.feeds.length > 0 && (
                <p><span className="line-top">What feeds it</span> {f.feeds.join(' · ')}</p>
              )}
              <SkillLinks skills={f.skills} onSkill={onSkill} />
            </Bar>
          ))}
        </ul>
        <More>Tap a line to open it. The brain areas are loose textbook links. Nothing here measures a brain.</More>
      </div>
    )
  }

  return (
    <div className="mirror">
      <p className="mirror-type" aria-label={`Our guess for your type: ${mirror.axes.map((a) => a.suggested ?? 'not clear yet').join(', ')}`}>
        {mirror.suggested_type.split('').map((ch, i) => (
          <span key={i} className={ch === '.' ? 'open' : ''} aria-hidden="true">{ch === '.' ? '?' : ch}</span>
        ))}
      </p>
      <p className="mirror-sub">Our guess, from {mirror.picks_used} picks</p>

      <Tabs label="Our guess, and what you told your twin" value={part} onChange={setPart}
        tabs={[{ id: 'guess', label: 'Our guess' }, { id: 'letters', label: 'My letters' }, { id: 'styles', label: 'My styles' }, { id: 'stars', label: 'Stars' }]} />

      {part === 'guess' && (
        <ul className="axes">
          {mirror.axes.map((a) => {
            const total = a.first_picks + a.second_picks
            return (
              <li key={a.name}>
                <span className="axis-row">
                  <span className={`axis-letter ${a.suggested === a.first ? 'on' : ''}`}>{a.first}<sub>{a.first_picks}</sub></span>
                  <span className="meter split" aria-hidden="true">
                    <span style={{ width: total ? `${(a.first_picks / total) * 100}%` : '50%' }} />
                  </span>
                  <span className={`axis-letter ${a.suggested === a.second ? 'on' : ''}`}><sub>{a.second_picks}</sub>{a.second}</span>
                </span>
                <span className="muted">
                  {a.name}{VERDICT[a.verdict] ? ` · ${VERDICT[a.verdict]}${a.told ? ` (${a.told})` : ''}` : ''}
                </span>
              </li>
            )
          })}
        </ul>
      )}

      {part !== 'guess' && (
        <div className="tell-panel">
          {part === 'letters' && mirror.axes.map((a, i) => {
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

          {part === 'styles' && mirror.styles.map((s) => (
            <div className="chips" role="group" aria-label={`${s.name}: your own rating`} key={s.key}>
              <span className="chips-label">{s.name}</span>
              {BANDS.map((band, i) => (
                <button key={band} className="chip" aria-pressed={told[s.key] === i + 1}
                  onClick={() => save({ [s.key]: told[s.key] === i + 1 ? null : i + 1 } as Partial<Told>)}>
                  {band}
                </button>
              ))}
            </div>
          ))}

          {part === 'stars' && (
            <>
              <div className="chips" role="group" aria-label="Your star sign">
                <span className="chips-label">Star sign</span>
                {SIGNS.map((sign) => (
                  <button key={sign} className="chip" aria-pressed={told.sign === sign}
                    onClick={() => save({ sign: told.sign === sign ? null : sign })}>
                    {cap(sign)}
                  </button>
                ))}
              </div>
              <div className="chips" role="group" aria-label="Your year animal">
                <span className="chips-label">Year animal</span>
                {ANIMALS.map((animal) => (
                  <button key={animal} className="chip" aria-pressed={told.animal === animal}
                    onClick={() => save({ animal: told.animal === animal ? null : animal })}>
                    {cap(animal)}
                  </button>
                ))}
              </div>
            </>
          )}

          <div className="tell-foot">
            <button className="link" disabled={!anyTold} onClick={clear}>Clear what I told my twin</button>
            <span className="muted" role="status" aria-live="polite">{status}</span>
            <More label="About telling your twin">
              You do not have to do this. Tap only what you want the game to store. The game never sends it to the AI
              model, and you can clear it. Star sign and year animal are here for one test: do they guess your picks
              better than your twin does?
            </More>
          </div>
        </div>
      )}
      <More>These cards are our own. A simple computer program reads your picks. This is not the official test of any publisher.</More>
    </div>
  )
}

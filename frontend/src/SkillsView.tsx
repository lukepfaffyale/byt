import { useEffect, useState } from 'react'
import { api, type SkillTree } from './api'
import { More } from './More'
import { usePager } from './pager'
import { Pop, Tools } from './Rows'
import { Failed } from './Retry'

const STATE_LABEL = { done: 'Done', open: 'Open', locked: 'Locked', soon: 'Coming later' } as const
const SIZE = 4  // skills shown at a time, so the list and its arrows share one page

/** My skills, a few at a time. A tap on a skill opens its steps in a pop-out, so the list keeps its place. */
export function SkillsView({ focus, onPlay, slot }: { focus: string | null; onPlay: (gateId: string) => void; slot?: HTMLElement | null }) {
  const [trees, setTrees] = useState<SkillTree[] | null>(null)
  const [error, setError] = useState('')
  const [open, setOpen] = useState<string | null>(focus)
  const { rows: page, pager } = usePager(trees ?? [], SIZE, 'trees')

  useEffect(() => {
    let cancelled = false
    api
      .skills()
      .then((out) => {
        if (!cancelled) setTrees(out.trees)
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'There was a problem. Please try again.')
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (error) return <Failed error={error} />
  if (!trees) return <p className="muted" aria-live="polite">Loading.</p>
  const shown = trees.find((t) => t.id === open)
  const tools = (
    <>
      {pager}
      <More>
        Tap a skill to see its steps. Each step you finish can earn a certificate. A computer program checks it. Steps marked "Coming later" open when a creator in the game builds them. Passing a step pays your Sym from the growth fund.
      </More>
    </>
  )

  return (
    <div className="mine-skills">
      <ul className="trees">
        {page.map((t) => (
          <li key={t.id}>
            <button className="tree-head" aria-haspopup="dialog" onClick={() => setOpen(t.id)}>
              <span className="bar-name">{t.name}</span>
              <span className="tree-dots" aria-hidden="true">
                {t.steps.map((s, i) => <span key={i} className={`dot ${s.state}`} />)}
              </span>
              <span className="sr-only">{t.done} of {t.steps.length} steps done</span>
            </button>
          </li>
        ))}
      </ul>
      {slot === undefined ? tools : <Tools slot={slot}>{tools}</Tools>}
      {shown && (
        <Pop label={shown.name} onClose={() => setOpen(null)}>
          <p className="line-top">Skill · {shown.done} of {shown.steps.length} steps done</p>
          <p className="mine-pop-title">{shown.name}</p>
          <p>{shown.about}</p>
          <ol className="steps">
            {shown.steps.map((s) => (
              <li key={s.name} className={s.state}>
                <span className={`dot ${s.state}`} aria-hidden="true" />
                <span className="step-name">{s.name}{s.made && <span className="muted"> · built by a creator</span>}</span>
                {s.state === 'open' && s.gate_id ? (
                  <button className="secondary gate-go" onClick={() => onPlay(s.gate_id as string)}>Play</button>
                ) : (
                  <span className="gate-state">{STATE_LABEL[s.state]}</span>
                )}
              </li>
            ))}
          </ol>
          <p className="muted">
            {shown.certs > 0 ? `You earned ${shown.certs} ${shown.certs === 1 ? 'certificate' : 'certificates'}. ` : ''}
            This skill helps: {shown.grows.join(', ')}.
          </p>
        </Pop>
      )}
    </div>
  )
}

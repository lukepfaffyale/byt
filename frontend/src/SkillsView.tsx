import { useEffect, useState } from 'react'
import { api, type SkillTree } from './api'
import { More } from './More'
import { Failed } from './Retry'

const STATE_LABEL = { done: 'Done', open: 'Open', locked: 'Locked', soon: 'Coming later' } as const

export function SkillsView({ focus, onPlay }: { focus: string | null; onPlay: (gateId: string) => void }) {
  const [trees, setTrees] = useState<SkillTree[] | null>(null)
  const [error, setError] = useState('')
  const [open, setOpen] = useState<string | null>(focus)

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

  return (
    <div>
      <ul className="trees">
        {trees.map((t) => (
          <li key={t.id}>
            <button className="tree-head" aria-expanded={open === t.id} aria-controls={`tree-${t.id}`}
              onClick={() => setOpen(open === t.id ? null : t.id)}>
              <span className="bar-name">{t.name}</span>
              <span className="tree-dots" aria-hidden="true">
                {t.steps.map((s, i) => <span key={i} className={`dot ${s.state}`} />)}
              </span>
              <span className="sr-only">{t.done} of {t.steps.length} steps done</span>
            </button>
            <div id={`tree-${t.id}`} className="bar-more" hidden={open !== t.id}>
              <p>{t.about}</p>
              <ol className="steps">
                {t.steps.map((s) => (
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
                {t.certs > 0 ? `You earned ${t.certs} ${t.certs === 1 ? 'certificate' : 'certificates'}. ` : ''}
                This skill helps: {t.grows.join(', ')}.
              </p>
            </div>
          </li>
        ))}
      </ul>
      <More>
        Each step you finish can earn a certificate. A computer program checks it. Steps marked "Coming later" open when a creator in the game builds them. Passing a step pays your Sym from the growth fund.
      </More>
    </div>
  )
}

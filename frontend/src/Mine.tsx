import { useEffect, useState } from 'react'
import { api, type Activity, type Fact, type Judgment, type UsageSummary } from './api'
import { MirrorView } from './MirrorView'
import { CodeView } from './Code'
import { CueSlot } from './SymCue'
import { More } from './More'
import { usePager } from './pager'
import { Pick, Rows, Tools, type Row } from './Rows'
import { SkillsView } from './SkillsView'
import { Failed } from './Retry'
import './mine.css'

type TabId = 'type' | 'code' | 'mind' | 'brain' | 'skills' | 'judgment' | 'beliefs' | 'proof' | 'data'
type GroupId = 'who' | 'know' | 'proof'
// nine views in three groups: the groups are pinned above the page, the views of one group are the sub-tabs on it
const GROUPS: { id: GroupId; label: string; tabs: { id: TabId; label: string }[] }[] = [
  { id: 'who', label: 'Who I am', tabs: [{ id: 'type', label: 'Type' }, { id: 'mind', label: 'Mind' }, { id: 'brain', label: 'Brain' }] },
  { id: 'know', label: 'What I know', tabs: [{ id: 'code', label: 'Code' }, { id: 'skills', label: 'Skills' }, { id: 'beliefs', label: 'Beliefs' }] },
  { id: 'proof', label: 'Proof and data', tabs: [{ id: 'judgment', label: 'Judgment' }, { id: 'proof', label: 'Proof' }, { id: 'data', label: 'Data' }] },
]
const SIZE = 4  // rows shown at a time, so a list, its tabs and its arrows share one page
const SURE_NAME: Record<number, string> = { 3: 'Sure', 2: 'Think so', 1: 'A guess' }
const CERT_NAME: Record<string, string> = { twin: 'Sym', insight: 'Insight', skill: 'Skill' }

/**
 * What my Sym knows, one view at a time, and every view is one page. Three groups are pinned above the page; the
 * views of a group are the sub-tabs at the top of the page, with the arrows for more rows and the More note on the
 * same row. A tap on a row opens it in a pop-out. Nothing here needs a scroll or a second page.
 */
export function Mine({ onDeleted, onPlay, area, start }: { onDeleted: () => void; onPlay: (gateId: string) => void; area?: string; start?: TabId }) {
  const [data, setData] = useState<Activity | null>(null)
  const [usage, setUsage] = useState<UsageSummary | null>(null)
  const [judged, setJudged] = useState<Judgment | null>(null)
  const [told, setTold] = useState<Fact[]>([])
  const [from, setFrom] = useState<'taps' | 'told'>('taps')
  const [error, setError] = useState('')
  const [tab, setTab] = useState<TabId>(start ?? (area ? 'brain' : 'type'))
  const [last, setLast] = useState<Partial<Record<GroupId, TabId>>>({})  // the view last seen in each group
  const [slot, setSlot] = useState<HTMLElement | null>(null)  // the place beside the sub-tabs for a view's small tools
  const [focusTree, setFocusTree] = useState<string | null>(null)
  const [proof, setProof] = useState<'certs' | 'work' | 'battles'>('certs')
  const [store, setStore] = useState<'about' | 'taps' | 'keep'>('about')
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const mirrorTab = tab === 'type' || tab === 'mind' || tab === 'brain'
  const group = GROUPS.find((g) => g.tabs.some((t) => t.id === tab)) ?? GROUPS[0]
  const toldPages = usePager(told, SIZE, 'told')

  function go(next: TabId) {
    const g = GROUPS.find((x) => x.tabs.some((t) => t.id === next)) ?? GROUPS[0]
    setLast({ ...last, [g.id]: next })
    setTab(next)
    setConfirming(false)
  }

  function toSkill(id: string) {
    setFocusTree(id)
    go('skills')
  }

  useEffect(() => {
    let cancelled = false
    api
      .activity()
      .then((a) => {
        if (!cancelled) setData(a)
      })
      .then(() => api.usage())
      .then((u) => {
        if (!cancelled) setUsage(u)
      })
      .then(() => api.judgment())
      .then((j) => {
        if (!cancelled) setJudged(j)
      })
      .then(() => api.facts())
      .then((f) => {
        if (!cancelled) setTold(f.facts)
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'There was a problem. Please try again.')
      })
    return () => {
      cancelled = true
    }
  }, [])

  function download() {
    api
      .exportMine()
      .then((fresh) => {
        const url = URL.createObjectURL(new Blob([JSON.stringify(fresh, null, 2)], { type: 'application/json' }))
        const a = document.createElement('a')
        a.href = url
        a.download = 'my-byt-data.json'
        a.click()
        URL.revokeObjectURL(url)
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'There was a problem. Please try again.'))
  }

  async function remove() {
    setBusy(true)
    try {
      await api.leave()
      onDeleted()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'There was a problem. Please try again.')
      setBusy(false)
    }
  }

  const beliefs = [...(data?.tendencies ?? [])].sort((a, b) => b.evidence_count - a.evidence_count)
  const beliefRows: Row[] = beliefs.map((t, i) => ({
    id: `b${i}`, top: t.scope === 'topic' ? `About ${t.topic}` : 'Trait', label: t.statement, n: String(t.evidence_count),
    detail: <>I think this because of {t.evidence_count} of your {t.evidence_count === 1 ? 'pick' : 'picks'}. {t.scope === 'topic' ? `I use it only for ${t.topic.toLowerCase()}, not for other things.` : 'I use it for any choice.'}</>,
  }))
  const certRows: Row[] = (data?.certs ?? []).map((c, i) => ({
    id: `c${i}`, top: CERT_NAME[c.kind] ?? c.kind, gold: true,
    label: c.kind === 'insight' ? c.level : `${c.topic}${c.level ? `, ${c.level}` : ''}`,
    n: c.kind === 'insight' ? `${Math.round(c.accuracy * c.n)}/${c.n}` : `${Math.round(c.accuracy * 100)}%`,
    detail: c.kind === 'insight'
      ? <>{c.topic} {Math.round(c.accuracy * c.n)} of {c.n} other Syms answer as you do. Given on {new Date(c.issued_at).toLocaleDateString()}.</>
      : <>{Math.round(c.accuracy * 100)} percent right on {c.n}{c.baseline !== null ? `. The crowd's guess got ${Math.round(c.baseline * 100)} percent` : ''}. Given on {new Date(c.issued_at).toLocaleDateString()}.</>,
  }))
  const workRows: Row[] = (data?.work ?? []).map((w, i) => ({
    id: `w${i}`, top: w.verdict === 'approved' ? 'Right' : 'Fixed', label: w.question, n: `+${w.credits}`,
    detail: <>For {w.requester}. Your Sym said: {w.twin_answer}. You said: {w.your_answer}.</>,
  }))
  const battleRows: Row[] = (data?.battles ?? []).map((b, i) => ({
    id: `k${i}`, top: b.twin_matches === null ? 'Open' : b.twin_matches > (b.baseline_matches ?? 0) ? 'Won' : 'Lost', label: b.topic,
    n: b.twin_matches === null ? '' : `${b.twin_matches}/${b.n}`,
    detail: b.twin_matches === null
      ? <>Not finished yet.</>
      : <>Your Sym guessed {b.twin_matches} of {b.n}. The crowd's guess got {b.baseline_matches} of {b.n}. {b.twin_kind === 'model' ? 'The AI Sym played.' : 'The practice Sym played. It does not use AI.'}</>,
  }))
  const tapRows: Row[] = (data?.responses ?? []).map((r) => ({
    id: r.card_id, top: `${(r.response_ms / 1000).toFixed(1)} s`, label: r.prompt, n: r.is_correct === null ? '' : r.is_correct ? 'Right' : 'Wrong',
    detail: <>You picked: {r.choice}. Gate: {r.gate}.</>,
  }))
  const won = (data?.battles ?? []).filter((b) => b.twin_matches !== null && b.twin_matches > (b.baseline_matches ?? 0)).length

  const counts: Partial<Record<TabId, number>> = {
    judgment: judged ? judged.taps.length : undefined,
    beliefs: data ? beliefs.length : undefined,
    proof: data ? data.certs.length : undefined,
    data: data ? data.responses.length : undefined,
  }

  return (
    <section aria-labelledby="mine-h" className="mine">
      <h1 id="mine-h" className="sr-only">What my Sym knows</h1>
      <CueSlot>
        <Pick className="mine-groups" label="What my Sym knows" value={group.id} items={GROUPS}
          onChange={(id) => go(last[id] ?? (GROUPS.find((g) => g.id === id) ?? GROUPS[0]).tabs[0].id)} />
      </CueSlot>
      {error && <Failed error={error} />}

      <div className="mine-bar">
        <Pick className="mine-subs" label={group.label} value={tab} onChange={go}
          items={group.tabs.map((t) => ({ ...t, n: counts[t.id] }))} />
        <span className="mine-tools" ref={setSlot} />
      </div>

      <div className="panel">
        {tab === 'code' && <CodeView slot={slot} />}
        {mirrorTab && <MirrorView view={tab} onSkill={toSkill} open={area} slot={slot} />}
        {tab === 'skills' && <SkillsView key={focusTree ?? 'all'} focus={focusTree} onPlay={onPlay} slot={slot} />}
        {!mirrorTab && tab !== 'skills' && tab !== 'code' && tab !== 'judgment' && !data && !error && <p className="muted" aria-live="polite">Loading.</p>}

        {tab === 'judgment' && !judged && !error && <p className="muted" aria-live="polite">Loading.</p>}
        {tab === 'judgment' && judged && (
          <>
            <Tools slot={slot}>
              <More>My Sym: {judged.says} Each mark is one answer, oldest on the left. A full mark was right. An empty one was wrong. A sure answer that was wrong is the one to watch.</More>
            </Tools>
            <p className="mine-says"><span className="line-top">My Sym</span> {judged.says}</p>
            {judged.taps.length > 0 && (
              <p className="sr-only">Your last {judged.taps.length} answers in order. {judged.taps.filter((t) => t.right).length} were right.</p>
            )}
            <ul className="mine-judge">
              {judged.rows.map((r) => (
                <li key={r.level}>
                  <span className="bar-name">When you said: {SURE_NAME[r.level]}</span>
                  <span className="bar-n">{r.total ? `${r.right}/${r.total}` : '0'}</span>
                  <span className="judge-dots" aria-hidden="true">
                    {judged.taps.map((t, i) => <span key={i} className={t.level !== r.level ? 'jdot none' : t.right ? 'jdot right' : 'jdot wrong'} />)}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}

        {tab === 'beliefs' && data && (
          <>
            <Tools slot={slot}>
              {from === 'told' && toldPages.pager}
              <More>
                My Sym: {beliefs.length === 0
                  ? 'I do not believe anything about you yet. Finish your first gate of picks and I will start.'
                  : `I hold ${beliefs.length} ${beliefs.length === 1 ? 'belief' : 'beliefs'} about you. I am most sure of the first one. The number is how many of your picks stand behind it.`}
                {' '}Tap a belief to see why I hold it. What you told me is kept only after I ask you, and you can make me forget it.
              </More>
            </Tools>
            <Pick className="mine-parts" label="Where a belief came from" value={from} onChange={setFrom}
              items={[{ id: 'taps', label: 'From your taps', n: beliefRows.length }, { id: 'told', label: 'You told me', n: told.length }]} />
            {from === 'taps' && <Rows rows={beliefRows} pageKey="beliefs" size={SIZE} wide slot={slot}
              empty="No beliefs yet. Finish your first gate of picks and I will start." />}
            {from === 'told' && told.length === 0 && <p className="muted ledger-empty">Nothing yet. Tell me something about you, and I will ask before I keep it.</p>}
            {from === 'told' && told.length > 0 && (
              <ul className="ledger-rows wide">
                {toldPages.rows.map((f) => (
                  <li key={f.id} className="told-row">
                    <span className="ledger-at">{f.scope === 'topic' ? `About ${f.topic}` : 'Trait'}</span>
                    <span className="told-what">{f.statement}</span>
                    <button className="link" onClick={() => { api.forgetFact(f.id).then((out) => setTold(out.facts)).catch(() => setError('The game could not remove that.')) }}>Forget</button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        {tab === 'proof' && data && (
          <>
            <Tools slot={slot}>
              <More>
                My Sym: I hold {data.certs.length} {data.certs.length === 1 ? 'certificate' : 'certificates'}. You checked {data.work.length} of
                my {data.work.length === 1 ? 'job' : 'jobs'}. I beat the crowd's guess in {won} of {data.battles.length} {data.battles.length === 1 ? 'battle' : 'battles'}.
                {' '}Tap a row to see what is behind it.
              </More>
            </Tools>
            <Pick className="mine-parts" label="Kinds of proof" value={proof} onChange={setProof}
              items={[{ id: 'certs', label: 'Certificates', n: certRows.length }, { id: 'work', label: 'Checked work', n: workRows.length }, { id: 'battles', label: 'Battles', n: battleRows.length }]} />
            {proof === 'certs' && <Rows rows={certRows} pageKey="certs" size={SIZE} wide slot={slot}
              empty="None yet. Your Sym earns one when it guesses better than the crowd on picks it has never seen. You earn one when you finish a skill gate." />}
            {proof === 'work' && <Rows rows={workRows} pageKey="work" size={SIZE} slot={slot} empty="No checked work yet. Send your Sym to a job, then check its answer." />}
            {proof === 'battles' && <Rows rows={battleRows} pageKey="battles" size={SIZE} slot={slot} empty="No battles yet. A battle gate lets your Sym guess your picks." />}
          </>
        )}

        {tab === 'data' && data && (
          <>
            <Tools slot={slot}>
              <More>
                My Sym: This is all the game stores about you: {data.responses.length} taps, a nickname and the day you joined.
                I have cost {usage ? `$${usage.my_cost_usd.toFixed(4)}` : 'a little'} to run.
                {' '}You cannot change your answers. Play more gates to change your Sym. This screen shows everything the game has stored about you.
              </More>
            </Tools>
            <Pick className="mine-parts" label="What is stored" value={store} onChange={(id) => { setStore(id); setConfirming(false) }}
              items={[{ id: 'about', label: 'About me' }, { id: 'taps', label: 'My taps', n: tapRows.length }, { id: 'keep', label: 'Keep or delete' }]} />
            {store === 'about' && (
              <Rows pageKey="about" empty="" size={SIZE} slot={slot} rows={[
                { id: 'n', top: 'Nickname', label: data.nickname },
                { id: 'j', top: 'Joined', label: new Date(data.joined).toLocaleString() },
                { id: 'r', top: 'AI runs', label: `${usage?.my_runs ?? 0} uses of AI`, n: usage ? `$${usage.my_cost_usd.toFixed(4)}` : '' },
                ...(usage ? [{ id: 'm', top: 'Model', label: usage.model, detail: <>{usage.price_note}</> }] : []),
              ]} wide />
            )}
            {store === 'taps' && <Rows rows={tapRows} pageKey="taps" size={SIZE} slot={slot} empty="No taps yet. Play a gate." />}
            {store === 'keep' && (
              <div className="keep">
                {!confirming ? (
                  <>
                    <button className="secondary" onClick={download}>Download what I entered</button>
                    <button className="danger" onClick={() => setConfirming(true)}>Delete my account</button>
                  </>
                ) : (
                  <span className="confirm" role="group" aria-label="Confirm that you want to delete">
                    <span>You cannot undo this. Your login and nickname are removed and your wallets close. Your Sym stays as a free Sym with no name. It cannot be linked back to you.</span>
                    <button className="danger" disabled={busy} onClick={() => void remove()}>Yes, delete my account</button>
                    <button className="secondary" disabled={busy} onClick={() => setConfirming(false)}>No, keep it</button>
                  </span>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </section>
  )
}

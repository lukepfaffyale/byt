import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { api, type AskOut } from './api'
import './play.css'

type Recognizer = {
  lang: string
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null
  onend: (() => void) | null
  onerror: (() => void) | null
  start: () => void
}
type SpeechWindow = { SpeechRecognition?: new () => Recognizer; webkitSpeechRecognition?: new () => Recognizer }

const QUICK: Record<string, string[]> = {
  journey: ['What next?', 'How do I earn more?', 'Where can I grow?'],
  money: ['Why did it change?', 'How do I earn more?', 'What do you cost?'],
  work: ['Which job first?', 'Work by yourself?', 'How do I earn more?'],
  mine: ['What do you know?', 'Where can I grow?', 'Ask me one.'],
}
const VOICE_KEY = 'byt_voice'

function readVoice(): boolean {
  try {
    return localStorage.getItem(VOICE_KEY) === 'on'
  } catch {
    return false
  }
}

/**
 * Talk to the twin: say or tap one line, and the twin answers in a sentence, offers one move, and may ask one card
 * back so it keeps learning. The line is not saved. Speaking and reading aloud use the browser, and both are off
 * until the person turns them on.
 *
 * The row on the page is one line: a place to type and one "Ideas" tap. Everything the Sym says back opens in a
 * pop-out over the page, with the question above the answer, so a reply never adds a page to the screen under it.
 */
export function TwinTalk(props: { where?: string; onMove: (id: string) => void; onLearned: () => void; announce: (text: string) => void }) {
  const { where = 'journey', onMove, onLearned, announce } = props
  const [text, setText] = useState('')
  const [open, setOpen] = useState(false)
  const [asked, setAsked] = useState('')
  const [reply, setReply] = useState<AskOut | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [voice, setVoice] = useState(readVoice)
  const [hearing, setHearing] = useState(false)
  const [kept, setKept] = useState('')
  const shownAt = useRef(0)
  const speech = window as unknown as SpeechWindow
  const Listen = speech.SpeechRecognition ?? speech.webkitSpeechRecognition

  function say(line: string, aloud: boolean) {
    announce(line)
    if (aloud && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel()
      window.speechSynthesis.speak(new SpeechSynthesisUtterance(line))
    }
  }

  function ask(line: string, shown?: string) {
    const clean = line.trim().slice(0, 200)
    if (!clean || busy) return
    setBusy(true)
    setError('')
    setReply(null)
    setKept('')
    setAsked(shown ?? clean)
    setOpen(true)
    api
      .ask(clean)
      .then((out) => {
        // an empty answer is still an answer the person must see
        const heard = out.say.trim() ? out : { ...out, say: 'I have no answer for that yet. Try asking it in other words.' }
        setReply(heard)
        setText('')
        shownAt.current = performance.now()
        say(heard.say, voice)
      })
      .catch((e: unknown) => {
        const why = e instanceof Error ? e.message : 'There was a problem. Please try again.'
        setError(`I could not answer. ${why}`)
        announce(`My Sym could not answer. ${why}`)
      })
      .finally(() => setBusy(false))
  }

  function listen() {
    if (!Listen || hearing) return
    const ear = new Listen()
    ear.lang = 'en-US'
    ear.onresult = (e) => ask(e.results[0][0].transcript)
    ear.onend = () => setHearing(false)
    ear.onerror = () => setHearing(false)
    setHearing(true)
    ear.start()
  }

  function teach(choice: string) {
    if (!reply?.learn || busy) return
    setBusy(true)
    api
      .respond(reply.learn.id, choice, Math.max(0, Math.round(performance.now() - shownAt.current)))
      .then(() => {
        const thanks = 'Thank you. I know you a little better now.'
        setReply({ ...reply, say: thanks, learn: null })
        say(thanks, voice)
        onLearned()
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'The game could not save that pick.'))
      .finally(() => setBusy(false))
  }

  function toggleVoice() {
    const next = !voice
    setVoice(next)
    if (!next && 'speechSynthesis' in window) window.speechSynthesis.cancel()
    try {
      localStorage.setItem(VOICE_KEY, next ? 'on' : 'off')
    } catch {
      // the choice still holds until the page is closed
    }
  }

  function close() {
    setOpen(false)
    setAsked('')
    setReply(null)
    setError('')
    setKept('')
    if ('speechSynthesis' in window) window.speechSynthesis.cancel()
  }

  const quick = QUICK[where] ?? QUICK.journey
  const fresh = !asked // opened by the Ideas tap: nothing has been asked yet

  return (
    <section className="talk" aria-label="Talk to my Sym">
      <form onSubmit={(e) => { e.preventDefault(); ask(text) }}>
        <label htmlFor="talk-in" className="sr-only">Ask my Sym something</label>
        <input id="talk-in" value={text} onChange={(e) => setText(e.target.value)} maxLength={200} autoComplete="off" placeholder="Ask my Sym" />
        {Listen && <button type="button" className="link" aria-pressed={hearing} onClick={listen}>{hearing ? 'Listening' : 'Speak'}</button>}
        <button className="link" disabled={busy || !text.trim()}>Send</button>
      </form>
      <div className="talk-bar">
        <button type="button" className="chip talk-ideas" aria-haspopup="dialog" onClick={() => setOpen(true)}>Ideas</button>
      </div>
      {open && createPortal(
        <div className="pick-pop" role="dialog" aria-modal="true" aria-label="My Sym answers"
          onKeyDown={(e) => { if (e.key === 'Escape') close() }} onClick={(e) => { if (e.target === e.currentTarget) close() }}>
          <div className="pick-pop-box talk-pop">
            {fresh && (
              <div className="talk-learn">
                <span className="line-top">Things to ask my Sym</span>
                <div className="chips" role="group" aria-label="Things to ask my Sym">
                  {quick.map((q) => <button key={q} className="chip" onClick={() => ask(q)}>{q}</button>)}
                </div>
              </div>
            )}
            {!fresh && (
              <p className="talk-asked"><span className="line-top">You asked</span> {asked}</p>
            )}
            {!fresh && (
              <div className="talk-reply" aria-live="polite">
                <span className="line-top">My Sym{reply?.twin_kind === 'offline' ? ' · practice Sym, no AI' : `${reply?.voice ? ` · ${reply.voice}` : ''}${reply?.cost_usd ? ` · cost $${reply.cost_usd.toFixed(4)}` : ''}`}</span>
                {busy && !reply && <p className="talk-say muted">I am thinking.</p>}
                {error && <p className="talk-say" role="alert">{error}</p>}
                {reply && <p className="talk-say">{reply.say}</p>}
                {reply?.move && <button className="primary" onClick={() => { const id = reply.move?.id ?? ''; close(); onMove(id) }}>{reply.move.label}</button>}
                {reply?.offer && !kept && (
                  <div className="talk-learn">
                    <span className="line-top">May I keep this about you?</span>
                    <p>{reply.offer.statement}</p>
                    <div className="chips" role="group" aria-label="Keep this fact or not">
                      <button className="chip" disabled={busy} onClick={() => {
                        setBusy(true)
                        api.keepFact()
                          .then(() => { setKept('Kept. You can make me forget it on the My Sym screen.'); onLearned() })
                          .catch((e: unknown) => setError(e instanceof Error ? e.message : 'The game could not keep that.'))
                          .finally(() => setBusy(false))
                      }}>Yes, keep it</button>
                      <button className="chip" disabled={busy} onClick={() => setKept('I did not keep it.')}>No</button>
                    </div>
                  </div>
                )}
                {kept && <p className="muted" role="status">{kept}</p>}
                {reply?.learn && (
                  <div className="talk-learn">
                    <span className="line-top">Teach me. Which is more you?</span>
                    <p>{reply.learn.prompt}</p>
                    <div className="chips" role="group" aria-label="Pick one">
                      {reply.learn.options.map((o) => <button key={o.id} className="chip" disabled={busy} onClick={() => teach(o.id)}>{o.label}</button>)}
                    </div>
                  </div>
                )}
              </div>
            )}
            <p className="fine talk-note">
              Your words go to an AI model once, so your Sym can answer. They are not saved. Do not say your name or
              anything private. Your Sym learns from your taps, not from your words. If you tap Speak, your browser
              turns your voice into words, and the browser's maker may receive the sound. We never do.
            </p>
            <div className="pick-pop-foot">
              <span className="talk-foot">
                {reply && !reply.learn && <button className="link" disabled={busy} onClick={() => ask('Ask me a question, so you can learn about me.', 'Teach my Sym more')}>Teach my Sym more</button>}
                {'speechSynthesis' in window && <button className="link" aria-pressed={voice} onClick={toggleVoice}>Read aloud: {voice ? 'on' : 'off'}</button>}
              </span>
              <button className="primary" autoFocus onClick={close}>Close</button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </section>
  )
}

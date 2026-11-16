import { useRef, useState } from 'react'
import { api, type AskOut } from './api'
import { More } from './More'

type Recognizer = {
  lang: string
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null
  onend: (() => void) | null
  onerror: (() => void) | null
  start: () => void
}
type SpeechWindow = { SpeechRecognition?: new () => Recognizer; webkitSpeechRecognition?: new () => Recognizer }

const QUICK: Record<string, string[]> = {
  journey: ['What next?', 'How do I earn more?', 'Where am I weak?'],
  money: ['Why did it change?', 'How do I earn more?', 'What do you cost?'],
  work: ['Which job first?', 'Work by yourself?', 'How do I earn more?'],
  mine: ['What do you know?', 'Where am I weak?', 'Ask me one.'],
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
 */
export function TwinTalk(props: { where?: string; onMove: (id: string) => void; onLearned: () => void; announce: (text: string) => void }) {
  const { where = 'journey', onMove, onLearned, announce } = props
  const [text, setText] = useState('')
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

  function ask(line: string) {
    const clean = line.trim().slice(0, 200)
    if (!clean || busy) return
    setBusy(true)
    setError('')
    api
      .ask(clean)
      .then((out) => {
        setReply(out)
        setKept('')
        setText('')
        shownAt.current = performance.now()
        say(out.say, voice)
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'There was a problem. Please try again.'))
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

  return (
    <section className="talk" aria-label="Talk to my twin">
      <form onSubmit={(e) => { e.preventDefault(); ask(text) }}>
        <label htmlFor="talk-in" className="sr-only">Say something to my twin</label>
        <input id="talk-in" value={text} onChange={(e) => setText(e.target.value)} maxLength={200} autoComplete="off" placeholder="Say something to my twin" />
        {Listen && <button type="button" className="link" aria-pressed={hearing} onClick={listen}>{hearing ? 'Listening' : 'Speak'}</button>}
        <button className="link" disabled={busy || !text.trim()}>Send</button>
      </form>
      <div className="talk-bar">
        {!reply && !busy && (
          <div className="chips" role="group" aria-label="Things to ask my twin">
            {(QUICK[where] ?? QUICK.journey).map((q) => <button key={q} className="chip" onClick={() => ask(q)}>{q}</button>)}
          </div>
        )}
        <More label="How my words are used">
          Your words go to an AI model once, so your twin can answer. They are not saved. If your twin asks to
          keep something, it shows you one short sentence in its own words, and it is stored only if you tap yes.
          Do not say your name or anything private. Your twin learns from your taps, not from your words. If you tap Speak, your browser turns
          your voice into words, and the browser's maker may receive the sound. We never do.
        </More>
      </div>
      {busy && <p className="muted" aria-live="polite">My twin is thinking.</p>}
      {error && <p className="error" role="alert">{error}</p>}
      {reply && (
        <div className="talk-reply">
          <span className="line-top">My twin{reply.twin_kind === 'offline' ? ' · practice twin, no AI' : ''}</span>
          <p className="talk-say">{reply.say}</p>
          {reply.move && <button className="primary" onClick={() => onMove(reply.move?.id ?? '')}>{reply.move.label}</button>}
          {reply.offer && !kept && (
            <div className="talk-learn">
              <span className="line-top">May I keep this about you?</span>
              <p>{reply.offer.statement}</p>
              <div className="chips" role="group" aria-label="Keep this fact or not">
                <button className="chip" disabled={busy} onClick={() => {
                  setBusy(true)
                  api.keepFact()
                    .then(() => { setKept('Kept. You can make me forget it on the My Twin screen.'); onLearned() })
                    .catch((e: unknown) => setError(e instanceof Error ? e.message : 'The game could not keep that.'))
                    .finally(() => setBusy(false))
                }}>Yes, keep it</button>
                <button className="chip" disabled={busy} onClick={() => setKept('I did not keep it.')}>No</button>
              </div>
            </div>
          )}
          {kept && <p className="muted" role="status">{kept}</p>}
          {reply.learn && (
            <div className="talk-learn">
              <span className="line-top">Teach me. Which is more you?</span>
              <p>{reply.learn.prompt}</p>
              <div className="chips" role="group" aria-label="Pick one">
                {reply.learn.options.map((o) => <button key={o.id} className="chip" disabled={busy} onClick={() => teach(o.id)}>{o.label}</button>)}
              </div>
            </div>
          )}
          <span className="talk-foot">
            {!reply.learn && <button className="link" disabled={busy} onClick={() => ask('Ask me a question, so you can learn about me.')}>Teach my twin more</button>}
            {'speechSynthesis' in window && <button className="link" aria-pressed={voice} onClick={toggleVoice}>Read aloud: {voice ? 'on' : 'off'}</button>}
          </span>
        </div>
      )}
    </section>
  )
}

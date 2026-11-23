import { useState } from 'react'
import { api } from './api'
import { More } from './More'

export type Seat = 'player' | 'agency' | 'creator'

export function Start({ onStarted }: { onStarted: (seat: Seat) => void }) {
  const [nickname, setNickname] = useState('')
  const [agree, setAgree] = useState(false)
  const [adult, setAdult] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const ready = nickname.trim().length >= 2 && agree && adult && !busy

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!ready) return
    setBusy(true)
    setError('')
    try {
      await api.start(nickname.trim())
      onStarted('player')  // the welcome that follows offers the three seats
    } catch (err) {
      setError(err instanceof Error ? err.message : 'There was a problem. Please try again.')
      setBusy(false)
    }
  }

  return (
    <section aria-labelledby="start-h" className="start">
      <h1 id="start-h">Meet your Sym.</h1>
      <p className="lead"><strong>Firms earn from your data. Here, you do.</strong> A Sym is a digital you. You tap. It learns you. Then it works for you.</p>

      <form onSubmit={submit}>
        <div className="notice" id="notice">
          <p>
            We keep a nickname and your taps. You can delete it all. Play money only.
          </p>
          <More>
            This game stores a nickname, the days you play, and your taps: what you pick and how fast you tap. The game
            uses them to build a Sym of you. Your Sym's notes about you go to an AI model, without your nickname. You can
            see everything the game stores. You can delete your account at any time: your login and nickname are removed,
            and your Sym stays as a free Sym with no name. It cannot be linked back to you. If you clear the data of this
            browser, you lose your Sym. Credits are play money. The game is for adults.
          </More>
        </div>

        <label htmlFor="nick">Nickname</label>
        <input
          id="nick"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          minLength={2}
          maxLength={20}
          pattern="[A-Za-z0-9][A-Za-z0-9 _\-]*"
          autoComplete="off"
          placeholder="2 to 20 letters or numbers"
          aria-describedby="notice"
          required
        />

        <label className="check">
          <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
          <span>I have read what the game stores, and I agree.</span>
        </label>
        <label className="check">
          <input type="checkbox" checked={adult} onChange={(e) => setAdult(e.target.checked)} />
          <span>I am 18 years old or older.</span>
        </label>

        {error && <p className="error" role="alert">{error}</p>}
        <button className="primary big" type="submit" disabled={!ready}>
          {busy ? 'Starting' : 'Start the game'}
        </button>
      </form>
    </section>
  )
}

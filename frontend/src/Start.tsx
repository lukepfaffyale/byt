import { useState } from 'react'
import { api } from './api'
import { WorldView } from './World'

export type Seat = 'player' | 'agency' | 'creator'

export function Start({ onStarted }: { onStarted: (seat: Seat) => void }) {
  const [nickname, setNickname] = useState('')
  const [seat, setSeat] = useState<Seat>('player')
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
      onStarted(seat)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'There was a problem. Please try again.')
      setBusy(false)
    }
  }

  return (
    <section aria-labelledby="start-h" className="start">
      <p className="twin-says">I am not you yet. Teach me.</p>
      <h1 id="start-h">Meet your digital twin. It works while you rest.</h1>
      <p className="twin-says">Alone, monochrome. Together, technicolor.</p>
      <WorldView compact />
      <p className="lead">A gate is a short set of cards. You tap your picks, and your twin learns from them. Then your twin tries to guess your picks.</p>

      <form onSubmit={submit}>
        <div className="notice" id="notice">
          <h2>What this game stores</h2>
          <p>
            This game stores a nickname, the days you play, and your taps: what you pick and how fast you tap. The game
            uses them to build a twin of you. Your twin's notes about you go to an AI model, without your nickname. You can see
            everything the game stores. You can delete your account at any time: your login and nickname are removed, and
            your twin stays as a free twin with no name. It cannot be linked back to you.
          </p>
          <p>Use a nickname, not your real name. If you clear the data of this browser, you lose your twin.</p>
        </div>

        <label htmlFor="seat">Start as</label>
        <select id="seat" value={seat} onChange={(e) => setSeat(e.target.value as Seat)} aria-describedby="seat-help">
          <option value="player">Player: build my digital twin</option>
          <option value="agency">Agency: ask the twins</option>
          <option value="creator">Creator: make skills</option>
        </select>
        <p id="seat-help" className="muted">You can open the other seats later with the same login.</p>

        <label htmlFor="nick">Nickname</label>
        <input
          id="nick"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          minLength={2}
          maxLength={20}
          pattern="[A-Za-z0-9][A-Za-z0-9 _\-]*"
          autoComplete="off"
          aria-describedby="nick-help"
          required
        />
        <p id="nick-help" className="muted">Use 2 to 20 letters, numbers, spaces, dashes or underscores.</p>

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

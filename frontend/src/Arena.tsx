import { useState } from 'react'
import { Hide } from './Hide'
import { Rps } from './Rps'

type Game = 'rps' | 'hide'
const GAMES: [Game, string][] = [['rps', 'Rock, paper, scissors'], ['hide', 'Hide the light']]

/**
 * The Arena: duels between a person and their own Sym. In each one the Sym seals its move first, from that person's
 * earlier play, so every round shows how well it reads them. The game built these two. Duels are a creator's
 * ground: building more of them is how a creator is meant to earn.
 */
export function Arena({ announce }: { announce: (text: string) => void }) {
  const [game, setGame] = useState<Game>('rps')
  const games = (
    <div className="chips world-keys" role="group" aria-label="Pick a duel">
      {GAMES.map(([id, label]) => (
        <button key={id} className="chip" aria-pressed={game === id} onClick={() => setGame(id)}>{label}</button>
      ))}
    </div>
  )
  return game === 'hide' ? <Hide announce={announce} games={games} /> : <Rps announce={announce} games={games} />
}

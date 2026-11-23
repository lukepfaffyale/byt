import { useState } from 'react'
import { Duel, type DuelGame } from './Duel'
import { Rps } from './Rps'

type Game = 'rps' | DuelGame
const GAMES: [Game, string][] = [['rps', 'Rock, paper'], ['hide', 'Hide the light'], ['sync', 'Think alike'], ['keeper', 'Keeper']]

/**
 * The Arena: duels between a person and their own Sym. In each one the Sym seals its move first, from that person's
 * earlier play, so every round shows how well it reads them: it hunts (Hide the light), it throws (rock, paper,
 * scissors), it plays on the person's side (Think alike), and it is read in turn (Keeper). The game built these.
 * Duels are a creator's ground: building more of them is how a creator is meant to earn.
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
  return game === 'rps' ? <Rps announce={announce} games={games} /> : <Duel key={game} game={game} announce={announce} games={games} />
}

import { createContext, Fragment, useContext, useState, type ReactNode } from 'react'

const Again = createContext<() => void>(() => undefined)

/**
 * Wraps the screens. When a screen could not load, "Try again" starts everything inside afresh,
 * so each screen asks the server once more without needing a way of its own.
 */
export function RetryZone({ children }: { children: ReactNode }) {
  const [turn, setTurn] = useState(0)
  return (
    <Again.Provider value={() => setTurn((n) => n + 1)}>
      <Fragment key={turn}>{children}</Fragment>
    </Again.Provider>
  )
}

/** What a screen shows when it could not load: the reason, and one button to ask again. */
export function Failed({ error, again }: { error: string; again?: () => void }) {
  const restart = useContext(Again)
  return (
    <div className="failed">
      <p className="error" role="alert">{error}</p>
      <button className="secondary" onClick={() => { again?.(); restart() }}>Try again</button>
    </div>
  )
}

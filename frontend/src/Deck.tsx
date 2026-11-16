export type Tab<T extends string> = { id: T; label: string; n?: string | number }

/**
 * A row of taps that swaps what is shown below it, so a screen is one panel at a time and never a long page.
 * Each tap can carry a number, so the row is also a readout.
 */
export function Tabs<T extends string>(props: { tabs: Tab<T>[]; value: T; onChange: (id: T) => void; label: string }) {
  const { tabs, value, onChange, label } = props
  return (
    <div className="seg" role="group" aria-label={label}>
      {tabs.map((t) => (
        <button key={t.id} className="seg-tab" aria-pressed={value === t.id} onClick={() => onChange(t.id)}>
          {t.n !== undefined && <span className="seg-n">{t.n}</span>}
          <span className="seg-name">{t.label}</span>
        </button>
      ))}
    </div>
  )
}

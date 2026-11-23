/**
 * A small line drawing beside a choice, so a person can pick with less reading. The server names the drawing for
 * each option (from what the option stands for); the words stay, because the drawing is a hint, never the answer.
 * Every drawing is made here from plain lines. It is decoration: a screen reader hears the words only.
 */
const DRAWN: Record<string, string> = {
  grid: 'M5 6h14v13H5z M5 10h14 M9 6v13 M14 6v13', // a plan: a calendar grid
  spark: 'M12 3v5 M12 16v5 M3 12h5 M16 12h5 M6 6l3 3 M15 15l3 3 M18 6l-3 3 M9 15l-3 3', // on the spot
  bolt: 'M13 3L6 13h5l-1 8 8-11h-5z', // bold
  column: 'M6 5h12 M7 5v14 M12 5v14 M17 5v14 M5 19h14', // classic
  coin: 'M12 5a7 3 0 1 0 0.01 0z M5 8v4a7 3 0 0 0 14 0V8 M5 12v4a7 3 0 0 0 14 0v-4', // save
  gift: 'M5 10h14v9H5z M4 7h16v3H4z M12 7v12 M12 7c-3-4-6-1-3 0 M12 7c3-4 6-1 3 0', // splurge
  people: 'M8 9a2.5 2.5 0 1 0 0.01 0z M16 9a2.5 2.5 0 1 0 0.01 0z M3 20c0-4 3-6 5-6s5 2 5 6 M11 20c0-4 3-6 5-6s5 2 5 6', // with others
  person: 'M12 7a3 3 0 1 0 0.01 0z M6 20c0-5 3-7 6-7s6 2 6 7', // alone
  loop: 'M18 8a7 7 0 1 0 1 6 M18 4v4h-4', // loyal: the same again
  star: 'M12 3l2.6 5.6 6 .7-4.5 4.1 1.3 6-5.4-3.1-5.4 3.1 1.3-6L3.4 9.3l6-.7z', // new
  cloud: 'M7 17a4 4 0 0 1 1-8 5 5 0 0 1 9 2 3 3 0 0 1 0 6z', // comfort
  eye: 'M3 12c3-5 6-7 9-7s6 2 9 7c-3 5-6 7-9 7s-6-2-9-7z M12 9.5a2.5 2.5 0 1 0 0.01 0z', // the look
  diamond: 'M12 3l8 8-8 10-8-10z M4 11h16', // quality
  dots: 'M6 12a1.6 1.6 0 1 0 0.01 0z M12 12a1.6 1.6 0 1 0 0.01 0z M18 12a1.6 1.6 0 1 0 0.01 0z M6 6a1.6 1.6 0 1 0 0.01 0z M18 18a1.6 1.6 0 1 0 0.01 0z', // variety
  bars: 'M5 20V11 M10 20V5 M15 20v-7 M20 20V8 M3 20h19', // facts
  bulb: 'M9 17h6 M10 20h4 M12 3a6 6 0 0 0-4 10c1 1 1 2 1 4h6c0-2 0-3 1-4a6 6 0 0 0-4-10z', // ideas
  heart: 'M12 20s-7-4.5-7-10a4 4 0 0 1 7-2 4 4 0 0 1 7 2c0 5.500-7 10-7 10z', // heart
  hex: 'M12 3l8 4.500v9L12 21l-8-4.500v-9z M12 8v8 M8 10l8 4 M16 10l-8 4', // head
  arrow: 'M4 12h15 M14 7l5 5-5 5', // blunt: straight to it
  sun: 'M12 8a4 4 0 1 0 0.01 0z M12 2v3 M12 19v3 M2 12h3 M19 12h3 M5 5l2 2 M17 17l2 2 M19 5l-2 2 M7 17l-2 2', // warm
  dash: 'M5 12h14', // dry
  flag: 'M6 21V4 M6 5h11l-2 3.500 2 3.500H6', // to win
  box: 'M4 8l8-4 8 4v9l-8 4-8-4z M4 8l8 4 8-4 M12 12v9', // things
  peak: 'M3 19l6-10 4 6 2-3 6 7z', // experiences
  half: 'M12 4a8 8 0 1 0 0.01 0z M12 4v16', // a bit of both
}

export function Glyph({ name }: { name: string }) {
  const d = DRAWN[name]
  if (!d) return null
  return (
    <svg viewBox="0 0 24 24" className="glyph" aria-hidden="true">
      <path d={d} />
    </svg>
  )
}

// A made-up name offered for a new seat, so the one button works at once and nobody has to hunt for a box to type in.
// It fits the server's rule for a seat name: letters, numbers and spaces, 2 to 30 long.
const FIRST = ['North', 'Bright', 'Quiet', 'Open', 'Amber', 'Kind', 'Clear', 'Steady', 'Early', 'Far']

export function madeUpName(kind: 'Agency' | 'Studio'): string {
  const first = FIRST[Math.floor(Math.random() * FIRST.length)]
  return `${first} ${kind} ${100 + Math.floor(Math.random() * 900)}`
}

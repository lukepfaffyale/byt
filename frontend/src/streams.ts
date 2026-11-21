import type { WalletLine } from './api'

/** Each kind of move belongs to one stream, so the ledger can be read one stream at a time. */
const STREAM: Record<string, string> = {
  work: 'Work', data: 'Data', royalty: 'One to one', growth: 'Growth', sponsor: 'Growth', maker: 'Royalties', reach: 'Royalties',
  fee: 'AI cost', crew: 'Fees', claim: 'Fees', deposit: 'Added', grant: 'Added', hold: 'Held', release: 'Held',
  samples: 'Syms', fund_in: 'Fund', share: 'Share', share_back: 'Share',
}

/** The streams always come in this order, so a chip keeps its place when a new move arrives. */
export const STREAM_ORDER = ['Work', 'Data', 'One to one', 'Growth', 'Royalties', 'Added', 'Held', 'Syms', 'Fund', 'Share', 'Fees', 'AI cost', 'Other']

/** The streams that are income a Sym or a seat earned (not credits added from outside, and not credits held and returned). */
export const EARNED = ['Work', 'Data', 'One to one', 'Growth', 'Royalties']

export const streamOf = (m: WalletLine) => (m.kind === 'data' && m.credits < 0 ? 'Syms' : STREAM[m.kind] ?? 'Other')

/** The sum of each stream that has at least one move, in the fixed order. */
export function streamSums(lines: WalletLine[]): [string, number][] {
  const sums = new Map<string, number>()
  for (const m of lines) sums.set(streamOf(m), (sums.get(streamOf(m)) ?? 0) + m.credits)
  return STREAM_ORDER.filter((id) => sums.has(id)).map((id) => [id, Math.round((sums.get(id) ?? 0) * 100) / 100])
}

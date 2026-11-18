/** End a name like a sentence: add a full stop unless it already ends in one, or in a question or exclamation mark. */
export const stop = (words: string) => (/[.?!]$/.test(words) ? words : `${words}.`)
/** A credit amount without a long tail of decimals. */
export const credits = (n: number) => String(Math.round(n * 100) / 100)

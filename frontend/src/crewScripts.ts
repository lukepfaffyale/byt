/** Who speaks to whom. 0 is the boss, 1 to 3 are its crew, 4 is who they reach (a group of twins, one twin, a requester). */
export type CrewStep = { from: number; to: number; say: string }
/** A number from the run, and the line (counted from 0) at which it lands. */
export type CrewStat = { label: string; value: number; at: number }
export type CrewScript = {
  title: string; cast: [string, string, string, string, string]; one?: boolean; steps: CrewStep[]; note: string
  /** when they reach a group: how many Syms are in it, and how many of those are made-up samples */
  crowd?: number; samples?: number; stats?: CrewStat[]
  /** the answer that came back: each choice and its share of the group, 0 to 1. Totals only */
  split?: { label: string; share: number }[]
}

const n = (x: number, one: string, many: string) => `${x} ${x === 1 ? one : many}`

/** A boss sends its crew to a group of twins. Every number is from the run that just happened. */
export function groupScript(f: { boss: string; what: string; group: string; twins: number; samples: number; spent: number; fee: number; extra: number; min: number; test?: boolean; split?: { label: string; share: number }[] }): CrewScript {
  const steps: CrewStep[] = [
    { from: 0, to: 1, say: `Find the Syms in this group: ${f.group}.` },
    { from: 1, to: 4, say: 'Who here said yes to questions?' },
    { from: 4, to: 1, say: `${n(f.twins, 'Sym', 'Syms')} match. ${f.samples} of them are made-up sample Syms.` },
    { from: 0, to: 2, say: f.test ? `Run this: ${f.what}. See where each Sym stands.` : `Ask them this: ${f.what}` },
    { from: 2, to: 4, say: f.test ? 'I am reading your picks in this skill. You do not need to answer.' : 'One question for each of you. Answer as your human would.' },
    { from: 4, to: 2, say: f.test ? `${n(f.twins, 'Sym was', 'Syms were')} read.` : `${n(f.twins, 'answer', 'answers')} came back.` },
    { from: 0, to: 3, say: 'Count the answers. Show me totals only.' },
    { from: 3, to: 0, say: `${f.twins} is ${f.min} or more, so the totals may be shown. No Sym is named.` },
    { from: 3, to: 4, say: `Paid: ${n(f.spent - f.fee - f.extra, 'credit', 'credits')} to the Syms.${f.extra > 0 ? ` ${f.extra} more to the growth fund for asking again.` : ''}${f.fee > 0 ? ` ${f.fee} to the game for the crew.` : ''}` },
  ]
  return { title: 'Your crew is at work', cast: [f.boss, 'Scout', 'Asker', 'Counter', 'Syms'], steps, crowd: f.twins, samples: f.samples, split: f.split,
    stats: [{ label: 'Syms found', value: f.twins, at: 2 }, { label: f.test ? 'Syms read' : 'Answers', value: f.twins, at: 5 }, { label: 'Credits to Syms', value: f.spent - f.fee - f.extra, at: 8 }],
    note: 'This is a replay of what your crew just did. The crew is a computer program, not AI.' }
}

/** A boss pays a royalty to meet one twin. */
export function meetScript(f: { boss: string; group: string; nickname: string; price: number; fee: number }): CrewScript {
  const steps: CrewStep[] = [
    { from: 0, to: 1, say: `Find one Sym in this group that is open to a meeting: ${f.group}.` },
    { from: 1, to: 4, say: 'Did your human say yes to one to one?' },
    { from: 4, to: 1, say: 'Yes. My human turned it on.' },
    { from: 0, to: 3, say: `Pay the royalty first: ${f.price} credits to the owner.` },
    { from: 3, to: 4, say: `Paid ${f.price} credits. ${f.fee} more went to the game for the crew.` },
    { from: 0, to: 2, say: 'Now ask who it is, and ask it every question.' },
    { from: 4, to: 2, say: `I am the Sym of ${f.nickname}. Here are my answers.` },
    { from: 2, to: 0, say: 'The answers are on your results screen.' },
  ]
  return { title: 'Your crew is meeting one Sym', cast: [f.boss, 'Scout', 'Asker', 'Payer', 'One Sym'], one: true, steps, stats: [{ label: 'Credits to the owner', value: f.price, at: 4 }], note: 'This is a replay of what your crew just did. The crew is a computer program, not AI.' }
}

/** A creator claims a waiting skill step. */
export function claimScript(f: { boss: string; skill: string; step: string; fee: number }): CrewScript {
  const steps: CrewStep[] = [
    { from: 0, to: 1, say: `Find the next waiting step of this skill: ${f.skill}.` },
    { from: 1, to: 0, say: `The next one is: ${f.step}.` },
    { from: 0, to: 3, say: `Claim it. Pay the fee: ${f.fee} credits.` },
    { from: 3, to: 4, say: `Paid ${f.fee} credits to the game.` },
    { from: 0, to: 2, say: 'Mark the step as ours.' },
    { from: 2, to: 0, say: 'Done. Next, tap Build my step and pick its cards.' },
  ]
  return { title: 'Your crew is claiming a step', cast: [f.boss, 'Scout', 'Maker', 'Payer', 'The game'], one: true, steps, stats: [{ label: 'Fee paid', value: f.fee, at: 3 }], note: 'This is a replay of what your crew just did. The crew is a computer program, not AI.' }
}

/** An agency posts a job for twins to take. */
export function postScript(f: { boss: string; what: string; pay: number; seats: number; held: number }): CrewScript {
  const steps: CrewStep[] = [
    { from: 0, to: 3, say: `Hold the pay first: ${f.held} credits for ${n(f.seats, 'Sym', 'Syms')}.` },
    { from: 3, to: 4, say: `${f.held} credits are held. Nothing is paid yet.` },
    { from: 0, to: 1, say: 'Put the job on the board, where Syms can find it.' },
    { from: 1, to: 4, say: `New job: ${f.what} It pays ${f.pay} credits for a checked answer.` },
    { from: 4, to: 2, say: 'A Sym that takes it answers with AI. Then its human checks the answer.' },
    { from: 2, to: 0, say: 'Each checked answer lands in your results. You see totals, never who.' },
    { from: 3, to: 0, say: 'Credits that are not used come back to you.' },
  ]
  return { title: 'Your crew is posting a job', cast: [f.boss, 'Scout', 'Counter', 'Payer', 'The job board'], one: true, steps, stats: [{ label: 'Credits held', value: f.held, at: 1 }, { label: 'Places', value: f.seats, at: 3 }], note: 'This is a replay of what your crew just did. The crew is a computer program, not AI. The Syms that take the job do use AI.' }
}

/** A creator builds a claimed step from the cards it tapped. */
export function buildScript(f: { boss: string; step: string; cards: number; fee: number; royalty: number }): CrewScript {
  const steps: CrewStep[] = [
    { from: 0, to: 1, say: `Fetch the ${f.cards} cards I tapped for this step: ${f.step}.` },
    { from: 1, to: 2, say: `Here are the ${f.cards} cards. The game wrote them. We chose them.` },
    { from: 0, to: 2, say: 'Put them in order and build the step.' },
    { from: 2, to: 4, say: 'The step is built. Please open it for players.' },
    { from: 0, to: 3, say: `Pay the crew fee: ${n(f.fee, 'credit', 'credits')}.` },
    { from: 3, to: 4, say: `Paid ${n(f.fee, 'credit', 'credits')} to the game.` },
    { from: 4, to: 0, say: `It is open. You earn ${n(f.royalty, 'credit', 'credits')} each time another player passes it.` },
  ]
  return { title: 'Your crew is building a step', cast: [f.boss, 'Scout', 'Maker', 'Payer', 'The game'], one: true, steps, stats: [{ label: 'Cards', value: f.cards, at: 1 }, { label: 'Credits for each pass', value: f.royalty, at: 6 }], note: 'This is a replay of what your crew just did. The crew is a computer program, not AI.' }
}

/** A player sends their twin to do a job. Shown while the twin really works. */
export function jobScript(f: { requester: string; pay: number }): CrewScript {
  const steps: CrewStep[] = [
    { from: 0, to: 1, say: `Go and answer for me. ${f.requester} is asking.` },
    { from: 1, to: 4, say: 'What is the question?' },
    { from: 4, to: 1, say: 'One question. Choose one answer.' },
    { from: 1, to: 2, say: 'What do we know about our human?' },
    { from: 2, to: 1, say: 'I read the beliefs made from your taps. Not your name.' },
    { from: 1, to: 3, say: 'Hold the pay until our human checks my answer.' },
    { from: 3, to: 0, say: `${f.pay} credits are waiting for your yes or no.` },
  ]
  return { title: 'Your Sym is working', cast: ['You', 'Your Sym', 'Memory', 'Checker', f.requester], one: true, steps, stats: [{ label: 'Credits waiting', value: f.pay, at: 6 }], note: 'Your Sym answers once. Nothing is paid until you check the answer.' }
}

// The one typed client for the back end. Shapes mirror backend/models.py.

const BASE: string = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://127.0.0.1:8000'
const TOKEN_KEY = 'byt_token'

export type Gate = {
  id: string
  title: string
  kind: string
  deck: string
  difficulty: string | null
  bin: string
  total: number
  done: number
  unlocked: boolean
}
export type Bin = { id: string; name: string; about: string }
export type Option = { id: string; label: string }
export type Board = { game: 'tictactoe' | 'connect4' | 'pattern' | 'reflex'; rows: string[]; to_move: string; seq: string[] }
export type Card = { id: string; kind: string; prompt: string; options: Option[]; board: Board | null; bet_sure: number | null }
export type Me = { nickname: string; points: number; level: number; gates_done: number; gates_total: number; certs: number; credits: number; jobs_open: number; twins: number; together: number; active_days: number; income_share: number }
export type Cert = { kind: string; topic: string; level: string; accuracy: number; baseline: number | null; n: number; issued_at: string }
export type BattleResult = {
  gate_id: string
  topic: string
  n: number
  answered: number
  complete: boolean
  twin_kind: string
  twin_matches: number
  baseline_matches: number
  cert: Cert | null
  note: string
  areas: { key: string; name: string; region: string; color: string; right: number; total: number }[]
  record: string[]
}
export type Judgment = { rows: { level: number; right: number; total: number }[]; taps: { at: string; level: number; right: boolean }[]; says: string }
export type RpsRound = { mine: string; twin: string; outcome: 'you' | 'twin' | 'draw'; why: string }
export type RpsOut = {
  rounds: number; you: number; twin: number; draws: number; last: RpsRound[]
  tells: { after: string; then: string; n: number; of: number }[]
  need: number; rivals: { name: string; free: boolean; won: number; lost: number; drawn: number }[]; rank: number; of: number
  round: RpsRound | null
}
export type Lesson = { kind: string; topic: string; before: string; after: string }
export type Learned = { twin_kind: string; misses: number; picks_added: number; lessons: Lesson[] }
export type Tendency = { topic: string; statement: string; evidence_count: number; scope: string }
export type Fact = { id: string; scope: string; topic: string; statement: string }
export type BattleSummary = {
  topic: string
  n: number
  twin_kind: string
  twin_matches: number | null
  baseline_matches: number | null
  created_at: string
}
export type AgentUsage = { agent: string; runs: number; input_tokens: number; cached_tokens: number; output_tokens: number; cost_usd: number }
export type UsageSummary = {
  model: string
  price_note: string
  runs: number
  input_tokens: number
  cached_tokens: number
  output_tokens: number
  cost_usd: number
  my_runs: number
  my_cost_usd: number
  by_agent: AgentUsage[]
}
export type ResponseOut = {
  sponsored: number
  is_correct: boolean | null
  points_earned: number
  points: number
  level: number
  gate_complete: boolean
  twin_choice: string | null
  twin_match: boolean | null
  twin_sure: number | null
  twin_because: string | null
  crowd_match: boolean | null
  others_right: number | null
  others_total: number | null
  twin_bet: boolean | null
  twin_bet_sure: number | null
  sure_record: { level: number; right: number; total: number }[]
  cert_need: number | null
  cert_right: number | null
  cert: Cert | null
  bonus: number
}
export type ActivityItem = {
  card_id: string
  gate: string
  prompt: string
  choice: string
  is_correct: boolean | null
  response_ms: number
  created_at: string
}
export type Job = {
  id: string
  requester: string
  requester_kind: string
  question: string
  feeds: string
  pay: number
  after_gates: number
  state: 'locked' | 'open' | 'review' | 'done'
  options: Option[]
  twin_kind: string | null
  answer: string | null
  reason: string
  verdict: string | null
  final_choice: string | null
  credits: number
}
export type JobResult = {
  insight: Cert | null
  job: Job
  credits_earned: number
  credits: number
  certified: boolean
  taps: number
  beliefs: number
  twins: number
  sample_twins: number
  split: { label: string; count: number; share: number; yours: boolean }[]
  note: string
}
export type JobsOut = {
  jobs: Job[]; credits: number; certified: boolean; data_income: boolean; data_credits: number; data_answers: number
  one_to_one: boolean; meet_price: number; meets: number
  auto_per_day: number; auto_choices: number[]; earned_credits: number; upkeep_credits: number
}
export type Brief = {
  kind: 'survey' | 'test' | 'skill' | 'build'; title: string; audience: string; twins: number; sample_twins: number; spent: number; fee: number
  split: { label: string; count: number; share: number }[]; note: string; created_at: string
}
export type Creator = {
  exists: boolean; name: string; budget: number; min_twins: number; pay: number; crew_fee: number; claim_fee: number
  questions: { id: string; kind: string; question: string; options: Option[] }[]
  audiences: { id: string; name: string }[]
  skills: { id: string; name: string; about: string; waiting: string[]; claimed: string[]; later: string[] }[]
  step_cards: number; step_royalty: number
  needs: { skill: string; name: string; left: number; built: boolean }[]
  wanted: { skill: string; name: string; agencies: number; built: boolean; waiting: number }[]
  emerging: { a: string; b: string; agencies: number }[]; reach_earned: number; sponsor_earned: number
  packs: { id: string; skill: string; step: string; cards: { id: string; prompt: string; options: string[] }[] }[]
  made: { skill: string; step: string; cards: number; passes: number; earned: number }[]
  briefs: Brief[]
}
export type MetTwin = { open: boolean; nickname: string; sample: boolean; strongest: string[]; answers: { question: string; answer: string }[]; paid: number; at: string }
export type Meets = { price: number; fee: number; budget: number; audiences: { id: string; name: string }[]; met: MetTwin[] }
export type Campaign = {
  kind: string
  question: string
  audience: string
  depth: string
  pay: number
  twins: number
  sample_twins: number
  spent: number
  extra: number
  split: { label: string; count: number; share: number }[]
  created_at: string
}
export type AskOut = { say: string; twin_kind: 'model' | 'offline'; move: { id: string; label: string } | null; learn: Card | null; offer: Fact | null }
export type PlanOption = { id: string; title: string; why: string; credits: number; minutes: number }
export type World = {
  twins_members: number; twins_free: number; twins_forming: number; agencies: number; creators: number; built_steps: number
  open_jobs: number; sponsors: number; certs_twin: number; certs_skill: number; certs_insight: number; checked_answers: number
  corrections: number; agent_runs: number; agent_cost_usd: number
  flows: { src: string; dst: string; credits: number; moves: number }[]; balances: Record<string, number>; last_move: string | null
}
export type Commons = {
  nickname: string; people: number; people_today: number; stand_ins: number; agencies: number; creators: number
  taps: number; checks: number; told: number; lessons: number; proofs: number; beliefs: number; known: number; known_mine: number
  happenings: { who: string; text: string; when: string; mine: boolean }[]
}
export type Ripple = { agency: boolean; creator: boolean; links: { src: string; dst: string; n: number; credits: number; text: string }[] }
export type Posting = {
  id: string; kind: string; question: string; pay: number; seats: number; taken: number; checked: number; held: number; open: boolean
  sample_twins: number; split: { label: string; count: number; share: number }[]; created_at: string
}
export type Agency = {
  job_pay_choices: number[]; job_seats: number[]; hold_times: number; postings: Posting[]
  sponsor_budgets: number[]; sponsor_skills: { id: string; name: string }[]
  sponsorships: { skill: string; budget: number; spent: number; passes: number; open: boolean }[]
  exists: boolean
  name: string
  budget: number
  min_twins: number
  pay_choices: number[]
  price_times: Record<string, number>
  tiers: { id: string; name: string; times: number }[]
  free_share: number
  meet_price: number
  reach: Record<string, Record<string, [number, number] | null>>
  fund: number
  questions: { id: string; kind: string; question: string; options: Option[] }[]
  audiences: { id: string; name: string }[]
  campaigns: Campaign[]
}
export type MoneyLine = { source: string; label: string; detail: string; credits: number; at: string }
export type Money = {
  earned: number
  work_credits: number
  data_credits: number
  growth_credits: number
  fund: number
  active_days: number
  income_share: number
  lines: MoneyLine[]
  cost_usd: number
  cost_by_agent: { agent: string; runs: number; usd: number }[]
  price_note: string
  agency: { name: string; started_with: number; spent: number; left: number; twins_asked: number; lines: MoneyLine[] } | null
}
export type Vertical = { key: string; name: string; color: string; level: number; earned: number; picks: number; steps_done: number; steps_total: number; count: number | null; hidden: boolean; dots: number[]; details: string[]; next_gate?: string | null; next_title?: string | null }
export type WalletLine = { at: string; kind: string; label: string; detail: string; credits: number }
export type WalletOut = { seat: 'player' | 'agency' | 'creator'; balance: number; came_in: number; went_out: number; lines: WalletLine[] }
export type Wallets = { wallets: WalletOut[]; deposit_choices: number[]; note: string }
export type SphereFrame = { label: string; at: string; levels: number[]; earned: number[] }
export type Hub = { area: string; name: string; told: boolean }
export type Sphere = { hubs?: Hub[]; verticals: Vertical[]; links: number; history: SphereFrame[]; mode: 'fill' | 'clusters'; balance: number | null }
export type WorkItem = { requester: string; question: string; twin_answer: string; your_answer: string; verdict: string; credits: number }
export type Told = {
  ei: 'E' | 'I' | null
  sn: 'S' | 'N' | null
  tf: 'T' | 'F' | null
  jp: 'J' | 'P' | null
  analyse: number | null
  organise: number | null
  explore: number | null
  connect: number | null
  sign: string | null
  animal: string | null
}
export type Axis = {
  name: string
  first: string
  second: string
  first_picks: number
  second_picks: number
  suggested: string | null
  told: string | null
  verdict: 'aligned' | 'differs' | 'open' | 'not told'
}
export type SkillRef = { id: string; name: string }
export type Style = {
  key: 'analyse' | 'organise' | 'explore' | 'connect'
  name: string
  picks: number
  chances: number
  share: number
  told: number | null
  about: string
  strength: string
  watch: string
  skills: SkillRef[]
}
export type Faculty = { key: string; name: string; region: string; picks: number; chances: number; share: number; about: string; fact: string; skills: SkillRef[]; feeds: string[] }
export type GrowthPath = { kind: 'specialise' | 'stretch'; style: string; skills: SkillRef[] }
export type SkillStep = { name: string; state: 'done' | 'open' | 'locked' | 'soon'; gate_id: string | null; made: boolean }
export type SkillTree = { id: string; name: string; about: string; grows: string[]; steps: SkillStep[]; done: number; certs: number }
export type Mirror = {
  suggested_type: string
  axes: Axis[]
  styles: Style[]
  top_styles: string[]
  faculties: Faculty[]
  paths: GrowthPath[]
  style_verdict: 'aligned' | 'differs' | 'open' | 'not told'
  told: Told
  picks_used: number
  note: string
}
export type Activity = {
  nickname: string
  points: number
  level: number
  joined: string
  responses: ActivityItem[]
  tendencies: Tendency[]
  battles: BattleSummary[]
  certs: Cert[]
  told: Told | null
  work: WorkItem[]
  credits: number
}

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function setToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    // storage blocked: the game still works until the tab closes
  }
}

let memoryToken: string | null = getToken()

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (memoryToken) headers['Authorization'] = `Bearer ${memoryToken}`
  let res: Response
  try {
    res = await fetch(BASE + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
  } catch {
    throw new ApiError(0, 'The game cannot reach its server. Please check that the server is running.')
  }
  if (!res.ok) {
    let message = 'There was a problem. Please try again.'
    try {
      const data = (await res.json()) as { detail?: unknown }
      if (typeof data.detail === 'string') message = data.detail
      else if (res.status === 422) message = 'The game did not accept what you entered.'
    } catch {
      // keep the default message
    }
    throw new ApiError(res.status, message)
  }
  return (await res.json()) as T
}

export const api = {
  hasToken: () => memoryToken !== null,
  async start(nickname: string): Promise<void> {
    const out = await call<{ token: string; nickname: string }>('POST', '/players', {
      nickname,
      consent: true,
      adult: true,
    })
    memoryToken = out.token
    setToken(out.token)
  },
  forget(): void {
    memoryToken = null
    setToken(null)
  },
  me: () => call<Me>('GET', '/me'),
  journey: () => call<{ gates: Gate[]; bins: Bin[] }>('GET', '/journey'),
  gateCards: (gateId: string) => call<{ gate: Gate; cards: Card[] }>('GET', `/gates/${encodeURIComponent(gateId)}/cards`),
  respond: (card_id: string, choice: string, response_ms: number, sure?: number) =>
    call<ResponseOut>('POST', '/responses', sure ? { card_id, choice, response_ms, sure } : { card_id, choice, response_ms }),
  startBattle: (gate_id: string) => call<{ gate_id: string; n: number; twin_kind: string; sure: Record<string, number> }>('POST', '/battles', { gate_id }),
  judgment: () => call<Judgment>('GET', '/me/judgment'),
  facts: () => call<{ facts: Fact[] }>('GET', '/twin/facts'),
  keepFact: () => call<{ facts: Fact[] }>('POST', '/twin/facts'),
  forgetFact: (id: string) => call<{ facts: Fact[] }>('DELETE', `/twin/facts/${encodeURIComponent(id)}`),
  retry: (gateId: string) => call<{ gate_id: string; cards: number }>('POST', `/gates/${encodeURIComponent(gateId)}/retry`),
  rps: () => call<RpsOut>('GET', '/rps'),
  throwRps: (t: string) => call<RpsOut>('POST', '/rps', { throw: t }),
  learn: (gateId: string) => call<Learned>('POST', `/battles/${encodeURIComponent(gateId)}/learn`),
  battle: (gateId: string) => call<BattleResult>('GET', `/battles/${encodeURIComponent(gateId)}`),
  usage: () => call<UsageSummary>('GET', '/usage/summary'),
  activity: () => call<Activity>('GET', '/me/activity'),
  exportMine: () => call<Record<string, unknown>>('GET', '/me/export'),
  mirror: () => call<Mirror>('GET', '/me/mirror'),
  skills: () => call<{ trees: SkillTree[] }>('GET', '/skills'),
  jobs: () => call<JobsOut>('GET', '/jobs'),
  money: () => call<Money>('GET', '/me/money'),
  wallets: () => call<Wallets>('GET', '/wallets'),
  deposit: (seat: 'player' | 'agency' | 'creator', credits: number) => call<Wallets>('POST', '/wallets/deposit', { seat, credits }),
  sphere: () => call<Sphere>('GET', '/me/sphere'),
  seatSphere: (seat: 'agency' | 'creator') => call<Sphere>('GET', `/seats/${seat}/sphere`),
  consent: (data_income: boolean) => call<JobsOut>('POST', '/me/consent', { data_income }),
  agency: () => call<Agency>('GET', '/agency'),
  creator: () => call<Creator>('GET', '/creator'),
  openCreator: (name: string) => call<Creator>('POST', '/creator', { name }),
  brief: (kind: 'survey' | 'test' | 'skill', topic: string, audience: string) => call<Creator>('POST', '/creator/briefs', { kind, topic, audience }),
  buildStep: (pack: string, cards: string[]) => call<Creator>('POST', '/creator/steps', { pack, cards }),
  meets: (seat: 'agency' | 'creator') => call<Meets>('GET', `/seats/${seat}/meets`),
  meet: (seat: 'agency' | 'creator', audience: string) => call<Meets>('POST', `/seats/${seat}/meet`, { audience }),
  oneToOne: (on: boolean) => call<JobsOut>('POST', '/me/one-to-one', { on }),
  openAgency: (name: string) => call<Agency>('POST', '/agency', { name }),
  runCampaign: (question_id: string, audience: string, pay: number, depth: string) =>
    call<Agency>('POST', '/agency/campaigns', { question_id, audience, pay, depth }),
  plan: () => call<{ options: PlanOption[] }>('GET', '/me/plan'),
  world: () => call<World>('GET', '/world'),
  commons: () => call<Commons>('GET', '/commons'),
  ripple: () => call<Ripple>('GET', '/me/ripple'),
  auto: (per_day: number) => call<JobsOut>('POST', '/me/auto', { per_day }),
  sponsor: (skill: string, budget: number) => call<Agency>('POST', '/agency/sponsor', { skill, budget }),
  ask: (text: string) => call<AskOut>('POST', '/twin/ask', { text }),
  postJob: (question_id: string, pay: number, seats: number) => call<Agency>('POST', '/agency/jobs', { question_id, pay, seats }),
  closeJob: (id: string) => call<Agency>('POST', `/agency/jobs/${encodeURIComponent(id)}/close`, {}),
  runJob: (id: string) => call<Job>('POST', `/jobs/${encodeURIComponent(id)}/run`, {}),
  reviewJob: (id: string, verdict: 'approved' | 'corrected', choice: string | null) =>
    call<JobResult>('POST', `/jobs/${encodeURIComponent(id)}/review`, { verdict, choice }),
  tell: (told: Told) => call<Mirror>('POST', '/me/told', told),
  untell: () => call<Mirror>('DELETE', '/me/told'),
  deleteMe: () => call<{ deleted: boolean }>('DELETE', '/me'),
  leave: () => call<{ left: boolean }>('POST', '/me/leave', {}),
}

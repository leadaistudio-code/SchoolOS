/**
 * The health score.
 *
 * One number per student, per class and for the school, built from signals the
 * ERP already records. The point is not the number — it is that a principal can
 * click it apart and land on the register, the marksheet or the fee ledger it
 * came from.
 *
 * Four rules make the number trustworthy, and every one of them exists because
 * the obvious implementation is wrong:
 *
 *  1. **A missing signal is not a zero.** A child with no exam results yet has
 *     no academic score — scoring them 0 would say they failed. Metrics with no
 *     data are dropped and their weight is shared out across the metrics that
 *     do have data.
 *  2. **Coverage travels with the score.** 88 out of 100 built on every metric
 *     and 88 built on attendance alone are different claims, so the share of
 *     weight that had data behind it is carried everywhere the score goes.
 *  3. **No data at all means no score.** Not zero, not 50 — `null`, and the
 *     screen says so.
 *  4. **Weights are relative, not percentages.** A school can type 3/2/1;
 *     normalising is the code's job, not the registrar's.
 *
 * Pure, dependency-free and free of server imports: the weight editor renders
 * live previews from the same functions the server scores with, so the two can
 * never disagree about what a weight means.
 */

export type ScorePopulation = 'STUDENT' | 'STAFF'

export type MetricDef = {
  key: string
  population: ScorePopulation
  label: string
  /** What the metric rewards, in the school's language. */
  description: string
  /** Exactly which records are read, so a disputed score can be checked. */
  source: string
  /** Relative weight out of a shipped total of 100. */
  defaultWeight: number
  /**
   * Module this metric needs. When the module is off the metric is not offered
   * at all, rather than sitting at zero and quietly dragging coverage down.
   */
  module?: 'transport' | 'library'
}

export const STUDENT_METRICS: MetricDef[] = [
  {
    key: 'ACADEMICS',
    population: 'STUDENT',
    label: 'Academics',
    description: 'Marks and results across the session.',
    source: 'Mean percentage of published exam results.',
    defaultWeight: 30,
  },
  {
    key: 'ATTENDANCE',
    population: 'STUDENT',
    label: 'Attendance',
    description: 'Being in school.',
    source:
      'Days present as a share of days marked. Half days count half; approved leave and holidays are excluded rather than counted against.',
    defaultWeight: 25,
  },
  {
    key: 'PUNCTUALITY',
    population: 'STUDENT',
    label: 'Punctuality',
    description: 'Arriving on time.',
    source: 'Attended days not marked late.',
    defaultWeight: 10,
  },
  {
    key: 'HOMEWORK',
    population: 'STUDENT',
    label: 'Homework',
    description: 'Work handed in.',
    source: 'Submissions made, with a late submission counted as half.',
    defaultWeight: 15,
  },
  {
    key: 'FEE_TIMELINESS',
    population: 'STUDENT',
    label: 'Fee timeliness',
    description: 'Fees settled by the date they were due.',
    source:
      'Invoices with nothing outstanding past their due date. Only issued invoices count; drafts and cancellations are ignored.',
    defaultWeight: 8,
  },
  {
    key: 'BEHAVIOUR',
    population: 'STUDENT',
    label: 'Behaviour',
    description: 'Conduct on record.',
    source: 'Starts at 100. Each discipline record subtracts by its severity.',
    defaultWeight: 7,
  },
  {
    key: 'TRANSPORT',
    population: 'STUDENT',
    label: 'Transport',
    description: 'Catching the bus they are assigned to.',
    source: 'Trips boarded as a share of trips where boarding was recorded either way.',
    defaultWeight: 3,
    module: 'transport',
  },
  {
    key: 'LIBRARY',
    population: 'STUDENT',
    label: 'Library',
    description: 'Returning books on time.',
    source: 'Loans returned on or before the due date. Books still out and not yet due are ignored.',
    defaultWeight: 2,
    module: 'library',
  },
]

export const STAFF_METRICS: MetricDef[] = [
  {
    key: 'STAFF_ATTENDANCE',
    population: 'STAFF',
    label: 'Attendance',
    description: 'Being at work.',
    source: 'Days present as a share of days marked, half days counted half, approved leave excluded.',
    defaultWeight: 35,
  },
  {
    key: 'STAFF_PUNCTUALITY',
    population: 'STAFF',
    label: 'Punctuality',
    description: 'Arriving on time.',
    source: 'Attended days not marked late.',
    defaultWeight: 20,
  },
  {
    key: 'STAFF_APPRAISAL',
    population: 'STAFF',
    label: 'Appraisal',
    description: 'The last completed appraisal.',
    source: 'Overall rating from the most recent completed appraisal, rescaled from 1–5 onto 0–100.',
    defaultWeight: 30,
  },
  {
    key: 'STAFF_REVIEW',
    population: 'STAFF',
    label: 'Marking homework',
    description: 'Turning around the work they set.',
    source: 'Submissions on their own homework that have been reviewed.',
    defaultWeight: 15,
  },
]

export const ALL_METRICS = [...STUDENT_METRICS, ...STAFF_METRICS]

const METRIC_BY_KEY = new Map(ALL_METRICS.map((m) => [m.key, m]))

export function metricsFor(population: ScorePopulation): MetricDef[] {
  return population === 'STUDENT' ? STUDENT_METRICS : STAFF_METRICS
}

export function metricLabel(key: string): string {
  return METRIC_BY_KEY.get(key)?.label ?? key.replace(/_/g, ' ').toLowerCase()
}

export function metricDef(key: string): MetricDef | undefined {
  return METRIC_BY_KEY.get(key)
}

/* -------------------------------------------------------------------------- */
/* Bands                                                                       */
/* -------------------------------------------------------------------------- */

export type ScoreBand = 'EXCELLENT' | 'GOOD' | 'FAIR' | 'AT_RISK'

/**
 * Four bands, not five or ten.
 *
 * The band exists so a principal can act — congratulate, watch, or intervene —
 * and there are only about that many distinct actions. Finer grading would
 * imply a precision the inputs do not have.
 */
export const BANDS: { band: ScoreBand; label: string; min: number; tone: 'success' | 'brand' | 'warning' | 'danger'; meaning: string }[] = [
  { band: 'EXCELLENT', label: 'Excellent', min: 85, tone: 'success', meaning: 'Doing well across the board.' },
  { band: 'GOOD', label: 'Good', min: 70, tone: 'brand', meaning: 'Sound, with something worth a look.' },
  { band: 'FAIR', label: 'Fair', min: 55, tone: 'warning', meaning: 'Slipping in more than one area.' },
  { band: 'AT_RISK', label: 'Needs attention', min: 0, tone: 'danger', meaning: 'Needs someone to intervene.' },
]

export function bandFor(score: number): ScoreBand {
  return BANDS.find((b) => score >= b.min)?.band ?? 'AT_RISK'
}

export function bandMeta(band: ScoreBand) {
  return BANDS.find((b) => b.band === band) ?? BANDS[BANDS.length - 1]!
}

/**
 * Coverage below this is not a score anyone should act on — it is a reading
 * taken through a keyhole, and the screens label it as provisional.
 */
export const LOW_COVERAGE = 0.6

/* -------------------------------------------------------------------------- */
/* Composition                                                                 */
/* -------------------------------------------------------------------------- */

/** One metric measured for one subject. `score: null` means nothing to read. */
export type MetricReading = {
  metric: string
  score: number | null
  /** Evidence, in words: "42 of 45 days present". Shown next to the sub-score. */
  detail: string
}

export type WeightSetting = { metric: string; weight: number; isEnabled: boolean }

export type ScorePart = {
  metric: string
  label: string
  score: number | null
  detail: string
  /** Share the school configured, 0–1 across enabled metrics. */
  configuredShare: number
  /** Share after weight from dark metrics is shared out, 0–1. */
  effectiveShare: number
  /** Points of the final score this metric accounts for. */
  contribution: number
}

export type ComposedScore = {
  /** 0–100, or null when not one enabled metric had data. */
  score: number | null
  band: ScoreBand | null
  /** 0–1: share of enabled weight that had data behind it. */
  coverage: number
  parts: ScorePart[]
}

function clamp(value: number): number {
  if (Number.isNaN(value)) return 0
  return Math.max(0, Math.min(100, value))
}

/**
 * Turns per-metric readings into one number.
 *
 * The redistribution in here is the whole design. Weight belonging to a metric
 * with no data is not simply dropped — dropping it would score everyone against
 * a smaller total and make the number incomparable between two students with
 * different gaps. It is shared out in proportion among the metrics that did
 * report, so every score is out of a full 100 and two students remain
 * comparable even when the school knows different things about them.
 */
export function composeScore(
  readings: MetricReading[],
  weights: WeightSetting[],
): ComposedScore {
  const weightBy = new Map(weights.filter((w) => w.isEnabled && w.weight > 0).map((w) => [w.metric, w.weight]))
  const readingBy = new Map(readings.map((r) => [r.metric, r]))

  const totalWeight = [...weightBy.values()].reduce((sum, w) => sum + w, 0)
  if (totalWeight === 0) {
    return { score: null, band: null, coverage: 0, parts: [] }
  }

  // Only metrics that are both weighted and readable carry the score.
  let liveWeight = 0
  for (const [metric, weight] of weightBy) {
    if (readingBy.get(metric)?.score != null) liveWeight += weight
  }

  const parts: ScorePart[] = [...weightBy.entries()].map(([metric, weight]) => {
    const reading = readingBy.get(metric)
    const has = reading?.score != null
    const effectiveShare = has && liveWeight > 0 ? weight / liveWeight : 0
    const value = has ? clamp(reading!.score!) : null

    return {
      metric,
      label: metricLabel(metric),
      score: value,
      detail: reading?.detail ?? 'Nothing recorded yet',
      configuredShare: weight / totalWeight,
      effectiveShare,
      contribution: value === null ? 0 : value * effectiveShare,
    }
  })

  // Keep the display order stable and meaningful: heaviest first, so the thing
  // that moves the number most is the thing read first.
  parts.sort((a, b) => b.configuredShare - a.configuredShare || a.label.localeCompare(b.label))

  if (liveWeight === 0) {
    return { score: null, band: null, coverage: 0, parts }
  }

  const score = clamp(parts.reduce((sum, p) => sum + p.contribution, 0))

  return {
    score: Math.round(score * 10) / 10,
    band: bandFor(score),
    coverage: liveWeight / totalWeight,
    parts,
  }
}

/**
 * Mean of a set of scores, ignoring subjects that have none.
 *
 * A class average is taken over the children who could be scored, not over the
 * roll: including an unscored child as a zero would punish a class for a gap in
 * the school's own record-keeping.
 */
export function averageScore(scores: (number | null)[]): { score: number | null; counted: number } {
  const real = scores.filter((s): s is number => s !== null)
  if (real.length === 0) return { score: null, counted: 0 }
  const mean = real.reduce((sum, s) => sum + s, 0) / real.length
  return { score: Math.round(mean * 10) / 10, counted: real.length }
}

/** How many subjects fall in each band. Drives the distribution bar. */
export function bandCounts(scores: (number | null)[]): Record<ScoreBand, number> {
  const counts: Record<ScoreBand, number> = { EXCELLENT: 0, GOOD: 0, FAIR: 0, AT_RISK: 0 }
  for (const score of scores) {
    if (score === null) continue
    counts[bandFor(score)] += 1
  }
  return counts
}

/**
 * The shipped weights for a population, as stored rows would look.
 * A school that has never touched the editor is scored on exactly these.
 */
export function defaultWeights(population: ScorePopulation): WeightSetting[] {
  return metricsFor(population).map((m) => ({
    metric: m.key,
    weight: m.defaultWeight,
    isEnabled: true,
  }))
}

/**
 * Merges stored overrides onto the defaults.
 *
 * Absent rows mean "not yet touched", so a metric introduced in a later release
 * arrives with its shipped weight rather than at zero — a new signal should
 * start counting, not sit silently disabled until someone notices it.
 */
export function resolveWeights(
  population: ScorePopulation,
  stored: WeightSetting[],
  enabledModules?: { transport: boolean; library: boolean },
): WeightSetting[] {
  const storedBy = new Map(stored.map((s) => [s.metric, s]))

  return metricsFor(population)
    .filter((m) => {
      if (!m.module || !enabledModules) return true
      return enabledModules[m.module]
    })
    .map((m) => {
      const override = storedBy.get(m.key)
      return {
        metric: m.key,
        weight: override?.weight ?? m.defaultWeight,
        isEnabled: override?.isEnabled ?? true,
      }
    })
}

/** Normalised percentage each weight represents, for display in the editor. */
export function weightShares(weights: WeightSetting[]): Map<string, number> {
  const total = weights
    .filter((w) => w.isEnabled && w.weight > 0)
    .reduce((sum, w) => sum + w.weight, 0)

  return new Map(
    weights.map((w) => [
      w.metric,
      total > 0 && w.isEnabled && w.weight > 0 ? (w.weight / total) * 100 : 0,
    ]),
  )
}

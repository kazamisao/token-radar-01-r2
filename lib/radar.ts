// Radar-3 value model for token-radar-01 (round 2).
//
// The question this file answers: if a protocol that records no token today
// issued one tomorrow and the market priced it the way it prices the live
// tokens of its own category, what would that launch be worth, and what
// should a reader do to farm it? Nothing here predicts that a token will
// appear, or when; it is a ranking built only from the sealed snapshot's
// own figures, and every factor of every row is printed on the dashboard
// so a reader can recompute each number by hand.
//
// What changed from the round-1 model, and why:
//   1. Benchmark hygiene. A category multiple is now the median
//      market-cap-per-TVL of the category's live tokens whose own TVL is
//      at least $10,000,000. Round 1 let a $5M-TVL token with a freak
//      ratio (the snapshot holds live ratios up to 69x) into the sample
//      that prices a whole category. The sample count travels with every
//      benchmark, and a category with fewer than three qualifying samples
//      borrows the overall median and says so.
//   2. A wider, honest band. Multiples are clamped to 0.02-2.0 instead of
//      0.05-1.5: round 1's floor lifted one category whose true median is
//      0.006 up eightfold, and its ceiling cut genuinely rich categories.
//   3. Growth is dampened. One week of TVL change is a noisy signal, so it
//      now moves value by half its face: 1 + clamp(change, -40, +80)/200,
//      a 0.80-1.40 band, instead of round 1's full-weight 0.4-2.2 swing
//      that let a single hot week more than double a launch value.
//   4. Seasoning has diminishing returns: +0.07 a year for the first four
//      tokenless years, +0.03 a year for the next three, capped at 1.37.
//   5. Farm plans are written from each protocol's own figures — its TVL
//      sets the budget, its seven-day trend sets the pace, its chain list
//      sets the route, its age and category set the hold — instead of one
//      template per category with the name swapped in.
// No protocol name ever enters the arithmetic: the same rule scores
// every row, and live tokens are only ever benchmarks, never candidates.

export interface SealedProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface SealedSnapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SealedProtocol[];
  watchlist: string[];
}

export interface BoardRow {
  slug: string;
  name: string;
  rank: number;
  implied_value_usd: number;
  farm_steps: string[];
  category: string;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  multiple: number;
  growth: number;
  seasoning: number;
  reach: number;
  trend: string;
  years_tokenless: number | null;
  bench_samples: number;
  bench_fallback: boolean;
  scope: 'watchlist' | 'early';
  listed_at: string | null;
}

export interface CategoryBenchmark {
  category: string;
  live_samples: number;
  median_multiple: number;
  fallback: boolean;
}

export interface LiveReference {
  slug: string;
  name: string;
  category: string;
  tvl_usd: number;
  mcap_usd: number;
  ratio: number;
}

export interface RadarOutput {
  rows: BoardRow[];
  benchmarks: CategoryBenchmark[];
  live: LiveReference[];
  meta: {
    as_of: string;
    floor_usd: number;
    protocols_total: number;
    watchlist_total: number;
    board_total: number;
    early_total: number;
    live_total: number;
    bench_floor_usd: number;
    bench_samples_total: number;
  };
}

/** Live tokens below this TVL never price a category: their ratios are noise. */
export const BENCH_FLOOR_USD = 10_000_000;

/** Categories the radar never ranks as a launch candidate. */
const BLOCKED_CATEGORIES = new Set([
  'Bridge',
  'Canonical Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaked BTC',
  'CEX',
]);

const EXCHANGE_PREFIXES = [
  'Binance',
  'Coinbase',
  'Bybit',
  'Kraken',
  'Bitget',
  'OKX',
  'Bitfinex',
  'Gemini',
];

const VERSION_TAIL = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;

/** The middle value of a sorted list; the average of the two middles when even. */
export function middleValue(values: number[]): number {
  const ordered = [...values].sort((a, b) => a - b);
  const n = ordered.length;
  if (n === 0) return 0;
  if (n % 2 === 1) return ordered[(n - 1) / 2]!;
  return (ordered[n / 2 - 1]! + ordered[n / 2]!) / 2;
}

/** Keep a number inside a band. */
function clampNumber(value: number, low: number, high: number): number {
  if (value < low) return low;
  if (value > high) return high;
  return value;
}

/** A protocol records a token when DefiLlama carries either of its token fields. */
export function recordsToken(p: SealedProtocol): boolean {
  return p.gecko_id !== null || p.symbol !== null;
}

/**
 * Whether a protocol may be ranked as a launch candidate: it records no
 * token, and it is not a wrapped, staked or bridged product, not a
 * versioned re-release, and not an exchange's own product. This is the
 * same rule the snapshot's own watchlist was drawn with, applied here to
 * the protocols below the floor as well.
 */
export function mayLaunch(p: SealedProtocol): boolean {
  if (recordsToken(p)) return false;
  if (p.category !== null && BLOCKED_CATEGORIES.has(p.category)) return false;
  if (VERSION_TAIL.test(p.name)) return false;
  if (WRAPPED_WORD.test(p.name)) return false;
  for (const prefix of EXCHANGE_PREFIXES) {
    if (p.name.startsWith(prefix)) return false;
  }
  return true;
}

/** Whole years a protocol has run with no token recorded, or null when undated. */
export function yearsTokenless(listedAt: string | null, asOf: string): number | null {
  if (listedAt === null) return null;
  const start = Date.parse(`${listedAt}T00:00:00Z`);
  const end = Date.parse(`${asOf}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  return (end - start) / (365.25 * 24 * 60 * 60 * 1000);
}

/**
 * The seven-day TVL change as a multiplier, at half weight: a -40% week
 * maps to 0.80 and a +80% week to 1.40. One week is noise; it should tilt
 * a launch value, never double or halve it.
 */
export function growthFactor(change7d: number | null): number {
  if (change7d === null || !Number.isFinite(change7d)) return 1;
  return 1 + clampNumber(change7d, -40, 80) / 200;
}

/** Seasoning with diminishing returns: strong early, gentle later, capped at 1.37. */
export function seasoningFactor(listedAt: string | null, asOf: string): number {
  const years = yearsTokenless(listedAt, asOf);
  if (years === null) return 1;
  const early = Math.min(years, 4) * 0.07;
  const late = Math.max(0, Math.min(years - 4, 3)) * 0.03;
  return 1 + early + late;
}

/** A little extra per chain beyond the first, capped so breadth never dominates. */
export function reachFactor(chains: string[]): number {
  return 1 + 0.04 * Math.min(Math.max(chains.length - 1, 0), 6);
}

/** A short reader-facing label for a protocol's seven-day TVL direction. */
export function trendLabel(change7d: number | null): string {
  if (change7d === null || !Number.isFinite(change7d)) return 'Unrated';
  if (change7d >= 20) return 'Surging';
  if (change7d >= 5) return 'Rising';
  if (change7d > -5) return 'Steady';
  if (change7d > -20) return 'Fading';
  return 'Falling';
}

interface Bench {
  multiple: number;
  samples: number;
  fallback: boolean;
}

/**
 * The median market-cap-per-TVL for each category, from live tokens with
 * at least BENCH_FLOOR_USD of TVL of their own. A category needs three
 * qualifying samples; below that it borrows the overall median and the
 * benchmark is marked as a fallback. Multiples are clamped to 0.02-2.0.
 */
export function categoryBenchmarks(protocols: SealedProtocol[]): Map<string, Bench> {
  const liveRatios: number[] = [];
  const byCategory = new Map<string, number[]>();
  for (const p of protocols) {
    if (p.mcap_usd === null || p.tvl_usd < BENCH_FLOOR_USD) continue;
    const ratio = p.mcap_usd / p.tvl_usd;
    liveRatios.push(ratio);
    const key = p.category ?? 'Uncategorized';
    const bucket = byCategory.get(key) ?? [];
    bucket.push(ratio);
    byCategory.set(key, bucket);
  }
  const overall = clampNumber(middleValue(liveRatios), 0.02, 2.0);
  const benches = new Map<string, Bench>();
  const categories = new Set(protocols.map((p) => p.category ?? 'Uncategorized'));
  for (const category of categories) {
    const ratios = byCategory.get(category) ?? [];
    if (ratios.length >= 3) {
      benches.set(category, {
        multiple: clampNumber(middleValue(ratios), 0.02, 2.0),
        samples: ratios.length,
        fallback: false,
      });
    } else {
      benches.set(category, { multiple: overall, samples: ratios.length, fallback: true });
    }
  }
  benches.set('__overall__', { multiple: overall, samples: liveRatios.length, fallback: false });
  return benches;
}

/** One category's benchmark, falling back to the overall median entry. */
function benchFor(category: string | null, benches: Map<string, Bench>): Bench {
  const key = category ?? 'Uncategorized';
  return benches.get(key) ?? benches.get('__overall__') ?? { multiple: 0.5, samples: 0, fallback: true };
}

/** The implied launch value of one protocol, with every factor exposed. */
export function impliedValue(
  p: SealedProtocol,
  benches: Map<string, Bench>,
  asOf: string,
): { value: number; multiple: number; growth: number; seasoning: number; reach: number; bench: Bench } {
  const bench = benchFor(p.category, benches);
  const growth = growthFactor(p.change_7d);
  const seasoning = seasoningFactor(p.listed_at, asOf);
  const reach = reachFactor(p.chains);
  const value = Math.max(1, Math.round(p.tvl_usd * bench.multiple * growth * seasoning * reach));
  return { value, multiple: bench.multiple, growth, seasoning, reach, bench };
}

// ---------------------------------------------------------------- farm plans

/** Money with thousands separators, for plan text: 1250000 -> "$1,250,000". */
function dollars(n: number): string {
  return `$${Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
}

/** The working-capital band a reader should bring, scaled to the protocol's own TVL. */
function budgetBand(tvl: number): { low: number; high: number } {
  if (tvl >= 500_000_000) return { low: 250, high: 1000 };
  if (tvl >= 50_000_000) return { low: 100, high: 500 };
  if (tvl >= 10_000_000) return { low: 50, high: 250 };
  return { low: 25, high: 100 };
}

/** How many weeks to stay active, from category and from how long it has run tokenless. */
function holdWeeks(category: string | null, years: number | null): number {
  let weeks = 8;
  switch (category) {
    case 'Dexs':
    case 'Derivatives':
    case 'Options':
      weeks = 6;
      break;
    case 'RWA':
    case 'Launchpad':
      weeks = 10;
      break;
    case 'Lending':
    case 'CDP':
    case 'Yield':
    case 'Yield Aggregator':
      weeks = 8;
      break;
    default:
      weeks = 8;
  }
  if (years !== null && years >= 3) weeks += 2;
  if (years !== null && years < 1) weeks = Math.max(4, weeks - 2);
  return weeks;
}

/** The core on-chain action for a category, written for one protocol. */
function coreAction(category: string | null, name: string, chain: string): string {
  switch (category) {
    case 'Dexs':
      return `Swap through ${name} on ${chain} every week and, if it offers pools, add a modest amount of liquidity to one pair; each swap is one transaction and roughly $0.50-$3 in gas.`;
    case 'Lending':
    case 'CDP':
      return `Supply stablecoins or blue-chip collateral into ${name} on ${chain} and borrow a small amount against it once, so both sides of the market see your activity; the deposit is one transaction, about $1-$5 in gas.`;
    case 'Yield':
    case 'Yield Aggregator':
    case 'Farm':
      return `Deposit into one of ${name}'s vaults or farms on ${chain} and let the yield compound there instead of moving it every day; the deposit is one transaction and about $1-$5 in gas.`;
    case 'Derivatives':
    case 'Options':
      return `Open a small, low-leverage position on ${name} on ${chain}, close part of it after a few days, and repeat with a fresh position the next week; each trade is one transaction and roughly $1-$4 in gas.`;
    case 'RWA':
      return `Take a position in one of ${name}'s tokenised real-world offerings on ${chain} with money you can leave parked, and keep the receipt token in the same wallet; the entry is one transaction and about $1-$5 in gas.`;
    case 'Launchpad':
      return `Stake or lock the amount ${name} asks for on ${chain} to qualify for its launches, then join at least one sale while qualified; qualifying is one transaction and about $1-$5 in gas.`;
    case 'Restaking':
      return `Restake a small amount through ${name} on ${chain} and leave it delegated for the full season rather than moving it between operators; the deposit is one transaction and about $1-$4 in gas.`;
    case 'Liquidity Manager':
      return `Deposit a pair into a managed vault on ${name} on ${chain} and let its rebalancing run, checking the range once a week; the deposit is one transaction and about $1-$5 in gas.`;
    case 'Risk Curators':
      return `Deposit stablecoins or blue-chip assets into one of the vaults ${name} curates on ${chain}, picking a vault whose strategy you can read in one page, and leave the position to compound; the deposit is one transaction and about $1-$5 in gas.`;
    case 'Onchain Capital Allocator':
      return `Allocate a modest amount into one of ${name}'s on-chain strategies on ${chain} and keep it there for a full allocation cycle instead of rotating weekly; the allocation is one transaction and about $1-$5 in gas.`;
    case 'Basis Trading':
      return `Open ${name}'s basis position on ${chain} at a small size - the product pairs a spot leg with a short hedge, so fund both legs it asks for and let the funding accrue; opening is one or two transactions and about $1-$6 in gas.`;
    case 'Prediction Market':
      return `Take small positions on two or three liquid markets on ${name} on ${chain}, sized so a total loss is acceptable, and trade at least once a week; each trade is one transaction and roughly $0.50-$3 in gas.`;
    case 'Staking Pool':
      return `Stake a modest amount through ${name}'s pool on ${chain} and leave it staked for the full period rather than hopping pools; staking is one transaction and about $1-$4 in gas.`;
    case 'Chain':
      return `Become an active user of the ${name} chain itself: bridge a small amount to it, then swap and use one native application every week, since a chain's own token rewards its real users; the bridge is one transaction, about $1-$6 in fees.`;
    default:
      return `Use ${name}'s main product on ${chain} with real funds - deposit, swap or stake, whichever it offers - starting with a modest size you can leave in place; the first transaction costs roughly $1-$5 in gas.`;
  }
}

/** The pace step, written from the protocol's own seven-day trend. */
function paceStep(p: SealedProtocol, weeks: number): string {
  const trend = trendLabel(p.change_7d);
  const change = p.change_7d === null ? 'unreported' : `${p.change_7d > 0 ? '+' : ''}${p.change_7d.toFixed(1)}% in seven days`;
  if (trend === 'Surging' || trend === 'Rising') {
    return `${p.name}'s TVL is ${change}, so front-load the plan: run the core action twice in the first week, then weekly for ${weeks} weeks while the growth lasts; budget about 20 minutes a week.`;
  }
  if (trend === 'Fading' || trend === 'Falling') {
    return `${p.name}'s TVL is ${change}, so start at half size for the first two weeks and only step up to the full budget if TVL stabilises; keep the weekly action going for ${weeks} weeks at about 15 minutes a week.`;
  }
  return `${p.name}'s TVL is ${change}, a steady tape: repeat the core action once a week for ${weeks} weeks, varying the size a little each time so the activity reads as steady use; budget about 15 minutes a week.`;
}

/**
 * Six steps for farming one protocol, each written from that protocol's
 * own figures: its TVL sets the budget, its trend sets the pace, its
 * chains set the route and its age sets the hold. Every step names a
 * cost or a time.
 */
export function farmPlan(p: SealedProtocol, asOf: string): string[] {
  const chain = p.chains[0] ?? 'its main chain';
  const budget = budgetBand(p.tvl_usd);
  const years = yearsTokenless(p.listed_at, asOf);
  const weeks = holdWeeks(p.category, years);
  const ageNote = years === null
    ? 'DefiLlama gives no start date for it, so treat its history as unproven'
    : `it has run ${years.toFixed(1)} years with no token recorded`;
  const steps = [
    `Set up a fresh wallet for ${p.name} and fund it with gas on ${chain} plus ${dollars(budget.low)}-${dollars(budget.high)} of working capital - a size scaled to its ${dollars(p.tvl_usd)} TVL; funding takes about 10 minutes and the first gas costs roughly $0.50-$3.`,
    coreAction(p.category, p.name, chain),
    paceStep(p, weeks),
  ];
  if (p.chains.length > 1) {
    steps.push(
      `In week two, repeat the core action once on ${p.chains[1]} as well: ${p.name} runs on ${p.chains.length} chains, and activity on a second chain is one bridge transaction (about $1-$6 in fees) plus the same action again.`,
    );
  }
  steps.push(
    `Hold the position for the full ${weeks} weeks - ${ageNote}, so a long clean history is exactly what a snapshot would reward - and check any points or quest page every Sunday for about 5 minutes, screenshotting the balance each time.`,
    `Exit or claim with care: a clean exit after ${weeks} weeks costs one transaction, about $1-$5 in gas; if ${p.name} announces a token, verify the claim from its official channels first, never sign a blind approval, and revoke approvals after claiming (claim gas usually $1-$10). Log every hash and date as you go.`,
  );
  return steps;
}

// ---------------------------------------------------------------- the board

/** Parse and lightly validate the sealed snapshot. */
export function loadSealed(raw: string): SealedSnapshot {
  const parsed = JSON.parse(raw) as SealedSnapshot;
  if (!Array.isArray(parsed.protocols) || !Array.isArray(parsed.watchlist)) {
    throw new Error('snapshot: protocols and watchlist must be arrays');
  }
  return parsed;
}

/** A board problem the gate would refuse, or null when the board is sound. */
export function checkBoard(rows: BoardRow[], snapshot: SealedSnapshot): string | null {
  if (rows.length < 100) return `board holds ${rows.length} rows, fewer than the 100 the gate needs`;
  const slugs = new Set(snapshot.protocols.map((p) => p.slug));
  const seen = new Set<string>();
  for (const row of rows) {
    if (!slugs.has(row.slug)) return `board names ${row.slug}, which the snapshot does not list`;
    if (seen.has(row.slug)) return `board names ${row.slug} twice`;
    seen.add(row.slug);
  }
  for (const slug of snapshot.watchlist) {
    if (!seen.has(slug)) return `board misses watchlist protocol ${slug}`;
  }
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    if (row.rank !== i + 1) return `row ${row.slug} carries rank ${row.rank} at position ${i + 1}`;
    if (i > 0 && row.implied_value_usd > rows[i - 1]!.implied_value_usd) {
      return `row ${row.slug} is worth more than the row ranked above it`;
    }
    if (row.farm_steps.length < 3 || row.farm_steps.length > 12) {
      return `row ${row.slug} carries ${row.farm_steps.length} farm steps`;
    }
    for (const step of row.farm_steps) {
      const trimmed = step.trim();
      if (trimmed.length < 20 || trimmed.length > 600) {
        return `row ${row.slug} has a farm step of ${trimmed.length} characters`;
      }
    }
  }
  return null;
}

/** Rank the board: every protocol that may still launch, scored by the one rule. */
export function rankBoard(snapshot: SealedSnapshot): RadarOutput {
  const benches = categoryBenchmarks(snapshot.protocols);
  const watchSet = new Set(snapshot.watchlist);

  const chosen: BoardRow[] = [];
  for (const p of snapshot.protocols) {
    if (!mayLaunch(p)) continue;
    const { value, multiple, growth, seasoning, reach, bench } = impliedValue(p, benches, snapshot.as_of);
    chosen.push({
      slug: p.slug,
      name: p.name,
      rank: 0,
      implied_value_usd: value,
      farm_steps: farmPlan(p, snapshot.as_of),
      category: p.category ?? 'Uncategorized',
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      change_7d: p.change_7d,
      multiple,
      growth,
      seasoning,
      reach,
      trend: trendLabel(p.change_7d),
      years_tokenless: yearsTokenless(p.listed_at, snapshot.as_of),
      bench_samples: bench.samples,
      bench_fallback: bench.fallback,
      scope: watchSet.has(p.slug) ? 'watchlist' : 'early',
      listed_at: p.listed_at,
    });
  }
  chosen.sort((a, b) => b.implied_value_usd - a.implied_value_usd || a.slug.localeCompare(b.slug));

  // Ranks are exactly 1..N and values never rise with rank; a tie is
  // nudged down by a dollar so the order stays strict.
  for (let i = 0; i < chosen.length; i++) {
    const row = chosen[i]!;
    row.rank = i + 1;
    if (i > 0 && row.implied_value_usd >= chosen[i - 1]!.implied_value_usd) {
      row.implied_value_usd = Math.max(1, chosen[i - 1]!.implied_value_usd - 1);
    }
  }

  const benchmarks: CategoryBenchmark[] = [];
  const seenCategories = new Set<string>();
  for (const p of snapshot.protocols) {
    const key = p.category ?? 'Uncategorized';
    if (seenCategories.has(key)) continue;
    seenCategories.add(key);
    const bench = benchFor(key, benches);
    benchmarks.push({
      category: key,
      live_samples: bench.samples,
      median_multiple: Math.round(bench.multiple * 10000) / 10000,
      fallback: bench.fallback,
    });
  }
  benchmarks.sort((a, b) => b.live_samples - a.live_samples || a.category.localeCompare(b.category));

  const live: LiveReference[] = snapshot.protocols
    .filter((p) => p.mcap_usd !== null && p.tvl_usd > 0)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category ?? 'Uncategorized',
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd as number,
      ratio: Math.round(((p.mcap_usd as number) / p.tvl_usd) * 10000) / 10000,
    }))
    .sort((a, b) => b.mcap_usd - a.mcap_usd || a.slug.localeCompare(b.slug))
    .slice(0, 120);

  const overall = benches.get('__overall__')!;
  return {
    rows: chosen,
    benchmarks,
    live,
    meta: {
      as_of: snapshot.as_of,
      floor_usd: snapshot.floor_usd,
      protocols_total: snapshot.protocols.length,
      watchlist_total: snapshot.watchlist.length,
      board_total: chosen.length,
      early_total: chosen.filter((r) => r.scope === 'early').length,
      live_total: snapshot.protocols.filter((p) => recordsToken(p)).length,
      bench_floor_usd: BENCH_FLOOR_USD,
      bench_samples_total: overall.samples,
    },
  };
}

/** The dashboard's data file: the board, the benchmarks and the live-token reference. */
export function emitDataScript(output: RadarOutput): string {
  const payload = {
    meta: output.meta,
    rows: output.rows,
    benchmarks: output.benchmarks,
    live: output.live,
  };
  return `window.RADAR = ${JSON.stringify(payload)};\n`;
}

/** The note the dashboard prints so a reader can check the model by hand. */
export function modelNote(): string {
  return (
    'Implied value = TVL x category multiple (median market-cap-per-TVL of the category\'s live ' +
    'tokens with at least $10M TVL of their own, band 0.02-2.0; a category with fewer than three ' +
    'such tokens borrows the overall median and says so) x growth (seven-day TVL change at half ' +
    'weight, 0.80-1.40) x seasoning (diminishing, up to 1.37 for seven tokenless years) x reach ' +
    '(up to 1.24 across chains). No protocol name enters the arithmetic. A protocol "records no ' +
    'token" when DefiLlama carries no token for it - that is a record, not proof it has none.'
  );
}

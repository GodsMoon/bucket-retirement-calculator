import React, { useMemo, useState, useEffect } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, Area, AreaChart, CartesianGrid } from "recharts";

// ---- Data: S&P 500 Total Returns by Year (TOTAL RETURN = price + dividends), 1946-2025 ----
// Source: Slickcharts — S&P 500 Total Returns by Year (as of 2025-08-14)
// https://www.slickcharts.com/sp500/returns
// NOTE: Y2019 and onward shown on source; we include 1946-2025 to cover an ~80-year span

const TOTAL_RETURNS: { year: number; returnPct: number }[] = [
  { year: 2025, returnPct: 10.84 },
  { year: 2024, returnPct: 25.02 },
  { year: 2023, returnPct: 26.29 },
  { year: 2022, returnPct: -18.11 },
  { year: 2021, returnPct: 28.71 },
  { year: 2020, returnPct: 18.40 },
  { year: 2019, returnPct: 31.49 },
  { year: 2018, returnPct: -4.38 },
  { year: 2017, returnPct: 21.83 },
  { year: 2016, returnPct: 11.96 },
  { year: 2015, returnPct: 1.38 },
  { year: 2014, returnPct: 13.69 },
  { year: 2013, returnPct: 32.39 },
  { year: 2012, returnPct: 16.00 },
  { year: 2011, returnPct: 2.11 },
  { year: 2010, returnPct: 15.06 },
  { year: 2009, returnPct: 26.46 },
  { year: 2008, returnPct: -37.00 },
  { year: 2007, returnPct: 5.49 },
  { year: 2006, returnPct: 15.79 },
  { year: 2005, returnPct: 4.91 },
  { year: 2004, returnPct: 10.88 },
  { year: 2003, returnPct: 28.68 },
  { year: 2002, returnPct: -22.10 },
  { year: 2001, returnPct: -11.89 },
  { year: 2000, returnPct: -9.10 },
  { year: 1999, returnPct: 21.04 },
  { year: 1998, returnPct: 28.58 },
  { year: 1997, returnPct: 33.36 },
  { year: 1996, returnPct: 22.96 },
  { year: 1995, returnPct: 37.58 },
  { year: 1994, returnPct: 1.32 },
  { year: 1993, returnPct: 10.08 },
  { year: 1992, returnPct: 7.62 },
  { year: 1991, returnPct: 30.47 },
  { year: 1990, returnPct: -3.10 },
  { year: 1989, returnPct: 31.69 },
  { year: 1988, returnPct: 16.61 },
  { year: 1987, returnPct: 5.25 },
  { year: 1986, returnPct: 18.67 },
  { year: 1985, returnPct: 31.73 },
  { year: 1984, returnPct: 6.27 },
  { year: 1983, returnPct: 22.56 },
  { year: 1982, returnPct: 21.55 },
  { year: 1981, returnPct: -4.91 },
  { year: 1980, returnPct: 32.42 },
  { year: 1979, returnPct: 18.44 },
  { year: 1978, returnPct: 6.56 },
  { year: 1977, returnPct: -7.18 },
  { year: 1976, returnPct: 23.84 },
  { year: 1975, returnPct: 37.20 },
  { year: 1974, returnPct: -26.47 },
  { year: 1973, returnPct: -14.66 },
  { year: 1972, returnPct: 18.98 },
  { year: 1971, returnPct: 14.31 },
  { year: 1970, returnPct: 4.01 },
  { year: 1969, returnPct: -8.50 },
  { year: 1968, returnPct: 11.06 },
  { year: 1967, returnPct: 23.98 },
  { year: 1966, returnPct: -10.06 },
  { year: 1965, returnPct: 12.45 },
  { year: 1964, returnPct: 16.48 },
  { year: 1963, returnPct: 22.80 },
  { year: 1962, returnPct: -8.73 },
  { year: 1961, returnPct: 26.89 },
  { year: 1960, returnPct: 0.47 },
  { year: 1959, returnPct: 11.96 },
  { year: 1958, returnPct: 43.36 },
  { year: 1957, returnPct: -10.78 },
  { year: 1956, returnPct: 6.56 },
  { year: 1955, returnPct: 31.56 },
  { year: 1954, returnPct: 52.62 },
  { year: 1953, returnPct: -0.99 },
  { year: 1952, returnPct: 18.37 },
  { year: 1951, returnPct: 24.02 },
  { year: 1950, returnPct: 31.71 },
  { year: 1949, returnPct: 18.79 },
  { year: 1948, returnPct: 5.50 },
  { year: 1947, returnPct: 5.71 },
  { year: 1946, returnPct: -8.07 },
];

// Helper: convert percent to multiplier
const pctToMult = (pct: number) => 1 + pct / 100;

// Simulation engine
type RunResult = {
  balances: number[]; // length horizon+1 including year 0
  failedYear: number | null; // first year that ends <= 0 (1-based), else null
};

function simulatePath(
  returns: number[], // multipliers for each year of the horizon
  startBalance: number,
  initialWithdrawalRate: number, // e.g., 0.04
  inflationRate: number, // constant inflation for inflation-adjusted withdrawals
  inflationAdjust: boolean
): RunResult {
  const horizon = returns.length;
  const balances: number[] = new Array(horizon + 1).fill(0);
  let bal = startBalance;
  const baseWithdrawal = startBalance * initialWithdrawalRate;
  balances[0] = bal;
  let failedYear: number | null = null;
  for (let y = 0; y < horizon; y++) {
    const withdrawal = inflationAdjust ? baseWithdrawal * Math.pow(1 + inflationRate, y) : baseWithdrawal;
    bal = bal - withdrawal;
    if (bal <= 0 && failedYear === null) {
      failedYear = y + 1; // first year of failure
      bal = 0;
      balances[y + 1] = 0;
      // continue filling zeros for the remaining years
      for (let k = y + 1; k < horizon; k++) balances[k + 1] = 0;
      break;
    }
    // apply return for the year
    bal = bal * returns[y];
    balances[y + 1] = bal;
  }
  // If never failed, balances filled to end
  return { balances, failedYear };
}

function bootstrapSample<T>(arr: T[], n: number): T[] {
  const out: T[] = [];
  for (let i = 0; i < n; i++) {
    const j = Math.floor(Math.random() * arr.length);
    out.push(arr[j]);
  }
  return out;
}

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Percentile helper
function percentile(values: number[], p: number): number {
  if (values.length === 0) return NaN;
  const sorted = values.slice().sort((a, b) => a - b);
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  const w = idx - lo;
  return sorted[lo] * (1 - w) + sorted[hi] * w;
}

// UI
export default function App() {
  const [startBalance, setStartBalance] = useState(1_000_000);
  const [horizon, setHorizon] = useState(30);
  const [withdrawRate, setWithdrawRate] = useState(4); // % of initial
  const [inflationAdjust, setInflationAdjust] = useState(true);
  const [inflationRate, setInflationRate] = useState(0.02); // 2%
  const [mode, setMode] = useState<"actual-seq" | "actual-seq-random-start" | "random-shuffle" | "bootstrap">("actual-seq");
  const [numRuns, setNumRuns] = useState(1000);
  const [seed, setSeed] = useState<number | "">("");
  const [refreshCounter, setRefreshCounter] = useState(0);
  // Year bounds and start-year state for actual sequence mode
  const minYear = useMemo(() => Math.min(...TOTAL_RETURNS.map(d => d.year)), []);
  const maxYear = useMemo(() => Math.max(...TOTAL_RETURNS.map(d => d.year)), []);
  const [startYear, setStartYear] = useState<number>(minYear);

  // Max start so startYear + horizon - 1 ≤ maxYear
  const maxStartYear = useMemo(() => maxYear - horizon + 1, [maxYear, horizon]);

  // Clamp start year whenever horizon changes
  useEffect(() => {
    if (startYear > maxStartYear) setStartYear(Math.max(minYear, maxStartYear));
    if (startYear < minYear) setStartYear(minYear);
  }, [horizon, minYear, maxStartYear]);

  // Optional seed (not cryptographically strong) so users can reproduce
  useMemo(() => {
    if (seed === "" || typeof seed !== "number") return;
    let s = Math.floor(seed);
    Math.random = (function () {
      // Mulberry32 PRNG
      function mulberry32(a: number) {
        return function () {
          var t = (a += 0x6d2b79f5);
          t = Math.imul(t ^ (t >>> 15), t | 1);
          t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
          return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
      }
      return mulberry32(s);
    })();
  }, [seed]);

  const years = useMemo(() => TOTAL_RETURNS.map(d => d.year).sort((a, b) => a - b), []);
  const availableMultipliers = useMemo(() => TOTAL_RETURNS.map(d => pctToMult(d.returnPct)), []);

  // Build deterministic return sequence for the chosen horizon using ACTUAL order (most recent last)
  const actualSequenceMultipliers = useMemo(() => {
    const sorted = TOTAL_RETURNS.slice().sort((a, b) => a.year - b.year);
    const yearsSorted = sorted.map(d => d.year);
    const mults = sorted.map(d => pctToMult(d.returnPct));

    const startIdx = yearsSorted.indexOf(startYear);
    const out: number[] = [];
    for (let i = 0; i < horizon; i++) {
      out.push(mults[startIdx + i]); // safe because we clamp startYear
    }
    return out;
  }, [horizon, startYear]);

  // Build sequences that start at random years but proceed chronologically
  const randomStartSequenceMultipliers = useMemo(() => {
    // Use the returns in chronological order from earliest to latest
    const multipliersChrono = TOTAL_RETURNS.slice().sort((a, b) => a.year - b.year).map(d => pctToMult(d.returnPct));
    const totalYears = multipliersChrono.length;

    // For Monte Carlo, generate multiple sequences with different starting points
    const sequences: number[][] = [];
    const runsToGenerate = mode === "actual-seq-random-start" ? numRuns : 0;

    for (let run = 0; run < runsToGenerate; run++) {
      // Pick a random starting year
      const startIdx = Math.floor(Math.random() * totalYears);
      const seq: number[] = [];

      // Generate sequence of required horizon length
      for (let i = 0; i < horizon; i++) {
        // Calculate the actual index with wrapping
        const idx = (startIdx + i) % totalYears;
        seq.push(multipliersChrono[idx]);
      }

      sequences.push(seq);
    }

    return sequences;
  }, [horizon, numRuns, mode, refreshCounter]);

  const sims = useMemo(() => {
    const initW = withdrawRate / 100;
    const runs: RunResult[] = [];
    const multipliers = availableMultipliers;

    if (mode === "actual-seq") {
      const seq = actualSequenceMultipliers.slice(0, horizon);
      runs.push(
        simulatePath(seq, startBalance, initW, inflationRate, inflationAdjust)
      );
    } else if (mode === "actual-seq-random-start") {
      // Use the pre-generated sequences with random starting years
      for (const seq of randomStartSequenceMultipliers) {
        runs.push(
          simulatePath(seq, startBalance, initW, inflationRate, inflationAdjust)
        );
      }
    } else if (mode === "random-shuffle") {
      for (let r = 0; r < numRuns; r++) {
        const seq = shuffle(multipliers).slice(0, horizon);
        runs.push(
          simulatePath(seq, startBalance, initW, inflationRate, inflationAdjust)
        );
      }
    } else if (mode === "bootstrap") {
      for (let r = 0; r < numRuns; r++) {
        const seq = bootstrapSample(multipliers, horizon);
        runs.push(
          simulatePath(seq, startBalance, initW, inflationRate, inflationAdjust)
        );
      }
    }

    return runs;
  }, [mode, numRuns, availableMultipliers, horizon, startBalance, withdrawRate, inflationRate, inflationAdjust, actualSequenceMultipliers, randomStartSequenceMultipliers, refreshCounter]);

  const stats = useMemo(() => {
    if (sims.length === 0) return null;
    const horizonYears = horizon;

    const endingBalances = sims.map(s => s.balances[s.balances.length - 1]);
    const successCount = sims.filter(s => s.failedYear === null).length;
    const successRate = successCount / sims.length;

    // Percentile bands across years
    const bands: { year: number; p10: number; p25: number; p50: number; p75: number; p90: number; }[] = [];
    for (let t = 0; t <= horizonYears; t++) {
      const balT = sims.map(s => s.balances[t]);
      bands.push({
        year: t,
        p10: percentile(balT, 0.10),
        p25: percentile(balT, 0.25),
        p50: percentile(balT, 0.50),
        p75: percentile(balT, 0.75),
        p90: percentile(balT, 0.90),
      });
    }

    return { successRate, endingBalances, bands };
  }, [sims, horizon]);

  const sampleRun = sims[0];

  const currency = new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <header className="flex items-center justify-between">
          <h1 className="text-2xl md:text-3xl font-bold">4% Rule Tester — 100% SPY (Total Return), Monte Carlo</h1>
          <div className="text-sm text-slate-600">Data: S&P 500 total return, 1946–2025</div>
        </header>

        <section className="grid md:grid-cols-3 gap-4">
          <div className="bg-white rounded-2xl shadow p-4 space-y-3">
            <h2 className="font-semibold">Inputs</h2>
            <label className="block text-sm">Starting balance
              <input type="number" className="mt-1 w-full border rounded-xl p-2" value={startBalance} onChange={e => setStartBalance(Number(e.target.value))} />
            </label>
            <label className="block text-sm">Horizon (years)
              <input type="number" className="mt-1 w-full border rounded-xl p-2" value={horizon} onChange={e => setHorizon(Math.max(1, Number(e.target.value)))} />
            </label>
            <label className="block text-sm">Withdrawal rate (% of initial)
              <input type="number" className="mt-1 w-full border rounded-xl p-2" value={withdrawRate} step={0.1} onChange={e => setWithdrawRate(Number(e.target.value))} />
            </label>
            <div className="flex items-center gap-2">
              <input id="infl" type="checkbox" checked={inflationAdjust} onChange={e => setInflationAdjust(e.target.checked)} />
              <label htmlFor="infl" className="text-sm">Inflation-adjust withdrawals</label>
            </div>
            <label className="block text-sm">Inflation rate (if adjusted)
              <input type="number" className="mt-1 w-full border rounded-xl p-2" value={inflationRate} step={0.005} onChange={e => setInflationRate(Number(e.target.value))} />
            </label>
          </div>

          <div className="bg-white rounded-2xl shadow p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Simulation Mode</h2>
              <button
                className="text-lg hover:bg-slate-100 rounded-full w-8 h-8 flex items-center justify-center transition-colors"
                onClick={() => setRefreshCounter(prev => prev + 1)}
                aria-label="Refresh simulation"
                title="Refresh simulation"
              >
                ⟳
              </button>
            </div>
            <div className="space-y-2 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="mode"
                  checked={mode === 'actual-seq'}
                  onChange={() => setMode('actual-seq')}
                />
                <span>Actual sequence (start year)</span>
                <input
                  type="number"
                  className="ml-2 w-24 border rounded-xl p-1 disabled:opacity-50"
                  value={startYear}
                  min={minYear}
                  max={maxStartYear}
                  disabled={mode !== 'actual-seq'}
                  onChange={(e) => {
                    const y = Number(e.target.value);
                    const clamped = Math.min(Math.max(y, minYear), maxStartYear);
                    setStartYear(clamped);
                  }}
                  title={`Valid range: ${minYear}–${maxStartYear}`}
                />
              </label>
              <div className="text-xs text-slate-500 pl-6">
                Max start year for current horizon: {maxStartYear}
              </div>
              <label className="flex items-center gap-2">
                <input type="radio" name="mode" checked={mode === 'actual-seq-random-start'} onChange={() => setMode('actual-seq-random-start')} />
                Actual sequence (randomize start year)
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" name="mode" checked={mode === 'random-shuffle'} onChange={() => setMode('random-shuffle')} />
                Random shuffle of historical years
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" name="mode" checked={mode === 'bootstrap'} onChange={() => setMode('bootstrap')} />
                Bootstrap (sample with replacement)
              </label>
            </div>
            {(mode === 'actual-seq-random-start' || mode === 'random-shuffle' || mode === 'bootstrap') && (
              <>
                <label className="block text-sm"># Monte Carlo runs
                  <input type="number" className="mt-1 w-full border rounded-xl p-2" value={numRuns} onChange={e => setNumRuns(Math.max(1, Number(e.target.value)))} />
                </label>
                <label className="block text-sm">Seed (optional)
                  <input type="number" className="mt-1 w-full border rounded-xl p-2" value={seed} onChange={e => setSeed(e.target.value === '' ? '' : Number(e.target.value))} />
                </label>
              </>
            )}
          </div>

          <div className="bg-white rounded-2xl shadow p-4 space-y-3">
            <h2 className="font-semibold">Results</h2>
            {stats && (
              <div className="space-y-2 text-sm">
                <div>Success rate: <span className="font-semibold">{(stats.successRate * 100).toFixed(1)}%</span> ({sims.length} run{sims.length !== 1 ? 's' : ''})</div>
                <div>Median ending balance: <span className="font-semibold">{currency.format(percentile(stats.endingBalances, 0.5))}</span></div>
                <div>10th–90th percentile ending: {currency.format(percentile(stats.endingBalances, 0.10))} – {currency.format(percentile(stats.endingBalances, 0.90))}</div>
              </div>
            )}
            {sampleRun && (
              <div className="text-xs text-slate-600">First failure year (sample run): {sampleRun.failedYear ?? 'none'}</div>
            )}
          </div>
        </section>

        <section className="bg-white rounded-2xl shadow p-4">
          <h2 className="font-semibold mb-2">Portfolio Trajectory Bands</h2>
          {stats && (
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={stats.bands.map(b => ({ year: b.year, p10: b.p10, p25: b.p25, p50: b.p50, p75: b.p75, p90: b.p90 }))} margin={{ left: 32, right: 8, top: 8, bottom: 24 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="year" tickFormatter={(t) => `${t}`} label={{ value: "Years", position: "insideBottom", offset: -2 }} />
                  <YAxis tickFormatter={(v) => (v >= 1 ? (currency.format(v)) : v.toFixed(2))} />
                  <Tooltip formatter={(v: any) => typeof v === 'number' ? currency.format(v) : v} itemSorter={(item) => { return (item.value as number) * -1; }} />
                  <Legend />
                  <Area type="monotone" dataKey="p90" name="90th %ile" fillOpacity={0.15} stroke="#245" fill="#245" />
                  <Area type="monotone" dataKey="p75" name="75th %ile" fillOpacity={0.15} stroke="#468" fill="#468" />
                  <Area type="monotone" dataKey="p50" name="50th %ile" fillOpacity={0.15} stroke="#68a" fill="#68a" />
                  <Area type="monotone" dataKey="p25" name="25th %ile" fillOpacity={0.15} stroke="#8ac" fill="#8ac" />
                  <Area type="monotone" dataKey="p10" name="10th %ile" fillOpacity={0.15} stroke="#acd" fill="#acd" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>

        <section className="bg-white rounded-2xl shadow p-4">
          <h2 className="font-semibold mb-2">Sample Run Trajectory</h2>
          {sampleRun && (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={sampleRun.balances.map((b, i) => ({ year: i, balance: b }))} margin={{ left: 32, right: 8, top: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="year" />
                  <YAxis tickFormatter={(v) => currency.format(v as number)} />
                  <Tooltip formatter={(v: any) => typeof v === 'number' ? currency.format(v) : v} />
                  <Line type="monotone" dataKey="balance" name="Balance" dot={false} strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>

        <footer className="text-xs text-slate-600">
          <div>Assumptions: 100% SPY proxy via S&P 500 total return series; withdrawals occur at the start of each year; returns applied end-of-year; no taxes/fees. "Random shuffle" preserves the empirical distribution but breaks temporal clusters; "Bootstrap" samples years with replacement (classic Monte Carlo). For inflation- adjusted 4% rule, the withdrawal is 4% of initial and then grown by the chosen inflation rate.</div>
          <div className="mt-1">Data source: Slickcharts S&P 500 Total Returns (accessed Aug 15, 2025).</div>
        </footer>
      </div>
    </div>
  );
}

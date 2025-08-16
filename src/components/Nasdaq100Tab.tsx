import React, { useMemo } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, Area, AreaChart, CartesianGrid } from "recharts";

// NASDAQ 100 (QQQ) Total Returns by Year, 1986-2025
const QQQ_RETURNS: { year: number; returnPct: number }[] = [
  { year: 2025, returnPct: 13.42 },
  { year: 2024, returnPct: 24.88 },
  { year: 2023, returnPct: 53.81 },
  { year: 2022, returnPct: -32.97 },
  { year: 2021, returnPct: 26.63 },
  { year: 2020, returnPct: 47.58 },
  { year: 2019, returnPct: 37.96 },
  { year: 2018, returnPct: -1.04 },
  { year: 2017, returnPct: 31.52 },
  { year: 2016, returnPct: 5.89 },
  { year: 2015, returnPct: 8.43 },
  { year: 2014, returnPct: 17.94 },
  { year: 2013, returnPct: 34.99 },
  { year: 2012, returnPct: 16.82 },
  { year: 2011, returnPct: 2.70 },
  { year: 2010, returnPct: 19.22 },
  { year: 2009, returnPct: 53.54 },
  { year: 2008, returnPct: -41.89 },
  { year: 2007, returnPct: 18.67 },
  { year: 2006, returnPct: 6.79 },
  { year: 2005, returnPct: 1.49 },
  { year: 2004, returnPct: 10.44 },
  { year: 2003, returnPct: 49.12 },
  { year: 2002, returnPct: -37.58 },
  { year: 2001, returnPct: -32.65 },
  { year: 2000, returnPct: -36.84 },
  { year: 1999, returnPct: 101.95 },
  { year: 1998, returnPct: 85.31 },
  { year: 1997, returnPct: 20.63 },
  { year: 1996, returnPct: 42.54 },
  { year: 1995, returnPct: 42.54 },
  { year: 1994, returnPct: 1.50 },
  { year: 1993, returnPct: 10.58 },
  { year: 1992, returnPct: 8.87 },
  { year: 1991, returnPct: 64.99 },
  { year: 1990, returnPct: -10.41 },
  { year: 1989, returnPct: 26.17 },
  { year: 1988, returnPct: 13.54 },
  { year: 1987, returnPct: 10.50 },
  { year: 1986, returnPct: 6.89 },
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

interface NasdaqTabProps {
  startBalance: number;
  horizon: number;
  withdrawRate: number;
  initialWithdrawalAmount: number;
  inflationAdjust: boolean;
  inflationRate: number;
  mode: "actual-seq" | "actual-seq-random-start" | "random-shuffle" | "bootstrap";
  numRuns: number;
  seed: number | "";
  startYear: number;
  onRefresh: () => void;
  onParamChange: (param: string, value: any) => void;
  refreshCounter: number;
}

const Nasdaq100Tab: React.FC<NasdaqTabProps> = ({
  startBalance,
  horizon,
  withdrawRate,
  initialWithdrawalAmount,
  inflationAdjust,
  inflationRate,
  mode,
  numRuns,
  seed,
  startYear,
  onRefresh,
  onParamChange,
  refreshCounter
}) => {
  const years = useMemo(() => QQQ_RETURNS.map(d => d.year).sort((a, b) => a - b), []);
  const availableMultipliers = useMemo(() => QQQ_RETURNS.map(d => pctToMult(d.returnPct)), []);

  // Build deterministic return sequence for the chosen horizon using ACTUAL order (most recent last)
  const actualSequenceMultipliers = useMemo(() => {
    const sorted = QQQ_RETURNS.slice().sort((a, b) => a.year - b.year);
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
    const multipliersChrono = QQQ_RETURNS.slice().sort((a, b) => a.year - b.year).map(d => pctToMult(d.returnPct));
    const totalYears = multipliersChrono.length;

    const sequences: number[][] = [];
    const runsToGenerate = mode === "actual-seq-random-start" ? numRuns : 0;

    for (let run = 0; run < runsToGenerate; run++) {
      const startIdx = Math.floor(Math.random() * totalYears);
      const seq: number[] = [];

      for (let i = 0; i < horizon; i++) {
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
    <div className="space-y-6">
      <div className="text-sm text-slate-600">Data: NASDAQ 100 (QQQ) total return, 1986–2025</div>

      <section className="grid md:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl shadow p-4 space-y-3">
          <h2 className="font-semibold">Inputs</h2>
          <label className="block text-sm">Starting balance
            <input type="number" className="mt-1 w-full border rounded-xl p-2" value={startBalance} step={10000} onChange={e => onParamChange('startBalance', Number(e.target.value))} />
          </label>
          <label className="block text-sm">Horizon (years)
            <input type="number" className="mt-1 w-full border rounded-xl p-2" value={horizon} onChange={e => onParamChange('horizon', Math.max(1, Number(e.target.value)))} />
          </label>
          <h3 className="font-semibold">Withdraw Rate:</h3>
          <div className="flex gap-4">
          <label className="block text-sm flex-1">% of initial
            <input type="number" className="mt-1 w-full border rounded-xl p-2" value={withdrawRate} step={0.1} onChange={e => onParamChange('withdrawRate', Number(e.target.value))} />
          </label>
          <label className="block text-sm flex-1">Initial $
            <input type="number" className="mt-1 w-full border rounded-xl p-2" value={initialWithdrawalAmount} step={1000} onChange={e => onParamChange('initialWithdrawalAmount', Number(e.target.value))} />
          </label>
          </div>
          <div className="flex items-center gap-2">
            <input id="infl" type="checkbox" checked={inflationAdjust} onChange={e => onParamChange('inflationAdjust', e.target.checked)} />
            <label htmlFor="infl" className="text-sm">Inflation-adjust withdrawals</label>
          </div>
          <label className="block text-sm">Inflation rate (if adjusted)
            <input type="number" className="mt-1 w-full border rounded-xl p-2" value={inflationRate} step={0.005} onChange={e => onParamChange('inflationRate', Number(e.target.value))} />
          </label>
        </div>

        <div className="bg-white rounded-2xl shadow p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Simulation Mode</h2>
            <button
              className="text-lg hover:bg-slate-100 rounded-full w-8 h-8 flex items-center justify-center transition-colors"
              onClick={onRefresh}
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
                onChange={() => onParamChange('mode', 'actual-seq')}
              />
              <span>Actual sequence (start year)</span>
              <input
                type="number"
                className="ml-2 w-24 border rounded-xl p-1 disabled:opacity-50"
                value={startYear}
                min={Math.min(...years)}
                max={Math.max(...years) - horizon + 1}
                disabled={mode !== 'actual-seq'}
                onChange={(e) => {
                  const y = Number(e.target.value);
                  const minYear = Math.min(...years);
                  const maxYear = Math.max(...years);
                  const clamped = Math.min(Math.max(y, minYear), maxYear - horizon + 1);
                  onParamChange('startYear', clamped);
                }}
              />
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" name="mode" checked={mode === 'actual-seq-random-start'} onChange={() => onParamChange('mode', 'actual-seq-random-start')} />
              Actual sequence (randomize start year)
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" name="mode" checked={mode === 'random-shuffle'} onChange={() => onParamChange('mode', 'random-shuffle')} />
              Random shuffle of historical years
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" name="mode" checked={mode === 'bootstrap'} onChange={() => onParamChange('mode', 'bootstrap')} />
              Bootstrap (sample with replacement)
            </label>
          </div>
          {(mode === 'actual-seq-random-start' || mode === 'random-shuffle' || mode === 'bootstrap') && (
            <>
              <label className="block text-sm"># Monte Carlo runs
                <input type="number" className="mt-1 w-full border rounded-xl p-2" value={numRuns} onChange={e => onParamChange('numRuns', Math.max(1, Number(e.target.value)))} />
              </label>
              <label className="block text-sm">Seed (optional)
                <input type="number" className="mt-1 w-full border rounded-xl p-2" value={seed} onChange={e => onParamChange('seed', e.target.value === '' ? '' : Number(e.target.value))} />
              </label>
            </>
          )}
        </div>

        <div className="bg-white rounded-2xl shadow p-4 space-y-3">
          <h2 className="font-semibold">Results</h2>
          {stats && (
            <div className="space-y-2 text-sm">
              <div>1st year withdrawal: <span className="font-semibold">{currency.format(initialWithdrawalAmount)}</span></div>
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
        <div>Assumptions: 100% QQQ proxy via NASDAQ 100 total return series; withdrawals occur at the start of each year; returns applied end-of-year; no taxes/fees. "Random shuffle" preserves the empirical distribution but breaks temporal clusters; "Bootstrap" samples years with replacement (classic Monte Carlo). For inflation- adjusted 4% rule, the withdrawal is 4% of initial and then grown by the chosen inflation rate.</div>
        <div className="mt-1">Data source: NASDAQ 100 Total Returns (1986-2025).</div>
      </footer>
    </div>
  );
};

export default Nasdaq100Tab;
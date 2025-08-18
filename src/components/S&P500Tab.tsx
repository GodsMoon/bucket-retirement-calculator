import React, { useMemo } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, Area, AreaChart, CartesianGrid } from "recharts";
import { SP500_TOTAL_RETURNS } from "../data/returns";
import { pctToMult, bootstrapSample, shuffle, percentile, calculateDrawdownStats } from "../lib/simulation";
import type { RunResult } from "../lib/simulation";

function simulatePath(
  returns: number[], // multipliers for each year of the horizon
  startBalance: number,
  initialWithdrawalRate: number, // e.g., 0.04
  inflationRate: number, // constant inflation for inflation-adjusted withdrawals
  inflationAdjust: boolean
): RunResult {
  const horizon = returns.length;
  const balances: number[] = new Array(horizon + 1).fill(0);
  const withdrawals: number[] = new Array(horizon).fill(0);
  let bal = startBalance;
  const baseWithdrawal = startBalance * initialWithdrawalRate;
  balances[0] = bal;
  let failedYear: number | null = null;
  for (let y = 0; y < horizon; y++) {
    const withdrawal = inflationAdjust ? baseWithdrawal * Math.pow(1 + inflationRate, y) : baseWithdrawal;
    withdrawals[y] = withdrawal;
    bal = bal - withdrawal;
    if (bal <= 0 && failedYear === null) {
      failedYear = y + 1; // first year of failure
      bal = 0;
      balances[y + 1] = 0;
      // continue filling zeros for the remaining years
      for (let k = y + 1; k < horizon; k++) {
        balances[k + 1] = 0;
        withdrawals[k] = 0;
      }
      break;
    }
    // apply return for the year
    bal = bal * returns[y];
    balances[y + 1] = bal;
  }
  // If never failed, balances filled to end
  return { balances, failedYear, withdrawals };
}

interface SPTabProps {
  startBalance: number;
  horizon: number;
  withdrawRate: number;
  initialWithdrawalAmount: number;
  isInitialAmountLocked: boolean;
  inflationAdjust: boolean;
  inflationRate: number;
  mode: "actual-seq" | "actual-seq-random-start" | "random-shuffle" | "bootstrap";
  numRuns: number;
  seed: number | "";
  startYear: number;
  onRefresh: () => void;
  onParamChange: (param: string, value: string | number | boolean) => void;
  setIsInitialAmountLocked: (value: React.SetStateAction<boolean>) => void;
  refreshCounter: number;
}

const SPTab: React.FC<SPTabProps> = ({
  startBalance,
  horizon,
  withdrawRate,
  initialWithdrawalAmount,
  isInitialAmountLocked,
  inflationAdjust,
  inflationRate,
  mode,
  numRuns,
  seed,
  startYear,
  onRefresh,
  onParamChange,
  setIsInitialAmountLocked,
  refreshCounter,
}) => {
  const years = useMemo(() => SP500_TOTAL_RETURNS.map(d => d.year).sort((a, b) => a - b), []);
  const availableMultipliers = useMemo(() => SP500_TOTAL_RETURNS.map(d => pctToMult(d.returnPct)), []);

  // Build deterministic return sequence for the chosen horizon using ACTUAL order (most recent last)
  const actualSequenceMultipliers = useMemo(() => {
    const sorted = SP500_TOTAL_RETURNS.slice().sort((a, b) => a.year - b.year);
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
    const multipliersChrono = SP500_TOTAL_RETURNS.slice().sort((a, b) => a.year - b.year).map(d => pctToMult(d.returnPct));
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, numRuns, availableMultipliers, horizon, startBalance, withdrawRate, inflationRate, inflationAdjust, actualSequenceMultipliers, randomStartSequenceMultipliers, refreshCounter]);

  const stats = useMemo(() => {
    if (sims.length === 0) return null;
    const horizonYears = horizon;

    const endingBalances = sims.map(s => s.balances[s.balances.length - 1]);
    const successCount = sims.filter(s => s.failedYear === null).length;
    const successRate = successCount / sims.length;
    const drawdownStats = calculateDrawdownStats(sims);

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

    const medianFifthYearWithdrawal = horizon >= 5 ? percentile(sims.map(s => s.withdrawals[4]), 0.5) : 0;

    return { successRate, endingBalances, bands, ...drawdownStats, medianFifthYearWithdrawal };
  }, [sims, horizon]);

  const sampleRun = sims[0];
  const currency = new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });

  return (
    <div className="space-y-6">
      <div className="text-sm text-slate-600 dark:text-slate-400">Data: S&P 500 total return, 1946–2025</div>

      <section className="grid md:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow p-4 space-y-3">
          <h2 className="font-semibold">Inputs</h2>
          <label className="block text-sm">Starting balance
            <input type="number" className="mt-1 w-full border rounded-xl p-2 bg-white dark:bg-slate-700 dark:border-slate-600" value={startBalance} step={10000} onChange={e => onParamChange('startBalance', Number(e.target.value))} />
          </label>
          <label className="block text-sm">Horizon (years)
            <input type="number" className="mt-1 w-full border rounded-xl p-2 bg-white dark:bg-slate-700 dark:border-slate-600" value={horizon} onChange={e => onParamChange('horizon', Math.max(1, Number(e.target.value)))} />
          </label>
          <h3 className="font-semibold">Starting Withdrawal Rate:</h3>
          <div className="flex gap-4">
            <label className="block text-sm pt-2 flex-1">% of Starting Portfolio
              <input type="number" className="mt-1 w-3/4 border rounded-xl p-2 bg-white dark:bg-slate-700 dark:border-slate-600" value={withdrawRate} step={0.01} onChange={e => onParamChange('withdrawRate', Number(e.target.value))} />
              <span className="ml-2">%</span>
            </label>
            <span className="mt-1 ">=</span>
            <div className={`flex-1 p-2 rounded-lg ${isInitialAmountLocked ? 'bg-green-100 dark:bg-green-900' : ''}`}>
              <label className="block text-sm flex-1">First Widthdraw</label>
              <div className="flex items-center mt-1">
                <input
                  type="number"
                  className={`w-full border rounded-xl p-2 transition-colors bg-white dark:bg-slate-700 dark:border-slate-600 ${isInitialAmountLocked ? 'text-green-800 dark:text-green-200 font-semibold' : ''}`}
                  value={Math.round(initialWithdrawalAmount)}
                  step={1000}
                  onChange={e => onParamChange('initialWithdrawalAmount', Number(e.target.value))} />
                <button
                  className={`ml-2 text-xl p-1 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors ${isInitialAmountLocked ? 'opacity-100' : 'opacity-50'}`}
                  onClick={() => setIsInitialAmountLocked(prev => !prev)}
                  title={isInitialAmountLocked ? "Unlock initial withdrawal amount" : "Lock initial withdrawal amount"}
                >
                  {isInitialAmountLocked ? '🔒' : '🔓'}
                </button>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input id="infl" type="checkbox" checked={inflationAdjust} onChange={e => onParamChange('inflationAdjust', e.target.checked)} />
            <label htmlFor="infl" className="text-sm">Inflation-adjust withdrawals</label>
          </div>
          <label className="block text-sm">Assumed Inflation Rate
            <div className="flex items-center mt-1">
              <input type="number" className="w-1/3 border rounded-xl p-2 bg-white dark:bg-slate-700 dark:border-slate-600" value={Math.round(inflationRate * 400) / 4} step={0.25} onChange={e => onParamChange('inflationRate', parseFloat(e.target.value) / 100)} />
              <span className="ml-2">%</span>
            </div>
          </label>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Simulation Mode</h2>
            <button
              className="text-lg hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full w-8 h-8 flex items-center justify-center transition-colors"
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
                className="ml-2 w-24 border rounded-xl p-1 disabled:opacity-50 bg-white dark:bg-slate-700 dark:border-slate-600"
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
                <input type="number" className="mt-1 w-full border rounded-xl p-2 bg-white dark:bg-slate-700 dark:border-slate-600" value={numRuns} onChange={e => onParamChange('numRuns', Math.max(1, Number(e.target.value)))} />
              </label>
              <label className="block text-sm">Seed (optional)
                <input type="number" className="mt-1 w-full border rounded-xl p-2 bg-white dark:bg-slate-700 dark:border-slate-600" value={seed} onChange={e => onParamChange('seed', e.target.value === '' ? '' : Number(e.target.value))} />
              </label>
            </>
          )}
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow p-4 space-y-3">
          <h2 className="font-semibold">Results</h2>
          {stats && (
            <div className="space-y-2 text-sm">
              <div>1st year withdrawal: <span className="font-semibold">{currency.format(initialWithdrawalAmount)}</span></div>
              {horizon >= 5 && <div>5th year median withdrawal: <span className="font-semibold">{currency.format(stats.medianFifthYearWithdrawal)}</span></div>}
              <div>Success rate: <span className="font-semibold">{(stats.successRate * 100).toFixed(1)}%</span> ({sims.length} run{sims.length !== 1 ? 's' : ''})</div>
              <div>Median ending balance: <span className="font-semibold">{currency.format(percentile(stats.endingBalances, 0.5))}</span></div>
              <div>10th–90th percentile ending: {currency.format(percentile(stats.endingBalances, 0.10))} – {currency.format(percentile(stats.endingBalances, 0.90))}</div>
              <div className="border-t pt-2 mt-2">
                <div>Median Drawdown: <span className="font-semibold">{(stats.medianDrawdown * 100).toFixed(1)}%</span></div>
                <div>Median Low Point: <span className="font-semibold">{currency.format(stats.medianLowPoint)}</span></div>
                <div>Max Drawdown: <span className="font-semibold">{(stats.maxDrawdown * 100).toFixed(1)}%</span></div>
                <div>Worst Low Point: <span className="font-semibold">{currency.format(stats.worstLowPoint)}</span></div>
              </div>
            </div>
          )}
          {sampleRun && (
            <div className="text-xs text-slate-600 dark:text-slate-400">First failure year (sample run): {sampleRun.failedYear ?? 'none'}</div>
          )}
        </div>
      </section>

      <section className="bg-white dark:bg-slate-800 rounded-2xl shadow p-4">
        <div className="flex items-center justify-between">
            <h2 className="font-semibold mb-2">Portfolio Trajectory Bands</h2>
            <button
              className="text-lg hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full w-8 h-8 flex items-center justify-center transition-colors"
              onClick={onRefresh}
              aria-label="Refresh simulation"
              title="Refresh simulation"
            >
              ⟳
            </button>
          </div>
        {stats && (
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={stats.bands.map(b => ({ year: b.year, p10: b.p10, p25: b.p25, p50: b.p50, p75: b.p75, p90: b.p90 }))} margin={{ left: 32, right: 8, top: 8, bottom: 24 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="year" tickFormatter={(t) => `${t}`} label={{ value: "Years", position: "insideBottom", offset: -2 }} />
                <YAxis tickFormatter={(v: number) => (v >= 1 ? (currency.format(v)) : v.toFixed(2))} />
                <Tooltip formatter={(v: number) => typeof v === 'number' ? currency.format(v) : v} itemSorter={(item) => { return (item.value as number) * -1; }} />
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

      <section className="bg-white dark:bg-slate-800 rounded-2xl shadow p-4">
        <div className="flex items-center justify-between">
            <h2 className="font-semibold mb-2">Sample Run Trajectory</h2>
            <button
              className="text-lg hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full w-8 h-8 flex items-center justify-center transition-colors"
              onClick={onRefresh}
              aria-label="Refresh simulation"
              title="Refresh simulation"
            >
              ⟳
            </button>
          </div>
        {sampleRun && (
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={sampleRun.balances.map((b, i) => ({
                  year: i,
                  balance: b,
                  withdrawal: sampleRun.withdrawals[i],
                }))}
                margin={{ left: 32, right: 8, top: 8, bottom: 8 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="year" />
                <YAxis yAxisId="left" tickFormatter={(v) => currency.format(v as number)} />
                <YAxis yAxisId="right" orientation="right" tickFormatter={(v) => currency.format(v as number)} />
                <Tooltip
                  formatter={(value: number, name: string) => {
                    return [`${currency.format(value)}`, name];
                  }}
                  itemSorter={(item) => (item.dataKey === "balance" ? -1 : 1)}
                />
                <Legend />
                <Line type="monotone" dataKey="balance" yAxisId="left" name="Balance" dot={false} strokeWidth={2} stroke="#8884d8" />
                <Line type="monotone" dataKey="withdrawal" yAxisId="right" name="Withdrawal" dot={false} strokeWidth={2} stroke="#82ca9d" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      <footer className="text-xs text-slate-600 dark:text-slate-400">
        <div>Assumptions: 100% SPY proxy via S&P 500 total return series; withdrawals occur at the start of each year; returns applied end-of-year; no taxes/fees. "Random shuffle" preserves the empirical distribution but breaks temporal clusters; "Bootstrap" samples years with replacement (classic Monte Carlo). For inflation- adjusted 4% rule, the withdrawal is 4% of initial and then grown by the chosen inflation rate.</div>
        <div className="mt-1">Data source: Slickcharts S&P 500 Total Returns (accessed Aug 15, 2025).</div>
      </footer>
    </div>
  );
};

export default SPTab;

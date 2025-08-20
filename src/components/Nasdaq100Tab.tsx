import React, { useMemo } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, Area, AreaChart, CartesianGrid } from "recharts";
import { NASDAQ100_TOTAL_RETURNS } from "../data/returns";
import { pctToMult, bootstrapSample, shuffle, percentile, calculateDrawdownStats } from "../lib/simulation";
import type { RunResult } from "../lib/simulation";
import CurrencyInput from "./CurrencyInput";
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

interface NasdaqTabProps {
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
  chartStates: Record<string, ChartState>;
  toggleMinimize: (chartId: string) => void;
}

const Nasdaq100Tab: React.FC<NasdaqTabProps> = ({
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
  chartStates,
  toggleMinimize,
  chartOrder,
}) => {
  const years = useMemo(() => NASDAQ100_TOTAL_RETURNS.map(d => d.year).sort((a, b) => a - b), []);
  const availableMultipliers = useMemo(() => NASDAQ100_TOTAL_RETURNS.map(d => pctToMult(d.returnPct)), []);

  const sims = useMemo(() => {
    const initW = withdrawRate / 100;
    const runs: RunResult[] = [];
    const multipliers = availableMultipliers; // unsorted
    const sortedReturns = NASDAQ100_TOTAL_RETURNS.slice().sort((a, b) => a.year - b.year);
    const multipliersChrono = sortedReturns.map(d => pctToMult(d.returnPct));
    const yearsSorted = sortedReturns.map(d => d.year);

    const numSimRuns = mode === 'actual-seq' ? 1 : numRuns;

    for (let r = 0; r < numSimRuns; r++) {
      let seq: number[] = [];
      if (mode === 'actual-seq') {
        let startIdx = yearsSorted.indexOf(startYear);
        if (startIdx === -1) startIdx = 0;
        seq = multipliersChrono.slice(startIdx, startIdx + horizon);
      } else if (mode === 'actual-seq-random-start') {
        const startIdx = Math.floor(Math.random() * multipliersChrono.length);
        seq = Array.from({ length: horizon }, (_, i) => multipliersChrono[(startIdx + i) % multipliersChrono.length]);
      } else if (mode === "random-shuffle") {
        const shuffled = shuffle(multipliers);
        seq = Array.from({ length: horizon }, (_, i) => shuffled[i % shuffled.length]);
      } else if (mode === "bootstrap") {
        seq = bootstrapSample(multipliers, horizon);
      }
      if (seq.length > 0) {
        runs.push(simulatePath(seq, startBalance, initW, inflationRate, inflationAdjust));
      }
    }
    return runs;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, numRuns, availableMultipliers, horizon, startBalance, withdrawRate, inflationRate, inflationAdjust, startYear, refreshCounter]);

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

  const charts: Record<string, React.ReactNode> = {
    'nasdaq100-trajectory': (
      <Chart
        title="Portfolio Trajectory Bands"
        onRefresh={onRefresh}
        onMinimize={() => toggleMinimize('nasdaq100-trajectory')}
        minimizable={chartStates['nasdaq100-trajectory'].minimizable}
      >
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
      </Chart>
    ),
    'nasdaq100-sample': (
      <Chart
        title="Sample Run Trajectory"
        onRefresh={onRefresh}
        onMinimize={() => toggleMinimize('nasdaq100-sample')}
        minimizable={chartStates['nasdaq100-sample'].minimizable}
      >
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
      </Chart>
    ),
  };

  return (
    <div className="space-y-6">
      <div className="text-sm text-slate-600 dark:text-slate-400">Data: NASDAQ 100 (QQQ) total return, 1986–2025</div>

      <div className="grid md:grid-cols-3 gap-4 auto-rows-fr">
        {chartOrder.filter(id => ['nasdaq100-inputs', 'nasdaq100-sim-mode', 'nasdaq100-results'].includes(id)).map(chartId => (
          !chartStates[chartId].minimized &&
          <div key={chartId}>
            {charts[chartId]}
          </div>
        ))}
      </div>

      <MinimizedChartsBar chartStates={chartStates} onRestore={toggleMinimize} />

      <div className="space-y-6">
        {chartOrder.filter(id => !['nasdaq100-inputs', 'nasdaq100-sim-mode', 'nasdaq100-results'].includes(id)).map(chartId => (
          !chartStates[chartId].minimized &&
          <div key={chartId}>
            {charts[chartId]}
          </div>
        ))}
      </div>

      <footer className="text-xs text-slate-600 dark:text-slate-400">
        <div>Assumptions: 100% QQQ proxy via NASDAQ 100 total return series; withdrawals occur at the start of each year; returns applied end-of-year; no taxes/fees. "Random shuffle" preserves the empirical distribution but breaks temporal clusters; "Bootstrap" samples years with replacement (classic Monte Carlo). For inflation- adjusted 4% rule, the withdrawal is 4% of initial and then grown by the chosen inflation rate.</div>
        <div className="mt-1">Data source: NASDAQ 100 Total Returns (1986-2025).</div>
      </footer>
    </div>
  );
};

export default Nasdaq100Tab;
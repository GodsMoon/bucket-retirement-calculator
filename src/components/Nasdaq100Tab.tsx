import React, { useMemo, useEffect, useRef } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, Area, AreaChart, CartesianGrid } from "recharts";
import { LayoutGroup, motion } from "framer-motion";
import { useData } from "../data/DataContext";
import { pctToMult, bootstrapSample, shuffle, percentile, calculateDrawdownStats } from "../lib/simulation";
import { generateInflationSequence } from "../lib/inflation";
import type { RunResult } from "../lib/simulation";
import CurrencyInput from "./CurrencyInput";
import NumericInput from "./NumericInput";
import Chart, { type ChartProps } from "./Chart";
import type { ChartState } from "../App";
import MinimizedChartsBar from "./MinimizedChartsBar";

function simulatePath(
  returns: number[], // multipliers for each year of the horizon
  startBalance: number,
  initialWithdrawalRate: number, // e.g., 0.04
  inflationRate: number, // constant inflation for inflation-adjusted withdrawals
  inflationAdjust: boolean,
  inflationRates?: number[],
): RunResult {
  const horizon = returns.length;
  const balances: number[] = new Array(horizon + 1).fill(0);
  const withdrawals: number[] = new Array(horizon).fill(0);
  let bal = startBalance;
  const baseWithdrawal = startBalance * initialWithdrawalRate;
  let withdrawalAmount = baseWithdrawal;
  balances[0] = bal;
  let failedYear: number | null = null;
  for (let y = 0; y < horizon; y++) {
    const withdrawal = inflationAdjust ? withdrawalAmount : baseWithdrawal;
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
    if (inflationAdjust) {
      const rate = inflationRates ? inflationRates[y] : inflationRate;
      withdrawalAmount *= (1 + rate);
    }
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
  useHistoricalInflation: boolean;
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
  toggleSize: (chartId: string) => void;
  chartOrder: string[];
  onReorderChartOrder?: (newOrder: string[]) => void;
}

const Nasdaq100Tab: React.FC<NasdaqTabProps> = ({
  startBalance,
  horizon,
  withdrawRate,
  initialWithdrawalAmount,
  isInitialAmountLocked,
  inflationAdjust,
  inflationRate,
  useHistoricalInflation,
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
  toggleSize,
  chartOrder,
  onReorderChartOrder,
}) => {
  const { nasdaq100, inflation } = useData();
  const years = useMemo(() => nasdaq100.map(d => d.year).sort((a, b) => a - b), [nasdaq100]);
  const availableMultipliers = useMemo(() => nasdaq100.map(d => pctToMult(d.returnPct)), [nasdaq100]);
  const inflationSorted = useMemo(() => inflation.slice().sort((a, b) => a.year - b.year), [inflation]);
  const inflationYears = useMemo(() => inflationSorted.map(d => d.year), [inflationSorted]);
  const inflationRatesChrono = useMemo(() => inflationSorted.map(d => d.inflationPct / 100), [inflationSorted]);
  const availableInflationRates = useMemo(() => inflation.map(d => d.inflationPct / 100), [inflation]);
  const effectiveInflationRate = useHistoricalInflation ? 0 : inflationRate;

  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const id = setTimeout(onRefresh, 100);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startBalance, horizon, withdrawRate, effectiveInflationRate, inflationAdjust, mode, numRuns, seed, startYear, useHistoricalInflation]);

  const sims = useMemo(() => {
    const initW = withdrawRate / 100;
    const runs: RunResult[] = [];
    const multipliers = availableMultipliers; // unsorted
    const sortedReturns = nasdaq100.slice().sort((a, b) => a.year - b.year);
    const multipliersChrono = sortedReturns.map(d => pctToMult(d.returnPct));
    const yearsSorted = sortedReturns.map(d => d.year);

    const numSimRuns = mode === 'actual-seq' ? 1 : numRuns;

    for (let r = 0; r < numSimRuns; r++) {
      let seq: number[] = [];
      let yearSampleForInflation: number[] | undefined;
      if (mode === 'actual-seq') {
        let startIdx = yearsSorted.indexOf(startYear);
        if (startIdx === -1) startIdx = 0;
        seq = multipliersChrono.slice(startIdx, startIdx + horizon);
        yearSampleForInflation = yearsSorted.slice(startIdx, startIdx + horizon);
      } else if (mode === 'actual-seq-random-start') {
        const startIdx = Math.floor(Math.random() * multipliersChrono.length);
        seq = Array.from({ length: horizon }, (_, i) => multipliersChrono[(startIdx + i) % multipliersChrono.length]);
        yearSampleForInflation = Array.from({ length: horizon }, (_, i) => yearsSorted[(startIdx + i) % yearsSorted.length]);
      } else if (mode === "random-shuffle") {
        const shuffled = shuffle(multipliers);
        seq = Array.from({ length: horizon }, (_, i) => shuffled[i % shuffled.length]);
      } else if (mode === "bootstrap") {
        seq = bootstrapSample(multipliers, horizon);
      }
      if (seq.length > 0) {
        let inflSeq: number[] | undefined;
        if (useHistoricalInflation) {
          inflSeq = generateInflationSequence(
            mode,
            horizon,
            startYear,
            inflationYears,
            inflationRatesChrono,
            availableInflationRates,
            yearSampleForInflation,
          );
        }
        runs.push(simulatePath(seq, startBalance, initW, inflationRate, inflationAdjust, inflSeq));
      }
    }
    return runs;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableMultipliers, nasdaq100, refreshCounter, useHistoricalInflation, inflation]);

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

    // Build median run (balances and withdrawals)
    const medianRun = {
      balances: [] as number[],
      withdrawals: [] as number[],
    };
    for (let t = 0; t <= horizon; t++) {
      medianRun.balances.push(percentile(sims.map(s => s.balances[t]), 0.5));
      if (t < horizon) {
        medianRun.withdrawals.push(percentile(sims.map(s => s.withdrawals[t]), 0.5));
      }
    }

    const medianFifthYearWithdrawal = horizon >= 5 ? percentile(sims.map(s => s.withdrawals[4]), 0.5) : 0;

    return { successRate, endingBalances, bands, ...drawdownStats, medianFifthYearWithdrawal, medianRun };
  }, [sims, horizon]);

  const sampleRun = sims[0];
  const currency = useMemo(() => new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 }), []);

  const charts: Record<string, React.ReactElement<ChartProps>> = useMemo(() => ({
    'nasdaq100-trajectory': (
      <Chart
        chartId="nasdaq100-trajectory"
        title="Portfolio Trajectory Bands"
        onRefresh={onRefresh}
        onMinimize={() => toggleMinimize('nasdaq100-trajectory')}
        onToggleSize={() => toggleSize('nasdaq100-trajectory')}
        onDragStart={() => setDraggingId('nasdaq100-trajectory')}
        onDragEnd={() => { setDraggingId(null); setOverId(null); }}
        size={chartStates['nasdaq100-trajectory']?.size ?? 'half'}
        minimizable={true}
      >
        {stats && (
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={stats.bands.map(b => ({ year: b.year, p10: b.p10, p25: b.p25, p50: b.p50, p75: b.p75, p90: b.p90 }))} margin={{ left: 32, right: 8, top: 8, bottom: 24 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="year" tickFormatter={(t) => `${t}`} label={{ value: "Years", position: "insideBottom", offset: -2 }} />
                <YAxis tickFormatter={(v: number) => (v >= 1 ? currency.format(v) : v.toFixed(2))} />
                <Tooltip
                  formatter={(v: number) => (typeof v === 'number' ? currency.format(v) : v)}
                  itemSorter={(item: { value?: number }) => { return (item.value ?? 0) * -1; }}
                />
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
    'nasdaq100-median-trajectory': (
      <Chart
        chartId="nasdaq100-median-trajectory"
        title="Median Sample Run Trajectory"
        onRefresh={onRefresh}
        onMinimize={() => toggleMinimize('nasdaq100-median-trajectory')}
        onToggleSize={() => toggleSize('nasdaq100-median-trajectory')}
        onDragStart={() => setDraggingId('nasdaq100-median-trajectory')}
        onDragEnd={() => { setDraggingId(null); setOverId(null); }}
        size={chartStates['nasdaq100-median-trajectory']?.size ?? 'half'}
        minimizable={true}
      >
        {stats?.medianRun && (
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={stats.medianRun.balances.map((b, i) => ({
                  year: i,
                  balance: b,
                  withdrawal: stats.medianRun.withdrawals[i],
                }))}
                margin={{ left: 32, right: 8, top: 8, bottom: 8 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="year" />
                <YAxis yAxisId="left" tickFormatter={(v: number) => currency.format(v)} />
                <YAxis yAxisId="right" orientation="right" tickFormatter={(v: number) => currency.format(v)} />
                <Tooltip
                  formatter={(value: number, name: string) => {
                    return [`${currency.format(value)}`, name];
                  }}
                  itemSorter={(item) => (item.dataKey === "balance" ? -1 : 1)}
                />
                <Legend />
                <Line type="monotone" dataKey="balance" yAxisId="left" name="Total Balance" dot={false} strokeWidth={2} stroke="#8884d8" />
                <Line type="monotone" dataKey="withdrawal" yAxisId="right" name="Withdrawal" dot={false} strokeWidth={2} stroke="#82ca9d" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </Chart>
    ),
    'nasdaq100-sample': (
      <Chart
        chartId="nasdaq100-sample"
        title="Sample Run Trajectory"
        onRefresh={onRefresh}
        onMinimize={() => toggleMinimize('nasdaq100-sample')}
        onToggleSize={() => toggleSize('nasdaq100-sample')}
        onDragStart={() => setDraggingId('nasdaq100-sample')}
        onDragEnd={() => { setDraggingId(null); setOverId(null); }}
        size={chartStates['nasdaq100-sample']?.size ?? 'half'}
        minimizable={true}
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
                <YAxis yAxisId="left" tickFormatter={(v: number) => currency.format(v)} />
                <YAxis yAxisId="right" orientation="right" tickFormatter={(v: number) => currency.format(v)} />
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
    ...[2, 3, 4, 5].reduce((acc, i) => {
      const run = sims[i - 1];
      if (!run) return acc;
      acc[`nasdaq100-sample-${i}-trajectory`] = (
        <Chart
          chartId={`nasdaq100-sample-${i}-trajectory`}
          title={`Sample Run ${i} Trajectory`}
          onRefresh={onRefresh}
          onMinimize={() => toggleMinimize(`nasdaq100-sample-${i}-trajectory`)}
          onToggleSize={() => toggleSize(`nasdaq100-sample-${i}-trajectory`)}
          onDragStart={() => setDraggingId(`nasdaq100-sample-${i}-trajectory`)}
          onDragEnd={() => { setDraggingId(null); setOverId(null); }}
          size={chartStates[`nasdaq100-sample-${i}-trajectory`]?.size ?? 'half'}
          minimizable={true}
        >
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={run.balances.map((b, idx) => ({
                  year: idx,
                  balance: b,
                  withdrawal: run.withdrawals[idx],
                }))}
                margin={{ left: 32, right: 8, top: 8, bottom: 8 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="year" />
                <YAxis yAxisId="left" tickFormatter={(v: number) => currency.format(v)} />
                <YAxis yAxisId="right" orientation="right" tickFormatter={(v: number) => currency.format(v)} />
                <Tooltip
                  formatter={(value: number, name: string) => {
                    return [`${currency.format(value)}`, name];
                  }}
                  itemSorter={(item) => (item.dataKey === "balance" ? -1 : 1)}
                />
                <Legend />
                <Line type="monotone" dataKey="balance" yAxisId="left" name="Total Balance" dot={false} strokeWidth={2} stroke="#8884d8" />
                <Line type="monotone" dataKey="withdrawal" yAxisId="right" name="Withdrawal" dot={false} strokeWidth={2} stroke="#82ca9d" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Chart>
      );
      return acc;
    }, {} as Record<string, React.ReactElement<ChartProps>>),
  }), [chartStates, onRefresh, toggleMinimize, toggleSize, stats, sims, currency, sampleRun]);

  const [draggingId, setDraggingId] = React.useState<string | null>(null);
  const [overId, setOverId] = React.useState<string | null>(null);

  const handleSwap = (targetId: string, sourceId: string) => {
    if (!onReorderChartOrder) return;
    if (!sourceId || sourceId === targetId) return;
    const current = chartOrder.slice();
    const srcIdx = current.indexOf(sourceId);
    const tgtIdx = current.indexOf(targetId);
    if (srcIdx === -1 || tgtIdx === -1) return;
    const tmp = current[srcIdx];
    current[srcIdx] = current[tgtIdx];
    current[tgtIdx] = tmp;
    onReorderChartOrder(current);
  };

  const handleDropAtEnd = (sourceId: string) => {
    if (!onReorderChartOrder) return;
    const current = chartOrder.slice().filter(id => id !== sourceId);
    current.push(sourceId);
    onReorderChartOrder(current);
  };

  return (
    <div className="space-y-6">
      <div className="text-sm text-slate-600 dark:text-slate-400">Data: NASDAQ 100 (QQQ) total return, 1986–2025</div>

        <section className="grid md:grid-cols-3 gap-4 auto-rows-fr">
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow p-4 space-y-3">
                <h2 className="font-semibold">Inputs</h2>
                <label className="block text-sm">Starting balance
                    <CurrencyInput className="mt-1 w-full border rounded-xl p-2 bg-white dark:bg-slate-700 dark:border-slate-600" value={startBalance} step={10000} onChange={v => onParamChange('startBalance', v)} />
                </label>
                <label className="block text-sm">Horizon (years)
                    <NumericInput
                      className="mt-1 w-full border rounded-xl p-2 bg-white dark:bg-slate-700 dark:border-slate-600"
                      value={horizon}
                      step={1}
                      min={1}
                      onChange={(v) => onParamChange('horizon', Math.max(1, Math.round(v)))}
                    />
                </label>
                <h3 className="font-semibold">Starting Withdrawal Rate:</h3>

                <div className="flex gap-4">
                    <label className="block text-sm pt-2 flex-1">First Withdrawal (%)
                        <div className="mt-1 inline-flex items-center">
                          <NumericInput
                            className="w-28 border rounded-xl p-2 bg-white dark:bg-slate-700 dark:border-slate-600"
                            value={withdrawRate}
                            step={0.01}
                            precision={2}
                            onChange={(v) => onParamChange('withdrawRate', v)}
                          />
                          <span className="ml-2">%</span>
                        </div>
                    </label>
                    <div className={`flex-1 p-2 rounded-lg ${isInitialAmountLocked ? 'bg-green-100 dark:bg-green-900' : ''}`}>
                        <label className="block text-sm flex-1">First Withdrawal ($)</label>
                        <div className="flex items-center mt-1">
                            <CurrencyInput
                                className={`w-full border rounded-xl p-2 transition-colors bg-white dark:bg-slate-700 dark:border-slate-600 ${isInitialAmountLocked ? 'text-green-800 dark:text-green-200 font-semibold' : ''}`}
                                value={Math.round(initialWithdrawalAmount)}
                                step={1000}
                                onChange={v => onParamChange('initialWithdrawalAmount', v)} />
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
                <label className="block text-sm">
                    <span className={`${useHistoricalInflation ? 'text-slate-500 dark:text-slate-400' : ''}`}>Assumed Inflation Rate</span>
                    <div className="flex items-center mt-1" aria-disabled={useHistoricalInflation}>
                        <NumericInput
                          className="w-20 border rounded-xl p-2 bg-white dark:bg-slate-700 dark:border-slate-600"
                          value={Math.round(inflationRate * 400) / 4}
                          step={0.25}
                          onChange={(v) => onParamChange('inflationRate', v / 100)}
                          disabled={useHistoricalInflation}
                        />
                        <span className="ml-2">%</span>
                        <label className="ml-4 flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={useHistoricalInflation}
                            onChange={e => onParamChange('useHistoricalInflation', e.target.checked)}
                          />
                          <span className="text-sm">Use Historical Inflation</span>
                        </label>
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
                <div className="text-xs text-slate-500">
                    Years: {Math.min(...years)}–{Math.max(...years)} (<a href="#data" className="text-blue-600 dark:text-blue-400 underline">Data</a>)
                </div>
                <div className="space-y-2 text-sm">
                    <label className="flex items-center gap-2">
                        <input type="radio" name="mode" checked={mode === 'actual-seq-random-start'} onChange={() => onParamChange('mode', 'actual-seq-random-start')} />
                        Actual sequence (randomize start year)
                    </label>
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

      <MinimizedChartsBar chartStates={chartStates} onRestore={toggleMinimize} activeTab="nasdaq100" />

      <LayoutGroup>
        <div className="grid md:grid-cols-2 gap-6">
          {chartOrder.map((chartId: string) => (
            charts[chartId] && !(chartStates[chartId]?.minimized) && (
              <motion.div
                key={chartId}
                layout
                transition={{ duration: 0.33 }}
                className={`${((chartStates[chartId]?.size ?? 'half') === 'full') ? 'md:col-span-2' : ''} relative transition-transform ${draggingId && overId === chartId ? 'scale-110 z-10' : ''}`}
                data-chart-id={chartId}
                onDragOver={(e) => {
                  if (!draggingId) return;
                  e.preventDefault();
                  setOverId(chartId);
                }}
                onDragLeave={() => {
                  setOverId(prev => (prev === chartId ? null : prev));
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  const src = e.dataTransfer.getData('text/plain');
                  handleSwap(chartId, src);
                  setDraggingId(null);
                  setOverId(null);
                }}
              >
                {draggingId && (
                  <div className="pointer-events-none absolute inset-0 rounded-2xl border-4 border-dashed border-blue-400 flex items-center justify-center bg-slate-900/70 dark:bg-white/70">
                    <span className="px-2 py-1 rounded-md bg-white/90 dark:bg-slate-900/90 text-slate-900 dark:text-slate-100 shadow">Drop Here</span>
                  </div>
                )}
                {charts[chartId]}
              </motion.div>
            )
          ))}
          {draggingId && (
            <div
              className="h-24 rounded-2xl bg-slate-900/70 dark:bg-white/70 flex items-center justify-center text-xs font-semibold transform scale-110 border-4 border-dashed border-blue-400"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const src = e.dataTransfer.getData('text/plain');
                handleDropAtEnd(src);
                setDraggingId(null);
                setOverId(null);
              }}
            >
              <span className="px-2 py-1 rounded-md bg-white/90 dark:bg-slate-900/90 text-slate-900 dark:text-slate-100 shadow">Drop Here</span>
            </div>
          )}
        </div>
      </LayoutGroup>

      <footer className="text-xs text-slate-600 dark:text-slate-400">
        <div>Assumptions: 100% QQQ proxy via NASDAQ 100 total return series; withdrawals occur at the start of each year; returns applied end-of-year; no taxes/fees. "Random shuffle" preserves the empirical distribution but breaks temporal clusters; "Bootstrap" samples years with replacement (classic Monte Carlo). For inflation- adjusted 4% rule, the withdrawal is 4% of initial and then grown by the chosen inflation rate.</div>
        <div className="mt-1">Data source: NASDAQ 100 Total Returns (1986-2025).</div>
      </footer>
    </div>
  );
};

export default Nasdaq100Tab;

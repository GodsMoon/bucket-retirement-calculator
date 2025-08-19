import React, { useMemo } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, Area, AreaChart, CartesianGrid } from "recharts";
import type { DrawdownStrategy } from "../App";
import { SP500_TOTAL_RETURNS, NASDAQ100_TOTAL_RETURNS } from "../data/returns";
import { TEN_YEAR_TREASURY_TOTAL_RETURNS } from "../data/bonds";
import { pctToMult, bootstrapSample, shuffle, percentile, calculateDrawdownStats } from "../lib/simulation";

// ... (imports)

// Custom RunResult for portfolio simulation
type PortfolioRunResult = {
  balances: { total: number; cash: number; spy: number; qqq: number; bonds: number }[];
  failedYear: number | null;
  withdrawals: number[];
};

function simulatePortfolioPath(
  spyReturns: number[],
  qqqReturns: number[],
  bondReturns: number[],
  initialCash: number,
  initialSpy: number,
  initialQqq: number,
  initialBonds: number,
  horizon: number,
  initialWithdrawalRate: number,
  inflationRate: number,
  inflationAdjust: boolean,
  drawdownStrategy: DrawdownStrategy
): PortfolioRunResult {
  const balances = new Array(horizon + 1).fill(0).map(() => ({ total: 0, cash: 0, spy: 0, qqq: 0, bonds: 0 }));
  const withdrawals: number[] = new Array(horizon).fill(0);
  let cash = initialCash;
  let spy = initialSpy;
  let qqq = initialQqq;
  let bonds = initialBonds;
  const startBalance = initialCash + initialSpy + initialQqq + initialBonds;
  const baseWithdrawal = startBalance * initialWithdrawalRate;

  balances[0] = { total: startBalance, cash, spy, qqq, bonds };
  let failedYear: number | null = null;

  for (let y = 0; y < horizon; y++) {
    let withdrawalAmount = inflationAdjust ? baseWithdrawal * Math.pow(1 + inflationRate, y) : baseWithdrawal;
    withdrawals[y] = withdrawalAmount;

    const fromCash = Math.min(withdrawalAmount, cash);
    cash -= fromCash;
    withdrawalAmount -= fromCash;

    if (withdrawalAmount > 0) {
      if (drawdownStrategy === 'cashFirst_spyThenQqq') {
        const fromSpy = Math.min(withdrawalAmount, spy);
        spy -= fromSpy;
        withdrawalAmount -= fromSpy;
        if (withdrawalAmount > 0) {
          const fromQqq = Math.min(withdrawalAmount, qqq);
          qqq -= fromQqq;
          withdrawalAmount -= fromQqq;
        }
        if (withdrawalAmount > 0) {
          const fromBonds = Math.min(withdrawalAmount, bonds);
          bonds -= fromBonds;
          withdrawalAmount -= fromBonds;
        }
      } else if (drawdownStrategy === 'cashFirst_qqqThenSpy') {
        const fromQqq = Math.min(withdrawalAmount, qqq);
        qqq -= fromQqq;
        withdrawalAmount -= fromQqq;
        if (withdrawalAmount > 0) {
          const fromSpy = Math.min(withdrawalAmount, spy);
          spy -= fromSpy;
          withdrawalAmount -= fromSpy;
        }
        if (withdrawalAmount > 0) {
          const fromBonds = Math.min(withdrawalAmount, bonds);
          bonds -= fromBonds;
          withdrawalAmount -= fromBonds;
        }
      } else if (drawdownStrategy === 'cashFirst_equalParts') {
        const part = withdrawalAmount / 3;
        const fromSpy = Math.min(part, spy);
        spy -= fromSpy;
        withdrawalAmount -= fromSpy;
        const fromQqq = Math.min(part, qqq);
        qqq -= fromQqq;
        withdrawalAmount -= fromQqq;
        const fromBonds = Math.min(part, bonds);
        bonds -= fromBonds;
        withdrawalAmount -= fromBonds;
        if (withdrawalAmount > 0) {
          const addSpy = Math.min(withdrawalAmount, spy);
          spy -= addSpy;
          withdrawalAmount -= addSpy;
        }
        if (withdrawalAmount > 0) {
          const addQqq = Math.min(withdrawalAmount, qqq);
          qqq -= addQqq;
          withdrawalAmount -= addQqq;
        }
        if (withdrawalAmount > 0) {
          const addBonds = Math.min(withdrawalAmount, bonds);
          bonds -= addBonds;
          withdrawalAmount -= addBonds;
        }
      } else if (drawdownStrategy === 'cashFirst_bestPerformer') {
        const perf = [
          { key: 'spy', ret: spyReturns[y], bal: spy },
          { key: 'qqq', ret: qqqReturns[y], bal: qqq },
          { key: 'bonds', ret: bondReturns[y], bal: bonds },
        ].sort((a, b) => b.ret - a.ret);
        for (const p of perf) {
          if (withdrawalAmount <= 0) break;
          const take = Math.min(withdrawalAmount, p.bal);
          if (p.key === 'spy') spy -= take;
          else if (p.key === 'qqq') qqq -= take;
          else bonds -= take;
          withdrawalAmount -= take;
        }
      } else if (drawdownStrategy === 'cashFirst_worstPerformer') {
        const perf = [
          { key: 'spy', ret: spyReturns[y], bal: spy },
          { key: 'qqq', ret: qqqReturns[y], bal: qqq },
          { key: 'bonds', ret: bondReturns[y], bal: bonds },
        ].sort((a, b) => a.ret - b.ret);
        for (const p of perf) {
          if (withdrawalAmount <= 0) break;
          const take = Math.min(withdrawalAmount, p.bal);
          if (p.key === 'spy') spy -= take;
          else if (p.key === 'qqq') qqq -= take;
          else bonds -= take;
          withdrawalAmount -= take;
        }
      }
    }

    const totalBeforeGrowth = cash + spy + qqq + bonds;
    if (totalBeforeGrowth <= 0 && failedYear === null) {
      failedYear = y + 1;
      balances[y + 1] = { total: 0, cash: 0, spy: 0, qqq: 0, bonds: 0 };
      continue;
    }

    spy *= spyReturns[y];
    qqq *= qqqReturns[y];
    bonds *= bondReturns[y];

    const totalAfterGrowth = cash + spy + qqq + bonds;
    balances[y + 1] = { total: totalAfterGrowth, cash, spy, qqq, bonds };
  }

  return { balances, failedYear, withdrawals };
}


interface PortfolioTabProps {
  startBalance: number;
  cash: number;
  spy: number;
  qqq: number;
  bonds: number;
  drawdownStrategy: DrawdownStrategy;
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

const PortfolioTab: React.FC<PortfolioTabProps> = ({
  startBalance,
  cash,
  spy,
  qqq,
  bonds,
  drawdownStrategy,
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
  const currency = new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });

  const years = useMemo(() => {
    const spyYears = new Set(SP500_TOTAL_RETURNS.map(d => d.year));
    const qqqYears = new Set(NASDAQ100_TOTAL_RETURNS.map(d => d.year));
    const bondYears = new Set(TEN_YEAR_TREASURY_TOTAL_RETURNS.map(d => d.year));
    return Array.from(spyYears).filter(y => qqqYears.has(y) && bondYears.has(y)).sort((a, b) => a - b);
  }, []);

  const returnsByYear = useMemo(() => {
    const map = new Map<number, { spy: number; qqq: number; bonds: number }>();
    const spyReturnsMap = new Map(SP500_TOTAL_RETURNS.map(d => [d.year, pctToMult(d.returnPct)]));
    const qqqReturnsMap = new Map(NASDAQ100_TOTAL_RETURNS.map(d => [d.year, pctToMult(d.returnPct)]));
    const bondReturnsMap = new Map(TEN_YEAR_TREASURY_TOTAL_RETURNS.map(d => [d.year, pctToMult(d.returnPct)]));
    for (const year of years) {
      map.set(year, {
        spy: spyReturnsMap.get(year)!,
        qqq: qqqReturnsMap.get(year)!,
        bonds: bondReturnsMap.get(year)!,
      });
    }
    return map;
  }, [years]);

  const sims = useMemo(() => {
    const runs: PortfolioRunResult[] = [];
    const initialW = initialWithdrawalAmount / startBalance;

    if (mode === "actual-seq") {
      let startIdx = years.indexOf(startYear);
      if (startIdx === -1) startIdx = 0;
      const yearSample = years.slice(startIdx, startIdx + horizon);
      const spyReturns = yearSample.map(y => returnsByYear.get(y)!.spy);
      const qqqReturns = yearSample.map(y => returnsByYear.get(y)!.qqq);
      const bondReturns = yearSample.map(y => returnsByYear.get(y)!.bonds);
      runs.push(simulatePortfolioPath(spyReturns, qqqReturns, bondReturns, cash, spy, qqq, bonds, horizon, initialW, inflationRate, inflationAdjust, drawdownStrategy));
    } else {
      // Monte Carlo modes
      for (let i = 0; i < numRuns; i++) {
        let yearSample: number[] = [];
        if (mode === 'bootstrap') {
          yearSample = bootstrapSample(years, horizon);
        } else if (mode === 'random-shuffle') {
          const shuffled = shuffle(years);
          yearSample = Array.from({ length: horizon }, (_, j) => shuffled[j % shuffled.length]);
        } else if (mode === 'actual-seq-random-start') {
          const startIdx = Math.floor(Math.random() * years.length);
          yearSample = Array.from({ length: horizon }, (_, j) => years[(startIdx + j) % years.length]);
        }
        const spyReturns = yearSample.map(y => returnsByYear.get(y)!.spy);
        const qqqReturns = yearSample.map(y => returnsByYear.get(y)!.qqq);
        const bondReturns = yearSample.map(y => returnsByYear.get(y)!.bonds);
        runs.push(simulatePortfolioPath(spyReturns, qqqReturns, bondReturns, cash, spy, qqq, bonds, horizon, initialW, inflationRate, inflationAdjust, drawdownStrategy));
      }
    }
    return runs;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cash, spy, qqq, bonds, horizon, initialWithdrawalAmount, inflationRate, inflationAdjust, drawdownStrategy, mode, numRuns, startYear, returnsByYear, startBalance, years, refreshCounter]);


  const stats = useMemo(() => {
    if (sims.length === 0) return null;
    const successCount = sims.filter(s => s.failedYear === null).length;
    const successRate = successCount / sims.length;
    const endingBalances = sims.map(s => s.balances[horizon].total);

    const drawdownStats = calculateDrawdownStats(sims.map(s => ({
      ...s,
      balances: s.balances.map(b => b.total),
      withdrawals: s.withdrawals,
    })));

    const bands: { year: number; p10: number; p25: number; p50: number; p75: number; p90: number; }[] = [];
    for (let t = 0; t <= horizon; t++) {
      const balT = sims.map(s => s.balances[t].total);
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

  return (
    <div className="space-y-6">
      <div className="text-sm text-slate-600 dark:text-slate-400">Data: S&P 500, NASDAQ 100, and 10-year Treasury total return</div>

      <section className="grid md:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow p-4 space-y-3">
          <h2 className="font-semibold">Inputs</h2>
          <h3 className="font-semibold">Portfolio Allocation:</h3>
          <label className="block text-sm">Cash
            <input type="number" className="mt-1 w-full border rounded-xl p-2 bg-white dark:bg-slate-700 dark:border-slate-600" value={cash} step={10000} onChange={e => onParamChange('cash', Number(e.target.value))} />
          </label>
          <label className="block text-sm">SPY (S&P 500)
            <input type="number" className="mt-1 w-full border rounded-xl p-2 bg-white dark:bg-slate-700 dark:border-slate-600" value={spy} step={10000} onChange={e => onParamChange('spy', Number(e.target.value))} />
          </label>
          <label className="block text-sm">QQQ (NASDAQ 100)
            <input type="number" className="mt-1 w-full border rounded-xl p-2 bg-white dark:bg-slate-700 dark:border-slate-600" value={qqq} step={10000} onChange={e => onParamChange('qqq', Number(e.target.value))} />
          </label>
          <label className="block text-sm">Bonds (10Y Treasury)
            <input type="number" className="mt-1 w-full border rounded-xl p-2 bg-white dark:bg-slate-700 dark:border-slate-600" value={bonds} step={10000} onChange={e => onParamChange('bonds', Number(e.target.value))} />
          </label>
          <div className="text-sm font-semibold">Total: {currency.format(startBalance)}</div>

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
            <h2 className="font-semibold">Simulation Settings</h2>
            <button
              className="text-lg hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full w-8 h-8 flex items-center justify-center transition-colors"
              onClick={onRefresh}
              aria-label="Refresh simulation"
              title="Refresh simulation"
            >
              ⟳
            </button>
          </div>
          <label className="block text-sm">Drawdown Strategy
            <select
              className="mt-1 w-full border rounded-xl p-2 bg-white dark:bg-slate-700 dark:border-slate-600"
              value={drawdownStrategy}
              onChange={e => onParamChange('drawdownStrategy', e.target.value)}
            >
              <option value="cashFirst_spyThenQqq">Cash 1st, then SPY, then QQQ, then Bonds</option>
              <option value="cashFirst_qqqThenSpy">Cash 1st, then QQQ, then SPY, then Bonds</option>
              <option value="cashFirst_equalParts">Cash 1st, then equal parts SPY, QQQ & Bonds</option>
              <option value="cashFirst_bestPerformer">Cash 1st, then best performer of year</option>
              <option value="cashFirst_worstPerformer">Cash 1st, then worst performer of year</option>
            </select>
          </label>
          <label className="block text-sm">Horizon (years)
            <input type="number" className="mt-1 w-full border rounded-xl p-2 bg-white dark:bg-slate-700 dark:border-slate-600" value={horizon} onChange={e => onParamChange('horizon', Math.max(1, Number(e.target.value)))} />
          </label>
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
            <h2 className="font-semibold mb-2">Sample Run Asset Allocation</h2>
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
              <AreaChart
                data={sampleRun.balances.map((b, i) => ({ year: i, cash: b.cash, spy: b.spy, qqq: b.qqq, bonds: b.bonds }))}
                stackOffset="expand"
                margin={{ left: 32, right: 8, top: 8, bottom: 8 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="year" />
                <YAxis tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`} />
                <Tooltip
                  formatter={(value: number, _: string, props: { payload?: { cash: number; spy: number; qqq: number; bonds: number } }) => {
                    const total = props.payload ? props.payload.cash + props.payload.spy + props.payload.qqq + props.payload.bonds : 0;
                    const pct = total === 0 ? 0 : (value / total) * 100;
                    return `${currency.format(value)} (${pct.toFixed(1)}%)`;
                  }}
                />
                <Legend />
                <Area type="monotone" dataKey="cash" name="Cash" stackId="1" stroke="#8884d8" fill="#8884d8" />
                <Area type="monotone" dataKey="spy" name="SPY" stackId="1" stroke="#82ca9d" fill="#82ca9d" />
                <Area type="monotone" dataKey="qqq" name="QQQ" stackId="1" stroke="#ffc658" fill="#ffc658" />
                <Area type="monotone" dataKey="bonds" name="Bonds" stackId="1" stroke="#95a5a6" fill="#95a5a6" />
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
                  balance: b.total,
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
                <Line type="monotone" dataKey="balance" yAxisId="left" name="Total Balance" dot={false} strokeWidth={2} stroke="#8884d8" />
                <Line type="monotone" dataKey="withdrawal" yAxisId="right" name="Withdrawal" dot={false} strokeWidth={2} stroke="#82ca9d" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      <footer className="text-xs text-slate-600 dark:text-slate-400">
        <div>Assumptions: ...</div>
      </footer>
    </div>
  );
};

export default PortfolioTab;

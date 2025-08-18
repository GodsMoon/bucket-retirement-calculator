import React, { useMemo } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, Area, AreaChart, CartesianGrid } from "recharts";
import type { DrawdownStrategy } from "../App";
import { SP500_TOTAL_RETURNS, NASDAQ100_TOTAL_RETURNS } from "../data/returns";
import { pctToMult, bootstrapSample, shuffle, percentile, calculateDrawdownStats } from "../lib/simulation";

// ... (imports)

// Custom RunResult for portfolio simulation
type PortfolioRunResult = {
  balances: { total: number; cash: number; spy: number; qqq: number }[];
  failedYear: number | null;
  withdrawals: number[];
};

function simulatePortfolioPath(
  spyReturns: number[],
  qqqReturns: number[],
  initialCash: number,
  initialSpy: number,
  initialQqq: number,
  horizon: number,
  initialWithdrawalRate: number,
  inflationRate: number,
  inflationAdjust: boolean,
  drawdownStrategy: DrawdownStrategy
): PortfolioRunResult {
  const balances = new Array(horizon + 1).fill(0).map(() => ({ total: 0, cash: 0, spy: 0, qqq: 0 }));
  const withdrawals: number[] = new Array(horizon).fill(0);
  let cash = initialCash;
  let spy = initialSpy;
  let qqq = initialQqq;
  const startBalance = initialCash + initialSpy + initialQqq;
  const baseWithdrawal = startBalance * initialWithdrawalRate;

  balances[0] = { total: startBalance, cash, spy, qqq };
  let failedYear: number | null = null;

  for (let y = 0; y < horizon; y++) {
    let withdrawalAmount = inflationAdjust ? baseWithdrawal * Math.pow(1 + inflationRate, y) : baseWithdrawal;
    withdrawals[y] = withdrawalAmount;

    // Drawdown from cash first
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
        }
      } else if (drawdownStrategy === 'cashFirst_qqqThenSpy') {
        const fromQqq = Math.min(withdrawalAmount, qqq);
        qqq -= fromQqq;
        withdrawalAmount -= fromQqq;

        if (withdrawalAmount > 0) {
          const fromSpy = Math.min(withdrawalAmount, spy);
          spy -= fromSpy;
        }
      } else if (drawdownStrategy === 'cashFirst_equalParts') {
        const fromSpy = Math.min(withdrawalAmount / 2, spy);
        spy -= fromSpy;
        withdrawalAmount -= fromSpy;

        const fromQqq = Math.min(withdrawalAmount / 2, qqq);
        qqq -= fromQqq;
        withdrawalAmount -= fromQqq;

        // if one is depleted, take rest from other
        if (withdrawalAmount > 0) {
          const fromSpy2 = Math.min(withdrawalAmount, spy);
          spy -= fromSpy2;
          withdrawalAmount -= fromSpy2;
        }
        if (withdrawalAmount > 0) {
          const fromQqq2 = Math.min(withdrawalAmount, qqq);
          qqq -= fromQqq2;
          withdrawalAmount -= fromQqq2;
        }

      } else if (drawdownStrategy === 'cashFirst_bestPerformer') {
        if (spyReturns[y] >= qqqReturns[y]) { // SPY is better or equal
          const fromSpy = Math.min(withdrawalAmount, spy);
          spy -= fromSpy;
          withdrawalAmount -= fromSpy;
          if (withdrawalAmount > 0) {
            const fromQqq = Math.min(withdrawalAmount, qqq);
            qqq -= fromQqq;
          }
        } else { // QQQ is better
          const fromQqq = Math.min(withdrawalAmount, qqq);
          qqq -= fromQqq;
          withdrawalAmount -= fromQqq;
          if (withdrawalAmount > 0) {
            const fromSpy = Math.min(withdrawalAmount, spy);
            spy -= fromSpy;
          }
        }
      } else if (drawdownStrategy === 'cashFirst_worstPerformer') {
        if (spyReturns[y] <= qqqReturns[y]) { // SPY is worse or equal
          const fromSpy = Math.min(withdrawalAmount, spy);
          spy -= fromSpy;
          withdrawalAmount -= fromSpy;
          if (withdrawalAmount > 0) {
            const fromQqq = Math.min(withdrawalAmount, qqq);
            qqq -= fromQqq;
          }
        } else { // QQQ is worse
          const fromQqq = Math.min(withdrawalAmount, qqq);
          qqq -= fromQqq;
          withdrawalAmount -= fromQqq;
          if (withdrawalAmount > 0) {
            const fromSpy = Math.min(withdrawalAmount, spy);
            spy -= fromSpy;
          }
        }
      }
    }


    const totalBeforeGrowth = cash + spy + qqq;
    if (totalBeforeGrowth <= 0 && failedYear === null) {
      failedYear = y + 1;
      balances[y + 1] = { total: 0, cash: 0, spy: 0, qqq: 0 };
      continue; // No need to process further if failed
    }

    // Apply market returns
    spy *= spyReturns[y];
    qqq *= qqqReturns[y];

    const totalAfterGrowth = cash + spy + qqq;
    balances[y + 1] = { total: totalAfterGrowth, cash, spy, qqq };
  }

  return { balances, failedYear, withdrawals };
}


interface PortfolioTabProps {
  startBalance: number;
  cash: number;
  spy: number;
  qqq: number;
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
    return Array.from(spyYears).filter(y => qqqYears.has(y)).sort((a, b) => a - b);
  }, []);

  const returnsByYear = useMemo(() => {
    const map = new Map<number, { spy: number, qqq: number }>();
    const spyReturnsMap = new Map(SP500_TOTAL_RETURNS.map(d => [d.year, pctToMult(d.returnPct)]));
    const qqqReturnsMap = new Map(NASDAQ100_TOTAL_RETURNS.map(d => [d.year, pctToMult(d.returnPct)]));
    for (const year of years) {
      map.set(year, { spy: spyReturnsMap.get(year)!, qqq: qqqReturnsMap.get(year)! });
    }
    return map;
  }, [years]);

  const sims = useMemo(() => {
    const runs: PortfolioRunResult[] = [];
    const initialW = initialWithdrawalAmount / startBalance;

    if (mode === "actual-seq") {
      const spyReturns = years.slice(years.indexOf(startYear), years.indexOf(startYear) + horizon).map(y => returnsByYear.get(y)!.spy);
      const qqqReturns = years.slice(years.indexOf(startYear), years.indexOf(startYear) + horizon).map(y => returnsByYear.get(y)!.qqq);
      runs.push(simulatePortfolioPath(spyReturns, qqqReturns, cash, spy, qqq, horizon, initialW, inflationRate, inflationAdjust, drawdownStrategy));
    } else {
      // Monte Carlo modes
      for (let i = 0; i < numRuns; i++) {
        let yearSample: number[] = [];
        if (mode === 'bootstrap') {
          yearSample = bootstrapSample(years, horizon);
        } else if (mode === 'random-shuffle') {
          yearSample = shuffle(years).slice(0, horizon);
        } else if (mode === 'actual-seq-random-start') {
          const startIdx = Math.floor(Math.random() * (years.length - horizon + 1));
          yearSample = years.slice(startIdx, startIdx + horizon);
        }
        const spyReturns = yearSample.map(y => returnsByYear.get(y)!.spy);
        const qqqReturns = yearSample.map(y => returnsByYear.get(y)!.qqq);
        runs.push(simulatePortfolioPath(spyReturns, qqqReturns, cash, spy, qqq, horizon, initialW, inflationRate, inflationAdjust, drawdownStrategy));
      }
    }
    return runs;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cash, spy, qqq, horizon, initialWithdrawalAmount, inflationRate, inflationAdjust, drawdownStrategy, mode, numRuns, startYear, returnsByYear, startBalance, years, refreshCounter]);


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
      <div className="text-sm text-slate-600">Data: S&P 500 and NASDAQ 100 total return</div>

      <section className="grid md:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl shadow p-4 space-y-3">
          <h2 className="font-semibold">Inputs</h2>
          <h3 className="font-semibold">Portfolio Allocation:</h3>
          <label className="block text-sm">Cash
            <input type="number" className="mt-1 w-full border rounded-xl p-2" value={cash} step={10000} onChange={e => onParamChange('cash', Number(e.target.value))} />
          </label>
          <label className="block text-sm">SPY (S&P 500)
            <input type="number" className="mt-1 w-full border rounded-xl p-2" value={spy} step={10000} onChange={e => onParamChange('spy', Number(e.target.value))} />
          </label>
          <label className="block text-sm">QQQ (NASDAQ 100)
            <input type="number" className="mt-1 w-full border rounded-xl p-2" value={qqq} step={10000} onChange={e => onParamChange('qqq', Number(e.target.value))} />
          </label>
          <div className="text-sm font-semibold">Total: {currency.format(startBalance)}</div>

          <h3 className="font-semibold">Withdraw Rate:</h3>
          <div className="flex gap-4">
            <label className="block text-sm flex-1">% of initial
              <input type="number" className="mt-1 w-full border rounded-xl p-2" value={withdrawRate} step={0.01} onChange={e => onParamChange('withdrawRate', Number(e.target.value))} />
            </label>
            <div className={`flex-1 p-2 rounded-lg ${isInitialAmountLocked ? 'bg-green-100' : ''}`}>
              <label className="block text-sm">Initial $</label>
              <div className="flex items-center mt-1">
                <input
                  type="number"
                  className={`w-full border rounded-xl p-2 transition-colors ${isInitialAmountLocked ? 'text-green-800 font-semibold' : ''}`}
                  value={Math.round(initialWithdrawalAmount)}
                  step={1000}
                  onChange={e => onParamChange('initialWithdrawalAmount', Number(e.target.value))} />
                <button
                  className={`ml-2 text-xl p-1 rounded-full hover:bg-slate-200 transition-colors ${isInitialAmountLocked ? 'opacity-100' : 'opacity-50'}`}
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
          <label className="block text-sm">Inflation rate (if adjusted)
            <input type="number" className="mt-1 w-full border rounded-xl p-2" value={inflationRate} step={0.005} onChange={e => onParamChange('inflationRate', Number(e.target.value))} />
          </label>
        </div>

        <div className="bg-white rounded-2xl shadow p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Simulation Settings</h2>
            <button
              className="text-lg hover:bg-slate-100 rounded-full w-8 h-8 flex items-center justify-center transition-colors"
              onClick={onRefresh}
              aria-label="Refresh simulation"
              title="Refresh simulation"
            >
              ⟳
            </button>
          </div>
          <label className="block text-sm">Drawdown Strategy
            <select
              className="mt-1 w-full border rounded-xl p-2"
              value={drawdownStrategy}
              onChange={e => onParamChange('drawdownStrategy', e.target.value)}
            >
              <option value="cashFirst_spyThenQqq">Cash 1st, then SPY, then QQQ</option>
              <option value="cashFirst_qqqThenSpy">Cash 1st, then QQQ, then SPY</option>
              <option value="cashFirst_equalParts">Cash 1st, then equal parts SPY & QQQ</option>
              <option value="cashFirst_bestPerformer">Cash 1st, then best performer of year</option>
              <option value="cashFirst_worstPerformer">Cash 1st, then worst performer of year</option>
            </select>
          </label>
          <label className="block text-sm">Horizon (years)
            <input type="number" className="mt-1 w-full border rounded-xl p-2" value={horizon} onChange={e => onParamChange('horizon', Math.max(1, Number(e.target.value)))} />
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
                className="ml-2 w-24 border rounded-xl p-1 disabled:opacity-50"
                value={startYear}
                disabled={mode !== 'actual-seq'}
                onChange={(e) => onParamChange('startYear', Number(e.target.value))}
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
            <div className="text-xs text-slate-600">First failure year (sample run): {sampleRun.failedYear ?? 'none'}</div>
          )}
        </div>
      </section>

      <section className="bg-white rounded-2xl shadow p-4">
        <div className="flex items-center justify-between">
            <h2 className="font-semibold mb-2">Portfolio Trajectory Bands</h2>
            <button
              className="text-lg hover:bg-slate-100 rounded-full w-8 h-8 flex items-center justify-center transition-colors"
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

      <section className="bg-white rounded-2xl shadow p-4">
        <div className="flex items-center justify-between">
            <h2 className="font-semibold mb-2">Sample Run Asset Allocation</h2>
            <button
              className="text-lg hover:bg-slate-100 rounded-full w-8 h-8 flex items-center justify-center transition-colors"
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
                data={sampleRun.balances.map((b, i) => ({ year: i, cash: b.cash, spy: b.spy, qqq: b.qqq }))}
                stackOffset="expand"
                margin={{ left: 32, right: 8, top: 8, bottom: 8 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="year" />
                <YAxis tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`} />
                <Tooltip
                  formatter={(value: number, _: string, props: { payload?: { cash: number; spy: number; qqq: number } }) => {
                    const total = props.payload ? props.payload.cash + props.payload.spy + props.payload.qqq : 0;
                    const pct = total === 0 ? 0 : (value / total) * 100;
                    return `${currency.format(value)} (${pct.toFixed(1)}%)`;
                  }}
                />
                <Legend />
                <Area type="monotone" dataKey="cash" name="Cash" stackId="1" stroke="#8884d8" fill="#8884d8" />
                <Area type="monotone" dataKey="spy" name="SPY" stackId="1" stroke="#82ca9d" fill="#82ca9d" />
                <Area type="monotone" dataKey="qqq" name="QQQ" stackId="1" stroke="#ffc658" fill="#ffc658" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      <section className="bg-white rounded-2xl shadow p-4">
        <div className="flex items-center justify-between">
            <h2 className="font-semibold mb-2">Sample Run Trajectory</h2>
            <button
              className="text-lg hover:bg-slate-100 rounded-full w-8 h-8 flex items-center justify-center transition-colors"
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

      <footer className="text-xs text-slate-600">
        <div>Assumptions: ...</div>
      </footer>
    </div>
  );
};

export default PortfolioTab;

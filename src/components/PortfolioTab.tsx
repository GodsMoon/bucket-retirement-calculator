import React, { useMemo } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, Area, AreaChart, CartesianGrid } from "recharts";
import type { DrawdownStrategy } from "../App";
import { SP500_TOTAL_RETURNS, NASDAQ100_TOTAL_RETURNS } from "../data/returns";
import { TEN_YEAR_TREASURY_TOTAL_RETURNS } from "../data/bonds";
import { pctToMult, bootstrapSample, shuffle, percentile, calculateDrawdownStats } from "../lib/simulation";
import AllocationSlider from "./AllocationSlider";
import CurrencyInput from "./CurrencyInput";
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
  onParamChange: (param: string, value: any) => void;
  setIsInitialAmountLocked: (value: React.SetStateAction<boolean>) => void;
  refreshCounter: number;
  chartStates: Record<string, ChartState>;
  toggleMinimize: (chartId: string) => void;
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
  chartStates,
  toggleMinimize,
  chartOrder,
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

  const charts: Record<string, React.ReactNode> = {
    'portfolio-trajectory': (
      <Chart
        title="Portfolio Trajectory Bands"
        onRefresh={onRefresh}
        onMinimize={() => toggleMinimize('portfolio-trajectory')}
        minimizable={chartStates['portfolio-trajectory'].minimizable}
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
    'portfolio-asset-allocation': (
      <Chart
        title="Sample Run Asset Allocation"
        onRefresh={onRefresh}
        onMinimize={() => toggleMinimize('portfolio-asset-allocation')}
        minimizable={chartStates['portfolio-asset-allocation'].minimizable}
      >
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
      </Chart>
    ),
    'portfolio-sample': (
      <Chart
        title="Sample Run Trajectory"
        onRefresh={onRefresh}
        onMinimize={() => toggleMinimize('portfolio-sample')}
        minimizable={chartStates['portfolio-sample'].minimizable}
      >
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
      </Chart>
    ),
  };

  return (
    <div className="space-y-6">
      <div className="text-sm text-slate-600 dark:text-slate-400">Data: S&P 500, NASDAQ 100, and 10-year Treasury total return</div>

      <div className="grid md:grid-cols-3 gap-4 auto-rows-fr">
        {chartOrder.filter(id => ['portfolio-inputs', 'portfolio-sim-settings', 'portfolio-results'].includes(id)).map(chartId => (
          !chartStates[chartId].minimized &&
          <div key={chartId}>
            {charts[chartId]}
          </div>
        ))}
      </div>

      <MinimizedChartsBar chartStates={chartStates} onRestore={toggleMinimize} />

      <div className="space-y-6">
        {chartOrder.filter(id => !['portfolio-inputs', 'portfolio-sim-settings', 'portfolio-results'].includes(id)).map(chartId => (
          !chartStates[chartId].minimized &&
          <div key={chartId}>
            {charts[chartId]}
          </div>
        ))}
      </div>

      <footer className="text-xs text-slate-600 dark:text-slate-400">
        <div>Assumptions: ...</div>
      </footer>
    </div>
  );
};

export default PortfolioTab;

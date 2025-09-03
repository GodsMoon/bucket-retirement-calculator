import React, { useMemo, useEffect, useRef } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, Area, AreaChart, CartesianGrid } from "recharts";
import { LayoutGroup, motion } from "framer-motion";
import type { DrawdownStrategy } from "../App";
import { useData } from "../data/DataContext";
import { pctToMult, bootstrapSample, shuffle, percentile, calculateDrawdownStats } from "../lib/simulation";
import { bitcoinReturnMultiplier } from "../lib/bitcoin";
import AllocationSlider from "./AllocationSlider";
import CurrencyInput from "./CurrencyInput";
import NumericInput from "./NumericInput";
import Chart, { type ChartProps } from "./Chart";
import type { ChartState } from "../App";
import MinimizedChartsBar from "./MinimizedChartsBar";

// ... (imports)

// Custom RunResult for portfolio simulation
type PortfolioRunResult = {
  balances: { total: number; cash: number; spy: number; qqq: number; bitcoin: number; bonds: number }[];
  failedYear: number | null;
  withdrawals: number[];
};

function simulatePortfolioPath(
  spyReturns: number[],
  qqqReturns: number[],
  bitcoinReturns: number[],
  bondReturns: number[],
  initialCash: number,
  initialSpy: number,
  initialQqq: number,
  initialBitcoin: number,
  initialBonds: number,
  horizon: number,
  initialWithdrawalRate: number,
  inflationRate: number,
  inflationAdjust: boolean,
  drawdownStrategy: DrawdownStrategy,
  inflationRates?: number[],
): PortfolioRunResult {
  const balances = new Array(horizon + 1).fill(0).map(() => ({ total: 0, cash: 0, spy: 0, qqq: 0, bitcoin: 0, bonds: 0 }));
  const withdrawals: number[] = new Array(horizon).fill(0);
  let cash = initialCash;
  let spy = initialSpy;
  let qqq = initialQqq;
  let bitcoin = initialBitcoin;
  let bonds = initialBonds;
  const startBalance = initialCash + initialSpy + initialQqq + initialBitcoin + initialBonds;
  const baseWithdrawal = startBalance * initialWithdrawalRate;
  let withdrawalAmount = baseWithdrawal;

  balances[0] = { total: startBalance, cash, spy, qqq, bitcoin, bonds };
  let failedYear: number | null = null;

  for (let y = 0; y < horizon; y++) {
    const currentWithdrawal = inflationAdjust ? withdrawalAmount : baseWithdrawal;
    withdrawals[y] = currentWithdrawal;

    const fromCash = Math.min(currentWithdrawal, cash);
    cash -= fromCash;
    let remainingWithdrawal = currentWithdrawal - fromCash;

    if (remainingWithdrawal > 0) {
      if (drawdownStrategy === 'cashFirst_spyThenQqq') {
        const fromSpy = Math.min(remainingWithdrawal, spy);
        spy -= fromSpy;
        remainingWithdrawal -= fromSpy;
        if (remainingWithdrawal > 0) {
          const fromQqq = Math.min(remainingWithdrawal, qqq);
          qqq -= fromQqq;
          remainingWithdrawal -= fromQqq;
        }
        if (remainingWithdrawal > 0) {
          const fromBitcoin = Math.min(remainingWithdrawal, bitcoin);
          bitcoin -= fromBitcoin;
          remainingWithdrawal -= fromBitcoin;
        }
        if (remainingWithdrawal > 0) {
          const fromBonds = Math.min(remainingWithdrawal, bonds);
          bonds -= fromBonds;
          remainingWithdrawal -= fromBonds;
        }
      } else if (drawdownStrategy === 'cashFirst_qqqThenSpy') {
        const fromQqq = Math.min(remainingWithdrawal, qqq);
        qqq -= fromQqq;
        remainingWithdrawal -= fromQqq;
        if (remainingWithdrawal > 0) {
          const fromSpy = Math.min(remainingWithdrawal, spy);
          spy -= fromSpy;
          remainingWithdrawal -= fromSpy;
        }
        if (remainingWithdrawal > 0) {
          const fromBitcoin = Math.min(remainingWithdrawal, bitcoin);
          bitcoin -= fromBitcoin;
          remainingWithdrawal -= fromBitcoin;
        }
        if (remainingWithdrawal > 0) {
          const fromBonds = Math.min(remainingWithdrawal, bonds);
          bonds -= fromBonds;
          remainingWithdrawal -= fromBonds;
        }
      } else if (drawdownStrategy === 'cashFirst_equalParts') {
        const part = remainingWithdrawal / 4;
        const fromSpy = Math.min(part, spy);
        spy -= fromSpy;
        remainingWithdrawal -= fromSpy;
        const fromQqq = Math.min(part, qqq);
        qqq -= fromQqq;
        remainingWithdrawal -= fromQqq;
        const fromBitcoin = Math.min(part, bitcoin);
        bitcoin -= fromBitcoin;
        remainingWithdrawal -= fromBitcoin;
        const fromBonds = Math.min(part, bonds);
        bonds -= fromBonds;
        remainingWithdrawal -= fromBonds;
        const order = [
          { bal: spy, set: (v: number) => { spy -= v; } },
          { bal: qqq, set: (v: number) => { qqq -= v; } },
          { bal: bitcoin, set: (v: number) => { bitcoin -= v; } },
          { bal: bonds, set: (v: number) => { bonds -= v; } },
        ];
        for (const asset of order) {
          if (remainingWithdrawal <= 0) break;
          const take = Math.min(remainingWithdrawal, asset.bal);
          asset.set(take);
          remainingWithdrawal -= take;
        }
      } else if (drawdownStrategy === 'cashFirst_bestPerformer') {
        const perf = [
          { key: 'spy', ret: spyReturns[y], bal: spy },
          { key: 'qqq', ret: qqqReturns[y], bal: qqq },
          { key: 'bitcoin', ret: bitcoinReturns[y], bal: bitcoin },
          { key: 'bonds', ret: bondReturns[y], bal: bonds },
        ].sort((a, b) => b.ret - a.ret);
        for (const p of perf) {
          if (remainingWithdrawal <= 0) break;
          const take = Math.min(remainingWithdrawal, p.bal);
          if (p.key === 'spy') spy -= take;
          else if (p.key === 'qqq') qqq -= take;
          else if (p.key === 'bitcoin') bitcoin -= take;
          else bonds -= take;
          remainingWithdrawal -= take;
        }
      } else if (drawdownStrategy === 'cashFirst_worstPerformer') {
        const perf = [
          { key: 'spy', ret: spyReturns[y], bal: spy },
          { key: 'qqq', ret: qqqReturns[y], bal: qqq },
          { key: 'bitcoin', ret: bitcoinReturns[y], bal: bitcoin },
          { key: 'bonds', ret: bondReturns[y], bal: bonds },
        ].sort((a, b) => a.ret - b.ret);
        for (const p of perf) {
          if (remainingWithdrawal <= 0) break;
          const take = Math.min(remainingWithdrawal, p.bal);
          if (p.key === 'spy') spy -= take;
          else if (p.key === 'qqq') qqq -= take;
          else if (p.key === 'bitcoin') bitcoin -= take;
          else bonds -= take;
          remainingWithdrawal -= take;
        }
      }
    }

    const totalBeforeGrowth = cash + spy + qqq + bitcoin + bonds;
    if (totalBeforeGrowth <= 0 && failedYear === null) {
      failedYear = y + 1;
      balances[y + 1] = { total: 0, cash: 0, spy: 0, qqq: 0, bitcoin: 0, bonds: 0 };
      continue;
    }

    spy *= spyReturns[y];
    qqq *= qqqReturns[y];
    bitcoin *= bitcoinReturns[y];
    bonds *= bondReturns[y];

    const totalAfterGrowth = cash + spy + qqq + bitcoin + bonds;
    balances[y + 1] = { total: totalAfterGrowth, cash, spy, qqq, bitcoin, bonds };

    if (inflationAdjust) {
      const rate = inflationRates ? inflationRates[y] : inflationRate;
      withdrawalAmount *= (1 + rate);
    }
  }

  return { balances, failedYear, withdrawals };
}


interface PortfolioTabProps {
  startBalance: number;
  cash: number;
  spy: number;
  qqq: number;
  bitcoin: number;
  bonds: number;
  drawdownStrategy: DrawdownStrategy;
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
  onParamChange: (param: string, value: unknown) => void;
  setIsInitialAmountLocked: (value: React.SetStateAction<boolean>) => void;
  refreshCounter: number;
  chartStates: Record<string, ChartState>;
  toggleMinimize: (chartId: string) => void;
  toggleSize: (chartId: string) => void;
  chartOrder: string[];
  onReorderChartOrder?: (newOrder: string[]) => void;
}

const PortfolioTab: React.FC<PortfolioTabProps> = ({
  startBalance,
  cash,
  spy,
  qqq,
  bitcoin,
  bonds,
  drawdownStrategy,
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
  const currency = useMemo(() => new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 }), []);
  const [draggingId, setDraggingId] = React.useState<string | null>(null);
  const [overId, setOverId] = React.useState<string | null>(null);
  const { sp500, nasdaq100, bitcoin: btcReturns, bonds: bondReturns, inflation } = useData();

  const years = useMemo(() => {
    const spyYears = new Set(sp500.map(d => d.year));
    const qqqYears = new Set(nasdaq100.map(d => d.year));
    const bondYears = new Set(bondReturns.map(d => d.year));
    return Array.from(spyYears)
      .filter(y => qqqYears.has(y) && bondYears.has(y))
      .sort((a, b) => a - b);
  }, [sp500, nasdaq100, bondReturns]);

  const returnsByYear = useMemo(() => {
    const map = new Map<number, { spy: number; qqq: number; bitcoin: number; bonds: number }>();
    const spyReturnsMap = new Map(sp500.map(d => [d.year, pctToMult(d.returnPct)]));
    const qqqReturnsMap = new Map(nasdaq100.map(d => [d.year, pctToMult(d.returnPct)]));
    const bondReturnsMap = new Map(bondReturns.map(d => [d.year, pctToMult(d.returnPct)]));
    const btcReturnsMap = new Map(btcReturns.map(d => [d.year, pctToMult(d.returnPct)]));
    for (const year of years) {
      map.set(year, {
        spy: spyReturnsMap.get(year)!,
        qqq: qqqReturnsMap.get(year)!,
        bitcoin: bitcoin > 0 ? (btcReturnsMap.get(year) ?? bitcoinReturnMultiplier(year)) : 1.0,
        bonds: bondReturnsMap.get(year)!,
      });
    }
    return map;
  }, [years, bitcoin, sp500, nasdaq100, btcReturns, bondReturns]);

  const inflationSorted = useMemo(() => inflation.slice().sort((a, b) => a.year - b.year), [inflation]);
  const inflationYears = useMemo(() => inflationSorted.map(d => d.year), [inflationSorted]);
  const inflationRatesChrono = useMemo(() => inflationSorted.map(d => d.inflationPct / 100), [inflationSorted]);
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
  }, [startBalance, cash, spy, qqq, bitcoin, bonds, drawdownStrategy, horizon, withdrawRate, initialWithdrawalAmount, inflationAdjust, effectiveInflationRate, useHistoricalInflation, mode, numRuns, seed, startYear]);

  const sims = useMemo(() => {
    const runs: PortfolioRunResult[] = [];
    const initialW = initialWithdrawalAmount / startBalance;

    const inflationFromYears = (ys: number[]) => ys.map(y => {
      const idx = inflationYears.indexOf(y);
      return idx === -1 ? 0 : inflationRatesChrono[idx];
    });

    if (mode === "actual-seq") {
      let startIdx = years.indexOf(startYear);
      if (startIdx === -1) startIdx = 0;
      const yearSample = years.slice(startIdx, startIdx + horizon);
      const spyReturns = yearSample.map(y => returnsByYear.get(y)!.spy);
      const qqqReturns = yearSample.map(y => returnsByYear.get(y)!.qqq);
      const bitcoinReturns = yearSample.map(y => returnsByYear.get(y)!.bitcoin);
      const bondReturns = yearSample.map(y => returnsByYear.get(y)!.bonds);
      const inflSeq = useHistoricalInflation ? inflationFromYears(yearSample) : undefined;
      runs.push(simulatePortfolioPath(spyReturns, qqqReturns, bitcoinReturns, bondReturns, cash, spy, qqq, bitcoin, bonds, horizon, initialW, inflationRate, inflationAdjust, drawdownStrategy, inflSeq));
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
        const bitcoinReturns = yearSample.map(y => returnsByYear.get(y)!.bitcoin);
        const bondReturns = yearSample.map(y => returnsByYear.get(y)!.bonds);
        const inflSeq = useHistoricalInflation ? inflationFromYears(yearSample) : undefined;
        runs.push(simulatePortfolioPath(spyReturns, qqqReturns, bitcoinReturns, bondReturns, cash, spy, qqq, bitcoin, bonds, horizon, initialW, inflationRate, inflationAdjust, drawdownStrategy, inflSeq));
      }
    }
    return runs;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshCounter, returnsByYear, useHistoricalInflation, inflationYears, inflationRatesChrono, years, cash, spy, qqq, bitcoin, bonds, horizon, startYear, initialWithdrawalAmount, startBalance, effectiveInflationRate, inflationAdjust, drawdownStrategy, mode, numRuns]);


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
    const medianRun: PortfolioRunResult = {
      balances: [],
      failedYear: null,
      withdrawals: [],
    };

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

      medianRun.balances.push({
        total: percentile(sims.map(s => s.balances[t].total), 0.5),
        cash: percentile(sims.map(s => s.balances[t].cash), 0.5),
        spy: percentile(sims.map(s => s.balances[t].spy), 0.5),
        qqq: percentile(sims.map(s => s.balances[t].qqq), 0.5),
        bitcoin: percentile(sims.map(s => s.balances[t].bitcoin), 0.5),
        bonds: percentile(sims.map(s => s.balances[t].bonds), 0.5),
      });

      if (t < horizon) {
        medianRun.withdrawals.push(percentile(sims.map(s => s.withdrawals[t]), 0.5));
      }
    }
    const medianFifthYearWithdrawal = horizon >= 5 ? percentile(sims.map(s => s.withdrawals[4]), 0.5) : 0;
    return { successRate, endingBalances, bands, ...drawdownStats, medianFifthYearWithdrawal, medianRun };
  }, [sims, horizon]);

  const sampleRun = sims[0];

  const charts: Record<string, React.ReactElement<ChartProps>> = useMemo(() => ({
    'portfolio-trajectory': (
      <Chart
        chartId="portfolio-trajectory"
        title={chartStates['portfolio-trajectory']?.title ?? 'Portfolio Trajectory Bands'}
        onRefresh={onRefresh}
        onMinimize={() => toggleMinimize('portfolio-trajectory')}
        onToggleSize={() => toggleSize('portfolio-trajectory')}
        onDragStart={() => setDraggingId('portfolio-trajectory')}
        onDragEnd={() => { setDraggingId(null); setOverId(null); }}
        size={chartStates['portfolio-trajectory']?.size ?? 'full'}
        minimizable={true}
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
    'portfolio-median-asset-allocation': (
      <Chart
        chartId="portfolio-median-asset-allocation"
        title={chartStates['portfolio-median-asset-allocation']?.title ?? 'Median Sample Run Asset Allocation'}
        onRefresh={onRefresh}
        onMinimize={() => toggleMinimize('portfolio-median-asset-allocation')}
        onToggleSize={() => toggleSize('portfolio-median-asset-allocation')}
        onDragStart={() => setDraggingId('portfolio-median-asset-allocation')}
        onDragEnd={() => { setDraggingId(null); setOverId(null); }}
        size={chartStates['portfolio-median-asset-allocation']?.size ?? 'half'}
        minimizable={true}
      >
        {stats?.medianRun && (
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={stats.medianRun.balances.map((b, i) => ({ year: i, cash: b.cash, spy: b.spy, qqq: b.qqq, bitcoin: b.bitcoin, bonds: b.bonds }))}
                stackOffset="expand"
                margin={{ left: 32, right: 8, top: 8, bottom: 8 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="year" />
                <YAxis tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`} />
                <Tooltip
                  formatter={(value: number, _: string, props: { payload?: { cash: number; spy: number; qqq: number; bitcoin: number; bonds: number } }) => {
                    const total = props.payload ? props.payload.cash + props.payload.spy + props.payload.qqq + props.payload.bitcoin + props.payload.bonds : 0;
                    const pct = total === 0 ? 0 : (value / total) * 100;
                    return `${currency.format(value)} (${pct.toFixed(1)}%)`;
                  }}
                />
                <Legend />
                <Area type="monotone" dataKey="cash" name="Cash" stackId="1" stroke="#8884d8" fill="#8884d8" />
                <Area type="monotone" dataKey="spy" name="SPY" stackId="1" stroke="#82ca9d" fill="#82ca9d" />
                <Area type="monotone" dataKey="qqq" name="QQQ" stackId="1" stroke="#ff7f7f" fill="#ff7f7f" />
                <Area type="monotone" dataKey="bitcoin" name="Bitcoin" stackId="1" stroke="#f2a900" fill="#f2a900" />
                <Area type="monotone" dataKey="bonds" name="Bonds" stackId="1" stroke="#95a5a6" fill="#95a5a6" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </Chart>
    ),
    'portfolio-median-trajectory': (
      <Chart
        chartId="portfolio-median-trajectory"
        title={chartStates['portfolio-median-trajectory']?.title ?? 'Median Sample Run Trajectory'}
        onRefresh={onRefresh}
        onMinimize={() => toggleMinimize('portfolio-median-trajectory')}
        onToggleSize={() => toggleSize('portfolio-median-trajectory')}
        onDragStart={() => setDraggingId('portfolio-median-trajectory')}
        onDragEnd={() => { setDraggingId(null); setOverId(null); }}
        size={chartStates['portfolio-median-trajectory']?.size ?? 'half'}
        minimizable={true}
      >
        {stats?.medianRun && (
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={stats.medianRun.balances.map((b, i) => ({
                  year: i,
                  balance: b.total,
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
    'portfolio-asset-allocation': (
      <Chart
        chartId="portfolio-asset-allocation"
        title={chartStates['portfolio-asset-allocation']?.title ?? 'Sample Run 1 Asset Allocation'}
        onRefresh={onRefresh}
        onMinimize={() => toggleMinimize('portfolio-asset-allocation')}
        onToggleSize={() => toggleSize('portfolio-asset-allocation')}
        onDragStart={() => setDraggingId('portfolio-asset-allocation')}
        onDragEnd={() => { setDraggingId(null); setOverId(null); }}
        size={chartStates['portfolio-asset-allocation']?.size ?? 'half'}
        minimizable={true}
      >
        {sampleRun && (
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={sampleRun.balances.map((b, i) => ({ year: i, cash: b.cash, spy: b.spy, qqq: b.qqq, bitcoin: b.bitcoin, bonds: b.bonds }))}
                stackOffset="expand"
                margin={{ left: 32, right: 8, top: 8, bottom: 8 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="year" />
                <YAxis tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`} />
                <Tooltip
                  formatter={(value: number, _: string, props: { payload?: { cash: number; spy: number; qqq: number; bitcoin: number; bonds: number } }) => {
                    const total = props.payload ? props.payload.cash + props.payload.spy + props.payload.qqq + props.payload.bitcoin + props.payload.bonds : 0;
                    const pct = total === 0 ? 0 : (value / total) * 100;
                    return `${currency.format(value)} (${pct.toFixed(1)}%)`;
                  }}
                />
                <Legend />
                <Area type="monotone" dataKey="cash" name="Cash" stackId="1" stroke="#8884d8" fill="#8884d8" />
                <Area type="monotone" dataKey="spy" name="SPY" stackId="1" stroke="#82ca9d" fill="#82ca9d" />
                <Area type="monotone" dataKey="qqq" name="QQQ" stackId="1" stroke="#ff7f7f" fill="#ff7f7f" />
                <Area type="monotone" dataKey="bitcoin" name="Bitcoin" stackId="1" stroke="#f2a900" fill="#f2a900" />
                <Area type="monotone" dataKey="bonds" name="Bonds" stackId="1" stroke="#95a5a6" fill="#95a5a6" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </Chart>
    ),
    'portfolio-sample': (
      <Chart
        chartId="portfolio-sample"
        title={chartStates['portfolio-sample']?.title ?? 'Sample Run 1 Trajectory'}
        onRefresh={onRefresh}
        onMinimize={() => toggleMinimize('portfolio-sample')}
        onToggleSize={() => toggleSize('portfolio-sample')}
        onDragStart={() => setDraggingId('portfolio-sample')}
        onDragEnd={() => { setDraggingId(null); setOverId(null); }}
        size={chartStates['portfolio-sample']?.size ?? 'half'}
        minimizable={true}
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
    ...[2, 3, 4, 5].reduce((acc, i) => {
      const sampleRun = sims[i - 1];
      if (!sampleRun) return acc;
      acc[`portfolio-sample-${i}-asset-allocation`] = (
        <Chart
          chartId={`portfolio-sample-${i}-asset-allocation`}
          title={chartStates[`portfolio-sample-${i}-asset-allocation`]?.title ?? `Sample Run ${i} Asset Allocation`}
          onRefresh={onRefresh}
          onMinimize={() => toggleMinimize(`portfolio-sample-${i}-asset-allocation`)}
          onToggleSize={() => toggleSize(`portfolio-sample-${i}-asset-allocation`)}
          onDragStart={() => setDraggingId(`portfolio-sample-${i}-asset-allocation`)}
          onDragEnd={() => { setDraggingId(null); setOverId(null); }}
          size={chartStates[`portfolio-sample-${i}-asset-allocation`]?.size ?? 'half'}
          minimizable={true}
        >
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={sampleRun.balances.map((b, i) => ({ year: i, cash: b.cash, spy: b.spy, qqq: b.qqq, bitcoin: b.bitcoin, bonds: b.bonds }))}
                stackOffset="expand"
                margin={{ left: 32, right: 8, top: 8, bottom: 8 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="year" />
                <YAxis tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`} />
                <Tooltip
                  formatter={(value: number, _: string, props: { payload?: { cash: number; spy: number; qqq: number; bitcoin: number; bonds: number } }) => {
                    const total = props.payload ? props.payload.cash + props.payload.spy + props.payload.qqq + props.payload.bitcoin + props.payload.bonds : 0;
                    const pct = total === 0 ? 0 : (value / total) * 100;
                    return `${currency.format(value)} (${pct.toFixed(1)}%)`;
                  }}
                />
                <Legend />
                <Area type="monotone" dataKey="cash" name="Cash" stackId="1" stroke="#8884d8" fill="#8884d8" />
                <Area type="monotone" dataKey="spy" name="SPY" stackId="1" stroke="#82ca9d" fill="#82ca9d" />
                <Area type="monotone" dataKey="qqq" name="QQQ" stackId="1" stroke="#ff7f7f" fill="#ff7f7f" />
                <Area type="monotone" dataKey="bitcoin" name="Bitcoin" stackId="1" stroke="#f2a900" fill="#f2a900" />
                <Area type="monotone" dataKey="bonds" name="Bonds" stackId="1" stroke="#95a5a6" fill="#95a5a6" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Chart>
      );
      acc[`portfolio-sample-${i}-trajectory`] = (
        <Chart
          chartId={`portfolio-sample-${i}-trajectory`}
          title={chartStates[`portfolio-sample-${i}-trajectory`]?.title ?? `Sample Run ${i} Trajectory`}
          onRefresh={onRefresh}
          onMinimize={() => toggleMinimize(`portfolio-sample-${i}-trajectory`)}
          onToggleSize={() => toggleSize(`portfolio-sample-${i}-trajectory`)}
          onDragStart={() => setDraggingId(`portfolio-sample-${i}-trajectory`)}
          onDragEnd={() => { setDraggingId(null); setOverId(null); }}
          size={chartStates[`portfolio-sample-${i}-trajectory`]?.size ?? 'half'}
          minimizable={true}
        >
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
        </Chart>
      );
      return acc;
    }, {} as Record<string, React.ReactNode>),
  }), [chartStates, onRefresh, toggleMinimize, toggleSize, stats, sims, currency, sampleRun]);

  return (
    <div className="space-y-6">
      <div className="text-sm text-slate-600 dark:text-slate-400">Data: S&P 500, NASDAQ 100, Bitcoin, and 10-year Treasury total return</div>

      <section className="grid md:grid-cols-3 gap-4 auto-rows-fr">
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow p-4 space-y-3">
          <h2 className="font-semibold">Inputs</h2>
          <h3 className="font-semibold">Portfolio Allocation:</h3>
          <div className="p-4">
            <AllocationSlider cash={cash} spy={spy} qqq={qqq} bitcoin={bitcoin} bonds={bonds} onParamChange={onParamChange} />
          </div>
          <label className="block text-sm">Cash
            <CurrencyInput className="mt-1 w-full border rounded-xl p-2 bg-white dark:bg-slate-700 dark:border-slate-600" value={cash} step={10000} onChange={v => onParamChange('cash', v)} />
          </label>
          <label className="block text-sm">SPY (S&P 500)
            <CurrencyInput className="mt-1 w-full border rounded-xl p-2 bg-white dark:bg-slate-700 dark:border-slate-600" value={spy} step={10000} onChange={v => onParamChange('spy', v)} />
          </label>
          <label className="block text-sm">QQQ (NASDAQ 100)
            <CurrencyInput className="mt-1 w-full border rounded-xl p-2 bg-white dark:bg-slate-700 dark:border-slate-600" value={qqq} step={10000} onChange={v => onParamChange('qqq', v)} />
          </label>
          <label className="block text-sm">Bitcoin (BTC)
            <CurrencyInput className="mt-1 w-full border rounded-xl p-2 bg-white dark:bg-slate-700 dark:border-slate-600" value={bitcoin} step={10000} onChange={v => onParamChange('bitcoin', v)} />
          </label>
          <label className="block text-sm">Bonds (10Y Treasury)
            <CurrencyInput className="mt-1 w-full border rounded-xl p-2 bg-white dark:bg-slate-700 dark:border-slate-600" value={bonds} step={10000} onChange={v => onParamChange('bonds', v)} />
          </label>
          <div className="text-sm font-semibold">Total: {currency.format(startBalance)}</div>

          <h3 className="font-semibold">Starting Withdrawal Rate:</h3>
          <div className="flex flex-col lg:flex-row lg:gap-x-4 gap-y-2">
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
            <span className={`${useHistoricalInflation ? 'text-slate-500 dark:text-slate-400' : ''}`}>Use Custom Inflation Rate</span>
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
          <div className="text-xs text-slate-500">
            Years: {Math.min(...years)}–{Math.max(...years)} (<a href="#data" className="text-blue-600 dark:text-blue-400 underline">Data</a>)
          </div>
          <label className="block text-sm">Drawdown Order
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
            <NumericInput
              className="mt-1 w-full border rounded-xl p-2 bg-white dark:bg-slate-700 dark:border-slate-600"
              value={horizon}
              step={1}
              min={1}
              onChange={(v) => onParamChange('horizon', Math.max(1, Math.round(v)))}
            />
          </label>
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

      <MinimizedChartsBar chartStates={chartStates} onRestore={toggleMinimize} activeTab="portfolio" />

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
                  if (!onReorderChartOrder || !src || src === chartId) return;
                  const current = chartOrder.slice();
                  const srcIdx = current.indexOf(src);
                  const tgtIdx = current.indexOf(chartId);
                  if (srcIdx === -1 || tgtIdx === -1) return;
                  const tmp = current[srcIdx];
                  current[srcIdx] = current[tgtIdx];
                  current[tgtIdx] = tmp;
                  onReorderChartOrder(current);
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
          {/* End drop target */}
          {draggingId && (
            <div
              className="h-24 rounded-2xl bg-slate-900/70 dark:bg-white/70 flex items-center justify-center text-xs font-semibold transform scale-110 border-4 border-dashed border-blue-400"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const src = e.dataTransfer.getData('text/plain');
                if (!onReorderChartOrder || !src) return;
                const current = chartOrder.slice().filter(id => id !== src);
                current.push(src);
                onReorderChartOrder(current);
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
        <div>Assumptions: ...</div>
      </footer>
    </div>
  );
};

export default PortfolioTab;

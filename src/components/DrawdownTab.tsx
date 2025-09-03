import React, { useMemo, useEffect, useRef } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, Area, AreaChart, CartesianGrid, ReferenceDot } from "recharts";
import { LayoutGroup, motion } from "framer-motion";
import type { DrawdownStrategies } from "../App";
import AllocationSlider from "./AllocationSlider";
import CurrencyInput from "./CurrencyInput";
import NumericInput from "./NumericInput";
import Chart, { type ChartProps } from "./Chart";
import type { ChartState } from "../App";
import MinimizedChartsBar from "./MinimizedChartsBar";
import { useData } from "../data/DataContext";
import {
  pctToMult,
  bootstrapSample,
  shuffle,
  percentile,
  calculateDrawdownStats,
  type PortfolioRunResult,
  simulateGuytonKlinger,
  simulateFloorAndCeiling,
  simulateFourPercentRuleRatchetUp,
  simulateFourPercentRule,
  simulatePrincipalProtectionRule,
  simulateFixedPercentage,
  simulateCapeBased,
} from "../lib/simulation";
import { bitcoinReturnMultiplier } from "../lib/bitcoin";

// ... (imports)



interface DrawdownTabProps {
  drawdownWithdrawalStrategy: DrawdownStrategies;
  startBalance: number;
  cash: number;
  spy: number;
  qqq: number;
  bitcoin: number;
  bonds: number;
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


const DrawdownTab: React.FC<DrawdownTabProps> = ({
  drawdownWithdrawalStrategy,
  startBalance,
  cash,
  spy,
  qqq,
  bitcoin,
  bonds,
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
  const strategy = drawdownWithdrawalStrategy;
  const [draggingId, setDraggingId] = React.useState<string | null>(null);
  const [overId, setOverId] = React.useState<string | null>(null);
  const [guytonKlingerParams, setGuytonKlingerParams] = React.useState({
    guardrailUpper: 0.06,
    guardrailLower: 0.03,
    cutPercentage: 0.1,
    raisePercentage: 0.1,
  });
  const [floorAndCeilingParams, setFloorAndCeilingParams] = React.useState({
    floor: 0.3,
    ceiling: 0.3,
  });
  const [capeBasedParams, setCapeBasedParams] = React.useState({
    basePercentage: 0.02,
    capeFraction: 0.5,
  });
  const [fixedPercentageParams, setFixedPercentageParams] = React.useState({
    withdrawalRate: 0.04,
  });

  const currency = useMemo(() => new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 }), []);
  const { sp500, nasdaq100, bitcoin: btcReturns, bonds: bondReturns, cape, inflation } = useData();

  const years = useMemo(() => {
    const spyYears = new Set(sp500.map(d => d.year));
    const qqqYears = new Set(nasdaq100.map(d => d.year));
    const bondYears = new Set(bondReturns.map(d => d.year));
    return Array.from(spyYears)
      .filter(y => qqqYears.has(y) && bondYears.has(y))
      .sort((a, b) => a - b);
  }, [sp500, nasdaq100, bondReturns]);

  const returnsByYear = useMemo(() => {
    const map = new Map<number, { spy: number; qqq: number; bitcoin: number; bond: number }>();
    const spyReturnsMap = new Map(sp500.map(d => [d.year, pctToMult(d.returnPct)]));
    const qqqReturnsMap = new Map(nasdaq100.map(d => [d.year, pctToMult(d.returnPct)]));
    const bondReturnsMap = new Map(bondReturns.map(d => [d.year, pctToMult(d.returnPct)]));
    const btcReturnsMap = new Map(btcReturns.map(d => [d.year, pctToMult(d.returnPct)]));
    for (const year of years) {
      map.set(year, {
        spy: spyReturnsMap.get(year)!,
        qqq: qqqReturnsMap.get(year)!,
        bitcoin: bitcoin > 0 ? (btcReturnsMap.get(year) ?? bitcoinReturnMultiplier(year)) : 1.0,
        bond: bondReturnsMap.get(year)!,
      });
    }
    return map;
  }, [years, bitcoin, sp500, nasdaq100, btcReturns, bondReturns]);

  const inflationMap = useMemo(() => new Map(inflation.map(d => [d.year, d.inflationPct / 100])), [inflation]);
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
  }, [drawdownWithdrawalStrategy, startBalance, cash, spy, qqq, bitcoin, bonds, horizon, withdrawRate, initialWithdrawalAmount, inflationAdjust, effectiveInflationRate, useHistoricalInflation, mode, numRuns, seed, startYear, guytonKlingerParams, floorAndCeilingParams, capeBasedParams, fixedPercentageParams]);

  const sims = useMemo(() => {
    const runs: PortfolioRunResult[] = [];
    const initialW = initialWithdrawalAmount / startBalance;
    const inflationFromYears = (ys: number[]) => ys.map(y => inflationMap.get(y) ?? 0);

    if (mode === "actual-seq") {
      let startIdx = years.indexOf(startYear);
      if (startIdx === -1) startIdx = 0;
      const yearSample = years.slice(startIdx, startIdx + horizon);
      const spyReturns = yearSample.map(y => returnsByYear.get(y)!.spy);
      const qqqReturns = yearSample.map(y => returnsByYear.get(y)!.qqq);
      const bitcoinReturns = yearSample.map(y => returnsByYear.get(y)!.bitcoin);
      const bondReturns = yearSample.map(y => returnsByYear.get(y)!.bond);
      const inflSeq = useHistoricalInflation ? inflationFromYears(yearSample) : undefined;
      if (strategy === "guytonKlinger") {
        runs.push(simulateGuytonKlinger(spyReturns, qqqReturns, bitcoinReturns, bondReturns, cash, spy, qqq, bitcoin, bonds, horizon, initialW, inflationRate, inflationAdjust, guytonKlingerParams.guardrailUpper, guytonKlingerParams.guardrailLower, guytonKlingerParams.cutPercentage, guytonKlingerParams.raisePercentage, inflSeq));
      } else if (strategy === "floorAndCeiling") {
        runs.push(simulateFloorAndCeiling(spyReturns, qqqReturns, bitcoinReturns, bondReturns, cash, spy, qqq, bitcoin, bonds, horizon, initialW, inflationRate, inflationAdjust, floorAndCeilingParams.floor, floorAndCeilingParams.ceiling, inflSeq));
      } else if (strategy === "capeBased") {
        runs.push(
          simulateCapeBased(
            spyReturns,
            qqqReturns,
            bitcoinReturns,
            bondReturns,
            cash,
            spy,
            qqq,
            bitcoin,
            bonds,
            horizon,
            capeBasedParams.basePercentage,
            capeBasedParams.capeFraction,
            cape,
            yearSample
          )
        );
      } else if (strategy === "fixedPercentage") {
        runs.push(simulateFixedPercentage(spyReturns, qqqReturns, bitcoinReturns, bondReturns, cash, spy, qqq, bitcoin, bonds, horizon, fixedPercentageParams.withdrawalRate));
      } else if (strategy === "principalProtectionRule") {
        runs.push(simulatePrincipalProtectionRule(spyReturns, qqqReturns, bitcoinReturns, bondReturns, cash, spy, qqq, bitcoin, bonds, horizon, initialWithdrawalAmount, inflationAdjust, inflationRate, inflSeq));
      } else if (strategy === "fourPercentRule") {
        runs.push(simulateFourPercentRule(spyReturns, qqqReturns, bitcoinReturns, bondReturns, cash, spy, qqq, bitcoin, bonds, horizon, initialWithdrawalAmount, inflationAdjust, inflationRate, inflSeq));
      } else if (strategy === "fourPercentRuleUpwardReset") {
        runs.push(simulateFourPercentRuleRatchetUp(spyReturns, qqqReturns, bitcoinReturns, bondReturns, cash, spy, qqq, bitcoin, bonds, horizon, initialWithdrawalAmount, initialW, inflationAdjust, inflationRate, inflSeq));
      }
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
        const bondReturns = yearSample.map(y => returnsByYear.get(y)!.bond);
        const inflSeq = useHistoricalInflation ? inflationFromYears(yearSample) : undefined;
        if (strategy === "guytonKlinger") {
          runs.push(simulateGuytonKlinger(spyReturns, qqqReturns, bitcoinReturns, bondReturns, cash, spy, qqq, bitcoin, bonds, horizon, initialW, inflationRate, inflationAdjust, guytonKlingerParams.guardrailUpper, guytonKlingerParams.guardrailLower, guytonKlingerParams.cutPercentage, guytonKlingerParams.raisePercentage, inflSeq));
        } else if (strategy === "floorAndCeiling") {
          runs.push(simulateFloorAndCeiling(spyReturns, qqqReturns, bitcoinReturns, bondReturns, cash, spy, qqq, bitcoin, bonds, horizon, initialW, inflationRate, inflationAdjust, floorAndCeilingParams.floor, floorAndCeilingParams.ceiling, inflSeq));
        } else if (strategy === "capeBased") {
          runs.push(
            simulateCapeBased(
              spyReturns,
              qqqReturns,
              bitcoinReturns,
              bondReturns,
              cash,
              spy,
              qqq,
              bitcoin,
              bonds,
              horizon,
              capeBasedParams.basePercentage,
              capeBasedParams.capeFraction,
              cape,
              yearSample
            )
          );
        } else if (strategy === "fixedPercentage") {
          runs.push(simulateFixedPercentage(spyReturns, qqqReturns, bitcoinReturns, bondReturns, cash, spy, qqq, bitcoin, bonds, horizon, fixedPercentageParams.withdrawalRate));
        } else if (strategy === "principalProtectionRule") {
        runs.push(simulatePrincipalProtectionRule(spyReturns, qqqReturns, bitcoinReturns, bondReturns, cash, spy, qqq, bitcoin, bonds, horizon, initialWithdrawalAmount, inflationAdjust, inflationRate, inflSeq));
        } else if (strategy === "fourPercentRule") {
        runs.push(simulateFourPercentRule(spyReturns, qqqReturns, bitcoinReturns, bondReturns, cash, spy, qqq, bitcoin, bonds, horizon, initialWithdrawalAmount, inflationAdjust, inflationRate, inflSeq));
        } else if (strategy === "fourPercentRuleUpwardReset") {
        runs.push(simulateFourPercentRuleRatchetUp(spyReturns, qqqReturns, bitcoinReturns, bondReturns, cash, spy, qqq, bitcoin, bonds, horizon, initialWithdrawalAmount, initialW, inflationAdjust, inflationRate, inflSeq));
        }
      }
    }
    return runs;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshCounter, returnsByYear, strategy, useHistoricalInflation, inflationMap]);


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
      guardrailTriggers: [],
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
    'drawdown-trajectory': (
      <Chart
        chartId="drawdown-trajectory"
        title={chartStates['drawdown-trajectory']?.title ?? 'Portfolio Trajectory Bands'}
        onRefresh={onRefresh}
        onMinimize={() => toggleMinimize('drawdown-trajectory')}
        onToggleSize={() => toggleSize('drawdown-trajectory')}
        onDragStart={() => setDraggingId('drawdown-trajectory')}
        onDragEnd={() => { setDraggingId(null); setOverId(null); }}
        size={chartStates['drawdown-trajectory']?.size ?? 'full'}
        minimizable={true}
      >
        {stats && (
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={stats.bands.map(b => ({ year: b.year, p10: b.p10, p25: b.p25, p50: b.p50, p75: b.p75, p90: b.p90 }))} margin={{ left: 32, right: 8, top: 8, bottom: 24 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="year" tickFormatter={(t) => `${t}`} label={{ value: "Years", position: "insideBottom", offset: -2 }} />
                <YAxis tickFormatter={(v: number) => (v >= 1 ? (currency.format(v)) : v.toFixed(2))} />
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
    'drawdown-median-asset-allocation': (
      <Chart
        chartId="drawdown-median-asset-allocation"
        title={chartStates['drawdown-median-asset-allocation']?.title ?? 'Median Sample Run Asset Allocation'}
        onRefresh={onRefresh}
        onMinimize={() => toggleMinimize('drawdown-median-asset-allocation')}
        onToggleSize={() => toggleSize('drawdown-median-asset-allocation')}
        onDragStart={() => setDraggingId('drawdown-median-asset-allocation')}
        onDragEnd={() => { setDraggingId(null); setOverId(null); }}
        size={chartStates['drawdown-median-asset-allocation']?.size ?? 'half'}
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
    'drawdown-median-trajectory': (
      <Chart
        chartId="drawdown-median-trajectory"
        title={chartStates['drawdown-median-trajectory']?.title ?? 'Median Sample Run Trajectory'}
        onRefresh={onRefresh}
        onMinimize={() => toggleMinimize('drawdown-median-trajectory')}
        onToggleSize={() => toggleSize('drawdown-median-trajectory')}
        onDragStart={() => setDraggingId('drawdown-median-trajectory')}
        onDragEnd={() => { setDraggingId(null); setOverId(null); }}
        size={chartStates['drawdown-median-trajectory']?.size ?? 'half'}
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
    'drawdown-asset-allocation': (
      <Chart
        chartId="drawdown-asset-allocation"
        title={chartStates['drawdown-asset-allocation']?.title ?? 'Sample Run 1 Asset Allocation'}
        onRefresh={onRefresh}
        onMinimize={() => toggleMinimize('drawdown-asset-allocation')}
        onToggleSize={() => toggleSize('drawdown-asset-allocation')}
        onDragStart={() => setDraggingId('drawdown-asset-allocation')}
        onDragEnd={() => { setDraggingId(null); setOverId(null); }}
        size={chartStates['drawdown-asset-allocation']?.size ?? 'half'}
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
                <Area type="monotone" dataKey="bonds" name="Bonds" stackId="1" stroke="#ff8042" fill="#ff8042" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </Chart>
    ),
    'drawdown-sample': (
      <Chart
        chartId="drawdown-sample"
        title={chartStates['drawdown-sample']?.title ?? 'Sample Run 1 Trajectory'}
        onRefresh={onRefresh}
        onMinimize={() => toggleMinimize('drawdown-sample')}
        onToggleSize={() => toggleSize('drawdown-sample')}
        onDragStart={() => setDraggingId('drawdown-sample')}
        onDragEnd={() => { setDraggingId(null); setOverId(null); }}
        size={chartStates['drawdown-sample']?.size ?? 'half'}
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
                  triggered: sampleRun.guardrailTriggers.includes(i),
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
                {sampleRun.guardrailTriggers.map((year) => (
                  <ReferenceDot
                    key={year}
                    x={year}
                    y={sampleRun.balances[year].total}
                    r={5}
                    fill="red"
                    stroke="white"
                    name="Guardrail Trigger"
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </Chart>
    ),
    ...[2, 3, 4, 5].reduce((acc, i) => {
      const sampleRun = sims[i - 1];
      if (!sampleRun) return acc;
      acc[`drawdown-sample-${i}-asset-allocation`] = (
        <Chart
          chartId={`drawdown-sample-${i}-asset-allocation`}
          title={chartStates[`drawdown-sample-${i}-asset-allocation`]?.title ?? `Sample Run ${i} Asset Allocation`}
          onRefresh={onRefresh}
          onMinimize={() => toggleMinimize(`drawdown-sample-${i}-asset-allocation`)}
          onToggleSize={() => toggleSize(`drawdown-sample-${i}-asset-allocation`)}
          onDragStart={() => setDraggingId(`drawdown-sample-${i}-asset-allocation`)}
          onDragEnd={() => { setDraggingId(null); setOverId(null); }}
          size={chartStates[`drawdown-sample-${i}-asset-allocation`]?.size ?? 'half'}
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
      acc[`drawdown-sample-${i}-trajectory`] = (
        <Chart
          chartId={`drawdown-sample-${i}-trajectory`}
          title={chartStates[`drawdown-sample-${i}-trajectory`]?.title ?? `Sample Run ${i} Trajectory`}
          onRefresh={onRefresh}
          onMinimize={() => toggleMinimize(`drawdown-sample-${i}-trajectory`)}
          onToggleSize={() => toggleSize(`drawdown-sample-${i}-trajectory`)}
          onDragStart={() => setDraggingId(`drawdown-sample-${i}-trajectory`)}
          onDragEnd={() => { setDraggingId(null); setOverId(null); }}
          size={chartStates[`drawdown-sample-${i}-trajectory`]?.size ?? 'half'}
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

  return (
    <div className="space-y-6">
      <div className="text-sm text-slate-600 dark:text-slate-400">Data: S&P 500, NASDAQ 100, Bitcoin and 10Y Treasury total return</div>

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
          <div className={`block text-sm ${!inflationAdjust ? 'opacity-50' : ''}`} aria-disabled={!inflationAdjust}>
            <div className="flex items-center gap-2">
              <input
                type="radio"
                id="infl-hist-drawdown"
                name="inflationSourceDrawdown"
                checked={useHistoricalInflation}
                onChange={() => onParamChange('useHistoricalInflation', true)}
                disabled={!inflationAdjust}
              />
              <label htmlFor="infl-hist-drawdown" className={`text-sm ${!inflationAdjust ? 'text-slate-500 dark:text-slate-400' : ''}`}>Use Historical Inflation</label>
            </div>
            <div className="flex items-center mt-2 gap-2">
              <input
                type="radio"
                id="infl-custom-drawdown"
                name="inflationSourceDrawdown"
                checked={!useHistoricalInflation}
                onChange={() => onParamChange('useHistoricalInflation', false)}
                disabled={!inflationAdjust}
              />
              <label htmlFor="infl-custom-drawdown" className={`text-sm ${!inflationAdjust ? 'text-slate-500 dark:text-slate-400' : ''}`}>Use Custom Inflation Rate</label>
              <NumericInput
                className="w-20 border rounded-xl p-2 bg-white dark:bg-slate-700 dark:border-slate-600"
                value={Math.round(inflationRate * 400) / 4}
                step={0.25}
                onChange={(v) => onParamChange('inflationRate', v / 100)}
                disabled={!inflationAdjust}
              />
              <span className="ml-2">%</span>
            </div>
          </div>
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
          <label className="block text-sm">Drawdown Strategy
            <select
              className="mt-1 w-full border rounded-xl p-2 bg-white dark:bg-slate-700 dark:border-slate-600"
              value={strategy}
              onChange={e => onParamChange('drawdownWithdrawalStrategy', e.target.value)}
            >
              <option value="fourPercentRule">4% Rule</option>
              <option value="fourPercentRuleUpwardReset">4% Rule – Upward Reset</option>
              <option value="guytonKlinger">Guyton-Klinger</option>
              <option value="floorAndCeiling">Floor and Ceiling</option>
              <option value="capeBased">CAPE-Based</option>
              <option value="fixedPercentage">Fixed % Drawdown</option>
              <option value="principalProtectionRule">Principal Protection Rule</option>
            </select>
          </label>

          {strategy === 'fourPercentRule' && (
            <div className="text-sm border-t pt-2">
              <h3 className="font mb-2">Withdraw 4% of starting porfolio and adjust for inflation each year.</h3>
            </div>
          )}

          {strategy === 'fourPercentRuleUpwardReset' && (
            <div className="text-sm border-t pt-2">
              <h3 className="font mb-2">Same as 4%, but if the portfolio grows, reset withdrawals to 4% of the new balance. Spending never goes down—only holds steady or resets upward—providing a growing income when markets rise while protecting against cuts in down years.</h3>
            </div>
          )}

          {strategy === 'guytonKlinger' && (
            <div className="text-sm border-t pt-2">
              <h3 className="font-semibold mb-2">Guyton-Klinger allows for starting with a higher withdrawal rate. Around 4.5%, and ajusts bases on guardrails.</h3>
              <div className="grid grid-cols-2 gap-2">
                <label className="block">Guardrail Lower (%)
                  <input type="number" className="mt-1 w-full border rounded-xl p-2 bg-white dark:bg-slate-700 dark:border-slate-600" value={guytonKlingerParams.guardrailLower * 100} onChange={e => setGuytonKlingerParams({ ...guytonKlingerParams, guardrailLower: parseFloat(e.target.value) / 100 })} />
                </label>
                <label className="block">Guardrail Upper (%)
                  <input type="number" className="mt-1 w-full border rounded-xl p-2 bg-white dark:bg-slate-700 dark:border-slate-600" value={guytonKlingerParams.guardrailUpper * 100} onChange={e => setGuytonKlingerParams({ ...guytonKlingerParams, guardrailUpper: parseFloat(e.target.value) / 100 })} />
                </label>
                <label className="block">Raise Percentage (%)
                  <input type="number" className="mt-1 w-full border rounded-xl p-2 bg-white dark:bg-slate-700 dark:border-slate-600" value={guytonKlingerParams.raisePercentage * 100} onChange={e => setGuytonKlingerParams({ ...guytonKlingerParams, raisePercentage: parseFloat(e.target.value) / 100 })} />
                </label>
                <label className="block">Cut Percentage (%)
                  <input type="number" className="mt-1 w-full border rounded-xl p-2 bg-white dark:bg-slate-700 dark:border-slate-600" value={guytonKlingerParams.cutPercentage * 100} onChange={e => setGuytonKlingerParams({ ...guytonKlingerParams, cutPercentage: parseFloat(e.target.value) / 100 })} />
                </label>
              </div>
            </div>
          )}

          {strategy === 'fixedPercentage' && (
            <div className="space-y-2 text-sm border-t pt-2">
              <h3 className="font-semibold">Fixed % Parameters</h3>
              <label className="block">Withdrawal Rate (%)
                <input type="number" className="mt-1 w-full border rounded-xl p-2 bg-white dark:bg-slate-700 dark:border-slate-600" value={fixedPercentageParams.withdrawalRate * 100} onChange={e => setFixedPercentageParams({...fixedPercentageParams, withdrawalRate: parseFloat(e.target.value) / 100})} />
              </label>
            </div>
          )}

          {strategy === 'principalProtectionRule' && (
            <div className="text-sm border-t pt-2">
              <h3 className="font-semibold mb-2">Parameters</h3>
                <p className="text-xs text-slate-600">This strategy uses the global initial withdrawal amount and inflation settings.</p>
            </div>
          )}

          {strategy === 'floorAndCeiling' && (
            <div className="space-y-2 text-sm border-t pt-2">
              <h3 className="font-semibold">Floor and Ceiling Parameters</h3>
              <label className="block">Floor (%)
                <input type="number" className="mt-1 w-full border rounded-xl p-2 bg-white dark:bg-slate-700 dark:border-slate-600" value={floorAndCeilingParams.floor * 100} step={1} onChange={e => setFloorAndCeilingParams({...floorAndCeilingParams, floor: parseFloat(e.target.value) / 100})} />
              </label>
              <label className="block">Ceiling (%)
                <input type="number" className="mt-1 w-full border rounded-xl p-2 bg-white dark:bg-slate-700 dark:border-slate-600" value={floorAndCeilingParams.ceiling * 100} step={1} onChange={e => setFloorAndCeilingParams({...floorAndCeilingParams, ceiling: parseFloat(e.target.value) / 100})} />
              </label>
            </div>
          )}

          {strategy === 'capeBased' && (
            <div className="space-y-2 text-sm border-t pt-2">
              <h3 className="font-semibold">CAPE-Based Parameters</h3>
              <label className="block">Base Percentage (%)
                <input type="number" className="mt-1 w-full border rounded-xl p-2 bg-white dark:bg-slate-700 dark:border-slate-600" value={capeBasedParams.basePercentage * 100} onChange={e => setCapeBasedParams({...capeBasedParams, basePercentage: parseFloat(e.target.value) / 100})} />
              </label>
              <label className="block">CAPE Fraction
                <input type="number" className="mt-1 w-full border rounded-xl p-2 bg-white dark:bg-slate-700 dark:border-slate-600" value={capeBasedParams.capeFraction} step={0.1} onChange={e => setCapeBasedParams({...capeBasedParams, capeFraction: parseFloat(e.target.value)})} />
              </label>
            </div>
          )}

          <label className="block text-sm pt-2 border-t">Horizon (years)
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

      <MinimizedChartsBar chartStates={chartStates} onRestore={toggleMinimize} activeTab="drawdown" />

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

      <section className="bg-white dark:bg-slate-800 rounded-2xl shadow p-4">
        <h2 className="font-semibold mb-2">Strategy Explainers</h2>
        <div className="space-y-4 text-sm">
          {strategy === 'guytonKlinger' && (
            <div>
              <h3 className="font-semibold">Guyton-Klinger</h3>
              <p>This strategy uses guardrails to adjust spending. If the withdrawal rate exceeds a certain upper limit, spending is cut. If it falls below a lower limit, spending is increased. Inflation adjustments are skipped in years with negative returns.</p>
              <a href="https://www.kitces.com/blog/guyton-klinger-guardrails-retirement-income-rules-risk-based/" target="_blank" rel="noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline">Learn more at Kitces.com</a>
            </div>
          )}
          {strategy === 'floorAndCeiling' && (
            <div>
              <h3 className="font-semibold">Floor and Ceiling</h3>
              <p>This strategy withdraws a fixed percentage of the portfolio each year, but the withdrawal amount is not allowed to go above a certain ceiling or below a certain floor, both defined as a percentage of the initial withdrawal amount.</p>
              <a href="https://help.timeline.co/en/articles/8028620-withdrawal-rules-floor-ceiling" target="_blank" rel="noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline">Learn more at Timeline.co</a>
            </div>
          )}
          {strategy === 'capeBased' && (
            <div>
              <h3 className="font-semibold">CAPE-Based</h3>
              <p>This strategy adjusts the withdrawal rate based on the Cyclically-Adjusted Price-to-Earnings (CAPE) ratio. The withdrawal rate is calculated as a base percentage plus a fraction of the CAPE yield (1 / CAPE).</p>
              <a href="https://jsevy.com/wordpress/index.php/finance-and-retirement/variable-withdrawal-schemes-guyton-klinger-dynamic-spending-and-cape-based/" target="_blank" rel="noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline">Learn more at jsevy.com</a>
            </div>
          )}
          {strategy === 'fixedPercentage' && (
            <div>
              <h3 className="font-semibold">Fixed % Drawdown</h3>
              <p>This strategy withdraws a fixed percentage of the remaining portfolio balance each year. For example, if the rate is 4% and the portfolio is worth $1M, you'd withdraw $40,000. If the portfolio grows to $1.2M next year, you'd withdraw $48,000.</p>
            </div>
          )}
          {strategy === 'principalProtectionRule' && (
            <div>
              <h3 className="font-semibold">Principal Protection Rule</h3>
              <p>A 4% Rule strategy, except that you don't withdraw at all if it's below starting value. This would be used for Donations if funds allow.</p>
            </div>
          )}
          {strategy === 'fourPercentRule' && (
            <div>
              <h3 className="font-semibold">4% Rule</h3>
              <p>The 4% rule is a guideline that suggests you can withdraw 4% of your portfolio's initial value in the first year of retirement. In subsequent years, you adjust the withdrawal amount for inflation. This strategy is the default for the other tabs in this tool.</p>
            </div>
          )}
          {strategy === 'fourPercentRuleUpwardReset' && (
            <div>
              <h3 className="font-semibold">4% Rule – Upward Reset</h3>
              <p>Start at 4%. If the portfolio grows, reset withdrawals to 4% of the new balance. Spending never goes down—only holds steady or resets upward—providing a growing income when markets rise while protecting against cuts in down years.</p>
            </div>
          )}
        </div>
      </section>

      <footer className="text-xs text-slate-600 dark:text-slate-400">
        <div>Assumptions: ...</div>
      </footer>
    </div>
  );
};

export default DrawdownTab;

import React, { useMemo } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, Area, AreaChart, CartesianGrid, ReferenceDot } from "recharts";
import type { DrawdownStrategies } from "../App";
import { SP500_TOTAL_RETURNS, NASDAQ100_TOTAL_RETURNS } from "../data/returns";
import { pctToMult, bootstrapSample, shuffle, percentile, calculateDrawdownStats } from "../lib/simulation";

// ... (imports)

// Custom RunResult for portfolio simulation
// Custom RunResult for portfolio simulation
type PortfolioRunResult = {
  balances: { total: number; cash: number; spy: number; qqq: number }[];
  withdrawals: number[];
  failedYear: number | null;
  guardrailTriggers: number[];
};

function simulateGuytonKlinger(
  spyReturns: number[],
  qqqReturns: number[],
  initialCash: number,
  initialSpy: number,
  initialQqq: number,
  horizon: number,
  initialWithdrawalRate: number,
  inflationRate: number,
  inflationAdjust: boolean,
  guardrailUpper: number,
  guardrailLower: number,
  cutPercentage: number,
  raisePercentage: number
): PortfolioRunResult {
  const balances = new Array(horizon + 1).fill(0).map(() => ({ total: 0, cash: 0, spy: 0, qqq: 0 }));
  const withdrawals = new Array(horizon).fill(0);
  const guardrailTriggers: number[] = [];
  let cash = initialCash;
  let spy = initialSpy;
  let qqq = initialQqq;
  const startBalance = initialCash + initialSpy + initialQqq;
  let withdrawalAmount = startBalance * initialWithdrawalRate;

  balances[0] = { total: startBalance, cash, spy, qqq };
  let failedYear: number | null = null;

  for (let y = 0; y < horizon; y++) {
    withdrawals[y] = withdrawalAmount;

    // Drawdown from cash first
    const fromCash = Math.min(withdrawalAmount, cash);
    cash -= fromCash;
    let remainingWithdrawal = withdrawalAmount - fromCash;

    if (remainingWithdrawal > 0) {
      // This is a simplified drawdown, will be replaced with the selected strategy
      const fromSpy = Math.min(remainingWithdrawal, spy);
      spy -= fromSpy;
      remainingWithdrawal -= fromSpy;

      if (remainingWithdrawal > 0) {
        const fromQqq = Math.min(remainingWithdrawal, qqq);
        qqq -= fromQqq;
      }
    }

    const totalBeforeGrowth = cash + spy + qqq;
    if (totalBeforeGrowth <= 0 && failedYear === null) {
      failedYear = y + 1;
      for (let i = y + 1; i <= horizon; i++) {
        balances[i] = { total: 0, cash: 0, spy: 0, qqq: 0 };
      }
      break;
    }

    // Apply market returns
    const portfolioBeforeGrowth = totalBeforeGrowth;
    spy *= spyReturns[y];
    qqq *= qqqReturns[y];
    const portfolioAfterGrowth = cash + spy + qqq;
    const lastYearReturn = (portfolioAfterGrowth / portfolioBeforeGrowth) - 1;

    const totalAfterGrowth = cash + spy + qqq;
    balances[y + 1] = { total: totalAfterGrowth, cash, spy, qqq };

    // Determine next year's withdrawal amount
    let nextWithdrawalAmount = withdrawalAmount;

    // Inflation adjustment
    if (inflationAdjust && lastYearReturn >= 0) {
      nextWithdrawalAmount *= (1 + inflationRate);
    }

    // Guardrail adjustments
    const currentWithdrawalRate = nextWithdrawalAmount / totalAfterGrowth;
    if (y < horizon - 15) { // Longevity rule
      if (currentWithdrawalRate > initialWithdrawalRate * (1 + guardrailUpper)) {
        nextWithdrawalAmount *= (1 - cutPercentage);
        guardrailTriggers.push(y + 1);
      } else if (currentWithdrawalRate < initialWithdrawalRate * (1 - guardrailLower)) {
        nextWithdrawalAmount *= (1 + raisePercentage);
        guardrailTriggers.push(y + 1);
      }
    }
    withdrawalAmount = nextWithdrawalAmount;
  }

  return { balances, withdrawals, failedYear, guardrailTriggers };
}

function simulateFloorAndCeiling(
  spyReturns: number[],
  qqqReturns: number[],
  initialCash: number,
  initialSpy: number,
  initialQqq: number,
  horizon: number,
  initialWithdrawalRate: number,
  inflationRate: number,
  inflationAdjust: boolean,
  floor: number,
  ceiling: number
): PortfolioRunResult {
  const balances = new Array(horizon + 1).fill(0).map(() => ({ total: 0, cash: 0, spy: 0, qqq: 0 }));
  const withdrawals = new Array(horizon).fill(0);
  let cash = initialCash;
  let spy = initialSpy;
  let qqq = initialQqq;
  const startBalance = initialCash + initialSpy + initialQqq;
  const initialWithdrawalAmount = startBalance * initialWithdrawalRate;
  let withdrawalAmount = initialWithdrawalAmount;

  balances[0] = { total: startBalance, cash, spy, qqq };
  let failedYear: number | null = null;

  for (let y = 0; y < horizon; y++) {
    // Determine withdrawal amount
    let currentWithdrawal = balances[y].total * initialWithdrawalRate;
    const floorAmount = initialWithdrawalAmount * (1 - floor);
    const ceilingAmount = initialWithdrawalAmount * (1 + ceiling);

    currentWithdrawal = Math.max(currentWithdrawal, floorAmount);
    currentWithdrawal = Math.min(currentWithdrawal, ceilingAmount);

    if (inflationAdjust) {
      currentWithdrawal *= Math.pow(1 + inflationRate, y);
    }

    withdrawalAmount = currentWithdrawal;
    withdrawals[y] = withdrawalAmount;

    // Drawdown from cash first
    const fromCash = Math.min(withdrawalAmount, cash);
    cash -= fromCash;
    let remainingWithdrawal = withdrawalAmount - fromCash;

    if (remainingWithdrawal > 0) {
      // This is a simplified drawdown, will be replaced with the selected strategy
      const fromSpy = Math.min(remainingWithdrawal, spy);
      spy -= fromSpy;
      remainingWithdrawal -= fromSpy;

      if (remainingWithdrawal > 0) {
        const fromQqq = Math.min(remainingWithdrawal, qqq);
        qqq -= fromQqq;
      }
    }

    const totalBeforeGrowth = cash + spy + qqq;
    if (totalBeforeGrowth <= 0 && failedYear === null) {
      failedYear = y + 1;
      for (let i = y + 1; i <= horizon; i++) {
        balances[i] = { total: 0, cash: 0, spy: 0, qqq: 0 };
      }
      break;
    }

    // Apply market returns
    spy *= spyReturns[y];
    qqq *= qqqReturns[y];

    const totalAfterGrowth = cash + spy + qqq;
    balances[y + 1] = { total: totalAfterGrowth, cash, spy, qqq };
  }

  return { balances, withdrawals, failedYear, guardrailTriggers: [] };
}

function simulateFixedPercentage(
  spyReturns: number[],
  qqqReturns: number[],
  initialCash: number,
  initialSpy: number,
  initialQqq: number,
  horizon: number,
  withdrawalRate: number,
): PortfolioRunResult {
  const balances = new Array(horizon + 1).fill(0).map(() => ({ total: 0, cash: 0, spy: 0, qqq: 0 }));
  const withdrawals = new Array(horizon).fill(0);
  let cash = initialCash;
  let spy = initialSpy;
  let qqq = initialQqq;
  const startBalance = initialCash + initialSpy + initialQqq;

  balances[0] = { total: startBalance, cash, spy, qqq };
  let failedYear: number | null = null;

  for (let y = 0; y < horizon; y++) {
    const withdrawalAmount = balances[y].total * withdrawalRate;
    withdrawals[y] = withdrawalAmount;

    // Drawdown from cash first
    const fromCash = Math.min(withdrawalAmount, cash);
    cash -= fromCash;
    let remainingWithdrawal = withdrawalAmount - fromCash;

    if (remainingWithdrawal > 0) {
      // This is a simplified drawdown, will be replaced with the selected strategy
      const fromSpy = Math.min(remainingWithdrawal, spy);
      spy -= fromSpy;
      remainingWithdrawal -= fromSpy;

      if (remainingWithdrawal > 0) {
        const fromQqq = Math.min(remainingWithdrawal, qqq);
        qqq -= fromQqq;
      }
    }

    const totalBeforeGrowth = cash + spy + qqq;
    if (totalBeforeGrowth <= 0 && failedYear === null) {
      failedYear = y + 1;
      for (let i = y + 1; i <= horizon; i++) {
        balances[i] = { total: 0, cash: 0, spy: 0, qqq: 0 };
      }
      break;
    }

    // Apply market returns
    spy *= spyReturns[y];
    qqq *= qqqReturns[y];

    const totalAfterGrowth = cash + spy + qqq;
    balances[y + 1] = { total: totalAfterGrowth, cash, spy, qqq };
  }

  return { balances, withdrawals, failedYear, guardrailTriggers: [] };
}

function simulateCapeBased(
  spyReturns: number[],
  qqqReturns: number[],
  initialCash: number,
  initialSpy: number,
  initialQqq: number,
  horizon: number,
  basePercentage: number,
  capeFraction: number,
  capeData: { [year: number]: number }
): PortfolioRunResult {
  const balances = new Array(horizon + 1).fill(0).map(() => ({ total: 0, cash: 0, spy: 0, qqq: 0 }));
  const withdrawals = new Array(horizon).fill(0);
  let cash = initialCash;
  let spy = initialSpy;
  let qqq = initialQqq;
  const startBalance = initialCash + initialSpy + initialQqq;

  balances[0] = { total: startBalance, cash, spy, qqq };
  let failedYear: number | null = null;

  for (let y = 0; y < horizon; y++) {
    const currentYear = new Date().getFullYear() - horizon + y;
    const cape = capeData[currentYear] || 25; // Default to 25 if no data
    const capeYield = 1 / cape;
    const withdrawalRate = basePercentage + capeFraction * capeYield;
    const withdrawalAmount = balances[y].total * withdrawalRate;

    withdrawals[y] = withdrawalAmount;

    // Drawdown from cash first
    const fromCash = Math.min(withdrawalAmount, cash);
    cash -= fromCash;
    let remainingWithdrawal = withdrawalAmount - fromCash;

    if (remainingWithdrawal > 0) {
      // This is a simplified drawdown, will be replaced with the selected strategy
      const fromSpy = Math.min(remainingWithdrawal, spy);
      spy -= fromSpy;
      remainingWithdrawal -= fromSpy;

      if (remainingWithdrawal > 0) {
        const fromQqq = Math.min(remainingWithdrawal, qqq);
        qqq -= fromQqq;
      }
    }

    const totalBeforeGrowth = cash + spy + qqq;
    if (totalBeforeGrowth <= 0 && failedYear === null) {
      failedYear = y + 1;
      for (let i = y + 1; i <= horizon; i++) {
        balances[i] = { total: 0, cash: 0, spy: 0, qqq: 0 };
      }
      break;
    }

    // Apply market returns
    spy *= spyReturns[y];
    qqq *= qqqReturns[y];

    const totalAfterGrowth = cash + spy + qqq;
    balances[y + 1] = { total: totalAfterGrowth, cash, spy, qqq };
  }

  return { balances, withdrawals, failedYear, guardrailTriggers: [] };
}


interface DrawdownTabProps {
  startBalance: number;
  cash: number;
  spy: number;
  qqq: number;
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

import { CAPE_DATA } from "../data/cape";

const DrawdownTab: React.FC<DrawdownTabProps> = ({
  startBalance,
  cash,
  spy,
  qqq,
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
  const [strategy, setStrategy] = React.useState<DrawdownStrategies>("guytonKlinger");
  const [guytonKlingerParams, setGuytonKlingerParams] = React.useState({
    guardrailUpper: 0.2,
    guardrailLower: 0.2,
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
      if (strategy === "guytonKlinger") {
        runs.push(simulateGuytonKlinger(spyReturns, qqqReturns, cash, spy, qqq, horizon, initialW, inflationRate, inflationAdjust, guytonKlingerParams.guardrailUpper, guytonKlingerParams.guardrailLower, guytonKlingerParams.cutPercentage, guytonKlingerParams.raisePercentage));
      } else if (strategy === "floorAndCeiling") {
        runs.push(simulateFloorAndCeiling(spyReturns, qqqReturns, cash, spy, qqq, horizon, initialW, inflationRate, inflationAdjust, floorAndCeilingParams.floor, floorAndCeilingParams.ceiling));
      } else if (strategy === "capeBased") {
        runs.push(simulateCapeBased(spyReturns, qqqReturns, cash, spy, qqq, horizon, capeBasedParams.basePercentage, capeBasedParams.capeFraction, CAPE_DATA));
      } else if (strategy === "fixedPercentage") {
        runs.push(simulateFixedPercentage(spyReturns, qqqReturns, cash, spy, qqq, horizon, fixedPercentageParams.withdrawalRate));
      }
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
        if (strategy === "guytonKlinger") {
          runs.push(simulateGuytonKlinger(spyReturns, qqqReturns, cash, spy, qqq, horizon, initialW, inflationRate, inflationAdjust, guytonKlingerParams.guardrailUpper, guytonKlingerParams.guardrailLower, guytonKlingerParams.cutPercentage, guytonKlingerParams.raisePercentage));
        } else if (strategy === "floorAndCeiling") {
          runs.push(simulateFloorAndCeiling(spyReturns, qqqReturns, cash, spy, qqq, horizon, initialW, inflationRate, inflationAdjust, floorAndCeilingParams.floor, floorAndCeilingParams.ceiling));
        } else if (strategy === "capeBased") {
          runs.push(simulateCapeBased(spyReturns, qqqReturns, cash, spy, qqq, horizon, capeBasedParams.basePercentage, capeBasedParams.capeFraction, CAPE_DATA));
        } else if (strategy === "fixedPercentage") {
          runs.push(simulateFixedPercentage(spyReturns, qqqReturns, cash, spy, qqq, horizon, fixedPercentageParams.withdrawalRate));
        }
      }
    }
    return runs;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cash, spy, qqq, horizon, initialWithdrawalAmount, inflationRate, inflationAdjust, mode, numRuns, startYear, returnsByYear, startBalance, years, refreshCounter, strategy, guytonKlingerParams, floorAndCeilingParams, capeBasedParams, fixedPercentageParams]);


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
              value={strategy}
              onChange={e => setStrategy(e.target.value as DrawdownStrategies)}
            >
              <option value="guytonKlinger">Guyton-Klinger</option>
              <option value="floorAndCeiling">Floor and Ceiling</option>
              <option value="capeBased">CAPE-Based</option>
              <option value="fixedPercentage">Fixed % Drawdown</option>
            </select>
          </label>

          {strategy === 'guytonKlinger' && (
            <div className="space-y-2 text-sm border-t pt-2">
              <h3 className="font-semibold">Guyton-Klinger Parameters</h3>
              <label className="block">Guardrail Upper (%)
                <input type="number" className="mt-1 w-full border rounded-xl p-2" value={guytonKlingerParams.guardrailUpper * 100} onChange={e => setGuytonKlingerParams({...guytonKlingerParams, guardrailUpper: parseFloat(e.target.value) / 100})} />
              </label>
              <label className="block">Guardrail Lower (%)
                <input type="number" className="mt-1 w-full border rounded-xl p-2" value={guytonKlingerParams.guardrailLower * 100} onChange={e => setGuytonKlingerParams({...guytonKlingerParams, guardrailLower: parseFloat(e.target.value) / 100})} />
              </label>
              <label className="block">Cut Percentage (%)
                <input type="number" className="mt-1 w-full border rounded-xl p-2" value={guytonKlingerParams.cutPercentage * 100} onChange={e => setGuytonKlingerParams({...guytonKlingerParams, cutPercentage: parseFloat(e.target.value) / 100})} />
              </label>
              <label className="block">Raise Percentage (%)
                <input type="number" className="mt-1 w-full border rounded-xl p-2" value={guytonKlingerParams.raisePercentage * 100} onChange={e => setGuytonKlingerParams({...guytonKlingerParams, raisePercentage: parseFloat(e.target.value) / 100})} />
              </label>
            </div>
          )}

          {strategy === 'fixedPercentage' && (
            <div className="space-y-2 text-sm border-t pt-2">
              <h3 className="font-semibold">Fixed % Parameters</h3>
              <label className="block">Withdrawal Rate (%)
                <input type="number" className="mt-1 w-full border rounded-xl p-2" value={fixedPercentageParams.withdrawalRate * 100} onChange={e => setFixedPercentageParams({...fixedPercentageParams, withdrawalRate: parseFloat(e.target.value) / 100})} />
              </label>
            </div>
          )}

          {strategy === 'floorAndCeiling' && (
            <div className="space-y-2 text-sm border-t pt-2">
              <h3 className="font-semibold">Floor and Ceiling Parameters</h3>
              <label className="block">Floor (%)
                <input type="number" className="mt-1 w-full border rounded-xl p-2" value={floorAndCeilingParams.floor * 100} step={1} onChange={e => setFloorAndCeilingParams({...floorAndCeilingParams, floor: parseFloat(e.target.value) / 100})} />
              </label>
              <label className="block">Ceiling (%)
                <input type="number" className="mt-1 w-full border rounded-xl p-2" value={floorAndCeilingParams.ceiling * 100} step={1} onChange={e => setFloorAndCeilingParams({...floorAndCeilingParams, ceiling: parseFloat(e.target.value) / 100})} />
              </label>
            </div>
          )}

          {strategy === 'capeBased' && (
            <div className="space-y-2 text-sm border-t pt-2">
              <h3 className="font-semibold">CAPE-Based Parameters</h3>
              <label className="block">Base Percentage (%)
                <input type="number" className="mt-1 w-full border rounded-xl p-2" value={capeBasedParams.basePercentage * 100} onChange={e => setCapeBasedParams({...capeBasedParams, basePercentage: parseFloat(e.target.value) / 100})} />
              </label>
              <label className="block">CAPE Fraction
                <input type="number" className="mt-1 w-full border rounded-xl p-2" value={capeBasedParams.capeFraction} step={0.1} onChange={e => setCapeBasedParams({...capeBasedParams, capeFraction: parseFloat(e.target.value)})} />
              </label>
            </div>
          )}

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
                  triggered: sampleRun.guardrailTriggers.includes(i),
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
      </section>

      <section className="bg-white rounded-2xl shadow p-4">
        <h2 className="font-semibold mb-2">Strategy Explainers</h2>
        <div className="space-y-4 text-sm">
          {strategy === 'guytonKlinger' && (
            <div>
              <h3 className="font-semibold">Guyton-Klinger</h3>
              <p>This strategy uses guardrails to adjust spending. If the withdrawal rate exceeds a certain upper limit, spending is cut. If it falls below a lower limit, spending is increased. Inflation adjustments are skipped in years with negative returns.</p>
              <a href="https://www.kitces.com/blog/guyton-klinger-guardrails-retirement-income-rules-risk-based/" target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">Learn more at Kitces.com</a>
            </div>
          )}
          {strategy === 'floorAndCeiling' && (
            <div>
              <h3 className="font-semibold">Floor and Ceiling</h3>
              <p>This strategy withdraws a fixed percentage of the portfolio each year, but the withdrawal amount is not allowed to go above a certain ceiling or below a certain floor, both defined as a percentage of the initial withdrawal amount.</p>
              <a href="https://help.timeline.co/en/articles/8028620-withdrawal-rules-floor-ceiling" target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">Learn more at Timeline.co</a>
            </div>
          )}
          {strategy === 'capeBased' && (
            <div>
              <h3 className="font-semibold">CAPE-Based</h3>
              <p>This strategy adjusts the withdrawal rate based on the Cyclically-Adjusted Price-to-Earnings (CAPE) ratio. The withdrawal rate is calculated as a base percentage plus a fraction of the CAPE yield (1 / CAPE).</p>
              <a href="https://jsevy.com/wordpress/index.php/finance-and-retirement/variable-withdrawal-schemes-guyton-klinger-dynamic-spending-and-cape-based/" target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">Learn more at jsevy.com</a>
            </div>
          )}
          {strategy === 'fixedPercentage' && (
            <div>
              <h3 className="font-semibold">Fixed % Drawdown</h3>
              <p>This strategy withdraws a fixed percentage of the remaining portfolio balance each year. For example, if the rate is 4% and the portfolio is worth $1M, you'd withdraw $40,000. If the portfolio grows to $1.2M next year, you'd withdraw $48,000.</p>
            </div>
          )}
        </div>
      </section>

      <footer className="text-xs text-slate-600">
        <div>Assumptions: ...</div>
      </footer>
    </div>
  );
};

export default DrawdownTab;

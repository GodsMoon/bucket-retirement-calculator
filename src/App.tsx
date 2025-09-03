import { useState, useEffect } from "react";
import { usePersistentState } from "./hooks/usePersistentState";
import { useMemo, useCallback } from "react";
import TabNavigation from "./components/TabNavigation";
import SPTab from "./components/S&P500Tab";
import Nasdaq100Tab from "./components/Nasdaq100Tab";
import PortfolioTab from "./components/PortfolioTab";
import DrawdownTab from "./components/DrawdownTab";
import ProfileSelector, { type Profile } from "./components/ProfileSelector";
import ThemeToggle from "./components/ThemeToggle";
import DataTab from "./components/DataTab";
import { useData } from "./data/DataContext";

export interface ChartState {
  minimized: boolean;
  title: string;
  tab: "sp500" | "nasdaq100" | "portfolio" | "drawdown";
  size: 'full' | 'half';
}

export type DrawdownStrategy =
  | "cashFirst_spyThenQqq"
  | "cashFirst_qqqThenSpy"
  | "cashFirst_equalParts"
  | "cashFirst_bestPerformer"
  | "cashFirst_worstPerformer";

export type DrawdownStrategies =
  | "guytonKlinger"
  | "floorAndCeiling"
  | "capeBased"
  | "fixedPercentage"
  | "principalProtectionRule"
  | "fourPercentRule"
  | "fourPercentRuleUpwardReset";


export default function App() {
  const round2 = (n: number) => Math.round(n * 100) / 100;
  const [darkMode, setDarkMode] = usePersistentState("darkMode", false);
  const [activeTab, setActiveTab] = useState<
    "sp500" | "nasdaq100" | "portfolio" | "drawdown" | "data"
  >("sp500");
  const { sp500, nasdaq100, bitcoin: bitcoinReturns, bonds: bondReturns } = useData();

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace('#', '');
      if (
        hash === 'sp500' ||
        hash === 'nasdaq100' ||
        hash === 'portfolio' ||
        hash === 'drawdown' ||
        hash === 'data'
      ) {
        setActiveTab(hash as typeof activeTab);
      }
    };
    handleHashChange();
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  useEffect(() => {
    window.location.hash = activeTab;
  }, [activeTab]);

  const years = useMemo(() => {
    const spyYears = new Set(sp500.map(d => d.year));
    const qqqYears = new Set(nasdaq100.map(d => d.year));
    const btcYears = new Set(bitcoinReturns.map(d => d.year));
    const bondYears = new Set(bondReturns.map(d => d.year));
    return Array.from(spyYears)
      .filter(y => qqqYears.has(y) && btcYears.has(y) && bondYears.has(y))
      .sort((a, b) => a - b);
  }, [sp500, nasdaq100, bitcoinReturns, bondReturns]);

  const defaultParams = {
    startBalance: 1_000_000,
    cash: 100_000,
    spy: 450_000,
    qqq: 450_000,
    bitcoin: 0,
    bonds: 0,
    drawdownStrategy: "cashFirst_spyThenQqq" as DrawdownStrategy,
    drawdownWithdrawalStrategy: "fourPercentRule" as DrawdownStrategies,
    horizon: 30,
    withdrawRate: 4,
    initialWithdrawalAmount: Math.round(1_000_000 * (4 / 100)),
    isFirstWithdrawLocked: false,
    inflationAdjust: true,
    inflationRate: 0.02,
    mode: "actual-seq-random-start" as "actual-seq" | "actual-seq-random-start" | "random-shuffle" | "bootstrap",
    numRuns: 1000,
    seed: "" as number | "",
    startYear: years[0],
  };

  const loadProfileData = (name: Profile) => {
    const stored = localStorage.getItem(`profile_${name}`);
    if (stored) {
      try {
        return { ...defaultParams, ...JSON.parse(stored) };
      } catch {
        // ignore parse errors
      }
    }
    return defaultParams;
  };

  const [profile, setProfile] = useState<Profile>(() => (localStorage.getItem("activeProfile") as Profile) || "Default");
  const initialProfile = loadProfileData(profile);

  const [cash, setCash] = useState(initialProfile.cash);
  const [spy, setSpy] = useState(initialProfile.spy);
  const [qqq, setQqq] = useState(initialProfile.qqq);
  const [bitcoin, setBitcoin] = useState(initialProfile.bitcoin);
  const [bonds, setBonds] = useState(initialProfile.bonds);
  const portfolioStartBalance = useMemo(() => cash + spy + qqq + bitcoin + bonds, [cash, spy, qqq, bitcoin, bonds]);
  const [startBalance, setStartBalance] = useState(initialProfile.startBalance);
  const [drawdownStrategy, setDrawdownStrategy] = useState<DrawdownStrategy>(initialProfile.drawdownStrategy);
  const [drawdownWithdrawalStrategy, setDrawdownWithdrawalStrategy] = useState<DrawdownStrategies>(initialProfile.drawdownWithdrawalStrategy);
  const [horizon, setHorizon] = useState(initialProfile.horizon);
  const [withdrawRate, setWithdrawRate] = useState(initialProfile.withdrawRate); // % of initial
  const [initialWithdrawalAmount, setInitialWithdrawalAmount] = useState(initialProfile.initialWithdrawalAmount);
  const [isFirstWithdrawLocked, setIsInitialAmountLocked] = useState(initialProfile.isFirstWithdrawLocked);
  const [inflationAdjust, setInflationAdjust] = useState(initialProfile.inflationAdjust);
  const [inflationRate, setInflationRate] = useState(initialProfile.inflationRate); // 2%
  const [mode, setMode] = useState<"actual-seq" | "actual-seq-random-start" | "random-shuffle" | "bootstrap">(initialProfile.mode);
  const [numRuns, setNumRuns] = useState(initialProfile.numRuns);
  const [seed, setSeed] = useState<number | "">(initialProfile.seed);
  const [refreshCounter, setRefreshCounter] = useState(0);
  const [startYear, setStartYear] = useState<number>(initialProfile.startYear);
  const [chartStates, setChartStates] = useState<Record<string, ChartState>>({
    "sp500-trajectory": { minimized: false, title: "Portfolio Trajectory Bands", tab: "sp500", size: 'full' },
    "sp500-median-trajectory": { minimized: false, title: "Median Sample Run Trajectory", tab: "sp500", size: 'half' },
    "sp500-sample": { minimized: false, title: "Sample Run 1 Trajectory", tab: "sp500", size: 'half' },
    "sp500-sample-2-trajectory": { minimized: false, title: "Sample Run 2 Trajectory", tab: "sp500", size: 'half' },
    "sp500-sample-3-trajectory": { minimized: false, title: "Sample Run 3 Trajectory", tab: "sp500", size: 'half' },
    "sp500-sample-4-trajectory": { minimized: false, title: "Sample Run 4 Trajectory", tab: "sp500", size: 'half' },
    "sp500-sample-5-trajectory": { minimized: false, title: "Sample Run 5 Trajectory", tab: "sp500", size: 'half' },
    "nasdaq100-trajectory": { minimized: false, title: "Portfolio Trajectory Bands", tab: "nasdaq100", size: 'full' },
    "nasdaq100-median-trajectory": { minimized: false, title: "Median Sample Run Trajectory", tab: "nasdaq100", size: 'half' },
    "nasdaq100-sample": { minimized: false, title: "Sample Run 1 Trajectory", tab: "nasdaq100", size: 'half' },
    "nasdaq100-sample-2-trajectory": { minimized: false, title: "Sample Run 2 Trajectory", tab: "nasdaq100", size: 'half' },
    "nasdaq100-sample-3-trajectory": { minimized: false, title: "Sample Run 3 Trajectory", tab: "nasdaq100", size: 'half' },
    "nasdaq100-sample-4-trajectory": { minimized: false, title: "Sample Run 4 Trajectory", tab: "nasdaq100", size: 'half' },
    "nasdaq100-sample-5-trajectory": { minimized: false, title: "Sample Run 5 Trajectory", tab: "nasdaq100", size: 'half' },
    "portfolio-trajectory": { minimized: false, title: "Portfolio Trajectory Bands", tab: "portfolio", size: 'full' },
    "portfolio-median-asset-allocation": { minimized: false, title: "Median Sample Run Asset Allocation", tab: "portfolio", size: 'half' },
    "portfolio-median-trajectory": { minimized: false, title: "Median Sample Run Trajectory", tab: "portfolio", size: 'half' },
    "portfolio-asset-allocation": { minimized: false, title: "Sample Run 1 Asset Allocation", tab: "portfolio", size: 'half' },
    "drawdown-trajectory": { minimized: false, title: "Portfolio Trajectory Bands", tab: "drawdown", size: 'full' },
    "drawdown-median-asset-allocation": { minimized: false, title: "Median Sample Run Asset Allocation", tab: "drawdown", size: 'half' },
    "drawdown-median-trajectory": { minimized: false, title: "Median Sample Run Trajectory", tab: "drawdown", size: 'half' },
    "drawdown-asset-allocation": { minimized: false, title: "Sample Run 1 Asset Allocation", tab: "drawdown", size: 'half' },
    "portfolio-sample-2-asset-allocation": { minimized: false, title: "Sample Run 2 Asset Allocation", tab: "portfolio", size: 'half' },
    "portfolio-sample-3-asset-allocation": { minimized: false, title: "Sample Run 3 Asset Allocation", tab: "portfolio", size: 'half' },
    "portfolio-sample-4-asset-allocation": { minimized: false, title: "Sample Run 4 Asset Allocation", tab: "portfolio", size: 'half' },
    "portfolio-sample-5-asset-allocation": { minimized: false, title: "Sample Run 5 Asset Allocation", tab: "portfolio", size: 'half' },
    "portfolio-sample": { minimized: false, title: "Sample Run 1 Trajectory", tab: "portfolio", size: 'half' },
    "portfolio-sample-2-trajectory": { minimized: false, title: "Sample Run 2 Trajectory", tab: "portfolio", size: 'half' },
    "portfolio-sample-3-trajectory": { minimized: false, title: "Sample Run 3 Trajectory", tab: "portfolio", size: 'half' },
    "portfolio-sample-4-trajectory": { minimized: false, title: "Sample Run 4 Trajectory", tab: "portfolio", size: 'half' },
    "portfolio-sample-5-trajectory": { minimized: false, title: "Sample Run 5 Trajectory", tab: "portfolio", size: 'half' },
    "drawdown-sample": { minimized: false, title: "Sample Run 1 Trajectory", tab: "drawdown", size: 'half' },
    "drawdown-sample-2-asset-allocation": { minimized: false, title: "Sample Run 2 Asset Allocation", tab: "drawdown", size: 'half' },
    "drawdown-sample-3-asset-allocation": { minimized: false, title: "Sample Run 3 Asset Allocation", tab: "drawdown", size: 'half' },
    "drawdown-sample-4-asset-allocation": { minimized: false, title: "Sample Run 4 Asset Allocation", tab: "drawdown", size: 'half' },
    "drawdown-sample-5-asset-allocation": { minimized: false, title: "Sample Run 5 Asset Allocation", tab: "drawdown", size: 'half' },
    "drawdown-sample-2-trajectory": { minimized: false, title: "Sample Run 2 Trajectory", tab: "drawdown", size: 'half' },
    "drawdown-sample-3-trajectory": { minimized: false, title: "Sample Run 3 Trajectory", tab: "drawdown", size: 'half' },
    "drawdown-sample-4-trajectory": { minimized: false, title: "Sample Run 4 Trajectory", tab: "drawdown", size: 'half' },
    "drawdown-sample-5-trajectory": { minimized: false, title: "Sample Run 5 Trajectory", tab: "drawdown", size: 'half' },
  });

  // Ensure new chart IDs are present even across hot reloads
  useEffect(() => {
    setChartStates(prev => {
      const next = { ...prev };
      const ensure = (id: string, state: ChartState) => { if (!next[id]) next[id] = state; };
      // SP500
      ensure("sp500-median-trajectory", { minimized: false, title: "Median Sample Run Trajectory", tab: "sp500", size: 'half' });
      [2,3,4,5].forEach(i => ensure(`sp500-sample-${i}-trajectory`, { minimized: false, title: `Sample Run ${i} Trajectory`, tab: 'sp500', size: 'half' }));
      // Nasdaq100
      ensure("nasdaq100-median-trajectory", { minimized: false, title: "Median Sample Run Trajectory", tab: "nasdaq100", size: 'half' });
      [2,3,4,5].forEach(i => ensure(`nasdaq100-sample-${i}-trajectory`, { minimized: false, title: `Sample Run ${i} Trajectory`, tab: 'nasdaq100', size: 'half' }));
      // Portfolio
      ensure("portfolio-median-trajectory", { minimized: false, title: "Median Sample Run Trajectory", tab: "portfolio", size: 'half' });
      ensure("portfolio-median-asset-allocation", { minimized: false, title: "Median Sample Run Asset Allocation", tab: "portfolio", size: 'half' });
      ensure("portfolio-asset-allocation", { minimized: false, title: "Sample Run 1 Asset Allocation", tab: "portfolio", size: 'half' });
      [2,3,4,5].forEach(i => {
        ensure(`portfolio-sample-${i}-trajectory`, { minimized: false, title: `Sample Run ${i} Trajectory`, tab: 'portfolio', size: 'half' });
        ensure(`portfolio-sample-${i}-asset-allocation`, { minimized: false, title: `Sample Run ${i} Asset Allocation`, tab: 'portfolio', size: 'half' });
      });
      // Drawdown
      ensure("drawdown-median-trajectory", { minimized: false, title: "Median Sample Run Trajectory", tab: "drawdown", size: 'half' });
      ensure("drawdown-median-asset-allocation", { minimized: false, title: "Median Sample Run Asset Allocation", tab: "drawdown", size: 'half' });
      ensure("drawdown-asset-allocation", { minimized: false, title: "Sample Run 1 Asset Allocation", tab: "drawdown", size: 'half' });
      [2,3,4,5].forEach(i => {
        ensure(`drawdown-sample-${i}-trajectory`, { minimized: false, title: `Sample Run ${i} Trajectory`, tab: 'drawdown', size: 'half' });
        ensure(`drawdown-sample-${i}-asset-allocation`, { minimized: false, title: `Sample Run ${i} Asset Allocation`, tab: 'drawdown', size: 'half' });
      });
      return next;
    });
  }, []);

  const [chartOrder, setChartOrder] = useState<Record<string, string[]>>({
    sp500: [
      "sp500-trajectory",
      "sp500-median-trajectory",
      "sp500-sample",
      "sp500-sample-2-trajectory",
      "sp500-sample-3-trajectory",
      "sp500-sample-4-trajectory",
      "sp500-sample-5-trajectory",
    ],
    nasdaq100: [
      "nasdaq100-trajectory",
      "nasdaq100-median-trajectory",
      "nasdaq100-sample",
      "nasdaq100-sample-2-trajectory",
      "nasdaq100-sample-3-trajectory",
      "nasdaq100-sample-4-trajectory",
      "nasdaq100-sample-5-trajectory",
    ],
    // Portfolio: Trajectory Bands (full), then all others half-size.
    // Order: Median Trajectory, Median Asset Allocation, then Sample X Trajectory, Sample X Asset Allocation.
    portfolio: [
      "portfolio-trajectory",
      "portfolio-median-trajectory",
      "portfolio-median-asset-allocation",
      "portfolio-sample",
      "portfolio-asset-allocation",
      "portfolio-sample-2-trajectory",
      "portfolio-sample-2-asset-allocation",
      "portfolio-sample-3-trajectory",
      "portfolio-sample-3-asset-allocation",
      "portfolio-sample-4-trajectory",
      "portfolio-sample-4-asset-allocation",
      "portfolio-sample-5-trajectory",
      "portfolio-sample-5-asset-allocation",
    ],
    // Drawdown: same ordering rules as Portfolio.
    drawdown: [
      "drawdown-trajectory",
      "drawdown-median-trajectory",
      "drawdown-median-asset-allocation",
      "drawdown-sample",
      "drawdown-asset-allocation",
      "drawdown-sample-2-trajectory",
      "drawdown-sample-2-asset-allocation",
      "drawdown-sample-3-trajectory",
      "drawdown-sample-3-asset-allocation",
      "drawdown-sample-4-trajectory",
      "drawdown-sample-4-asset-allocation",
      "drawdown-sample-5-trajectory",
      "drawdown-sample-5-asset-allocation",
    ],
  });

  const toggleMinimize = useCallback((chartId: string) => {
    setChartStates(prevStates => {
      const next = { ...prevStates, [chartId]: { ...prevStates[chartId], minimized: !prevStates[chartId].minimized } };
      if (!next[chartId].minimized) {
        const tab = next[chartId].tab;
        setChartOrder(prevOrder => {
          const order = prevOrder[tab];
          const newOrder = [chartId, ...order.filter(id => id !== chartId)];
          return { ...prevOrder, [tab]: newOrder };
        });
      }
      return next;
    });
  }, []);

  const toggleSize = useCallback((chartId: string) => {
    setChartStates(prev => ({
      ...prev,
      [chartId]: { ...prev[chartId], size: prev[chartId].size === 'half' ? 'full' : 'half' },
    }));
  }, []);

  const handleProfileChange = (p: Profile) => {
    const data = loadProfileData(p);
    setProfile(p);
    setCash(data.cash);
    setSpy(data.spy);
    setQqq(data.qqq);
    setBitcoin(data.bitcoin);
    setBonds(data.bonds);
    setStartBalance(data.startBalance);
    setDrawdownStrategy(data.drawdownStrategy);
    setDrawdownWithdrawalStrategy(data.drawdownWithdrawalStrategy);
    setHorizon(data.horizon);
    setWithdrawRate(data.withdrawRate);
    setInitialWithdrawalAmount(data.initialWithdrawalAmount);
    setIsInitialAmountLocked(data.isFirstWithdrawLocked);
    setInflationAdjust(data.inflationAdjust);
    setInflationRate(data.inflationRate);
    setMode(data.mode);
    setNumRuns(data.numRuns);
    setSeed(data.seed);
    setStartYear(data.startYear);
    localStorage.setItem("activeProfile", p);
  };

  const handleParamChange = (param: string, value: unknown) => {
    switch (param) {
      case 'startBalance': setStartBalance(parseFloat(value as string)); break;
      case 'cash': setCash(parseFloat(value as string)); break;
      case 'spy': setSpy(parseFloat(value as string)); break;
      case 'qqq': setQqq(parseFloat(value as string)); break;
      case 'bitcoin': setBitcoin(parseFloat(value as string)); break;
      case 'bonds': setBonds(parseFloat(value as string)); break;
      case 'allocation':
        if (typeof value === 'object' && value !== null) {
          const allocation = value as { cash: number; spy: number; qqq: number; bitcoin: number; bonds: number };
          setCash(allocation.cash);
          setSpy(allocation.spy);
          setQqq(allocation.qqq);
          setBitcoin(allocation.bitcoin);
          setBonds(allocation.bonds);
        }
        break;
      case 'drawdownStrategy': setDrawdownStrategy(value as DrawdownStrategy); break;
      case 'drawdownWithdrawalStrategy': setDrawdownWithdrawalStrategy(value as DrawdownStrategies); break;
      case 'horizon': setHorizon(parseFloat(value as string)); break;
      case 'withdrawRate': {
        const newRate = round2(parseFloat(value as string));
        setWithdrawRate(newRate);
        setInitialWithdrawalAmount(Math.round(activeStartBalance * (newRate / 100)));
        break;
      }
      case 'initialWithdrawalAmount': {
        const newAmount = parseFloat(value as string);
        setInitialWithdrawalAmount(newAmount);
        // Do not round to 2 decimals here; keep precision so small dollar amounts
        // do not collapse to 0% and reset the $ field while typing.
        const computedRate = (activeStartBalance === 0) ? 0 : ((newAmount / activeStartBalance) * 100);
        setWithdrawRate(computedRate);
        break;
      }
      case 'inflationAdjust': setInflationAdjust(value as boolean); break;
      case 'inflationRate': setInflationRate(parseFloat(value as string)); break;
      case 'mode': setMode(value as "actual-seq" | "actual-seq-random-start" | "random-shuffle" | "bootstrap"); break;
      case 'numRuns': setNumRuns(parseFloat(value as string)); break;
      case 'seed': setSeed(value === "" ? "" : parseFloat(value as string)); break;
      case 'startYear': setStartYear(parseFloat(value as string)); break;
    }
  };

  useEffect(() => {
    const data = {
      startBalance,
      cash,
      spy,
      qqq,
      bitcoin,
      bonds,
      drawdownStrategy,
      drawdownWithdrawalStrategy,
      horizon,
      withdrawRate,
      initialWithdrawalAmount,
      isFirstWithdrawLocked,
      inflationAdjust,
      inflationRate,
      mode,
      numRuns,
      seed,
      startYear,
    };
    localStorage.setItem(`profile_${profile}`, JSON.stringify(data));
    localStorage.setItem("activeProfile", profile);
  }, [profile, startBalance, cash, spy, qqq, bitcoin, bonds, drawdownStrategy, drawdownWithdrawalStrategy, horizon, withdrawRate, initialWithdrawalAmount, isFirstWithdrawLocked, inflationAdjust, inflationRate, mode, numRuns, seed, startYear]);

  const activeStartBalance = (activeTab === 'sp500' || activeTab === 'nasdaq100')
    ? startBalance
    : portfolioStartBalance;

  // Effect to update EITHER initialWithdrawalAmount OR withdrawRate if startBalance changes.
  useEffect(() => {
    if (isFirstWithdrawLocked) {
      // If locked, first withdrawal amount is king. Recalculate rate.
      const newRate = round2((initialWithdrawalAmount / activeStartBalance) * 100);
      if (withdrawRate !== newRate) {
        setWithdrawRate(newRate);
      }
    } else {
      // If unlocked, withdraw rate is king. Recalculate initial amount.
      const newAmount = activeStartBalance * (withdrawRate / 100);
      if (initialWithdrawalAmount !== Math.round(newAmount)) {
        setInitialWithdrawalAmount(Math.round(newAmount));
      }
    }
  }, [activeStartBalance, isFirstWithdrawLocked, initialWithdrawalAmount, withdrawRate, setWithdrawRate, setInitialWithdrawalAmount]);

  const handleRefresh = useCallback(() => {
    setRefreshCounter(prev => prev + 1);
  }, []);

  return (
    <div className={darkMode ? "dark" : ""}>
      <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-900 dark:text-slate-100 p-4 md:p-6">
        <div className="max-w-6xl mx-auto space-y-6">
          <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <h1 className="text-2xl md:text-3xl font-bold">4% Rule Tester — Monte Carlo</h1>
            <ThemeToggle darkMode={darkMode} toggleDarkMode={() => setDarkMode(prev => !prev)} />
          </header>

        <ProfileSelector
          activeProfile={profile}
          onProfileChange={handleProfileChange}
        />

        <TabNavigation
          activeTab={activeTab}
          onTabChange={setActiveTab}
        />

        {activeTab === 'sp500' && (
          <SPTab
            startBalance={startBalance}
            horizon={horizon}
            withdrawRate={withdrawRate}
            initialWithdrawalAmount={initialWithdrawalAmount}
            isInitialAmountLocked={isFirstWithdrawLocked}
            inflationAdjust={inflationAdjust}
            inflationRate={inflationRate}
            mode={mode}
            numRuns={numRuns}
            seed={seed}
            startYear={startYear}
            onRefresh={handleRefresh}
            onParamChange={handleParamChange}
            setIsInitialAmountLocked={setIsInitialAmountLocked}
            refreshCounter={refreshCounter}
            chartStates={chartStates}
            toggleMinimize={toggleMinimize}
            toggleSize={toggleSize}
            chartOrder={chartOrder.sp500}
            onReorderChartOrder={(order) => setChartOrder(prev => ({ ...prev, sp500: order }))}
          />
        )}

        {activeTab === 'nasdaq100' && (
          <Nasdaq100Tab
            startBalance={startBalance}
            horizon={horizon}
            withdrawRate={withdrawRate}
            initialWithdrawalAmount={initialWithdrawalAmount}
            isInitialAmountLocked={isFirstWithdrawLocked}
            inflationAdjust={inflationAdjust}
            inflationRate={inflationRate}
            mode={mode}
            numRuns={numRuns}
            seed={seed}
            startYear={startYear}
            onRefresh={handleRefresh}
            onParamChange={handleParamChange}
            setIsInitialAmountLocked={setIsInitialAmountLocked}
            refreshCounter={refreshCounter}
            chartStates={chartStates}
            toggleMinimize={toggleMinimize}
            toggleSize={toggleSize}
            chartOrder={chartOrder.nasdaq100}
            onReorderChartOrder={(order) => setChartOrder(prev => ({ ...prev, nasdaq100: order }))}
          />
        )}

        {activeTab === 'portfolio' && (
          <PortfolioTab
            startBalance={portfolioStartBalance}
            cash={cash}
            spy={spy}
            qqq={qqq}
            bitcoin={bitcoin}
            bonds={bonds}
            drawdownStrategy={drawdownStrategy}
            horizon={horizon}
            withdrawRate={withdrawRate}
            initialWithdrawalAmount={initialWithdrawalAmount}
            isInitialAmountLocked={isFirstWithdrawLocked}
            inflationAdjust={inflationAdjust}
            inflationRate={inflationRate}
            mode={mode}
            numRuns={numRuns}
            seed={seed}
            startYear={startYear}
            onRefresh={handleRefresh}
            onParamChange={handleParamChange}
            setIsInitialAmountLocked={setIsInitialAmountLocked}
            refreshCounter={refreshCounter}
            chartStates={chartStates}
            toggleMinimize={toggleMinimize}
            toggleSize={toggleSize}
            chartOrder={chartOrder.portfolio}
            onReorderChartOrder={(order) => setChartOrder(prev => ({ ...prev, portfolio: order }))}
          />
        )}

        {activeTab === 'drawdown' && (
          <DrawdownTab
            drawdownWithdrawalStrategy={drawdownWithdrawalStrategy}
            startBalance={portfolioStartBalance}
            cash={cash}
            spy={spy}
            qqq={qqq}
            bitcoin={bitcoin}
            bonds={bonds}
            horizon={horizon}
            withdrawRate={withdrawRate}
            initialWithdrawalAmount={initialWithdrawalAmount}
            isInitialAmountLocked={isFirstWithdrawLocked}
            inflationAdjust={inflationAdjust}
            inflationRate={inflationRate}
            mode={mode}
            numRuns={numRuns}
            seed={seed}
            startYear={startYear}
            onRefresh={handleRefresh}
            onParamChange={handleParamChange}
            setIsInitialAmountLocked={setIsInitialAmountLocked}
            refreshCounter={refreshCounter}
            chartStates={chartStates}
            toggleMinimize={toggleMinimize}
            toggleSize={toggleSize}
            chartOrder={chartOrder.drawdown}
            onReorderChartOrder={(order) => setChartOrder(prev => ({ ...prev, drawdown: order }))}
          />
        )}
        {activeTab === 'data' && <DataTab />}
        </div>
      </div>
    </div>
  );
}

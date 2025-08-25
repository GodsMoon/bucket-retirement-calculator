import { useState, useEffect } from "react";
import { usePersistentState } from "./hooks/usePersistentState";
import { useMemo } from "react";
import { SP500_TOTAL_RETURNS, NASDAQ100_TOTAL_RETURNS } from "./data/returns";
import { TEN_YEAR_TREASURY_TOTAL_RETURNS } from "./data/bonds";
import TabNavigation from "./components/TabNavigation";
import SPTab from "./components/S&P500Tab";
import Nasdaq100Tab from "./components/Nasdaq100Tab";
import PortfolioTab from "./components/PortfolioTab";
import DrawdownTab from "./components/DrawdownTab";
import ProfileSelector, { type Profile } from "./components/ProfileSelector";
import ThemeToggle from "./components/ThemeToggle";

export interface ChartState {
  minimized: boolean;
  title: string;
  tab: "sp500" | "nasdaq100" | "portfolio" | "drawdown";
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
  const [activeTab, setActiveTab] = useState<"sp500" | "nasdaq100" | "portfolio" | "drawdown">("sp500");

  const years = useMemo(() => {
    const spyYears = new Set(SP500_TOTAL_RETURNS.map(d => d.year));
    const qqqYears = new Set(NASDAQ100_TOTAL_RETURNS.map(d => d.year));
    const bondYears = new Set(TEN_YEAR_TREASURY_TOTAL_RETURNS.map(d => d.year));
    return Array.from(spyYears).filter(y => qqqYears.has(y) && bondYears.has(y)).sort((a, b) => a - b);
  }, []);

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
    mode: "actual-seq" as "actual-seq" | "actual-seq-random-start" | "random-shuffle" | "bootstrap",
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
    "sp500-trajectory": { minimized: false, title: "Portfolio Trajectory Bands", tab: "sp500" },
    "sp500-sample": { minimized: false, title: "Sample Run Trajectory", tab: "sp500" },
    "nasdaq100-trajectory": { minimized: false, title: "Portfolio Trajectory Bands", tab: "nasdaq100" },
    "nasdaq100-sample": { minimized: false, title: "Sample Run Trajectory", tab: "nasdaq100" },
    "portfolio-trajectory": { minimized: false, title: "Portfolio Trajectory Bands", tab: "portfolio" },
    "portfolio-median-asset-allocation": { minimized: false, title: "Median Sample Run Asset Allocation", tab: "portfolio" },
    "portfolio-median-trajectory": { minimized: false, title: "Median Sample Run Trajectory", tab: "portfolio" },
    "portfolio-asset-allocation": { minimized: false, title: "Sample Run 1 Asset Allocation", tab: "portfolio" },
    "drawdown-trajectory": { minimized: false, title: "Portfolio Trajectory Bands", tab: "drawdown" },
    "drawdown-median-asset-allocation": { minimized: false, title: "Median Sample Run Asset Allocation", tab: "drawdown" },
    "drawdown-median-trajectory": { minimized: false, title: "Median Sample Run Trajectory", tab: "drawdown" },
    "drawdown-asset-allocation": { minimized: false, title: "Sample Run 1 Asset Allocation", tab: "drawdown" },
    "portfolio-sample-2-asset-allocation": { minimized: true, title: "Sample Run 2 Asset Allocation", tab: "portfolio" },
    "portfolio-sample-3-asset-allocation": { minimized: true, title: "Sample Run 3 Asset Allocation", tab: "portfolio" },
    "portfolio-sample-4-asset-allocation": { minimized: true, title: "Sample Run 4 Asset Allocation", tab: "portfolio" },
    "portfolio-sample-5-asset-allocation": { minimized: true, title: "Sample Run 5 Asset Allocation", tab: "portfolio" },
    "portfolio-sample": { minimized: false, title: "Sample Run 1 Trajectory", tab: "portfolio" },
    "portfolio-sample-2-trajectory": { minimized: true, title: "Sample Run 2 Trajectory", tab: "portfolio" },
    "portfolio-sample-3-trajectory": { minimized: true, title: "Sample Run 3 Trajectory", tab: "portfolio" },
    "portfolio-sample-4-trajectory": { minimized: true, title: "Sample Run 4 Trajectory", tab: "portfolio" },
    "portfolio-sample-5-trajectory": { minimized: true, title: "Sample Run 5 Trajectory", tab: "portfolio" },
    "drawdown-sample": { minimized: false, title: "Sample Run 1 Trajectory", tab: "drawdown" },
    "drawdown-sample-2-asset-allocation": { minimized: true, title: "Sample Run 2 Asset Allocation", tab: "drawdown" },
    "drawdown-sample-3-asset-allocation": { minimized: true, title: "Sample Run 3 Asset Allocation", tab: "drawdown" },
    "drawdown-sample-4-asset-allocation": { minimized: true, title: "Sample Run 4 Asset Allocation", tab: "drawdown" },
    "drawdown-sample-5-asset-allocation": { minimized: true, title: "Sample Run 5 Asset Allocation", tab: "drawdown" },
    "drawdown-sample-2-trajectory": { minimized: true, title: "Sample Run 2 Trajectory", tab: "drawdown" },
    "drawdown-sample-3-trajectory": { minimized: true, title: "Sample Run 3 Trajectory", tab: "drawdown" },
    "drawdown-sample-4-trajectory": { minimized: true, title: "Sample Run 4 Trajectory", tab: "drawdown" },
    "drawdown-sample-5-trajectory": { minimized: true, title: "Sample Run 5 Trajectory", tab: "drawdown" },
  });

  const [chartOrder, setChartOrder] = useState<Record<string, string[]>>({
    sp500: ["sp500-trajectory", "sp500-sample"],
    nasdaq100: ["nasdaq100-trajectory", "nasdaq100-sample"],
    portfolio: ["portfolio-trajectory", "portfolio-median-trajectory", "portfolio-median-asset-allocation", "portfolio-asset-allocation", "portfolio-sample"],
    drawdown: ["drawdown-trajectory", "drawdown-median-trajectory", "drawdown-median-asset-allocation", "drawdown-asset-allocation", "drawdown-sample"],
  });

  const toggleMinimize = (chartId: string) => {
    const newChartStates = { ...chartStates };
    newChartStates[chartId].minimized = !newChartStates[chartId].minimized;
    setChartStates(newChartStates);

    if (!newChartStates[chartId].minimized) {
      const tab = newChartStates[chartId].tab;
      const order = chartOrder[tab];
      const newOrder = [chartId, ...order.filter(id => id !== chartId)];
      setChartOrder(prev => ({ ...prev, [tab]: newOrder }));
    }
  };

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
        setWithdrawRate(round2((newAmount / activeStartBalance) * 100));
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

  const handleRefresh = () => {
    setRefreshCounter(prev => prev + 1);
  };

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
            chartOrder={chartOrder.sp500}
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
            chartOrder={chartOrder.nasdaq100}
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
            chartOrder={chartOrder.portfolio}
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
            chartOrder={chartOrder.drawdown}
          />
        )}
        </div>
      </div>
    </div>
  );
}

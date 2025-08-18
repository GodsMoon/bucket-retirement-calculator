import { useState, useEffect } from "react";
import { useMemo } from "react";
import TabNavigation from "./components/TabNavigation";
import SPTab from "./components/S&P500Tab";
import Nasdaq100Tab from "./components/Nasdaq100Tab";
import PortfolioTab from "./components/PortfolioTab";
import DrawdownTab from "./components/DrawdownTab";

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
  | "fixedPercentage";


export default function App() {
  const round2 = (n: number) => Math.round(n * 100) / 100;
  const [activeTab, setActiveTab] = useState<"sp500" | "nasdaq100" | "portfolio" | "drawdown">("sp500");
  const [cash, setCash] = useState(100_000);
  const [spy, setSpy] = useState(450_000);
  const [qqq, setQqq] = useState(450_000);
  const portfolioStartBalance = useMemo(() => cash + spy + qqq, [cash, spy, qqq]);
  const [startBalance, setStartBalance] = useState(1_000_000);
  const [drawdownStrategy, setDrawdownStrategy] = useState<DrawdownStrategy>("cashFirst_spyThenQqq");
  const [horizon, setHorizon] = useState(30);
  const [withdrawRate, setWithdrawRate] = useState(4); // % of initial
  const [initialWithdrawalAmount, setInitialWithdrawalAmount] = useState(Math.round(startBalance * (4 / 100)));
  const [isInitialAmountLocked, setIsInitialAmountLocked] = useState(false);
  const [inflationAdjust, setInflationAdjust] = useState(true);
  const [inflationRate, setInflationRate] = useState(0.02); // 2%
  const [mode, setMode] = useState<"actual-seq" | "actual-seq-random-start" | "random-shuffle" | "bootstrap">("actual-seq");
  const [numRuns, setNumRuns] = useState(1000);
  const [seed, setSeed] = useState<number | "">("");
  const [refreshCounter, setRefreshCounter] = useState(0);
  const [startYear, setStartYear] = useState<number>(1986); // Default start year

  const handleParamChange = (param: string, value: string | number | boolean) => {
    switch (param) {
      case 'startBalance': setStartBalance(parseFloat(value as string)); break;
      case 'cash': setCash(parseFloat(value as string)); break;
      case 'spy': setSpy(parseFloat(value as string)); break;
      case 'qqq': setQqq(parseFloat(value as string)); break;
      case 'drawdownStrategy': setDrawdownStrategy(value as DrawdownStrategy); break;
      case 'horizon': setHorizon(parseFloat(value as string)); break;
      case 'withdrawRate':
        setWithdrawRate(round2(parseFloat(value as string)));
        break;
      case 'initialWithdrawalAmount':
        setInitialWithdrawalAmount(parseFloat(value as string));
        break;
      case 'inflationAdjust': setInflationAdjust(value as boolean); break;
      case 'inflationRate': setInflationRate(parseFloat(value as string)); break;
      case 'mode': setMode(value as "actual-seq" | "actual-seq-random-start" | "random-shuffle" | "bootstrap"); break;
      case 'numRuns': setNumRuns(parseFloat(value as string)); break;
      case 'seed': setSeed(value === "" ? "" : parseFloat(value as string)); break;
      case 'startYear': setStartYear(parseFloat(value as string)); break;
    }
  };

  const activeStartBalance = (activeTab === 'sp500' || activeTab === 'nasdaq100')
    ? startBalance
    : portfolioStartBalance;

  // Effect to update EITHER initialWithdrawalAmount OR withdrawRate if startBalance changes.
  useEffect(() => {
    if (isInitialAmountLocked) {
      // If locked, initial withdrawal amount is king. Recalculate rate.
      const newRate = round2((initialWithdrawalAmount / activeStartBalance) * 100);
      if (withdrawRate !== newRate) {
        setWithdrawRate(newRate);
      }
    } else {
      // If not locked, withdraw rate is king. Recalculate initial amount.
      const newAmount = activeStartBalance * (withdrawRate / 100);
      if (initialWithdrawalAmount !== Math.round(newAmount)) {
        setInitialWithdrawalAmount(Math.round(newAmount));
      }
    }
  }, [activeStartBalance, isInitialAmountLocked, initialWithdrawalAmount, withdrawRate, setWithdrawRate, setInitialWithdrawalAmount]);

  const handleRefresh = () => {
    setRefreshCounter(prev => prev + 1);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <header className="flex items-center justify-between">
          <h1 className="text-2xl md:text-3xl font-bold">4% Rule Tester — Monte Carlo</h1>
        </header>

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
            isInitialAmountLocked={isInitialAmountLocked}
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
          />
        )}

        {activeTab === 'nasdaq100' && (
          <Nasdaq100Tab
            startBalance={startBalance}
            horizon={horizon}
            withdrawRate={withdrawRate}
            initialWithdrawalAmount={initialWithdrawalAmount}
            isInitialAmountLocked={isInitialAmountLocked}
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
          />
        )}

        {activeTab === 'portfolio' && (
          <PortfolioTab
            startBalance={portfolioStartBalance}
            cash={cash}
            spy={spy}
            qqq={qqq}
            drawdownStrategy={drawdownStrategy}
            horizon={horizon}
            withdrawRate={withdrawRate}
            initialWithdrawalAmount={initialWithdrawalAmount}
            isInitialAmountLocked={isInitialAmountLocked}
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
          />
        )}

        {activeTab === 'drawdown' && (
          <DrawdownTab
            startBalance={portfolioStartBalance}
            cash={cash}
            spy={spy}
            qqq={qqq}
            horizon={horizon}
            withdrawRate={withdrawRate}
            initialWithdrawalAmount={initialWithdrawalAmount}
            isInitialAmountLocked={isInitialAmountLocked}
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
          />
        )}
      </div>
    </div>
  );
}

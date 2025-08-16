import React, { useMemo, useState, useEffect } from "react";
import TabNavigation from "./components/TabNavigation";
import SPTab from "./components/S&P500Tab";
import Nasdaq100Tab from "./components/Nasdaq100Tab";

export default function App() {
  const [activeTab, setActiveTab] = useState<"sp500" | "nasdaq100">("sp500");
  const [startBalance, setStartBalance] = useState(1_000_000);
  const [horizon, setHorizon] = useState(30);
  const [withdrawRate, setWithdrawRate] = useState(4); // % of initial
  const [initialWithdrawalAmount, setInitialWithdrawalAmount] = useState(startBalance * (4 / 100));
  const [inflationAdjust, setInflationAdjust] = useState(true);
  const [inflationRate, setInflationRate] = useState(0.02); // 2%
  const [mode, setMode] = useState<"actual-seq" | "actual-seq-random-start" | "random-shuffle" | "bootstrap">("actual-seq");
  const [numRuns, setNumRuns] = useState(1000);
  const [seed, setSeed] = useState<number | "">("");
  const [refreshCounter, setRefreshCounter] = useState(0);
  const [startYear, setStartYear] = useState<number>(1986); // Default start year

  const handleParamChange = (param: string, value: any) => {
    switch (param) {
      case 'startBalance':
        setStartBalance(value);
        // Recalculate initial withdrawal amount based on new start balance and current withdraw rate
        setInitialWithdrawalAmount(value * (withdrawRate / 100));
        break;
      case 'horizon': setHorizon(value); break;
      case 'withdrawRate':
        setWithdrawRate(value);
        // Update initial withdrawal amount based on new rate
        setInitialWithdrawalAmount(startBalance * (value / 100));
        break;
      case 'initialWithdrawalAmount':
        setInitialWithdrawalAmount(value);
        // Update withdraw rate based on new amount
        setWithdrawRate((value / startBalance) * 100);
        break;
      case 'inflationAdjust': setInflationAdjust(value); break;
      case 'inflationRate': setInflationRate(value); break;
      case 'mode': setMode(value); break;
      case 'numRuns': setNumRuns(value); break;
      case 'seed': setSeed(value); break;
      case 'startYear': setStartYear(value); break;
    }
  };

  // Effect to update initialWithdrawalAmount if startBalance changes from outside (e.g., initial load)
  useEffect(() => {
    setInitialWithdrawalAmount(startBalance * (withdrawRate / 100));
  }, [startBalance, withdrawRate]);

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
            inflationAdjust={inflationAdjust}
            inflationRate={inflationRate}
            mode={mode}
            numRuns={numRuns}
            seed={seed}
            startYear={startYear}
            onRefresh={handleRefresh}
            onParamChange={handleParamChange}
            refreshCounter={refreshCounter}
          />
        )}

        {activeTab === 'nasdaq100' && (
          <Nasdaq100Tab
            startBalance={startBalance}
            horizon={horizon}
            withdrawRate={withdrawRate}
            initialWithdrawalAmount={initialWithdrawalAmount}
            inflationAdjust={inflationAdjust}
            inflationRate={inflationRate}
            mode={mode}
            numRuns={numRuns}
            seed={seed}
            startYear={startYear}
            onRefresh={handleRefresh}
            onParamChange={handleParamChange}
            refreshCounter={refreshCounter}
          />
        )}
      </div>
    </div>
  );
}

import React from 'react';

interface TabNavigationProps {
  activeTab: "sp500" | "nasdaq100" | "portfolio" | "drawdown";
  onTabChange: (tab: "sp500" | "nasdaq100" | "portfolio" | "drawdown") => void;
}

const TabNavigation: React.FC<TabNavigationProps> = ({ activeTab, onTabChange }) => {
  const baseTabClass =
    "px-3 sm:px-4 py-2 font-medium text-sm sm:text-base";
  const activeClass =
    "text-blue-600 border-b-2 border-blue-600 dark:text-blue-400 dark:border-blue-400";
  const inactiveClass =
    "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200";

  return (
    <div className="flex overflow-x-auto whitespace-nowrap border-b border-slate-200 dark:border-slate-700 mb-6">
      <button
        className={`${baseTabClass} ${activeTab === 'sp500' ? activeClass : inactiveClass}`}
        onClick={() => onTabChange('sp500')}
      >
        S&P 500
      </button>
      <button
        className={`${baseTabClass} ${activeTab === 'nasdaq100' ? activeClass : inactiveClass}`}
        onClick={() => onTabChange('nasdaq100')}
      >
        NASDAQ 100
      </button>
      <button
        className={`${baseTabClass} ${activeTab === 'portfolio' ? activeClass : inactiveClass}`}
        onClick={() => onTabChange('portfolio')}
      >
        Portfolio
      </button>
      <button
        className={`${baseTabClass} ${activeTab === 'drawdown' ? activeClass : inactiveClass}`}
        onClick={() => onTabChange('drawdown')}
      >
        Drawdown Strategies
      </button>
    </div>
  );
};

export default TabNavigation;

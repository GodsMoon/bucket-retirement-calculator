import React from 'react';

interface TabNavigationProps {
  activeTab: "sp500" | "nasdaq100" | "portfolio" | "drawdown";
  onTabChange: (tab: "sp500" | "nasdaq100" | "portfolio" | "drawdown") => void;
}

const TabNavigation: React.FC<TabNavigationProps> = ({ activeTab, onTabChange }) => {
  return (
    <div className="flex border-b border-slate-200 dark:border-slate-700 mb-6">
      <button
        className={`px-4 py-2 font-medium ${activeTab === 'sp500'
          ? 'text-blue-600 border-b-2 border-blue-600 dark:text-blue-400 dark:border-blue-400'
          : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'}`}
        onClick={() => onTabChange('sp500')}
      >
        S&P 500
      </button>
      <button
        className={`px-4 py-2 font-medium ${activeTab === 'nasdaq100'
          ? 'text-blue-600 border-b-2 border-blue-600 dark:text-blue-400 dark:border-blue-400'
          : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'}`}
        onClick={() => onTabChange('nasdaq100')}
      >
        NASDAQ 100
      </button>
      <button
        className={`px-4 py-2 font-medium ${activeTab === 'portfolio'
          ? 'text-blue-600 border-b-2 border-blue-600 dark:text-blue-400 dark:border-blue-400'
          : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'}`}
        onClick={() => onTabChange('portfolio')}
      >
        Portfolio
      </button>
      <button
        className={`px-4 py-2 font-medium ${activeTab === 'drawdown'
          ? 'text-blue-600 border-b-2 border-blue-600 dark:text-blue-400 dark:border-blue-400'
          : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'}`}
        onClick={() => onTabChange('drawdown')}
      >
        Drawdown Strategies
      </button>
    </div>
  );
};

export default TabNavigation;

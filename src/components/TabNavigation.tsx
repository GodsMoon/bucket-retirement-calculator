import React from 'react';

interface TabNavigationProps {
  activeTab: "sp500" | "nasdaq100";
  onTabChange: (tab: "sp500" | "nasdaq100") => void;
}

const TabNavigation: React.FC<TabNavigationProps> = ({ activeTab, onTabChange }) => {
  return (
    <div className="flex border-b border-slate-200 mb-6">
      <button
        className={`px-4 py-2 font-medium ${activeTab === 'sp500' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
        onClick={() => onTabChange('sp500')}
      >
        S&P 500
      </button>
      <button
        className={`px-4 py-2 font-medium ${activeTab === 'nasdaq100' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
        onClick={() => onTabChange('nasdaq100')}
      >
        NASDAQ 100
      </button>
    </div>
  );
};

export default TabNavigation;
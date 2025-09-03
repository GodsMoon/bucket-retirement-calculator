import React from 'react';
import type { ChartState } from '../App';
import { getChartColor } from '../chartColors';

interface MinimizedChartsBarProps {
  chartStates: Record<string, ChartState>;
  onRestore: (chartId: string) => void;
  activeTab: 'sp500' | 'nasdaq100' | 'portfolio' | 'drawdown';
}

const MinimizedChartsBar: React.FC<MinimizedChartsBarProps> = ({ chartStates, onRestore, activeTab }) => {
  const minimizedCharts = Object.entries(chartStates).filter(([, state]) => state.minimized && state.tab === activeTab);

  if (minimizedCharts.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-2 mb-4">
      <h3 className="text-sm font-semibold self-center">Charts:</h3>
      {minimizedCharts.map(([id, chart]) => (
        <button
          key={id}
          onClick={() => onRestore(id)}
          className={`${getChartColor(id).chip} px-3 py-1 rounded-full text-sm hover:opacity-80 transition-colors`}
        >
          {chart.title} +
        </button>
      ))}
    </div>
  );
};

export default React.memo(MinimizedChartsBar);

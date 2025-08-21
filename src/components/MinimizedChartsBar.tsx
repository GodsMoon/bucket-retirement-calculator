import React from 'react';
import type { ChartState, ChartType } from '../App';

interface MinimizedChartsBarProps {
  chartStates: Record<string, ChartState>;
  onRestore: (chartId: string) => void;
}

const MinimizedChartsBar: React.FC<MinimizedChartsBarProps> = ({ chartStates, onRestore }) => {
  const minimizedCharts = Object.entries(chartStates).filter(([, state]) => state.minimized);

  if (minimizedCharts.length === 0) {
    return null;
  }

  const getChartChipClasses = (chartType: ChartType) => {
    const baseClasses = "text-slate-700 dark:text-slate-200 px-3 py-1 rounded-full text-sm";
    switch (chartType) {
      case 'trajectory-bands':
        return `${baseClasses} bg-blue-200 dark:bg-blue-800 hover:bg-blue-300 dark:hover:bg-blue-700`;
      case 'sample-trajectory':
        return `${baseClasses} bg-green-200 dark:bg-green-800 hover:bg-green-300 dark:hover:bg-green-700`;
      case 'asset-allocation':
        return `${baseClasses} bg-purple-200 dark:bg-purple-800 hover:bg-purple-300 dark:hover:bg-purple-700`;
      default:
        return `${baseClasses} bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600`;
    }
  };

  return (
    <div className="flex flex-wrap gap-2 mb-4">
      <h3 className="text-sm font-semibold self-center">Charts:</h3>
      {minimizedCharts.map(([id, chart]) => (
        <button
          key={id}
          onClick={() => onRestore(id)}
          className={getChartChipClasses(chart.chartType)}
        >
        {chart.title} +
        </button>
      ))}
    </div>
  );
};

export default MinimizedChartsBar;

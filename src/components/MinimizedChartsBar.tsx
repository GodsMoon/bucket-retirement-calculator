import React from 'react';
import type { ChartState } from '../App';

interface MinimizedChartsBarProps {
  chartStates: Record<string, ChartState>;
  onRestore: (chartId: string) => void;
}

const MinimizedChartsBar: React.FC<MinimizedChartsBarProps> = ({ chartStates, onRestore }) => {
  const minimizedCharts = Object.entries(chartStates).filter(([, state]) => state.minimized);

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
          className="bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 px-3 py-1 rounded-full text-sm hover:bg-slate-300 dark:hover:bg-slate-600"
        >
        {chart.title} +
        </button>
      ))}
    </div>
  );
};

export default MinimizedChartsBar;

import React from 'react';
import type { ChartType } from '../App';

interface ChartProps {
  title: string;
  onRefresh?: () => void;
  onMinimize: () => void;
  children: React.ReactNode;
  minimizable: boolean;
  chartType: ChartType;
}

const Chart: React.FC<ChartProps> = ({ title, onRefresh, onMinimize, children, minimizable, chartType }) => {
  const baseClasses = "rounded-2xl shadow p-4 pt-2 h-full";
  let backgroundClasses;
  switch (chartType) {
    case 'trajectory-bands':
      backgroundClasses = "bg-blue-50 dark:bg-blue-900/50";
      break;
    case 'sample-trajectory':
      backgroundClasses = "bg-green-50 dark:bg-green-900/50";
      break;
    case 'asset-allocation':
      backgroundClasses = "bg-purple-50 dark:bg-purple-900/50";
      break;
    default:
      backgroundClasses = "bg-white dark:bg-slate-800";
  }

  return (
    <section className={`${baseClasses} ${backgroundClasses}`}>
      <div className="flex items-top justify-between">
        <h2 className="font-semibold mb-2 pt-2">{title}</h2>
        <div className="flex items-top">
          {onRefresh && (
            <button
              className="text-xl hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full w-8 h-8 flex items-top justify-center transition-colors"
              onClick={onRefresh}
              aria-label="Refresh simulation"
              title="Refresh simulation"
            >
              ⟳
            </button>
          )}
          {minimizable && (
            <button
              className="text-m hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full w-8 h-8 flex items-center justify-center transition-colors"
              onClick={onMinimize}
              aria-label="Minimize chart"
              title="Minimize chart"
            >
              —
            </button>
          )}
        </div>
      </div>
      {children}
    </section>
  );
};

export default Chart;

import React from 'react';

interface ChartProps {
  title: string;
  onRefresh?: () => void;
  onMinimize: () => void;
  children: React.ReactNode;
  minimizable: boolean;
}

const Chart: React.FC<ChartProps> = ({ title, onRefresh, onMinimize, children, minimizable }) => {
  return (
    <section className="bg-white dark:bg-slate-800 rounded-2xl shadow p-4 pt-2 h-full">
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

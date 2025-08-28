import React from 'react';
import { motion } from 'framer-motion';
import { getChartColor } from '../chartColors';

interface ChartProps {
  chartId: string;
  title: string;
  onRefresh?: () => void;
  onMinimize: () => void;
  onToggleSize: () => void;
  size: 'full' | 'half';
  children: React.ReactNode;
  minimizable: boolean;
}

const Chart: React.FC<ChartProps> = ({ chartId, title, onRefresh, onMinimize, onToggleSize, size, children, minimizable }) => {
  const { chart: colorClass } = getChartColor(chartId);
  return (
    <motion.section
      layout
      transition={{ duration: 0.33 }}
      className={`bg-white dark:bg-slate-800 rounded-2xl shadow p-4 pt-2 h-full border-l-4 ${colorClass}`}
    >
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
          <button
            className="text-m hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full w-8 h-8 flex items-center justify-center transition-colors"
            onClick={onToggleSize}
            aria-label={size === 'half' ? 'Expand chart' : 'Shrink chart'}
            title={size === 'half' ? 'Expand chart' : 'Shrink chart'}
          >
            {size === 'half' ? '⤢' : '⤡'}
          </button>
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
    </motion.section>
  );
};

export default Chart;

import React from 'react';
import { motion } from 'framer-motion';
import { getChartColor } from '../chartColors';

export interface ChartProps {
  chartId: string;
  title: string;
  onRefresh?: () => void;
  onMinimize: () => void;
  onToggleSize: () => void;
  size: 'full' | 'half';
  children: React.ReactNode;
  minimizable: boolean;
  // Drag & drop (optional)
  onDragStart?: (e: React.DragEvent) => void;
  onDragEnd?: (e: React.DragEvent) => void;
}

const Chart: React.FC<ChartProps> = ({ chartId, title, onRefresh, onMinimize, onToggleSize, size, children, minimizable, onDragStart, onDragEnd }) => {
  const { chart: colorClass } = getChartColor(chartId);
  const sectionRef = React.useRef<HTMLElement | null>(null);
  return (
    <motion.section
      layout
      transition={{ duration: 0.33 }}
      className={`bg-white dark:bg-slate-800 rounded-2xl shadow p-4 pt-2 h-full border-l-4 ${colorClass}`}
      ref={sectionRef as React.Ref<HTMLElement>}
    >
      {/* Drag bar handle */}
      <div
        className="h-4 -mt-2 -mx-4 mb-2 px-4 rounded-t-2xl cursor-grab active:cursor-grabbing bg-slate-200/60 dark:bg-slate-700/60 flex items-center justify-center text-xs text-slate-600 dark:text-slate-200 select-none"
        draggable
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', chartId);
          // Use the section as drag image for a full-card ghost
          const el = sectionRef.current as unknown as Element | null;
          if (el && e.dataTransfer.setDragImage) {
            try {
              e.dataTransfer.setDragImage(el as Element, 20, 20);
            } catch {
              // no-op fallback
            }
          }
          onDragStart?.(e);
        }}
        onDragEnd={(e) => {
          onDragEnd?.(e);
        }}
        title="Drag to reorder"
        aria-label="Drag chart to reorder"
      >
        ==
      </div>
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

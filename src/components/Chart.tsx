import React from 'react';

export interface ChartProps {
  title: string;
  onRefresh?: () => void;
  onMinimize: () => void;
  children: React.ReactNode;
  minimizable: boolean;
  dragHandleProps?: React.HTMLAttributes<HTMLDivElement>;
}

const Chart = React.forwardRef<HTMLDivElement, ChartProps>(({ title, onRefresh, onMinimize, children, minimizable, dragHandleProps }, ref) => {
  return (
    <section ref={ref} className="bg-white dark:bg-slate-800 rounded-2xl shadow p-4 pt-2 h-full">
      <div className="flex items-top justify-between">
        <div className="flex items-center">
          <div {...dragHandleProps} className="cursor-grab touch-none" title="Drag to reorder">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 text-slate-400 dark:text-slate-500"><path d="M10 4h4v4h-4zM10 10h4v4h-4zM10 16h4v4h-4zM4 10h4v4H4zM16 10h4v4h-4z"/></svg>
          </div>
          <h2 className="font-semibold mb-2 pt-2 ml-2">{title}</h2>
        </div>
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
});

export default Chart;

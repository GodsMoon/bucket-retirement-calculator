import React from 'react';
import { calculateSingleRunDrawdown, type RunResult } from '../lib/simulation';

interface SampleRunDetailsProps {
  run: RunResult;
  runNumber: number;
  currency: Intl.NumberFormat;
}

const SampleRunDetails: React.FC<SampleRunDetailsProps> = ({ run, runNumber, currency }) => {
  const endingBalance = run.balances[run.balances.length - 1];
  const { highPoint, lowPoint, maxDrawdown } = calculateSingleRunDrawdown(run);

  return (
    <details className="text-xs border-b border-slate-200 dark:border-slate-700 last:border-b-0">
      <summary className="cursor-pointer select-none py-1.5">
        <span className="font-semibold">Sample Run {runNumber}</span>
      </summary>
      <div className="pl-4 pb-2 pt-1 text-slate-600 dark:text-slate-400 space-y-1">
        <div>Ending Balance: <span className="font-semibold text-slate-800 dark:text-slate-200">{currency.format(endingBalance)}</span></div>
        <div>High Point: <span className="font-semibold text-slate-800 dark:text-slate-200">{currency.format(highPoint)}</span></div>
        <div>Low Point: <span className="font-semibold text-slate-800 dark:text-slate-200">{currency.format(lowPoint)}</span></div>
        <div>Max Drawdown: <span className="font-semibold text-slate-800 dark:text-slate-200">{(maxDrawdown * 100).toFixed(1)}%</span></div>
        <div>Failure Year: <span className="font-semibold text-slate-800 dark:text-slate-200">{run.failedYear ?? 'none'}</span></div>
      </div>
    </details>
  );
};

export default SampleRunDetails;

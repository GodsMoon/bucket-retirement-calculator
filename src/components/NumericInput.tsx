import React, { useEffect, useState } from 'react';

interface NumericInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value' | 'step' | 'type' | 'className'> {
  value: number;
  onChange: (value: number) => void;
  step?: number;
  min?: number;
  max?: number;
  precision?: number; // optional display precision (e.g., 2 for percentages)
  className?: string; // applied to the wrapper to include border/background
}

const clamp = (v: number, min?: number, max?: number) => {
  if (typeof min === 'number' && v < min) return min;
  if (typeof max === 'number' && v > max) return max;
  return v;
};

const parseNumeric = (val: string): number => {
  // Allow optional leading '-' and a single '.'
  const cleaned = val
    .replace(/[^0-9+\-.]/g, '')
    .replace(/(.*)\+(?=.*)/, '$1') // disallow '+' except if sole sign
    .replace(/(.*)-(.*)-+/, '$1-$2') // only one leading '-'
    .replace(/(\..*)\./g, '$1'); // only one '.'
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
};

const NumericInput: React.FC<NumericInputProps> = ({ value, onChange, step = 1, min, max, precision, className = '', ...props }) => {
  const [displayValue, setDisplayValue] = useState<string>(String(value ?? 0));

  useEffect(() => {
    const currentNumericValue = parseNumeric(displayValue);
    if (value !== currentNumericValue) {
      const next = (typeof precision === 'number') ? (Number.isFinite(value) ? (value ?? 0).toFixed(precision) : '0') : String(value ?? 0);
      setDisplayValue(next);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, precision]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputValue = e.target.value;
    // Allow temporary states like '' or '-'
    if (inputValue === '' || inputValue === '-' || inputValue === '+') {
      setDisplayValue(inputValue);
      return;
    }
    const numericValue = clamp(parseNumeric(inputValue), min, max);
    setDisplayValue(inputValue);
    if (numericValue !== value) onChange(numericValue);
  };

  const handleBlur = () => {
    // On blur, normalize to current value
    const normalized = clamp(parseNumeric(displayValue), min, max);
    onChange(normalized);
    const next = (typeof precision === 'number') ? normalized.toFixed(precision) : String(normalized);
    setDisplayValue(next);
  };

  const handleStep = (direction: 'up' | 'down') => {
    const delta = direction === 'up' ? step : -step;
    const next = clamp((value ?? 0) + delta, min, max);
    onChange(next);
  };

  return (
    <div className={`relative ${className}`}>
      <input
        type="text"
        inputMode="decimal"
        {...props}
        value={displayValue}
        onChange={handleChange}
        onBlur={handleBlur}
        className={"w-full bg-transparent outline-none pr-10"}
      />
      <div className="absolute inset-y-0 right-0 w-8 flex flex-col items-center justify-center">
        <button
          type="button"
          onClick={() => handleStep('up')}
          className="h-1/2 px-0 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
          tabIndex={-1}
          aria-label="Increase"
        >
          <span className="text-xs">▲</span>
        </button>
        <button
          type="button"
          onClick={() => handleStep('down')}
          className="h-1/2 px-0 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
          tabIndex={-1}
          aria-label="Decrease"
        >
          <span className="text-xs">▼</span>
        </button>
      </div>
    </div>
  );
};

export default NumericInput;

import React, { useState, useEffect } from 'react';

interface CurrencyInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value' | 'step'> {
  value: number;
  onChange: (value: number) => void;
  step?: number;
}

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
  minimumFractionDigits: 0,
});

const parseCurrency = (val: string): number => {
  const parsed = val.replace(/[^0-9-]/g, '');
  return parseInt(parsed, 10) || 0;
};

const CurrencyInput: React.FC<CurrencyInputProps> = ({ value, onChange, step = 1000, ...props }) => {
  const [displayValue, setDisplayValue] = useState(currencyFormatter.format(value));

  useEffect(() => {
    const currentNumericValue = parseCurrency(displayValue);
    if (value !== currentNumericValue) {
      setDisplayValue(currencyFormatter.format(value));
    }
  }, [value, displayValue]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputValue = e.target.value;
    if (inputValue === '' || inputValue === '$' || inputValue === '-') {
      setDisplayValue(inputValue);
      if (inputValue === '' || inputValue === '$') {
        onChange(0);
      }
      return;
    }
    const numericValue = parseCurrency(inputValue);
    const formattedValue = currencyFormatter.format(numericValue);
    setDisplayValue(formattedValue);
    if (value !== numericValue) {
      onChange(numericValue);
    }
  };

  const handleBlur = () => {
    setDisplayValue(currencyFormatter.format(value));
  };

  const handleStep = (direction: 'up' | 'down') => {
    const amount = direction === 'up' ? step : -step;
    const newValue = value + amount;
    onChange(newValue);
  };

  // Apply styles to wrapper so arrow buttons appear inside the field
  const wrapperClass = `relative ${props.className ?? ''}`;

  return (
    <div className={wrapperClass}>
      <input
        type="text"
        inputMode="numeric"
        value={displayValue}
        onChange={handleChange}
        onBlur={handleBlur}
        className={"w-full bg-transparent outline-none pr-3"}
      />
      <div className="absolute inset-y-0 right-0 w-6 flex flex-col">
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

export default CurrencyInput;

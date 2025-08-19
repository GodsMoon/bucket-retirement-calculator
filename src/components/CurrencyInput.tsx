import React, { useState, useEffect } from 'react';

interface CurrencyInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
  value: number;
  onChange: (value: number) => void;
}

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
  minimumFractionDigits: 0,
});

const parseCurrency = (val: string): number => {
  // Remove currency symbols and grouping separators
  const parsed = val.replace(/[^0-9-]/g, '');
  return parseInt(parsed, 10) || 0;
};

const CurrencyInput: React.FC<CurrencyInputProps> = ({ value, onChange, ...props }) => {
  const [displayValue, setDisplayValue] = useState(currencyFormatter.format(value));

  useEffect(() => {
    // Only update the display value if the numeric value of the input is different
    // from the prop value. This prevents the cursor from jumping on every keystroke.
    const currentNumericValue = parseCurrency(displayValue);
    if (value !== currentNumericValue) {
      setDisplayValue(currencyFormatter.format(value));
    }
  }, [value, displayValue]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputValue = e.target.value;

    // Allow clearing the input or starting with a negative sign
    if (inputValue === '' || inputValue === '$' || inputValue === '-') {
      setDisplayValue(inputValue);
      if (inputValue === '') {
        onChange(0);
      }
      return;
    }

    const numericValue = parseCurrency(inputValue);

    // Format the number and update the display
    const formattedValue = currencyFormatter.format(numericValue);
    setDisplayValue(formattedValue);

    // Call the parent onChange with the numeric value
    if (value !== numericValue) {
      onChange(numericValue);
    }
  };

  const handleBlur = () => {
    // On blur, ensure the display is correctly formatted, especially for edge cases.
    setDisplayValue(currencyFormatter.format(value));
  };


  return (
    <input
      type="text"
      inputMode="numeric"
      {...props}
      value={displayValue}
      onChange={handleChange}
      onBlur={handleBlur}
    />
  );
};

export default CurrencyInput;

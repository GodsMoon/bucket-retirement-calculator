import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import CurrencyInput from './CurrencyInput';

describe('CurrencyInput', () => {
  it('should call onChange with 0 when backspacing a single digit to an empty string', () => {
    const handleChange = vi.fn();
    render(<CurrencyInput value={5} onChange={handleChange} />);

    const input = screen.getByRole('textbox');

    // Simulate user deleting the content.
    // In a real browser, backspacing from '$5' would result in '$'.
    fireEvent.change(input, { target: { value: '$' } });

    expect(handleChange).toHaveBeenCalledWith(0);
  });

  it('should call onChange with 0 when the input is cleared', () => {
    const handleChange = vi.fn();
    render(<CurrencyInput value={5} onChange={handleChange} />);

    const input = screen.getByRole('textbox');

    fireEvent.change(input, { target: { value: '' } });

    expect(handleChange).toHaveBeenCalledWith(0);
  });

  it('should format the value as currency', () => {
    const handleChange = vi.fn();
    render(<CurrencyInput value={1234} onChange={handleChange} />);

    const input = screen.getByRole('textbox');
    expect(input).toHaveValue('$1,234');
  });

  it('should allow typing a new value', () => {
    const handleChange = vi.fn();
    render(<CurrencyInput value={0} onChange={handleChange} />);

    const input = screen.getByRole('textbox');

    fireEvent.change(input, { target: { value: '$123' } });

    expect(handleChange).toHaveBeenCalledWith(123);
  });
});

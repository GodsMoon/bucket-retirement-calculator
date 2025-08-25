import { render, screen } from '@testing-library/react';
import AllocationSlider from './AllocationSlider';
import { vi, describe, it, expect } from 'vitest';

describe('AllocationSlider', () => {
  it('renders correctly and displays the correct initial allocation', () => {
    const onParamChange = vi.fn();
    render(
      <AllocationSlider
        cash={25000}
        spy={25000}
        qqq={25000}
        bitcoin={25000}
        bonds={25000}
        onParamChange={onParamChange}
      />
    );

    const sliders = screen.getAllByRole('slider');
    expect(sliders).toHaveLength(4);

    expect(screen.getByText('Cash (20.0%)')).toBeInTheDocument();
    expect(screen.getByText('SPY (20.0%)')).toBeInTheDocument();
    expect(screen.getByText('QQQ (20.0%)')).toBeInTheDocument();
    expect(screen.getByText('Bitcoin (20.0%)')).toBeInTheDocument();
    expect(screen.getByText('Bonds (20.0%)')).toBeInTheDocument();
  });
});

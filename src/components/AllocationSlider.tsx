import React from 'react';
import Slider from 'rc-slider';
import 'rc-slider/assets/index.css';

interface AllocationSliderProps {
  cash: number;
  spy: number;
  qqq: number;
  bonds: number;
  onParamChange: (param: string, value: any) => void;
}

const AllocationSlider: React.FC<AllocationSliderProps> = ({ cash, spy, qqq, bonds, onParamChange }) => {
  const total = cash + spy + qqq + bonds;

  const handleChange = (newValues: number | number[]) => {
    if (Array.isArray(newValues) && newValues.length === 4) {
      const cashPct = newValues[1];
      const spyPct = newValues[2] - newValues[1];
      const qqqPct = newValues[3] - newValues[2];

      onParamChange('allocation', {
        cash: total * (cashPct / 100),
        spy: total * (spyPct / 100),
        qqq: total * (qqqPct / 100),
        bonds: total * ((100 - newValues[3]) / 100),
      });
    }
  };

  const cashPct = total > 0 ? (cash / total) * 100 : 0;
  const spyPct = total > 0 ? (spy / total) * 100 : 0;
  const qqqPct = total > 0 ? (qqq / total) * 100 : 0;
  const bondsPct = 100 - cashPct - spyPct - qqqPct;

  const sliderValues = [
    0,
    cashPct,
    cashPct + spyPct,
    cashPct + spyPct + qqqPct,
  ];

  return (
    <div className="space-y-2">
      <Slider
        range
        min={0}
        max={100}
        value={sliderValues}
        onChange={handleChange}
        trackStyle={[
          { backgroundColor: '#8884d8' }, // Cash
          { backgroundColor: '#82ca9d' }, // SPY
          { backgroundColor: '#ffc658' }  // QQQ
        ]}
        handleStyle={[
            { display: 'none' }, // Handle at 0
            { backgroundColor: '#8884d8', border: '2px solid white', boxShadow: '0 0 0 2px #6f6af2' },
            { backgroundColor: '#82ca9d', border: '2px solid white', boxShadow: '0 0 0 2px #6ac189' },
            { backgroundColor: '#ffc658', border: '2px solid white', boxShadow: '0 0 0 2px #e5b24f' }]}
        railStyle={{ backgroundColor: '#95a5a6' }} // Bonds
      />
      <div className="flex justify-between text-xs text-slate-600 dark:text-slate-400">
        <div className="flex items-center space-x-1">
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#8884d8' }}></div>
          <span>Cash ({cashPct.toFixed(1)}%)</span>
        </div>
        <div className="flex items-center space-x-1">
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#82ca9d' }}></div>
          <span>SPY ({spyPct.toFixed(1)}%)</span>
        </div>
        <div className="flex items-center space-x-1">
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#ffc658' }}></div>
          <span>QQQ ({qqqPct.toFixed(1)}%)</span>
        </div>
        <div className="flex items-center space-x-1">
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#95a5a6' }}></div>
          <span>Bonds ({bondsPct.toFixed(1)}%)</span>
        </div>
      </div>
    </div>
  );
};

export default AllocationSlider;

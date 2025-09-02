import { describe, expect, it } from 'vitest';
import { bitcoinReturnMultiplier } from './bitcoin';
import { BITCOIN_TOTAL_RETURNS } from '../data/returns';

const map = new Map(BITCOIN_TOTAL_RETURNS.map(d => [d.year, 1 + d.returnPct / 100]));

describe('bitcoinReturnMultiplier', () => {
  it('wraps years before data range', () => {
    const maxYear = Math.max(...BITCOIN_TOTAL_RETURNS.map(d => d.year));
    expect(bitcoinReturnMultiplier(2010)).toBeCloseTo(map.get(maxYear)!);
  });

  it('uses actual returns for 2011 and later', () => {
    expect(bitcoinReturnMultiplier(2011)).toBeCloseTo(map.get(2011)!);
    expect(bitcoinReturnMultiplier(2015)).toBeCloseTo(map.get(2015)!);
  });

  it('wraps years after data range', () => {
    const minYear = Math.min(...BITCOIN_TOTAL_RETURNS.map(d => d.year));
    const maxYear = Math.max(...BITCOIN_TOTAL_RETURNS.map(d => d.year));
    expect(bitcoinReturnMultiplier(maxYear + 1)).toBeCloseTo(map.get(minYear)!);
  });
});

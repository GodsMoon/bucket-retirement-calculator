import { describe, it, expect } from 'vitest';
import { SP500_TOTAL_RETURNS, NASDAQ100_TOTAL_RETURNS, BITCOIN_TOTAL_RETURNS } from '../data/returns';
import { TEN_YEAR_TREASURY_TOTAL_RETURNS } from '../data/bonds';
import { bitcoinReturnMultiplier } from './bitcoin';

const pctToMult = (pct: number) => 1 + pct / 100;

function buildReturnsByYear(bitcoin: number) {
  const spyReturnsMap = new Map(SP500_TOTAL_RETURNS.map(d => [d.year, pctToMult(d.returnPct)]));
  const qqqReturnsMap = new Map(NASDAQ100_TOTAL_RETURNS.map(d => [d.year, pctToMult(d.returnPct)]));
  const bondReturnsMap = new Map(TEN_YEAR_TREASURY_TOTAL_RETURNS.map(d => [d.year, pctToMult(d.returnPct)]));
  const btcReturnsMap = new Map(BITCOIN_TOTAL_RETURNS.map(d => [d.year, pctToMult(d.returnPct)]));

  const spyYears = new Set(SP500_TOTAL_RETURNS.map(d => d.year));
  const qqqYears = new Set(NASDAQ100_TOTAL_RETURNS.map(d => d.year));
  const bondYears = new Set(TEN_YEAR_TREASURY_TOTAL_RETURNS.map(d => d.year));
  const years = Array.from(spyYears)
    .filter(y => qqqYears.has(y) && bondYears.has(y))
    .sort((a, b) => a - b);

  const map = new Map<number, { spy: number; qqq: number; bitcoin: number; bonds: number }>();
  for (const year of years) {
    map.set(year, {
      spy: spyReturnsMap.get(year)!,
      qqq: qqqReturnsMap.get(year)!,
      bitcoin: bitcoin > 0 ? (btcReturnsMap.get(year) ?? bitcoinReturnMultiplier(year)) : 1.0,
      bonds: bondReturnsMap.get(year)!,
    });
  }
  return { years, map };
}

describe('returnsByYear bitcoin handling', () => {
  it('includes years before bitcoin data when bitcoin is unused', () => {
    const { years } = buildReturnsByYear(0);
    expect(years[0]).toBeLessThan(2011);
  });

  it('fills missing bitcoin years using bitcoinReturnMultiplier when allocation is positive', () => {
    const { map } = buildReturnsByYear(0.5);
    expect(map.get(1992)!.bitcoin).toBeCloseTo(bitcoinReturnMultiplier(1992));
  });

  it('uses 1.0 for bitcoin returns when allocation is zero', () => {
    const { map } = buildReturnsByYear(0);
    expect(map.get(1992)!.bitcoin).toBe(1.0);
  });
});

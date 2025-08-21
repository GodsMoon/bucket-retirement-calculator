import { describe, it, expect } from 'vitest';
import { simulateFourPercentRuleRatchetUp } from './simulation';

describe('simulateFourPercentRuleRatchetUp', () => {
  const initialSpy = 1000000;
  const horizon = 5;
  const initialWithdrawalAmount = 40000;
  const withdrawalRate = 0.04;
  const inflationRate = 0.02;

  // Mock returns for spy, qqq, bonds
  const returns = {
    up: [1.1, 1.1, 1.1, 1.1, 1.1], // 10% gain each year
    down: [0.9, 0.9, 0.9, 0.9, 0.9], // 10% loss each year
  };

  it('should ratchet up withdrawal amount when balance increases', () => {
    const result = simulateFourPercentRuleRatchetUp(
      returns.up, returns.up, returns.up, // Assuming all assets have same returns for simplicity
      0, initialSpy, 0, 0, // All in SPY
      horizon,
      initialWithdrawalAmount,
      withdrawalRate,
      true, // inflationAdjust
      inflationRate
    );

    // Year 0 withdrawal is 40000
    expect(result.withdrawals[0]).toBe(40000);
    // Balance at end of year 0: (1_000_000 - 40_000) * 1.1 = 1_056_000
    expect(result.balances[1].total).toBeCloseTo(1056000);

    // Year 1 withdrawal: balance is up, so ratchet up
    // next withdrawal = 1_056_000 * 0.04 = 42240
    // This is > 40000 * 1.02 = 40800, so we use 42240
    expect(result.withdrawals[1]).toBeCloseTo(42240);
  });

  it('should only adjust for inflation when balance decreases', () => {
    const result = simulateFourPercentRuleRatchetUp(
      returns.down, returns.down, returns.down,
      0, initialSpy, 0, 0,
      horizon,
      initialWithdrawalAmount,
      withdrawalRate,
      true, // inflationAdjust
      inflationRate
    );

    // Year 0 withdrawal is 40000
    expect(result.withdrawals[0]).toBe(40000);
    // Balance at end of year 0: (1_000_000 - 40_000) * 0.9 = 864_000
    expect(result.balances[1].total).toBeCloseTo(864000);

    // Year 1 withdrawal: balance is down, so only adjust for inflation
    // next withdrawal = 40000 * 1.02 = 40800
    expect(result.withdrawals[1]).toBeCloseTo(40800);
  });

  it('should not reduce spending when ratchet-up amount is lower than inflation-adjusted amount', () => {
    const returnsForThisTest = [1.05, 1.0, 1.0, 1.0, 1.0];
    const result = simulateFourPercentRuleRatchetUp(
      returnsForThisTest, returnsForThisTest, returnsForThisTest,
      0, initialSpy, 0, 0,
      horizon,
      initialWithdrawalAmount,
      withdrawalRate,
      true,
      inflationRate
    );

    // Year 0 withdrawal is 40000
    // Balance at end of year 0: (1_000_000 - 40_000) * 1.05 = 1_008_000
    expect(result.balances[1].total).toBeCloseTo(1008000);

    // Baseline next withdrawal (inflation-adjusted): 40_000 * 1.02 = 40_800
    // Ratchet-up withdrawal: 1_008_000 * 0.04 = 40_320
    // The next withdrawal should be the max of these two, which is 40_800.
    expect(result.withdrawals[1]).toBeCloseTo(40800);
  });
});

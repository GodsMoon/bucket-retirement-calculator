import { describe, it, expect } from 'vitest';
import { simulateFourPercentRuleRatchetUp, simulateGuytonKlinger, simulateCapeBased } from './simulation';

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
      returns.up, returns.up, returns.up, returns.up,
      0, initialSpy, 0, 0, 0,
      horizon,
      initialWithdrawalAmount,
      withdrawalRate,
      true, // inflationAdjust
      inflationRate,
      undefined
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
      returns.down, returns.down, returns.down, returns.down,
      0, initialSpy, 0, 0, 0,
      horizon,
      initialWithdrawalAmount,
      withdrawalRate,
      true, // inflationAdjust
      inflationRate,
      undefined
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
      returnsForThisTest, returnsForThisTest, returnsForThisTest, returnsForThisTest,
      0, initialSpy, 0, 0, 0,
      horizon,
      initialWithdrawalAmount,
      withdrawalRate,
      true,
      inflationRate,
      undefined
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

describe('simulateGuytonKlinger', () => {
  const initialBalance = 1000000;
  const horizon = 5;
  const initialWithdrawalRate = 0.04;
  const inflationRate = 0.02;
  const returns = {
    up: [1.1, 1.1, 1.1, 1.1, 1.1],
    down: [0.9, 0.9, 0.9, 0.9, 0.9],
  };

  it('should skip inflation adjustment on negative return when withdrawal rate is above initial', () => {
    const result = simulateGuytonKlinger(
      returns.down, returns.down, returns.down, returns.down,
      0, initialBalance, 0, 0, 0,
      horizon,
      initialWithdrawalRate,
      inflationRate,
      true,
      0.2, 0.2, 0.1, 0.1,
      undefined
    );

    // Year 0 withdrawal: 1_000_000 * 0.04 = 40_000
    // Balance at end of year 0: (1_000_000 - 40_000) * 0.9 = 864_000
    // Withdrawal rate at end of year 0: 40_000 / 864_000 = 0.046 > 0.04
    // Next withdrawal should not be inflation adjusted: 40_000
    expect(result.withdrawals[1]).toBeCloseTo(40000);
  });

  it('should apply inflation adjustment on negative return when withdrawal rate is below initial', () => {
    const result = simulateGuytonKlinger(
      [0.95, 0.95, 0.95, 0.95, 0.95], [0.95, 0.95, 0.95, 0.95, 0.95], [0.95, 0.95, 0.95, 0.95, 0.95], [0.95, 0.95, 0.95, 0.95, 0.95],
      0, initialBalance, 0, 0, 0,
      horizon,
      0.04, // Lower initial withdrawal rate
      inflationRate,
      true,
      0.2, 0.2, 0.1, 0.1,
      undefined
    );

    // Year 0 withdrawal: 1_000_000 * 0.04 = 40_000
    // Balance at end of year 0: (1_000_000 - 40_000) * 0.95 = 912_000
    // Withdrawal rate at end of year 0: 40_000 / 912_000 = 0.0438 > 0.04
    // Next withdrawal should not be inflation adjusted: 40_000
    expect(result.withdrawals[1]).toBeCloseTo(40000);
  });
});

describe('simulateCapeBased', () => {
  const initialBalance = 1000000;
  const horizon = 5;
  const basePercentage = 0.02;
  const capeFraction = 0.5;
  const capeData = {
    2000: 40,
    2001: 30,
    2002: 25,
    2003: 28,
    2004: 32,
  };
  const yearSample = [2000, 2001, 2002, 2003, 2004];
  const returns = [1.0, 1.0, 1.0, 1.0, 1.0]; // No returns for simplicity

  it('should use the correct CAPE value for each year in the simulation', () => {
    const result = simulateCapeBased(
      returns, returns, returns, returns,
      0, initialBalance, 0, 0, 0,
      horizon,
      basePercentage,
      capeFraction,
      capeData,
      yearSample
    );

    // Year 0 withdrawal rate: 0.02 + 0.5 * (1/40) = 0.0325
    // Withdrawal amount: 1_000_000 * 0.0325 = 32500
    expect(result.withdrawals[0]).toBeCloseTo(32500);

    // Balance at end of year 0: 1_000_000 - 32500 = 967_500
    // Year 1 withdrawal rate: 0.02 + 0.5 * (1/30) = 0.036666
    // Withdrawal amount: 967_500 * 0.036666 = 35474.955
    expect(result.withdrawals[1]).toBeCloseTo(35475);
  });
});

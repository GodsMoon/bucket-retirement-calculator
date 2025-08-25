// Helper: convert percent to multiplier
export const pctToMult = (pct: number) => 1 + pct / 100;

// Simulation engine
export type RunResult = {
  balances: number[]; // length horizon+1 including year 0
  failedYear: number | null; // first year that ends <= 0 (1-based), else null
  withdrawals: number[];
};

export function bootstrapSample<T>(arr: T[], n: number): T[] {
  const out: T[] = [];
  for (let i = 0; i < n; i++) {
    const j = Math.floor(Math.random() * arr.length);
    out.push(arr[j]);
  }
  return out;
}

export function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Percentile helper
export function percentile(values: number[], p: number): number {
  if (values.length === 0) return NaN;
  const sorted = values.slice().sort((a, b) => a - b);
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  const w = idx - lo;
  return sorted[lo] * (1 - w) + sorted[hi] * w;
}

export function calculateDrawdownStats(sims: RunResult[]) {
  const maxDrawdowns: number[] = [];
  const lowPoints: number[] = [];

  for (const sim of sims) {
    let peak = sim.balances[0];
    let maxDrawdown = 0;
    let lowPoint = sim.balances[0];

    for (const balance of sim.balances) {
      if (balance > peak) {
        peak = balance;
      }
      const drawdown = peak > 0 ? (peak - balance) / peak : 0;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
        lowPoint = balance;
      }
    }
    maxDrawdowns.push(maxDrawdown);
    lowPoints.push(lowPoint);
  }

  return {
    medianDrawdown: percentile(maxDrawdowns, 0.5),
    medianLowPoint: percentile(lowPoints, 0.5),
    maxDrawdown: Math.max(...maxDrawdowns),
    worstLowPoint: Math.min(...lowPoints),
  };
}

// Custom RunResult for portfolio simulation
export type PortfolioRunResult = {
  balances: { total: number; cash: number; spy: number; qqq: number; bitcoin: number; bonds: number }[];
  withdrawals: number[];
  failedYear: number | null;
  guardrailTriggers: number[];
};

export function simulateGuytonKlinger(
  spyReturns: number[],
  qqqReturns: number[],
  bitcoinReturns: number[],
  bondReturns: number[],
  initialCash: number,
  initialSpy: number,
  initialQqq: number,
  initialBitcoin: number,
  initialBonds: number,
  horizon: number,
  initialWithdrawalRate: number,
  inflationRate: number,
  inflationAdjust: boolean,
  guardrailUpper: number,
  guardrailLower: number,
  cutPercentage: number,
  raisePercentage: number
): PortfolioRunResult {
  const balances = new Array(horizon + 1).fill(0).map(() => ({ total: 0, cash: 0, spy: 0, qqq: 0, bitcoin: 0, bonds: 0 }));
  const withdrawals: number[] = new Array(horizon).fill(0);
  const guardrailTriggers: number[] = [];
  let cash = initialCash;
  let spy = initialSpy;
  let qqq = initialQqq;
  let bitcoin = initialBitcoin;
  let bonds = initialBonds;
  const startBalance = initialCash + initialSpy + initialQqq + initialBitcoin + initialBonds;
  let withdrawalAmount = startBalance * initialWithdrawalRate;

  balances[0] = { total: startBalance, cash, spy, qqq, bitcoin, bonds };
  let failedYear: number | null = null;

  for (let y = 0; y < horizon; y++) {
    withdrawals[y] = withdrawalAmount;

    // Drawdown from cash first
    const fromCash = Math.min(withdrawalAmount, cash);
    cash -= fromCash;
    let remainingWithdrawal = withdrawalAmount - fromCash;

    if (remainingWithdrawal > 0) {
      const fromSpy = Math.min(remainingWithdrawal, spy);
      spy -= fromSpy;
      remainingWithdrawal -= fromSpy;

      if (remainingWithdrawal > 0) {
        const fromQqq = Math.min(remainingWithdrawal, qqq);
        qqq -= fromQqq;
        remainingWithdrawal -= fromQqq;
      }

      if (remainingWithdrawal > 0) {
        const fromBitcoin = Math.min(remainingWithdrawal, bitcoin);
        bitcoin -= fromBitcoin;
        remainingWithdrawal -= fromBitcoin;
      }

      if (remainingWithdrawal > 0) {
        const fromBonds = Math.min(remainingWithdrawal, bonds);
        bonds -= fromBonds;
      }
    }

    const totalBeforeGrowth = cash + spy + qqq + bitcoin + bonds;
    if (totalBeforeGrowth <= 0 && failedYear === null) {
      failedYear = y + 1;
      for (let i = y + 1; i <= horizon; i++) {
        balances[i] = { total: 0, cash: 0, spy: 0, qqq: 0, bitcoin: 0, bonds: 0 };
      }
      break;
    }

    // Apply market returns
    const portfolioBeforeGrowth = totalBeforeGrowth;
    spy *= spyReturns[y];
    qqq *= qqqReturns[y];
    bitcoin *= bitcoinReturns[y];
    bonds *= bondReturns[y];
    const portfolioAfterGrowth = cash + spy + qqq + bitcoin + bonds;
    const lastYearReturn = (portfolioAfterGrowth / portfolioBeforeGrowth) - 1;

    const totalAfterGrowth = cash + spy + qqq + bitcoin + bonds;
    balances[y + 1] = { total: totalAfterGrowth, cash, spy, qqq, bitcoin, bonds };

    // Determine next year's withdrawal amount
    let nextWithdrawalAmount = withdrawalAmount;

    // Inflation adjustment
    if (inflationAdjust && lastYearReturn >= 0) {
      nextWithdrawalAmount *= (1 + inflationRate);
    }

    // Guardrail adjustments
    const currentWithdrawalRate = nextWithdrawalAmount / totalAfterGrowth;
    if (y < horizon - 15) { // Longevity rule
      if (currentWithdrawalRate > initialWithdrawalRate * (1 + guardrailLower)) {
        nextWithdrawalAmount *= (1 - cutPercentage);
        guardrailTriggers.push(y + 1);
      } else if (currentWithdrawalRate < initialWithdrawalRate * (1 - guardrailUpper)) {
        nextWithdrawalAmount *= (1 + raisePercentage);
        guardrailTriggers.push(y + 1);
      }
    }
    withdrawalAmount = nextWithdrawalAmount;
  }

  return { balances, withdrawals, failedYear, guardrailTriggers };
}

export function simulateFloorAndCeiling(
  spyReturns: number[],
  qqqReturns: number[],
  bitcoinReturns: number[],
  bondReturns: number[],
  initialCash: number,
  initialSpy: number,
  initialQqq: number,
  initialBitcoin: number,
  initialBonds: number,
  horizon: number,
  initialWithdrawalRate: number,
  inflationRate: number,
  inflationAdjust: boolean,
  floor: number,
  ceiling: number
): PortfolioRunResult {
  const balances = new Array(horizon + 1).fill(0).map(() => ({ total: 0, cash: 0, spy: 0, qqq: 0, bitcoin: 0, bonds: 0 }));
  const withdrawals: number[] = new Array(horizon).fill(0);
  let cash = initialCash;
  let spy = initialSpy;
  let qqq = initialQqq;
  let bitcoin = initialBitcoin;
  let bonds = initialBonds;
  const startBalance = initialCash + initialSpy + initialQqq + initialBitcoin + initialBonds;
  const initialWithdrawalAmount = startBalance * initialWithdrawalRate;
  let withdrawalAmount = initialWithdrawalAmount;

  balances[0] = { total: startBalance, cash, spy, qqq, bitcoin, bonds };
  let failedYear: number | null = null;

  for (let y = 0; y < horizon; y++) {
    // Determine withdrawal amount
    let currentWithdrawal = balances[y].total * initialWithdrawalRate;
    const floorAmount = initialWithdrawalAmount * (1 - floor);
    const ceilingAmount = initialWithdrawalAmount * (1 + ceiling);

    currentWithdrawal = Math.max(currentWithdrawal, floorAmount);
    currentWithdrawal = Math.min(currentWithdrawal, ceilingAmount);

    if (inflationAdjust) {
      currentWithdrawal *= Math.pow(1 + inflationRate, y);
    }

    withdrawalAmount = currentWithdrawal;
    withdrawals[y] = withdrawalAmount;

    // Drawdown from cash first
    const fromCash = Math.min(withdrawalAmount, cash);
    cash -= fromCash;
    let remainingWithdrawal = withdrawalAmount - fromCash;

    if (remainingWithdrawal > 0) {
      const fromSpy = Math.min(remainingWithdrawal, spy);
      spy -= fromSpy;
      remainingWithdrawal -= fromSpy;

      if (remainingWithdrawal > 0) {
        const fromQqq = Math.min(remainingWithdrawal, qqq);
        qqq -= fromQqq;
        remainingWithdrawal -= fromQqq;
      }

      if (remainingWithdrawal > 0) {
        const fromBitcoin = Math.min(remainingWithdrawal, bitcoin);
        bitcoin -= fromBitcoin;
        remainingWithdrawal -= fromBitcoin;
      }

      if (remainingWithdrawal > 0) {
        const fromBonds = Math.min(remainingWithdrawal, bonds);
        bonds -= fromBonds;
      }
    }

    const totalBeforeGrowth = cash + spy + qqq + bitcoin + bonds;
    if (totalBeforeGrowth <= 0 && failedYear === null) {
      failedYear = y + 1;
      for (let i = y + 1; i <= horizon; i++) {
        balances[i] = { total: 0, cash: 0, spy: 0, qqq: 0, bitcoin: 0, bonds: 0 };
      }
      break;
    }

    // Apply market returns
    spy *= spyReturns[y];
    qqq *= qqqReturns[y];
    bitcoin *= bitcoinReturns[y];
    bonds *= bondReturns[y];

    const totalAfterGrowth = cash + spy + qqq + bitcoin + bonds;
    balances[y + 1] = { total: totalAfterGrowth, cash, spy, qqq, bitcoin, bonds };
  }

  return { balances, withdrawals, failedYear, guardrailTriggers: [] };
}

export function simulateFourPercentRuleRatchetUp(
  spyReturns: number[],
  qqqReturns: number[],
  bitcoinReturns: number[],
  bondReturns: number[],
  initialCash: number,
  initialSpy: number,
  initialQqq: number,
  initialBitcoin: number,
  initialBonds: number,
  horizon: number,
  initialWithdrawalAmount: number,
  withdrawalRate: number,
  inflationAdjust: boolean,
  inflationRate: number
): PortfolioRunResult {
  const balances = new Array(horizon + 1).fill(0).map(() => ({ total: 0, cash: 0, spy: 0, qqq: 0, bitcoin: 0, bonds: 0 }));
  const withdrawals: number[] = new Array(horizon).fill(0);
  let cash = initialCash;
  let spy = initialSpy;
  let qqq = initialQqq;
  let bitcoin = initialBitcoin;
  let bonds = initialBonds;
  const startBalance = initialCash + initialSpy + initialQqq + initialBitcoin + initialBonds;

  balances[0] = { total: startBalance, cash, spy, qqq, bitcoin, bonds };
  let failedYear: number | null = null;

  let withdrawalAmount = initialWithdrawalAmount;

  for (let y = 0; y < horizon; y++) {
    withdrawals[y] = withdrawalAmount;

    // Drawdown from cash first
    const fromCash = Math.min(withdrawalAmount, cash);
    cash -= fromCash;
    let remainingWithdrawal = withdrawalAmount - fromCash;

    if (remainingWithdrawal > 0) {
      const fromSpy = Math.min(remainingWithdrawal, spy);
      spy -= fromSpy;
      remainingWithdrawal -= fromSpy;

      if (remainingWithdrawal > 0) {
        const fromQqq = Math.min(remainingWithdrawal, qqq);
        qqq -= fromQqq;
        remainingWithdrawal -= fromQqq;
      }

      if (remainingWithdrawal > 0) {
        const fromBitcoin = Math.min(remainingWithdrawal, bitcoin);
        bitcoin -= fromBitcoin;
        remainingWithdrawal -= fromBitcoin;
      }

      if (remainingWithdrawal > 0) {
        const fromBonds = Math.min(remainingWithdrawal, bonds);
        bonds -= fromBonds;
      }
    }

    const totalBeforeGrowth = cash + spy + qqq + bitcoin + bonds;
    if (totalBeforeGrowth <= 0 && failedYear === null) {
      failedYear = y + 1;
      for (let i = y + 1; i <= horizon; i++) {
        balances[i] = { total: 0, cash: 0, spy: 0, qqq: 0, bitcoin: 0, bonds: 0 };
      }
      break;
    }

    // Apply market returns
    spy *= spyReturns[y];
    qqq *= qqqReturns[y];
    bitcoin *= bitcoinReturns[y];
    bonds *= bondReturns[y];

    const totalAfterGrowth = cash + spy + qqq + bitcoin + bonds;
    balances[y + 1] = { total: totalAfterGrowth, cash, spy, qqq, bitcoin, bonds };

    // Determine next year's withdrawal amount
    const lastYearBalance = balances[y].total;
    const endOfYearBalance = balances[y+1].total;

    let nextWithdrawalAmount = withdrawalAmount;
    if (inflationAdjust) {
      nextWithdrawalAmount *= (1 + inflationRate);
    }

    if (endOfYearBalance > lastYearBalance) {
      const ratchetWithdrawal = endOfYearBalance * withdrawalRate;
      nextWithdrawalAmount = Math.max(nextWithdrawalAmount, ratchetWithdrawal);
    }

    withdrawalAmount = nextWithdrawalAmount;
  }

  return { balances, withdrawals, failedYear, guardrailTriggers: [] };
}

export function simulateFourPercentRule(
  spyReturns: number[],
  qqqReturns: number[],
  bitcoinReturns: number[],
  bondReturns: number[],
  initialCash: number,
  initialSpy: number,
  initialQqq: number,
  initialBitcoin: number,
  initialBonds: number,
  horizon: number,
  initialWithdrawalAmount: number,
  inflationAdjust: boolean,
  inflationRate: number,
): PortfolioRunResult {
  const balances = new Array(horizon + 1).fill(0).map(() => ({ total: 0, cash: 0, spy: 0, qqq: 0, bitcoin: 0, bonds: 0 }));
  const withdrawals: number[] = new Array(horizon).fill(0);
  let cash = initialCash;
  let spy = initialSpy;
  let qqq = initialQqq;
  let bitcoin = initialBitcoin;
  let bonds = initialBonds;
  const startBalance = initialCash + initialSpy + initialQqq + initialBitcoin + initialBonds;

  balances[0] = { total: startBalance, cash, spy, qqq, bitcoin, bonds };
  let failedYear: number | null = null;

  let withdrawalAmount = initialWithdrawalAmount;

  for (let y = 0; y < horizon; y++) {
    const currentWithdrawal = withdrawalAmount;
    withdrawals[y] = currentWithdrawal;

    if (inflationAdjust) {
      withdrawalAmount *= (1 + inflationRate);
    }

    // Drawdown from cash first
    const fromCash = Math.min(currentWithdrawal, cash);
    cash -= fromCash;
    let remainingWithdrawal = currentWithdrawal - fromCash;

    if (remainingWithdrawal > 0) {
      const fromSpy = Math.min(remainingWithdrawal, spy);
      spy -= fromSpy;
      remainingWithdrawal -= fromSpy;

      if (remainingWithdrawal > 0) {
        const fromQqq = Math.min(remainingWithdrawal, qqq);
        qqq -= fromQqq;
        remainingWithdrawal -= fromQqq;
      }

      if (remainingWithdrawal > 0) {
        const fromBitcoin = Math.min(remainingWithdrawal, bitcoin);
        bitcoin -= fromBitcoin;
        remainingWithdrawal -= fromBitcoin;
      }

      if (remainingWithdrawal > 0) {
        const fromBonds = Math.min(remainingWithdrawal, bonds);
        bonds -= fromBonds;
      }
    }

    const totalBeforeGrowth = cash + spy + qqq + bitcoin + bonds;
    if (totalBeforeGrowth <= 0 && failedYear === null) {
      failedYear = y + 1;
      for (let i = y + 1; i <= horizon; i++) {
        balances[i] = { total: 0, cash: 0, spy: 0, qqq: 0, bitcoin: 0, bonds: 0 };
      }
      break;
    }

    // Apply market returns
    spy *= spyReturns[y];
    qqq *= qqqReturns[y];
    bitcoin *= bitcoinReturns[y];
    bonds *= bondReturns[y];

    const totalAfterGrowth = cash + spy + qqq + bitcoin + bonds;
    balances[y + 1] = { total: totalAfterGrowth, cash, spy, qqq, bitcoin, bonds };
  }

  return { balances, withdrawals, failedYear, guardrailTriggers: [] };
}

export function simulatePrincipalProtectionRule(
  spyReturns: number[],
  qqqReturns: number[],
  bitcoinReturns: number[],
  bondReturns: number[],
  initialCash: number,
  initialSpy: number,
  initialQqq: number,
  initialBitcoin: number,
  initialBonds: number,
  horizon: number,
  initialWithdrawalAmount: number,
  inflationAdjust: boolean,
  inflationRate: number,
): PortfolioRunResult {
  const balances = new Array(horizon + 1).fill(0).map(() => ({ total: 0, cash: 0, spy: 0, qqq: 0, bitcoin: 0, bonds: 0 }));
  const withdrawals: number[] = new Array(horizon).fill(0);
  let cash = initialCash;
  let spy = initialSpy;
  let qqq = initialQqq;
  let bitcoin = initialBitcoin;
  let bonds = initialBonds;
  const startBalance = initialCash + initialSpy + initialQqq + initialBitcoin + initialBonds;

  balances[0] = { total: startBalance, cash, spy, qqq, bitcoin, bonds };
  let failedYear: number | null = null;

  let withdrawalAmount = initialWithdrawalAmount;

  for (let y = 0; y < horizon; y++) {
    let currentWithdrawal = 0;
    if (balances[y].total >= startBalance) {
      currentWithdrawal = withdrawalAmount;
      if (inflationAdjust) {
        withdrawalAmount *= (1 + inflationRate);
      }
    }

    withdrawals[y] = currentWithdrawal;

    // Drawdown from cash first
    const fromCash = Math.min(currentWithdrawal, cash);
    cash -= fromCash;
    let remainingWithdrawal = currentWithdrawal - fromCash;

    if (remainingWithdrawal > 0) {
      const fromSpy = Math.min(remainingWithdrawal, spy);
      spy -= fromSpy;
      remainingWithdrawal -= fromSpy;

      if (remainingWithdrawal > 0) {
        const fromQqq = Math.min(remainingWithdrawal, qqq);
        qqq -= fromQqq;
        remainingWithdrawal -= fromQqq;
      }

      if (remainingWithdrawal > 0) {
        const fromBitcoin = Math.min(remainingWithdrawal, bitcoin);
        bitcoin -= fromBitcoin;
        remainingWithdrawal -= fromBitcoin;
      }

      if (remainingWithdrawal > 0) {
        const fromBonds = Math.min(remainingWithdrawal, bonds);
        bonds -= fromBonds;
      }
    }

    const totalBeforeGrowth = cash + spy + qqq + bitcoin + bonds;
    if (totalBeforeGrowth <= 0 && failedYear === null) {
      failedYear = y + 1;
      for (let i = y + 1; i <= horizon; i++) {
        balances[i] = { total: 0, cash: 0, spy: 0, qqq: 0, bitcoin: 0, bonds: 0 };
      }
      break;
    }

    // Apply market returns
    spy *= spyReturns[y];
    qqq *= qqqReturns[y];
    bitcoin *= bitcoinReturns[y];
    bonds *= bondReturns[y];

    const totalAfterGrowth = cash + spy + qqq + bitcoin + bonds;
    balances[y + 1] = { total: totalAfterGrowth, cash, spy, qqq, bitcoin, bonds };
  }

  return { balances, withdrawals, failedYear, guardrailTriggers: [] };
}

export function simulateFixedPercentage(
  spyReturns: number[],
  qqqReturns: number[],
  bitcoinReturns: number[],
  bondReturns: number[],
  initialCash: number,
  initialSpy: number,
  initialQqq: number,
  initialBitcoin: number,
  initialBonds: number,
  horizon: number,
  withdrawalRate: number,
): PortfolioRunResult {
  const balances = new Array(horizon + 1).fill(0).map(() => ({ total: 0, cash: 0, spy: 0, qqq: 0, bitcoin: 0, bonds: 0 }));
  const withdrawals: number[] = new Array(horizon).fill(0);
  let cash = initialCash;
  let spy = initialSpy;
  let qqq = initialQqq;
  let bitcoin = initialBitcoin;
  let bonds = initialBonds;
  const startBalance = initialCash + initialSpy + initialQqq + initialBitcoin + initialBonds;

  balances[0] = { total: startBalance, cash, spy, qqq, bitcoin, bonds };
  let failedYear: number | null = null;

  for (let y = 0; y < horizon; y++) {
    const withdrawalAmount = balances[y].total * withdrawalRate;
    withdrawals[y] = withdrawalAmount;

    // Drawdown from cash first
    const fromCash = Math.min(withdrawalAmount, cash);
    cash -= fromCash;
    let remainingWithdrawal = withdrawalAmount - fromCash;

    if (remainingWithdrawal > 0) {
      const fromSpy = Math.min(remainingWithdrawal, spy);
      spy -= fromSpy;
      remainingWithdrawal -= fromSpy;

      if (remainingWithdrawal > 0) {
        const fromQqq = Math.min(remainingWithdrawal, qqq);
        qqq -= fromQqq;
        remainingWithdrawal -= fromQqq;
      }

      if (remainingWithdrawal > 0) {
        const fromBitcoin = Math.min(remainingWithdrawal, bitcoin);
        bitcoin -= fromBitcoin;
        remainingWithdrawal -= fromBitcoin;
      }

      if (remainingWithdrawal > 0) {
        const fromBonds = Math.min(remainingWithdrawal, bonds);
        bonds -= fromBonds;
      }
    }

    const totalBeforeGrowth = cash + spy + qqq + bitcoin + bonds;
    if (totalBeforeGrowth <= 0 && failedYear === null) {
      failedYear = y + 1;
      for (let i = y + 1; i <= horizon; i++) {
        balances[i] = { total: 0, cash: 0, spy: 0, qqq: 0, bitcoin: 0, bonds: 0 };
      }
      break;
    }

    // Apply market returns
    spy *= spyReturns[y];
    qqq *= qqqReturns[y];
    bitcoin *= bitcoinReturns[y];
    bonds *= bondReturns[y];

    const totalAfterGrowth = cash + spy + qqq + bitcoin + bonds;
    balances[y + 1] = { total: totalAfterGrowth, cash, spy, qqq, bitcoin, bonds };
  }

  return { balances, withdrawals, failedYear, guardrailTriggers: [] };
}

export function simulateCapeBased(
  spyReturns: number[],
  qqqReturns: number[],
  bitcoinReturns: number[],
  bondReturns: number[],
  initialCash: number,
  initialSpy: number,
  initialQqq: number,
  initialBitcoin: number,
  initialBonds: number,
  horizon: number,
  basePercentage: number,
  capeFraction: number,
  capeData: { [year: number]: number }
): PortfolioRunResult {
  const balances = new Array(horizon + 1).fill(0).map(() => ({ total: 0, cash: 0, spy: 0, qqq: 0, bitcoin: 0, bonds: 0 }));
  const withdrawals: number[] = new Array(horizon).fill(0);
  let cash = initialCash;
  let spy = initialSpy;
  let qqq = initialQqq;
  let bitcoin = initialBitcoin;
  let bonds = initialBonds;
  const startBalance = initialCash + initialSpy + initialQqq + initialBitcoin + initialBonds;

  balances[0] = { total: startBalance, cash, spy, qqq, bitcoin, bonds };
  let failedYear: number | null = null;

  for (let y = 0; y < horizon; y++) {
    const currentYear = new Date().getFullYear() - horizon + y;
    const cape = capeData[currentYear] || 25; // Default to 25 if no data
    const capeYield = 1 / cape;
    const withdrawalRate = basePercentage + capeFraction * capeYield;
    const withdrawalAmount = balances[y].total * withdrawalRate;

    withdrawals[y] = withdrawalAmount;

    // Drawdown from cash first
    const fromCash = Math.min(withdrawalAmount, cash);
    cash -= fromCash;
    let remainingWithdrawal = withdrawalAmount - fromCash;

    if (remainingWithdrawal > 0) {
      const fromSpy = Math.min(remainingWithdrawal, spy);
      spy -= fromSpy;
      remainingWithdrawal -= fromSpy;

      if (remainingWithdrawal > 0) {
        const fromQqq = Math.min(remainingWithdrawal, qqq);
        qqq -= fromQqq;
        remainingWithdrawal -= fromQqq;
      }

      if (remainingWithdrawal > 0) {
        const fromBitcoin = Math.min(remainingWithdrawal, bitcoin);
        bitcoin -= fromBitcoin;
        remainingWithdrawal -= fromBitcoin;
      }

      if (remainingWithdrawal > 0) {
        const fromBonds = Math.min(remainingWithdrawal, bonds);
        bonds -= fromBonds;
      }
    }

    const totalBeforeGrowth = cash + spy + qqq + bitcoin + bonds;
    if (totalBeforeGrowth <= 0 && failedYear === null) {
      failedYear = y + 1;
      for (let i = y + 1; i <= horizon; i++) {
        balances[i] = { total: 0, cash: 0, spy: 0, qqq: 0, bitcoin: 0, bonds: 0 };
      }
      break;
    }

    // Apply market returns
    spy *= spyReturns[y];
    qqq *= qqqReturns[y];
    bitcoin *= bitcoinReturns[y];
    bonds *= bondReturns[y];

    const totalAfterGrowth = cash + spy + qqq + bitcoin + bonds;
    balances[y + 1] = { total: totalAfterGrowth, cash, spy, qqq, bitcoin, bonds };
  }

  return { balances, withdrawals, failedYear, guardrailTriggers: [] };
}

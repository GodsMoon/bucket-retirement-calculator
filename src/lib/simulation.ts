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
  const balancesAtMaxDrawdown: number[] = [];

  for (const sim of sims) {
    let peak = sim.balances[0];
    let maxDrawdown = 0;
    let balanceAtMaxDrawdown = sim.balances[0];

    for (const balance of sim.balances) {
      peak = Math.max(peak, balance);
      const drawdown = peak > 0 ? (peak - balance) / peak : 0;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
        balanceAtMaxDrawdown = balance;
      }
    }
    maxDrawdowns.push(maxDrawdown);
    balancesAtMaxDrawdown.push(balanceAtMaxDrawdown);
  }

  return {
    medianDrawdown: percentile(maxDrawdowns, 0.5),
    medianBalanceAtMaxDrawdown: percentile(balancesAtMaxDrawdown, 0.5),
    maxDrawdown: Math.max(...maxDrawdowns),
    worstBalanceAtMaxDrawdown: Math.min(...balancesAtMaxDrawdown),
  };
}

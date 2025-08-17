// Helper: convert percent to multiplier
export const pctToMult = (pct: number) => 1 + pct / 100;

// Simulation engine
export type RunResult = {
  balances: number[]; // length horizon+1 including year 0
  failedYear: number | null; // first year that ends <= 0 (1-based), else null
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

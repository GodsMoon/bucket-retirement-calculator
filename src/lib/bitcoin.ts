import { BITCOIN_TOTAL_RETURNS } from '../data/returns';

// Convert a percent return to a multiplier
const pctToMult = (pct: number) => 1 + pct / 100;

const btcReturnMap = new Map(BITCOIN_TOTAL_RETURNS.map(d => [d.year, d.returnPct]));
const btcYears = Array.from(btcReturnMap.keys());
const minYear = Math.min(...btcYears);
const maxYear = Math.max(...btcYears);
const span = maxYear - minYear + 1;

/**
 * Returns the Bitcoin total return multiplier for the given year.
 * Years outside the available data range wrap around so that early
 * start years can still be simulated.
 */
export function bitcoinReturnMultiplier(year: number): number {
  let lookup = year;
  if (lookup < minYear || lookup > maxYear) {
    lookup = ((lookup - minYear) % span + span) % span + minYear;
  }
  const pct = btcReturnMap.get(lookup);
  if (pct === undefined) {
    throw new Error(`No bitcoin return data for year ${lookup}`);
  }
  return pctToMult(pct);
}

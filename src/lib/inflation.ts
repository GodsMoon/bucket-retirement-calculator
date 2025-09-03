import { shuffle, bootstrapSample } from "./simulation";

export function generateInflationSequence(
  mode: "actual-seq" | "actual-seq-random-start" | "random-shuffle" | "bootstrap",
  horizon: number,
  startYear: number,
  yearsSorted: number[],
  ratesChrono: number[],
  availableRates: number[],
  yearSample?: number[],
): number[] {
  // If a specific year sample is provided, derive inflation directly from it.
  if (yearSample && yearSample.length > 0) {
    const rateByYear = new Map<number, number>();
    for (let i = 0; i < yearsSorted.length; i++) {
      rateByYear.set(yearsSorted[i], ratesChrono[i]);
    }
    return yearSample.map(y => rateByYear.get(y) ?? 0);
  }
  if (mode === "actual-seq") {
    let startIdx = yearsSorted.indexOf(startYear);
    if (startIdx === -1) startIdx = 0;
    return ratesChrono.slice(startIdx, startIdx + horizon);
  } else if (mode === "actual-seq-random-start") {
    const startIdx = Math.floor(Math.random() * ratesChrono.length);
    return Array.from({ length: horizon }, (_, i) => ratesChrono[(startIdx + i) % ratesChrono.length]);
  } else if (mode === "random-shuffle") {
    const shuffled = shuffle(availableRates);
    return Array.from({ length: horizon }, (_, i) => shuffled[i % shuffled.length]);
  } else if (mode === "bootstrap") {
    return bootstrapSample(availableRates, horizon);
  }
  return [];
}

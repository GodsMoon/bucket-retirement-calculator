import { useMemo } from "react";
import { SP500_TOTAL_RETURNS, NASDAQ100_TOTAL_RETURNS, BITCOIN_TOTAL_RETURNS } from "../data/returns";
import { TEN_YEAR_TREASURY_TOTAL_RETURNS } from "../data/bonds";
import { INFLATION_RATES } from "../data/inflation";
import { CAPE_DATA } from "../data/cape";

export default function DataTab() {
  const years = useMemo(() => {
    return Array.from(
      new Set([
        ...SP500_TOTAL_RETURNS.map(d => d.year),
        ...NASDAQ100_TOTAL_RETURNS.map(d => d.year),
        ...BITCOIN_TOTAL_RETURNS.map(d => d.year),
        ...TEN_YEAR_TREASURY_TOTAL_RETURNS.map(d => d.year),
        ...INFLATION_RATES.map(d => d.year),
        ...Object.keys(CAPE_DATA).map(Number),
      ])
    ).sort((a, b) => b - a);
  }, []);

  const rows = useMemo(() => years.map(year => ({
    year,
    sp500: SP500_TOTAL_RETURNS.find(d => d.year === year)?.returnPct ?? null,
    nasdaq100: NASDAQ100_TOTAL_RETURNS.find(d => d.year === year)?.returnPct ?? null,
    bitcoin: BITCOIN_TOTAL_RETURNS.find(d => d.year === year)?.returnPct ?? null,
    bonds: TEN_YEAR_TREASURY_TOTAL_RETURNS.find(d => d.year === year)?.returnPct ?? null,
    inflation: INFLATION_RATES.find(d => d.year === year)?.inflationPct ?? null,
    cape: CAPE_DATA[year] ?? null,
  })), [years]);

  const minYear = years[0];
  const maxYear = years[years.length - 1];

  return (
    <div className="space-y-4">
      <p className="text-sm">
        Annual returns and metrics used for simulations. Data spans {minYear}–{maxYear}.
      </p>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="sticky top-0 bg-white dark:bg-slate-800">
            <tr>
              <th className="px-2 py-1 text-left">Year</th>
              <th className="px-2 py-1 text-right">S&amp;P 500</th>
              <th className="px-2 py-1 text-right">NASDAQ 100</th>
              <th className="px-2 py-1 text-right">Bitcoin</th>
              <th className="px-2 py-1 text-right">10Y Treasury</th>
              <th className="px-2 py-1 text-right">Inflation</th>
              <th className="px-2 py-1 text-right">CAPE</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.year} className="border-b border-slate-200 dark:border-slate-700">
                <td className="px-2 py-1 text-left">{r.year}</td>
                <td className="px-2 py-1 text-right">{r.sp500 != null ? `${r.sp500.toFixed(2)}%` : "—"}</td>
                <td className="px-2 py-1 text-right">{r.nasdaq100 != null ? `${r.nasdaq100.toFixed(2)}%` : "—"}</td>
                <td className="px-2 py-1 text-right">{r.bitcoin != null ? `${r.bitcoin.toFixed(2)}%` : "—"}</td>
                <td className="px-2 py-1 text-right">{r.bonds != null ? `${r.bonds.toFixed(2)}%` : "—"}</td>
                <td className="px-2 py-1 text-right">{r.inflation != null ? `${r.inflation.toFixed(2)}%` : "—"}</td>
                <td className="px-2 py-1 text-right">{r.cape != null ? r.cape.toFixed(2) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}


import { useMemo } from "react";
import { useData } from "../data/DataContext";

export default function DataTab() {
  const { sp500, nasdaq100, bitcoin, bonds, inflation, cape, updateSeries, reset } = useData();
  const years = useMemo(() => {
    return Array.from(
      new Set([
        ...sp500.map(d => d.year),
        ...nasdaq100.map(d => d.year),
        ...bitcoin.map(d => d.year),
        ...bonds.map(d => d.year),
        ...inflation.map(d => d.year),
        ...Object.keys(cape).map(Number),
      ])
    ).sort((a, b) => b - a);
  }, [sp500, nasdaq100, bitcoin, bonds, inflation, cape]);

  const rows = useMemo(
    () =>
      years.map(year => ({
        year,
        sp500: sp500.find(d => d.year === year)?.returnPct ?? null,
        nasdaq100: nasdaq100.find(d => d.year === year)?.returnPct ?? null,
        bitcoin: bitcoin.find(d => d.year === year)?.returnPct ?? null,
        bonds: bonds.find(d => d.year === year)?.returnPct ?? null,
        inflation: inflation.find(d => d.year === year)?.inflationPct ?? null,
        cape: cape[year] ?? null,
      })),
    [years, sp500, nasdaq100, bitcoin, bonds, inflation, cape]
  );

  const maxYear = years[0];
  const minYear = years[years.length - 1];

  return (
    <div className="space-y-4">
      <p className="text-sm">
        Annual returns and metrics used for simulations. Data spans {minYear}–{maxYear}.
      </p>
      <button
        type="button"
        onClick={reset}
        className="rounded bg-slate-200 px-2 py-1 text-sm dark:bg-slate-700"
      >
        Reset to defaults
      </button>
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
                <td className="px-2 py-1 text-right">
                  <div className="flex items-center justify-end">
                    <input
                      type="number"
                      step="0.01"
                      className="w-20 bg-transparent text-right"
                      value={r.sp500 ?? ""}
                      onChange={e =>
                        updateSeries(
                          "sp500",
                          r.year,
                          e.target.value === "" ? null : Number(e.target.value)
                        )
                      }
                    />
                    <span className="ml-1">%</span>
                  </div>
                </td>
                <td className="px-2 py-1 text-right">
                  <div className="flex items-center justify-end">
                    <input
                      type="number"
                      step="0.01"
                      className="w-20 bg-transparent text-right"
                      value={r.nasdaq100 ?? ""}
                      onChange={e =>
                        updateSeries(
                          "nasdaq100",
                          r.year,
                          e.target.value === "" ? null : Number(e.target.value)
                        )
                      }
                    />
                    <span className="ml-1">%</span>
                  </div>
                </td>
                <td className="px-2 py-1 text-right">
                  <div className="flex items-center justify-end">
                    <input
                      type="number"
                      step="0.01"
                      className="w-20 bg-transparent text-right"
                      value={r.bitcoin ?? ""}
                      onChange={e =>
                        updateSeries(
                          "bitcoin",
                          r.year,
                          e.target.value === "" ? null : Number(e.target.value)
                        )
                      }
                    />
                    <span className="ml-1">%</span>
                  </div>
                </td>
                <td className="px-2 py-1 text-right">
                  <div className="flex items-center justify-end">
                    <input
                      type="number"
                      step="0.01"
                      className="w-20 bg-transparent text-right"
                      value={r.bonds ?? ""}
                      onChange={e =>
                        updateSeries(
                          "bonds",
                          r.year,
                          e.target.value === "" ? null : Number(e.target.value)
                        )
                      }
                    />
                    <span className="ml-1">%</span>
                  </div>
                </td>
                <td className="px-2 py-1 text-right">
                  <div className="flex items-center justify-end">
                    <input
                      type="number"
                      step="0.01"
                      className="w-20 bg-transparent text-right"
                      value={r.inflation ?? ""}
                      onChange={e =>
                        updateSeries(
                          "inflation",
                          r.year,
                          e.target.value === "" ? null : Number(e.target.value)
                        )
                      }
                    />
                    <span className="ml-1">%</span>
                  </div>
                </td>
                <td className="px-2 py-1 text-right">
                  <input
                    type="number"
                    step="0.01"
                    className="w-20 bg-transparent text-right"
                    value={r.cape ?? ""}
                    onChange={e =>
                      updateSeries(
                        "cape",
                        r.year,
                        e.target.value === "" ? null : Number(e.target.value)
                      )
                    }
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}


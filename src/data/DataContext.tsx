import { createContext, useContext, useState, type ReactNode } from "react";
import { SP500_TOTAL_RETURNS, NASDAQ100_TOTAL_RETURNS, BITCOIN_TOTAL_RETURNS } from "./returns";
import { TEN_YEAR_TREASURY_TOTAL_RETURNS } from "./bonds";
import { INFLATION_RATES } from "./inflation";
import { CAPE_DATA } from "./cape";

interface DataState {
  sp500: { year: number; returnPct: number }[];
  nasdaq100: { year: number; returnPct: number }[];
  bitcoin: { year: number; returnPct: number }[];
  bonds: { year: number; returnPct: number }[];
  inflation: { year: number; inflationPct: number }[];
  cape: { [year: number]: number };
}

interface DataContextValue extends DataState {
  updateSeries: (series: keyof DataState, year: number, value: number | null) => void;
  reset: () => void;
}

const DataContext = createContext<DataContextValue | undefined>(undefined);

const defaultData: DataState = {
  sp500: SP500_TOTAL_RETURNS.map(d => ({ ...d })),
  nasdaq100: NASDAQ100_TOTAL_RETURNS.map(d => ({ ...d })),
  bitcoin: BITCOIN_TOTAL_RETURNS.map(d => ({ ...d })),
  bonds: TEN_YEAR_TREASURY_TOTAL_RETURNS.map(d => ({ ...d })),
  inflation: INFLATION_RATES.map(d => ({ ...d })),
  cape: { ...CAPE_DATA },
};

export function DataProvider({ children }: { children: ReactNode }) {
  const [sp500, setSp500] = useState(defaultData.sp500);
  const [nasdaq100, setNasdaq100] = useState(defaultData.nasdaq100);
  const [bitcoin, setBitcoin] = useState(defaultData.bitcoin);
  const [bonds, setBonds] = useState(defaultData.bonds);
  const [inflation, setInflation] = useState(defaultData.inflation);
  const [cape, setCape] = useState(defaultData.cape);

  const updateArray = <T extends { year: number }>(
    arr: T[],
    year: number,
    value: number | null,
    key: keyof T
  ): T[] => {
    const idx = arr.findIndex(d => d.year === year);
    if (idx === -1) return arr;
    const next = arr.slice();
    next[idx] = { ...next[idx], [key]: value } as T;
    return next;
  };

  const updateSeries = (
    series: keyof DataState,
    year: number,
    value: number | null
  ) => {
    if (series === "sp500") setSp500(p => updateArray(p, year, value, "returnPct"));
    else if (series === "nasdaq100") setNasdaq100(p => updateArray(p, year, value, "returnPct"));
    else if (series === "bitcoin") setBitcoin(p => updateArray(p, year, value, "returnPct"));
    else if (series === "bonds") setBonds(p => updateArray(p, year, value, "returnPct"));
    else if (series === "inflation") setInflation(p => updateArray(p, year, value, "inflationPct"));
    else if (series === "cape")
      setCape(p => {
        const next = { ...p };
        if (value == null || Number.isNaN(value)) delete next[year];
        else next[year] = value;
        return next;
      });
  };

  const reset = () => {
    setSp500(defaultData.sp500.map(d => ({ ...d })));
    setNasdaq100(defaultData.nasdaq100.map(d => ({ ...d })));
    setBitcoin(defaultData.bitcoin.map(d => ({ ...d })));
    setBonds(defaultData.bonds.map(d => ({ ...d })));
    setInflation(defaultData.inflation.map(d => ({ ...d })));
    setCape({ ...defaultData.cape });
  };

  return (
    <DataContext.Provider
      value={{ sp500, nasdaq100, bitcoin, bonds, inflation, cape, updateSeries, reset }}
    >
      {children}
    </DataContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error("useData must be used within DataProvider");
  return ctx;
}


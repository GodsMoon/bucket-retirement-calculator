export interface ChartColorClasses {
  chart: string;
  chip: string;
}

const categories: Record<'trajectory' | 'asset-allocation', ChartColorClasses> = {
  trajectory: {
    chart: 'border-blue-400 dark:border-blue-600',
    chip: 'bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200',
  },
  'asset-allocation': {
    chart: 'border-green-400 dark:border-green-600',
    chip: 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200',
  },
};

export function getChartColor(id: string): ChartColorClasses {
  return id.includes('asset-allocation') ? categories['asset-allocation'] : categories.trajectory;
}

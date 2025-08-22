export interface ChartColorClasses {
  chart: string;
  chip: string;
}

const categories: Record<'trajectory' | 'trajectory-bands' | 'asset-allocation', ChartColorClasses> = {
  trajectory: {
    chart: 'border-blue-400 dark:border-blue-600',
    chip: 'bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200',
  },
  'trajectory-bands': {
    chart: 'border-purple-400 dark:border-purple-600',
    chip: 'bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200',
  },
  'asset-allocation': {
    chart: 'border-green-400 dark:border-green-600',
    chip: 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200',
  },
};

export function getChartColor(id: string): ChartColorClasses {
  if (id.includes('asset-allocation')) return categories['asset-allocation'];
  if (id.endsWith('-trajectory') && !id.includes('sample') && !id.includes('median')) {
    return categories['trajectory-bands'];
  }
  return categories.trajectory;
}

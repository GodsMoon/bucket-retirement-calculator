import xlsx from 'xlsx';
import fs from 'fs';

const workbook = xlsx.readFile('ie_data.xls');
const sheetName = 'Data';
const worksheet = workbook.Sheets[sheetName];
const data = xlsx.utils.sheet_to_json(worksheet, { header: 1 });

const capeData = {};

// Find the header row
// Data starts at row 8 (0-indexed)
// Date is in column 0, CAPE is in column 12
for (let i = 7; i < data.length; i++) {
  const row = data[i];
  const date = row[0];
  const cape = row[12];

  if (typeof date === 'number' && typeof cape === 'number') {
    const year = Math.floor(date);
    if (!capeData[year]) {
      capeData[year] = [];
    }
    capeData[year].push(cape);
  }
}

// Calculate annual average CAPE
const annualCape = {};
for (const year in capeData) {
  const capes = capeData[year];
  const sum = capes.reduce((a, b) => a + b, 0);
  annualCape[year] = sum / capes.length;
}

// Write to a TypeScript file
let output = 'export const CAPE_DATA: { [year: number]: number } = {\n';
for (const year in annualCape) {
  output += `  ${year}: ${annualCape[year]},\n`;
}
output += '};\n';

fs.writeFileSync('src/data/cape.ts', output);

console.log('Successfully created src/data/cape.ts');

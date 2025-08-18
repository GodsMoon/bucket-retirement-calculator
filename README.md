# Bucket Retirement Calculator

Bucket Retirement Calculator tests the classic 4% retirement withdrawal rule across different investment buckets. Built with React, TypeScript, Vite and Tailwind CSS, it lets you run historical or Monte Carlo simulations for the S&P 500, Nasdaq 100 or a custom mix of cash, SPY and QQQ to see how long your savings may last.

## Live Demo

The latest build is available at [bucket-retirement-calculator.vercel.app](https://bucket-retirement-calculator.vercel.app/).

## Features

- **Asset buckets** – model a single index or mix cash, S&P 500 (SPY) and Nasdaq 100 (QQQ).
- **Drawdown strategies** – cash first, best/worst performer, equal parts and more.
- **Withdrawal rules** – Guyton–Klinger, floor & ceiling, CAPE-based or fixed percentage.
- **Monte Carlo modes** – run historical sequences, random start years, shuffled returns or bootstrap samples.
- **Inflation controls** – toggle CPI adjustments and choose a custom inflation rate.
- **Interactive charts** – visualize portfolio balances and success rates over the retirement horizon.

## Getting Started

```bash
npm install
npm run dev
```

Open the URL printed by the dev command in your browser to explore the app.

### Additional scripts

- `npm run build` – generate a production build
- `npm run preview` – serve the production build locally
- `npm run lint` – run ESLint checks

## Data

Historical index data is sourced from Robert Shiller's *ie_data.xls* dataset included in the repository.

## License

Distributed under the GPL-3.0 License. See [LICENSE](./LICENSE) for details.


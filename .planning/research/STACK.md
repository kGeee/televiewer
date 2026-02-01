# Stack Research: Telemetry Merge & Data-Dense Dashboard

**Research Date:** 2026-01-31
**Context:** Adding multi-source telemetry merging and full UI redesign to existing SvelteKit motorsport telemetry app

## Signal Processing & Cross-Correlation

### Recommended: Custom Implementation (High Confidence)

Cross-correlation for time-aligning two speed signals is straightforward (~50-100 lines of TypeScript). The algorithm:
1. Downsample both signals to common rate (e.g., 10Hz)
2. Normalize both signals (zero mean, unit variance)
3. Compute cross-correlation at each possible lag
4. Peak correlation = optimal time offset

This runs once per import, not real-time. No heavy libraries needed.

```typescript
// Core cross-correlation — O(n*m) but n,m are small after downsampling
function crossCorrelate(signal1: number[], signal2: number[], maxLag: number): { lag: number; correlation: number } {
  let bestLag = 0, bestCorr = -Infinity;
  for (let lag = -maxLag; lag <= maxLag; lag++) {
    let sum = 0, count = 0;
    for (let i = 0; i < signal1.length; i++) {
      const j = i + lag;
      if (j >= 0 && j < signal2.length) {
        sum += signal1[i] * signal2[j];
        count++;
      }
    }
    const corr = count > 0 ? sum / count : 0;
    if (corr > bestCorr) { bestCorr = corr; bestLag = lag; }
  }
  return { lag: bestLag, correlation: bestCorr };
}
```

**Why custom over libraries:**
- Problem is well-scoped (1D cross-correlation, not general DSP)
- Runs once per import (performance non-critical)
- Zero dependencies added
- Full control over edge cases (sample rate mismatch, partial overlap)

### Fallback: ml.js (Medium Confidence)

If custom implementation proves insufficient (e.g., need FFT-based correlation for very long signals):
- `ml-matrix` v6.11.0 — Matrix operations
- `ml-stat` v1.3.3 — Statistical functions
- ~120KB bundle impact
- Only add if needed; start without

### Avoid

- **Python bridges / serverless** — Unnecessary infra complexity for a one-shot correlation
- **TensorFlow.js** — Massive overkill (~3MB), designed for ML not signal processing
- **dsp.js** — Unmaintained, last update 2013
- **Fourier transforms** — Time-domain cross-correlation sufficient for this use case

## Data-Dense Dashboard Components

### Charting: LayerChart v0.40+ (High Confidence)

- Native Svelte 5 library (not a React wrapper)
- D3-based with canvas rendering for high-frequency data
- Multi-series overlays ideal for lap comparison
- Supports zoom, pan, crosshair, tooltips
- ~30KB gzipped

**Why over Chart.js (current):**
- Better Svelte integration (reactive props, not imperative API)
- Canvas + SVG hybrid (performance for telemetry, quality for annotations)
- Purpose-built for data-dense visualizations
- Chart.js can coexist during migration

**Migration strategy:** Keep Chart.js for existing views, use LayerChart for new lap comparison and merged telemetry views. Migrate incrementally.

### UI Primitives: Bits UI v0.21+ (High Confidence)

- Headless UI components for Svelte 5 (tabs, dropdowns, popovers, dialogs)
- Unstyled — pairs perfectly with TailwindCSS 4
- Accessible by default
- ~20KB gzipped

**Why needed:** Data-dense dashboards need popovers, context menus, split panes, tabs — currently hand-rolled or missing.

### Keep Existing

- **Chart.js** — Don't remove, migrate gradually
- **Leaflet** — Still best for track maps
- **TailwindCSS 4** — Foundation for design system
- **lucide-svelte** — Icon library, adequate

### Avoid

- **ECharts** — Heavy (~1MB), React-centric community, poor Svelte integration
- **Plotly** — Heavy, not designed for real-time-like data density
- **Recharts / Victory / Tremor** — React-only
- **Shadcn-svelte** — Opinionated styling conflicts with custom design system
- **AG Grid** — Overkill unless building spreadsheet-like views

## New Dependencies Summary

| Package | Purpose | Size | Confidence |
|---------|---------|------|------------|
| layerchart | Data-dense charting, lap comparison | ~30KB gz | High |
| bits-ui | Headless UI primitives | ~20KB gz | High |
| ml-matrix (optional) | Matrix ops if FFT correlation needed | ~80KB gz | Medium — only if custom cross-correlation insufficient |

**Total bundle impact:** +50KB minimum, +170KB maximum

## Design System Approach

### Color System
- Dark-first (motorsport aesthetic)
- TailwindCSS 4 custom theme with CSS variables
- High-contrast data colors for telemetry channels (speed=blue, throttle=green, brake=red — motorsport convention)
- Semantic tokens: `--surface-*`, `--accent-*`, `--data-*`

### Typography
- Monospace for data values (lap times, channel readings)
- Sans-serif for labels and navigation
- Tabular numbers for aligned columns

### Component Strategy
- Build on Bits UI primitives + TailwindCSS
- Custom components: DataPanel, ChannelLegend, LapSelector, SplitView
- No external component library for visual components (own design language)

---
*Stack research: 2026-01-31*

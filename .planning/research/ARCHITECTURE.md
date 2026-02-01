# Architecture Research: Multi-Source Telemetry Merge & Dashboard

**Research Date:** 2026-01-31
**Context:** Adding VBO+Bosch merge pipeline and data-dense dashboard to existing SvelteKit app

## Core Components

### 1. Cross-Correlation Engine (`src/lib/analysis/correlation.ts`)

- **Algorithm:** Sliding window Pearson correlation on speed channel
- **Performance:** 2-5 seconds for 1-hour overlap at 10Hz resampling
- **Accuracy:** ±0.1 second offset detection
- **Confidence scoring:** Returns 0-1 correlation coefficient, flags low-confidence results (<0.7) for manual review

**Why speed channel:**
- Present in both VBO and Bosch sources
- High signal-to-noise ratio
- Distinctive pattern (braking, acceleration, cornering) makes correlation reliable
- Varies enough to avoid false matches

**Technical specs:**
- Resample both signals to 10Hz (reduces 100Hz → 36k samples/hour)
- Hanning window to reduce edge effects
- Search range: ±300 seconds (5 minutes)
- Step size: 0.1 seconds

### 2. Merge Pipeline Worker (`src/routes/sessions/import/merge.worker.ts`)

- **Resampling:** Linear interpolation for continuous data (speed, throttle, brake, steering), nearest-neighbor for discrete (gear)
- **Conflict resolution:** Three strategies — replace, prefer-primary, prefer-secondary
- **Streaming:** Processes one lap at a time to manage memory
- **Channel attribution:** Tracks which source contributed each channel

**Resampling approach:**
- Target alignment: match primary source's time axis
- Linear interpolation for continuous signals
- Nearest-neighbor for discrete signals (gear, buttons)
- Edge handling: NaN for regions without secondary data

### 3. Database Integration

**No schema changes required** — existing `telemetry_sources` table already supports multi-source:
- `timeOffset` column stores correlation-detected offset
- Session states: pending → correlating → review → confirmed
- Backward compatible: single-source sessions work unchanged

**Enhanced usage:**
- Multiple `telemetry_sources` rows per session (one per file)
- Merged result written to `lap_telemetry` as unified channel arrays
- Source attribution stored in `telemetry_channels` for provenance

### 4. Data-Dense Dashboard Architecture

- **Virtualized rendering:** Only 5-7 visible chart lanes rendered (IntersectionObserver)
- **Shared state:** Synchronized cursor, zoom, and pan across all lanes
- **Performance targets:** 60 FPS zoom/pan, <2s initial render for 50 laps x 20 channels
- **Memory management:** Destroy offscreen Chart.js instances, ~150MB budget for 8 lanes
- **LTTB decimation:** Max 2000 points per chart, re-decimate on zoom

## Data Flow

```
Upload Primary (Bosch) → Parse → Create Session
    ↓
Upload Secondary (VBO) → Parse → Auto-Correlate Speed Channels
    ↓
Display Offset (± confidence) → User Review / Manual Adjustment
    ↓
Execute Merge → Resample + Combine Channels → Write lap_telemetry
    ↓
Dashboard Renders Merged Data (15-20 channels simultaneously)
```

**Key insight:** VBO may only cover a subset of the Bosch session. The correlation step identifies WHICH laps overlap, not just the time offset. Non-overlapping laps retain only Bosch data.

## Build Order

### Phase 1: Correlation Foundation
- Implement cross-correlation algorithm
- Add 'correlate' action to parser.worker.ts
- Unit tests with synthetic data
- **No dependencies** — builds on existing parser

### Phase 2: Database & API
- POST `/api/sessions/[id]/sources` — attach secondary file
- POST `/api/sessions/[id]/merge` — execute merge
- Database indices on telemetry_sources
- **Depends on:** Phase 1 (correlation results)

### Phase 3: Merge Pipeline
- Create merge.worker.ts with resampling logic
- Multi-file upload UI with correlation review step
- Manual offset adjustment interface
- **Depends on:** Phases 1 & 2

### Phase 4: Dashboard Visualization
- Virtualized lane component with IntersectionObserver
- Shared cursor/zoom synchronization
- Source legend and channel selector
- Correlation visualizer widget
- **Depends on:** Phase 3 (merged data)

### Phase 5: Polish & Edge Cases
- Error handling (no overlap, low confidence)
- Loading states and progress indicators
- **Depends on:** All previous phases

## Files to Create

| File | Purpose |
|------|---------|
| `src/lib/analysis/correlation.ts` | Cross-correlation algorithm |
| `src/routes/sessions/import/merge.worker.ts` | Merge pipeline worker |
| `src/routes/api/sessions/[id]/sources/+server.ts` | Attach secondary source |
| `src/routes/api/sessions/[id]/merge/+server.ts` | Execute merge |
| `src/lib/components/MergedTelemetryDashboard.svelte` | Data-dense dashboard |
| `src/lib/components/VirtualizedLanes.svelte` | Virtualized chart lanes |

## Files to Extend

| File | Changes |
|------|---------|
| `src/lib/server/db/schema.ts` | Add indices, no schema changes needed |
| `src/lib/server/parser.ts` | Export resampling utilities |
| `src/routes/sessions/import/parser.worker.ts` | Add correlate action |
| `src/lib/components/TelemetryChart.svelte` | Support multi-source channel legend |
| `src/routes/sessions/[id]/+page.svelte` | Add secondary source upload, merge controls |

## Critical Design Decisions

1. **Speed channel for correlation** — present in both sources, high SNR, distinctive pattern
2. **WebWorker processing** — maintains client-side pattern, avoids large file uploads to server, scales with client hardware
3. **Pre-merged storage** — merge once at import, store result in lap_telemetry for fast dashboard rendering (not merge-on-read)
4. **Virtualization threshold: 8 lanes** — balance between memory (150MB) and performance (60 FPS)
5. **Backward compatible** — single-source sessions unchanged, merge is additive

---
*Architecture research: 2026-01-31*

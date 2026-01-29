# Implementation Plan: Smart Import & Telemetry Visualization

## Phase 1: Telemetry Database Support (Current)
- [ ] Update `schema.ts` to include a `telemetry_blobs` table (storing large time-series data efficiently) or detailed `telemetry_points` table.
   - *Decision*: Storing as compressed JSON/Blob per lap might be more performant for SQLite than millions of rows.
- [ ] Run migrations.

## Phase 2: Smart Import Feature
- [ ] Create `/sessions/import` route.
- [ ] Implement file upload UI (Drag & Drop).
- [ ] Build Parser Service:
    - Needs to handle the raw text format (Source of Truth).
    - extract Session metadata (Date, Track, etc) if available in header.
    - extract High-frequency channels (RPM, Speed, Throttle, Brake, Steering, Lat/Long G).
    - Detect Lap boundaries (if not explicit, calculate based on beacon/position).
- [ ] Server Action to process file -> Parse -> Insert to DB.

## Phase 3: Interactive Telemetry Analysis
- [ ] Integrate a high-performance Charting Library (e.g., Chart.js with Zoom plugin or uPlot).
- [ ] Update `/sessions/[id]` to include the "Telemetry Analysis" tab.
- [ ] Implement interactivity:
    - [ ] Zoom/Pan support.
    - [ ] Channel toggles (User selects what to graph).
    - [ ] "Click Lap to Zoom" feature.

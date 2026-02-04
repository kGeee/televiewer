# Roadmap: Televiewer

**Project:** Televiewer — Multi-Source Telemetry Merge & Data-Dense Dashboard
**Core Value:** Drivers can see exactly what happened at every point on track — unified telemetry from multiple data sources on one timeline, with video sync and coaching analysis.
**Created:** 2026-01-31
**Depth:** Standard (9 phases across 2 milestones)

## Overview

This roadmap delivers two independent milestones: (1) Multi-source telemetry merge capability enabling VBO + Bosch file combination with auto-alignment, and (2) Complete UI redesign for data-dense dashboard visualization with lap overlay comparison. Each milestone delivers coherent value independently. Phases are ordered to minimize risk: correlation algorithm proven before merge pipeline, component extraction and tests before redesign, design system before component building.

## Milestones & Phases

### Milestone 1: Multi-Source Telemetry Merge

Enables drivers to upload secondary telemetry files and merge data from multiple loggers into unified timeline.

#### Phase 1: Correlation Engine

**Goal:** System can auto-detect time offset between two telemetry sources via speed channel cross-correlation.

**Dependencies:** None (foundation phase)

**Requirements:**

- MERGE-02: Auto-detect time offset via speed cross-correlation
- MERGE-04: Display correlation confidence score with visual indicator

**Success Criteria:**

1. System computes time offset between two speed channel arrays with ±0.1s accuracy
2. Correlation confidence score (0-1) displays with color coding (green >0.8, yellow 0.6-0.8, red <0.6)
3. Low-confidence results (<0.7) trigger warning prompting manual review
4. Cross-correlation algorithm completes in <2 seconds for typical session (100 laps, 10Hz sampling)

**Plans:**

- [ ] 01-01-PLAN.md — Core cross-correlation algorithm with Pearson correlation (TDD)
- [ ] 01-02-PLAN.md — Signal preprocessing pipeline (resampling, normalization, windowing)
- [ ] 01-03-PLAN.md — Confidence scoring and assessment (green/yellow/red indicators)
- [ ] 01-04-PLAN.md — API endpoint and UI integration (checkpoint for verification)

---

#### Phase 2: Multi-Source Upload & Alignment

**Goal:** Drivers can upload secondary telemetry file and preview alignment before finalizing merge.

**Dependencies:** Phase 1 (correlation engine)

**Requirements:**

- MERGE-01: Upload secondary telemetry file for existing session
- MERGE-05: Manually adjust time offset if auto-alignment confidence is low
- MERGE-06: Visual preview of alignment (overlaid speed channels)

**Success Criteria:**

1. Driver can attach VBO or Bosch/Wintax file to existing session from session detail page
2. Visual preview shows primary and secondary speed channels overlaid with detected offset applied
3. Driver can adjust offset with slider or numeric input and see preview update in real-time
4. Driver can finalize merge or cancel without affecting original session data

---

#### Phase 3: Merge Pipeline & Storage

**Goal:** System merges telemetry from multiple sources into unified timeline stored in existing schema.

**Dependencies:** Phase 2 (upload and alignment UI)

**Requirements:**

- MERGE-07: Resample both sources to common time axis (linear interpolation for continuous, nearest-neighbor for discrete)
- MERGE-08: Merge channels into unified timeline in existing lap_telemetry schema
- MERGE-09: Deduplicate channels when both sources have same data (prefer higher-fidelity source)
- MERGE-12: Track source attribution per channel

**Success Criteria:**

1. System resamples VBO (10Hz) and Bosch (100Hz) to common 10Hz time axis for unified storage
2. Merged session stores all channels from both sources in lap_telemetry table without schema changes
3. When both sources provide same channel (e.g., speed), system uses higher sample rate source and logs which was chosen
4. Source attribution metadata (which file contributed each channel) persists in telemetry_sources table
5. Merge process completes in <10 seconds for typical session (50 laps, 8 channels per source)

---

#### Phase 4: Integration & Edge Cases

**Goal:** Merged sessions display seamlessly in all existing views, with robust handling of partial overlap and edge cases.

**Dependencies:** Phase 3 (merge pipeline)

**Requirements:**

- MERGE-03: Handle VBO covering subset of laps from longer Bosch session
- MERGE-10: Display merged sessions in existing telemetry views (charts, map, video sync)
- MERGE-11: Single-source sessions continue to work unchanged (backward compatibility)

**Success Criteria:**

1. System correctly merges VBO covering laps 3-8 with Bosch session covering laps 1-15, marking partial coverage laps
2. Merged sessions render in session detail page with all charts, track map, and video sync functioning identically to single-source sessions
3. Existing single-source sessions load and display without changes to behavior or performance
4. Lap table displays indicator showing which laps have full vs partial telemetry coverage
5. System detects and handles edge cases: no overlap (error message), clock drift (warning), sample rate >10x difference (downsample warning)

---

#### Phase 5: Parquet Telemetry Storage

**Goal:** Telemetry data is stored in Parquet files instead of JSON blobs in SQLite, enabling columnar access, compression, and faster reads for large datasets.

**Dependencies:** Phase 4 (integration & edge cases)

**Requirements:**

- INFRA-04: Migrate telemetry storage from JSON blobs in SQLite to Parquet files on disk
- INFRA-05: Read/write telemetry data via Parquet with equivalent or better performance
- INFRA-06: Migrate existing sessions from JSON to Parquet format

**Success Criteria:**

1. New telemetry imports write Parquet files to disk with per-lap granularity (one file per lap or per session)
2. All telemetry read paths (charts, track map, analysis, merge) consume Parquet instead of JSON blobs
3. Existing sessions with JSON telemetry are migrated to Parquet via one-time migration script
4. Parquet storage achieves smaller on-disk size than equivalent JSON blobs (target: 50%+ compression)
5. Telemetry read performance is equivalent or better than JSON blob parsing for typical session loads

**Plans:**

- [ ] TBD (run /gsd:plan-phase 5 to break down)

---

### Milestone 2: Data-Dense Dashboard

Redesigns UI for data-dense visualization with lap overlay comparison, following Grafana/Bloomberg aesthetic.

#### Phase 6: Foundation & Refactoring

**Goal:** Session detail page is decomposed into testable components with design system foundation in place.

**Dependencies:** None (independent milestone)

**Requirements:**

- INFRA-01: Extract session detail page into manageable components (from 2535-line monolith)
- INFRA-02: Add regression tests for critical paths (import → parse → store → display)
- DSGN-01: Define color system with CSS variables (dark-first, high-contrast data colors)
- DSGN-02: Define typography scale (monospace for data, sans-serif for labels, tabular numbers)
- DSGN-03: Define spacing and layout tokens as TailwindCSS 4 custom theme
- DSGN-04: Create consistent component library (buttons, cards, inputs, tables, panels)

**Success Criteria:**

1. Session detail page decomposed into 5+ components (VideoPlayer, TelemetryPanel, LapSelector, TrackMap, RemapModal) with clear responsibilities
2. Regression tests cover import flow (upload → parse → store) and session display with 3+ known fixture files
3. Design system CSS variables defined for colors (10 data channel colors following motorsport conventions), typography (3 scales), spacing (8-point grid)
4. Component library includes 8+ reusable components built on Bits UI primitives with consistent styling
5. All tests pass and components render existing functionality without visual changes

---

#### Phase 7: Session Detail Redesign

**Goal:** Session detail page displays data-dense layout with synchronized charts, map, and video.

**Dependencies:** Phase 6 (component extraction and design system)

**Requirements:**

- DSGN-05: Apply design system to all existing pages (sessions list, import, session detail, drivers)
- DASH-04: Session detail page displays data-dense layout (Grafana/Bloomberg-inspired)
- DASH-05: Charts, track map, and video remain synchronized with shared cursor/zoom
- INFRA-03: Responsive layout works on laptop, desktop, and ultrawide screens

**Success Criteria:**

1. Session detail page redesigned with data-dense layout (minimum 3 telemetry charts visible without scroll on 1080p screen)
2. All pages (sessions list, import, session detail, drivers) use design system colors, typography, and components
3. Cursor position on any telemetry chart syncs to track map, video player, and all other charts in real-time
4. Layout adapts to screen sizes from laptop (1366x768) to ultrawide (3440x1440) with appropriate information density
5. Feature flag allows toggling between old and new session detail page design

---

#### Phase 8: Lap Overlay & Visualization

**Goal:** Drivers can overlay multiple laps on same chart and toggle channel visibility for comparison analysis.

**Dependencies:** Phase 7 (redesigned session detail)

**Requirements:**

- DASH-01: Overlay 2-4 laps on same chart with distinct colors and transparency
- DASH-02: Toggle visibility of individual telemetry channels without page reload
- DASH-03: Compact numeric readouts for all channels at current cursor position
- DASH-08: Keyboard shortcuts (space=play/pause, arrows=prev/next lap, +/- zoom)

**Success Criteria:**

1. Driver can select 2-4 laps and overlay them on all telemetry charts with distinct colors and 60% transparency
2. Channel visibility toggles update charts instantly (<100ms) without full page reload or loss of zoom/cursor position
3. Sidebar displays compact numeric readouts for all channels (speed, rpm, throttle, brake, gear, steering) at cursor position
4. Keyboard shortcuts work globally: space=play/pause video, left/right arrows=prev/next lap, +/- zoom in/out
5. Overlay rendering maintains 60 FPS performance with 4 laps × 8 channels × 10,000 points (320k total points)

---

#### Phase 9: Advanced Features & Persistence

**Goal:** Drivers can save custom dashboard layouts and access enhanced coaching insights with persistent sidebar.

**Dependencies:** Phase 8 (lap overlay and visualization)

**Requirements:**

- DASH-06: Save custom chart layouts (which channels visible, sizes, order)
- DASH-07: Saved layouts auto-load based on track or session type
- DASH-09: AI coaching insights displayed in persistent sidebar (not just tooltip)
- DASH-10: Coaching tips highlight corresponding regions on telemetry charts
- DASH-11: Dismiss or acknowledge individual coaching tips

**Success Criteria:**

1. Driver can save custom layout (channel visibility, chart order, sizes) with name and associate with specific track
2. When opening session at saved track, dashboard loads custom layout automatically (fallback to default if no match)
3. Coaching insights sidebar displays all AI-generated tips (coasting, braking, throttle hesitation, steering scrub) with expand/collapse sections
4. Clicking coaching tip in sidebar highlights corresponding time range on all telemetry charts with colored overlay
5. Driver can dismiss individual tips (hides from view) or acknowledge (marks as reviewed) with state persisting across sessions

---

## Progress

| Phase                           | Status  | Requirements | Plans | Branch |
| ------------------------------- | ------- | ------------ | ----- | ------ |
| 1 - Correlation Engine          | Ready   | 2            | 4/0   | -      |
| 2 - Multi-Source Upload         | Pending | 3            | 0/0   | -      |
| 3 - Merge Pipeline              | Pending | 4            | 0/0   | -      |
| 4 - Integration & Edge Cases    | Pending | 3            | 0/0   | -      |
| 5 - Parquet Telemetry Storage   | Pending | 3            | 0/0   | -      |
| 6 - Foundation & Refactoring    | Pending | 6            | 0/0   | -      |
| 7 - Session Detail Redesign     | Pending | 4            | 0/0   | -      |
| 8 - Lap Overlay & Visualization | Pending | 4            | 0/0   | -      |
| 9 - Advanced Features           | Pending | 5            | 0/0   | -      |

**Total:** 34 requirements across 9 phases (2 milestones)

---

## Phase Dependencies

```
Milestone 1 (Merge):
Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5

Milestone 2 (Dashboard):
Phase 6 → Phase 7 → Phase 8 → Phase 9

(Milestones are independent and can be executed in parallel or sequentially)
```

---

_Last updated: 2026-02-03_

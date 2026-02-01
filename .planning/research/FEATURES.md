# Feature Research: Multi-Source Telemetry Merge & Data-Dense Dashboards

**Research Date:** 2026-01-31
**Project:** Televiewer — Motorsport Telemetry Analysis Platform
**Focus Areas:** Multi-source data merge capabilities, data-dense dashboard design patterns
**Competitive Products:** MoTeC i2 Pro, AiM Race Studio 3, Pi Toolbox, Atlas, RaceRender

## Executive Summary

Motorsport telemetry analysis tools serve race engineers, data analysts, and advanced amateur drivers who expect extreme information density and precise time-aligned data from multiple sources. The market is dominated by hardware-bundled software (MoTeC, AiM, Pi) with high barriers to entry.

**Key Findings:**
- Multi-source merge is table stakes for professional tools — users routinely combine ECU, GPS, and video logger data
- Auto-alignment via GPS/speed cross-correlation is standard in MoTeC i2 and Atlas
- Data-dense UI with customizable layouts is universal — think Bloomberg Terminal for racing
- Lap comparison overlays are the #1 use case after data import
- Math channels (calculated data) are critical for advanced users but complex to implement

## 1. Multi-Source Data Merge Features

### 1.1 Table Stakes (Must Have)

**Data Import & Format Support**
- Multiple file format support (VBO, Bosch, Wintax) — already implemented
- Drag-and-drop multi-file import (upload multiple files for same session) — Complexity: Low
- Session metadata preservation from all sources — Complexity: Low

**Time Alignment & Synchronization**
- Auto-detect time offset between data sources (speed cross-correlation) — Complexity: High
  - MoTeC uses FFT-based cross-correlation with 0.01s precision
  - Atlas allows manual offset adjustment with live preview
  - Speed is most reliable shared channel (GPS can drift, throttle has lag)
- Handle partial session overlap (VBO covers laps 3-8 of 15-lap Bosch session) — Complexity: Medium
  - Store data ranges per source: `{source: 'vbo', startLap: 3, endLap: 8}`
  - UI must clearly indicate which channels are available for which laps
- Merge into unified timeline (single time/distance axis for all channels) — Complexity: Medium
  - Resample to common frequency (10Hz or 100Hz)
  - Interpolate missing samples if sources have different rates
- Channel deduplication (prefer higher-fidelity source when both have same channel) — Complexity: Medium
  - Default priority: VBO > Bosch for GPS, Bosch > VBO for engine data
  - Allow user override

**Data Quality & Validation**
- Visual preview before finalize (show alignment quality, overlapped channels) — Complexity: Medium
- Confidence score for auto-alignment (correlation coefficient, visual indicator) — Complexity: Low
- Manual offset adjustment (fallback if auto-alignment fails) — Complexity: Medium

### 1.2 Differentiators (Competitive Advantage)

**Smart Merge Intelligence**
- AI-suggested merge strategy (detect which source should be primary) — Complexity: High
  - No competitor has this — all are manual or rigid rule-based
- Automatic gap detection & notification — Complexity: Medium
  - "VBO missing last 2 laps, Bosch has GPS drift in lap 5"
- Visual diff view during import (before/after with color-coded sources) — Complexity: Medium
  - No competitor does this well — transparency builds trust

**Workflow Optimization**
- Merge templates (save strategy for specific hardware combinations) — Complexity: Low
- Batch merge (upload 10 Bosch + 10 VBO files, auto-match by timestamp) — Complexity: High
  - No competitor has this — huge time-saver for end-of-season analysis

### 1.3 Anti-Features (Deliberately NOT Building)

- Real-time live telemetry merge — post-session files only
- More than 2 sources per session — VBO + Bosch is 80% use case
- Video-based time sync — GPS/speed correlation is reliable enough
- Cloud-based merge processing — run locally in browser/Node
- Support for proprietary encrypted formats — reverse engineering risk

## 2. Data-Dense Dashboard Features

### 2.1 Table Stakes (Must Have)

**Layout & Visualization**
- Multi-lane telemetry charts (stacked channels, shared time axis, independent Y) — already exists, needs polish
- Synchronized cursor across all charts — already exists, needs visual refinement
- Lap overlay comparison (2-5 laps on same chart) — Complexity: Medium
  - MoTeC i2 supports 8 laps, AiM supports 4
  - Critical gap in current app
  - Common use case: fastest lap vs current vs reference
- GPS track map overlay synchronized with charts — already exists
- Zoom & pan with mouse/trackpad — already exists, needs UX polish

**Data Display Density**
- Channel selector (toggle visibility of 20+ channels) — Complexity: Medium
  - Currently hardcoded config, needs dynamic toggle
- Compact numeric readouts (values at cursor position in sidebar) — Complexity: Low
  - Currently tooltip only, needs persistent sidebar
- Lap time table (sortable: lap #, time, sectors, delta to best) — Complexity: Low
  - Basic implementation exists, needs sorting/filtering
- Session summary cards (fastest lap, avg, total time, conditions) — Complexity: Low

**Workspace Management**
- Save/load custom layouts per track — Complexity: Medium
  - MoTeC has workspace files (.ws), AiM has analysis files
  - Critical gap in current app
- Responsive layout (laptop, desktop, ultrawide) — Complexity: Medium
  - All competitors are desktop-only — web-first is an advantage
- Dark/light theme — already implemented

### 2.2 Differentiators (Competitive Advantage)

**Advanced Visualization**
- Heatmap overlays on track map (color-code by speed, brake, etc.) — Complexity: Medium
  - MoTeC and Atlas have this, AiM and Pi Toolbox do not
- AI coaching insights sidebar (auto-highlight improvement areas) — Complexity: Medium
  - Extend existing coaching tips to dashboard — no competitor has AI analysis
- Math channels (user-defined calculated channels) — Complexity: Very High
  - MoTeC gold standard (100+ built-in functions)
  - Defer to post-MVP

**Performance & UX**
- Keyboard shortcuts (space=play/pause, arrows=prev/next lap) — Complexity: Low
  - Power users love this, most web tools ignore it
- Preset dashboard templates ("Beginner", "Advanced", "Video Analysis") — Complexity: Medium
- Annotation tools (mark points on charts with notes: "late apex here") — Complexity: Medium

### 2.3 Anti-Features (Deliberately NOT Building)

- Real-time live telemetry display — post-session only
- Video editing tools — external editors, playback sync only
- 3D car model visualization — overkill for analysis
- Historical weather data integration — manually entered
- Social features (leaderboards, public sessions) — focus on analysis, not gamification

## 3. Competitive Comparison

| Feature | MoTeC i2 | AiM RS3 | Pi Toolbox | Atlas | **Televiewer** |
|---------|----------|---------|------------|-------|----------------|
| Auto time-alignment | FFT-based | Basic | Manual | GPS-based | Speed correlation |
| Partial overlap | Yes | Yes | No | Yes | Yes |
| Confidence score | Internal | No | N/A | No | **UI-visible** |
| Visual diff before merge | No | No | N/A | No | **Differentiator** |
| Lap overlay | 8 laps | 4 laps | 2 laps | Unlimited | 4 laps |
| Math channels | Gold standard | Limited | Yes | Yes | Post-MVP |
| Track map heatmap | Yes | No | No | Yes | **Differentiator** |
| Save layouts | Yes | Yes | Yes | Yes | Yes |
| AI coaching | No | No | No | No | **Differentiator** |
| Web-based | No (Win) | No (Win/Mac) | No (Win) | No (Win) | **Yes** |
| Price | $1,500-2,500 | Bundled | Bundled | $200/yr | Free |

**Key takeaway:** All competitors are Windows desktop apps with high prices. Web-based + AI coaching + visual merge preview = clear differentiation.

## 4. Feature Dependencies

```
Multi-file import UI
  └→ Auto time-alignment (speed cross-correlation)
      └→ Merge preview with confidence score
          └→ Manual offset adjustment
              └→ Execute merge → Unified timeline
                  └→ Lap overlay comparison
                      └→ Channel selector
                          └→ Save/load layouts
```

```
Design system definition
  └→ Component library
      └→ Session detail page redesign
          └→ Data-dense dashboard layout
              └→ Heatmap track overlay
              └→ AI coaching sidebar
              └→ Keyboard shortcuts
```

## 5. Priority Summary

**Milestone 1 — Data Merge (ship first):**
1. Auto time-alignment via speed correlation (table stakes, high complexity)
2. Partial session overlap handling (table stakes, medium)
3. Merge into unified timeline (table stakes, medium)
4. Visual preview with confidence score (table stakes, medium)
5. Manual offset fallback (table stakes, medium)
6. Visual diff view (differentiator, medium)

**Milestone 2 — UI Redesign:**
1. Design system (foundation)
2. Lap overlay comparison (table stakes, critical gap)
3. Channel selector (table stakes, medium)
4. Save/load layouts (table stakes, medium)
5. Compact readouts sidebar (table stakes, low)
6. Heatmap track overlay (differentiator, medium)
7. AI coaching sidebar (differentiator, medium)
8. Keyboard shortcuts (differentiator, low effort high value)

---
*Features research: 2026-01-31*

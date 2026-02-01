# Project Research Summary

**Project:** Televiewer — Multi-Source Telemetry Merge & Data-Dense Dashboard
**Domain:** Motorsport telemetry analysis application
**Researched:** 2026-01-31
**Confidence:** HIGH

## Executive Summary

Televiewer is adding two major capabilities to an existing SvelteKit motorsport telemetry POC: multi-source data merging (VBO + Bosch) and a complete UI redesign for data-dense dashboard visualization. Research reveals this domain is dominated by expensive Windows desktop apps (MoTeC i2 Pro at $1,500-2,500, AiM Race Studio 3, Pi Toolbox) serving professional race engineers who demand extreme precision and information density.

The recommended approach is a two-milestone strategy: (1) Build the telemetry merge pipeline using custom cross-correlation for time alignment, pre-merge storage for performance, and manual offset overrides for reliability; (2) Redesign the UI incrementally using the strangler fig pattern, starting with session detail page, adding LayerChart for performance, and Bits UI for headless primitives. The key technical insight is that speed channel cross-correlation is sufficient for alignment without heavyweight DSP libraries, and that pre-merged storage (merge once at import, not merge-on-read) enables responsive dashboard rendering.

The primary risks are: (1) naive cross-correlation without signal preprocessing will fail on real data; (2) big-bang UI redesign will break existing workflows; (3) mixing refactoring with feature work makes debugging impossible; (4) underestimating merge complexity edge cases (partial overlap, clock drift, lap boundary mismatches). Mitigate through: preprocessing pipeline (downsample, normalize, filter), incremental UI rollout with feature flags, strict phase separation (refactor → test → feature), and early testing with diverse real-world file pairs.

## Key Findings

### Recommended Stack

**Signal Processing:** Custom implementation for cross-correlation is sufficient — the problem is well-scoped (1D correlation on speed channel, runs once per import, ~50-100 lines TypeScript). This avoids heavy dependencies like TensorFlow.js (3MB) or Python bridges (infra complexity). Fallback to ml-matrix only if FFT-based correlation proves necessary for very long signals.

**Core technologies:**
- **LayerChart v0.40+**: Native Svelte 5 charting library with canvas rendering for high-frequency telemetry data — replaces Chart.js incrementally for new views
- **Bits UI v0.21+**: Headless UI primitives (tabs, dropdowns, popovers) for data-dense dashboard — pairs with TailwindCSS 4 for custom design system
- **Custom cross-correlation**: TypeScript implementation for speed channel time alignment — zero dependencies, full control over edge cases
- **Keep existing**: Chart.js (coexist during migration), Leaflet (track maps), TailwindCSS 4 (foundation)

**Bundle impact:** +50KB minimum (LayerChart + Bits UI), +170KB maximum if ml-matrix needed.

### Expected Features

**Must have (table stakes):**
- Auto-detect time offset between data sources (speed cross-correlation) — MoTeC uses FFT-based, Atlas uses GPS-based
- Handle partial session overlap (VBO covers laps 3-8 of 15-lap Bosch session) — all competitors support this
- Merge into unified timeline with channel deduplication — standard pattern
- Visual preview with confidence score before finalize — transparency builds trust
- Manual offset adjustment as fallback — auto-alignment WILL fail sometimes
- Lap overlay comparison (2-5 laps on same chart) — critical gap in current app, MoTeC supports 8 laps
- Channel selector to toggle visibility of 20+ channels — currently hardcoded
- Save/load custom layouts per track — MoTeC has workspace files, AiM has analysis files

**Should have (competitive advantage):**
- Visual diff view during import (before/after with color-coded sources) — no competitor has this, differentiator
- AI-suggested merge strategy (detect which source should be primary) — unique opportunity
- Heatmap overlays on track map (color-code by speed, brake) — MoTeC and Atlas have this
- AI coaching insights sidebar (extend existing tips to dashboard) — unique differentiator
- Keyboard shortcuts (space=play/pause, arrows=prev/next lap) — power users expect this

**Defer (v2+):**
- More than 2 sources per session — VBO + Bosch is 80% use case
- Math channels (user-defined calculated channels) — very high complexity, MoTeC gold standard
- Real-time live telemetry — post-session files only
- Batch merge (auto-match 10+ file pairs by timestamp) — high value but complex

### Architecture Approach

The architecture uses a pre-merge storage pattern: merge once at import and write unified channel arrays to lap_telemetry, not merge-on-read. This enables fast dashboard rendering (60 FPS zoom/pan target) and simplifies the visualization layer. Cross-correlation runs in a WebWorker to maintain client-side processing, avoiding large file uploads to server. The correlation algorithm uses speed channel (present in both VBO and Bosch, high signal-to-noise ratio) with preprocessing: resample to 10Hz, normalize (zero mean, unit variance), apply Hanning window to reduce edge effects.

**Major components:**
1. **Cross-Correlation Engine** (`src/lib/analysis/correlation.ts`) — Sliding window Pearson correlation on speed channel, returns offset ± confidence score (0-1), flags low-confidence results (<0.7) for manual review
2. **Merge Pipeline Worker** (`src/routes/sessions/import/merge.worker.ts`) — Resampling (linear interpolation for continuous, nearest-neighbor for discrete), conflict resolution strategies (replace/prefer-primary/prefer-secondary), streaming (one lap at a time for memory management)
3. **Database Integration** — No schema changes needed, existing telemetry_sources table already supports multi-source with timeOffset column, session states: pending → correlating → review → confirmed
4. **Data-Dense Dashboard** — Virtualized rendering (only 5-7 visible lanes via IntersectionObserver), shared state for synchronized cursor/zoom/pan, LTTB decimation (max 2000 points per chart, re-decimate on zoom), ~150MB memory budget for 8 lanes

### Critical Pitfalls

1. **Naive cross-correlation without preprocessing** — Running correlation on raw signals with different sample rates, noise, DC offset causes consistently low confidence (<0.5) and wildly varying offsets. Prevention: resample to 10Hz, apply bandpass filter, normalize signals, use Hanning window. (Milestone 1, Phase 1)

2. **Big-bang UI redesign** — Complete overhaul in one release breaks existing workflows and leaves no escape hatch. Prevention: strangler fig pattern (new pages coexist with old), feature flags to toggle views, redesign one page at a time starting with session detail. (Milestone 2, throughout)

3. **Mixing refactoring and feature work** — Adding data merge AND refactoring UI simultaneously makes debugging impossible when something breaks. Prevention: strict phase separation (refactor → test → feature), atomic commits (one concern per commit), never refactor and add features in same phase. (Both milestones)

4. **No regression tests** — The POC has zero tests; refactoring without safety net risks silent breakage. Prevention: add critical path tests BEFORE refactoring (import → parse → store → display), snapshot test with known .vbo/.txt files, test data from real fixtures. (Both milestones, first phase)

5. **VBO subset assumption** — Assuming clean 1:1 lap mapping when VBO covers arbitrary portion of Bosch session (might start mid-lap, end mid-lap, skip laps). Prevention: correlate on continuous time (not lap-by-lap), map VBO time range to Bosch laps after finding global offset, mark laps as "partial coverage", show which laps have full vs partial data in UI. (Milestone 1, Phase 3)

## Implications for Roadmap

Based on research, suggested phase structure separates merge capability (Milestone 1) from UI redesign (Milestone 2) to avoid mixing refactor with features:

### Milestone 1: Multi-Source Telemetry Merge

#### Phase 1: Correlation Foundation
**Rationale:** Core algorithm must work reliably before building pipeline on top of it. Custom implementation is feasible and avoids dependencies.
**Delivers:** Tested cross-correlation algorithm with preprocessing (downsample, normalize, filter)
**Addresses:** Auto time-alignment (table stakes feature)
**Avoids:** Naive cross-correlation pitfall (1.1)
**Research flag:** SKIP — algorithm is well-understood, implementation straightforward

#### Phase 2: Database & API
**Rationale:** Backend support for multi-source before building UI. No schema changes needed (additive only).
**Delivers:** API endpoints for attaching secondary source and executing merge, database indices
**Uses:** Existing telemetry_sources table with timeOffset column
**Addresses:** Session state management (pending → correlating → review → confirmed)
**Avoids:** Schema changes without migration plan pitfall (3.4)
**Research flag:** SKIP — standard CRUD patterns, Drizzle ORM already in use

#### Phase 3: Merge Pipeline
**Rationale:** Implements resampling, conflict resolution, and partial overlap handling. Edge cases dominate this phase.
**Delivers:** Web worker for merge processing, multi-file upload UI, correlation review step, manual offset adjustment
**Addresses:** Partial session overlap (table stakes), visual preview with confidence (table stakes), manual fallback (table stakes)
**Avoids:** VBO subset assumption pitfall (1.3), lap boundary detection differences pitfall (5.3)
**Research flag:** NEEDS RESEARCH — Edge case handling for sample rate mismatch, clock drift detection strategy

#### Phase 4: Merge Validation
**Rationale:** Visual diff view and AI-suggested strategy are differentiators that build trust and reduce user effort.
**Delivers:** Before/after merge visualization with color-coded sources, merge strategy suggestions
**Addresses:** Visual diff view (differentiator), AI-suggested merge strategy (differentiator)
**Avoids:** Underestimating complexity pitfall (4.1) — dedicated phase for polish prevents rushed launch
**Research flag:** SKIP — UI patterns, no deep technical research needed

#### Phase 5: Edge Cases & Polish
**Rationale:** Handle error states, loading indicators, channel deduplication conflicts.
**Delivers:** Low-confidence handling, no-overlap detection, progress indicators, derived channel smoothing
**Addresses:** Data quality validation (table stakes)
**Avoids:** Noise amplification in derived channels pitfall (1.4), clock skew/drift pitfall (1.2)
**Research flag:** MAY NEED RESEARCH — Clock drift detection algorithm if testing reveals it's real

### Milestone 2: Data-Dense Dashboard Redesign

#### Phase 1: Component Extraction & Tests
**Rationale:** Extract major sections from 2535-line session detail page BEFORE redesign, add regression tests as safety net.
**Delivers:** VideoPlayer, TelemetryPanel, LapSelector, RemapModal components; snapshot tests for import flow
**Addresses:** Baseline for incremental redesign
**Avoids:** Premature component abstraction pitfall (2.3), no regression tests pitfall (3.1), state management hell pitfall (3.3)
**Research flag:** SKIP — Refactoring existing code with Svelte 5 context for shared state

#### Phase 2: Design System Foundation
**Rationale:** Define color system, typography, semantic tokens before building components.
**Delivers:** TailwindCSS 4 custom theme, CSS variables, data color conventions (speed=blue, throttle=green, brake=red)
**Uses:** TailwindCSS 4 (already in stack)
**Addresses:** Foundation for data-dense UI
**Avoids:** Information overload pitfall (2.2) — smart defaults and progressive disclosure
**Research flag:** SKIP — Design system patterns well-documented

#### Phase 3: Session Detail Redesign
**Rationale:** Start with highest-value page (session detail), use strangler fig pattern.
**Delivers:** Redesigned session detail with feature flag toggle, new components built on Bits UI primitives
**Uses:** Bits UI v0.21+ (headless primitives), existing extracted components
**Addresses:** Data-dense layout (table stakes), compact readouts sidebar (table stakes)
**Avoids:** Big-bang redesign pitfall (2.1) — feature flag allows rollback
**Research flag:** SKIP — Standard UI patterns

#### Phase 4: Lap Overlay & Visualization
**Rationale:** Lap comparison is critical gap and most-requested feature.
**Delivers:** LayerChart integration, 2-5 lap overlay support, virtualized lane rendering, synchronized cursor/zoom
**Uses:** LayerChart v0.40+ (native Svelte 5 charting)
**Addresses:** Lap overlay comparison (critical gap), channel selector (table stakes), virtualized rendering (performance target)
**Avoids:** Chart.js performance with data density pitfall (2.4)
**Research flag:** MAY NEED RESEARCH — LayerChart API for complex multi-series overlays, LTTB decimation tuning

#### Phase 5: Advanced Visualization
**Rationale:** Differentiator features after core dashboard is stable.
**Delivers:** Heatmap overlays on track map, AI coaching sidebar integration, keyboard shortcuts
**Addresses:** Heatmap track overlay (differentiator), AI coaching sidebar (differentiator), keyboard shortcuts (differentiator)
**Avoids:** Information overload pitfall (2.2) — collapsed sections, user-configurable visibility
**Research flag:** MAY NEED RESEARCH — Leaflet heatmap layer API, color interpolation strategies

#### Phase 6: Layout Persistence
**Rationale:** Save/load layouts is table stakes for professional tools.
**Delivers:** Custom layout saving per track, preset templates ("Beginner", "Advanced", "Video Analysis")
**Addresses:** Save/load layouts (table stakes), preset dashboard templates (differentiator)
**Avoids:** N/A — straightforward feature
**Research flag:** SKIP — LocalStorage or database JSON serialization

### Phase Ordering Rationale

- **Milestone separation:** Merge capability (M1) ships independently from UI redesign (M2) to avoid mixing refactor with features (pitfall 3.2)
- **Correlation first:** Cross-correlation algorithm must be proven reliable before building pipeline on top (M1 Phase 1 before Phase 3)
- **Tests before refactor:** Component extraction includes tests as safety net before redesign (M2 Phase 1 before Phase 3)
- **Design system before components:** Foundation before building UI (M2 Phase 2 before Phase 3)
- **Strangler fig pattern:** Session detail redesigned first with feature flag, other pages follow incrementally (M2 Phase 3 gates Phases 4-6)
- **Edge cases get dedicated phase:** Don't rush merge to launch without handling pathological cases (M1 Phase 5)

### Research Flags

Phases likely needing deeper research during planning:
- **M1 Phase 3 (Merge Pipeline):** Edge case handling strategies for sample rate mismatch, clock drift detection algorithm design
- **M1 Phase 5 (Edge Cases):** Clock drift correction algorithm (if testing proves drift is real), not just theoretical
- **M2 Phase 4 (Lap Overlay):** LayerChart API for complex multi-series overlays, LTTB decimation performance tuning
- **M2 Phase 5 (Advanced Viz):** Leaflet heatmap layer integration, color interpolation for speed/brake gradients

Phases with standard patterns (skip research-phase):
- **M1 Phase 1:** Cross-correlation algorithm well-understood (papers, Stack Overflow examples)
- **M1 Phase 2:** Standard CRUD API patterns, Drizzle ORM already in use
- **M1 Phase 4:** UI patterns for diff views and merge previews
- **M2 Phase 1:** Svelte 5 component refactoring, context API patterns
- **M2 Phase 2:** Design system patterns, TailwindCSS configuration
- **M2 Phase 3:** Standard UI component library integration (Bits UI)
- **M2 Phase 6:** LocalStorage JSON serialization

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Custom cross-correlation vetted against alternatives, LayerChart/Bits UI match Svelte 5 requirements, no experimental dependencies |
| Features | HIGH | Competitive analysis of 5 products (MoTeC, AiM, Pi, Atlas, RaceRender), clear table stakes vs differentiators, feature dependencies mapped |
| Architecture | HIGH | Pre-merge storage pattern proven in competitors, WebWorker client-side processing matches existing POC pattern, no schema changes needed |
| Pitfalls | HIGH | Domain-specific pitfalls from motorsport telemetry experience (GPS mismatch, brake unit confusion, lap boundary detection), plus standard refactoring risks |

**Overall confidence:** HIGH

### Gaps to Address

- **Clock drift reality check:** Research flags drift as potential issue (0.1% = 3.6s over 1 hour), but need to test with real logger pairs to confirm it's not just theoretical. If drift proves real, Phase 5 needs piecewise linear correction algorithm; if not, skip the complexity.
- **LayerChart multi-series performance:** Documentation shows basic examples; need to validate performance with 5 laps × 8 channels × 10,000 points (400k total points) during Phase 4 planning. Fallback: stick with Chart.js for lap overlay if LayerChart can't handle density.
- **Heatmap color interpolation:** Research didn't find definitive best practice for speed-to-color mapping (linear, log scale, percentile-based). Test during Phase 5 with real track data to find what makes visual patterns most obvious.
- **VBO partial overlap patterns:** Need 5+ real file pairs early in M1 Phase 1 to understand actual overlap patterns (start mid-lap, end mid-lap, skip laps). Research assumes arbitrary overlap; reality check before Phase 3.

## Sources

### Primary (HIGH confidence)
- **STACK.md:** Cross-correlation algorithm sources, library comparison (ml-matrix, TensorFlow.js, dsp.js), LayerChart/Bits UI documentation
- **FEATURES.md:** Competitive analysis of MoTeC i2 Pro, AiM Race Studio 3, Pi Toolbox, Atlas, RaceRender — table stakes vs differentiators with complexity estimates
- **ARCHITECTURE.md:** Implementation specs for cross-correlation engine, merge pipeline worker, database integration, dashboard virtualization — includes performance targets and memory budgets
- **PITFALLS.md:** Domain-specific gotchas (GPS antenna mismatch, brake pressure vs position, lap boundary detection differences), refactoring risks (big-bang redesign, mixing refactor + features, state management), project management pitfalls (underestimating complexity, no user feedback)

### Secondary (MEDIUM confidence)
- Cross-correlation algorithm time complexity (O(n*m)) and accuracy (±0.1s offset detection) — based on algorithm analysis, not empirical testing
- LayerChart performance claims (60 FPS zoom/pan) — from documentation, not validated with actual telemetry data density
- Merge complexity estimates (Phase 3 "edge cases dominate") — inferred from pitfalls research, not from actual implementation

### Tertiary (LOW confidence)
- Clock drift percentage (0.1% = 3.6s/hour) — theoretical calculation, needs validation with real loggers
- VBO + Bosch as 80% use case — assumption based on project context, not from user research
- Math channels as "very high complexity" — based on MoTeC feature richness, but defer to v2+ regardless

---
*Research completed: 2026-01-31*
*Ready for roadmap: yes*

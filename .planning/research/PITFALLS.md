# Pitfalls Research: Telemetry Merge & UI Redesign

**Research Date:** 2026-01-31
**Context:** Common mistakes when adding multi-source telemetry merging and doing a full UI redesign on a working POC

## Category 1: Cross-Correlation & Signal Alignment

### 1.1 Naive Cross-Correlation
**Pitfall:** Running cross-correlation on raw signals without preprocessing (different sample rates, noise, DC offset).

**Warning signs:**
- Correlation confidence consistently low (<0.5)
- Offset varies wildly between sessions with same loggers
- Works on synthetic data but fails on real data

**Prevention:**
1. Resample both signals to common rate (10Hz) before correlation
2. Apply bandpass filter to remove DC offset and high-frequency noise
3. Normalize signals (zero mean, unit variance)
4. Use Hanning window to reduce edge effects

**Phase:** Milestone 1, Phase 1 (Correlation Foundation)

### 1.2 Clock Skew / Drift
**Pitfall:** Assuming constant sample rates when loggers drift over time. A 0.1% drift = 3.6 seconds over 1 hour.

**Warning signs:**
- Correlation looks good at start of session, diverges later
- Merged channels seem "smeared" or time-shifted in later laps
- Speed signals align perfectly for first 5 minutes, then drift

**Prevention:**
1. Correlate per-lap, not per-session (detect drift)
2. If drift detected, apply piecewise linear correction
3. Log drift magnitude for user awareness
4. Start with per-session correlation; add per-lap if drift proves real

**Phase:** Milestone 1, Phase 3 (Merge Pipeline — edge case handling)

### 1.3 VBO Subset Assumption
**Pitfall:** Assuming clean 1:1 lap mapping when VBO covers arbitrary portion of Bosch session. VBO might start mid-lap, end mid-lap, or skip laps.

**Warning signs:**
- Merge produces laps with partial data
- Lap counts don't match between sources
- GPS data appears to "jump" at lap boundaries

**Prevention:**
1. Correlate on continuous time, not lap-by-lap
2. After finding global offset, map VBO time range to Bosch laps
3. Mark laps as "partial coverage" when VBO data doesn't span full lap
4. UI shows which laps have full vs partial secondary data

**Phase:** Milestone 1, Phase 3 (Merge Pipeline)

### 1.4 Noise Amplification in Derived Channels
**Pitfall:** Derived channels (lateral G, slip angle) compound errors from multiple sources. Small offset errors become large errors in derivatives.

**Warning signs:**
- Derived values spike at source transitions
- G-force calculations don't match expected physics
- Analysis tips fire incorrectly on merged data

**Prevention:**
1. Compute derived channels AFTER merge, not before
2. Apply smoothing to merged signals before derivation
3. Flag derived channels from merged data as lower confidence
4. Defer derived channels to polish phase

**Phase:** Milestone 1, Phase 5 (Polish)

## Category 2: Data-Dense UI Redesign

### 2.1 Big Bang Redesign
**Pitfall:** Complete UI overhaul in one release, breaking existing user workflows. Users can't find features they relied on.

**Warning signs:**
- "We'll redesign everything at once"
- No way to access old UI during transition
- Users report confusion or lost functionality

**Prevention:**
1. Strangler fig pattern: new pages coexist with old
2. Redesign one page at a time, starting with session detail
3. Feature flags to toggle between old and new views
4. User can revert to old view if new one is broken

**Phase:** Milestone 2, all phases (incremental rollout)

### 2.2 Information Overload
**Pitfall:** Data-dense ≠ everything visible at once. Bloomberg Terminal works because of progressive disclosure, not because everything is on screen.

**Warning signs:**
- Users don't know where to look
- Important data buried among noise
- Dashboard takes >3 seconds to visually parse

**Prevention:**
1. Default view shows 4-6 key channels, not 20
2. User-configurable channel visibility (show/hide)
3. Smart defaults: speed, throttle, brake, steering always visible
4. Collapsed sections for secondary channels (temps, pressures)

**Phase:** Milestone 2, Phase 4 (Dashboard Visualization)

### 2.3 Premature Component Abstraction
**Pitfall:** Over-engineering the 2535-line session detail page split. Extracting 15 tiny components that pass props through 4 levels.

**Warning signs:**
- Props drilling through 3+ levels
- Components that are only used once
- Context/store spaghetti replacing simple local state

**Prevention:**
1. Extract only when: component is reused, OR component has clear independent state
2. Target 3-5 major extractions, not 15 micro-components
3. Use Svelte 5 context for shared state (hover time, selected lap)
4. Keep related UI together — a 500-line component is fine if cohesive

**Suggested extractions from session detail page:**
- VideoPlayer section → `SessionVideoPlayer.svelte`
- Telemetry charts → `SessionTelemetryPanel.svelte`
- Track map → already extracted (`TrackMap.svelte`)
- Lap list/selector → `LapSelector.svelte`
- Remap/edit modal → `SessionRemapModal.svelte`

**Phase:** Milestone 2, Phase 1 (Component extraction before redesign)

### 2.4 Chart.js Performance with Data Density
**Pitfall:** Rendering 10,000+ points per chart causes visible lag on zoom/pan. Current decimation to 2000 points is good but doesn't adapt to zoom level.

**Warning signs:**
- Zoom/pan stutters or drops below 30 FPS
- Browser memory exceeds 500MB with multiple charts open
- Chart updates take >100ms (visible flicker)

**Prevention:**
1. Re-decimate on zoom (show more detail when zoomed in)
2. Use LTTB algorithm (preserves visual shape better than naive decimation)
3. Virtualize chart instances — only render visible charts
4. Destroy offscreen chart instances after 5s scroll-away
5. Consider LayerChart for new views (better Svelte integration)

**Phase:** Milestone 2, Phase 4 (Dashboard Visualization)

## Category 3: Incremental Refactoring

### 3.1 No Regression Tests
**Pitfall:** Refactoring the POC without a safety net. The app has zero tests. Any change risks silent breakage.

**Warning signs:**
- "It worked before the refactor" reported after deploy
- Import flow silently produces wrong data
- Coaching tips fire on wrong lap segments

**Prevention:**
1. Add critical path tests BEFORE refactoring (import → parse → store → display)
2. Snapshot test: import known .vbo file, assert expected lap count and telemetry values
3. Don't need 80% coverage — just cover the 5 critical flows
4. Test data: save a real .vbo and .txt file as test fixtures

**Phase:** Both milestones, first phase of each

### 3.2 Mixing Refactor and Features
**Pitfall:** Adding data merge AND refactoring UI simultaneously. When something breaks, impossible to tell if it's the new feature or the refactor.

**Warning signs:**
- PRs that are 2000+ lines touching both feature and refactor code
- "It might be the merge code or it might be the component split"
- Git blame becomes useless

**Prevention:**
1. Strict phase separation: refactor → test → feature
2. Atomic commits: one concern per commit
3. Two independent milestones (already planned)
4. Never refactor and add features in the same phase

**Phase:** Project-wide discipline

### 3.3 State Management Hell
**Pitfall:** Extracting components from the 2535-line monolith creates prop drilling or context spaghetti. State that was simple local variables becomes complex shared state.

**Warning signs:**
- 10+ props passed to child components
- Multiple stores/contexts for closely related state
- Components re-render unnecessarily due to broad context changes

**Prevention:**
1. Identify shared state vs local state BEFORE extracting
2. Shared state candidates: selectedLap, hoverTime, zoomRange, playbackPosition
3. Use Svelte 5 `$state` + context for shared state (not stores)
4. Keep local state local — don't lift just because "it might be needed"

**Phase:** Milestone 2, Phase 1 (Component extraction)

### 3.4 Schema Changes Without Migration Plan
**Pitfall:** Changing database schema to support merge, breaking existing sessions.

**Warning signs:**
- Existing sessions fail to load after schema change
- NOT NULL columns added without default values
- Foreign key constraints violated by old data

**Prevention:**
1. All schema changes must be additive (new columns, new tables)
2. New columns must have defaults or be nullable
3. Test schema changes against existing production data
4. Use Drizzle migrations (not just `drizzle-kit push`)

**Phase:** Milestone 1, Phase 2 (Database & API)

## Category 4: Project Management

### 4.1 Underestimating Merge Complexity
**Pitfall:** "Cross-correlation is just math" — but edge cases dominate: partial overlap, sample rate mismatch, drift, noise, ambiguous matches.

**Warning signs:**
- "Just" or "simply" in estimates
- Demo works on one file pair but fails on others
- Edge cases discovered in final week

**Prevention:**
1. Collect 5+ real file pairs from different sessions/tracks early
2. Test correlation on ALL pairs before declaring Phase 1 complete
3. Budget 50% of merge time for edge cases
4. Accept that manual offset adjustment is a required escape hatch

**Phase:** Milestone 1, throughout

### 4.2 No User Feedback During Redesign
**Pitfall:** Building entire redesign without mid-process validation. Ship it, discover users hate the new layout.

**Warning signs:**
- "We'll get feedback after launch"
- Redesign based on assumptions about what users want
- No prototype or mockup review

**Prevention:**
1. Screenshot/prototype review after design system phase
2. Deploy each redesigned page incrementally
3. Keep old views accessible during transition
4. Gather feedback after each page redesign, not all at once

**Phase:** Milestone 2, throughout

### 4.3 No Rollback Plan
**Pitfall:** Deploying breaking changes with no escape hatch.

**Warning signs:**
- Destructive database migrations
- Old UI code deleted before new UI is verified
- No feature flags

**Prevention:**
1. Per-phase git branches (already configured)
2. Feature flags for new UI pages
3. Database changes are additive only
4. Keep old components until new ones are verified

**Phase:** Both milestones, throughout

## Category 5: Domain-Specific Gotchas

### 5.1 GPS Coordinate Mismatch
**Pitfall:** VBO GPS antenna and Bosch GPS antenna are in different positions on the car. Track map shows two parallel paths instead of one.

**Warning signs:**
- Merged track map shows "double vision"
- GPS-based lap detection triggers differently per source
- Position on track differs by 2-5 meters between sources

**Prevention:**
1. Use ONE GPS source for track position (VBO, which has dedicated GPS)
2. Don't merge GPS channels — prefer primary source
3. Document which source provides GPS in merge metadata
4. Only merge ECU/vehicle channels from secondary source

**Phase:** Milestone 1, Phase 3 (Merge Pipeline — channel selection)

### 5.2 Brake Pressure vs Brake Position
**Pitfall:** VBO might log brake pressure (bar), Bosch might log brake position (%). Treating them as the same channel corrupts analysis.

**Warning signs:**
- Brake values don't match between sources
- Coaching tips fire incorrectly on merged brake data
- Values exceed expected ranges

**Prevention:**
1. Channel identification by unit, not just name
2. Don't auto-merge channels with different units
3. Store both as separate channels (brake_pressure, brake_position)
4. Let user choose which to display/analyze

**Phase:** Milestone 1, Phase 3 (Merge Pipeline — conflict resolution)

### 5.3 Lap Boundary Detection Differences
**Pitfall:** VBO and Bosch may detect lap boundaries differently (different GPS positions, different trigger methods). "Lap 3" in VBO might not be "Lap 3" in Bosch.

**Warning signs:**
- Lap times don't match between sources
- Telemetry data appears shifted within a lap
- Extra or missing laps in one source

**Prevention:**
1. Don't rely on lap numbers — correlate on continuous time
2. After merge, re-detect laps using primary source's method
3. Store original lap boundaries from each source for debugging
4. Use global time offset, then recompute lap splits

**Phase:** Milestone 1, Phase 1 (Correlation — lap-independent approach)

## Top 5 Highest-Risk Pitfalls

1. **No regression tests (3.1)** — Silent breakage during refactor
2. **Mixing refactor + features (3.2)** — Unmergeable chaos
3. **Naive cross-correlation (1.1)** — Unreliable core feature
4. **Big-bang redesign (2.1)** — User workflow breakage
5. **Underestimating complexity (4.1)** — Blown timelines

## Critical Success Factors

- **Phase separation:** Refactor → Test → Feature (never mixed)
- **Preprocessing pipeline:** Filter/resample BEFORE correlation
- **Strangler fig UI:** New pages coexist with old during transition
- **Real data early:** Find pathological cases in week 1, not week 7
- **Manual overrides:** Automated merge WILL fail sometimes — escape hatch required

---
*Pitfalls research: 2026-01-31*

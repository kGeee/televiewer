# Requirements: Televiewer

**Defined:** 2026-01-31
**Core Value:** Drivers can see exactly what happened at every point on track — unified telemetry from multiple data sources on one timeline, with video sync and coaching analysis.

## v1 Requirements

Requirements for current milestones. Each maps to roadmap phases.

### Data Merge — Import & Alignment

- [ ] **MERGE-01**: User can upload a secondary telemetry file (VBO or Bosch/Wintax) for an existing session
- [ ] **MERGE-02**: System auto-detects time offset between primary and secondary files via speed channel cross-correlation
- [ ] **MERGE-03**: System handles VBO covering a subset of laps from a longer Bosch session (partial overlap)
- [ ] **MERGE-04**: System displays correlation confidence score (0-1) with visual indicator (green/yellow/red)
- [ ] **MERGE-05**: User can manually adjust time offset if auto-alignment confidence is low
- [ ] **MERGE-06**: User sees visual preview of alignment before finalizing merge (overlaid speed channels)

### Data Merge — Pipeline & Storage

- [ ] **MERGE-07**: System resamples both sources to common time axis (linear interpolation for continuous, nearest-neighbor for discrete)
- [ ] **MERGE-08**: System merges channels from both sources into unified timeline stored in existing lap_telemetry schema
- [ ] **MERGE-09**: System deduplicates channels when both sources have same data (prefer higher-fidelity source)
- [ ] **MERGE-10**: Merged sessions display seamlessly in existing telemetry views (charts, map, video sync)
- [ ] **MERGE-11**: Single-source sessions continue to work unchanged (backward compatibility)
- [ ] **MERGE-12**: System tracks source attribution per channel (which file contributed each channel)

### Design System

- [ ] **DSGN-01**: Define color system with CSS variables (dark-first, high-contrast data colors following motorsport conventions)
- [ ] **DSGN-02**: Define typography scale (monospace for data values, sans-serif for labels, tabular numbers)
- [ ] **DSGN-03**: Define spacing and layout tokens as TailwindCSS 4 custom theme
- [ ] **DSGN-04**: Create consistent component library (buttons, cards, inputs, tables, panels)
- [ ] **DSGN-05**: Apply design system to all existing pages (sessions list, import, session detail, drivers)

### Dashboard — Visualization

- [ ] **DASH-01**: User can overlay 2-4 laps on same chart with distinct colors and transparency
- [ ] **DASH-02**: User can toggle visibility of individual telemetry channels without page reload
- [ ] **DASH-03**: User sees compact numeric readouts for all channels at current cursor position
- [ ] **DASH-04**: Session detail page displays data-dense layout (Grafana/Bloomberg-inspired density)
- [ ] **DASH-05**: Charts, track map, and video remain synchronized with shared cursor/zoom

### Dashboard — Workspace

- [ ] **DASH-06**: User can save custom chart layouts (which channels visible, sizes, order)
- [ ] **DASH-07**: Saved layouts auto-load based on track or session type
- [ ] **DASH-08**: User can access keyboard shortcuts (space=play/pause, arrows=prev/next lap, +/- zoom)

### Dashboard — Coaching

- [ ] **DASH-09**: AI coaching insights displayed in persistent sidebar (not just tooltip)
- [ ] **DASH-10**: Coaching tips highlight corresponding regions on telemetry charts
- [ ] **DASH-11**: User can dismiss or acknowledge individual coaching tips

### Infrastructure

- [ ] **INFRA-01**: Extract session detail page into manageable components (from 2535-line monolith)
- [ ] **INFRA-02**: Add regression tests for critical paths (import → parse → store → display)
- [ ] **INFRA-03**: Responsive layout works on laptop, desktop, and ultrawide screens

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Advanced Visualization
- **VIZ-01**: Math channels — user-defined calculated channels (e.g., speed delta, lateral G)
- **VIZ-02**: Heatmap track overlay — color-code track position by channel value
- **VIZ-03**: 3D track visualization with elevation data
- **VIZ-04**: Annotation tools — mark specific chart points with notes

### Workflow
- **WORK-01**: Merge templates — save merge strategy for specific hardware combos
- **WORK-02**: Batch merge — upload multiple file pairs, auto-match by timestamp
- **WORK-03**: Preset dashboard templates ("Beginner", "Advanced", "Video Analysis")

### Collaboration
- **COLLAB-01**: Collaborative sessions — coach and driver view same session, real-time cursor sync
- **COLLAB-02**: Share dashboard snapshots — export current view as interactive link
- **COLLAB-03**: Data export to CSV/JSON for external analysis tools

## Out of Scope

| Feature | Reason |
|---------|--------|
| Real-time live telemetry | Post-session analysis only, no pit wall streaming |
| More than 2 sources per session | VBO + Bosch covers 80% use case, defer 3+ sources |
| Video-based time sync | Speed cross-correlation is reliable enough |
| Cloud-based merge processing | Browser/Node compute sufficient |
| Python serverless compute | TypeScript cross-correlation sufficient |
| Mobile native app | Web-first, mobile deferred |
| Social features (leaderboards) | Focus on analysis, not gamification |
| Proprietary encrypted formats | Reverse engineering risk |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| MERGE-01 | TBD | Pending |
| MERGE-02 | TBD | Pending |
| MERGE-03 | TBD | Pending |
| MERGE-04 | TBD | Pending |
| MERGE-05 | TBD | Pending |
| MERGE-06 | TBD | Pending |
| MERGE-07 | TBD | Pending |
| MERGE-08 | TBD | Pending |
| MERGE-09 | TBD | Pending |
| MERGE-10 | TBD | Pending |
| MERGE-11 | TBD | Pending |
| MERGE-12 | TBD | Pending |
| DSGN-01 | TBD | Pending |
| DSGN-02 | TBD | Pending |
| DSGN-03 | TBD | Pending |
| DSGN-04 | TBD | Pending |
| DSGN-05 | TBD | Pending |
| DASH-01 | TBD | Pending |
| DASH-02 | TBD | Pending |
| DASH-03 | TBD | Pending |
| DASH-04 | TBD | Pending |
| DASH-05 | TBD | Pending |
| DASH-06 | TBD | Pending |
| DASH-07 | TBD | Pending |
| DASH-08 | TBD | Pending |
| DASH-09 | TBD | Pending |
| DASH-10 | TBD | Pending |
| DASH-11 | TBD | Pending |
| INFRA-01 | TBD | Pending |
| INFRA-02 | TBD | Pending |
| INFRA-03 | TBD | Pending |

**Coverage:**
- v1 requirements: 31 total
- Mapped to phases: 0
- Unmapped: 31 (pending roadmap)

---
*Requirements defined: 2026-01-31*
*Last updated: 2026-01-31 after initial definition*

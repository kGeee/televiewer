# Televiewer

## What This Is

A motorsport telemetry analysis platform that lets drivers import data from racing loggers (VBOX, Bosch, Wintax), visualize lap telemetry, sync with onboard video, and receive AI-generated coaching feedback. Currently a working POC — functional but inconsistent UI and limited to single-source telemetry per session.

## Core Value

Drivers can see exactly what happened at every point on track — unified telemetry from multiple data sources on one timeline, with video sync and coaching analysis.

## Requirements

### Validated

- ✓ Import VBOX (.vbo) telemetry files — existing
- ✓ Import Bosch/Wintax (.txt) telemetry files — existing
- ✓ Parse telemetry into structured lap data (time, speed, throttle, brake, gear, steering, GPS) — existing
- ✓ Visualize telemetry channels on interactive charts (Chart.js with zoom) — existing
- ✓ Display GPS track overlay on map (Leaflet) — existing
- ✓ Auto-detect track from GPS coordinates — existing
- ✓ Mark outlier laps as invalid during import — existing
- ✓ Generate coaching tips (coasting, braking, throttle hesitation, steering scrub) — existing
- ✓ Sync onboard video with telemetry timeline — existing
- ✓ Upload video to Bunny.net CDN with HLS streaming — existing
- ✓ User authentication with session-based login — existing
- ✓ Share sessions via public links with configurable access — existing
- ✓ Dark/light theme toggle — existing
- ✓ Driver and car management — existing
- ✓ Custom channel mapping during import — existing
- ✓ Offline mode with PGLite fallback — existing

### Active

**Milestone 1 — Multi-Source Data Merge:**
- [ ] Upload VBO and Bosch/Wintax files for the same session
- [ ] Auto-detect time offset between files by correlating shared channels (speed)
- [ ] Handle VBO covering a subset of laps from a longer Bosch session
- [ ] Merge into unified timeline with all channels from both sources
- [ ] Store merged telemetry in existing columnar schema
- [ ] Display unified data seamlessly in existing telemetry views

**Milestone 2 — Full UI Redesign:**
- [ ] Define design system (colors, typography, spacing, component library)
- [ ] Data-dense dashboard aesthetic (Grafana/Bloomberg-inspired)
- [ ] Consistent design language across all pages
- [ ] Redesigned session detail view with better information hierarchy
- [ ] Lap comparison — overlay multiple laps side by side
- [ ] Improved navigation and information architecture
- [ ] Responsive layout for different screen sizes

### Out of Scope

- Python serverless compute — Node/TypeScript sufficient for signal correlation
- Real-time live telemetry streaming — post-session analysis only
- Mobile native app — web-first
- Multi-user collaboration features — single driver focus for now
- Data export (CSV/JSON) — defer to later milestone

## Context

The app is a working POC with ~6400 lines of core code. The session detail page alone is 2535 lines — a monolith that handles charts, video, maps, upload, and remapping all in one component. No test suite exists. The two telemetry sources (VBOX and Bosch/Wintax) are currently parsed independently with no way to merge data from the same session captured by different loggers.

The key technical challenge for data merge is time alignment: two independent loggers with unsynchronized clocks, where the VBO file may only cover a portion of the Bosch session. Cross-correlation of shared channels (speed is present in both) is the approach for auto-detecting the offset.

Existing tech stack: SvelteKit 2, Svelte 5, TailwindCSS 4, Chart.js, Drizzle ORM, PostgreSQL (with PGLite offline fallback), Leaflet maps, Bunny.net video CDN.

## Constraints

- **Tech stack**: SvelteKit 2 / Svelte 5 / TypeScript — no framework changes
- **Database**: PostgreSQL with Drizzle ORM — existing schema must be extended, not replaced
- **Data merge in Node**: Cross-correlation algorithm runs server-side in TypeScript, no external compute needed
- **Backward compatibility**: Existing single-source sessions must continue to work unchanged

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Node/TS for data merge (not Python) | No ML libraries needed; cross-correlation doable in JS; avoids infra complexity | — Pending |
| Auto-detect offset via speed correlation | Speed channel present in both VBO and Bosch; most reliable shared signal | — Pending |
| Two independent milestones | Data merge and UI redesign can proceed in parallel; data merge ships first | — Pending |
| Data-dense dashboard aesthetic | Motorsport users want information density, not minimalism | — Pending |

---
*Last updated: 2026-01-31 after initialization*

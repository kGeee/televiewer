# Codebase Structure

**Analysis Date:** 2026-01-31

## Directory Layout

```
/Users/kevingeorge/Documents/projects/flyinglizards/
├── src/
│   ├── routes/                          # SvelteKit page routes and API endpoints
│   ├── lib/
│   │   ├── analysis/                    # Telemetry analysis, parsing, GPS utilities
│   │   ├── components/                  # Reusable Svelte components (UI)
│   │   ├── server/                      # Backend logic (DB, auth, parsers)
│   │   ├── stores/                      # Svelte stores (global state)
│   │   ├── utils/                       # Shared utilities (GPS math, helpers)
│   │   ├── assets/                      # Static assets
│   │   └── index.ts                     # Lib entry point (re-exports)
│   ├── app.d.ts                         # Global type definitions
│   └── hooks.server.ts                  # SvelteKit middleware
├── .planning/codebase/                  # Planning documents (generated)
├── static/                              # Static files (public assets)
├── .svelte-kit/                         # SvelteKit build cache
├── data.sqlite                          # Local SQLite database (fallback)
├── svelte.config.js                     # SvelteKit configuration
├── vite.config.js                       # Vite configuration (if exists)
├── drizzle.config.ts                    # Drizzle ORM configuration
├── package.json                         # Dependencies and scripts
├── tsconfig.json                        # TypeScript configuration
└── .prettierrc                          # Prettier formatting config
```

## Directory Purposes

**src/routes/**
- Purpose: SvelteKit file-based routing. Each directory = URL path, `+page.svelte` = view, `+page.server.ts` = load/actions
- Contains: Page routes, API endpoints, layout wrappers
- Key files:
  - `+page.server.ts`: Server-side load function and POST/PUT/DELETE actions
  - `+page.svelte`: UI component (inherits data from load)
  - `+layout.svelte`: Shared layout for directory subtree
  - `+server.ts`: API endpoint (JSON response)

**src/routes/sessions/**
- Purpose: Session management UI
- Contains:
  - `+page.server.ts`: List all sessions
  - `+page.svelte`: Session list view
  - `[id]/+page.server.ts`: Load single session with telemetry
  - `[id]/+page.svelte`: Session detail view with charts
  - `import/+page.server.ts`: Handle file upload and parsing
  - `import/+page.svelte`: Import UI with file drag-drop
  - `import/parser.worker.ts`: WebWorker for non-blocking file parsing

**src/routes/api/sessions/**
- Purpose: JSON API endpoints for session operations
- Contains:
  - `[id]/laps/[lapNumber]/analysis/+server.ts`: POST coaching tips
  - `[id]/gps/+server.ts`: Fetch GPS data for map
  - `[id]/path/+server.ts`: Fetch track path data
  - `[id]/status/+server.ts`: Get session processing status
  - `[id]/video/+server.ts`: Handle video upload/streaming
  - `[id]/recalculate/+server.ts`: Re-analyze all laps
  - `[id]/replace/+server.ts`: Replace telemetry data in session
  - `save/+server.ts`: Finalize session creation after import review

**src/lib/analysis/**
- Purpose: Telemetry analysis and data transformation
- Contains:
  - `telemetry.ts`: Coaching tip generation (coasting, braking, throttle, steering detection)
  - `parser.ts`: Client-side redundancy of server parser; also used in WebWorker
  - `geo.ts`: GPS/geolocation analysis (deprecated, functionality moved to server/utils)
  - `sampling.ts`: Data downsampling for chart rendering

**src/lib/components/**
- Purpose: Reusable Svelte UI components
- Contains:
  - `TelemetryChart.svelte`: Interactive telemetry curve visualization (Chart.js wrapper)
  - `TrackMap.svelte`: GPS track overlay on map (Leaflet or similar)
  - `SatelliteTrackMap.svelte`: Satellite background variant of TrackMap
  - `UniversalPlayer.svelte`: Video player with telemetry sync (TUS upload support)
  - `Card.svelte`: Styled container component
  - `ThemeToggle.svelte`: Dark/light mode switcher

**src/lib/server/**
- Purpose: Backend server-side logic
- Contains:
  - `db/schema.ts`: Drizzle ORM schema (tables, columns, relationships)
  - `db/client.ts`: Database initialization with PostgreSQL/PGLite fallback
  - `db/utils.ts`: Database utility functions
  - `parser.ts`: VBOX (.vbo) and Bosch (.txt) file parsing
  - `auth.ts`: Session validation and user authentication
  - `tracks.ts`: Track detection and lap-splitting logic
  - `bunny.ts`: Bunny CDN video integration

**src/lib/server/db/schema.ts**
- Purpose: Define all database tables and relationships
- Contains:
  - `drivers`: Driver profiles (name, color)
  - `sessions`: Racing sessions (metadata, video, status)
  - `laps`: Individual lap records (time, valid flag, analysis)
  - `lap_telemetry`: Columnar telemetry arrays (time, speed, throttle, brake, steering, GPS)
  - `telemetry_channels`: Auxiliary channels not in standard columns
  - `telemetry_sources`: Import metadata (file type, offset, date)
  - `cars`: Vehicle definitions
  - `car_channel_mappings`: Column rename configs per car/format
  - `tracks`: Track definitions with GPS path and sector lines
  - `users`: Login credentials (username, password hash)
  - `auth_sessions`: Session tokens with expiration
  - `share_links`: Public share URLs with visibility config

**src/lib/utils/**
- Purpose: Shared utility functions
- Contains:
  - `gps.ts`: GPS math (bearing calculation, point offset, segment intersection detection)

**src/lib/stores/**
- Purpose: Svelte reactive stores for global state
- Contains:
  - `theme.ts`: Dark/light mode preference persistence

## Key File Locations

**Entry Points:**
- `src/routes/+page.svelte`: Home/dashboard page
- `src/routes/+page.server.ts`: Dashboard load function
- `src/hooks.server.ts`: Middleware for authentication

**Configuration:**
- `svelte.config.js`: SvelteKit adapter and kit options
- `drizzle.config.ts`: Drizzle schema location and database URL
- `tsconfig.json`: TypeScript compiler options
- `.prettierrc`: Code formatting rules

**Core Logic:**
- `src/lib/server/parser.ts`: Telemetry file parsing (Bosch, VBOX)
- `src/lib/server/tracks.ts`: Track detection and lap boundary detection
- `src/lib/analysis/telemetry.ts`: Coaching analysis and tip generation
- `src/lib/server/db/schema.ts`: Database schema and relationships
- `src/lib/server/db/client.ts`: Database client initialization

**Testing:**
- No test files detected; see TESTING.md for coverage patterns

## Naming Conventions

**Files:**
- Routes: `+page.svelte` (UI), `+page.server.ts` (load/actions), `+layout.svelte` (wrapper)
- API endpoints: `+server.ts` (GET/POST/PUT/DELETE handlers)
- Components: PascalCase (e.g., `TelemetryChart.svelte`, `TrackMap.svelte`)
- Utilities: camelCase (e.g., `gps.ts`, `parser.ts`)
- WebWorkers: `*.worker.ts` suffix (e.g., `parser.worker.ts`)

**Directories:**
- camelCase for domain folders (e.g., `telemetry`, `components`, `analysis`)
- URL segments use brackets for dynamic (e.g., `[id]` for `sessions/[id]/...`)

**Code:**
- Functions: camelCase (e.g., `parseBoschExport()`, `detectCoasting()`, `calculateBearing()`)
- Interfaces/Types: PascalCase (e.g., `ParsedSession`, `CoachingTip`, `TrackConfig`)
- Constants: UPPER_SNAKE_CASE (e.g., `COAST_SPEED_THRESHOLD`, `BRAKE_THRESHOLD_BAR`)
- Variables: camelCase (e.g., `sessionId`, `currentLapNum`, `colMap`)

## Where to Add New Code

**New Feature (e.g., Driver Feedback):**
- Primary code: `src/routes/feedback/+page.svelte` (UI) and `src/routes/feedback/+page.server.ts` (load/actions)
- API support: `src/routes/api/feedback/create/+server.ts` (if JSON endpoint needed)
- Database: Add table to `src/lib/server/db/schema.ts` if new data type needed
- Tests: Create `src/routes/feedback/*.test.ts` (pattern to follow; see TESTING.md)

**New Component (e.g., ComparisonChart):**
- Implementation: `src/lib/components/ComparisonChart.svelte`
- Styling: Use TailwindCSS classes (configured in project)
- Props: Define via TypeScript interfaces (e.g., `interface Props { data: TelemetryData[] }`)
- Import in pages: `import ComparisonChart from '$lib/components/ComparisonChart.svelte'`

**New Analysis Function (e.g., Downforce Analysis):**
- Implementation: `src/lib/analysis/downforce.ts`
- Export: Add to `src/lib/index.ts` for easy import
- Call from: Page load function or API endpoint
- Return type: Extend `CoachingTip` or create new type

**Utilities/Helpers:**
- Shared helpers: `src/lib/utils/newHelper.ts`
- Server-only helpers: `src/lib/server/newHelper.ts`
- Export from `src/lib/index.ts` or directly from module

**Database Operations:**
- Schema changes: Edit `src/lib/server/db/schema.ts`, run `drizzle-kit push`
- Queries: Use Drizzle ORM in `+page.server.ts` load functions or `+server.ts` endpoints
- Example: `const sessions = await db.select().from(sessions_table).where(...)`

## Special Directories

**src/.svelte-kit/**
- Purpose: SvelteKit build cache and generated types
- Generated: Yes (automatic)
- Committed: No (in .gitignore)
- Modify: Never manually; delete to clear cache

**data.sqlite**
- Purpose: Local fallback SQLite database (when PostgreSQL unavailable)
- Generated: No (user-managed or seeded)
- Committed: No (in .gitignore)
- Usage: Activated via `OFFLINE_MODE=true` env var or PostgreSQL connection timeout

**.svelte-kit/types/**
- Purpose: Auto-generated type definitions for routes and environment
- Generated: Yes (during `npm run build` or `npm run dev`)
- Committed: No
- Import as: `import type { PageServerLoad } from './$types'`

**static/**
- Purpose: Static assets served at root
- Committed: Yes
- Example: Favicon, robots.txt, public images

## Import Paths & Aliases

**Configured Aliases (from svelte.config.js):**
- `$lib`: `src/lib/` - Import shared utilities: `import { db } from '$lib/server/db/client'`
- `$app`: SvelteKit builtins - `import { goto } from '$app/navigation'`
- `$env`: Environment variables - `import { env } from '$env/dynamic/private'`

**Example Imports:**
```typescript
// Absolute path alias (preferred)
import { db } from '$lib/server/db/client';
import TrackMap from '$lib/components/TrackMap.svelte';
import { detectCoasting } from '$lib/analysis/telemetry';

// Relative path (within same feature)
import { analyzeLap } from '../analysis/telemetry';
```

---

*Structure analysis: 2026-01-31*

# Architecture

**Analysis Date:** 2026-01-31

## Pattern Overview

**Overall:** Three-layer MVC with SvelteKit (frontend) and server routes (backend), using Drizzle ORM as data access layer. Application uses columnar telemetry storage for performance and client-side WebWorkers for file parsing.

**Key Characteristics:**
- Frontend uses Svelte 5 reactive state with server-side data loading via `+page.server.ts`
- Backend uses SvelteKit API routes (`+server.ts`) for data manipulation
- Telemetry parsing happens in browser-based WebWorker to avoid blocking UI
- Database uses JSON blobs for flexible telemetry channel storage
- Dual-database support: PostgreSQL (production) with PGLite fallback (offline)

## Layers

**Presentation (Frontend):**
- Purpose: User interface for session browsing, telemetry visualization, and telemetry import/review
- Location: `src/routes/` (Svelte pages) and `src/lib/components/` (reusable UI components)
- Contains: Page routes, layout components, chart/map visualizations
- Depends on: API routes, server load functions, utility libraries
- Used by: Browser clients

**Business Logic & Analysis (Mid-tier):**
- Purpose: Telemetry parsing, lap analysis, coaching tip generation, GPS geolocation
- Location: `src/lib/analysis/` (client-side analysis), `src/lib/server/` (server-side operations)
- Contains: Parsers (Bosch, VBOX), analysis functions, track detection, GPS utilities
- Depends on: Database client, utility functions
- Used by: Frontend (via API/load), Server routes

**Data Access (Backend):**
- Purpose: Database operations, ORM abstraction, schema management
- Location: `src/lib/server/db/` (schema, client initialization)
- Contains: Drizzle ORM schema definitions, database client factory
- Depends on: PostgreSQL or PGLite, Drizzle ORM
- Used by: Server routes, analysis functions

**Infrastructure (Supporting):**
- Purpose: Authentication, logging, video streaming, file parsing workers
- Location: `src/lib/server/auth.ts`, `src/hooks.server.ts`, `src/routes/api/video/`, `src/routes/sessions/import/parser.worker.ts`
- Contains: Session validation, cookie management, video optimization, worker-based parsing
- Depends on: Database, environment variables
- Used by: Hooks middleware, routes

## Data Flow

**Session Import Flow:**

1. User uploads telemetry file (.vbo or .txt) via `/sessions/import`
2. Browser creates WebWorker (`parser.worker.ts`) to avoid UI blocking
3. Worker parses file (either `parseVboExport` or `parseBoschExport`) into `ParsedSession` structure
4. Worker posts back: metadata (track, date, columns) and lap-by-lap telemetry
5. User reviews parsed data in UI, can adjust channel mappings
6. On finalization: POST to `/api/sessions/save` with confirmation
7. Backend: creates `sessions` record, `telemetry_sources` record, `laps` records, and `lap_telemetry` columnar data
8. Backend: detects outlier laps and marks `valid=false`

**Session View & Analysis Flow:**

1. User navigates to `/sessions/[id]`
2. `+page.server.ts` loads: session metadata, all laps, columnar telemetry data from `lap_telemetry` table
3. Frontend renders: TelemetryChart (speed/throttle/brake curves), TrackMap (GPS overlay), lap list
4. On lap selection: frontend analyzes telemetry via `analyzeLap()` to generate coaching tips
5. User can POST tips to `/api/sessions/[id]/laps/[lapNumber]/analysis` to persist
6. Optional: user uploads video, links with telemetry via time offset

**State Management:**

- Server state: Drizzle ORM queries in `+page.server.ts` load functions
- Client state: Svelte 5 `$state()` reactive variables (selectedLapNumber, hoverTime, isEditing, etc.)
- Shared state: Database (authoritative source of truth)
- Worker state: File parsing happens in isolated WebWorker, communicated back via postMessage

## Key Abstractions

**ParsedSession (Parser Output):**
- Purpose: Standardized output from both Bosch and VBOX parsers
- Location: `src/lib/server/parser.ts` (type definition)
- Pattern: Both parsers return identical structure regardless of input format
- Files: `src/lib/server/parser.ts` exports `parseBoschExport()` and `parseVboExport()`

**TelemetryData (Analysis Input):**
- Purpose: Channel arrays (time, speed, throttle, brake, steering, GPS) for coaching analysis
- Location: `src/lib/analysis/telemetry.ts`
- Pattern: Numeric arrays indexed by sample, used by detection functions
- Example: `{ time: [0, 0.1, 0.2, ...], speed: [10, 15, 20, ...], throttle: [...], ... }`

**CoachingTip (Analysis Output):**
- Purpose: Human-readable feedback about driving technique
- Location: `src/lib/analysis/telemetry.ts` exports `CoachingTip` interface
- Pattern: Severity-based tips with start/end times for UI highlighting
- Types: 'coasting', 'braking', 'throttle', 'steering'

**TrackConfig (GPS Configuration):**
- Purpose: Track sector lines for lap splitting and GPS-based lap detection
- Location: `src/lib/utils/gps.ts`
- Pattern: Three track lines (finishLine, sector1, sector2) with lat/lng/bearing
- Used by: Session creation form and lap detection algorithm

## Entry Points

**Web Application Root:**
- Location: `src/routes/+page.server.ts` (dashboard/home)
- Triggers: Browser navigates to `/`
- Responsibilities: Authenticate user (via hooks), load dashboard stats (driver/session/lap/track counts)

**Session Import:**
- Location: `src/routes/sessions/import/+page.server.ts` (backend) and `+page.svelte` (frontend)
- Triggers: POST to `upload` action with file FormData
- Responsibilities: Coordinate file upload, parsing, validation, lap outlier detection, session creation

**Session Detail View:**
- Location: `src/routes/sessions/[id]/+page.server.ts`
- Triggers: Browser navigates to `/sessions/[id]`
- Responsibilities: Load session metadata, laps, columnar telemetry; render interactive charts

**Analysis API:**
- Location: `src/routes/api/sessions/[id]/laps/[lapNumber]/analysis/+server.ts`
- Triggers: POST with coaching tips array
- Responsibilities: Persist analysis results to `laps.analysis` JSONB column

**Hooks Middleware:**
- Location: `src/hooks.server.ts`
- Triggers: Before every request
- Responsibilities: Validate session cookie, populate `event.locals.user`, protect non-public routes

## Error Handling

**Strategy:** Try-catch with console logging and JSON error responses (API routes)

**Patterns:**

```typescript
// Server routes (API)
try {
    // operation
    return json({ success: true });
} catch (e) {
    console.error('Error:', e);
    return json({ error: 'Failed' }, { status: 500 });
}

// Page load functions
if (isNaN(sessionId)) {
    throw error(404, 'Invalid Session ID');
}

// Parser validation
if (lines.length === 0) {
    console.warn('[Parser] Empty file');
    return { metadata, laps: [] };
}
```

- Parsers are defensive: empty arrays on failure, NaN values converted to 0
- Database errors bubble up as 500 responses
- Invalid parameters throw 400/404 errors

## Cross-Cutting Concerns

**Logging:**
- Approach: `console.log()` / `console.warn()` / `console.error()`
- Pattern: Prefix logs with `[Component]` for grep-ability (e.g., `[Parser]`, `[DB]`)
- Examples: `console.log('[Parser] Bosch export complete - laps:', laps.length)`

**Validation:**
- Approach: Inline validation in handlers and parsing functions
- Pattern: Check input types, array lengths, numeric ranges before processing
- Examples:
  - File size check: `if (file.size > 100 * 1024 * 1024)`
  - Lap detection: `if (currentDuration > 20)` (minimum 20s lap time)
  - GPS validation: coordinate range checks before storing

**Authentication:**
- Approach: Cookie-based session tokens with expiration
- Location: `src/lib/server/auth.ts` (session validation), `src/hooks.server.ts` (middleware)
- Pattern: Check session on every request, refresh token if needed, redirect to /login if invalid
- Session storage: `auth_sessions` table with 30-day expiration

**Database Initialization:**
- Approach: Dual-database with automatic fallback
- Location: `src/lib/server/db/client.ts`
- Pattern: Try PostgreSQL with 2-second timeout; fall back to PGlite if unreachable
- Environment: `DATABASE_URL` (postgres) or `OFFLINE_MODE=true` (pglite)

---

*Architecture analysis: 2026-01-31*

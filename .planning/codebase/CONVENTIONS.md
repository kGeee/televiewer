# Coding Conventions

**Analysis Date:** 2026-01-31

## Naming Patterns

**Files:**
- TypeScript server utilities: `camelCase.ts` (e.g., `parser.ts`, `auth.ts`, `bunny.ts`)
- Svelte components: `PascalCase.svelte` (e.g., `TelemetryChart.svelte`, `TrackMap.svelte`, `Card.svelte`)
- Route files: SvelteKit convention with `+page.server.ts`, `+page.svelte`, `+server.ts`
- Database schema: Single file `schema.ts` containing all table exports

**Functions:**
- Named exports use `camelCase` for functions: `parseBoschExport()`, `calculateBearing()`, `detectCoasting()`, `analyzeBraking()`
- Handler functions prefixed by operation: `detect*`, `analyze*`, `calculate*`, `find*`
- Utility functions: `find`, `segment`, `offset` (e.g., `findClosestTrackPoint()`, `offsetPoint()`)

**Variables:**
- Local state: `camelCase` (e.g., `currentLapNum`, `headerFound`, `isOutlier`)
- Component state (Svelte 5 runes): `$state`, `$derived`, `$bindable` (e.g., `let { data, currentTime = 0 } = $props()`)
- Constants: `UPPER_SNAKE_CASE` in objects: `const CONSTANTS = { COAST_SPEED_THRESHOLD: 80 }`
- Boolean flags: `is*`, `has*` prefixes (e.g., `isThrottleZero`, `isOutlier`, `hasTelemetry`, `isNewSet`)
- Database column names: `snake_case` in schema (e.g., `created_at`, `car_id`, `lap_number`, `is_new_set`)

**Types:**
- Interfaces: `PascalCase` ending in descriptive noun (e.g., `ParsedSession`, `ParsedLap`, `CoachingTip`, `TelemetryData`, `TrackLine`, `TrackConfig`)
- Type unions: `'string' | 'literal'` format for discriminated unions (e.g., `type: 'coasting' | 'braking' | 'throttle' | 'steering'`)
- Database inferred types: `typeof table.$inferSelect` (e.g., `export type User = typeof users.$inferSelect`)

## Code Style

**Formatting:**
- Tool: Prettier 3.7.4
- Tab width: Use tabs (not spaces) - `useTabs: true`
- Line length: 100 characters (`printWidth: 100`)
- Quotes: Single quotes (`singleQuote: true`)
- Trailing commas: None (`trailingComma: "none"`)
- Svelte support: `prettier-plugin-svelte` for `.svelte` files

**Linting:**
- Tool: ESLint 9.39.1 with TypeScript support
- Config: `eslint.config.js` (flat config)
- Base configs: `@eslint/js`, `typescript-eslint`, `eslint-plugin-svelte`
- Key rule: `no-undef: off` (TypeScript handles undefined checking)
- Integration: `eslint-config-prettier` to disable conflicting rules

**Type Checking:**
- TypeScript 5.9.3 with strict mode enabled
- Svelte checking: `svelte-check` for template type safety
- Config: `tsconfig.json` with `strict: true`, `forceConsistentCasingInFileNames: true`

## Import Organization

**Order (by group):**
1. Node/standard library: `import { X } from 'node:util'`, `import crypto from 'crypto'`
2. Third-party packages: `import { drizzle } from 'drizzle-orm/postgres-js'`, `import Chart from 'chart.js'`
3. SvelteKit: `import { browser } from '$app/environment'`, `import { json } from '@sveltejs/kit'`
4. Internal lib: `import { db } from '$lib/server/db/client'`, `import { calculateBearing } from '$lib/utils/gps'`
5. Relative paths: Last if used

**Path Aliases:**
- `$lib`: Maps to `src/lib/` for all shared code
- `$app`: SvelteKit's environment and navigation utilities
- No custom aliases defined beyond SvelteKit defaults

**Barrel Files:**
- Used sparingly: `src/lib/index.ts` exists but primarily for lib documentation
- Prefer explicit imports over barrel re-exports

**Type Imports:**
- Inline type definitions: `import type { Snippet } from 'svelte'`
- Schema types: `import { type users as UserTable } from './db/schema'` (aliased to avoid name collision)

## Error Handling

**Patterns:**
- Direct throws with contextual messages: `throw new Error('Failed to create video: ${err}')`
- Try-catch blocks with fallback: See `src/lib/server/db/client.ts` - tries Postgres, falls back to PGLite
- Early returns with validation: Check conditions upfront and return empty/default values (e.g., `if (lines.length === 0) return { metadata, laps: [] }`)
- Optional chaining with `?` operator where data might be undefined

**Data Validation:**
- Manual checks in parser functions: Filter and validate before processing (e.g., `if (!speed || !throttle || !brake) return tips`)
- Type guards: Use TypeScript strict mode to enforce types
- Database constraints: Handled via Drizzle schema with `.notNull()` and foreign keys

## Logging

**Framework:** `console` object (built-in)

**Patterns:**
- Contextual prefixes: `[Module Name]` prefix for all logs (e.g., `'[Parser]'`, `'[DB]'`, `'[API]'`, `'[Recalculate]'`)
- Log levels:
  - `console.log()`: Info-level, operation progress
  - `console.warn()`: Warnings, fallbacks, data issues
  - `console.error()`: Not commonly used; errors thrown instead
- Examples:
  - `console.log('[Parser] Bosch export - total lines:', lines.length)`
  - `console.warn('[Parser] Bosch export - empty file')`
  - `console.log('[DB] Inserting ${lapsToInsert.length} laps for session ${sessionId}...')`
- Emoji usage: Emojis used in some logs (e.g., `'🔌 [DB]'`, `'⚡ [DB]'`, `'⚠️ [DB]'`) for visual distinction in development

## Comments

**When to Comment:**
- Algorithm explanation: Numbered steps for complex logic (e.g., "1. Coasting Detection", "2. Brake Curve Analysis")
- Configuration clarification: Explain thresholds and why they matter
- Performance notes: Mark optimization opportunities (e.g., `// PERFORMANCE: Pre-allocate and process more efficiently`)
- Data structure details: Explain why a field exists or how it's used

**JSDoc/TSDoc:**
- Used sparingly; not required for all functions
- When used: Brief function description + parameter docs
- Example: Only found in utility functions like `gps.ts` with detailed comments
- No formal block comments required (comments are inline with code)

**Comment Style:**
- Single-line: `// Comment text` (80 character soft limit)
- Inline: `const value = x; // why this value`
- Block: Multi-line for algorithm steps

## Function Design

**Size:**
- Target: 30-50 lines for single-responsibility functions
- Complex parsing: 80+ lines acceptable when unavoidable (e.g., `parseBoschExport()` with state management)
- Analysis functions: Keep helper functions small (10-30 lines) and compose them

**Parameters:**
- Prefer: Named parameters via object destructuring for functions with 2+ params
- Example: `function detectCoasting(data: TelemetryData): CoachingTip[]`
- Server routes: Use `{ request }` or `{ params }` from SvelteKit context
- Optional params: Provide defaults (e.g., `maxPoints: number = 2000`)

**Return Values:**
- Always declare return type explicitly: `function x(): Type { ... }`
- Return objects for multiple values: `{ lat: number; lng: number }`
- Return arrays for collections: `CoachingTip[]`
- Use early returns to reduce nesting

## Module Design

**Exports:**
- Named exports for utilities: `export function calculateBearing(...) { }`
- Named exports for interfaces: `export interface TrackConfig { }`
- Single default export for clients (e.g., `export const db = ...` in `client.ts`)
- Re-export from barrels: `export * from './schema'` (used in db/client.ts)

**File Organization by Module:**
- `src/lib/server/db/` - Database client, schema, utilities
- `src/lib/server/` - Auth, parser, tracks, external APIs (Bunny)
- `src/lib/analysis/` - Telemetry analysis, GPS utilities, sampling
- `src/lib/components/` - Reusable Svelte components
- `src/lib/stores/` - Svelte stores (theme)
- `src/lib/utils/` - Pure utility functions (GPS math)
- `src/routes/` - SvelteKit routes following SvelteKit file structure

**Svelte Component Props:**
- Use Svelte 5 `$props()` rune: `let { title, children, class: className = '' } = $props()`
- Type inline: `class?: string` with `: Type` syntax
- Bindable state: `trackConfig = $bindable(null)` for two-way binding
- Derived state: `const session = $derived(data.session)` for computed values

**Async/Await:**
- Prefer async/await over .then() chains
- Wrap in try-catch at API boundaries
- Use transactions for multi-step DB operations: `await db.transaction(async (tx) => { ... })`

## Data Flow Conventions

**API Endpoints:**
- Exported handler: `export const POST: RequestHandler = async ({ request }) => { ... }`
- Response: Use `json()` from `@sveltejs/kit`
- Error handling: Try-catch with JSON error response
- Logging: Log at start and key checkpoints

**Database Operations:**
- Always use Drizzle ORM: Never raw SQL unless absolutely necessary
- Import schema tables: `import { sessions, laps } from '$lib/server/db/schema'`
- Use operators: `eq()`, `and()`, `inArray()` from `drizzle-orm`
- Return typing: `.returning({ id: table.id })` for inserts

**Telemetry Data Structure:**
- Always use consistent schema: `time[]`, `distance[]`, `speed[]`, `rpm[]`, `throttle[]`, `brake[]`, `gear[]`, `steering[]`
- Optional: `lat?`, `long?`, `other?` for additional channels
- Never nest telemetry arrays; keep flat for charting compatibility

---

*Convention analysis: 2026-01-31*

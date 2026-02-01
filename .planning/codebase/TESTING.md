# Testing Patterns

**Analysis Date:** 2026-01-31

## Test Framework

**Status:** Not currently configured

**Runner:**
- Not detected - No test runner installed (jest, vitest, or other)
- No test scripts in `package.json`

**Assertion Library:**
- Not configured

**Run Commands:**
- No testing infrastructure currently configured
- Recommendation: Consider vitest for SvelteKit projects (faster, ESM-native) or Jest with SvelteKit adapter

## Test File Organization

**Current State:**
- No test files found in codebase (`src/` directory)
- No test directories or fixtures
- Testing would require setup

**Proposed Organization:**
- **Location:** Co-located with source files (recommended for SvelteKit)
  - `src/lib/utils/gps.test.ts` alongside `src/lib/utils/gps.ts`
  - `src/lib/analysis/telemetry.test.ts` alongside `src/lib/analysis/telemetry.ts`
- **Alternative:** Separate `tests/` directory at project root if preferred

**Naming Convention:**
- Test files: `{module}.test.ts` for unit tests
- Test files: `{module}.spec.ts` alternative (not currently used)
- Avoid: `{module}.svelte.test.ts` format; test components separately

## Test Structure

**Recommended Suite Organization (Vitest/Jest style):**
```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { parseBoschExport, parseVboxExport } from '$lib/analysis/parser';
import { detectCoasting, analyzeBraking } from '$lib/analysis/telemetry';

describe('Parser', () => {
	describe('parseBoschExport', () => {
		it('should parse valid Bosch export file', () => {
			const content = `[valid Bosch data]`;
			const result = parseBoschExport(content);
			expect(result.metadata.track).toBeDefined();
			expect(result.laps).toHaveLength(5);
		});

		it('should handle empty files gracefully', () => {
			const result = parseBoschExport('');
			expect(result.laps).toEqual([]);
		});

		it('should apply custom column mapping', () => {
			const mapping = { 'vCar': 'speed_custom' };
			const result = parseBoschExport(data, mapping);
			expect(result.metadata.channelMapping).toEqual(mapping);
		});
	});
});
```

**Patterns:**
- **Setup:** `beforeEach()` for shared test data (mock files, database fixtures)
- **Teardown:** `afterEach()` for cleanup (mocks, database state)
- **Assertion:** Direct `expect()` calls with chainable matchers
- **Organization:** Group related tests with `describe()` blocks (nested as needed)

## Mocking

**Framework:** Not yet configured; recommend:
- `vitest` built-in mocking (preferred) or
- `jest.mock()` patterns if using Jest

**Patterns (to be implemented):**
```typescript
// Mock telemetry data structures
const mockTelemetryData = {
	time: [0, 0.1, 0.2, 0.3],
	speed: [50, 65, 80, 75],
	throttle: [0.5, 0.8, 1.0, 0.7],
	brake: [0, 0, 0, 1.5],
	steering: [0, 2, 5, 3]
};

// Mock database responses
vi.mock('$lib/server/db/client', () => ({
	db: {
		insert: vi.fn(),
		select: vi.fn(),
		update: vi.fn(),
		delete: vi.fn()
	}
}));

// Mock Drizzle operations
const mockSession = {
	id: 1,
	track: 'Test Track',
	date: '2025-01-01',
	status: 'confirmed'
};
```

**What to Mock:**
- Database operations: `db.insert()`, `db.select()`, `db.update()`, `db.delete()`
- External APIs: Bunny Video API calls
- File I/O: File parsing functions (provide fixtures instead)
- Time/Date: `Date.now()` for deterministic tests
- Math-heavy operations: Only if using randomness; mock `Math.random()` for reproducibility

**What NOT to Mock:**
- Pure utility functions: `calculateBearing()`, `offsetPoint()` (test directly)
- Drizzle query builders: Test against in-memory database or fixture
- Svelte component logic: Use component testing library
- Type validation: TypeScript handles this at compile time

## Fixtures and Factories

**Test Data (to be created):**
```typescript
// fixtures/telemetry.ts
export const sampleBoschExportFile = `...raw file content...`;

export const createMockSession = (overrides?: Partial<ParsedSession>): ParsedSession => ({
	metadata: {
		track: 'Test Track',
		type: 'Practice',
		date: new Date().toISOString(),
		...overrides?.metadata
	},
	laps: []
});

export const createMockLap = (overrides?: Partial<ParsedLap>): ParsedLap => ({
	lapNumber: 1,
	time: 95.5,
	telemetry: {
		time: [0, 0.1, 0.2],
		distance: [0, 5, 10],
		speed: [50, 60, 70],
		rpm: [3000, 4000, 5000],
		throttle: [0, 0.5, 1],
		brake: [0, 0, 0],
		gear: [3, 3, 4],
		steering: [0, 2, 0]
	},
	...overrides
});
```

**Location:**
- `tests/fixtures/telemetry.ts` - Telemetry test data
- `tests/fixtures/database.ts` - Database seeding helpers
- `tests/factories/` - Factories for generating test data with defaults

## Coverage

**Requirements:** Not currently enforced

**Recommended Targets:**
- `src/lib/analysis/` - 80%+ (core algorithm functions)
- `src/lib/utils/` - 90%+ (pure functions)
- `src/lib/server/db/` - 70%+ (database layer, with integration tests)
- `src/routes/api/` - 60%+ (integration tests preferred)
- `src/lib/components/` - Component snapshot tests (if using)

**View Coverage:**
```bash
vitest --coverage
# or
jest --coverage
```

## Test Types

**Unit Tests:**
- **Scope:** Individual functions in isolation
- **Examples:**
  - `src/lib/analysis/parser.ts`: Test each parse function (`parseBoschExport`, `parseVboxExport`)
  - `src/lib/analysis/telemetry.ts`: Test each detection function (`detectCoasting`, `analyzeBraking`, etc.)
  - `src/lib/utils/gps.ts`: Test GPS utility functions (`calculateBearing`, `findClosestTrackPoint`, etc.)
- **Approach:** Mock external dependencies, test with fixture data
- **Assertions:** Expect specific telemetry arrays, output structures, edge cases

**Integration Tests:**
- **Scope:** Multi-component workflows (parser → database → analysis)
- **Examples:**
  - Import session → Save to DB → Recalculate laps → Verify structure
  - Test Drizzle queries with real schema against test database
  - Test API endpoints with request/response cycle
- **Approach:** Use test database (in-memory or fixture), real dependencies where possible
- **Database Setup:** Recommended: PGLite in-memory for fast isolation

**E2E Tests:**
- **Status:** Not currently implemented
- **Framework:** Not decided
- **Recommendation:** Consider Playwright for UI testing if web interface testing is needed
- **Scope:** User workflows (import file → view session → analyze telemetry)

## Common Patterns

**Async Testing:**
```typescript
it('should parse file asynchronously', async () => {
	const result = await parseBoschExport(fileContent);
	expect(result).toBeDefined();
});

// Or with beforeEach setup
beforeEach(async () => {
	await db.transaction(async (tx) => {
		// Insert test data
	});
});
```

**Error Testing:**
```typescript
it('should throw on invalid format', () => {
	expect(() => {
		parseBoschExport('invalid data');
	}).toThrow('Expected header row');
});

it('should return empty array on empty input', () => {
	const result = parseBoschExport('');
	expect(result.laps).toEqual([]);
});

// For async errors
it('should reject on database error', async () => {
	vi.mocked(db.insert).mockRejectedValue(new Error('DB Error'));
	await expect(insertSessionData(...)).rejects.toThrow('DB Error');
});
```

**Database Testing:**
```typescript
it('should create session and laps in transaction', async () => {
	const sessionId = 1;
	const laps = [createMockLap(), createMockLap()];

	await insertSessionData(sessionId, laps, 1, null);

	const saved = await db.select().from(laps).where(eq(laps.sessionId, sessionId));
	expect(saved).toHaveLength(2);
	expect(saved[0].valid).toBe(true);
});
```

## Setup Recommendations

**Required Configuration:**
1. Install Vitest or Jest
2. Configure with SvelteKit support
3. Set up test database (PGLite in-memory)
4. Create fixtures directory
5. Add test scripts to `package.json`:
   ```json
   "test": "vitest",
   "test:ui": "vitest --ui",
   "test:coverage": "vitest --coverage"
   ```

**Example Vitest Config (`vitest.config.ts`):**
```typescript
import { defineConfig } from 'vitest/config';
import { sveltekit } from '@sveltejs/kit/vite';

export default defineConfig({
	plugins: [sveltekit()],
	test: {
		globals: true,
		coverage: {
			provider: 'v8',
			reporter: ['text', 'json', 'html']
		}
	}
});
```

## Critical Areas Without Tests

**High Priority:**
- `src/lib/analysis/parser.ts` - Bosch/VBOX parsing (bug-prone, complex parsing logic)
- `src/lib/analysis/telemetry.ts` - Coaching analysis (algorithm correctness critical)
- `src/lib/utils/gps.ts` - GPS calculations (math errors impact data integrity)

**Medium Priority:**
- `src/lib/server/db/utils.ts` - Database insertion and outlier detection
- `src/lib/server/tracks.ts` - Lap detection and recalculation

**Lower Priority (consider integration tests instead):**
- API routes in `src/routes/api/`
- Svelte components (snapshot/visual tests preferred over unit tests)

---

*Testing analysis: 2026-01-31*

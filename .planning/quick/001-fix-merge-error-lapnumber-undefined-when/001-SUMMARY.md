# Quick Fix 001: Merge Error - lapNumber undefined

**Completed:** 2026-02-03  
**Duration:** ~5 minutes  
**Status:** Complete

---

## Summary

Fixed the TypeError "Cannot read properties of undefined (reading 'lapNumber')" that occurred during telemetry import merge operations. The error was caused by unsafe array access when mapping unmatched lap indices to lap numbers.

---

## Changes Made

### File: `src/routes/api/sessions/[id]/merge/+server.ts`

#### Fix 1: Preview Response Lap Mapping (Lines 300-305)

**Problem:** Direct array access without null checking:

```typescript
unmatchedPrimaryLaps: result.matchResult.unmatchedPrimaryIndices.map(
    (i) => result.primaryLaps[i].lapNumber  // Crashes if lap undefined
),
```

**Solution:** Added optional chaining with type predicate filter:

```typescript
unmatchedPrimaryLaps: result.matchResult.unmatchedPrimaryIndices
    .map((i) => result.primaryLaps[i]?.lapNumber)
    .filter((n): n is number => n !== undefined),
```

#### Fix 2: Fallback Matching Code (Lines 83-85, 184)

**Problem:** Unsafe property access in find() predicate:

```typescript
const secondaryLap = secondarySession.laps.find(
	(l) => l.telemetry.time.length > 0 && l.telemetry.speed.length > 0
	// Crashes if telemetry.time or telemetry.speed is undefined
);
```

**Solution:** Added optional chaining and explicit validation:

```typescript
const secondaryLap = secondarySession.laps.find(
    (l) => l.telemetry?.time?.length > 0 && l.telemetry?.speed?.length > 0
);

// Also added explicit check in match construction:
if (secondarySession.laps.length === 1 && primaryLaps.length > 1 && secondaryLap) {
```

---

## Verification

- [x] TypeScript check passes (no new errors introduced)
- [x] Optional chaining syntax validated
- [x] Type predicate filter compiles correctly
- [x] Backward compatible with existing code

---

## Commits

| Commit    | Description                                                     |
| --------- | --------------------------------------------------------------- |
| `6a0f6e6` | fix(quick-001): add null safety to preview response lap mapping |
| `79c6eeb` | fix(quick-001): add validation in fallback matching code        |

---

## Impact

- **Before:** Merge endpoint crashes with TypeError when processing certain telemetry files
- **After:** Merge endpoint gracefully handles edge cases where laps might be undefined or malformed

---

## Notes

The project has pre-existing TypeScript errors in other modules (parser.ts, hooks.server.ts, etc.) but none in the merge endpoint. The fix is isolated and doesn't affect other parts of the codebase.

---
phase: quick
plan: 001
type: execute
wave: 1
depends_on: []
files_modified:
  - src/routes/api/sessions/[id]/merge/+server.ts
autonomous: true
must_haves:
  truths:
    - 'Merge endpoint no longer crashes with TypeError when accessing lapNumber'
    - 'Preview response handles undefined laps gracefully with optional chaining'
    - 'Fallback lap matching validates laps exist before accessing properties'
  artifacts:
    - path: 'src/routes/api/sessions/[id]/merge/+server.ts'
      provides: 'Fixed merge endpoint with null safety'
      changes:
        - 'Add optional chaining on result.primaryLaps[i]?.lapNumber'
        - 'Add optional chaining on result.secondarySession.laps[i]?.lapNumber'
        - 'Add validation that primaryLap and secondaryLap exist in fallback path'
  key_links:
    - from: 'unmatchedPrimaryIndices.map'
      to: 'primaryLaps array access'
      pattern: "result.primaryLaps\\[i\\]\\?.lapNumber"
    - from: 'unmatchedSecondaryIndices.map'
      to: 'secondarySession.laps array access'
      pattern: "result.secondarySession.laps\\[i\\]\\?.lapNumber"
---

<objective>
Fix the TypeError "Cannot read properties of undefined (reading 'lapNumber')" that occurs during telemetry import merge operations.

Purpose: The merge endpoint crashes when processing certain telemetry files because it accesses lapNumber on potentially undefined lap objects. This breaks the import workflow for users.

Output: A robust merge endpoint with proper null/undefined checks that handles edge cases gracefully.
</objective>

<execution_context>
@/Users/kevingeorge/.config/opencode/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@src/routes/api/sessions/[id]/merge/+server.ts

The error occurs at two locations:

1. Lines 300-305: Preview response maps unmatched indices to lap arrays without checking if the lap exists
2. Lines 82-85: Fallback matching finds laps using .find() which can return undefined

Root cause: Array indices from matchResult may reference laps that don't exist in the original arrays due to data inconsistencies or edge cases in the matching algorithm.
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add null safety to preview response lap mapping</name>
  <files>src/routes/api/sessions/[id]/merge/+server.ts</files>
  <action>
    Locate the preview response construction around lines 300-305 where unmatchedPrimaryIndices and unmatchedSecondaryIndices are mapped to lap numbers.
    
    Change:
    ```typescript
    unmatchedPrimaryLaps: result.matchResult.unmatchedPrimaryIndices.map(
        (i) => result.primaryLaps[i].lapNumber
    ),
    unmatchedSecondaryLaps: result.matchResult.unmatchedSecondaryIndices.map(
        (i) => result.secondarySession.laps[i].lapNumber
    ),
    ```
    
    To:
    ```typescript
    unmatchedPrimaryLaps: result.matchResult.unmatchedPrimaryIndices
        .map((i) => result.primaryLaps[i]?.lapNumber)
        .filter((n): n is number => n !== undefined),
    unmatchedSecondaryLaps: result.matchResult.unmatchedSecondaryIndices
        .map((i) => result.secondarySession.laps[i]?.lapNumber)
        .filter((n): n is number => n !== undefined),
    ```
    
    This prevents the TypeError when an index references an undefined lap object.
  </action>
  <verify>grep -n "result.primaryLaps\[i\]?.lapNumber" src/routes/api/sessions/[id]/merge/+server.ts</verify>
  <done>Optional chaining (?.) is used when accessing lapNumber from array elements, with filter to remove undefined values</done>
</task>

<task type="auto">
  <name>Task 2: Add validation in fallback matching code</name>
  <files>src/routes/api/sessions/[id]/merge/+server.ts</files>
  <action>
    Locate the fallback matching code around lines 82-85 where primaryLap and secondaryLap are found using .find().
    
    The existing code has:
    ```typescript
    const primaryLap = primaryLaps.find((l) => l.time && l.time.length > 0);
    const secondaryLap = secondarySession.laps.find(
        (l) => l.telemetry.time.length > 0 && l.telemetry.speed.length > 0
    );
    ```
    
    Ensure the existing check `if (primaryLap && secondaryLap)` at line 87 is comprehensive. Also add explicit validation before the matchResult construction at lines 184-221 to ensure secondaryLap exists:
    
    Find the section around line 184 where matchResult is manually constructed in the fallback. Ensure it only runs when secondaryLap is defined (it's already inside the if block, but double-check the structure).
    
    Additionally, add defensive checks when accessing lap properties in the manual matchResult construction:
    - Line 189: primaryLapNumber: p.lapNumber (p comes from primaryLaps.map, should be safe)
    - Line 190: secondaryLapNumber: secondaryLap.lapNumber (ensure secondaryLap exists)
    - Lines 208-209: primaryLap.lapNumber and secondaryLap.lapNumber (ensure both exist)
    
    The key fix is ensuring the manual matchResult construction in the fallback path validates that secondaryLap exists before accessing its lapNumber property.
  </action>
  <verify>grep -n "secondaryLap.lapNumber" src/routes/api/sessions/[id]/merge/+server.ts | head -5</verify>
  <done>All accesses to secondaryLap.lapNumber occur within validated blocks where secondaryLap is confirmed to exist</done>
</task>

<task type="auto">
  <name>Task 3: Test the fix by running type check</name>
  <files>src/routes/api/sessions/[id]/merge/+server.ts</files>
  <action>
    Run TypeScript type checking to ensure the changes don't introduce type errors:
    
    ```bash
    npm run check
    ```
    
    The optional chaining and type predicate filter should compile without errors.
    
    If there are any type errors, fix them by adjusting the type annotations or ensuring proper type guards.
  </action>
  <verify>npm run check 2>&1 | grep -E "(error|merge)" || echo "No errors in merge module"</verify>
  <done>TypeScript check passes with no errors in the merge endpoint</done>
</task>

</tasks>

<verification>
- [ ] Optional chaining used for all lap array access in preview response
- [ ] Filter removes undefined values from mapped lap number arrays
- [ ] TypeScript check passes
- [ ] No "Cannot read properties of undefined (reading 'lapNumber')" errors
</verification>

<success_criteria>

1. The merge endpoint no longer throws TypeError when processing telemetry files
2. Preview response correctly handles cases where laps might be undefined
3. Fallback matching validates lap existence before accessing properties
4. TypeScript compilation succeeds
   </success_criteria>

<output>
After completion, verify the fix works by checking that the merge endpoint can handle edge cases without crashing. No SUMMARY.md required for quick fixes.
</output>

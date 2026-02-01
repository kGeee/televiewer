# Codebase Concerns

**Analysis Date:** 2026-01-31

## Tech Debt

**Lap Telemetry Sync Issues:**
- Issue: When users recalculate lap splits using a custom track configuration, the `confirm` action in `src/routes/sessions/import/+page.server.ts` (line 249) only updates the `laps` table with new lap times, but does NOT update the `lap_telemetry` table where the actual telemetry data is stored. This creates a mismatch where lap metadata (times) and telemetry data (arrays) become out of sync.
- Files: `src/routes/sessions/import/+page.server.ts` (lines 233-270), `src/routes/sessions/import/parser.worker.ts` (lines 30-74)
- Impact: If a user recalculates laps with custom sector markers, the telemetry visualization will show data from the old lap boundaries while lap times reflect the new boundaries. This corrupts session data silently.
- Fix approach: Call `recalculateLaps()` from `src/lib/server/tracks.ts` serverside rather than trusting client-side lap array from the worker. This ensures both `laps` and `lap_telemetry` tables are updated atomically.

**Parser Code Duplication:**
- Issue: Lap recalculation logic exists in two places: `src/routes/sessions/import/parser.worker.ts` (lines 30-74) and the worker's `recalculate` action. This creates maintenance burden and risk of divergence.
- Files: `src/routes/sessions/import/parser.worker.ts` (line 34 TODO comment)
- Impact: Bug fixes to one implementation won't be applied to the other, leading to inconsistent behavior between initial import and remapping.
- Fix approach: Extract the lap splitting and telemetry extraction logic into a shared utility function in `src/lib/analysis/geo.ts` that both the worker and server route can call.

**Untyped State in Components:**
- Issue: Large components use `any` types extensively for state management. `src/routes/sessions/[id]/+page.svelte` (line 48) uses `let mappingSession: any` and other components use untyped state objects.
- Files: `src/routes/sessions/[id]/+page.svelte` (lines 42-98), `src/routes/sessions/import/+page.svelte`
- Impact: TypeScript provides no safety checking for state mutations or property access, increasing risk of runtime errors.
- Fix approach: Create TypeScript interfaces for session state, remap state, and other major state objects. Move to a Svelte store if state complexity grows further.

**Extensive Console Logging in Production:**
- Issue: 60+ `console.log()` and `console.warn()` statements throughout the codebase remain in place for debugging. These execute in production, consuming resources and leaking information about internal data structures.
- Files: `src/lib/analysis/parser.ts`, `src/lib/server/parser.ts`, `src/routes/sessions/import/parser.worker.ts`, `src/routes/sessions/import/+page.server.ts`, `src/routes/s/[token]/+page.server.ts`, `src/routes/api/video/stream/+server.ts`
- Impact: Performance overhead; potential information disclosure if logs are captured; verbose browser console confuses users.
- Fix approach: Implement structured logging with environment-aware levels. Use debug flag or process.env.NODE_ENV to gate verbose logs. Consider centralizing to a logger service.

## Known Bugs

**Video Path Resolution Fallback Logic:**
- Symptoms: Videos may fail to play with misleading 404 errors. The path resolution tries absolute path first, then falls back to static/ and root, but error handling doesn't clearly distinguish between missing files and path resolution issues.
- Files: `src/routes/api/video/stream/+server.ts` (lines 24-58)
- Trigger: When video path is provided without proper normalization or when file doesn't exist in any expected location.
- Workaround: Provide full absolute paths in video URLs; ensure files exist in project root or static/ folder.

**GPS Validation Heuristics May Fail:**
- Symptoms: Invalid GPS coordinates (0,0 or NaN) sometimes slip through validation despite checks. Parser logs show inconsistent GPS data quality across different telemetry sources.
- Files: `src/lib/server/parser.ts` (lines 579-597), `src/lib/analysis/parser.ts` (lines 529-547)
- Trigger: VBOX files with malformed or missing GPS data; longitude sign inconsistencies between sources.
- Workaround: Manually verify track data before using share links; check logs for GPS validation warnings.

**Outlier Detection Too Permissive:**
- Symptoms: Slow laps that should be marked invalid are sometimes marked valid. Median * 1.15 threshold is relatively generous for detecting outliers.
- Files: `src/routes/sessions/import/+page.server.ts` (lines 81-83), `src/lib/server/db/utils.ts` (lines 7-9)
- Trigger: When median lap time is high (e.g., 150s), threshold allows laps up to 172s which may include cooldown or off-pace laps.
- Workaround: Users can manually mark laps invalid in the review UI after import.

## Security Considerations

**Insufficient Authorization on Share Links:**
- Risk: Share links are cryptographically opaque tokens but there's no per-session rate limiting or audit logging of who accesses shared links. A leaked share token provides unlimited anonymous access.
- Files: `src/routes/s/[token]/+page.server.ts`, `src/routes/api/share/create/+server.ts`
- Current mitigation: Links can be set to expire, but no way to revoke before expiration; no per-access logging.
- Recommendations: Add rate limiting per share token; log access (IP, timestamp) for audit trail; add revocation endpoint; consider short-lived tokens with refresh.

**Bunny Stream API Key Handling:**
- Risk: Presigned upload signature is generated using library ID + API key + timestamp + video ID. If API key is compromised, attacker can generate valid signatures and upload videos to library.
- Files: `src/lib/server/bunny.ts` (lines 44-48), `src/routes/api/bunny/create/+server.ts`
- Current mitigation: API key stored in environment variables; only exposed on server-side.
- Recommendations: Add IP whitelisting if Bunny supports it; rotate API key regularly; implement request signing for additional validation; monitor for unusual upload activity.

**Missing Input Validation on File Upload:**
- Risk: File type validation only checks filename extension (`.vbo`, `.txt`, `.bosch`). Attacker could upload arbitrary binary data as `.vbo` or `.txt` which could crash parser or cause OOM.
- Files: `src/routes/sessions/import/+page.server.ts` (lines 40-49)
- Current mitigation: 100MB file size limit; parser has basic error handling.
- Recommendations: Validate file format by reading magic bytes/headers; add timeout to parser (worker can hang indefinitely); limit number of concurrent parse operations.

**Session Expiry Not Enforced on Some Routes:**
- Risk: Auth sessions expire after 30 days but not all protected routes check session validity. Share link access doesn't require authentication but provides access to potentially sensitive telemetry.
- Files: `src/hooks.server.ts` (lines 40-46), `src/routes/s/[token]/+page.server.ts` (allows unauthenticated access)
- Current mitigation: Session validation happens in hooks; share links require knowledge of token.
- Recommendations: Add explicit session validation check to sensitive routes; implement role-based access control (some users might be "viewer only"); add telemetry export restrictions.

## Performance Bottlenecks

**Large Component File Size:**
- Problem: Session detail page (`src/routes/sessions/[id]/+page.svelte`) is 2535 lines in a single file. Includes state management, video player, charts, track maps, upload logic, remapping UI all in one component.
- Files: `src/routes/sessions/[id]/+page.svelte`
- Cause: Lack of component decomposition; Svelte 5 runes make it easier to keep everything in parent but creates maintenance burden.
- Improvement path: Extract video player, telemetry chart config, track map controls, and remap modal into separate components. Use context API for state sharing. Target max 1000 lines per component.

**Parser Performance on Large Files:**
- Problem: File parsing happens in worker thread but still blocks UI during initial parse. Bosch files with 1M+ rows can take 5+ seconds to parse.
- Files: `src/routes/sessions/import/parser.worker.ts`, `src/lib/analysis/parser.ts`
- Cause: No incremental parsing or streaming; entire file held in memory as string before parsing; no data structure optimization.
- Improvement path: Implement streaming parser that processes file in chunks; use typed arrays instead of objects for large telemetry arrays; add progress callback to worker.

**Telemetry Chart Decimation Not Aggressive Enough:**
- Problem: Chart decimation limits to 2000 points max, but large 10-minute sessions with 100Hz telemetry have 60,000 points. All 2000 points still rendered even if display width is 800px (2.5 points per pixel).
- Files: `src/lib/components/TelemetryChart.svelte` (lines 54-63)
- Cause: Decimation based on data length, not display resolution; no dynamic decimation based on zoom level.
- Improvement path: Calculate decimation factor based on visible zoom range and display width; re-decimate on zoom change; consider using Largest-Triangle-Three-Buckets (LTTB) algorithm for better visual preservation.

**Database Queries Without Indexes:**
- Problem: Share page loads full telemetry for comparison (`src/routes/s/[token]/+page.server.ts` line 58) without filtering to needed laps first.
- Files: `src/routes/s/[token]/+page.server.ts` (line 58), `src/routes/sessions/[id]/+page.server.ts`
- Cause: Drizzle ORM doesn't show which queries are slow; no query optimization hints.
- Improvement path: Add database indexes on `(sessionId, lapNumber)` for `lap_telemetry` table; implement lazy loading for telemetry (load only visible lap on page load); add query analysis/logging.

## Fragile Areas

**Track Detection Logic:**
- Files: `src/lib/server/tracks.ts`, `src/routes/sessions/import/+page.server.ts` (lines 184-195)
- Why fragile: Track is detected by matching GPS coordinates to known tracks using Haversine distance. No fallback if GPS data is missing or inverted longitude. Detection result cached in sessionMetadataMap but never actually used (lines 184-195 has TODO comment).
- Safe modification: Add comprehensive GPS validation before calling detectTrack; test with real GPS data from different regions; add manual track selection UI fallback.
- Test coverage: No tests found for track detection; test with upside-down longitude, missing GPS, and tracks with similar layouts.

**Lap Splitting Algorithm:**
- Files: `src/lib/analysis/geo.ts`, `src/routes/sessions/import/parser.worker.ts`
- Why fragile: Lap boundaries detected by crossing finish line (GPS). Works only if GPS data is valid and finish line configured. Off-track excursions or GPS glitches can split laps incorrectly.
- Safe modification: Only modify if adjusting finish line logic; ensure telemetry alignment stays in sync; test with laps that include off-track excursions.
- Test coverage: No unit tests for lap splitting; test with various track layouts and off-track scenarios.

**Parser Custom Mapping System:**
- Files: `src/lib/analysis/parser.ts`, `src/lib/server/parser.ts`, `src/routes/sessions/import/+page.svelte`
- Why fragile: Custom column mapping allows users to specify which columns contain throttle, brake, etc. Mapping stored in UI state and passed to worker, but no validation that mapped columns actually exist or contain numeric data.
- Safe modification: Add validation that requested column exists; add data type validation; show user which columns were mapped after parse.
- Test coverage: No tests for custom mappings; test with incomplete mappings and mismatched data types.

## Scaling Limits

**Single-File Database:**
- Current capacity: SQLite with better-sqlite3 supports up to 2TB in theory, but practical limit ~100GB before performance degrades.
- Limit: With 100+ sessions × 500+ laps × 100 data points per telemetry array, database easily grows to multi-GB. No partitioning or archival strategy.
- Scaling path: Migrate to PostgreSQL (already schema-ready with pgTable); implement data archival (move old sessions to cold storage); add database replication for backups.

**In-Memory Worker Cache:**
- Current capacity: Parser worker caches parsed session data in memory (`sessionCache` in parser.worker.ts line 6). No size limit.
- Limit: Large files (50MB+) can exhaust worker memory; no cleanup mechanism.
- Scaling path: Implement LRU cache with size limit; persist cache to IndexedDB on client if needed; consider dedicated backend service for parsing.

**Video Upload and Processing:**
- Current capacity: Video files upload to Bunny Stream, but no quota tracking; ffmpeg transcoding runs synchronously on request in video stream route.
- Limit: Multiple concurrent video streams requesting transcoding will block; no rate limiting on transcode requests.
- Scaling path: Implement async transcode queue with Bull or similar; pre-transcode on upload; implement storage quota per user.

## Dependencies at Risk

**ffmpeg-static Missing Gracefully:**
- Risk: If ffmpeg-static fails to install (common on ARM/Alpine), video transcoding silently fails with console warning but no indication to user.
- Impact: Users upload video expecting playback to work, but get unplayable file.
- Migration plan: Make ffmpeg optional; fall back to direct stream if unavailable; add health check endpoint for ffmpeg availability.

**Bunny Stream Hard Dependency:**
- Risk: If Bunny API becomes unavailable or rate limits are hit, all video operations fail with no fallback.
- Impact: Core feature (video playback with telemetry sync) completely broken.
- Migration plan: Implement local video storage as fallback; add retry logic with exponential backoff; abstract video service interface to allow swapping providers.

**Leaflet Map Library Size:**
- Risk: Leaflet is loaded for track visualization even if track data unavailable. Large library adds to bundle size.
- Impact: ~100KB of bundle size for feature that may not be used.
- Migration plan: Lazy load Leaflet only when TrackMap component is mounted; consider lightweight alternative like mapbox-gl or custom canvas-based map.

## Missing Critical Features

**No Session Comparison UI:**
- Problem: Users cannot overlay multiple sessions to compare performance across days/configs. Only single session visible at a time.
- Blocks: Analyzing trend data, A/B testing setup changes, tracking improvement over time.

**No Data Export:**
- Problem: No way to export session data (CSV, JSON) for external analysis or backup.
- Blocks: Users locked into platform; no offline access; integration with other analysis tools impossible.

**No User Collaboration:**
- Problem: Sessions are private to user; no way to share for coaching or team analysis without public share link.
- Blocks: Teams cannot collaborate on setup; coaching feedback asynchronous only.

## Test Coverage Gaps

**Parser Module:**
- What's not tested: Bosch format parsing with custom mappings, VBOX GPS validation, edge cases (empty laps, malformed headers, mixed telemetry quality)
- Files: `src/lib/analysis/parser.ts` (553 lines), `src/lib/server/parser.ts` (604 lines)
- Risk: Parser is critical path for data import. Bugs here corrupt database. No test suite found.
- Priority: High - Add unit tests for each format type; test malformed inputs; validate output shape.

**Lap Splitting Algorithm:**
- What's not tested: Behavior with off-track excursions, GPS gaps, multiple crossings of finish line
- Files: `src/lib/analysis/geo.ts` (288 lines)
- Risk: Algorithm foundation for data segmentation. Incorrect splits cascade through analysis.
- Priority: High - Add integration tests with realistic track GPS data; test edge cases.

**Track Detection:**
- What's not tested: Detection accuracy across different tracks; false positives from GPS noise
- Files: `src/lib/server/tracks.ts` (344 lines)
- Risk: Wrong track assigned cascades to wrong sector markers and analysis.
- Priority: Medium - Add test fixtures for common tracks; validate with real GPS data.

**Share Link Security:**
- What's not tested: Token collision, expiry enforcement, permission enforcement
- Files: `src/routes/api/share/create/+server.ts`, `src/routes/s/[token]/+page.server.ts`
- Risk: Could expose private sessions if tokens are guessable or permissions not enforced.
- Priority: High - Add integration tests for share flow; test token generation entropy; verify permissions.

**Video Stream Path Resolution:**
- What's not tested: Various path formats, symlinks, relative vs absolute paths
- Files: `src/routes/api/video/stream/+server.ts`
- Risk: Path traversal vulnerability if not carefully handled; video not found errors hard to debug.
- Priority: Medium - Add unit tests for path resolution logic; test with various input formats.

---

*Concerns audit: 2026-01-31*

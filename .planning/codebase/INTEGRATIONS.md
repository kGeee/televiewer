# External Integrations

**Analysis Date:** 2026-01-31

## APIs & External Services

**Video Hosting & CDN:**
- Bunny.net Stream API - Hosts and delivers telemetry video content
  - SDK/Client: Custom `BunnyClient` class in `src/lib/server/bunny.ts`
  - Auth: API key (`BUNNY_API_KEY`) and library ID (`BUNNY_LIBRARY_ID`)
  - Endpoints: `https://video.bunnycdn.com/library/{libraryId}/videos`
  - Usage: Create video entries, query video status, manage CDN delivery via pull zones
  - Upload Protocol: TUS (Resumable Upload Protocol) via `https://video.bunnycdn.com/tusupload`

## Data Storage

**Databases:**
- PostgreSQL (Primary) - Full telemetry, sessions, drivers, laps
  - Connection: `DATABASE_URL` environment variable (Neon serverless or self-hosted)
  - Client: postgres-js library with Drizzle ORM abstraction
  - Connection Details: `src/lib/server/db/client.ts` implements fallback strategy

- PGLite (Offline Fallback) - Lightweight embedded PostgreSQL
  - Data Path: `./.local-db/data` (local persistent folder)
  - Triggered when: `OFFLINE_MODE=true` or PostgreSQL connection fails
  - Purpose: Full offline support for local-first testing and development

**File Storage:**
- Local Filesystem (Primary)
  - Video files: `static/videos/` directory (committed to project)
  - Optimized videos: `static/videos/optimized/` (generated at runtime)
  - Raw telemetry imports: Processed in memory via Web Worker

## Caching

**Not Explicitly Configured:**
- No Redis or Memcached integration detected
- Relies on browser cache headers and HTTP caching

## Authentication & Identity

**Auth Provider:**
- Custom Implementation (Session-based)
  - Implementation: `src/lib/server/auth.ts`
  - Password hashing: Node.js `crypto.scrypt()` with salt
  - Session storage: PostgreSQL `auth_sessions` table
  - Session expiration: 30 days with 15-day auto-renewal
  - Session validation: `validateSession()` checks expiry and extends if needed

**Database Tables:**
- `users` table - username, passwordHash, role (driver/admin), linked driverId
- `auth_sessions` table - session ID (hex string), userId, expiresAt (Unix timestamp)
- `share_links` table - Public sharing without authentication; configurable access (telemetry, video, AI)

## Monitoring & Observability

**Error Tracking:**
- Not detected (no Sentry, LogRocket, etc.)

**Logs:**
- Console logging via Node.js console object
- Patterns in codebase:
  - DB connection: `console.log('🔌 [DB] OFFLINE_MODE...')`, `console.log('⚡ [DB] Connected...')`
  - Video processing: `console.log('[Video Opt] Starting optimization...')`
  - FFmpeg: `console.on('error')`, `console.on('end')` event logging
  - Bunny API: `console.error('Bunny Create Error:')` for failures

**No Structured Logging:** Raw console output, no structured JSON or log aggregation

## CI/CD & Deployment

**Hosting:**
- SvelteKit adapter-auto (detects platform automatically)
- Can deploy to: Vercel, Netlify, Node.js, serverless functions, static hosts
- Current setup: Portable via adapter-auto

**CI Pipeline:**
- Not detected (no GitHub Actions, GitLab CI, etc.)

**Deployment Artifacts:**
- Build output: `.svelte-kit/` directory (generated)
- Vite build: JavaScript/CSS bundles

## Environment Configuration

**Required env vars:**

| Variable | Purpose | Example |
|----------|---------|---------|
| `DATABASE_URL` | PostgreSQL connection | `postgresql://user:pass@neon.tech/db?sslmode=require` |
| `BUNNY_API_KEY` | Bunny.net authentication | `b93b2d99-...` |
| `BUNNY_LIBRARY_ID` | Bunny video library | `589069` |
| `PUBLI_BUNNY_PULL_ZONE` | CDN pull zone name | `televiewer` |
| `OFFLINE_MODE` | Force PGLite offline DB | `true` or `false` |

**Secrets location:**
- `.env` file in project root (gitignored in production)
- Environment variables passed at runtime in deployment platforms
- **Security Note:** `.env` contains live API keys and DB credentials; never commit to version control

## Webhooks & Callbacks

**Incoming:**
- Not detected (no webhook endpoints for external services)

**Outgoing:**
- Not detected (no callbacks sent to external services)

**Video Upload Callbacks:**
- Bunny.net TUS protocol handles upload completion via client-side JavaScript
- `src/routes/sessions/[id]/+page.svelte` polls `/api/sessions/{id}/status` for video processing status

## Video Processing Pipeline

**FFmpeg Integration:**
- Location: `src/routes/api/video/optimize/+server.ts`
- Purpose: Transcode user-uploaded videos to H.264 MP4 format
- Encoding Settings:
  - Codec: libx264 (H.264)
  - Pixel format: yuv420p (compatibility)
  - Preset: veryfast (balance speed/quality)
  - CRF: 23 (quality)
  - Audio: AAC 128k, stereo
  - Flags: `+faststart` for progressive playback
- Output: `static/videos/optimized/session_{id}_optimized.mp4`
- Status tracking: DB field `optimizationStatus` ('none', 'processing', 'completed', 'failed')

## Media Playback

**HLS (HTTP Live Streaming):**
- Client library: `hls.js` (dynamic import in `src/lib/components/UniversalPlayer.svelte`)
- Usage: Adaptive bitrate streaming for Bunny.net CDN videos
- Fallback: Native HTML5 video element for local/direct video files

**Video Player Component:**
- `src/lib/components/UniversalPlayer.svelte`
- Supports multi-partition playback (video stitching)
- HLS, native video, and YouTube iframe embeds
- Custom overlay rendering for lap analysis events

## Mapping & Geolocation

**Leaflet Maps:**
- Dynamic import (on-mount): `src/lib/components/TrackMap.svelte`, `SatelliteTrackMap.svelte`
- Purpose: Track visualization with GPS telemetry overlay
- Tile provider: Standard OpenStreetMap (configurable via Leaflet)
- Features:
  - Interactive circuit editing (sector/finish line placement)
  - Real-time position marker during playback
  - Directional arrows for track direction
  - Mirroring and flipping for alternative track configurations

## Telemetry Data Format

**Input Sources:**
- Bosch motorsport data logger (.txt format)
- VBOX data logger (.vbo format)
- Parser: `src/lib/server/parser.ts`

**Stored in Database:**
- `lap_telemetry` table stores columnar arrays per lap:
  - Core: time (seconds), distance (meters)
  - GPS: lat, long
  - Vehicle: speed, rpm, throttle, brake, gear, steering
  - Acceleration: glat (lateral g), glong (longitudinal g)
- Auxiliary channels stored in `telemetry_channels` for custom/extra data

---

*Integration audit: 2026-01-31*

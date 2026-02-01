# Technology Stack

**Analysis Date:** 2026-01-31

## Languages

**Primary:**
- TypeScript 5.9.3 - Used throughout frontend and backend code
- Svelte 5.45.6 - Component framework for UI

**Secondary:**
- JavaScript - Configuration files (vite.config.ts, svelte.config.js, drizzle.config.ts)

## Runtime

**Environment:**
- Node.js (no specific version pinned; generally 18+ required for modern features)

**Package Manager:**
- npm (version not specified in package.json, uses package-lock.json)
- Lockfile: Present (package-lock.json)

## Frameworks

**Core:**
- SvelteKit 2.49.1 - Full-stack framework for routing, SSR, and API routes
- Svelte 5.45.6 - UI component framework with reactive runes
- Vite 7.2.6 - Build tool and dev server

**Styling:**
- TailwindCSS 4.1.18 - Utility-first CSS framework
- @tailwindcss/vite 4.1.18 - Vite plugin for TailwindCSS
- PostCSS 8.5.6 - CSS processing (required by TailwindCSS)

**UI Components:**
- lucide-svelte 0.562.0 - Icon library for UI

**Testing:**
- No test framework configured (none found in package.json)

**Build/Dev:**
- svelte-kit sync - SvelteKit project synchronization
- svelte-check 4.3.4 - Type checking for Svelte components
- prettier 3.7.4 - Code formatter
- prettier-plugin-svelte 3.4.0 - Svelte support in Prettier
- eslint 9.39.1 - Linting
- @eslint/js 9.39.1 - ESLint JavaScript configuration
- @eslint/compat 1.4.0 - ESLint compatibility layer
- eslint-plugin-svelte 3.13.1 - ESLint Svelte support
- typescript-eslint 8.48.1 - TypeScript support for ESLint
- eslint-config-prettier 10.1.8 - ESLint prettier integration
- tsx 4.21.0 - TypeScript executor for Node scripts
- @sveltejs/adapter-auto 7.0.0 - Auto-detecting adapter for SvelteKit

## Key Dependencies

**Critical:**
- drizzle-orm 0.45.1 - SQL ORM for database operations
- drizzle-kit 0.31.8 - Migration and schema management tool
- postgres 3.4.8 - PostgreSQL client (postgres-js)
- @electric-sql/pglite 0.3.15 - Lightweight PostgreSQL in-process database for offline fallback

**Visualization:**
- chart.js 4.5.1 - Charting library for telemetry graphs
- chartjs-plugin-zoom 2.2.0 - Chart.js zoom plugin for interactive zoom
- leaflet 1.9.4 - Map library for track visualization
- @types/leaflet 1.9.21 - TypeScript types for Leaflet

**Media:**
- hls.js 1.6.15 - HLS video streaming client
- fluent-ffmpeg 2.1.3 - FFmpeg command wrapper for video processing
- ffmpeg-static 5.3.0 - Bundled FFmpeg binary

**File Upload:**
- tus-js-client 4.3.1 - TUS resumable upload protocol client

**Utilities:**
- clsx 2.1.1 - Utility for constructing class names
- tailwind-merge 3.4.0 - Merge Tailwind classes safely
- hammerjs 2.0.8 - Touch gesture library
- @types/node 24 - TypeScript types for Node.js

## Configuration

**Environment:**
- Environment variables loaded via `$env/dynamic/private` from SvelteKit
- Required env vars:
  - `DATABASE_URL` - PostgreSQL connection string (Neon or compatible)
  - `OFFLINE_MODE` - Set to 'true' to force PGLite offline mode
  - `BUNNY_API_KEY` - Bunny.net video hosting API key
  - `BUNNY_LIBRARY_ID` - Bunny.net video library ID
  - `PUBLI_BUNNY_PULL_ZONE` - Bunny.net pull zone name for CDN delivery

**Build:**
- vite.config.ts - Vite configuration with TailwindCSS and SvelteKit plugins
- svelte.config.js - SvelteKit configuration using adapter-auto
- tsconfig.json - TypeScript strict mode, with path alias support via SvelteKit
- drizzle.config.ts - Drizzle ORM configuration pointing to schema and PostgreSQL dialect

## Platform Requirements

**Development:**
- Node.js 18+ (for modern async/await and crypto module features)
- npm for package management
- FFmpeg installed globally or via ffmpeg-static (already bundled)

**Production:**
- Node.js 18+ runtime
- PostgreSQL 12+ database (or Neon serverless)
- Bunny.net account for video streaming/CDN (optional but required for video features)
- Persistent file storage for video files (in `static/videos/` or CDN)

**Database:**
- Primary: PostgreSQL (via postgres-js client with Drizzle ORM)
- Fallback: PGLite (embedded in-process when offline or connection fails)
- Connection pooling handled by postgres-js library

---

*Stack analysis: 2026-01-31*

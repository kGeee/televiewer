# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Televiewer is a motorsport telemetry analysis application built with SvelteKit 2, Svelte 5, and SQLite. It allows drivers to import telemetry data from racing data loggers (Bosch and VBOX formats), visualize lap data, and receive AI-generated coaching feedback.

## Development Commands

```bash
npm run dev          # Start development server
npm run build        # Production build
npm run preview      # Preview production build
npm run check        # TypeScript/Svelte type checking
npm run lint         # Prettier + ESLint
npm run format       # Auto-format with Prettier
npx tsx seed.ts      # Seed database with sample data
npx drizzle-kit push # Push schema changes to database
npx drizzle-kit studio # Open Drizzle Studio to browse DB
```

## Architecture

### Tech Stack
- **Frontend**: SvelteKit 2 with Svelte 5, TailwindCSS 4, Chart.js
- **Backend**: SvelteKit server routes with better-sqlite3
- **ORM**: Drizzle ORM with SQLite (`data.db` in project root)

### Database Schema (`src/lib/server/db/schema.ts`)
Four main tables:
- `drivers` - Driver profiles with name and color
- `sessions` - Racing sessions with metadata (track, conditions, tire data)
- `laps` - Individual lap records with times and sector splits
- `telemetry` - High-frequency telemetry data stored as JSON blobs per lap

### Key Data Flow
1. **Import** (`/sessions/import`): Upload Bosch (.txt) or VBOX (.vbo) telemetry files
2. **Parser** (`src/lib/server/parser.ts`): Extracts metadata, lap times, and telemetry channels (time, distance, speed, rpm, throttle, brake, gear, steering)
3. **Review**: Sessions created as "pending" with auto-detected outliers marked invalid
4. **Analysis** (`src/lib/analysis/telemetry.ts`): Generates coaching tips (coasting, braking, throttle hesitation, steering scrub)

### Route Structure
- `/` - Home/dashboard
- `/sessions` - Session list
- `/sessions/import` - Telemetry file upload and review
- `/sessions/[id]` - Individual session view with telemetry charts
- `/drivers` - Driver management

### Server-Side Pattern
All database operations happen in `+page.server.ts` files using Drizzle ORM. The database client is at `src/lib/server/db/client.ts`.

## Telemetry Data Format

Telemetry is stored as JSON with these channels:
```typescript
{
  time: number[],      // Lap time in seconds
  distance: number[],  // Cumulative distance in meters
  speed: number[],     // km/h
  rpm: number[],
  throttle: number[],  // 0-100%
  brake: number[],     // Pressure in bar
  gear: number[],
  steering: number[]   // Degrees
}
```

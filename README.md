# Televiewer Race Engineering

A sleek, high-performance dashboard for race engineering data analysis.

## Features
- **Live Telemetry Visualization**: Visualize ECU data in real-time.
- **Data Findings**: Track tire pressures, temperatures, and lap splits.
- **Engineer Notes**: Record and share session notes.
- **Sleek UI**: Dark mode optimized for track-side visibility.

## Tech Stack
- **Framework**: SvelteKit
- **Styling**: TailwindCSS (v4)
- **Icons**: Lucide Svelte
- **Fonts**: Outfit (Google Fonts)

## Getting Started

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the development server:
   ```bash
   npm run dev
   ```

3. Build for production:
   ```bash
   npm run build
   ```

## Database Setup

The project uses SQLite.
- `data.db`: Local development database (ignored by git).
- `template.db`: Empty database template with current schema.

To start fresh:
```bash
cp template.db data.db
```

## Deployment Notes

### Vercel / Serverless
- **Database**: The default `better-sqlite3` setup stores data in a local file. On Vercel, the filesystem is **ephemeral**, meaning data will be reset on every deployment or cold start. For Vercel deployment, switch to an external provider like **Turso** (LibSQL) or **Vercel Postgres**.
- **Videos**: Vercel has strict body size and execution time limits.
  - **Do not** host large video files in the repo.
  - **Streaming**: The built-in `/api/video/stream` endpoint will likely timeout on large files in a serverless environment.
  - **Recommendation**: Upload videos to **YouTube** (unlisted) or standard cloud storage (S3/R2) and use the URL in the session config.

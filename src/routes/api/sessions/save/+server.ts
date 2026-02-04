import { json, type RequestHandler } from '@sveltejs/kit';
import { db } from '$lib/server/db/client';
import { sessions, laps, lap_telemetry, telemetry_sources, telemetry_channels } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

import { splitTelemetryIntoLaps } from '$lib/analysis/geo';
import { insertSessionData } from '$lib/server/db/utils';

// Allow large payloads for telemetry upload (512kb default is insufficient)
export const config = {
    bodySizeLimit: Infinity
};

export const POST: RequestHandler = async ({ request }) => {
    try {
        const body = await request.json();
        const { sessionData, driverId, trackConfig } = body;

        console.log(`[API] Saving session: ${sessionData.metadata.track} - ${sessionData.metadata.date}`);
        if (trackConfig) console.log('[API] Using custom track configuration');

        // 1. Create Session
        const sessionResult = await db.insert(sessions).values({
            name: sessionData.metadata.type || 'Imported Session',
            track: sessionData.metadata.track || 'Unknown Track',
            date: sessionData.metadata.date || new Date().toISOString(),
            driverId: driverId || null,
            notes: `Imported via Stream-First Ingestion`,
            status: 'confirmed', // Directly confirmed now
            airTemp: 0,
            trackTemp: 0,
            condition: 'Unknown',
            isNewSet: false,
            trackConfig: trackConfig ? trackConfig : null // Save the config!
        }).returning({ id: sessions.id });

        const sessionId = sessionResult[0].id;
        console.log(`[API] Created Session ID: ${sessionId}`);

        // 1b. Create Master Telemetry Source
        const sourceResult = await db.insert(telemetry_sources).values({
            sessionId,
            type: 'unknown', // Metadata might have type?
            filename: sessionData.metadata.filename || 'upload.vbo', // If user sends filename
            importDate: new Date(),
            metadata: sessionData.metadata
        }).returning({ id: telemetry_sources.id });
        const sourceId = sourceResult[0].id;

        await db.update(sessions).set({ masterSourceId: sourceId }).where(eq(sessions.id, sessionId));

        let lapsToInsert = sessionData.laps;

        // If trackConfig is provided, the Worker has *already* re-sliced the laps just before upload.
        // We trust the structure in sessionData.laps to be correct and normalized.
        if (trackConfig && trackConfig.finishLine) {
            console.log('[API] Using custom config (pre-calculated by worker)');
        }

        // Stats for Outlier Detection
        const times = lapsToInsert.map((l: any) => l.time).filter((t: number) => t > 0).sort((a: number, b: number) => a - b);
        const median = times[Math.floor(times.length / 2)] || 0;
        const outlierThreshold = median * 1.15;

        // 2. Insert Laps & Telemetry
        const startTime = Date.now();

        // Import utility (dynamic or top-level? Top-level is better but for this tool I'll add import)
        // I will need to add the import statement at the top separately.
        // For now, I will just call it assuming I add import.
        await insertSessionData(sessionId, lapsToInsert, sourceId, driverId || null);

        const duration = Date.now() - startTime;
        console.log(`[API] DB transaction complete in ${duration}ms`);

        console.log(`[API] Saved ${sessionData.laps.length} laps for Session ${sessionId}`);

        return json({
            success: true,
            sessionId,
            message: 'Session saved successfully'
        });

    } catch (err) {
        console.error('[API] Save Error:', err);
        // @ts-ignore
        return json({ error: 'Failed to save session data', details: err.message }, { status: 500 });
    }
};

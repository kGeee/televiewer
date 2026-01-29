import { db } from '$lib/server/db/client';
import { lap_telemetry, laps } from '$lib/server/db/schema';
import { eq, asc, and } from 'drizzle-orm';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params }) => {
    const sessionId = parseInt(params.id);

    if (isNaN(sessionId)) {
        return json({ error: 'Invalid session ID' }, { status: 400 });
    }

    // BEST PRACTICE: Use the same logic as track creation to ensure metrics align.
    // 1. Find best lap
    const sessionLaps = await db.select().from(laps)
        .where(eq(laps.sessionId, sessionId))
        .orderBy(asc(laps.timeSeconds));

    const bestLap = sessionLaps.find(l => l.valid) || sessionLaps[0];

    if (!bestLap) {
        return json({ error: 'No laps found for session' }, { status: 404 });
    }

    const telemetryRecord = await db.select({
        lat: lap_telemetry.lat,
        long: lap_telemetry.long
    })
        .from(lap_telemetry)
        .where(and(
            eq(lap_telemetry.sessionId, sessionId),
            eq(lap_telemetry.lapNumber, bestLap.lapNumber)
        )); // returns array

    const t = telemetryRecord[0];

    if (!t || !t.lat) {
        return json({ error: 'No GPS data found' }, { status: 404 });
    }

    return json({
        lat: t.lat,
        long: t.long
    });
};

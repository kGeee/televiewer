import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db/client';
import { lap_telemetry } from '$lib/server/db/schema';
import { eq, asc } from 'drizzle-orm';

export const GET = async ({ params }) => {
    const sessionId = parseInt(params.id);
    if (!sessionId) return json({ error: 'Invalid ID' }, { status: 400 });

    // Fetch all telemetry for session, or reconstruction
    // We need Lat/Long strictly for the map.
    // Optimization: Select ONLY lat/long columns?
    // Drizzle: .select({ data: telemetry.data })

    // We need to order by lap number?
    const t = await db.select({
        lapNumber: lap_telemetry.lapNumber,
        lat: lap_telemetry.lat,
        long: lap_telemetry.long
    })
        .from(lap_telemetry)
        .where(eq(lap_telemetry.sessionId, sessionId))
        .orderBy(asc(lap_telemetry.lapNumber)); // Ensure order

    if (t.length === 0) return json({ error: 'No data' }, { status: 404 });

    // Stitch arrays
    const fullLat: number[] = [];
    const fullLong: number[] = [];

    t.forEach(row => {
        const rowLat = row.lat as number[] | null;
        const rowLong = row.long as number[] | null;
        if (rowLat && rowLong) {
            fullLat.push(...rowLat);
            fullLong.push(...rowLong);
        }
    });

    // Determine bounds or reduce resolution if huge?
    // 50 MB JSON will still crash.
    // Downsample if needed?
    // Let's send 1/5th data for the MAP trace?
    // Track Map doesn't need 100Hz.

    const step = 5;
    const downLat = fullLat.filter((_, i) => i % step === 0);
    const downLong = fullLong.filter((_, i) => i % step === 0);

    return json({
        lat: downLat,
        long: downLong
    });
};

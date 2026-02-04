import { db } from '$lib/server/db/client';
import { laps, lap_telemetry, telemetry_channels } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';

export async function insertSessionData(sessionId: number, lapsToInsert: any[], sourceId: number, driverId: number | null) {
    // Stats for Outlier Detection
    const times = lapsToInsert.map((l: any) => l.time).filter((t: number) => t > 0).sort((a: number, b: number) => a - b);
    const median = times[Math.floor(times.length / 2)] || 0;
    const outlierThreshold = median * 1.15;

    console.log(`[DB] Inserting ${lapsToInsert.length} laps for session ${sessionId}...`);

    // Transaction to ensure data integrity
    await db.transaction(async (tx) => {
        let processed = 0;
        for (const lap of lapsToInsert) {
            processed++;
            // if (processed % 10 === 0) console.log(`[DB] Inserting lap ${processed}/${lapsToInsert.length}`);

            const isOutlap = lap.lapNumber === 1;
            // Support both time and timeSeconds formats
            const lapTime = typeof lap.time === 'number' ? lap.time : lap.timeSeconds || 0;

            const isOutlier = (lapTime > outlierThreshold) && !isOutlap;
            const isValid = !isOutlap && !isOutlier;

            const lapResult = await tx.insert(laps).values({
                sessionId,
                driverId: driverId || null,
                lapNumber: lap.lapNumber,
                timeSeconds: lapTime,
                valid: isValid,
                hasTelemetry: true
            }).returning({ id: laps.id });

            const lapId = lapResult[0].id;

            // Telemetry
            const {
                time, distance, lat, long, speed, rpm, throttle, brake, gear, steering,
                other, // Extract explicitly
                ...rest // Extract any other top-level keys
            } = lap.telemetry;

            // Combine 'other' bucket and any loose keys
            const otherChannels = other || rest;

            await tx.insert(lap_telemetry).values({
                sessionId,
                lapNumber: lap.lapNumber,
                time: time || [],
                distance: distance || [],
                lat: lat || [],
                long: long || [],
                speed: speed || [],
                rpm: rpm || [],
                throttle: throttle || [],
                brake: brake || [],
                gear: gear || [],
                steering: steering || []
            });

            if (otherChannels && Object.keys(otherChannels).length > 0) {
                const channelsToInsert = Object.entries(otherChannels).map(([key, data]) => ({
                    sourceId,
                    lapId,
                    name: key,
                    unit: null,
                    data: data as number[]
                }));

                // Helper: only insert if data is valid array
                const validChannels = channelsToInsert.filter(c => Array.isArray(c.data) && c.data.length > 0);

                if (validChannels.length > 0) {
                    await tx.insert(telemetry_channels).values(validChannels);
                }
            }
        }
    });
}

import { db } from './db/client';
import { tracks, sessions, laps, lap_telemetry, telemetry_channels, telemetry_sources, type tracks as TrackTable } from './db/schema';
import { eq, asc, inArray } from 'drizzle-orm';

export interface GpsPoint {
    lat: number;
    long: number;
}

// Haversine formula to calculate distance between two points in meters
function getDistanceFromLatLonInMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
    const R = 6371e3; // Radius of the earth in km
    const dLat = deg2rad(lat2 - lat1);
    const dLon = deg2rad(lon2 - lon1);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const d = R * c; // Distance in km
    return d;
}

function deg2rad(deg: number) {
    return deg * (Math.PI / 180);
}

// Check if segment p1-p2 intersects valid finish line
function segmentsIntersect(p1: { x: number, y: number }, p2: { x: number, y: number }, p3: { x: number, y: number }, p4: { x: number, y: number }) {
    const ccw = (A: any, B: any, C: any) => (C.y - A.y) * (B.x - A.x) > (B.y - A.y) * (C.x - A.x);
    return ccw(p1, p3, p4) !== ccw(p2, p3, p4) && ccw(p1, p2, p3) !== ccw(p1, p2, p4);
}

export async function detectTrack(samplePoints: GpsPoint[]): Promise<typeof tracks.$inferSelect | null> {
    const allTracks = await db.select().from(tracks);

    // Configurable threshold for detection (e.g., 50 meters)
    const DETECTION_THRESHOLD_METERS = 50;

    for (const track of allTracks) {
        if (!track.config || !track.config.finishLine) continue;
        const finishLine = track.config.finishLine;

        let minDistance = Infinity;
        for (const p of samplePoints) {
            const dist = getDistanceFromLatLonInMeters(p.lat, p.long, finishLine.lat, finishLine.lng);
            if (dist < minDistance) {
                minDistance = dist;
            }
        }

        if (minDistance < DETECTION_THRESHOLD_METERS) {
            console.log(`[Track Detection] Matched track '${track.name}' (distance: ${minDistance.toFixed(1)}m)`);
            return track;
        }
    }

    return null;
}

export async function createTrackFromSession(name: string, sessionGpsData: { lat: number[], long: number[] }, finishLineIndex: number) {
    const step = Math.max(1, Math.floor(sessionGpsData.lat.length / 500));
    const pathData = {
        lat: [] as number[],
        long: [] as number[]
    };

    for (let i = 0; i < sessionGpsData.lat.length; i += step) {
        pathData.lat.push(sessionGpsData.lat[i]);
        pathData.long.push(sessionGpsData.long[i]);
    }

    const finishLine = {
        lat: sessionGpsData.lat[finishLineIndex],
        lng: sessionGpsData.long[finishLineIndex],
        bearing: 0
    };

    if (finishLineIndex > 0 && finishLineIndex < sessionGpsData.lat.length - 1) {
        const p1 = { lat: sessionGpsData.lat[finishLineIndex - 1], lng: sessionGpsData.long[finishLineIndex - 1] };
        const p2 = { lat: sessionGpsData.lat[finishLineIndex + 1], lng: sessionGpsData.long[finishLineIndex + 1] };
        const y = Math.sin(deg2rad(p2.lng - p1.lng)) * Math.cos(deg2rad(p2.lat));
        const x = Math.cos(deg2rad(p1.lat)) * Math.sin(deg2rad(p2.lat)) -
            Math.sin(deg2rad(p1.lat)) * Math.cos(deg2rad(p2.lat)) * Math.cos(deg2rad(p2.lng - p1.lng));
        const brng = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
        finishLine.bearing = brng;
    }

    const newTrack = await db.insert(tracks).values({
        name,
        pathData,
        config: {
            finishLine,
            sector1: null,
            sector2: null
        }
    }).returning();

    return newTrack[0];
}

export async function recalculateLaps(sessionId: number, config: NonNullable<typeof tracks.$inferSelect.config>) {
    console.log(`[Recalculate] Starting lap recalculation for session ${sessionId}...`);

    // 1. Fetch all existing laps to get IDs
    const existingLaps = await db.select().from(laps)
        .where(eq(laps.sessionId, sessionId))
        .orderBy(asc(laps.lapNumber));

    const existingLapIds = existingLaps.map(l => l.id);

    // 2. Fetch Core Telemetry
    const chunks = await db.select().from(lap_telemetry)
        .where(eq(lap_telemetry.sessionId, sessionId))
        .orderBy(asc(lap_telemetry.lapNumber));

    if (chunks.length === 0) {
        console.warn('[Recalculate] No telemetry data found.');
        return;
    }

    // 3. Fetch Aux Telemetry (Channels)
    // We need all channels linked to these laps
    let auxChannels: typeof telemetry_channels.$inferSelect[] = [];
    if (existingLapIds.length > 0) {
        auxChannels = await db.select().from(telemetry_channels)
            .where(inArray(telemetry_channels.lapId, existingLapIds));
    }

    // 4. Reconstruct Continuous Streams
    const combined = {
        time: [] as number[],
        distance: [] as number[],
        lat: [] as number[],
        long: [] as number[],
        speed: [] as number[],
        rpm: [] as number[],
        throttle: [] as number[],
        brake: [] as number[],
        gear: [] as number[],
        steering: [] as number[],
        other: {} as Record<string, number[]> // map name -> array
    };

    // Aux metadata (to restore sources)
    const auxMetadata: Record<string, { sourceId: number, unit: string | null }> = {};

    // Helper to push
    const push = (target: number[], source: any) => {
        if (Array.isArray(source)) target.push(...source);
    };

    // Iterate chunks (Laps) in order
    // Note: We assume chunks are ordered by lapNumber 1, 2, 3...
    // If there were gaps, this simple concatenation might be flawed, but usually vbo ingest is sequential.
    for (const chunk of chunks) {
        push(combined.time, chunk.time);
        push(combined.distance, chunk.distance);
        push(combined.lat, chunk.lat);
        push(combined.long, chunk.long);
        push(combined.speed, chunk.speed);
        push(combined.rpm, chunk.rpm);
        push(combined.throttle, chunk.throttle);
        push(combined.brake, chunk.brake);
        push(combined.gear, chunk.gear);
        push(combined.steering, chunk.steering);

        // Find aux channels for this specific lap number
        // We have to match via laps table (lapId).
        // Since `chunks` has `lapNumber`, we find the `lapId` from `existingLaps`.
        const lap = existingLaps.find(l => l.lapNumber === chunk.lapNumber);
        if (lap) {
            const lapAux = auxChannels.filter(c => c.lapId === lap.id);
            for (const ch of lapAux) {
                if (!combined.other[ch.name]) {
                    combined.other[ch.name] = [];
                    auxMetadata[ch.name] = { sourceId: ch.sourceId, unit: ch.unit };
                }
                push(combined.other[ch.name], ch.data);
            }
        }
    }

    const totalPoints = combined.time.length;
    console.log(`[Recalculate] Reconstructed ${totalPoints} data points. Cutting laps...`);

    // Auto-Correct Inverted Longitude
    const sampleLng = combined.long[Math.floor(combined.long.length / 2)];
    const targetLng = config.finishLine!.lng;

    if (targetLng < 0 && sampleLng > 0 && Math.abs(targetLng - sampleLng) > 100) {
        console.warn('[Recalculate] Detected inverted longitude in DB. Auto-correcting...');
        combined.long = combined.long.map((l) => -Math.abs(l));
    }

    // Split Logic
    const { splitTelemetryIntoLaps } = await import('$lib/analysis/geo');

    const detectedLaps = splitTelemetryIntoLaps(
        {
            time: combined.time,
            lat: combined.lat,
            long: combined.long
        },
        {
            finishLine: config.finishLine,
            sector1: config.sector1 || null,
            sector2: config.sector2 || null
        }
    );

    console.log(`[Recalculate] Detected ${detectedLaps.length} laps.`);

    // 5. Update Database
    // Delete in order to satisfy FKs: Channels -> Laps.
    // Also delete LapTelemetry (no FK to Laps, but logically linked)

    if (existingLapIds.length > 0) {
        await db.delete(telemetry_channels).where(inArray(telemetry_channels.lapId, existingLapIds));
    }
    await db.delete(laps).where(eq(laps.sessionId, sessionId));
    await db.delete(lap_telemetry).where(eq(lap_telemetry.sessionId, sessionId));

    // Calc Stats
    const lapTimes = detectedLaps
        .map((l) => l.timeSeconds)
        .filter((t) => t > 20 && t < 600)
        .sort((a, b) => a - b);

    const median = lapTimes[Math.floor(lapTimes.length / 2)] || 0;
    const outlierLimit = median * 1.15;

    // Insert new data
    for (const l of detectedLaps) {
        const { startIdx, endIdx, lapNumber, timeSeconds } = l;

        const startTime = combined.time[startIdx];
        const duration = timeSeconds;

        const isOutlap = lapNumber === 1;
        const isOutlier = median > 0 && duration > outlierLimit;
        const valid = !isOutlap && !isOutlier;

        // Insert Lap
        const newLap = await db.insert(laps).values({
            sessionId,
            driverId: null,
            lapNumber: lapNumber,
            timeSeconds: duration,
            valid: valid,
            hasTelemetry: true,
            s1: l.s1 || null,
            s2: l.s2 || null,
            s3: l.s3 || null
        }).returning({ id: laps.id });

        const newLapId = newLap[0].id;

        // Slice helper
        const slice = (arr: any[]) => arr.slice(startIdx, endIdx + 1);

        // Normalize time/distance?
        // Usually VBO time is continuous absolute time.
        // Actually parser (vbo) usually returns `time` as relative to session start or file start.
        // `lap_telemetry` stores arrays.
        // If we store raw continuous time, charts work fine if we subtract.
        // But usually we want time to start at 0 for the lap.
        // Existing logic: `const lapTimeArr = slice(combined.time).map((t) => t - startTime);`
        // Yes, we should normalize.

        const lapTimeArr = slice(combined.time).map((t) => t - startTime);
        const lapDistArr = slice(combined.distance).map((d) => d - combined.distance[startIdx]);

        await db.insert(lap_telemetry).values({
            sessionId,
            lapNumber: lapNumber,
            time: lapTimeArr,
            distance: lapDistArr,
            lat: slice(combined.lat),
            long: slice(combined.long),
            speed: slice(combined.speed),
            rpm: slice(combined.rpm),
            throttle: slice(combined.throttle),
            brake: slice(combined.brake),
            gear: slice(combined.gear),
            steering: slice(combined.steering)
        });

        // Insert Aux Channels
        // Note: auxMetadata might be missing for some channels if `combined.other` was populated sparsely?
        // Our logic `if (!combined.other[k]) combined.other[k] = []` handles holes during reconstruction.
        // But slicing empty arrays is fine.

        for (const [name, data] of Object.entries(combined.other)) {
            const meta = auxMetadata[name];
            if (meta) { // Only if we tracked metadata (sourceId etc)
                await db.insert(telemetry_channels).values({
                    sourceId: meta.sourceId,
                    lapId: newLapId,
                    name,
                    unit: meta.unit,
                    data: slice(data)
                });
            }
        }
    }

    console.log('[Recalculate] Database updated.');
}

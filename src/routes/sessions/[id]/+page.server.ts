import { db } from '$lib/server/db/client';
import { sessions, laps, lap_telemetry, drivers } from '$lib/server/db/schema';
import { eq, asc, and, getTableColumns } from 'drizzle-orm';
import { error, fail, type Actions } from '@sveltejs/kit';

import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
    const sessionId = parseInt(params.id);

    if (isNaN(sessionId)) {
        throw error(404, 'Invalid Session ID');
    }

    const session = await db.select({
        ...getTableColumns(sessions),
        driverName: drivers.name,
        driverColor: drivers.color
    })
        .from(sessions)
        .leftJoin(drivers, eq(sessions.driverId, drivers.id))
        .where(eq(sessions.id, sessionId));
    // .get() // Removed .get() as it's better-sqlite3 specific. Postgres returns array.

    if (!session[0]) {
        throw error(404, 'Session not found');
    }
    const sessionData = session[0];

    const allDrivers = await db.select().from(drivers);

    const sessionLaps = await db.select({
        ...getTableColumns(laps),
        driverName: drivers.name,
        driverColor: drivers.color
    })
        .from(laps)
        .leftJoin(drivers, eq(laps.driverId, drivers.id))
        .where(eq(laps.sessionId, sessionId))
        .orderBy(asc(laps.lapNumber));

    // Fetch new columnar telemetry
    const telemetryData = await db.select().from(lap_telemetry).where(eq(lap_telemetry.sessionId, sessionId));

    // Map telemetry to laps
    const lapsWithTelemetry = sessionLaps.map(l => {
        const t = telemetryData.find(t => t.lapNumber === l.lapNumber);
        let cleanData = null;

        if (t) {
            cleanData = {
                time: t.time || [],
                distance: t.distance || [],
                speed: t.speed || [],
                lat: t.lat || [],
                long: t.long || [],
                rpm: t.rpm || [],
                throttle: t.throttle || [],
                brake: t.brake || [],
                gear: t.gear || [],
                steering: t.steering || []
                // NOTE: 'other' channels are now in `telemetry_channels` table and loaded on demand 
                // or if needed for basic view, we'd fetch them separately.
                // For now, viewer expects core channels.
            };
        }

        return {
            ...l,
            telemetryData: cleanData
        };
    });

    return {
        session: sessionData,
        laps: lapsWithTelemetry,
        drivers: allDrivers
    };
};

export const actions: Actions = {
    update: async ({ request, params }) => {
        const sessionId = parseInt(params.id!);
        if (isNaN(sessionId)) return fail(400, { error: 'Invalid ID' });

        const data = await request.formData();

        // Helper to get number or null
        const getNum = (key: string, isFloat = false) => {
            const val = data.get(key);
            if (val === null || val === '') return null; // Clear value if empty
            const num = isFloat ? parseFloat(val as string) : parseInt(val as string);
            return isNaN(num) ? null : num;
        };

        const updateData: any = {};

        // Optional Fields
        updateData.airTemp = getNum('airTemp');
        updateData.trackTemp = getNum('trackTemp');
        updateData.tirePressureFL = getNum('tirePressureFL', true);
        updateData.tirePressureFR = getNum('tirePressureFR', true);
        updateData.tirePressureRL = getNum('tirePressureRL', true);
        updateData.tirePressureRR = getNum('tirePressureRR', true);
        updateData.driverId = getNum('driverId');

        updateData.condition = data.get('condition') as string;
        updateData.tireCompound = data.get('tireCompound') as string;
        updateData.isNewSet = data.get('isNewSet') === 'on'; // Checkbox
        updateData.notes = data.get('notes') as string;
        updateData.videoUrl = data.get('videoUrl') as string;
        updateData.videoOffset = getNum('videoOffset', true);
        updateData.fastestLapVideoUrl = data.get('fastestLapVideoUrl') as string;
        updateData.fastestLapVideoOffset = getNum('fastestLapVideoOffset', true);

        // Required Fields (skip if missing)
        const track = data.get('track');
        if (track !== null && track !== '') {
            updateData.track = track as string;
        }

        const date = data.get('date');
        if (date !== null && date !== '') {
            // Ensure we keep the ISO format if previously it was full ISO
            // Or just store the date string if that's how we roll. 
            // The DB expects text. The input type="date" returns YYYY-MM-DD.
            // If the original date had time, we might lose it if we just overwrite.
            // Ideally we preserve the time, but for now let's just update the day.
            // Actually, let's just save what we get.
            updateData.date = new Date(date as string).toISOString();
        }

        // Telemetry Config logic
        const configStr = data.get('telemetryConfig') as string;
        if (configStr) {
            try {
                updateData.telemetryConfig = JSON.parse(configStr);
            } catch (e) {
                console.error('Failed to parse telemetry config', e);
            }
        }

        try {
            await db.update(sessions)
                .set(updateData)
                .where(eq(sessions.id, sessionId));

            return { type: 'success' };
        } catch (err) {
            console.error(err);
            return fail(500, { error: 'Failed to update session' });
        }
    },
    toggleLapValidity: async ({ request, params }) => {
        const sessionId = parseInt(params.id!);
        const data = await request.formData();
        const lapNumber = parseInt(data.get('lapNumber') as string);
        const isValid = data.get('valid') === 'true';

        try {
            await db.update(laps)
                .set({ valid: isValid })
                .where(and(eq(laps.sessionId, sessionId), eq(laps.lapNumber, lapNumber)));

            return { type: 'success' };
        } catch (err) {
            console.error(err);
            return fail(500, { error: 'Failed to update lap validity' });
        }
    },
    setLapDriver: async ({ request, params }) => {
        const sessionId = parseInt(params.id!);
        const data = await request.formData();
        const lapNumber = parseInt(data.get('lapNumber') as string);
        const driverId = parseInt(data.get('driverId') as string);

        try {
            await db.update(laps)
                .set({ driverId })
                .where(and(eq(laps.sessionId, sessionId), eq(laps.lapNumber, lapNumber)));

            return { type: 'success' };
        } catch (err) {
            console.error(err);
            return fail(500, { error: 'Failed to set driver' });
        }
    },
    updateTrackConfig: async ({ request, params }) => {
        const sessionId = parseInt(params.id!);
        const data = await request.formData();
        const configStr = data.get('config') as string;

        try {
            const config = JSON.parse(configStr);

            // 1. Update Session Config
            await db.update(sessions)
                .set({ trackConfig: config })
                .where(eq(sessions.id, sessionId));

            // 2. Recalculate Laps if requested or always?
            const { recalculateLaps } = await import('$lib/server/tracks');

            if (config.finishLine) {
                await recalculateLaps(sessionId, config);
            }

            return { type: 'success' };
        } catch (err) {
            console.error(err);
            return fail(500, { error: 'Failed to update track config' });
        }
    }
};

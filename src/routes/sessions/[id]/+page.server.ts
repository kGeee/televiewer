import { db } from '$lib/server/db/client';
import { sessions, laps, lap_telemetry, drivers, cars, car_channel_mappings, telemetry_channels, telemetry_view_presets } from '$lib/server/db/schema';
import { eq, asc, and, inArray, getTableColumns } from 'drizzle-orm';
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
    const allCars = await db.select().from(cars).orderBy(asc(cars.name));
    const allMappings = await db.select().from(car_channel_mappings); // Should be small enough to just load all

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

    // Fetch auxiliary channels from telemetry_channels
    const lapIds = sessionLaps.map(l => l.id);
    const auxChannels = lapIds.length > 0
        ? await db.select().from(telemetry_channels).where(inArray(telemetry_channels.lapId, lapIds))
        : [];

    // Fetch view presets
    const viewPresets = await db.select().from(telemetry_view_presets).orderBy(asc(telemetry_view_presets.name));

    // Map telemetry to laps
    const lapsWithTelemetry = sessionLaps.map(l => {
        const t = telemetryData.find(t => t.lapNumber === l.lapNumber);
        let cleanData: Record<string, number[]> | null = null;

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
            };

            // Merge auxiliary channels (e.g. Bosch engine temp, oil pressure)
            const lapAux = auxChannels.filter(ch => ch.lapId === l.id);
            for (const ch of lapAux) {
                if (ch.data?.length && !cleanData[ch.name]) {
                    cleanData[ch.name] = ch.data;
                }
            }
        }

        return {
            ...l,
            telemetryData: cleanData
        };
    });

    return {
        session: sessionData,
        laps: lapsWithTelemetry,
        drivers: allDrivers,
        cars: allCars,
        channelMappings: allMappings,
        viewPresets
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
        updateData.carId = getNum('carId');

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
    },
    savePreset: async ({ request }) => {
        const data = await request.formData();
        const name = data.get('name') as string;
        const configStr = data.get('config') as string;
        const carIdStr = data.get('carId') as string;

        if (!name || !configStr) {
            return fail(400, { error: 'Name and config are required' });
        }

        try {
            const carId = carIdStr ? parseInt(carIdStr) : null;
            await db.insert(telemetry_view_presets).values({
                name,
                carId: isNaN(carId as number) ? null : carId,
                config: JSON.parse(configStr)
            });
            return { type: 'success' };
        } catch (err) {
            console.error(err);
            return fail(500, { error: 'Failed to save preset' });
        }
    },
    deletePreset: async ({ request }) => {
        const data = await request.formData();
        const presetId = parseInt(data.get('presetId') as string);

        if (isNaN(presetId)) {
            return fail(400, { error: 'Invalid preset ID' });
        }

        try {
            await db.delete(telemetry_view_presets).where(eq(telemetry_view_presets.id, presetId));
            return { type: 'success' };
        } catch (err) {
            console.error(err);
            return fail(500, { error: 'Failed to delete preset' });
        }
    },
    saveChannelMapping: async ({ request }) => {
        const data = await request.formData();
        const carId = parseInt(data.get('carId') as string);
        const name = data.get('name') as string;
        const mappingStr = data.get('mapping') as string;

        if (!carId || !name || !mappingStr) {
            return fail(400, { error: 'Missing required fields' });
        }

        try {
            await db.insert(car_channel_mappings).values({
                carId,
                name,
                mapping: JSON.parse(mappingStr)
            });
            return { type: 'success' };
        } catch (err: any) {
            console.error(err);
            return fail(500, { error: 'Failed to save mapping' });
        }
    }
};

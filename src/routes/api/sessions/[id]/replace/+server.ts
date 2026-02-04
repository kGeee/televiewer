import { json, type RequestHandler } from '@sveltejs/kit';
import { db } from '$lib/server/db/client';
import { sessions, laps, lap_telemetry, telemetry_channels } from '$lib/server/db/schema';
import { eq, inArray } from 'drizzle-orm';
import { insertSessionData } from '$lib/server/db/utils';

export const config = {
    bodySizeLimit: Infinity
};

export const POST: RequestHandler = async ({ request, params }) => {
    const sessionId = parseInt(params.id!);
    if (isNaN(sessionId)) return json({ error: 'Invalid Session ID' }, { status: 400 });

    try {
        const body = await request.json();
        const { sessionData } = body;

        if (!sessionData || !sessionData.laps) {
            return json({ error: 'Invalid payload: missing sessionData or laps' }, { status: 400 });
        }

        console.log(`[API] Replacing data for Session ${sessionId}`);

        // 1. Get current Master Source ID & Driver ID
        const currentSession = await db.query.sessions.findFirst({
            where: eq(sessions.id, sessionId),
            columns: {
                masterSourceId: true,
                driverId: true
            }
        });

        if (!currentSession) return json({ error: 'Session not found' }, { status: 404 });

        const sourceId = currentSession.masterSourceId;
        const driverId = currentSession.driverId;

        if (!sourceId) {
            console.warn('[API] Session missing source record. Proceeding with caution (stats might be missing source link).');
        }

        // 2. Delete Existing Data
        console.log('[API] Deleting existing data...');
        await db.transaction(async (tx) => {
            // Get Lap IDs to delete linked dependent channels
            const lapIdsData = await tx.select({ id: laps.id }).from(laps).where(eq(laps.sessionId, sessionId));
            const ids = lapIdsData.map(l => l.id);

            if (ids.length > 0) {
                await tx.delete(telemetry_channels).where(inArray(telemetry_channels.lapId, ids));
            }

            await tx.delete(lap_telemetry).where(eq(lap_telemetry.sessionId, sessionId));
            await tx.delete(laps).where(eq(laps.sessionId, sessionId));
        });

        // 3. Insert New Data
        console.log('[API] Inserting new data...');
        // We handle the potential null sourceId by passing 0 or handling it in utility if strictly typed. 
        // Schema says sourceId is not null in telemetry_channels.
        // Assuming sourceId exists if we got this far from a standard import.
        await insertSessionData(sessionId, sessionData.laps, sourceId || 0, driverId);

        console.log('[API] Replacement Complete');

        return json({ success: true });

    } catch (e: any) {
        console.error('[API] Replace Error:', e);
        return json({ error: e.message }, { status: 500 });
    }
};

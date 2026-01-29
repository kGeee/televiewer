import { json, type RequestHandler } from '@sveltejs/kit';
import { db } from '$lib/server/db/client';
import { sessions, laps } from '$lib/server/db/schema';
import { eq, asc } from 'drizzle-orm';
import { recalculateLaps } from '$lib/server/tracks';

export const POST: RequestHandler = async ({ params, request }) => {
    const sessionId = parseInt(params.id!);
    if (!sessionId) return json({ error: 'Invalid ID' }, { status: 400 });

    const body = await request.json();
    const { config } = body; // { finishLine: ... }

    if (!config || !config.finishLine) {
        return json({ error: 'Missing start line config' }, { status: 400 });
    }

    try {
        console.log(`[API] Recalculating laps for Session ${sessionId}`);

        // Use shared logic (already fixed for Postgres)
        await recalculateLaps(sessionId, config);

        // Update session config to match
        await db.update(sessions)
            .set({ trackConfig: config })
            .where(eq(sessions.id, sessionId));

        // Return new Laps list
        const newLaps = await db.select().from(laps)
            .where(eq(laps.sessionId, sessionId))
            .orderBy(asc(laps.lapNumber));

        return json({ laps: newLaps });

    } catch (err) {
        console.error('[API] Recalculate Error:', err);
        // @ts-ignore
        return json({ error: 'Failed to recalculate laps', details: err.message }, { status: 500 });
    }
};

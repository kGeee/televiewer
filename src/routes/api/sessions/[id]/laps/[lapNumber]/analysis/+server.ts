import { json, type RequestHandler } from '@sveltejs/kit';
import { db } from '$lib/server/db/client';
import { laps } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';

export const POST: RequestHandler = async ({ params, request }) => {
    const sessionId = parseInt(params.id!);
    const lapNumber = parseInt(params.lapNumber!);

    if (isNaN(sessionId) || isNaN(lapNumber)) {
        return json({ error: 'Invalid ID or Lap Number' }, { status: 400 });
    }

    try {
        const body = await request.json();
        const { analysis } = body;

        if (!analysis || !Array.isArray(analysis)) {
            return json({ error: 'Invalid analysis data' }, { status: 400 });
        }

        // Update the lap in the database
        await db.update(laps)
            .set({ analysis })
            .where(and(
                eq(laps.sessionId, sessionId),
                eq(laps.lapNumber, lapNumber)
            ));

        return json({ success: true });
    } catch (e) {
        console.error('Error saving analysis:', e);
        return json({ error: 'Failed' }, { status: 500 });
    }
};

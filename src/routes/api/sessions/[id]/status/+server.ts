import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { sessions } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

export const GET: RequestHandler = async ({ params }) => {
    const sessionId = parseInt(params.id);
    if (isNaN(sessionId)) {
        throw error(400, 'Invalid Session ID');
    }

    const session = await db.query.sessions.findFirst({
        where: eq(sessions.id, sessionId),
        columns: {
            id: true,
            optimizationStatus: true,
            videoUrl: true
        }
    });

    if (!session) {
        throw error(404, 'Session not found');
    }

    return json(session);
};

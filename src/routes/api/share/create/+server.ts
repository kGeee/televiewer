import { db } from '$lib/server/db/client';
import { share_links } from '$lib/server/db/schema';
import { error, json } from '@sveltejs/kit';
import { randomBytes } from 'crypto';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals }) => {
    // In development mode, allow anonymous share link creation
    const isDev = process.env.NODE_ENV !== 'production';
    const userId = locals.user?.id || null;

    // In production, require authentication
    if (!userId && !isDev) {
        throw error(401, 'Unauthorized - Please log in to create share links');
    }

    const { sessionId, config } = await request.json();

    if (!sessionId || !config) {
        throw error(400, 'Missing sessionId or config');
    }

    const token = randomBytes(16).toString('hex');
    const expiresAt = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7; // 7 days

    await db.insert(share_links).values({
        id: token,
        sessionId,
        createdBy: userId,
        config: config,
        expiresAt: expiresAt
    });

    return json({ token, url: `/s/${token}` });
};

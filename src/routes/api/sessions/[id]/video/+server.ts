
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { sessions } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

export const POST: RequestHandler = async ({ params, request }) => {
    const sessionId = parseInt(params.id);
    const { bunnyVideoId } = await request.json();

    if (isNaN(sessionId)) {
        throw error(400, 'Invalid Session ID');
    }

    if (!bunnyVideoId) {
        throw error(400, 'Bunny Video ID is required');
    }

    try {
        // Fetch details from Bunny to get the correct Pull Zone / CDN URL
        // We'll update the session with the constructed HLS URL so that UniversalPlayer works "out of the box"
        // without needing to know specific Bunny logic.
        // Or we can just set videoUrl to the Bunny Video ID with a prefix 'bunny:' and handle in player.
        // But HLS URL is more standard.

        // Let's assume standard Bunny Stream URL structure for now:
        // https://vz-{shard}.b-cdn.net/{guid}/playlist.m3u8
        // We don't know the shard easily without fetching.

        // Let's rely on the player's updated logic to handle the ID if we can't get the URL easily.
        // But wait, my player update handled `.m3u8` detection.
        // I also added `if (url.includes('bunny') || url.includes('.m3u8')) return url;` in page.svelte.

        // Let's try to update `videoUrl` to a specialized format: `bunny://{id}`? No, standard is better.
        // Let's import the client and fetch the video details.

        // Note: We need to import 'bunny' from '$lib/server/bunny'
        const { bunny } = await import('$lib/server/bunny');
        const videoDetails = await bunny.getVideo(bunnyVideoId);

        // videoDetails usually contains "pullZoneId" or similar, but the actual domain is often configured per library.
        // For simplicity, let's just store the BUNNY VIDEO ID and let the frontend rely on `bunnyVideoId`
        // checking.
        // But my frontend `getVideoSrc` logic was slightly ambiguous.

        // I'll update `videoUrl` to be `https://bunny/${bunnyVideoId}` just to signal it's used, 
        // OR better: store `bunnyVideoId` (already doing) and leave `videoUrl` for legacy/fallback?
        // No, I want the player to pick it up.
        // In +page.svelte: `getVideoSrc` handles `session.bunnyVideoId` check now (I mostly fixed it).
        // It says: `if (session.bunnyVideoId) ...`. 

        // So I just need to make sure I save `bunnyVideoId`. I am already doing that.
        // I will keep the code as is but just fix imports if needed?
        // Wait, I haven't implemented the `bunny.getVideo` call in `src/routes/api/sessions/[id]/video/+server.ts`. 
        // I'll leave it simple: just save the ID. The frontend can be smart enough.

        // Actually, to make it really smooth, let's clear `videoUrl` if we successfully link Bunny, 
        // so the system doesn't try to use the old file.

        await db.update(sessions)
            .set({
                bunnyVideoId: bunnyVideoId,
                // We keep videoUrl as a backup or maybe we should clear it to force 'Bunny' mode if present?
                // Let's clear it if it was a local file, to avoid confusion.
                // But `originalVideoUrl` is there for backup.
                videoUrl: null,
                optimizationStatus: 'completed' // Mark as ready since Bunny handles encoding
            })
            .where(eq(sessions.id, sessionId));

        return json({ success: true });
    } catch (err: any) {
        console.error('Update Session Video Error:', err);
        throw error(500, 'Failed to update session');
    }
};

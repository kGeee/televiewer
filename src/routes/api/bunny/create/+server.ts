
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { bunny } from '$lib/server/bunny';

export const POST: RequestHandler = async ({ request }) => {
    try {
        const { title } = await request.json();

        if (!title) {
            throw error(400, 'Title is required');
        }

        const videoData = await bunny.createVideo(title);

        return json(videoData);
    } catch (err: any) {
        console.error('Bunny Create Error:', err);
        throw error(500, err.message || 'Failed to create video');
    }
};

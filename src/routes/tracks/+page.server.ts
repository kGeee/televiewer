import { db } from '$lib/server/db/client';
import { tracks } from '$lib/server/db/schema';
import { desc } from 'drizzle-orm';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
    const allTracks = await db.select().from(tracks).orderBy(desc(tracks.createdAt));
    return { tracks: allTracks };
};

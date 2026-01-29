
import { db } from '$lib/server/db/client';
import { drivers, sessions, laps, tracks } from '$lib/server/db/schema';
import { count } from 'drizzle-orm';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
    // If not logged in, hooks will redirect, so we are safe here

    const [driverCount] = await db.select({ count: count() }).from(drivers);
    const [sessionCount] = await db.select({ count: count() }).from(sessions);
    const [lapCount] = await db.select({ count: count() }).from(laps);
    const [trackCount] = await db.select({ count: count() }).from(tracks);

    return {
        stats: {
            drivers: driverCount.count,
            sessions: sessionCount.count,
            laps: lapCount.count,
            tracks: trackCount.count
        }
    };
};

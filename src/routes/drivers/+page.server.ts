import { db } from '$lib/server/db/client';
import { drivers, sessions, laps } from '$lib/server/db/schema';
import { eq, count } from 'drizzle-orm';
import { fail, type Actions } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
    if (!locals.user) {
        // Return public drivers or handle as needed
        // For now, allow viewing all drivers but we could restrict this
    }

    let driversList;
    if (locals.user?.role === 'driver' && locals.user.driverId) {
        // If user is a driver, only show their own profile
        driversList = await db.select().from(drivers).where(eq(drivers.id, locals.user.driverId));
    } else {
        // Admin/Coach can see all
        driversList = await db.select().from(drivers);
    }

    // Enrich with session count?
    const enriched = await Promise.all(driversList.map(async (d) => {
        const sessionCount = await db.select({ count: count() }).from(sessions).where(eq(sessions.driverId, d.id));
        const lapCount = await db.select({ count: count() }).from(laps).where(eq(laps.driverId, d.id));
        return {
            ...d,
            sessions: sessionCount[0]?.count || 0,
            laps: lapCount[0]?.count || 0
        };
    }));

    return {
        drivers: enriched
    };
};

export const actions = {
    create: async ({ request }) => {
        const formData = await request.formData();
        const name = formData.get('name') as string;
        const color = formData.get('color') as string;

        if (!name) return fail(400, { error: 'Name is required' });

        try {
            await db.insert(drivers).values({ name, color });
            return { type: 'success' };
        } catch (e) {
            console.error(e);
            return fail(500, { error: 'Failed to create driver' });
        }
    },
    update: async ({ request }) => {
        const formData = await request.formData();
        const id = parseInt(formData.get('id') as string);
        const name = formData.get('name') as string;
        const color = formData.get('color') as string;

        try {
            await db.update(drivers)
                .set({ name, color })
                .where(eq(drivers.id, id));
            return { type: 'success' };
        } catch (e) {
            return fail(500, { error: 'Failed to update driver' });
        }
    },
    delete: async ({ request }) => {
        const formData = await request.formData();
        const id = parseInt(formData.get('id') as string);

        try {
            await db.delete(drivers).where(eq(drivers.id, id));
            return { type: 'success' };
        } catch (e) {
            return fail(500, { error: 'Failed to delete driver' });
        }
    }
} satisfies Actions;

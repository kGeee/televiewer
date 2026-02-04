import { db } from '$lib/server/db/client';
import { sessions, drivers } from '$lib/server/db/schema';
import { desc, eq, getTableColumns } from 'drizzle-orm';
import { fail, type Actions } from '@sveltejs/kit';

export const load = async () => {
    const allSessions = await db.select({
        ...getTableColumns(sessions),
        driverName: drivers.name,
        driverColor: drivers.color
    })
        .from(sessions)
        .leftJoin(drivers, eq(sessions.driverId, drivers.id))
        .orderBy(desc(sessions.date));

    return {
        sessions: allSessions
    };
};

export const actions: Actions = {
    default: async ({ request }) => {
        // Log the unexpected request for debugging
        const data = await request.formData();
        console.warn('Unexpected POST to /sessions', Object.fromEntries(data));
        return fail(400, { error: 'Invalid action' });
    }
};

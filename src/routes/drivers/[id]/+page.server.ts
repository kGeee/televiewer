import { db } from '$lib/server/db/client';
import { drivers, sessions } from '$lib/server/db/schema';
import { eq, desc } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
    const driverId = parseInt(params.id);

    if (isNaN(driverId)) {
        throw error(400, 'Invalid driver ID');
    }

    // specific permission check: if user is a driver (role 'driver'), they can only see their own profile?
    // The requirement didn't specify strict locking, but generally drivers can see all drivers in a team app.
    // However, if we wanted to be strict:
    // if (locals.user?.role === 'driver' && locals.user.driverId !== driverId) {
    //    throw error(403, 'Unauthorized');
    // }
    // adhering to current open visibility based on drivers page implementation.

    const driver = await db.query.drivers.findFirst({
        where: eq(drivers.id, driverId)
    });

    if (!driver) {
        throw error(404, 'Driver not found');
    }

    const driverSessions = await db.query.sessions.findMany({
        where: eq(sessions.driverId, driverId),
        orderBy: [desc(sessions.date)]
    });

    return {
        driver,
        sessions: driverSessions
    };
};

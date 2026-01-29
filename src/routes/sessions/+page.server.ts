import { db } from '$lib/server/db/client';
import { sessions, drivers } from '$lib/server/db/schema';
import { desc, eq, getTableColumns } from 'drizzle-orm';

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


import { db } from '$lib/server/db/client';
import { sessions, lap_telemetry, tracks, laps } from '$lib/server/db/schema';
import { createTrackFromSession } from '$lib/server/tracks';
import { desc, eq, and, asc } from 'drizzle-orm';
import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	// Get recent sessions to use as a base
	const recentSessions = await db
		.select({
			id: sessions.id,
			name: sessions.name,
			date: sessions.date
		})
		.from(sessions)
		.orderBy(desc(sessions.date))
		.limit(50); // increased limit to find useful ones

	return { sessions: recentSessions };
};

export const actions: Actions = {
	create: async ({ request }) => {
		const formData = await request.formData();
		const name = formData.get('name') as string;
		const sessionId = parseInt(formData.get('sessionId') as string);
		const finishLineIndex = parseInt(formData.get('finishLineIndex') as string);

		if (!name || !sessionId) {
			return fail(400, { error: 'Missing required fields' });
		}

		try {
			// Fetch session data to generate track
			// Strategy: Use the fastest valid lap for the best GPS reliability.
			// If no valid laps, use the longest lap (most data points) or just the first non-empty one.

			const sessionLaps = await db
				.select()
				.from(laps)
				.where(eq(laps.sessionId, sessionId))
				.orderBy(asc(laps.timeSeconds));

			const bestLap = sessionLaps.find((l) => l.valid) || sessionLaps[0];

			if (!bestLap) {
				return fail(400, { error: 'Session has no laps' });
			}

			const telemetryRecord = await db
				.select()
				.from(lap_telemetry)
				.where(
					and(
						eq(lap_telemetry.sessionId, sessionId),
						eq(lap_telemetry.lapNumber, bestLap.lapNumber)
					)
				);
			// Postgres returns array.

			const t = telemetryRecord[0];

			if (!t || !t.lat || !t.long) {
				return fail(400, { error: 'Selected lap has no GPS data' });
			}

			const gpsData = {
				lat: t.lat as number[],
				long: t.long as number[]
			};

			// Use provided finish line index or default to 0
			const idx = isNaN(finishLineIndex) ? 0 : finishLineIndex;

			await createTrackFromSession(name, gpsData, idx);

			return redirect(303, '/tracks');
		} catch (e: any) {
			if (e?.status === 303 || e?.location) {
				throw e;
			}
			console.error(e);
			return fail(500, { error: 'Failed to create track' });
		}
	}
};

import { error } from '@sveltejs/kit';
import { db } from '$lib/server/db/client';
import { share_links, sessions, laps, lap_telemetry, drivers, tracks } from '$lib/server/db/schema';
import { eq, asc } from 'drizzle-orm';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const { token } = params;

	const link = await db.query.share_links.findFirst({
		where: eq(share_links.id, token)
	});

	if (!link) {
		throw error(404, 'Link not found');
	}

	if (link.expiresAt && Math.floor(Date.now() / 1000) > link.expiresAt) {
		throw error(410, 'Link expired');
	}

	const session = await db.query.sessions.findFirst({
		where: eq(sessions.id, link.sessionId)
	});

	if (!session) {
		throw error(404, 'Session not found');
	}

	// Fetch driver separately if needed
	const driver = session.driverId
		? await db.query.drivers.findFirst({ where: eq(drivers.id, session.driverId) })
		: null;

	// Filter data based on config
	const showTelemetry = link.config.showTelemetry;
	const showVideo = link.config.showVideo;
	const showAi = link.config.showAi;

	const sessionLaps = await db.select().from(laps).where(eq(laps.sessionId, session.id)).orderBy(asc(laps.lapNumber));

	// Fetch track data for the map

	const trackData = await db.query.tracks.findFirst({
		where: eq(tracks.name, session.track)
	});

	// Augment session with track path data
	const sessionWithTrack = {
		...session,
		trackPathData: trackData?.pathData || null
	};

	// Load telemetry data if needed (for both chart display and AI analysis)
	let lapsWithTelemetry = sessionLaps;

	if (showTelemetry || showAi) {
		const telemetryData = await db.select().from(lap_telemetry).where(eq(lap_telemetry.sessionId, session.id));

		console.log('[Share Page] Loading telemetry for session', session.id);
		console.log('[Share Page] Found', telemetryData.length, 'telemetry records');
		console.log('[Share Page] Permissions:', { showTelemetry, showVideo, showAi });

		// Map telemetry to laps (same logic as regular session page)
		lapsWithTelemetry = sessionLaps.map(l => {
			const t = telemetryData.find(t => t.lapNumber === l.lapNumber);
			let cleanData = null;

			if (t) {
				// Reconstruct the unified object for the frontend
				cleanData = {
					time: t.time || [],
					distance: t.distance || [],
					speed: t.speed || [],
					lat: t.lat || [],
					long: t.long || [],
					rpm: t.rpm || [],
					throttle: t.throttle || [],
					brake: t.brake || [],
					gear: t.gear || [],
					steering: t.steering || []
				};
			}

			return {
				...l,
				telemetryData: cleanData,
				// Also pass the analysis field if AI is enabled
				analysis: showAi ? l.analysis : null
			};
		});

		console.log('[Share Page] Laps with telemetry:', lapsWithTelemetry.length);
		console.log('[Share Page] First lap has telemetry:', !!lapsWithTelemetry[0]?.telemetryData);
	}

	return {
		session: sessionWithTrack,
		driver,
		laps: lapsWithTelemetry,

		permissions: {
			showTelemetry,
			showVideo,
			showAi
		},
		token
	};
};

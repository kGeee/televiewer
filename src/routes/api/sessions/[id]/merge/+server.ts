import { json, type RequestHandler } from '@sveltejs/kit';
import { db } from '$lib/server/db/client';
import { laps, lap_telemetry, telemetry_sources, telemetry_channels } from '$lib/server/db/schema';
import { eq, asc, inArray } from 'drizzle-orm';
import { parseVboExport, parseBoschExport, type ParsedLap } from '$lib/server/parser';
import {
	matchLapsByDuration,
	resampleData,
	type LapMatchResult,
	findTimeOffset
} from '$lib/server/merge';

export const config = {
	bodySizeLimit: Infinity
};

/**
 * Parses the secondary file and matches its laps to the primary session
 * using per-lap duration similarity (no stitching or cross-correlation).
 */
async function parseAndMatchLaps(sessionId: number, file: File, type: string) {
	const text = await file.text();
	let secondarySession: { laps: ParsedLap[]; metadata: any };

	if (type === 'vbo') {
		secondarySession = parseVboExport(text);
	} else if (type === 'bosch') {
		secondarySession = parseBoschExport(text);
	} else {
		throw new Error('Unsupported file type');
	}

	if (secondarySession.laps.length === 0) {
		throw new Error('No laps found in secondary file');
	}

	// Fetch primary lap time arrays for matching + resampling
	const primaryLaps = await db.query.lap_telemetry.findMany({
		where: eq(lap_telemetry.sessionId, sessionId),
		orderBy: [asc(lap_telemetry.lapNumber)],
		columns: { lapNumber: true, time: true, speed: true, distance: true, id: true }
	});

	if (primaryLaps.length === 0) {
		throw new Error('Primary session has no telemetry to align against.');
	}

	// Build duration arrays
	const primaryDurations = primaryLaps.map((l) => ({
		lapNumber: l.lapNumber,
		duration: l.time && l.time.length > 0 ? l.time[l.time.length - 1] : 0
	}));

	const secondaryDurations = secondarySession.laps.map((l) => ({
		lapNumber: l.lapNumber,
		duration: l.telemetry.time.length > 0 ? l.telemetry.time[l.telemetry.time.length - 1] : 0
	}));

	console.log('[Merge] Primary laps:', primaryDurations);
	console.log('[Merge] Secondary laps:', secondaryDurations);

	// Match laps by duration similarity
	let matchResult = matchLapsByDuration(primaryDurations, secondaryDurations);

	// Fallback: no laps matched (common for Bosch/VBO when lap markers are absent).
	// Use cross-correlation and (if available) laptime-based virtual laps.
	let globalOffsetSeconds = 0;
	const perLapOffsets = new Map<number, number>();
	if (matchResult.matches.length === 0) {
		const deriveSpeed = (time: number[] | null | undefined, dist: number[] | null | undefined) => {
			if (!time || !dist || time.length < 2 || dist.length !== time.length) return [] as number[];
			const out: number[] = new Array(time.length);
			out[0] = 0;
			for (let i = 1; i < time.length; i++) {
				const dt = time[i] - time[i - 1];
				const dd = dist[i] - dist[i - 1];
				out[i] = dt > 0 ? (dd / dt) * 3.6 : out[i - 1];
			}
			return out;
		};

		const primaryLap = primaryLaps.find((l) => l.time && l.time.length > 0);
		const secondaryLap = secondarySession.laps.find(
			(l) => l.telemetry?.time?.length > 0 && l.telemetry?.speed?.length > 0
		);

		if (primaryLap && secondaryLap) {
			// Build virtual laps from laptime (drop negatives, split on resets)
			// Build virtual laps from laptime (drop negatives, split on resets)
			const virtualSecondaryLaps: ParsedLap[] | null = (() => {
				const lt = secondaryLap.telemetry['laptime'] as number[] | undefined;
				const t = secondaryLap.telemetry.time;
				if (!lt || lt.length !== t.length) return null;
				const segments: { start: number; end: number; duration: number }[] = [];
				let start = 0;
				for (let i = 1; i < lt.length; i++) {
					const drop = lt[i] < lt[i - 1] - 1 || lt[i] < 0;
					if (drop) {
						const duration = lt[i - 1] > 0 ? lt[i - 1] : t[i - 1] - t[start];
						segments.push({ start, end: i - 1, duration });
						start = i;
					}
				}
				const lastDuration = lt[lt.length - 1] > 0 ? lt[lt.length - 1] : t[t.length - 1] - t[start];
				segments.push({ start, end: lt.length - 1, duration: lastDuration });

				// Get all channel keys
				const channels = Object.keys(secondaryLap.telemetry);

				return segments
					.filter((s) => s.duration > 0)
					.map((s, idx) => {
						const newTelemetry: Record<string, number[]> = {};
						channels.forEach(ch => {
							if (secondaryLap.telemetry[ch]) {
								newTelemetry[ch] = secondaryLap.telemetry[ch].slice(s.start, s.end + 1);
							}
						});
						// Re-zero time
						const startT = t[s.start];
						newTelemetry.time = newTelemetry.time.map(v => v - startT);

						return {
							lapNumber: idx + 1,
							telemetry: newTelemetry,
							timeSeconds: s.duration,
							// Ensure strict ParsedLap compliance
							time: s.duration
						} as unknown as ParsedLap;
					});
			})();

			const derived = !(primaryLap.speed && primaryLap.speed.length > 0);
			const primarySpeed = derived
				? deriveSpeed(primaryLap.time, primaryLap.distance)
				: primaryLap.speed || [];
			const primaryTime = primaryLap.time!;
			const secondarySpeed = secondaryLap.telemetry.speed;
			const secondaryTime = secondaryLap.telemetry.time;

			if (
				secondarySession.laps.length === 1 &&
				virtualSecondaryLaps &&
				virtualSecondaryLaps.length > 0
			) {
				const virtualDurations = virtualSecondaryLaps.map((v) => ({
					lapNumber: v.lapNumber,
					duration: v.telemetry.time.length > 0 ? v.telemetry.time[v.telemetry.time.length - 1] : 0
				}));
				matchResult = matchLapsByDuration(primaryDurations, virtualDurations, 5);
				const dt = 0.2;
				for (const m of matchResult.matches) {
					const p = primaryLaps[m.primaryLapIndex];
					const v = virtualSecondaryLaps[m.secondaryLapIndex];
					const pSpeed = p.speed && p.speed.length > 0 ? p.speed : deriveSpeed(p.time, p.distance);
					const pBase = Array.from(
						{ length: Math.max(1, Math.floor((p.time?.[p.time.length - 1] || 0) / dt)) },
						(_, i) => i * dt
					);
					const vBase = Array.from(
						{ length: Math.max(1, Math.floor((v.telemetry.time[v.telemetry.time.length - 1] || 0) / dt)) },
						(_, i) => i * dt
					);
					const pRes = resampleData(p.time || [], pSpeed, pBase);
					const vRes = resampleData(v.telemetry.time, v.telemetry.speed!, vBase);
					const lapOffset = findTimeOffset(pRes, vRes, 1 / dt, v.telemetry.time[v.telemetry.time.length - 1] || 0, 30);
					perLapOffsets.set(m.primaryLapNumber, lapOffset);
					console.log('[Merge] Per-lap offset (virtual)', m.primaryLapNumber, lapOffset.toFixed(3));
				}
				// IMPORTANT: Use the virtual laps as the actual session laps for downstream merge
				secondarySession.laps = virtualSecondaryLaps;
			} else {
				// Build common time base (0.1s) over the overlapping duration window.
				const overlapDuration = Math.min(
					primaryTime[primaryTime.length - 1],
					secondaryTime[secondaryTime.length - 1]
				);
				const dt = 0.1;
				const commonTime = Array.from(
					{ length: Math.floor(overlapDuration / dt) },
					(_, i) => i * dt
				);
				console.log(
					'[Merge] Fallback overlapDuration',
					overlapDuration.toFixed(2),
					'common points',
					commonTime.length,
					'primary len',
					primarySpeed.length,
					'secondary len',
					secondarySpeed.length,
					'derivedSpeed',
					derived
				);

				if (commonTime.length > 50) {
					const primaryResampled = resampleData(primaryTime, primarySpeed, commonTime);
					const secondaryResampled = resampleData(secondaryTime, secondarySpeed, commonTime);
					globalOffsetSeconds = findTimeOffset(primaryResampled, secondaryResampled, 10, 1200, 50);
					console.log('[Merge] Fallback cross-corr offset', globalOffsetSeconds.toFixed(3));

					// Force matches so downstream merge proceeds. If secondary only has one long lap, match all primary laps to it.
					if (secondarySession.laps.length === 1 && primaryLaps.length > 1 && secondaryLap) {
						matchResult = {
							matches: primaryLaps.map((p, idx) => ({
								primaryLapIndex: idx,
								secondaryLapIndex: 0,
								primaryLapNumber: p.lapNumber,
								secondaryLapNumber: secondaryLap.lapNumber,
								primaryDuration: p.time && p.time.length > 0 ? p.time[p.time.length - 1] : 0,
								secondaryDuration: secondaryTime[secondaryTime.length - 1],
								durationDiff: Math.abs(
									(p.time && p.time.length > 0 ? p.time[p.time.length - 1] : 0) -
									secondaryTime[secondaryTime.length - 1]
								)
							})),
							unmatchedPrimaryIndices: [],
							unmatchedSecondaryIndices: [],
							shift: 0
						};
					} else {
						matchResult = {
							matches: [
								{
									primaryLapIndex: 0,
									secondaryLapIndex: 0,
									primaryLapNumber: primaryLap.lapNumber,
									secondaryLapNumber: secondaryLap.lapNumber,
									primaryDuration: primaryTime[primaryTime.length - 1],
									secondaryDuration: secondaryTime[secondaryTime.length - 1],
									durationDiff: Math.abs(
										primaryTime[primaryTime.length - 1] - secondaryTime[secondaryTime.length - 1]
									)
								}
							],
							unmatchedPrimaryIndices: [],
							unmatchedSecondaryIndices: [],
							shift: 0
						};
					}
				} else {
					console.warn('[Merge] Fallback skipped: insufficient overlap points', commonTime.length);
				}
			}
		}
	}

	console.log(
		`[Merge] Lap matching: ${matchResult.matches.length} matched, shift=${matchResult.shift}`
	);
	for (const m of matchResult.matches) {
		console.log(
			`  P${m.primaryLapNumber} (${m.primaryDuration.toFixed(1)}s) <-> S${m.secondaryLapNumber} (${m.secondaryDuration.toFixed(1)}s) diff=${m.durationDiff.toFixed(3)}s`
		);
	}

	// Discover all channels from secondary (excluding time/distance which are structural)
	if (secondarySession.laps.length === 0) {
		throw new Error('No laps found in secondary file');
	}
	const allChannels = Object.keys(secondarySession.laps[0].telemetry).filter(
		(k) => k !== 'time' && k !== 'distance'
	);

	// Extract units from parser metadata (Bosch parser provides these)
	const units: Record<string, string> = secondarySession.metadata?.units || {};

	// Compute sample counts per channel for preview
	const sampleCounts: Record<string, number> = {};
	for (const ch of allChannels) {
		sampleCounts[ch] = secondarySession.laps.reduce(
			(sum, l) => sum + (l.telemetry[ch]?.length || 0),
			0
		);
	}

	return {
		secondarySession,
		primaryLaps,
		matchResult,
		allChannels,
		units,
		sampleCounts,
		totalPrimaryLaps: primaryLaps.length,
		globalOffsetSeconds
	};
}

export const POST: RequestHandler = async ({ request, params }) => {
	const sessionId = parseInt(params.id!);
	if (isNaN(sessionId)) return json({ error: 'Invalid Session ID' }, { status: 400 });

	try {
		const formData = await request.formData();
		const file = formData.get('file') as File;
		const type = formData.get('type') as string; // 'vbo' | 'bosch'
		const action = (formData.get('action') as string) || 'merge';

		if (!file || !type) {
			return json({ error: 'Missing file or type' }, { status: 400 });
		}

		console.log(`[API] Merge ${action} for Session ${sessionId} with ${type} file: ${file.name}`);

		const result = await parseAndMatchLaps(sessionId, file, type);

		// ── Preview Mode: return matched laps and available channels ──
		if (action === 'preview') {
			return json({
				channels: result.allChannels,
				units: result.units,
				sampleCounts: result.sampleCounts,
				lapsWithCoverage: result.matchResult.matches.length,
				totalLaps: result.totalPrimaryLaps,
				matchedLaps: result.matchResult.matches.map((m) => ({
					primaryLap: m.primaryLapNumber,
					secondaryLap: m.secondaryLapNumber,
					primaryDuration: m.primaryDuration,
					secondaryDuration: m.secondaryDuration,
					durationDiff: m.durationDiff
				})),
				unmatchedPrimaryLaps: result.matchResult.unmatchedPrimaryIndices
					.map((i) => result.primaryLaps[i]?.lapNumber)
					.filter((n): n is number => n !== undefined),
				unmatchedSecondaryLaps: result.matchResult.unmatchedSecondaryIndices
					.map((i) => result.secondarySession.laps[i]?.lapNumber)
					.filter((n): n is number => n !== undefined),
				shift: result.matchResult.shift
			});
		}

		// ── Merge Mode: import selected channels via per-lap resampling ──
		const channelsParam = formData.get('channels') as string | null;
		const selectedChannels: string[] = channelsParam
			? JSON.parse(channelsParam)
			: result.allChannels;

		const validChannels = selectedChannels.filter((ch) => result.allChannels.includes(ch));
		if (validChannels.length === 0) {
			return json({ error: 'No valid channels selected' }, { status: 400 });
		}

		console.log(
			`[Merge] Importing ${validChannels.length}/${result.allChannels.length} channels: ${validChannels.join(', ')}`
		);

		// Create source record
		const [sourceRes] = await db
			.insert(telemetry_sources)
			.values({
				sessionId,
				type,
				filename: file.name,
				timeOffset: result.globalOffsetSeconds
			})
			.returning();

		// Look up lap IDs
		const lapRows = await db.query.laps.findMany({
			where: eq(laps.sessionId, sessionId),
			columns: { id: true, lapNumber: true }
		});
		const lapIdByNumber = new Map(lapRows.map((l) => [l.lapNumber, l.id]));

		const channelsToInsert: {
			sourceId: number;
			lapId: number;
			name: string;
			unit: string | null;
			data: number[];
		}[] = [];

		for (const match of result.matchResult.matches) {
			const primaryLap = result.primaryLaps[match.primaryLapIndex]; // Assuming primaryLap is valid as checked earlier
			// Safety check for secondary lap index
			const secondaryLap = result.secondarySession.laps[match.secondaryLapIndex];
			if (!secondaryLap) {
				console.warn(`[Merge] Invalid secondary lap index ${match.secondaryLapIndex} (total ${result.secondarySession.laps.length}). Skipping match.`);
				continue;
			}

			const primaryTime = primaryLap.time || [];

			if (primaryTime.length === 0) continue;

			const lapId = lapIdByNumber.get(primaryLap.lapNumber);
			if (!lapId) continue;

			const secondaryTime = secondaryLap.telemetry.time.map((t) => t - result.globalOffsetSeconds);
			if (secondaryTime.length === 0) continue;

			// Resample each selected channel from secondary time base to primary time base
			// Both time arrays start at 0 — direct per-lap alignment
			for (const key of validChannels) {
				const sourceData = secondaryLap.telemetry[key];
				if (!sourceData || sourceData.length === 0) continue;

				const resampled = resampleData(secondaryTime, sourceData, primaryTime);
				channelsToInsert.push({
					sourceId: sourceRes.id,
					lapId,
					name: key,
					unit: result.units[key] || null,
					data: resampled
				});
			}
		}

		const lapsWithCoverage = result.matchResult.matches.length;
		console.log(
			`[Merge] Resampled ${validChannels.length} channels across ${lapsWithCoverage}/${result.totalPrimaryLaps} laps`
		);

		// Batch insert channels
		if (channelsToInsert.length > 0) {
			const BATCH_SIZE = 50;
			await db.transaction(async (tx) => {
				for (let i = 0; i < channelsToInsert.length; i += BATCH_SIZE) {
					await tx.insert(telemetry_channels).values(channelsToInsert.slice(i, i + BATCH_SIZE));
				}
			});
		}

		console.log(`[Merge] Inserted ${channelsToInsert.length} channel rows. Done.`);
		return json({
			success: true,
			channels: validChannels,
			lapsWithCoverage,
			totalChannelRows: channelsToInsert.length,
			matchedLaps: lapsWithCoverage,
			shift: result.matchResult.shift
		});
	} catch (e: any) {
		console.error('[API] Merge Error:', e);
		return json({ error: e.message }, { status: 500 });
	}
};

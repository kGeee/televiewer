import { parseBoschExport, parseVboExport } from '$lib/analysis/parser';
import { lttb } from '$lib/analysis/sampling';
import { splitTelemetryIntoLaps, extractLapTelemetry } from '$lib/analysis/geo';

// Session Cache: Map<id, fullParsedResult>
const sessionCache = new Map<string, any>();

self.onmessage = async (e: MessageEvent) => {
    const { action, id, file, text, type, config } = e.data;

    try {
        if (action === 'parse' || !action) { // Default to parse if no action for backward compat
            // ... (keep existing parse logic unchanged)
            console.log(`[Worker] Starting parse for ${file.name} (${(text.length / 1024 / 1024).toFixed(2)} MB)`);
            const startTime = performance.now();

            let result;
            if (file.name.toLowerCase().endsWith('.vbo')) {
                result = parseVboExport(text);
            } else {
                result = parseBoschExport(text);
            }

            const { metadata, laps } = result;
            const parseTime = performance.now() - startTime;
            console.log(`[Worker] Parse complete in ${parseTime.toFixed(0)}ms. Found ${laps.length} laps.`);

            // Cache the result using the provided ID or generic one
            if (id) {
                sessionCache.set(id, result);
                console.log(`[Worker] Cached session data for ID: ${id}`);
            }

            // 1. Identify Reference Lap (Fastest Valid)
            let referenceLap = null;

            // Basic validity check (30s - 600s)
            const validLaps = laps.filter(l => l.time > 30 && l.time < 600);

            if (validLaps.length > 0) {
                // Sort by time
                validLaps.sort((a, b) => a.time - b.time);
                referenceLap = validLaps[0];
            } else if (laps.length > 0) {
                // Fallback to median
                referenceLap = laps[Math.floor(laps.length / 2)];
            }

            // 2. Downsample for Preview (GPS Visualizer)
            let processedGps = null;
            if (referenceLap && referenceLap.telemetry.lat && referenceLap.telemetry.long) {
                const rawPoints = referenceLap.telemetry.lat.map((lat, i) => ({
                    x: i, // Index as X for maintaining order
                    y: lat,
                    originalIndex: i, // Keep track of original index
                    lng: referenceLap.telemetry.long![i]
                }));

                // Downsample to ~2000 points
                const downsampled = lttb(rawPoints, 2000);

                processedGps = {
                    lat: downsampled.map(p => p.y),
                    long: downsampled.map(p => p.lng),
                    sourceLap: referenceLap.lapNumber,
                };
                console.log(`[Worker] Downsampled GPS from ${rawPoints.length} to ${downsampled.length} points.`);
            }

            // 3. Prepare Stats
            const times = laps.map(l => l.time).filter(t => t > 0);
            const fastest = Math.min(...times);

            const preview = {
                metadata,
                stats: {
                    lapCount: laps.length,
                    fastestLap: fastest === Infinity ? 0 : fastest,
                    driver: (metadata as any).driver || 'Unknown'
                },
                gpsData: processedGps,
                laps: laps.map(l => ({
                    lapNumber: l.lapNumber,
                    time: l.time,
                    valid: l.time > 30 && l.time < 600 && l.time < (fastest * 1.5) // Quick heuristic
                }))
            };

            self.postMessage({
                type: 'success',
                fileName: file.name,
                id, // Echo back ID
                preview,
                // full: result -- optimization: do not send full data to main thread
            });

        } else if (action === 'recalculate') {
            console.log(`[Worker] Recalculating laps for ID: ${id}`);

            const sessionData = sessionCache.get(id);
            if (!sessionData) {
                throw new Error(`Session data not found in worker cache for ID: ${id}`);
            }

            if (!sessionData.laps || sessionData.laps.length === 0) {
                console.warn('[Worker] No laps to recalculate');
                return;
            }

            // 1. Reconstruct Full Telemetry (Continuous)
            const fullTelemetry: any = {
                time: [] as number[],
                // Init other arrays dynamically
            };

            const firstLapTelemetry = sessionData.laps[0].telemetry;
            const keys = Object.keys(firstLapTelemetry);
            keys.forEach(k => fullTelemetry[k] = []);

            let timeOffset = 0;
            // Iterate original laps from parser
            for (const lap of sessionData.laps) {
                const lapTime = lap.telemetry.time;
                if (!lapTime || lapTime.length === 0) continue;

                // Add offset to time to make it monotonic
                for (let i = 0; i < lapTime.length; i++) {
                    fullTelemetry.time.push(lapTime[i] + timeOffset);
                }

                // Push other keys
                for (const k of keys) {
                    if (k === 'time') continue;
                    if (lap.telemetry[k]) {
                        fullTelemetry[k].push(...lap.telemetry[k]);
                    }
                }

                // Advance offset
                // Use the last time sample of the current lap as the base for the next
                // But generally parser normalized time starts at 0.
                timeOffset += lapTime[lapTime.length - 1];
            }

            // 2. Fix Inverted Longitude
            // Check based on config finish line
            if (config.finishLine) {
                const sampleLng = fullTelemetry.long[Math.floor(fullTelemetry.long.length / 2)];
                const targetLng = config.finishLine.lng;

                // Heuristic: Logic from server/tracks.ts
                if (targetLng < 0 && sampleLng > 0 && Math.abs(targetLng - sampleLng) > 100) {
                    console.warn('[Worker] Detected inverted longitude. Correcting...');
                    fullTelemetry.long = fullTelemetry.long.map((l: number) => -Math.abs(l));
                }
            }

            const detectedLaps = splitTelemetryIntoLaps(fullTelemetry, config);

            // 3. Update Cache with New Laps
            // We use extractLapTelemetry to slice the fullTelemetry back into lap objects
            const newParsedLaps = detectedLaps.map(d => {
                const lapData = extractLapTelemetry(fullTelemetry, d.startIdx, d.endIdx);
                return {
                    lapNumber: d.lapNumber,
                    time: d.timeSeconds,
                    telemetry: lapData
                };
            });

            // Update the cache so subsequent uploads use the new logic
            sessionData.laps = newParsedLaps;

            const newLapsList = newParsedLaps.map(l => ({
                lapNumber: l.lapNumber,
                time: l.time,
                valid: l.time > 20 && l.time < 600,
                s1: (detectedLaps.find(d => d.lapNumber === l.lapNumber) as any)?.s1,
                s2: (detectedLaps.find(d => d.lapNumber === l.lapNumber) as any)?.s2,
                s3: (detectedLaps.find(d => d.lapNumber === l.lapNumber) as any)?.s3
            }));

            self.postMessage({
                type: 'recalculateSuccess',
                id,
                laps: newLapsList
            });


        } else if (action === 'prepareUpload') {
            const { driverId, trackConfig } = e.data;
            console.log(`[Worker] Preparing upload for ID: ${id}`);

            const sessionData = sessionCache.get(id);
            if (!sessionData) {
                throw new Error(`Session data not found in worker cache for ID: ${id}`);
            }

            // Construct the payload
            const payload = {
                sessionData,
                driverId,
                trackConfig
            };

            // Create Blob
            console.log('[Worker] Stringifying payload...');
            const jsonString = JSON.stringify(payload);
            console.log(`[Worker] Payload string length: ${jsonString.length}`);

            console.log('[Worker] Creating Blob...');
            const blob = new Blob([jsonString], { type: 'application/json' });

            console.log(`[Worker] Created Blob of size ${(blob.size / 1024 / 1024).toFixed(2)} MB. Posting message...`);

            self.postMessage({
                type: 'uploadReady',
                id,
                blob
            });
            console.log('[Worker] Message posted.');
        }

    } catch (err: any) {
        console.error('[Worker] Error:', err);
        self.postMessage({
            type: 'error',
            fileName: file?.name || 'Unknown',
            error: err.message
        });
    }
};

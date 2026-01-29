
export interface ParsedSession {
    metadata: {
        track: string;
        type: string;
        date: string;
        columns?: string[]; // Raw columns for debugging
        channelMapping?: Record<string, string>; // Mapped columns
    };
    laps: ParsedLap[];
}

export interface ParsedLap {
    lapNumber: number;
    time: number; // total lap time
    telemetry: {
        [key: string]: number[] | undefined;
        time: number[];
        distance: number[];
        speed: number[];
        rpm: number[];
        throttle: number[];
        brake: number[];
        gear: number[];
        steering: number[];
        lat?: number[];
        long?: number[];
    };
}

export function parseBoschExport(content: string): ParsedSession {
    // PERFORMANCE: Pre-allocate and process more efficiently
    const lines = content.split('\n');
    const metadata = { track: 'Unknown', type: 'Unknown', date: new Date().toISOString() };
    let headerFound = false;
    let headers: string[] = [];

    console.log('[Parser] Bosch export - total lines:', lines.length);

    // Early validation
    if (lines.length === 0) {
        console.warn('[Parser] Bosch export - empty file');
        return { metadata, laps: [] };
    }

    // We will build up a dynamic object. 
    // We must ensure it has the required fields to satisfy ParsedLap['telemetry'] eventually.
    const currentLapTelemetry: Record<string, number[]> = {
        time: [],
        distance: [],
        speed: [],
        rpm: [],
        throttle: [],
        brake: [],
        gear: [],
        steering: [],
        lat: [],
        long: []
    };

    const laps: ParsedLap[] = [];
    let currentLapNum = 1;
    let lastLapTime = 0;

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        // 1. Metadata Parsing
        if (trimmed.startsWith('#')) {
            if (trimmed.includes('Source file')) {
                const match = /datafiles\\\d+\\(.+?)\\(.+?)\\/i.exec(trimmed);
                if (match) {
                    metadata.track = match[1];
                    metadata.type = match[2];
                }
                const dateMatch = /_(\d{8})_/.exec(trimmed);
                if (dateMatch) {
                    const d = dateMatch[1];
                    metadata.date = `${d.substring(0, 4)}-${d.substring(4, 6)}-${d.substring(6, 8)}`;
                }
            }
            continue;
        }

        // 2. Header Parsing
        if (!headerFound) {
            if (trimmed.startsWith('xtime')) {
                headers = trimmed.split(/\s+/).filter(h => !h.startsWith('[') && !h.endsWith(']'));
                headerFound = true;

                // Initialize extra arrays for unmapped headers
                headers.forEach(h => {
                    const key = h.toLowerCase();
                    if (!currentLapTelemetry[key]) {
                        currentLapTelemetry[key] = [];
                    }
                });
            }
            continue;
        }

        // 3. Data Parsing
        const values = trimmed.split(/\s+/);
        if (values.length < headers.length) continue;

        const getVal = (name: string) => {
            const idx = headers.findIndex(h => h.startsWith(name));
            return idx !== -1 ? parseFloat(values[idx]) : 0;
        };

        const laptime = getVal('laptime');

        if (laptime < lastLapTime - 1.0 && lastLapTime > 10) {
            // PERFORMANCE: Use Object spread instead of JSON parse/stringify
            const lapData: ParsedLap['telemetry'] = {} as any;
            for (const key in currentLapTelemetry) {
                lapData[key] = [...currentLapTelemetry[key]];
            }
            laps.push({
                lapNumber: currentLapNum,
                time: lastLapTime,
                telemetry: lapData
            });
            currentLapNum++;
            // Clear arrays efficiently
            for (const key in currentLapTelemetry) {
                currentLapTelemetry[key].length = 0;
            }
        }
        lastLapTime = laptime;

        // Push Standard Data
        currentLapTelemetry.time.push(laptime);
        currentLapTelemetry.distance.push(getVal('xdist'));
        currentLapTelemetry.speed.push(getVal('speed'));
        currentLapTelemetry.rpm.push(getVal('nmot'));
        currentLapTelemetry.throttle.push(getVal('aps'));
        currentLapTelemetry.brake.push(getVal('pbrake_f'));
        currentLapTelemetry.gear.push(getVal('gear'));
        currentLapTelemetry.steering.push(getVal('SteeringAngle'));

        // Push All Raw Data
        headers.forEach((h, idx) => {
            const key = h.toLowerCase();
            const val = parseFloat(values[idx]);
            if (currentLapTelemetry[key]) {
                currentLapTelemetry[key].push(isNaN(val) ? 0 : val);
            }
        });
    }

    if (currentLapTelemetry.time.length > 0) {
        const lapData: ParsedLap['telemetry'] = {} as any;
        for (const key in currentLapTelemetry) {
            lapData[key] = [...currentLapTelemetry[key]];
        }
        laps.push({
            lapNumber: currentLapNum,
            time: lastLapTime,
            telemetry: lapData
        });
    }

    console.log('[Parser] Bosch export complete - laps:', laps.length);
    if (laps.length > 0) {
        const firstLap = laps[0];
        console.log('[Parser] First lap telemetry keys:', Object.keys(firstLap.telemetry));
        console.log('[Parser] GPS data - lat:', firstLap.telemetry.lat?.length, 'long:', firstLap.telemetry.long?.length);
    }

    return { metadata: { ...metadata, columns: headers }, laps };
}

export function parseVboExport(content: string): ParsedSession {
    const lines = content.split('\n');
    const metadata = { track: 'Unknown (VBOX)', type: 'Log', date: new Date().toISOString() };

    console.log('[Parser] VBOX export - total lines:', lines.length);

    let section = '';
    let columns: string[] = [];
    const dataRows: number[][] = [];

    let inLapTiming = false;
    let startLine: { p1: { lat: number, long: number }, p2: { lat: number, long: number } } | null = null;

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        if (trimmed.startsWith('[')) {
            section = trimmed.toLowerCase();
            inLapTiming = (section === '[laptiming]');
            continue;
        }

        if (section === '[column names]') {
            const cols = trimmed.split(/\s+/);
            columns.push(...cols);
        } else if (section === '[header]') {
            const dateMatch = /File created on\s+(\d{2}\/\d{2}\/\d{4})/.exec(trimmed);
            if (dateMatch) {
                const [d, m, y] = dateMatch[1].split('/');
                metadata.date = `${y}-${m}-${d}`;
            }
        } else if (section === '[data]') {
            const values = trimmed.split(/\s+/).map(v => parseFloat(v));
            if (values.length >= columns.length) {
                dataRows.push(values);
            }
        } else if (inLapTiming && trimmed.startsWith('Start')) {
            const parts = trimmed.replace('Start', '').trim().split(/\s+/).map(parseFloat);
            if (parts.length >= 4) {
                startLine = {
                    p1: { lat: parts[1], long: parts[0] },
                    p2: { lat: parts[3], long: parts[2] }
                };
            }
        }
    }

    const lowerCols = columns.map(c => c.toLowerCase());
    const findCol = (candidates: string[]) => lowerCols.findIndex(c => candidates.includes(c));

    const colMap = {
        time: findCol(['time', 't']),
        lat: findCol(['lat', 'latitude', 'poslat']),
        long: findCol(['long', 'lng', 'longitude', 'poslong']),
        velocity: findCol(['velocity', 'speed', 'gps_speed', 'v', 'gpsspeed']),
        rpm: findCol(['rpm', 'engine_speed', 'enginespeed', 'revs', 'nmot', 'engine_rpm', 'enginespd', 'eng_spd', 'enspd', 'ecurpm', 'engine', 'nengine']),
        throttle: findCol(['throttle', 'throttle_position', 'throttleposition', 'pedal_position', 'pedalposition', 'pps', 'aps', 'accel_pedal', 'accelerator', 'thrpos', 'tp', 'thr', 'pedal', 'acc', 'accel', 'racceleratorpedal']),
        brake: findCol(['brake', 'brake_position', 'brakeposition', 'brake_pressure', 'brakepressure', 'bpres', 'b_pres', 'b_pressure', 'pbrake_f', 'pbrake', 'brkpos', 'bp', 'brk', 'brakepress']),
        steer: findCol(['steer', 'steering', 'steer_angle', 'steerangle', 'steering_angle', 'steeringangle', 'swa', 'handwheel_angle', 'wheel_angle', 'sw_angle', 'sa', 'str', 'steer_ang']),
        lap: findCol(['lap-number', 'lap_number', 'lap']),
        gear: findCol(['gear', 'current_gear', 'selected_gear', 'gear_no', 'ngear']),
        avitime: findCol(['avitime', 'avi_time', 'video_time', 'videotime', 'synctime', 'avisynctime'])
    };

    // Track used columns to avoid duplication (strictly for extra columns logic)
    const usedIndices = new Set<number>();
    if (colMap.velocity !== -1) usedIndices.add(colMap.velocity);
    if (colMap.rpm !== -1) usedIndices.add(colMap.rpm);
    if (colMap.throttle !== -1) usedIndices.add(colMap.throttle);
    if (colMap.brake !== -1) usedIndices.add(colMap.brake);
    if (colMap.steer !== -1) usedIndices.add(colMap.steer);

    // Crucial: Add keys that are explicitly handled to usedIndices to prevent double-pushing
    // (once as parsed data, and again as "extra" raw data if the column name matches).
    if (colMap.lat !== -1) usedIndices.add(colMap.lat);
    if (colMap.long !== -1) usedIndices.add(colMap.long);
    if (colMap.time !== -1) usedIndices.add(colMap.time);
    if (colMap.gear !== -1) usedIndices.add(colMap.gear);
    if (colMap.avitime !== -1) usedIndices.add(colMap.avitime);

    // Auto-Trim (Dead Data)
    let startIndex = 0;
    let endIndex = dataRows.length - 1;
    if (colMap.velocity !== -1) {
        for (let i = 0; i < dataRows.length; i++) {
            if (dataRows[i][colMap.velocity] > 10.0) { startIndex = Math.max(0, i - 20); break; }
        }
        for (let i = dataRows.length - 1; i >= 0; i--) {
            if (dataRows[i][colMap.velocity] > 10.0) { endIndex = Math.min(dataRows.length - 1, i + 20); break; }
        }
    }
    const activeRows = dataRows.slice(startIndex, endIndex + 1);

    // Identify Extra Columns to capture
    const extraColumnIndices: number[] = [];
    columns.forEach((_, idx) => {
        // If not mapped to a primary control channel, add it.
        // Or actually, just add everything that isn't strictly one of our standard keys being populated cleanly?
        // Let's just add everything that isn't marked used.
        if (!usedIndices.has(idx)) {
            extraColumnIndices.push(idx);
        }
    });

    const laps: ParsedLap[] = [];
    const currentLapData: Record<string, number[]> = {
        time: [], distance: [], speed: [], rpm: [],
        throttle: [], brake: [], gear: [], steering: [],
        lat: [], long: [], avitime: []
    };

    // Init extra columns arrays
    extraColumnIndices.forEach(idx => {
        currentLapData[columns[idx].toLowerCase()] = [];
    });

    let lastLapNum = 1;
    let prevDistance = 0;
    const initialTimeSeconds = colMap.time !== -1 && activeRows.length > 0 ? parseVboxTime(activeRows[0][colMap.time]) : 0;
    const useGeometricSplitting = (colMap.lap === -1) && !!startLine;

    // Helpers
    function parseVboxTime(t: number) {
        if (t > 2400) {
            const hh = Math.floor(t / 10000);
            const mm = Math.floor((t % 10000) / 100);
            const ss = t % 100;
            return hh * 3600 + mm * 60 + ss;
        }
        return t;
    }

    function parseCoord(v: number, isLat: boolean = false): number | null {
        if (!v || v === 0) return null;

        const abs = Math.abs(v);
        const maxValid = isLat ? 90 : 180;

        // Already in valid decimal degrees range
        if (abs <= maxValid) {
            return v;
        }

        // Value is out of range - try to convert
        let result: number | null = null;

        // First, try total minutes format (common in VBOX): value / 60
        const asMinutes = v / 60.0;
        if (Math.abs(asMinutes) <= maxValid) {
            result = asMinutes;
        } else {
            // Try DDDMM.MMMM format (degrees * 100 + minutes)
            const degrees = Math.floor(abs / 100);
            const minutes = abs % 100;

            // Valid DDDMM has minutes < 60
            if (minutes < 60) {
                const converted = (degrees + minutes / 60) * (v < 0 ? -1 : 1);
                if (Math.abs(converted) <= maxValid) {
                    result = converted;
                }
            }
        }

        if (result === null) {
            return null; // Couldn't convert to valid coordinate
        }

        // Final validation: lat must be -90 to 90, long must be -180 to 180
        const maxVal = isLat ? 90 : 180;
        if (Math.abs(result) > maxVal) {
            return null;
        }

        return result;
    }

    function segmentsIntersect(p1: any, p2: any, p3: any, p4: any) {
        const ccw = (A: any, B: any, C: any) => (C.y - A.y) * (B.x - A.x) > (B.y - A.y) * (C.x - A.x);
        return ccw(p1, p3, p4) !== ccw(p2, p3, p4) && ccw(p1, p2, p3) !== ccw(p1, p2, p4);
    }

    let invalidGpsCount = 0;
    let validGpsCount = 0;
    let firstInvalidSample: { raw: [number, number], index: number } | null = null;

    activeRows.forEach((row, i) => {
        const rawTime = colMap.time !== -1 ? row[colMap.time] : i * 0.1;
        const absTime = parseVboxTime(rawTime);
        const relTime = absTime - initialTimeSeconds;

        let isNewLap = false;
        if (colMap.lap !== -1) {
            const rowLap = row[colMap.lap];
            if (rowLap !== lastLapNum) { isNewLap = true; lastLapNum = rowLap; }
        } else if (useGeometricSplitting && startLine && i > 0) {
            const currLat = parseCoord(row[colMap.lat], true);
            const currLong = parseCoord(row[colMap.long], false);
            const prevLat = parseCoord(activeRows[i - 1][colMap.lat], true);
            const prevLong = parseCoord(activeRows[i - 1][colMap.long], false);

            // Only check for lap crossing if all GPS coordinates are valid
            if (currLat !== null && currLong !== null && prevLat !== null && prevLong !== null) {
                if (segmentsIntersect(
                    { x: prevLong, y: prevLat }, { x: currLong, y: currLat },
                    { x: startLine.p1.long, y: startLine.p1.lat }, { x: startLine.p2.long, y: startLine.p2.lat }
                )) {
                    // Min Lap Time Buffer
                    const currentDuration = currentLapData.time.length > 0 ? (currentLapData.time[currentLapData.time.length - 1] - currentLapData.time[0]) : 0;
                    if (currentDuration > 20) {
                        isNewLap = true;
                        lastLapNum++;
                    }
                }
            }
        }

        if (isNewLap) {
            if (currentLapData.time.length > 0) {
                // PERFORMANCE: Use spread instead of JSON parse/stringify
                const lapData: ParsedLap['telemetry'] = {} as any;
                for (const key in currentLapData) {
                    lapData[key] = [...currentLapData[key]];
                }
                laps.push({
                    lapNumber: laps.length + 1,
                    time: currentLapData.time[currentLapData.time.length - 1] - currentLapData.time[0],
                    telemetry: lapData
                });
            }
            // Clear arrays efficiently
            for (const key in currentLapData) {
                currentLapData[key].length = 0;
            }
        }

        const speed = colMap.velocity !== -1 ? row[colMap.velocity] : 0;
        const dt = i > 0 ? (parseVboxTime(colMap.time !== -1 ? activeRows[i][colMap.time] : 0) - parseVboxTime(colMap.time !== -1 ? activeRows[i - 1][colMap.time] : 0)) : 0.05;
        const distDelta = (speed / 3.6) * Math.max(0, dt);
        prevDistance += distDelta;

        // Parse GPS coordinates with validation
        const rawLatValue = colMap.lat !== -1 ? row[colMap.lat] : 0;
        const rawLongValue = colMap.long !== -1 ? row[colMap.long] : 0;
        const rawLat = colMap.lat !== -1 ? parseCoord(rawLatValue, true) : null;
        const rawLong = colMap.long !== -1 ? parseCoord(rawLongValue, false) : null;

        // Track GPS validity stats
        if (rawLat !== null && rawLong !== null) {
            validGpsCount++;
        } else {
            invalidGpsCount++;
            if (!firstInvalidSample) {
                firstInvalidSample = { raw: [rawLatValue, rawLongValue], index: i };
            }
        }

        // Only use GPS point if BOTH lat and long are valid
        // Use last valid point if current is invalid (interpolation for display)
        const lastValidLat = currentLapData.lat.length > 0 ? currentLapData.lat[currentLapData.lat.length - 1] : 0;
        const lastValidLong = currentLapData.long.length > 0 ? currentLapData.long[currentLapData.long.length - 1] : 0;

        const finalLat = (rawLat !== null && rawLong !== null) ? rawLat : lastValidLat;
        const finalLong = (rawLat !== null && rawLong !== null) ? rawLong : lastValidLong;

        currentLapData.time.push(relTime);
        currentLapData.distance.push(prevDistance);
        currentLapData.speed.push(speed);
        currentLapData.rpm.push(colMap.rpm !== -1 ? row[colMap.rpm] : 0);
        currentLapData.throttle.push(colMap.throttle !== -1 ? row[colMap.throttle] : 0);
        currentLapData.brake.push(colMap.brake !== -1 ? row[colMap.brake] : 0);
        currentLapData.steering.push(colMap.steer !== -1 ? row[colMap.steer] : 0);
        currentLapData.gear.push(colMap.gear !== -1 ? row[colMap.gear] : 0);
        currentLapData.lat.push(finalLat);
        currentLapData.long.push(finalLong);
        currentLapData.avitime.push(colMap.avitime !== -1 ? row[colMap.avitime] : 0);

        // Push extra columns
        extraColumnIndices.forEach(idx => {
            const key = columns[idx].toLowerCase();
            currentLapData[key].push(row[idx]);
        });
    });

    if (currentLapData.time.length > 0) {
        const lapData: ParsedLap['telemetry'] = {} as any;
        for (const key in currentLapData) {
            lapData[key] = [...currentLapData[key]];
        }
        laps.push({
            lapNumber: laps.length + 1,
            time: currentLapData.time[currentLapData.time.length - 1] - currentLapData.time[0],
            telemetry: lapData
        });
    }

    // Normalize Time
    laps.forEach(l => {
        const start = l.telemetry.time[0];
        l.telemetry.time = l.telemetry.time.map(t => t - start);

        if (l.telemetry.distance && l.telemetry.distance.length > 0) {
            const startDist = l.telemetry.distance[0];
            l.telemetry.distance = l.telemetry.distance.map(d => d - startDist);
        }
    });

    console.log('[Parser] VBOX export complete - laps:', laps.length);
    console.log(`[Parser] GPS validation: ${validGpsCount} valid, ${invalidGpsCount} invalid (${((validGpsCount / (validGpsCount + invalidGpsCount)) * 100).toFixed(1)}% valid)`);
    if (firstInvalidSample !== null) {
        const sample = firstInvalidSample;
        console.log('[Parser] First invalid GPS sample at index', sample.index, '- raw values:', sample.raw);
    }
    if (laps.length > 0) {
        const firstLap = laps[0];
        console.log('[Parser] First lap telemetry keys:', Object.keys(firstLap.telemetry));
        console.log('[Parser] GPS data - lat:', firstLap.telemetry.lat?.length, 'long:', firstLap.telemetry.long?.length);
        console.log('[Parser] First 10 GPS points:', firstLap.telemetry.lat?.slice(0, 10), firstLap.telemetry.long?.slice(0, 10));

        // Count unique GPS values to see if interpolation is working
        if (firstLap.telemetry.lat && firstLap.telemetry.long) {
            const uniqueLats = new Set(firstLap.telemetry.lat);
            const uniqueLongs = new Set(firstLap.telemetry.long);
            console.log('[Parser] GPS stats - unique lat:', uniqueLats.size, 'unique long:', uniqueLongs.size);

            // Check for any remaining invalid values
            const invalidLats = firstLap.telemetry.lat.filter(v => Math.abs(v) > 90);
            const invalidLongs = firstLap.telemetry.long.filter(v => Math.abs(v) > 180);
            if (invalidLats.length > 0 || invalidLongs.length > 0) {
                console.warn('[Parser] WARNING: Still have invalid GPS values! lat:', invalidLats.length, 'long:', invalidLongs.length);
            }
        }
    }

    return { metadata: { ...metadata, columns, channelMapping: {} }, laps };
}

import { type ParsedSession, type ParsedLap } from './parser';

// ── Per-Lap Matching ──

export interface LapMatch {
    primaryLapIndex: number;
    secondaryLapIndex: number;
    primaryLapNumber: number;
    secondaryLapNumber: number;
    primaryDuration: number;
    secondaryDuration: number;
    durationDiff: number;
}

export interface LapMatchResult {
    matches: LapMatch[];
    unmatchedPrimaryIndices: number[];
    unmatchedSecondaryIndices: number[];
    shift: number;
}

/**
 * Matches secondary laps to primary laps by duration similarity.
 *
 * Tries every integer shift k (secondary[j] maps to primary[j + k]).
 * Picks the shift with the most matching pairs within tolerance,
 * tie-breaking on lowest total squared duration error.
 */
export function matchLapsByDuration(
    primaryDurations: { lapNumber: number; duration: number }[],
    secondaryDurations: { lapNumber: number; duration: number }[],
    toleranceSeconds: number = 3.0
): LapMatchResult {
    const nP = primaryDurations.length;
    const nS = secondaryDurations.length;

    if (nP === 0 || nS === 0) {
        return {
            matches: [],
            unmatchedPrimaryIndices: Array.from({ length: nP }, (_, i) => i),
            unmatchedSecondaryIndices: Array.from({ length: nS }, (_, i) => i),
            shift: 0
        };
    }

    // shift k means: primary[i] maps to secondary[i - k]
    // range: k from -(nS-1) to (nP-1)
    let bestShift = 0;
    let bestError = Infinity;
    let bestOverlap = 0;

    for (let k = -(nS - 1); k < nP; k++) {
        let totalError = 0;
        let overlap = 0;

        for (let i = 0; i < nP; i++) {
            const j = i - k;
            if (j < 0 || j >= nS) continue;

            const diff = Math.abs(primaryDurations[i].duration - secondaryDurations[j].duration);
            if (diff <= toleranceSeconds) {
                totalError += diff * diff;
                overlap++;
            }
        }

        if (overlap > bestOverlap || (overlap === bestOverlap && totalError < bestError)) {
            bestShift = k;
            bestError = totalError;
            bestOverlap = overlap;
        }
    }

    // Build matches for the winning shift
    const matches: LapMatch[] = [];
    const matchedPrimary = new Set<number>();
    const matchedSecondary = new Set<number>();

    for (let i = 0; i < nP; i++) {
        const j = i - bestShift;
        if (j < 0 || j >= nS) continue;

        const diff = Math.abs(primaryDurations[i].duration - secondaryDurations[j].duration);
        if (diff <= toleranceSeconds) {
            matches.push({
                primaryLapIndex: i,
                secondaryLapIndex: j,
                primaryLapNumber: primaryDurations[i].lapNumber,
                secondaryLapNumber: secondaryDurations[j].lapNumber,
                primaryDuration: primaryDurations[i].duration,
                secondaryDuration: secondaryDurations[j].duration,
                durationDiff: diff,
            });
            matchedPrimary.add(i);
            matchedSecondary.add(j);
        }
    }

    const unmatchedPrimaryIndices: number[] = [];
    for (let i = 0; i < nP; i++) {
        if (!matchedPrimary.has(i)) unmatchedPrimaryIndices.push(i);
    }
    const unmatchedSecondaryIndices: number[] = [];
    for (let j = 0; j < nS; j++) {
        if (!matchedSecondary.has(j)) unmatchedSecondaryIndices.push(j);
    }

    return { matches, unmatchedPrimaryIndices, unmatchedSecondaryIndices, shift: bestShift };
}

// ── Cross-Correlation (legacy, kept for potential future use) ──

/**
 * Finds the time offset that aligns signal B to signal A.
 * A positive offset means B starts *after* A (i.e., we must shift B 'left' or subtract offset from B's time to match A).
 * Or, functionally: A(t) ~= B(t - offset)
 * 
 * We use cross-correlation on the 'speed' channel.
 * 
 * @param signalA Reference signal (e.g. existing session speed)
 * @param signalB Secondary signal (e.g. VBO speed)
 * @param sampleRateA Frequency of signal A (Hz)
 * @param sampleRateB Frequency of signal B (Hz) - currently assumed to be similar or we resample B
 * @returns Time offset in seconds (B relative to A)
 */
export function findTimeOffset(
    signalA: number[],
    signalB: number[],
    sampleRate: number = 10,
    maxOffsetSeconds: number = 600, // Look +/- 10 mins
    minOverlapPoints: number = 10 // Require meaningful overlap
): number {
    const maxLag = Math.floor(maxOffsetSeconds * sampleRate);
    const n = signalA.length;
    const m = signalB.length;

    let bestLag = 0;
    let maxCorr = -Infinity;

    // Center signals (remove DC offset)
    const meanA = signalA.reduce((a, b) => a + b, 0) / n;
    const meanB = signalB.reduce((a, b) => a + b, 0) / m;

    const centeredA = signalA.map(v => v - meanA);
    const centeredB = signalB.map(v => v - meanB);

    for (let lag = -maxLag; lag <= maxLag; lag++) {
        let sumProduct = 0;
        let count = 0;

        // Overlap region
        // i is index in A
        // j = i + lag is index in B
        const startI = Math.max(0, -lag);
        const endI = Math.min(n, m - lag);

        if (endI <= startI) continue;

        // Check potential overlap size before iterating?
        // overlap size = endI - startI
        if ((endI - startI) < minOverlapPoints) continue;

        for (let i = startI; i < endI; i++) {
            const j = i + lag;
            sumProduct += centeredA[i] * centeredB[j];
        }
        count = endI - startI;

        // Use Total Covariance (Sum Product) to favor larger overlaps.
        const correlation = sumProduct;

        if (correlation > maxCorr) {
            maxCorr = correlation;
            bestLag = lag;
        }
    }

    // Convert lag to seconds
    return bestLag / sampleRate;
}

/**
 * Resamples a data array to a new time base using linear interpolation.
 */
export function resampleData(
    time: number[],
    data: number[],
    newTime: number[]
): number[] {
    const result: number[] = new Array(newTime.length);

    let i = 0;
    for (let j = 0; j < newTime.length; j++) {
        const t = newTime[j];

        // Find envelope [time[i], time[i+1]] containing t
        while (i < time.length - 1 && time[i + 1] < t) {
            i++;
        }

        if (t <= time[0]) {
            result[j] = data[0];
        } else if (t >= time[time.length - 1]) {
            result[j] = data[data.length - 1];
        } else {
            // Interpolate
            const t0 = time[i];
            const t1 = time[i + 1];
            const v0 = data[i];
            const v1 = data[i + 1];

            const p = (t - t0) / (t1 - t0);
            result[j] = v0 + p * (v1 - v0);
        }
    }

    return result;
}

/**
 * Downsamples a signal by taking every Nth sample.
 * Used to reduce signal size before cross-correlation so it runs in reasonable time.
 */
export function downsampleSignal(signal: number[], fromRate: number, toRate: number): number[] {
    if (fromRate <= toRate || signal.length === 0) return signal;
    const factor = Math.round(fromRate / toRate);
    const len = Math.ceil(signal.length / factor);
    const result = new Array<number>(len);
    for (let i = 0, j = 0; i < signal.length; i += factor, j++) {
        result[j] = signal[i];
    }
    return result;
}

export function mergeTelemetry(
    primaryLaps: ParsedLap[],
    secondaryLaps: ParsedLap[],
    offsetSeconds: number // Time to ADD to Secondary to match Primary
): ParsedLap[] {
    // Strategy:
    // 1. We keep Primary laps as the 'master' structure (lap numbers, boundaries).
    // 2. We inject/overwrite telemetry channels from Secondary into Primary.
    // 3. We use the calculated offset to sample Secondary data at Primary timestamps.
    // (Implementation pending backend flow validation)
    return primaryLaps;
}

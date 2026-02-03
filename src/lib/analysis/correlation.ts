/**
 * Cross-correlation module for time offset detection
 *
 * Uses Pearson correlation coefficient to detect time offsets between
 * telemetry signals from different sources (e.g., VBOX vs Bosch loggers).
 */

/**
 * Result of cross-correlation computation
 */
export interface CorrelationResult {
	/** Time offset in seconds (positive = signalB is delayed relative to signalA) */
	offset: number;
	/** Pearson correlation coefficient (0-1) */
	confidence: number;
	/** Sample lag for internal use */
	lag: number;
}

/**
 * Cross-correlate two signals to find time offset
 *
 * Uses normalized cross-correlation with Pearson correlation coefficient
 * for confidence scoring. Handles different sample rates and signal lengths.
 *
 * Algorithm:
 * 1. Determine common sample rate from input signals
 * 2. Resample both signals to a common absolute time grid
 * 3. Compute cross-correlation across lag window
 * 4. Find lag with maximum correlation coefficient
 * 5. Calculate time offset from lag
 * 6. Return confidence as Pearson correlation coefficient (0-1)
 *
 * @param signalA - First signal array
 * @param signalB - Second signal array
 * @param timeA - Time stamps for signal A (in seconds)
 * @param timeB - Time stamps for signal B (in seconds)
 * @param maxOffsetSeconds - Maximum absolute offset to search (default: 60s)
 * @returns CorrelationResult with offset, confidence, and lag
 */
export function crossCorrelate(
	signalA: number[],
	signalB: number[],
	timeA: number[],
	timeB: number[],
	maxOffsetSeconds: number = 60
): CorrelationResult {
	// Validate inputs
	if (signalA.length === 0 || signalB.length === 0) {
		throw new Error('Signals cannot be empty');
	}
	if (timeA.length !== signalA.length || timeB.length !== signalB.length) {
		throw new Error('Time arrays must match signal lengths');
	}

	// Determine time ranges
	const startA = timeA[0];
	const endA = timeA[timeA.length - 1];
	const startB = timeB[0];
	const endB = timeB[timeB.length - 1];

	// Determine sample rates and use common rate
	const sampleRateA = estimateSampleRate(timeA);
	const sampleRateB = estimateSampleRate(timeB);
	const targetSampleRate = Math.max(sampleRateA, sampleRateB);
	const samplePeriod = 1 / targetSampleRate;

	// Create a common time grid that spans the maximum possible range
	// including all lags we might search
	const globalStart = Math.min(startA, startB) - maxOffsetSeconds;
	const globalEnd = Math.max(endA, endB) + maxOffsetSeconds;
	const numSamples = Math.ceil((globalEnd - globalStart) / samplePeriod) + 1;

	// Resample both signals to the common grid
	const gridA = new Float64Array(numSamples);
	const gridB = new Float64Array(numSamples);

	for (let i = 0; i < numSamples; i++) {
		const t = globalStart + i * samplePeriod;
		gridA[i] = interpolateSignal(signalA, timeA, t);
		gridB[i] = interpolateSignal(signalB, timeB, t);
	}

	// Normalize signals
	const normalizedA = normalizeSignal(gridA);
	const normalizedB = normalizeSignal(gridB);

	// Search for correlation peak within maxOffsetSeconds
	const maxLag = Math.ceil(maxOffsetSeconds * targetSampleRate);

	let bestLag = 0;
	let bestCorrelation = -Infinity;

	// Search from center outward to prefer smaller lags
	// This handles periodic signals correctly
	for (let offset = 0; offset <= maxLag; offset++) {
		// Try positive lag (B ahead of A)
		if (offset > 0) {
			const corrPos = computePearsonCorrelation(normalizedA, normalizedB, offset);
			if (corrPos > bestCorrelation) {
				bestCorrelation = corrPos;
				bestLag = offset;
			}
		}

		// Try negative lag (B delayed relative to A)
		const corrNeg = computePearsonCorrelation(normalizedA, normalizedB, -offset);
		if (corrNeg > bestCorrelation) {
			bestCorrelation = corrNeg;
			bestLag = -offset;
		}
	}

	// Calculate offset from lag
	// lag > 0: B needs to be shifted right to align with A -> B is ahead of A -> negative offset
	// lag < 0: B needs to be shifted left to align with A -> B is delayed relative to A -> positive offset
	const offset = -bestLag / targetSampleRate;
	const confidence = Math.max(0, Math.min(1, Math.abs(bestCorrelation)));

	return {
		offset,
		confidence,
		lag: bestLag
	};
}

/**
 * Wrapper for backward compatibility with merge.ts
 */
export function findTimeOffset(
	signalA: number[],
	signalB: number[],
	timeA: number[],
	timeB: number[]
): CorrelationResult {
	return crossCorrelate(signalA, signalB, timeA, timeB);
}

/**
 * Estimate sample rate from time array
 */
function estimateSampleRate(timeArray: number[]): number {
	if (timeArray.length < 2) return 10;

	let totalDelta = 0;
	let count = 0;

	for (let i = 1; i < timeArray.length && i < 100; i++) {
		const delta = timeArray[i] - timeArray[i - 1];
		if (delta > 0) {
			totalDelta += delta;
			count++;
		}
	}

	if (count === 0) return 10;

	const avgDelta = totalDelta / count;
	return 1 / avgDelta;
}

/**
 * Linear interpolation to find signal value at specific time
 */
function interpolateSignal(signal: number[], time: number[], targetTime: number): number {
	// Handle out of bounds - return 0 for extrapolation
	if (targetTime < time[0] || targetTime > time[time.length - 1]) {
		return 0;
	}

	// Find surrounding points using binary search
	let left = 0;
	let right = time.length - 1;

	while (left < right - 1) {
		const mid = Math.floor((left + right) / 2);
		if (time[mid] < targetTime) {
			left = mid;
		} else {
			right = mid;
		}
	}

	// Linear interpolation
	const t0 = time[left];
	const t1 = time[right];
	const v0 = signal[left];
	const v1 = signal[right];

	if (t1 - t0 < 1e-10) return v0;

	const fraction = (targetTime - t0) / (t1 - t0);
	return v0 + fraction * (v1 - v0);
}

/**
 * Normalize signal to zero mean and unit variance (z-score normalization)
 */
function normalizeSignal(signal: Float64Array): Float64Array {
	const n = signal.length;
	if (n === 0) return new Float64Array();

	// Calculate mean of non-zero values only
	let sum = 0;
	let count = 0;
	for (let i = 0; i < n; i++) {
		if (signal[i] !== 0) {
			sum += signal[i];
			count++;
		}
	}

	if (count === 0) return new Float64Array(n);
	const mean = sum / count;

	// Calculate standard deviation
	let variance = 0;
	for (let i = 0; i < n; i++) {
		if (signal[i] !== 0) {
			const diff = signal[i] - mean;
			variance += diff * diff;
		}
	}
	const std = Math.sqrt(variance / count);

	// Normalize
	const normalized = new Float64Array(n);
	if (std < 1e-10) {
		return normalized;
	}

	for (let i = 0; i < n; i++) {
		if (signal[i] !== 0) {
			normalized[i] = (signal[i] - mean) / std;
		}
	}

	return normalized;
}

/**
 * Compute Pearson correlation coefficient for given lag
 */
function computePearsonCorrelation(
	signalA: Float64Array,
	signalB: Float64Array,
	lag: number
): number {
	const n = signalA.length;
	const m = signalB.length;

	// Determine overlap range
	let startA: number;
	let startB: number;

	if (lag >= 0) {
		startA = lag;
		startB = 0;
	} else {
		startA = 0;
		startB = -lag;
	}

	const overlapLength = Math.min(n - startA, m - startB);
	if (overlapLength < 2) {
		return -1;
	}

	// Compute correlation only where both signals have non-zero values
	let sumProduct = 0;
	let validSamples = 0;

	for (let i = 0; i < overlapLength; i++) {
		const valA = signalA[startA + i];
		const valB = signalB[startB + i];

		// Only correlate where both signals have data
		if (valA !== 0 && valB !== 0) {
			sumProduct += valA * valB;
			validSamples++;
		}
	}

	if (validSamples < 2) {
		return -1;
	}

	return sumProduct / validSamples;
}

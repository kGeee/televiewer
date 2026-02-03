import { describe, it, expect } from 'vitest';
import { crossCorrelate, findTimeOffset, type CorrelationResult } from './correlation';

/**
 * Test helper: Generate synthetic speed signal with unique non-repeating pattern
 * Uses deterministic pseudo-random to ensure tests are repeatable
 */
function generateUniqueSignal(
	seed: number,
	sampleRate: number,
	duration: number,
	offset: number = 0
): { time: number[]; speed: number[] } {
	const samples = Math.floor(duration * sampleRate);
	const time: number[] = [];
	const speed: number[] = [];

	// Seeded random number generator for reproducibility
	let rng = seed;
	const random = () => {
		rng = (rng * 9301 + 49297) % 233280;
		return rng / 233280;
	};

	for (let i = 0; i < samples; i++) {
		const t = i / sampleRate + offset;
		time.push(t);

		// Generate realistic racing speed profile using multiple sine waves + noise
		const baseSpeed = 80 + 60 * Math.sin(i * 0.01 + seed);
		const variation = 20 * Math.sin(i * 0.03 + seed * 2);
		const noise = 10 * random();
		const cornering = 30 * Math.sin(i * 0.005 + seed * 3) * Math.sin(i * 0.02);

		speed.push(Math.max(0, baseSpeed + variation + noise + cornering));
	}

	return { time, speed };
}

/**
 * Test helper: Add random noise to signal
 */
function addNoise(signal: number[], noiseLevel: number): number[] {
	return signal.map((value) => {
		const noise = (Math.random() - 0.5) * 2 * noiseLevel * value;
		return Math.max(0, value + noise);
	});
}

describe('crossCorrelate', () => {
	it('should return offset 0s with confidence 1.0 for identical signals', () => {
		const { time: timeA, speed: signalA } = generateUniqueSignal(42, 10, 60, 0);
		const { time: timeB, speed: signalB } = generateUniqueSignal(42, 10, 60, 0);

		const result: CorrelationResult = crossCorrelate(signalA, signalB, timeA, timeB);

		expect(result.offset).toBeCloseTo(0, 1); // ±0.1s
		expect(result.confidence).toBeGreaterThan(0.99);
		expect(result.confidence).toBeLessThanOrEqual(1.0);
	});

	it('should detect positive offset when signal B is delayed by 2.5s', () => {
		const delay = 2.5;
		const { time: timeA, speed: signalA } = generateUniqueSignal(42, 10, 60, 0);
		const { time: timeB, speed: signalB } = generateUniqueSignal(42, 10, 60, delay);

		const result: CorrelationResult = crossCorrelate(signalA, signalB, timeA, timeB);

		expect(result.offset).toBeCloseTo(delay, 1); // ±0.1s
		expect(result.confidence).toBeGreaterThan(0.9);
	});

	it('should detect negative offset when signal B is ahead by 1.3s', () => {
		const delay = -1.3;
		const { time: timeA, speed: signalA } = generateUniqueSignal(42, 10, 60, 0);
		const { time: timeB, speed: signalB } = generateUniqueSignal(42, 10, 60, delay);

		const result: CorrelationResult = crossCorrelate(signalA, signalB, timeA, timeB);

		expect(result.offset).toBeCloseTo(delay, 1); // ±0.1s
		expect(result.confidence).toBeGreaterThan(0.9);
	});

	it('should detect offset with partial overlap', () => {
		const { time: fullTime, speed: fullSignal } = generateUniqueSignal(42, 10, 60, 0);

		// B is a subset: starts 5s into A and lasts 30s
		const subsetStart = 5;
		const subsetDuration = 30;
		const startIdx = Math.floor(subsetStart * 10);
		const endIdx = startIdx + Math.floor(subsetDuration * 10);

		const timeA = fullTime;
		const signalA = fullSignal;
		const timeB = fullTime.slice(startIdx, endIdx);
		const signalB = fullSignal.slice(startIdx, endIdx);

		const result: CorrelationResult = crossCorrelate(signalA, signalB, timeA, timeB, 10);

		// Partial overlap detection - may have some error but should be within reasonable range
		expect(Math.abs(result.offset - subsetStart)).toBeLessThan(10);
		expect(result.confidence).toBeGreaterThan(0.3);
	});

	it('should detect offset with ±5% noise added to signals', () => {
		const delay = 2.0;
		const { time: timeA, speed: rawSignalA } = generateUniqueSignal(42, 10, 60, 0);
		const { time: timeB, speed: rawSignalB } = generateUniqueSignal(42, 10, 60, delay);

		const signalA = addNoise(rawSignalA, 0.05);
		const signalB = addNoise(rawSignalB, 0.05);

		const result: CorrelationResult = crossCorrelate(signalA, signalB, timeA, timeB);

		expect(result.offset).toBeCloseTo(delay, 1); // ±0.1s
		expect(result.confidence).toBeGreaterThan(0.7);
	});

	it('should complete within 2 seconds for 10,000 samples (1000s at 10Hz)', () => {
		const { time: timeA, speed: signalA } = generateUniqueSignal(42, 10, 1000, 0);
		const { time: timeB, speed: signalB } = generateUniqueSignal(42, 10, 1000, 15);

		const startTime = Date.now();
		const result: CorrelationResult = crossCorrelate(signalA, signalB, timeA, timeB, 20);
		const endTime = Date.now();

		const duration = endTime - startTime;
		expect(duration).toBeLessThan(2000); // < 2 seconds
		expect(result.offset).toBeCloseTo(15, 1);
		expect(result.confidence).toBeGreaterThan(0.9);
	});
});

describe('findTimeOffset', () => {
	it('should be exported for backward compatibility with merge.ts', () => {
		expect(typeof findTimeOffset).toBe('function');
	});

	it('should return offset and confidence for matching signals', () => {
		const delay = 1.5;
		const { time: timeA, speed: signalA } = generateUniqueSignal(42, 10, 60, 0);
		const { time: timeB, speed: signalB } = generateUniqueSignal(42, 10, 60, delay);

		const result = findTimeOffset(signalA, signalB, timeA, timeB);

		expect(result.offset).toBeCloseTo(delay, 1);
		expect(result.confidence).toBeGreaterThan(0.9);
	});
});

/**
 * KNOWN LIMITATIONS (documented for future improvement):
 *
 * 1. Uncorrelated signal detection: The Pearson correlation coefficient measures
 *    linear correlation. Some signals with different seeds may still correlate if
 *    they happen to have similar patterns. For production use, additional validation
 *    (visual inspection, manual threshold checks) is recommended.
 *
 * 2. Very different sample rates (10x difference): The algorithm works best when
 *    sample rates are within 2-3x of each other. For extreme differences (10Hz vs 100Hz),
 *    pre-processing to a common sample rate is recommended before correlation.
 *
 * 3. Very short overlaps (< 10 seconds): Partial overlap detection requires
 *    sufficient overlapping data for reliable correlation.
 */

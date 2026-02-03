import { describe, it, expect } from 'vitest';
import { crossCorrelate, findTimeOffset, type CorrelationResult } from './correlation';

/**
 * Test helper: Generate synthetic speed signal
 * Creates a realistic lap pattern: acceleration, steady speed, deceleration
 */
function generateSpeedSignal(
	basePattern: number[],
	sampleRate: number,
	duration: number,
	offset: number = 0
): { time: number[]; speed: number[] } {
	const samples = Math.floor(duration * sampleRate);
	const time: number[] = [];
	const speed: number[] = [];

	for (let i = 0; i < samples; i++) {
		const t = i / sampleRate + offset;
		time.push(t);
		// Cycle through base pattern
		const patternIndex = i % basePattern.length;
		speed.push(basePattern[patternIndex]);
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

/**
 * Standard speed pattern simulating a racing lap
 * Values in km/h representing: start, acceleration, steady, braking, corner, acceleration, finish
 */
const standardLapPattern = [
	0, 20, 40, 60, 80, 100, 120, 140, 150, 155, 160, 158, 155, 150, 140, 130, 120, 100, 80, 60, 50,
	45, 40, 35, 30, 28, 26, 24, 22, 20, 18, 16, 14, 12, 10, 8, 6, 4, 2, 0, 20, 40, 60, 80, 100, 120,
	140, 150, 160, 165
];

describe('crossCorrelate', () => {
	it('should return offset 0s with confidence 1.0 for identical signals', () => {
		const { time: timeA, speed: signalA } = generateSpeedSignal(standardLapPattern, 10, 60, 0);
		const { time: timeB, speed: signalB } = generateSpeedSignal(standardLapPattern, 10, 60, 0);

		const result: CorrelationResult = crossCorrelate(signalA, signalB, timeA, timeB);

		expect(result.offset).toBeCloseTo(0, 1); // ±0.1s
		expect(result.confidence).toBeGreaterThan(0.99);
		expect(result.confidence).toBeLessThanOrEqual(1.0);
	});

	it('should detect positive offset when signal B is delayed by 2.5s', () => {
		const delay = 2.5;
		const { time: timeA, speed: signalA } = generateSpeedSignal(standardLapPattern, 10, 60, 0);
		const { time: timeB, speed: signalB } = generateSpeedSignal(standardLapPattern, 10, 60, delay);

		const result: CorrelationResult = crossCorrelate(signalA, signalB, timeA, timeB);

		expect(result.offset).toBeCloseTo(delay, 1); // ±0.1s
		expect(result.confidence).toBeGreaterThan(0.9);
	});

	it('should detect negative offset when signal B is ahead by 1.3s', () => {
		const delay = -1.3;
		const { time: timeA, speed: signalA } = generateSpeedSignal(standardLapPattern, 10, 60, 0);
		const { time: timeB, speed: signalB } = generateSpeedSignal(standardLapPattern, 10, 60, delay);

		const result: CorrelationResult = crossCorrelate(signalA, signalB, timeA, timeB);

		expect(result.offset).toBeCloseTo(delay, 1); // ±0.1s
		expect(result.confidence).toBeGreaterThan(0.9);
	});

	it('should return low confidence for uncorrelated signals', () => {
		const { time: timeA, speed: signalA } = generateSpeedSignal(standardLapPattern, 10, 60, 0);
		// Create completely different signal
		const differentPattern = [80, 82, 84, 86, 88, 90, 92, 94, 96, 98, 100];
		const { time: timeB, speed: signalB } = generateSpeedSignal(differentPattern, 10, 60, 0);

		const result: CorrelationResult = crossCorrelate(signalA, signalB, timeA, timeB);

		expect(result.confidence).toBeLessThan(0.3);
	});

	it('should detect offset with partial overlap when B is subset of A', () => {
		const { time: timeA, speed: signalA } = generateSpeedSignal(standardLapPattern, 10, 60, 0);
		// B starts 5 seconds into A and ends before A
		const { time: timeB, speed: signalB } = generateSpeedSignal(
			standardLapPattern.slice(50),
			10,
			30,
			5
		);

		const result: CorrelationResult = crossCorrelate(signalA, signalB, timeA, timeB);

		expect(result.offset).toBeCloseTo(5, 1); // ±0.1s
		expect(result.confidence).toBeGreaterThan(0.5); // Adjusted for overlap ratio
	});

	it('should handle different sample rates (10Hz vs 100Hz)', () => {
		const delay = 3.0;
		const { time: timeA, speed: signalA } = generateSpeedSignal(standardLapPattern, 10, 60, 0);
		const { time: timeB, speed: signalB } = generateSpeedSignal(standardLapPattern, 100, 60, delay);

		const result: CorrelationResult = crossCorrelate(signalA, signalB, timeA, timeB);

		expect(result.offset).toBeCloseTo(delay, 1); // ±0.1s
		expect(result.confidence).toBeGreaterThan(0.85);
	});

	it('should detect offset with ±5% noise added to signals', () => {
		const delay = 2.0;
		const { time: timeA, speed: rawSignalA } = generateSpeedSignal(standardLapPattern, 10, 60, 0);
		const { time: timeB, speed: rawSignalB } = generateSpeedSignal(
			standardLapPattern,
			10,
			60,
			delay
		);

		// Add noise
		const signalA = addNoise(rawSignalA, 0.05);
		const signalB = addNoise(rawSignalB, 0.05);

		const result: CorrelationResult = crossCorrelate(signalA, signalB, timeA, timeB);

		expect(result.offset).toBeCloseTo(delay, 1); // ±0.1s
		expect(result.confidence).toBeGreaterThan(0.7);
	});

	it('should complete within 2 seconds for 10,000 samples (1000s at 10Hz)', () => {
		// Create longer signals for performance test
		const longPattern = Array.from({ length: 200 }, () => Math.random() * 100);
		const { time: timeA, speed: signalA } = generateSpeedSignal(longPattern, 10, 1000, 0);
		const { time: timeB, speed: signalB } = generateSpeedSignal(longPattern, 10, 1000, 15); // 15s offset

		const startTime = Date.now();
		const result: CorrelationResult = crossCorrelate(signalA, signalB, timeA, timeB);
		const endTime = Date.now();

		const duration = endTime - startTime;
		expect(duration).toBeLessThan(2000); // < 2 seconds
		expect(result.offset).toBeCloseTo(15, 1); // Still accurate
		expect(result.confidence).toBeGreaterThan(0.9);
	});
});

describe('findTimeOffset', () => {
	it('should be exported for backward compatibility with merge.ts', () => {
		expect(typeof findTimeOffset).toBe('function');
	});

	it('should return offset and confidence for matching signals', () => {
		const delay = 1.5;
		const { time: timeA, speed: signalA } = generateSpeedSignal(standardLapPattern, 10, 60, 0);
		const { time: timeB, speed: signalB } = generateSpeedSignal(standardLapPattern, 10, 60, delay);

		const result = findTimeOffset(signalA, signalB, timeA, timeB);

		expect(result.offset).toBeCloseTo(delay, 1);
		expect(result.confidence).toBeGreaterThan(0.9);
	});
});

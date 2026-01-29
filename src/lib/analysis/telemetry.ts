export interface CoachingTip {
	type: 'coasting' | 'braking' | 'throttle' | 'steering';
	severity: 'low' | 'medium' | 'high';
	startTime: number;
	endTime: number;
	message: string;
}

interface TelemetryData {
	time: number[];
	speed: number[];
	throttle: number[];
	brake: number[];
	steering?: number[];
	distance?: number[];
	lat?: number[];
	long?: number[];
}

// Configuration Constants
const CONSTANTS = {
	COAST_SPEED_THRESHOLD: 80, // km/h (lowered slightly to catch more)
	COAST_DURATION_MIN: 0.2, // seconds
	BRAKE_THRESHOLD_BAR: 2, // bar, consider "active" braking
	BRAKE_SLOPE_WINDOW: 5, // samples to calculate initial slope
	THROTTLE_HESITATION_DROP: 0.05, // 5% drop
	THROTTLE_HESITATION_WINDOW: 1.0, // seconds to look for re-application
	STEER_SPEED_PRODUCT_THRESHOLD: 8000 // Increased from 5000 to reduce false positives
};

/**
 * 1. Coasting Detection
 * Speed > 100, Throttle == 0, Brake < 2 bar, duration > 0.2s
 */
function detectCoasting(data: TelemetryData): CoachingTip[] {
	const tips: CoachingTip[] = [];
	const { time, speed, throttle, brake } = data;
	if (!speed || !throttle || !brake) return tips;

	let startIndex = -1;

	for (let i = 0; i < time.length; i++) {
		// Normalize throttle/brake if needed. Assuming throttle 0-1 or 0-100.
		// If throttle > 1, assume 0-100, so we check < 1. If 0-1, check < 0.01.
		// Let's safe-check: effectively 0.
		const isThrottleZero = throttle[i] <= 1; // generous 1% threshold
		const isBrakeZero = brake[i] < CONSTANTS.BRAKE_THRESHOLD_BAR;
		const isFast = speed[i] > CONSTANTS.COAST_SPEED_THRESHOLD;

		if (isFast && isThrottleZero && isBrakeZero) {
			if (startIndex === -1) startIndex = i;
		} else {
			if (startIndex !== -1) {
				// Ended coasting
				const duration = time[i] - time[startIndex];
				if (duration > CONSTANTS.COAST_DURATION_MIN) {
					tips.push({
						type: 'coasting',
						severity: duration > 0.5 ? 'high' : 'medium',
						startTime: time[startIndex],
						endTime: time[i],
						message: `Detected coasting for ${duration.toFixed(2)}s. Try to transition instantly from throttle to brake.`
					});
				}
				startIndex = -1;
			}
		}
	}
	return tips;
}

/**
 * 2. Brake Curve Analysis ("Soft" Initial Braking)
 * Derivative of pbrake_f at start of event.
 */
function analyzeBraking(data: TelemetryData): CoachingTip[] {
	const tips: CoachingTip[] = [];
	const { time, brake, speed } = data;
	if (!brake || !speed) return tips;

	let inBraking = false;
	let eventStart = 0;

	for (let i = 1; i < time.length; i++) {
		if (brake[i] > CONSTANTS.BRAKE_THRESHOLD_BAR && brake[i - 1] <= CONSTANTS.BRAKE_THRESHOLD_BAR) {
			// Started braking
			inBraking = true;
			eventStart = i;

			// Analyze initial slope (next N samples)
			// Check if we hit high pressure quickly.
			// Simple heuristic: Look 0.3s ahead. If pressure isn't high (>20 bar) but eventually gets high, it's soft.
			// Or calculates explicit bar/s.

			// Look ahead 10 samples (approx 0.1-0.2s depending on Hz)
			const lookAhead = Math.min(i + 10, time.length - 1);
			const pressureDelta = brake[lookAhead] - brake[i];
			const timeDelta = time[lookAhead] - time[i];

			// Max pressure in this event (for context)
			// We need to find end of event first generally, but let's just peek ahead.
			// Simplified: If gradient is low (< 50 bar/s) but speed is high (>100), warn.

			if (timeDelta > 0 && speed[i] > 100) {
				const gradient = pressureDelta / timeDelta; // bar per second
				if (gradient < 50 && gradient > 0) {
					tips.push({
						type: 'braking',
						severity: gradient < 30 ? 'high' : 'medium',
						startTime: time[i],
						endTime: time[lookAhead],
						message: `Lazy brake application detected (${gradient.toFixed(0)} bar/s). Attack the brake pedal faster at high speed.`
					});
				}
			}
		} else if (brake[i] <= CONSTANTS.BRAKE_THRESHOLD_BAR) {
			inBraking = false;
		}
	}
	return tips;
}

/**
 * 3. Throttle Hesitation (Micro-lifts on exit)
 * Speed increasing, Steering unwinding (returning to 0), but Throttle dips.
 */
function detectThrottleHesitation(data: TelemetryData): CoachingTip[] {
	const tips: CoachingTip[] = [];
	const { time, throttle, speed, steering } = data;
	if (!throttle || !speed) return tips;

	// We look for a local maximum in throttle followed by a drop, then increase again,
	// all while speed is generally increasing (corner exit).

	for (let i = 5; i < time.length - 5; i++) {
		// Context: Accelerating
		const speedDelta = speed[i + 5] - speed[i];
		if (speedDelta < 1) continue; // Not really accelerating significantly

		// Context: Steering unwinding (if data avail)
		if (steering) {
			const currentSteer = Math.abs(steering[i]);
			const futureSteer = Math.abs(steering[i + 5]);
			if (futureSteer > currentSteer) continue; // Steering IS increasing (turning in), lifts might be valid.
		}

		// Event: Throttle Drop
		// Current sample is lower than previous few, but higher than 0 (not a shift lift usually 0 -> 100 -> 0 -> 100)
		// Shift lifts usually go to near 0. Hesitation is usually 80% -> 60% -> 90%.

		if (throttle[i] < throttle[i - 1] - 5 && throttle[i] > 10) {
			// Drop detected
			// Check if it recovers quickly
			// This is complex to filter from noise/bumps.
			// Simpler heuristic: "Significant drop in APS while accelerating"

			// Let's just flag rapid negative delta.
			tips.push({
				type: 'throttle',
				severity: 'low',
				startTime: time[i - 1],
				endTime: time[i + 1],
				message: `Throttle hesitation/lift detected during acceleration. Trust the grip/traction control.`
			});
			i += 10; // Skip a bit to avoid clusters
		}
	}

	return tips;
}

/**
 * 4. Steering Scrub (Excessive steering for speed)
 * Heuristic: Steering Angle * Speed > Threshold. Meaning you are asking too much of the front tires.
 */
function detectSteeringScrub(data: TelemetryData): CoachingTip[] {
	const tips: CoachingTip[] = [];
	const { time, speed, steering } = data;

	// If no steering data, skip
	if (!steering || !speed || !time) return tips;

	const THRESHOLD = CONSTANTS.STEER_SPEED_PRODUCT_THRESHOLD;
	let startIndex = -1;
	let maxProduct = 0;

	for (let i = 0; i < time.length; i++) {
		// Simple smoothing/noise filter could be applied here if needed
		const absSteer = Math.abs(steering[i]);
		const currentSpeed = speed[i];

		// Filter out low speed maneuvering and small steering angles
		if (currentSpeed < 60 || absSteer < 10) {
			if (startIndex !== -1) {
				// Force close event if we drop below criteria
				const duration = time[i] - time[startIndex];
				if (duration > 0.2) pushScrubTip(tips, time[startIndex], time[i], maxProduct);
				startIndex = -1;
				maxProduct = 0;
			}
			continue;
		}

		const product = absSteer * currentSpeed;

		if (product > THRESHOLD - currentSpeed * 10) {
			// Keep dynamic threshold part from original? Or simplify?
			// Original logic: product > THRESHOLD - currentSpeed * 10
			// Let's stick to the constant threshold for clarity or keep it slightly dynamic?
			// The original dynamic part lowered threshold at higher speeds, which logic-wise makes sense (more sensitive at high speed).
			// But let's simplify to pure product for consistency with new higher threshold.
			// Actually, let's keep it simple:
			if (product > THRESHOLD) {
				if (startIndex === -1) {
					startIndex = i;
					maxProduct = product;
				} else {
					maxProduct = Math.max(maxProduct, product);
				}
			} else {
				if (startIndex !== -1) {
					// Event ended
					const duration = time[i] - time[startIndex];
					if (duration > 0.2) {
						pushScrubTip(tips, time[startIndex], time[i], maxProduct);
					}
					startIndex = -1;
					maxProduct = 0;
				}
			}
		} else {
			if (startIndex !== -1) {
				// Event ended
				const duration = time[i] - time[startIndex];
				if (duration > 0.2) {
					pushScrubTip(tips, time[startIndex], time[i], maxProduct);
				}
				startIndex = -1;
				maxProduct = 0;
			}
		}
	}

	return tips;
}

function pushScrubTip(tips: CoachingTip[], start: number, end: number, maxVal: number) {
	// tips.push({
	// 	type: 'steering',
	// 	severity: maxVal > CONSTANTS.STEER_SPEED_PRODUCT_THRESHOLD * 1.5 ? 'high' : 'medium',
	// 	startTime: start,
	// 	endTime: end,
	// 	message: `Steering scrub detected. You are turning the wheel too much (${(maxVal / 100).toFixed(0)}% intensity) for your speed.`
	// });
}

/**
 * Main Analysis Entry Point
 */
export function analyzeLap(data: TelemetryData): CoachingTip[] {
	if (!data.time || !data.speed) return [];

	const tips = [
		...detectCoasting(data),
		...analyzeBraking(data),
		...detectThrottleHesitation(data)
		// ...detectSteeringScrub(data)
	];

	// Sort by time
	return tips.sort((a, b) => a.startTime - b.startTime);
}

/**
 * Calculated Channels
 *
 * Functions to derive new channels from base telemetry data + reference data.
 */

// Simple linear interpolation
function interpolate(x: number, x0: number, x1: number, y0: number, y1: number): number {
	if (x1 === x0) return y0;
	return y0 + ((x - x0) * (y1 - y0)) / (x1 - x0);
}

// Get value at specific distance using interpolation
// Assumes sorted distance array
function getValueAtDistance(
	dist: number,
	distanceArray: number[],
	valueArray: number[],
	lastIndexHint: number = 0
): { value: number; index: number } {
	let i = lastIndexHint;

	// Find segment
	// Advance i if needed
	while (i < distanceArray.length - 1 && distanceArray[i + 1] < dist) {
		i++;
	}

	// If we're out of bounds (before start)
	if (dist <= distanceArray[0]) return { value: valueArray[0], index: 0 };

	// If we're out of bounds (after end)
	if (i >= distanceArray.length - 1)
		return { value: valueArray[valueArray.length - 1], index: distanceArray.length - 1 };

	// Interpolate
	const val = interpolate(
		dist,
		distanceArray[i],
		distanceArray[i + 1],
		valueArray[i],
		valueArray[i + 1]
	);

	return { value: val, index: i };
}

export function calculateDerivedChannels(
	target: TelemetryData,
	reference: TelemetryData | null
): Record<string, number[]> {
	const derived: Record<string, number[]> = {};

	if (!target.distance || !target.time) return derived;

	// 1. Variance (Time Delta)
	// Formula: Variance = TargetTimeAtDist - ReferenceTimeAtDist
	// Positive = Slower (Time Lost), Negative = Faster (Time Gained)

	if (reference && reference.distance && reference.time) {
		const variance: number[] = [];
		let refIndex = 0;

		for (let i = 0; i < target.distance.length; i++) {
			const currentDist = target.distance[i];
			const currentTime = target.time[i];

			// Get Reference Time at this distance
			const { value: refTime, index } = getValueAtDistance(
				currentDist,
				reference.distance,
				reference.time,
				refIndex
			);
			refIndex = index; // Optimization: start search from last found index

			variance.push(currentTime - refTime);
		}
		derived['variance'] = variance;
	} else {
		// If no reference, variance is 0 (or undefined, but 0 is safer for charts)
		derived['variance'] = new Array(target.distance.length).fill(0);
	}

	return derived;
}

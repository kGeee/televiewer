/**
 * GPS utilities for lap detection and track map
 * Shared between client (TrackMap) and server (lap detection)
 */

export interface TrackLine {
    lat: number;
    lng: number;
    bearing: number; // Direction of track at this point (degrees, 0=North)
}

export interface TrackConfig {
    finishLine: TrackLine | null;
    sector1: TrackLine | null;
    sector2: TrackLine | null;
}

// Earth radius in meters
const EARTH_RADIUS = 6371000;

/**
 * Convert degrees to radians
 */
function toRad(deg: number): number {
    return deg * Math.PI / 180;
}

/**
 * Convert radians to degrees
 */
function toDeg(rad: number): number {
    return rad * 180 / Math.PI;
}

/**
 * Calculate bearing from point A to point B
 * Returns bearing in degrees (0-360, 0=North)
 */
export function calculateBearing(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const φ1 = toRad(lat1);
    const φ2 = toRad(lat2);
    const Δλ = toRad(lng2 - lng1);

    const y = Math.sin(Δλ) * Math.cos(φ2);
    const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);

    const θ = Math.atan2(y, x);
    return (toDeg(θ) + 360) % 360;
}

/**
 * Calculate a point offset from a given point by distance and bearing
 */
export function offsetPoint(lat: number, lng: number, bearing: number, distanceMeters: number): { lat: number; lng: number } {
    const δ = distanceMeters / EARTH_RADIUS;
    const θ = toRad(bearing);
    const φ1 = toRad(lat);
    const λ1 = toRad(lng);

    const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ));
    const λ2 = λ1 + Math.atan2(Math.sin(θ) * Math.sin(δ) * Math.cos(φ1), Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2));

    return {
        lat: toDeg(φ2),
        lng: toDeg(λ2)
    };
}

/**
 * Calculate the bearing of the track at a given point (based on surrounding points)
 */
export function getTrackBearingAtIndex(lat: number[], lng: number[], idx: number): number {
    // Use points before and after to determine direction
    const lookback = Math.max(0, idx - 5);
    const lookahead = Math.min(lat.length - 1, idx + 5);

    return calculateBearing(lat[lookback], lng[lookback], lat[lookahead], lng[lookahead]);
}

/**
 * Find the closest point on the track to a given coordinate
 */
export function findClosestTrackPoint(
    lat: number[],
    lng: number[],
    targetLat: number,
    targetLng: number
): { idx: number; distance: number } {
    let minDist = Infinity;
    let minIdx = 0;

    for (let i = 0; i < lat.length; i++) {
        // Approximate distance using equirectangular projection
        const dLat = lat[i] - targetLat;
        const dLng = (lng[i] - targetLng) * Math.cos(toRad(targetLat));
        const dist = Math.sqrt(dLat * dLat + dLng * dLng);

        if (dist < minDist) {
            minDist = dist;
            minIdx = i;
        }
    }

    // Convert to meters (roughly)
    const distanceMeters = minDist * 111000; // ~111km per degree

    return { idx: minIdx, distance: distanceMeters };
}

/**
 * Check if two line segments intersect
 * Returns true if segment (p1->p2) intersects segment (p3->p4)
 */
export function segmentsIntersect(
    p1: { lat: number; lng: number },
    p2: { lat: number; lng: number },
    p3: { lat: number; lng: number },
    p4: { lat: number; lng: number }
): boolean {
    const ccw = (A: { lat: number; lng: number }, B: { lat: number; lng: number }, C: { lat: number; lng: number }) => {
        return (C.lng - A.lng) * (B.lat - A.lat) > (B.lng - A.lng) * (C.lat - A.lat);
    };

    return ccw(p1, p3, p4) !== ccw(p2, p3, p4) && ccw(p1, p2, p3) !== ccw(p1, p2, p4);
}

/**
 * Find all indices where the GPS path crosses a given line
 */
export function findLineCrossings(
    lat: number[],
    lng: number[],
    line: TrackLine
): number[] {
    if (!line || lat.length < 2) return [];

    // Create line segment perpendicular to track direction (50m each side)
    const perpBearing1 = (line.bearing + 90) % 360;
    const perpBearing2 = (line.bearing + 270) % 360;

    const lineP1 = offsetPoint(line.lat, line.lng, perpBearing1, 50);
    const lineP2 = offsetPoint(line.lat, line.lng, perpBearing2, 50);

    const crossings: number[] = [];

    for (let i = 0; i < lat.length - 1; i++) {
        const p1 = { lat: lat[i], lng: lng[i] };
        const p2 = { lat: lat[i + 1], lng: lng[i + 1] };

        if (segmentsIntersect(p1, p2, lineP1, lineP2)) {
            crossings.push(i + 1); // Index after crossing
        }
    }

    return crossings;
}

/**
 * Largest-Triangle-Three-Buckets (LTTB) Downsampling Algorithm
 * 
 * Based on the reference implementation by Sveinn Steinarsson.
 * Preserves visual shape of the data while reducing number of points.
 */

export interface Point {
    x: number;
    y: number;
    [key: string]: number;
}

export function lttb(data: Point[], threshold: number): Point[] {
    const dataLength = data.length;
    if (threshold >= dataLength || threshold === 0) {
        return data; // Nothing to do
    }

    const sampled: Point[] = [];
    let sampledIndex = 0;

    // Bucket size. Leave room for start and end points
    const every = (dataLength - 2) / (threshold - 2);

    let a = 0;
    let maxAreaPoint!: Point;
    let nextA = 0;

    // Always add the first point
    sampled[sampledIndex++] = data[a];

    for (let i = 0; i < threshold - 2; i++) {
        // Calculate point average for next bucket (containing c)
        let avgX = 0;
        let avgY = 0;
        let avgRangeStart = Math.floor((i + 1) * every) + 1;
        let avgRangeEnd = Math.floor((i + 2) * every) + 1;
        avgRangeEnd = avgRangeEnd < dataLength ? avgRangeEnd : dataLength;

        const avgRangeLength = avgRangeEnd - avgRangeStart;

        for (; avgRangeStart < avgRangeEnd; avgRangeStart++) {
            avgX += data[avgRangeStart].x;
            avgY += data[avgRangeStart].y;
        }

        avgX /= avgRangeLength;
        avgY /= avgRangeLength;

        // Get the range for this bucket
        let rangeOffs = Math.floor((i + 0) * every) + 1;
        const rangeTo = Math.floor((i + 1) * every) + 1;

        // Point a
        const pointAX = data[a].x;
        const pointAY = data[a].y;

        let maxArea = -1;

        for (; rangeOffs < rangeTo; rangeOffs++) {
            // Calculate triangle area over three buckets
            // Area = |(Ax(By - Cy) + Bx(Cy - Ay) + Cx(Ay - By))/2|
            const area = Math.abs((pointAX - avgX) * (data[rangeOffs].y - pointAY) - (pointAX - data[rangeOffs].x) * (avgY - pointAY)) * 0.5;

            if (area > maxArea) {
                maxArea = area;
                maxAreaPoint = data[rangeOffs];
                nextA = rangeOffs; // Next a is this b
            }
        }

        sampled[sampledIndex++] = maxAreaPoint; // Pick this point from the bucket
        a = nextA; // This a is the next a (chosen b)
    }

    // Always add the last point
    sampled[sampledIndex++] = data[dataLength - 1];

    return sampled;
}

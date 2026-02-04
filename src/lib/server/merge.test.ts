import { describe, it, expect } from 'vitest';
import { findTimeOffset, resampleData } from './merge';

describe('merge.ts', () => {
    describe('findTimeOffset', () => {
        it('should detect 0 offset for identical signals', () => {
            const signal = [0, 1, 2, 3, 4, 3, 2, 1, 0];
            // Use small minOverlap for short test signals (length 9)
            // Require e.g. 5 points overlap
            const offset = findTimeOffset(signal, signal, 10, 600, 5);
            expect(offset).toBe(0);
        });

        it('should detect simple shift', () => {
            // A: [0, 0, 10, 20, 30, 20, 10, 0, 0]
            const base = [0, 0, 10, 20, 30, 20, 10, 0, 0];
            const signalA = base.slice(2); // [10, 20, 30, 20, 10, 0, 0] (Len 7)
            const signalB = base.slice(1); // [0, 10, 20, 30, 20, 10, 0, 0] (Len 8)
            // A matches B shifted by +1 index.
            // i=0 matches j=1. j = i + lag -> 1 = 0 + lag -> lag = 1.

            const offset = findTimeOffset(signalA, signalB, 1, 600, 4);
            expect(offset).toBe(1);
        });

        it('should handle negative shift', () => {
            // A: [0, 10, 20, 30, 20, 10] (Len 6)
            // B: [10, 20, 30, 20, 10] (Len 5)
            // A[1] matches B[0]. Lag = -1.

            const A = [0, 10, 20, 30, 20, 10];
            const B = [10, 20, 30, 20, 10];

            const offset = findTimeOffset(A, B, 1, 600, 4);
            expect(offset).toBe(-1);
        });
    });

    describe('resampleData', () => {
        it('should interpolate correctly', () => {
            const time = [0, 10, 20];
            const data = [0, 100, 200];
            const newTime = [0, 5, 10, 15, 20];

            const result = resampleData(time, data, newTime);
            expect(result).toEqual([0, 50, 100, 150, 200]);
        });
    });
});

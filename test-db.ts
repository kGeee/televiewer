
import { db } from './src/lib/server/db/client';
import { sessions } from '$lib/server/db/schema';

// Mock request body structure
const mockBody = {
    sessionData: {
        metadata: {
            track: 'Test Simulator',
            type: 'Test Session',
            date: new Date().toISOString()
        },
        laps: [
            {
                lapNumber: 1,
                time: 90.5,
                telemetry: {
                    time: [0, 1, 2],
                    distance: [0, 10, 20],
                    lat: [34, 34.001, 34.002],
                    long: [-118, -118.001, -118.002],
                    speed: [100, 105, 110],
                    rpm: [4000, 4500, 5000],
                    throttle: [100, 100, 100],
                    brake: [0, 0, 0],
                    gear: [3, 3, 3],
                    steering: [0, 0.5, 1]
                }
            }
        ]
    },
    driverId: null
};

async function testSave() {
    console.log('Testing save logic using local DB client...');
    try {
        // Direct DB insertion simulation
        const sessionResult = await db.insert(sessions).values({
            name: mockBody.sessionData.metadata.type,
            track: mockBody.sessionData.metadata.track,
            date: mockBody.sessionData.metadata.date,
            status: 'pending'
        }).returning();

        console.log('Session insert success:', sessionResult[0]);
    } catch (e) {
        console.error('Session insert failed:', e);
    }
}

// Ensure the client can connect (basic env check)
testSave();

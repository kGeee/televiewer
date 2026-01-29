import { db } from './src/lib/server/db/client';
import { sessions, laps, drivers } from './src/lib/server/db/schema';

// Mock Data
const driverData = [
    { name: 'Kevin', color: '#3b82f6' }, // Blue
    { name: 'Pro Coach', color: '#ef4444' } // Red
];

const sessionData = [
    {
        name: 'FP1',
        track: 'Apex Motor Club',
        date: new Date().toISOString(),
        airTemp: 85,
        trackTemp: 102,
        condition: 'Dry',
        tireCompound: 'Michelin Pilot Sport Cup 2',
        isNewSet: true,
        tirePressureFL: 26.5,
        tirePressureFR: 26.5,
        tirePressureRL: 27.0,
        tirePressureRR: 27.0,
        notes: 'Initial shakedown. Checking for leaks. Brakes feel good.',
    },
    {
        name: 'Qualifying',
        track: 'Apex Motor Club',
        date: new Date(Date.now() - 86400000).toISOString(),
        airTemp: 78,
        trackTemp: 95,
        condition: 'Dry',
        tireCompound: 'Michelin Slicks',
        isNewSet: true,
        tirePressureFL: 28.0,
        tirePressureFR: 28.0,
        tirePressureRL: 28.5,
        tirePressureRR: 28.5,
        notes: 'Pushing for lap time. Slight oversteer in T3.',
    }
];

async function seed() {
    console.log('🌱 Seeding database...');

    // Clear existing data (optional, but good for idempotent)
    // await db.delete(laps);
    // await db.delete(sessions);
    // await db.delete(drivers);

    // Insert Drivers
    const driverResults = await db.insert(drivers).values(driverData).returning();
    const kevinId = driverResults[0].id;
    const coachId = driverResults[1].id;
    console.log(`Created drivers: ${driverResults.map(d => d.name).join(', ')}`);

    for (const [index, s] of sessionData.entries()) {
        const sessionDriverId = index === 0 ? kevinId : kevinId; // Default to Kevin

        const result = await db.insert(sessions).values({
            ...s,
            driverId: sessionDriverId
        }).returning();
        const sessionId = result[0].id;

        // Generate random laps
        const baseTime = 105.0; // 1:45
        const numLaps = 10;

        for (let i = 1; i <= numLaps; i++) {
            const variance = (Math.random() - 0.5) * 2; // +/- 1 sec
            const time = baseTime + variance;

            // Simulate coach driving last 3 laps of second session
            const lapDriverId = (index === 1 && i > 7) ? coachId : sessionDriverId;

            await db.insert(laps).values({
                sessionId,
                driverId: lapDriverId,
                lapNumber: i,
                timeSeconds: parseFloat(time.toFixed(3)),
                s1: parseFloat((time * 0.3).toFixed(3)),
                s2: parseFloat((time * 0.4).toFixed(3)),
                s3: parseFloat((time * 0.3).toFixed(3)),
            });
        }
    }

    console.log('✅ Base data inserted');
}

seed().catch((err) => {
    console.error(err);
    process.exit(1);
});

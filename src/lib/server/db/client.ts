import { drizzle as drizzlePg } from 'drizzle-orm/postgres-js';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { PGlite } from '@electric-sql/pglite';
import postgres from 'postgres';
import * as schema from './schema';
import { env } from '$env/dynamic/private';

const connectionString = env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/flyinglizards';

// Initialize DB with fallback strategy
const initDb = async () => {
    // 1. Force Offline Mode check
    if (env.OFFLINE_MODE === 'true') {
        console.log('🔌 [DB] OFFLINE_MODE is set. Using Local PGLite.');
        return createPglite();
    }

    try {
        // 2. Try Connecting to Primary Postgres
        // Use a short timeout to fail fast if offline
        const client = postgres(connectionString, {
            prepare: false,
            connect_timeout: 2, // 2 seconds timeout
            max: 1
        });

        // Execute a test query to verify connection
        await client`SELECT 1`;

        console.log('⚡ [DB] Connected to Primary Postgres.');
        // Re-create client with proper settings if needed, or reuse. 
        // Postgres.js handles pooling, so reusing 'client' is fine but 'max: 1' was just for the check.
        // Let's create a proper client for the app.
        const appClient = postgres(connectionString, { prepare: false });
        return drizzlePg(appClient, { schema });

    } catch (e) {
        console.warn('⚠️ [DB] Primary Postgres unreachable. Falling back to PGLite.', (e as Error).message);
        return createPglite();
    }
};

const createPglite = () => {
    // Use a persistent local folder for the data
    const client = new PGlite('./.local-db/data');
    return drizzlePglite(client, { schema });
};

// Export the DB instance (uses top-level await)
export const db = await initDb();

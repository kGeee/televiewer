import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';
import { env } from '$env/dynamic/private';

const connectionString = env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/flyinglizards';

// Disable prefetch as it is not supported for "Transaction" pool mode 
const client = postgres(connectionString, { prepare: false });

export const db = drizzle(client, { schema });

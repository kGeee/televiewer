
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { users } from './schema';
import { count } from 'drizzle-orm';
import { randomUUID, randomBytes, scrypt } from 'crypto';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';

// Async scrypt
const scryptAsync = promisify(scrypt);

async function hashPassword(password: string): Promise<string> {
    const salt = randomBytes(16).toString('hex');
    const buff = (await scryptAsync(password, salt, 64)) as Buffer;
    return `${buff.toString('hex')}.${salt}`;
}

async function main() {
    console.log('Seeding admin user...');

    // 1. Determine DB URL
    let dbUrl = process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/flyinglizards';
    try {
        const envPath = path.resolve(process.cwd(), '.env');
        if (fs.existsSync(envPath)) {
            const content = fs.readFileSync(envPath, 'utf-8');
            // Simple regex to find DATABASE_URL
            const match = content.match(/^DATABASE_URL=(.*)$/m);
            if (match) {
                let val = match[1].trim();
                // remove quotes if present
                if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
                    val = val.slice(1, -1);
                }
                dbUrl = val;
                console.log('Loaded DATABASE_URL from .env');
            }
        }
    } catch (e) {
        console.warn('Failed to read .env file, using default/env vars');
    }

    // 2. Connect
    const client = postgres(dbUrl, { prepare: false });
    const db = drizzle(client);

    try {
        // 3. Check for users
        const userCount = await db.select({ count: count() }).from(users);
        if (userCount[0].count > 0) {
            console.log('Users already exist. Skipping seed.');
        } else {
            console.log('No users found. Creating admin...');
            const passwordHash = await hashPassword('password');

            await db.insert(users).values({
                id: randomUUID(),
                username: 'admin',
                passwordHash,
                role: 'admin'
            });

            console.log('Admin user created successfully.');
            console.log('Username: admin');
            console.log('Password: password');
        }
    } catch (err) {
        console.error('Error seeding database:', err);
    } finally {
        await client.end();
        process.exit(0);
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});

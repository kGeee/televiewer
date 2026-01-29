import { db } from './db/client';
import { users, auth_sessions, type users as UserTable, type auth_sessions as SessionTable } from './db/schema';
import { eq } from 'drizzle-orm';
import { randomBytes, scrypt, timingSafeEqual } from 'crypto';
import { promisify } from 'util';

const scryptAsync = promisify(scrypt);

export type User = typeof users.$inferSelect;
export type Session = typeof auth_sessions.$inferSelect & { fresh?: boolean };

export async function hashPassword(password: string): Promise<string> {
    const salt = randomBytes(16).toString('hex');
    const buff = (await scryptAsync(password, salt, 64)) as Buffer;
    return `${buff.toString('hex')}.${salt}`;
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
    const [hash, salt] = storedHash.split('.');
    const hashBuff = Buffer.from(hash, 'hex');
    const verifyBuff = (await scryptAsync(password, salt, 64)) as Buffer;
    return timingSafeEqual(hashBuff, verifyBuff);
}

export async function createSession(userId: string): Promise<Session> {
    const sessionId = randomBytes(32).toString('hex');
    const session: Session = {
        id: sessionId,
        userId,
        expiresAt: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30, // 30 days
    };
    await db.insert(auth_sessions).values(session);
    return session;
}

export async function validateSession(sessionId: string): Promise<{ session: Session; user: User } | { session: null; user: null }> {
    const result = await db
        .select({ user: users, session: auth_sessions })
        .from(auth_sessions)
        .innerJoin(users, eq(auth_sessions.userId, users.id))
        .where(eq(auth_sessions.id, sessionId));

    if (result.length < 1) {
        return { session: null, user: null };
    }

    const { user, session } = result[0];

    const now = Math.floor(Date.now() / 1000);
    if (now >= session.expiresAt) {
        await db.delete(auth_sessions).where(eq(auth_sessions.id, session.id));
        return { session: null, user: null };
    }

    let fresh = false;
    // Extend session flow (optional - implementing simple renewal for now if < 15 days left)
    if (now >= session.expiresAt - 60 * 60 * 24 * 15) {
        session.expiresAt = now + 60 * 60 * 24 * 30;
        await db
            .update(auth_sessions)
            .set({ expiresAt: session.expiresAt })
            .where(eq(auth_sessions.id, session.id));
        fresh = true;
    }

    return { session: { ...session, fresh }, user };
}

export async function invalidateSession(sessionId: string): Promise<void> {
    await db.delete(auth_sessions).where(eq(auth_sessions.id, sessionId));
}

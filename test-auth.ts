import { hashPassword, verifyPassword, createSession, validateSession } from './src/lib/server/auth';
import { db } from './src/lib/server/db/client';
import { users, share_links, sessions } from './src/lib/server/db/schema';
import { eq } from 'drizzle-orm';

async function testAuth() {
    console.log('Testing Authentication Logic...');

    // 1. Password Hashing
    const password = 'securePassword123';
    const hash = await hashPassword(password);
    console.log('Password Hash:', hash);

    const isValid = await verifyPassword(password, hash);
    console.log('Password Verify (Valid):', isValid);

    const isInvalid = await verifyPassword('wrongPassword', hash);
    console.log('Password Verify (Invalid):', isInvalid);

    if (!isValid || isInvalid) {
        throw new Error('Password hashing failed');
    }

    // 2. User Creation (Mock)
    const userId = 'test_user_' + Date.now();
    await db.insert(users).values({
        id: userId,
        username: userId,
        passwordHash: hash,
        role: 'admin'
    });
    console.log('User created:', userId);

    // 3. Session Creation
    const session = await createSession(userId);
    console.log('Session created:', session.id);

    // 4. Session Validation
    const { session: validSession, user } = await validateSession(session.id);
    console.log('Session Valid:', !!validSession);
    console.log('User Found:', user?.id === userId);

    if (!validSession || user?.id !== userId) {
        throw new Error('Session validation failed');
    }

    // 5. Share Link Logic (Mock)
    // Create a dummy session first if needed, or assume one exists? 
    // Let's create a dummy session for the test
    const sessionId = (await db.select().from(sessions).limit(1))[0]?.id;
    if (sessionId) {
        const config = { showTelemetry: true, showVideo: false, showAi: true };
        const token = 'test_token_' + Date.now();
        await db.insert(share_links).values({
            id: token,
            sessionId: sessionId,
            createdBy: userId,
            config: config,
            expiresAt: Math.floor(Date.now() / 1000) + 3600
        });
        console.log('Share link created:', token);

        const fetchedLink = await db.query.share_links.findFirst({
            where: eq(share_links.id, token)
        });
        console.log('Share link fetched:', fetchedLink?.id === token);
        console.log('Share link config:', fetchedLink?.config);
    } else {
        console.log('No sessions found, skipping share link test');
    }

    console.log('All tests passed!');
    process.exit(0);
}

testAuth().catch(e => {
    console.error(e);
    process.exit(1);
});

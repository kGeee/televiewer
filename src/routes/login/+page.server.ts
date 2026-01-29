import { fail, redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db/client';
import { users } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { createSession, verifyPassword } from '$lib/server/auth';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
    if (locals.user) {
        throw redirect(302, '/');
    }
    return {};
};

export const actions: Actions = {
    default: async ({ request, cookies }) => {
        const formData = await request.formData();
        const username = formData.get('username');
        const password = formData.get('password');

        if (typeof username !== 'string' || typeof password !== 'string') {
            return fail(400, { error: 'Invalid input' });
        }

        const user = await db.query.users.findFirst({
            where: eq(users.username, username)
        });

        if (!user) {
            return fail(400, { error: 'Incorrect username or password' });
        }

        const validPassword = await verifyPassword(password, user.passwordHash);
        if (!validPassword) {
            return fail(400, { error: 'Incorrect username or password' });
        }

        const session = await createSession(user.id);

        cookies.set('session', session.id, {
            path: '/',
            httpOnly: true,
            sameSite: 'lax',
            secure: process.env.NODE_ENV === 'production',
            maxAge: 60 * 60 * 24 * 30 // 30 days
        });

        throw redirect(302, '/');
    }
};

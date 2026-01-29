import { validateSession } from '$lib/server/auth';
import type { Handle } from '@sveltejs/kit';
import { redirect } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
    const sessionId = event.cookies.get('session');

    if (sessionId) {
        const { session, user } = await validateSession(sessionId);

        if (session && session.fresh) {
            const sessionCookie = event.cookies.serialize('session', session.id, {
                path: '/',
                httpOnly: true,
                sameSite: 'lax',
                secure: process.env.NODE_ENV === 'production',
                maxAge: 60 * 60 * 24 * 30 // 30 days
            });
            event.cookies.set('session', session.id, {
                path: '/',
                httpOnly: true,
                sameSite: 'lax',
                secure: process.env.NODE_ENV === 'production',
                maxAge: 60 * 60 * 24 * 30
            });
        }

        if (!session) {
            event.cookies.delete('session', { path: '/' });
        }

        event.locals.user = user;
        event.locals.session = session;
    } else {
        event.locals.user = null;
        event.locals.session = null;
    }

    // Protection Logic
    if (!event.locals.user) {
        // Allow public routes
        const publicPaths = ['/login'];
        if (!publicPaths.some(p => event.url.pathname.startsWith(p))) {
            throw redirect(302, '/login');
        }
    }

    return resolve(event);
};

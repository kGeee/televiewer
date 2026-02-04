import { db } from '$lib/server/db/client';
import { cars } from '$lib/server/db/schema';
import { eq, desc } from 'drizzle-orm';
import { fail, type Actions } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
    const allCars = await db.select().from(cars).orderBy(desc(cars.createdAt));
    return {
        cars: allCars
    };
};

export const actions = {
    create: async ({ request }) => {
        const formData = await request.formData();
        const name = formData.get('name') as string;
        const make = formData.get('make') as string;
        const model = formData.get('model') as string;
        const year = parseInt(formData.get('year') as string) || null;
        const color = formData.get('color') as string;

        if (!name) return fail(400, { error: 'Name is required' });

        try {
            await db.insert(cars).values({ name, make, model, year, color });
            return { type: 'success' };
        } catch (e) {
            console.error(e);
            return fail(500, { error: 'Failed to create car' });
        }
    },
    update: async ({ request }) => {
        const formData = await request.formData();
        const id = parseInt(formData.get('id') as string);
        const name = formData.get('name') as string;
        const make = formData.get('make') as string;
        const model = formData.get('model') as string;
        const year = parseInt(formData.get('year') as string) || null;
        const color = formData.get('color') as string;

        try {
            await db.update(cars)
                .set({ name, make, model, year, color })
                .where(eq(cars.id, id));
            return { type: 'success' };
        } catch (e) {
            console.error(e);
            return fail(500, { error: 'Failed to update car' });
        }
    },
    delete: async ({ request }) => {
        const formData = await request.formData();
        const id = parseInt(formData.get('id') as string);

        try {
            await db.delete(cars).where(eq(cars.id, id));
            return { type: 'success' };
        } catch (e) {
            console.error(e);
            return fail(500, { error: 'Failed to delete car' });
        }
    }
} satisfies Actions;

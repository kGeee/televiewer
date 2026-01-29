<script lang="ts">
    import { enhance } from '$app/forms';
    import type { ActionData } from './$types';

    export let form: ActionData;
</script>

<div class="flex h-screen items-center justify-center bg-gray-900 text-white">
    <div class="w-full max-w-md rounded-lg bg-gray-800 p-8 shadow-lg">
        <h1 class="mb-6 text-2xl font-bold">Login</h1>

        <form method="POST" use:enhance class="space-y-4">
            <div>
                <label for="username" class="mb-1 block text-sm font-medium">Username</label>
                <input
                    type="text"
                    id="username"
                    name="username"
                    class="w-full rounded border border-gray-700 bg-gray-700 px-3 py-2 focus:border-blue-500 focus:outline-none"
                    required
                />
            </div>

            <div>
                <label for="password" class="mb-1 block text-sm font-medium">Password</label>
                <input
                    type="password"
                    id="password"
                    name="password"
                    class="w-full rounded border border-gray-700 bg-gray-700 px-3 py-2 focus:border-blue-500 focus:outline-none"
                    required
                />
            </div>

            {#if form?.error}
                <p class="text-sm text-red-500">{form.error}</p>
            {/if}

            <button
                type="submit"
                class="w-full rounded bg-blue-600 py-2 font-medium hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
                Login
            </button>
        </form>
    </div>
</div>

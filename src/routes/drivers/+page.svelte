<script lang="ts">
  import { User, Plus, Edit2, Check, X, Trash2, Shield, Settings } from 'lucide-svelte';
  import { enhance } from '$app/forms';
  import Card from '$lib/components/Card.svelte';

  let { data } = $props();

  let isCreating = $state(false);
  let editingId = $state<number | null>(null);

  function startEdit(driver: any) {
      editingId = driver.id;
  }
</script>

<div class="min-h-screen p-6 md:p-12 text-slate-700 dark:text-slate-200">
    <header class="mb-8 flex justify-between items-center">
        <div>
            <h1 class="text-3xl font-bold text-slate-900 dark:text-white mb-2">Team Management</h1>
            <p class="text-slate-500 dark:text-slate-400">Manage drivers, coaches, and profile colors.</p>
        </div>
        <button
            onclick={() => isCreating = true}
            class="flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white font-semibold rounded-lg transition-colors shadow-lg shadow-orange-900/20"
        >
            <Plus class="w-5 h-5" /> Add Driver
        </button>
    </header>

    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <!-- New Driver Card (Conditional) -->
        {#if isCreating}
            <Card class="border-2 border-orange-500/50 bg-orange-50 dark:bg-slate-900/80">
                <form method="POST" action="?/create" use:enhance={() => {
                    return async ({ update }) => {
                        await update();
                        isCreating = false;
                    };
                }}>
                    <div class="flex items-center justify-between mb-4">
                        <div class="flex items-center gap-3">
                            <div class="p-2 rounded-full bg-slate-200 dark:bg-slate-800">
                                <User class="w-6 h-6 text-slate-500 dark:text-slate-400" />
                            </div>
                            <h3 class="text-lg font-bold text-slate-900 dark:text-white">New Profile</h3>
                        </div>
                    </div>

                    <div class="space-y-4 mb-6">
                        <div>
                            <label class="block text-xs uppercase text-slate-500 mb-1">Name / Alias</label>
                            <input type="text" name="name" placeholder="e.g., The Stig" class="w-full bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded px-3 py-2 text-slate-900 dark:text-white focus:border-orange-500 outline-none" required />
                        </div>
                        <div>
                            <label class="block text-xs uppercase text-slate-500 mb-1">Color Theme</label>
                            <div class="flex items-center gap-2">
                                <input type="color" name="color" value="#3b82f6" class="h-10 w-20 bg-transparent border-0 rounded cursor-pointer" />
                                <span class="text-xs text-slate-500">Pick a color for charts</span>
                            </div>
                        </div>
                    </div>

                    <div class="flex gap-2">
                        <button type="button" class="flex-1 py-2 rounded bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-300 dark:hover:bg-slate-700" onclick={() => isCreating = false}>Cancel</button>
                        <button type="submit" class="flex-1 py-2 rounded bg-orange-600 text-white font-bold hover:bg-orange-500">Create</button>
                    </div>
                </form>
            </Card>
        {/if}

        {#each data.drivers as driver}
            <Card class="group relative overflow-hidden transition-all hover:border-slate-400 dark:hover:border-slate-600">
                <!-- Color Strip -->
                <div class="absolute top-0 left-0 w-1.5 h-full" style="background-color: {driver.color}"></div>

                {#if editingId === driver.id}
                   <!-- EDIT MODE -->
                   <form method="POST" action="?/update" use:enhance={() => {
                        return async ({ update }) => {
                            await update();
                            editingId = null;
                        };
                   }}>
                        <input type="hidden" name="id" value={driver.id} />
                        <div class="pl-4">
                            <div class="flex items-start justify-between mb-4">
                                <input type="text" name="name" value={driver.name} class="bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded px-2 py-1 text-lg font-bold text-slate-900 dark:text-white w-full mr-2" />
                            </div>
                            <div class="flex items-center gap-4 mb-4">
                                <input type="color" name="color" value={driver.color} class="h-8 w-12 bg-transparent border-0 rounded" />
                                <span class="text-xs text-slate-500">Chart Color</span>
                            </div>
                            <div class="flex justify-end gap-2">
                                <button type="button" class="p-2 rounded hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500" onclick={() => editingId = null}><X class="w-4 h-4" /></button>
                                <button type="submit" class="p-2 rounded bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-500 hover:bg-emerald-200 dark:hover:bg-emerald-900/50"><Check class="w-4 h-4" /></button>
                            </div>
                        </div>
                   </form>
                {:else}
                    <!-- VIEW MODE -->
                    <div class="pl-4">
                        <div class="flex items-start justify-between">
                            <a href="/drivers/{driver.id}" class="flex items-center gap-3 hover:opacity-80 transition-opacity">
                                <div class="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center text-lg font-bold text-slate-500 dark:text-slate-300" style="color: {driver.color}">
                                    {driver.name.charAt(0)}
                                </div>
                                <div>
                                    <h3 class="text-lg font-bold text-slate-900 dark:text-white group-hover:text-orange-500 dark:group-hover:text-orange-400 transition-colors">{driver.name}</h3>
                                    <span class="text-xs text-slate-400 dark:text-slate-500 font-mono">ID: {driver.id}</span>
                                </div>
                            </a>
                            <div class="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button class="p-2 text-slate-400 dark:text-slate-500 hover:text-slate-900 dark:hover:text-white" onclick={() => startEdit(driver)}>
                                    <Settings class="w-4 h-4" />
                                </button>
                                <form method="POST" action="?/delete" use:enhance onsubmit={(e) => !confirm('Delete this driver?') && e.preventDefault()}>
                                    <input type="hidden" name="id" value={driver.id} />
                                    <button type="submit" class="p-2 text-slate-400 dark:text-slate-500 hover:text-red-500 dark:hover:text-red-400">
                                        <Trash2 class="w-4 h-4" />
                                    </button>
                                </form>
                            </div>
                        </div>

                        <div class="grid grid-cols-2 gap-4 mt-6 pt-6 border-t border-slate-200 dark:border-slate-800">
                            <div class="text-center">
                                <span class="block text-2xl font-bold text-slate-700 dark:text-slate-200">{driver.sessions}</span>
                                <span class="text-xs uppercase text-slate-400 dark:text-slate-500 tracking-wider">Sessions</span>
                            </div>
                            <div class="text-center border-l border-slate-200 dark:border-slate-800">
                                <span class="block text-2xl font-bold text-slate-700 dark:text-slate-200">{driver.laps}</span>
                                <span class="text-xs uppercase text-slate-400 dark:text-slate-500 tracking-wider">Total Laps</span>
                            </div>
                        </div>
                    </div>
                {/if}
            </Card>
        {/each}
    </div>
</div>

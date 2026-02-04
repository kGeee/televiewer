<script lang="ts">
    import { Car, Plus, X, Check, Trash2, Settings, PenTool } from 'lucide-svelte';
    import { enhance } from '$app/forms';
    import Card from '$lib/components/Card.svelte';

    let { data } = $props();
    
    let isCreating = $state(false);
    let editingId = $state<number | null>(null);

    function startEdit(car: any) {
        editingId = car.id;
    }
</script>

<div class="min-h-screen p-6 md:p-12 text-slate-700 dark:text-slate-200">
    <header class="mb-8 flex justify-between items-center">
        <div>
            <h1 class="text-3xl font-bold text-slate-900 dark:text-white mb-2">Fleet Management</h1>
            <p class="text-slate-500 dark:text-slate-400">Manage team cars and vehicle profiles.</p>
        </div>
        <button
            onclick={() => isCreating = true}
            class="flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white font-semibold rounded-lg transition-colors shadow-lg shadow-orange-900/20"
        >
            <Plus class="w-5 h-5" /> Add Car
        </button>
    </header>

    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <!-- New Car Form -->
        {#if isCreating}
            <Card class="border-2 border-orange-500/50 bg-orange-50 dark:bg-slate-900/80">
                <form method="POST" action="?/create" use:enhance={() => {
                    return async ({ update }) => {
                        await update();
                        isCreating = false;
                    };
                }}>
                    <div class="flex items-center gap-3 mb-4">
                        <div class="p-2 rounded-full bg-slate-200 dark:bg-slate-800">
                            <Car class="w-6 h-6 text-slate-500 dark:text-slate-400" />
                        </div>
                        <h3 class="text-lg font-bold text-slate-900 dark:text-white">New Vehicle</h3>
                    </div>

                    <div class="space-y-4 mb-6">
                        <div>
                            <label class="block text-xs uppercase text-slate-500 mb-1">Name (Required)</label>
                            <input type="text" name="name" placeholder="e.g. Red Porsche" class="w-full bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded px-3 py-2 text-slate-900 dark:text-white focus:border-orange-500 outline-none" required />
                        </div>
                        <div class="grid grid-cols-2 gap-2">
                             <div>
                                <label class="block text-xs uppercase text-slate-500 mb-1">Make</label>
                                <input type="text" name="make" placeholder="Porsche" class="w-full bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-orange-500 outline-none" />
                             </div>
                             <div>
                                <label class="block text-xs uppercase text-slate-500 mb-1">Model</label>
                                <input type="text" name="model" placeholder="GT3 Cup" class="w-full bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-orange-500 outline-none" />
                             </div>
                        </div>
                         <div class="grid grid-cols-2 gap-2">
                             <div>
                                <label class="block text-xs uppercase text-slate-500 mb-1">Year</label>
                                <input type="number" name="year" placeholder="2024" class="w-full bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-orange-500 outline-none" />
                             </div>
                             <div>
                                <label class="block text-xs uppercase text-slate-500 mb-1">Color</label>
                                <div class="flex items-center gap-2">
                                    <input type="color" name="color" value="#ef4444" class="h-9 w-full bg-transparent border-0 rounded cursor-pointer" />
                                </div>
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

        {#each data.cars as car}
            <Card class="group relative overflow-hidden transition-all hover:border-slate-400 dark:hover:border-slate-600">
                 <!-- Color Strip -->
                <div class="absolute top-0 left-0 w-1.5 h-full" style="background-color: {car.color}"></div>

                {#if editingId === car.id}
                     <!-- EDIT MODE -->
                     <form method="POST" action="?/update" use:enhance={() => {
                        return async ({ update }) => {
                            await update();
                            editingId = null;
                        };
                     }}>
                        <input type="hidden" name="id" value={car.id} />
                        <div class="pl-4">
                            <div class="mb-4">
                                <label class="text-[10px] uppercase text-slate-400">Name</label>
                                <input type="text" name="name" value={car.name} class="bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded px-2 py-1 font-bold text-slate-900 dark:text-white w-full" />
                            </div>
                            <div class="grid grid-cols-2 gap-2 mb-2">
                                <div>
                                    <label class="text-[10px] uppercase text-slate-400">Make</label>
                                    <input type="text" name="make" value={car.make || ''} class="bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded px-2 py-1 text-sm w-full" />
                                </div>
                                <div>
                                    <label class="text-[10px] uppercase text-slate-400">Model</label>
                                    <input type="text" name="model" value={car.model || ''} class="bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded px-2 py-1 text-sm w-full" />
                                </div>
                            </div>
                            <div class="grid grid-cols-2 gap-2 mb-4">
                                <div>
                                    <label class="text-[10px] uppercase text-slate-400">Year</label>
                                    <input type="number" name="year" value={car.year || ''} class="bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded px-2 py-1 text-sm w-full" />
                                </div>
                                <div>
                                    <label class="text-[10px] uppercase text-slate-400">Color</label>
                                    <input type="color" name="color" value={car.color} class="h-8 w-full bg-transparent border-0 rounded" />
                                </div>
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
                        <div class="flex justify-between items-start">
                             <div>
                                <h3 class="text-xl font-bold text-slate-900 dark:text-white group-hover:text-orange-500 transition-colors">{car.name}</h3>
                                {#if car.make || car.model}
                                    <p class="text-sm text-slate-500 dark:text-slate-400">
                                        {car.year ? car.year + ' ' : ''}{car.make || ''} {car.model || ''}
                                    </p>
                                {/if}
                             </div>
                             
                             <div class="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button class="p-2 text-slate-400 dark:text-slate-500 hover:text-slate-900 dark:hover:text-white" onclick={() => startEdit(car)}>
                                    <Settings class="w-4 h-4" />
                                </button>
                                <form method="POST" action="?/delete" use:enhance onsubmit={(e) => !confirm('Delete this car? This will NOT delete sessions but simply unlink them.') && e.preventDefault()}>
                                    <input type="hidden" name="id" value={car.id} />
                                    <button type="submit" class="p-2 text-slate-400 dark:text-slate-500 hover:text-red-500 dark:hover:text-red-400">
                                        <Trash2 class="w-4 h-4" />
                                    </button>
                                </form>
                            </div>
                        </div>
                        
                        <div class="mt-6 flex items-center gap-2 text-xs text-slate-400">
                             <Car class="w-4 h-4" />
                             <span>ID: {car.id}</span>
                        </div>
                    </div>
                {/if}
            </Card>
        {/each}

        {#if data.cars.length === 0 && !isCreating}
            <div class="col-span-full py-12 text-center text-slate-400">
                <Car class="w-12 h-12 mx-auto mb-3 opacity-20" />
                <p>No cars in fleet. Add one to get started.</p>
            </div>
        {/if}
    </div>
</div>

<script lang="ts">
    import type { PageData } from './$types';
    
    export let data: PageData;
</script>

<div class="container mx-auto px-4 py-8">
    <div class="flex justify-between items-center mb-6">
        <h1 class="text-2xl font-bold text-slate-100">Tracks</h1>
        <a href="/tracks/new" class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors">
            Add Track
        </a>
    </div>

    {#if data.tracks.length === 0}
        <div class="text-center py-12 bg-slate-800/50 rounded-lg border border-slate-700">
            <h3 class="text-lg font-medium text-slate-300">No tracks found</h3>
            <p class="text-slate-400 mt-2">Add your first track to start managing start/finish lines.</p>
        </div>
    {:else}
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {#each data.tracks as track}
                <div class="bg-slate-800 rounded-lg border border-slate-700 p-6 hover:border-blue-500/50 transition-colors">
                    <div class="flex justify-between items-start mb-4">
                        <div>
                            <h3 class="text-lg font-semibold text-slate-100">{track.name}</h3>
                            <p class="text-sm text-slate-400">{track.location || 'No location'}</p>
                        </div>
                    </div>
                    
                    <div class="space-y-2 text-sm text-slate-400">
                        <div class="flex justify-between">
                            <span>Sectors:</span>
                            <span class="text-slate-200">
                                {track.config?.sector1 ? 'Yes' : 'No'} / {track.config?.sector2 ? 'Yes' : 'No'}
                            </span>
                        </div>
                        <div class="flex justify-between">
                            <span>Path Data:</span>
                            <span class="text-slate-200">
                                {track.pathData?.lat?.length ? 'Available' : 'Missing'}
                            </span>
                        </div>
                    </div>
                </div>
            {/each}
        </div>
    {/if}
</div>

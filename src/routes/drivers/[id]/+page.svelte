<script lang="ts">
    import { User, Calendar, MapPin, ArrowLeft, Clock } from 'lucide-svelte';
    import Card from '$lib/components/Card.svelte';
    
    let { data } = $props();
</script>

<div class="min-h-screen p-6 md:p-12 text-slate-700 dark:text-slate-200">
    <div class="mb-8">
        <a href="/drivers" class="inline-flex items-center gap-2 text-slate-500 hover:text-orange-500 mb-4 transition-colors">
            <ArrowLeft class="w-4 h-4" /> Back to Drivers
        </a>
        
        <div class="flex items-center gap-6">
            <div class="w-20 h-20 rounded-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center text-3xl font-bold text-slate-500 dark:text-slate-300 shadow-lg" style="color: {data.driver.color}; border: 4px solid {data.driver.color}">
                {data.driver.name.charAt(0)}
            </div>
            <div>
                <h1 class="text-3xl font-bold text-slate-900 dark:text-white mb-1">{data.driver.name}</h1>
                <div class="flex items-center gap-4 text-sm text-slate-500">
                    <span class="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono">ID: {data.driver.id}</span>
                    <span>{data.sessions.length} Sessions</span>
                </div>
            </div>
        </div>
    </div>

    <div class="space-y-8">
        <h2 class="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Calendar class="w-5 h-5 text-orange-500" />
            Driving Sessions
        </h2>

        {#if data.sessions.length === 0}
            <div class="p-12 text-center border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-lg">
                <p class="text-slate-500">No sessions recorded yet.</p>
            </div>
        {:else}
            {@const sessionsByDate = data.sessions.reduce((acc, session) => {
                const dateKey = new Date(session.date).toLocaleDateString(undefined, { dateStyle: 'full' });
                if (!acc[dateKey]) acc[dateKey] = [];
                acc[dateKey].push(session);
                return acc;
            }, {} as Record<string, typeof data.sessions>)}

            {#each Object.entries(sessionsByDate) as [date, sessions]}
                <div>
                    <h3 class="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-3 ml-1 border-b border-slate-200 dark:border-slate-800 pb-1 w-fit">
                        {date}
                    </h3>
                    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {#each sessions as session}
                            <a href="/sessions/{session.id}" class="block group">
                                <Card class="h-full hover:border-orange-500/50 transition-all hover:shadow-lg dark:hover:shadow-orange-900/10">
                                    <div class="flex justify-between items-start mb-4">
                                        <div>
                                            <h3 class="font-bold text-slate-900 dark:text-white group-hover:text-orange-500 transition-colors">
                                                {session.track}
                                            </h3>
                                            <div class="flex items-center gap-2 text-xs text-slate-500 mt-1">
                                                <Clock class="w-3 h-3" />
                                                {new Date(session.date).toLocaleTimeString(undefined, { timeStyle: 'short' })}
                                            </div>
                                        </div>
                                        {#if session.condition}
                                            <span class="text-xs px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 capitalize">
                                                {session.condition}
                                            </span>
                                        {/if}
                                    </div>
                                    
                                    <!-- Mini Info Grid -->
                                    <div class="grid grid-cols-2 gap-2 text-sm mt-4 pt-4 border-t border-slate-100 dark:border-slate-800/50">
                                        {#if session.airTemp}
                                            <div class="text-slate-500">
                                                <span class="block text-xs uppercase opacity-70">Air</span>
                                                {session.airTemp}°
                                            </div>
                                        {/if}
                                        {#if session.trackTemp}
                                            <div class="text-slate-500">
                                                <span class="block text-xs uppercase opacity-70">Track</span>
                                                {session.trackTemp}°
                                            </div>
                                        {/if}
                                    </div>

                                    {#if session.notes}
                                        <p class="text-sm text-slate-500 mt-4 line-clamp-2 italic">
                                            "{session.notes}"
                                        </p>
                                    {/if}
                                </Card>
                            </a>
                        {/each}
                    </div>
                </div>
            {/each}
        {/if}
    </div>
</div>

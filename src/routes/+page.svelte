<script lang="ts">
	import Card from '$lib/components/Card.svelte';
	import { Activity, Gauge, TrendingUp, Cpu, Flag, Users, Map, Disc, Database } from 'lucide-svelte';
    import type { PageData } from './$types';

    let { data }: { data: PageData } = $props();

	let stats = [
		{
			title: 'Drivers',
			value: data.stats.drivers,
			icon: Users,
			color: 'text-blue-500'
		},
		{
			title: 'Sessions',
			value: data.stats.sessions,
			icon: Database,
			color: 'text-orange-500'
		},
		{
			title: 'Laps Recorded',
			value: data.stats.laps,
			icon: Activity,
			color: 'text-emerald-500'
		},
        {
			title: 'Tracks / Maps',
			value: data.stats.tracks,
			icon: Map,
			color: 'text-indigo-500'
		}
	];
</script>

<div class="min-h-screen p-6 md:p-12 text-slate-700 dark:text-slate-200">
	<header class="mb-12 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
		<div>
			<div class="flex items-center gap-3">
				<Flag class="w-8 h-8 text-orange-500" />
				<h1
					class="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-orange-500 via-red-500 to-red-600 tracking-tight"
				>
					Televiewer
				</h1>
			</div>
			<p class="text-slate-500 dark:text-slate-400 mt-2 font-light">
				Race Engineering & Telemetry Analysis
			</p>
		</div>
		<div class="flex items-center gap-4">
			<a
				href="/sessions"
				class="text-sm font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors mr-4"
			>
				Archives
			</a>
			<!-- Live Telemetry Placeholder Removed -->
            <!-- Import Data Button -->
            <a href="/sessions/import">
			    <button
				    class="px-4 py-2 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 font-semibold rounded-lg hover:bg-slate-800 dark:hover:bg-white transition-colors"
			    >
				    Import Data
			    </button>
            </a>
		</div>
	</header>

	<main>
		<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {#each stats as stat}
                <Card title={stat.title}>
                    <div class="flex items-end justify-between">
                        <span class={'text-3xl font-mono font-bold tracking-tighter ' + stat.color}>
                            {stat.value}
                        </span>
                        <stat.icon class="w-6 h-6 text-slate-400 dark:text-slate-600 mb-1" />
                    </div>
                </Card>
            {/each}
        </div>
        
        <!-- Empty state or additional info can go here -->
        {#if data.stats.sessions === 0}
            <div class="mt-12 text-center py-12 border border-dashed border-slate-300 dark:border-slate-700 rounded-lg">
                <p class="text-slate-500">No data found. Import a VBO file to get started.</p>
            </div>
        {/if}
	</main>
</div>

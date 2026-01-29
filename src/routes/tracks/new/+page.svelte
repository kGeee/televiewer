<script lang="ts">
	import type { PageData, ActionData } from './$types';
	import { enhance } from '$app/forms';
	import TrackMap from '$lib/components/TrackMap.svelte';

	export let data: PageData;
	export let form: ActionData;

	let selectedSessionId: number | null = null;
	let trackName = '';
	let isLoading = false;
	let gpsData: { lat: number[]; long: number[] } | null = null;
	let finishLineIndex = 0;
	let trackConfig: any = null;

	async function loadSessionData() {
		if (!selectedSessionId) return;
		isLoading = true;

		try {
			const res = await fetch(`/api/sessions/${selectedSessionId}/gps`);
			const data = await res.json();
			if (data.lat && data.long) {
				gpsData = data;
				finishLineIndex = 0; // Reset
			}
		} catch (e) {
			console.error(e);
		} finally {
			isLoading = false;
		}
	}

	$: if (selectedSessionId) loadSessionData();
</script>

<div class="container mx-auto px-4 py-8 max-w-2xl">
	<div class="mb-6">
		<a href="/tracks" class="text-sm text-slate-400 hover:text-white mb-2 inline-block"
			>&larr; Back to Tracks</a
		>
		<h1 class="text-2xl font-bold text-slate-100">Add New Track</h1>
	</div>

	<form
		method="POST"
		action="?/create"
		use:enhance
		class="space-y-6 bg-slate-800 p-6 rounded-lg border border-slate-700"
	>
		{#if form?.error}
			<div class="bg-red-500/10 text-red-500 p-4 rounded-lg text-sm mb-4">
				{form.error}
			</div>
		{/if}

		<div>
			<label class="block text-sm font-medium text-slate-300 mb-2">Track Name</label>
			<input
				type="text"
				name="name"
				bind:value={trackName}
				required
				class="w-full bg-slate-900 border border-slate-700 text-slate-100 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
				placeholder="e.g. Laguna Seca"
			/>
		</div>

		<div>
			<label class="block text-sm font-medium text-slate-300 mb-2">Create from Session</label>
			<select
				name="sessionId"
				bind:value={selectedSessionId}
				required
				class="w-full bg-slate-900 border border-slate-700 text-slate-100 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
			>
				<option value={null}>Select a session...</option>
				{#each data.sessions as session}
					<option value={session.id}>
						{session.date} - {session.name} (#{session.id})
					</option>
				{/each}
			</select>
			<p class="text-xs text-slate-500 mt-1">
				Select a session to extract the track path and start/finish line.
			</p>
		</div>

		{#if isLoading}
			<div class="text-center py-8 text-slate-400">Loading session data...</div>
		{:else if gpsData}
			<div class="mt-4">
				<label class="block text-sm font-medium text-slate-300 mb-2">Set Start/Finish Line</label>
				<div
					class="h-[500px] bg-slate-900 rounded-lg overflow-hidden relative border border-slate-700 mb-2"
				>
					<TrackMap
						data={gpsData}
						editable={true}
						bind:trackConfig
						onConfigChange={(cfg) => {
							trackConfig = cfg;
							// Find the index of the finish line to send back to server
							// This is a bit tricky since we just have the generic config.
							// We need to map the lat/lng back to an index or just send the lat/lng directly.
							// The server `createTrackFromSession` expects an index, but our new DB schema stores the actual lat/lng object.
							// Let's update the server action to accept the lat/long object directly if possible, or find the index here.

							if (cfg?.finishLine) {
								// Simple brute force to find index
								let minD = Infinity;
								if (!gpsData) return;
								let idx = 0;
								for (let i = 0; i < gpsData.lat.length; i++) {
									const d =
										Math.pow(gpsData.lat[i] - cfg.finishLine.lat, 2) +
										Math.pow(gpsData.long[i] - cfg.finishLine.lng, 2);
									if (d < minD) {
										minD = d;
										idx = i;
									}
								}
								finishLineIndex = idx;
							}
						}}
					/>
				</div>

				<div class="text-xs text-slate-400 mt-1">
					{#if trackConfig?.finishLine}
						<p class="text-green-400">Start/Finish line set!</p>
					{:else}
						<p>
							Click on the track to set the Start/Finish line. You can also set sectors if desired.
						</p>
					{/if}
				</div>
				<!-- We still send index for now as the backend helper uses it to slice the path -->
				<input type="hidden" name="finishLineIndex" value={finishLineIndex} />
			</div>
		{/if}

		<div class="pt-4 border-t border-slate-700 flex justify-end">
			<button
				type="submit"
				disabled={!selectedSessionId || !trackName || !trackConfig?.finishLine}
				class="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-6 py-2 rounded-lg transition-colors font-medium"
			>
				Create Track
			</button>
		</div>
	</form>
</div>

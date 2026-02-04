<script lang="ts">
	import { Upload, FileText, AlertCircle, CheckCircle, Loader, ArrowRight, X, MapPin, RefreshCw } from 'lucide-svelte';
	import Card from '$lib/components/Card.svelte';
	import TrackMap from '$lib/components/TrackMap.svelte';
	import { goto } from '$app/navigation';
	import { type TrackConfig } from '$lib/analysis/geo';
	import ParserWorker from './parser.worker?worker';

	let { data } = $props();

	let dragging = $state(false);
	let files: File[] = $state([]);
	let loading = $state(false);
	
	// Worker State
	let parserWorker: Worker | undefined;
	// parsedSessions removed to save memory. Worker holds source of truth.
	let reviewSessions: any[] = $state([]); // Preview data (for UI)
	
	// Upload Queue State
	let pendingUploads: any[] = $state([]);
	let uploadQueueIndex = $state(0);

	// UI State
	let reviewMode = $derived(reviewSessions.length > 0);
	let editingSession: any = $state(null);
    let mappingSession: any = $state(null); // Session being mapped
	let recalculating = $state(false);
	let uploadStatus = $state('');

    function reparseWithMapping(session: any) {
        if (!session || !session.metadata.channelMapping) return;
        
        // Find the file again
        // We find it in the 'files' array by name matching session.notes which stores filename
        // NOTE: 'session.notes' is set to fileName in worker success handler.
        const file = files.find(f => f.name === session.notes);
        if (!file) {
            alert('Original file not found in memory. Please refresh and re-upload.');
            return;
        }

        loading = true;
        uploadStatus = 'Reprocessing with new mapping...';
        mappingSession = null;

        const reader = new FileReader();
        reader.onload = (e) => {
            const text = e.target?.result as string;
            parserWorker?.postMessage({ 
                action: 'parse',
                id: session.id, // Reuse ID to update existing session in list
                file: { name: file.name, size: file.size }, 
                text,
                type: file.name.toLowerCase().endsWith('.vbo') ? 'vbo' : 'bosch',
                mapping: JSON.parse(JSON.stringify(session.metadata.channelMapping)) // PASS MAPPING
            });
        };
        reader.readAsText(file);
    }

	$effect(() => {
		// Initialize Worker
		console.log('[Main] Initialize Worker');
		parserWorker = new ParserWorker();
		parserWorker.onmessage = (e) => {
			const { type, fileName, preview, full, error } = e.data;
			console.log('[Main] Worker message received:', type);
			
			if (type === 'success') {
				console.log(`[Main] Worker finished ${fileName}`);
				
				// Add to review list (Preview Data)
				// The worker returns the ID that we sent
				const sessionPreview = {
					...preview,
					id: e.data.id, 
					name: preview.metadata.type || 'Imported Session',
					track: preview.metadata.track || 'Unknown Track',
					date: preview.metadata.date,
					notes: fileName,
					driverId: null,
					validLapsCount: preview.stats.validLapsCount, // if available
					trackConfig: { finishLine: null, sector1: null, sector2: null }
				};
				
				// Update Review Session if exists (Reparse case)
                const existingIdx = reviewSessions.findIndex(s => s.id === e.data.id);
                if (existingIdx !== -1) {
                    reviewSessions[existingIdx] = {
                        ...reviewSessions[existingIdx],
                        ...sessionPreview,
                        // Preserve previous selections like driverId if not overridden? 
                        // Actually better to reset derived data if file changed, but here file is same.
                        driverId: reviewSessions[existingIdx].driverId
                    };
                    // Force reactivity
                    reviewSessions = [...reviewSessions];
                } else {
				    reviewSessions = [...reviewSessions, sessionPreview];
                }
				// parsedSessions.push({ tempId: e.data.id, ...full }); // REMOVED optimization

				loading = false;
				uploadStatus = '';
			} else if (type === 'recalculateSuccess') {
				const { id, laps } = e.data;
				console.log(`[Main] Recalculation success for ${id}: ${laps.length} laps`);
				
				// Update Review Session
				const idx = reviewSessions.findIndex(s => s.id === id);
				if (idx !== -1) {
					reviewSessions[idx] = {
						...reviewSessions[idx],
						laps
					};
					// Force reactivity
					reviewSessions = [...reviewSessions];
				}

				// Also update editingSession if it matches
				if (editingSession?.id === id) {
					editingSession = { ...editingSession, laps };
				}

				recalculating = false;

				// Update Full Data (for upload)
				// We rely on the worker to hold the data. Visual update only.
				// If we needed to 'save' the recalculation, we'd need to tell the worker to APPLY it to the cache.
				// Currently `recalculate` in worker is non-destructive to the original session data.
			} else if (type === 'uploadReady') {
				const { id, blob } = e.data;
				handleUploadReady(id, blob);
			} else if (type === 'error') {
				console.error(`[Main] Worker error on ${fileName}:`, error);
				alert(`Failed to parse ${fileName}: ${error}`);
				loading = false;
				uploadStatus = '';
				recalculating = false;
			}
		};

		return () => {
			parserWorker?.terminate();
		};
	});

	function processFiles(fileList: File[]) {
		files = [...files, ...fileList];
		loading = true;
		uploadStatus = 'Starting worker...';

		for (const file of fileList) {
			const tempId = crypto.randomUUID(); // Unique ID for worker cache
			const reader = new FileReader();
			reader.onload = (e) => {
				const text = e.target?.result as string;
				uploadStatus = `Processing ${file.name}...`;
				parserWorker?.postMessage({ 
					action: 'parse',
					id: tempId,
					file: { name: file.name, size: file.size }, 
					text,
					type: file.name.toLowerCase().endsWith('.vbo') ? 'vbo' : 'bosch'
				});
			};
			reader.readAsText(file);
		}
	}

	function handleDrop(e: DragEvent) {
		e.preventDefault();
		dragging = false;

		if (e.dataTransfer?.files) {
			const droppedFiles = Array.from(e.dataTransfer.files).filter(
				(f) => f.name.endsWith('.txt') || f.name.endsWith('.csv') || f.name.endsWith('.vbo')
			);
			if (droppedFiles.length > 0) processFiles(droppedFiles);
		}
	}

	function handleFilesSelect(e: Event) {
		const target = e.target as HTMLInputElement;
		if (target.files) {
			const selected = Array.from(target.files).filter(
				(f) => f.name.endsWith('.txt') || f.name.endsWith('.csv') || f.name.endsWith('.vbo')
			);
			if (selected.length > 0) processFiles(selected);
		}
	}

	// Confirm & Upload Logic
	function confirmUpload() {
		if (reviewSessions.length === 0) return;

		loading = true;
		uploadStatus = 'Starting uploads...';
		
		// Initialize Queue
		pendingUploads = [...reviewSessions];
		uploadQueueIndex = 0;
		
		processNextUpload();
	}

	function processNextUpload() {
		if (uploadQueueIndex >= pendingUploads.length) {
			// All done
			goto('/sessions');
			return;
		}

		const session = pendingUploads[uploadQueueIndex];
		uploadStatus = `Preparing session ${uploadQueueIndex + 1}/${pendingUploads.length}...`;
		
		// Request Blob from Worker
		// DEEP CLONE to remove Svelte proxies which cause DataCloneError
		const payload = JSON.parse(JSON.stringify({
			action: 'prepareUpload',
			id: session.id,
			driverId: session.driverId,
			trackConfig: session.trackConfig
		}));
		
		parserWorker?.postMessage(payload);
	}

	async function handleUploadReady(id: string, blob: Blob) {
		const session = pendingUploads[uploadQueueIndex];
		if (session.id !== id) {
			console.error('Upload mismatch!', session.id, id);
			return; // Should not happen with sequential processing
		}

		console.log(`[Main] Uploading session: ${session.name}`);
		uploadStatus = `Uploading session ${uploadQueueIndex + 1}/${pendingUploads.length}...`;

		try {
			// Validation: Ensure the blob is not empty or invalid
			if (!blob || blob.size === 0) {
				throw new Error('No valid session data received from worker.');
			}

			const res = await fetch('/api/sessions/save', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: blob // STREAM IT!
			});

			if (!res.ok) {
				const errData = await res.json().catch(() => ({}));
				throw new Error(errData.details || errData.error || 'Upload failed');
			}
			const result = await res.json();
			console.log('[Main] Saved session:', result.sessionId);

			// Next
			uploadQueueIndex++;
			processNextUpload();

		} catch (e: any) {
			console.error('Upload error:', e);
			alert(`Failed to save session ${session.name}: ${e.message}`);
			loading = false;
			uploadStatus = ''; // Clear status on error
		}
	}



	function formatTime(sec: number) {
		const m = Math.floor(sec / 60);
		const s = (sec % 60).toFixed(3).padStart(6, '0');
		return `${m}:${s}`;
	}

	async function recalculateLaps(session: any) {
		if (!session.trackConfig?.finishLine) {
			console.log('[Recalculate] No finish line set');
			return;
		}

		recalculating = true;
		console.log('[Recalculate] Requesting worker recalculation for session', session.id);

		// Deep clone the entire payload to Ensure no Svelte proxies are passed to postMessage
		const payload = JSON.parse(JSON.stringify({
			action: 'recalculate',
			id: session.id,
			config: session.trackConfig
		}));
		parserWorker?.postMessage(payload);
	}
</script>

<div class="min-h-screen p-6 md:p-12 text-slate-200">
	<div class="max-w-4xl mx-auto">
		<header class="mb-8 text-center">
			<h1 class="text-3xl font-bold text-white mb-2">Import Telemetry</h1>
			<p class="text-slate-400">Upload raw ECU export files to generate session data.</p>
		</header>

		{#if !reviewMode}
			<!-- UPLOAD STEP -->
			<Card class="p-8">
				<div class="space-y-6">
					<!-- Drop Zone -->
					<!-- svelte-ignore a11y_click_events_have_key_events -->
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<div
						class="border-2 border-dashed rounded-xl p-12 text-center transition-all duration-200 cursor-pointer mb-6 relative
                    {dragging
							? 'border-orange-500 bg-orange-500/10'
							: 'border-slate-700 hover:border-slate-500 hover:bg-slate-900/50'}
                    {loading ? 'opacity-50 pointer-events-none' : ''}"
						ondrop={handleDrop}
						ondragover={(e) => {
							e.preventDefault();
							dragging = true;
						}}
						ondragleave={() => (dragging = false)}
						onclick={() => document.getElementById('fileInput')?.click()}
					>
						<input
							type="file"
							id="fileInput"
							name="file"
							multiple
							class="hidden"
							accept=".txt,.csv,.vbo"
							onchange={handleFilesSelect}
						/>

						{#if loading}
							<Loader class="w-12 h-12 text-orange-500 animate-spin mx-auto mb-4" />
							<p class="text-slate-300 font-medium">{uploadStatus}</p>
						{:else}
							<Upload class="w-12 h-12 text-slate-600 mx-auto mb-4" />
							<p class="text-slate-300 font-medium text-lg">Drop raw data files here</p>
							<p class="text-sm text-slate-500 mt-2">Supports multiple files (.txt, .csv, .vbo)</p>
						{/if}
					</div>
				</div>
			</Card>
		{:else}
			<!-- REVIEW STEP -->
			<div class="space-y-6">
				<div class="flex items-center justify-between">
					<h2 class="text-xl font-semibold text-white">Review & Confirm Imports</h2>
					<div class="text-sm text-slate-400">
						Showing {reviewSessions.length} pending session{reviewSessions.length !== 1 ? 's' : ''}
					</div>
				</div>

				{#each reviewSessions as session (session.id)}
					<Card class="p-6 border-l-4 border-l-orange-500">
						<div class="flex flex-col md:flex-row gap-6 mb-6">
							<div class="flex-1">
								<h3 class="text-lg font-bold text-white mb-1">{session.track}</h3>
								<p class="text-sm text-slate-400 mb-2">
									{new Date(session.date).toLocaleDateString()} • {session.name}
								</p>
								<div class="text-xs text-slate-500 italic">Source: {session.notes}</div>
								
								<div class="flex items-center gap-2 mt-4">
                                    <button
                                        class="flex items-center gap-2 text-xs font-semibold px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded transition-colors"
                                        onclick={() => {
                                            if (!session.trackConfig) {
                                                session.trackConfig = { finishLine: null, sector1: null, sector2: null };
                                            }
                                            editingSession = session;
                                        }}
                                        disabled={!session.gpsData}
                                        title={!session.gpsData ? 'No GPS data available for map' : ''}
                                    >
                                        <MapPin class="w-4 h-4" />
                                        Preview Map
                                        {#if session.gpsData?.lat}
                                            <span class="text-[10px] opacity-50">({session.gpsData.lat.length} pts)</span>
                                        {/if}
                                    </button>

                                    <!-- Channel Mapping Button -->
                                    <button
                                        class="flex items-center gap-2 text-xs font-semibold px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded transition-colors"
                                        onclick={() => {
                                            console.log('Opening mapping for session:', session.id, session.metadata);
                                            mappingSession = session;
                                        }}
                                    >
                                        <FileText class="w-4 h-4" />
                                        Map Channels
                                    </button>
                                </div>
							</div>

							<!-- Driver Selection -->
							<div class="w-full md:w-64">
								<label
									class="block text-xs font-medium text-slate-500 mb-1 uppercase tracking-wider"
									>Assigned Driver</label
								>
								<select
									bind:value={session.driverId}
									class="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm text-white focus:border-orange-500"
								>
									<option value={null}>-- Select Driver --</option>
									{#each data.drivers as drv}
										<option value={drv.id}>{drv.name}</option>
									{/each}
								</select>
							</div>
						</div>

						<!-- Lap Table Preview -->
						<div class="bg-slate-950/50 rounded-lg border border-slate-800 overflow-hidden">
							<table class="w-full text-left text-sm">
								<thead class="bg-slate-900/80 text-xs text-slate-500 uppercase">
									<tr>
										<th class="p-3 font-medium">Lap</th>
										<th class="p-3 font-medium">Time</th>
										<th class="p-3 font-medium text-center">Valid?</th>
									</tr>
								</thead>
								<tbody class="divide-y divide-slate-800/50">
									{#each session.laps as lap}
										<tr class={!lap.valid ? 'opacity-50 bg-red-950/10' : 'hover:bg-slate-900/30'}>
											<td class="p-3 font-mono text-slate-400">#{lap.lapNumber}</td>
											<td class="p-3 font-mono font-medium text-slate-200">
												{formatTime(lap.time)}
												{#if !lap.valid}
													<span class="ml-2 text-[10px] text-red-500 uppercase tracking-wide border border-red-900/50 px-1 rounded">Inv</span>
												{/if}
											</td>
											<td class="p-3 text-center">
												<input
													type="checkbox"
													bind:checked={lap.valid}
													class="rounded bg-slate-800 border-slate-700 text-orange-500 focus:ring-orange-500/20"
												/>
											</td>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
					</Card>
				{/each}

				<div class="flex justify-end gap-4 mt-8">
					<a href="/sessions" class="px-6 py-2 text-slate-400 hover:text-white font-medium"
						>Cancel</a
					>
					<button
						onclick={confirmUpload}
						disabled={loading}
						class="px-8 py-3 bg-orange-600 hover:bg-orange-500 text-white font-bold rounded-lg shadow-lg shadow-orange-900/20 transition-all flex items-center gap-2"
					>
						{#if loading}
							{uploadStatus}
						{:else}
							<CheckCircle class="w-5 h-5" /> Confirm Import
						{/if}
					</button>
				</div>
			</div>
			
			<!-- Map Config Modal (Read Only Preview) -->
			{#if editingSession}
				<!-- MAP PREVIEW MODAL -->
				<div class="fixed inset-0 z-50 flex items-center justify-center p-4">
					<!-- svelte-ignore a11y_click_events_have_key_events -->
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<div class="absolute inset-0 bg-black/80 backdrop-blur-sm" onclick={() => editingSession = null}></div>
					<!-- svelte-ignore a11y_click_events_have_key_events -->
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<div class="relative w-full max-w-5xl h-[80vh] bg-slate-900 rounded-xl shadow-2xl border border-slate-800 flex flex-col" onclick={(e) => e.stopPropagation()}>
						<header class="p-4 border-b border-slate-800 flex justify-between items-center">
							<h3 class="font-bold text-white">Preview Track & Start/Finish</h3>
							<button onclick={() => editingSession = null} class="text-slate-400 hover:text-white"><X class="w-6 h-6"/></button>
						</header>
						<div class="flex-1 relative bg-slate-950 flex flex-col min-h-0">
							<!-- PERFORMANCE: Only render map when modal is open -->
							{#if editingSession.gpsData}
								<div class="relative w-full h-full">
									{#key editingSession.id}
										<TrackMap
											data={editingSession.gpsData}
											editable={true}
											bind:trackConfig={editingSession.trackConfig}
											onConfigChange={(newConfig: TrackConfig) => {
												console.log('Config changed', newConfig);
												recalculateLaps(editingSession);
											}}
										/>
									{/key}
									
									{#if recalculating}
										<div class="absolute inset-0 bg-black/50 flex items-center justify-center z-10">
											<div class="bg-slate-900 p-4 rounded-lg shadow-xl flex items-center gap-3 border border-slate-700">
												<RefreshCw class="w-5 h-5 animate-spin text-orange-500" />
												<span class="text-white font-medium">Recalculating...</span>
											</div>
										</div>
									{/if}
								</div>
							{:else}
								<div class="flex items-center justify-center h-full text-slate-400">
									<p>No GPS data available for this session</p>
								</div>
							{/if}
						</div>
						<footer class="p-4 border-t border-slate-800 flex items-center justify-between gap-4 bg-slate-900/80">
							<p class="text-xs text-slate-400">
								Note: Advanced track configuration is available after import.
							</p>
							<div class="flex gap-3">
								<button
									onclick={() => {
										mappingSession = editingSession;
										editingSession = null;
									}}
									class="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-semibold rounded-lg transition-colors"
								>
									<FileText class="w-4 h-4" />
									Map Channels
								</button>
								<button
									onclick={() => editingSession = null}
									class="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white font-semibold rounded-lg transition-colors"
								>
									Close Preview
								</button>
							</div>
						</footer>
					</div>
				</div>
			{/if}

            {#if mappingSession}
                <!-- CHANNEL MAPPING MODAL -->
                <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <!-- svelte-ignore a11y_click_events_have_key_events -->
                    <!-- svelte-ignore a11y_no_static_element_interactions -->
                    <div class="absolute inset-0 bg-black/80 backdrop-blur-sm" onclick={() => mappingSession = null}></div>
                    <div class="relative w-full max-w-2xl bg-slate-900 rounded-xl shadow-2xl border border-slate-800 flex flex-col max-h-[90vh]" onclick={(e) => e.stopPropagation()}>
                        <header class="p-6 border-b border-slate-800 flex justify-between items-center bg-slate-900 rounded-t-xl">
                            <div>
                                <h3 class="text-xl font-bold text-white">Map Telemetry Channels</h3>
                                <p class="text-sm text-slate-400">Confirm which file columns correspond to standard channels.</p>
                            </div>
                            <button onclick={() => mappingSession = null} class="text-slate-400 hover:text-white"><X class="w-6 h-6"/></button>
                        </header>
                        
                        <div class="p-6 overflow-y-auto space-y-4">
                            {#if mappingSession.metadata.columns}
                                <div class="grid grid-cols-1 gap-4">
                                    {#each ['velocity', 'rpm', 'throttle', 'brake', 'steer', 'gear', 'lat', 'long'] as channel}
                                        <div class="flex items-center justify-between p-3 bg-slate-950 rounded border border-slate-800">
                                            <div class="flex items-center gap-3">
                                                 <span class="text-sm font-bold text-slate-300 capitalize w-24">{channel}</span>
                                                 <!-- Status Indicator -->
                                                 {#if mappingSession.metadata.channelMapping?.[channel]}
                                                     <CheckCircle class="w-4 h-4 text-emerald-500" />
                                                 {:else}
                                                     <AlertCircle class="w-4 h-4 text-orange-500" />
                                                 {/if}
                                            </div>
                                            
                                            <select
                                                value={mappingSession.metadata.channelMapping?.[channel] || ''}
                                                onchange={(e) => {
                                                    const val = e.currentTarget.value;
                                                    // Update local mapping state for preview
                                                    if (!mappingSession.metadata.channelMapping) mappingSession.metadata.channelMapping = {};
                                                    mappingSession.metadata.channelMapping[channel] = val;
                                                }}
                                                class="bg-slate-800 border-slate-700 text-white text-sm rounded px-3 py-1 w-64 focus:border-orange-500"
                                            >
                                                <option value="">-- Not Mapped --</option>
                                                {#each mappingSession.metadata.columns as col}
                                                    <option value={col}>{col}</option>
                                                {/each}
                                            </select>
                                        </div>
                                    {/each}
                                </div>
                            {:else}
                                <div class="text-center p-8 text-slate-500">
                                    No column information available for this file.
                                </div>
                            {/if}
                        </div>

                        <footer class="p-4 border-t border-slate-800 flex justify-end gap-3 bg-slate-900 rounded-b-xl">
                            <button
                                onclick={() => mappingSession = null}
                                class="px-4 py-2 text-slate-400 hover:text-white"
                            >
                                Cancel
                            </button>
                            <button
                                onclick={() => reparseWithMapping(mappingSession)}
                                class="px-6 py-2 bg-orange-600 hover:bg-orange-500 text-white font-bold rounded"
                            >
                                Apply & Reprocess
                            </button>
                        </footer>
                    </div>
                </div>
            {/if}

		{/if}
	</div>
</div>

<script lang="ts">
	import UniversalPlayer from '$lib/components/UniversalPlayer.svelte';
	import {
		Timer,
		User,
		RefreshCw
	} from 'lucide-svelte';
	import Card from '$lib/components/Card.svelte';
	import TelemetryChart from '$lib/components/TelemetryChart.svelte';
	import TrackMap from '$lib/components/TrackMap.svelte';
	import { analyzeLap, calculateDerivedChannels, type CoachingTip } from '$lib/analysis/telemetry';

	let { data } = $props();
    const { permissions } = data;

	// State
	let hoverTime = $state(0);
	let selectedLapNumber = $state(-1);
	let showAllLaps = $state(false);
	let outlierThreshold = $state(5);

	// Video State
	let videoSource = $state<'session' | 'fastest_lap'>('session');
	let playerComponent = $state<UniversalPlayer>();
    let videoRotation = $state(0);
	let isVideoPlaying = $state(false);
	let userInteractingWithChart = $state(false);

	// Sync Video to Chart (Cursor -> Video)
	$effect(() => {
		if (!session.videoUrl && session.fastestLapVideoUrl && videoSource === 'session') {
			videoSource = 'fastest_lap';
		}
	});

	$effect(() => {
		if (playerComponent && !isVideoPlaying && userInteractingWithChart && displayData && selectedLap) {
			// Priority 1: Use Native AVI Time
			if (displayData.avitime && displayData.avitime.length > 0 && displayData.time) {
				// Find index for current hoverTime
				let idx = -1;
				// hoverTime is relative to LAP start.
				for (let i = 0; i < displayData.time.length; i++) {
					if (displayData.time[i] >= hoverTime) {
						idx = i;
						break;
					}
				}
				if (idx !== -1) {
					const targetAviTime = normalizeAviTime(displayData.avitime[idx]);
					if (targetAviTime > 0) playerComponent.seekTo(targetAviTime);
				}
			} else {
				// Priority 2: Manual Calculated Offset
				const targetVTime = getVideoTimeFromLapTime(hoverTime, selectedLap.lapNumber);
				if (targetVTime !== null) playerComponent.seekTo(targetVTime);
			}
		}
	});

	// Sync Chart to Video (Video -> Cursor)
	function onVideoTimeUpdate(vTime: number) {
		if (!playerComponent || !isVideoPlaying || !displayData || !selectedLap) return;

		// Priority 1: Use Native AVI Time
		if (displayData.avitime && displayData.avitime.length > 0 && displayData.time) {
			// Find closest data point with this AVI Time
			let idx = -1;
			for (let i = 0; i < displayData.avitime.length; i++) {
                // Determine normalized time for this point
                const ptTime = normalizeAviTime(displayData.avitime[i]);
				if (ptTime >= vTime) {
					idx = i;
					break;
				}
			}

			if (idx !== -1) {
				hoverTime = displayData.time[idx];
			}
		} else {
			// Priority 2: Manual Offset
			const calculatedHoverTime = getLapTimeFromVideoTime(vTime, selectedLap.lapNumber);
			const maxLapTime = displayData.time[displayData.time.length - 1] || 100;
			const newHoverTime = Math.max(0, Math.min(maxLapTime, calculatedHoverTime));

            if (!isNaN(newHoverTime)) {
                hoverTime = newHoverTime;
            }
		}
	}

	// Helpers with refined logic
	function getFilteredLaps(laps: any[], showAll: boolean, thresholdDelta: number) {
		if (!laps || laps.length === 0) return [];
		if (showAll) return laps;

		let valid = laps.filter((l) => l.valid);
		if (valid.length === 0) return laps;

		const times = valid.map((l) => l.timeSeconds).sort((a, b) => a - b);
		const minTime = times[0];
		const threshold = minTime + thresholdDelta;

		return valid.filter((l) => l.timeSeconds <= threshold);
	}

	function getBest(laps: any[]) {
		const valid = laps.filter((l) => l.valid);
		return valid.length > 0
			? valid.reduce((prev, curr) => (prev.timeSeconds < curr.timeSeconds ? prev : curr))
			: null;
	}

	function getAvg(laps: any[]) {
		const clean = getFilteredLaps(laps, false, outlierThreshold);
		return clean.length > 0 ? clean.reduce((sum, l) => sum + l.timeSeconds, 0) / clean.length : 0;
	}

	function formatLapTime(totalSeconds: number) {
		if (totalSeconds === null || totalSeconds === undefined || isNaN(totalSeconds)) return '--:--';
		const mins = Math.floor(totalSeconds / 60);
		const secs = totalSeconds % 60;
		const secsStr = secs.toFixed(3).padStart(6, '0');
		return `${mins}:${secsStr}`;
	}

	// Derived values
	const session = $derived(data.session);

	const laps = $derived(data.laps);

	const graphLaps = $derived(getFilteredLaps(laps, showAllLaps, outlierThreshold));
	const bestLap = $derived(getBest(laps));
	const avgLap = $derived(getAvg(laps));

	// Chart Configuration State
	type LayoutConfig = {
		id: string;
		title: string;
		heightWeight: number;
		min?: number;
		max?: number;
		channels: { variable: string; color: string; label: string }[];
	}[];

	const defaultConfig: LayoutConfig = [
		{
			id: 'p0',
			title: 'Delta',
			heightWeight: 1,
			channels: [{ variable: 'variance', color: '#f59e0b', label: 'Time Delta (+ Lost)' }]
		},
		{
			id: 'p1',
			title: 'Speed',
			heightWeight: 2,
			channels: [{ variable: 'speed', color: '#3b82f6', label: 'Speed' }]
		},
		{
			id: 'p2',
			title: 'RPM',
			heightWeight: 1,
			channels: [{ variable: 'rpm', color: '#eab308', label: 'RPM' }]
		},
		{
			id: 'p3',
			title: 'Throttle',
			heightWeight: 1,
			channels: [{ variable: 'throttle', color: '#22c55e', label: 'Throttle' }]
		},
		{
			id: 'p4',
			title: 'Brake',
			heightWeight: 1,
			channels: [{ variable: 'brake', color: '#ef4444', label: 'Brake' }]
		}
	];
	let chartConfig = $state((session.telemetryConfig as LayoutConfig) || defaultConfig);

	const selectedLap = $derived(
		selectedLapNumber !== -1
			? laps.find((l) => l.lapNumber === selectedLapNumber)
			: bestLap || laps[0]
	);

	const displayData = $derived(
		selectedLap && selectedLap.telemetryData
			? {
					...selectedLap.telemetryData,
					...calculateDerivedChannels(
						selectedLap.telemetryData,
						selectedLap.lapNumber !== bestLap?.lapNumber ? bestLap?.telemetryData : null
					)
				}
			: null
	);

	// Analysis State
	let enabledAnalysis = $state({
		coasting: true,
		braking: true,
		throttle: true,
		steering: true
	});

	// Analysis with logging
	let coachingTips: CoachingTip[] = $state([]);
	let isAnalyzing = $state(false);

	const filteredTips = $derived(coachingTips.filter((tip) => enabledAnalysis[tip.type]));

	$effect(() => {
        if (!permissions.showAi) {
            coachingTips = [];
            return;
        }
        // Run analysis when selectedLap changes (and has data)
		if (selectedLap && selectedLap.telemetryData) {
			isAnalyzing = true;
			setTimeout(() => {
				try {
					const tips = analyzeLap(selectedLap.telemetryData);
					coachingTips = tips;
				} catch (e) {
					console.error('[Analysis] Error:', e);
					coachingTips = [];
				} finally {
					isAnalyzing = false;
				}
			}, 10);
		} else {
			coachingTips = [];
			isAnalyzing = false;
		}
	});

    function getVideoSrc(url: string | null | undefined) {
        if (!url) return '';
        if (url.startsWith('http')) return url;
        const isLocal = url.startsWith('/') || /^[a-zA-Z]:/.test(url);
        if (isLocal) {
            return `/api/video/stream?path=${encodeURIComponent(url)}`;
        }
        return url;
    }

    function normalizeAviTime(t: number) {
        if (!t) return 0;
        if (t > 100000) return t / 1000000;
        return t;
    }

    function getLapStartTime(lapNum: number) {
		let start = 0;
		const sorted = [...laps].sort((a, b) => a.lapNumber - b.lapNumber);
		for (const l of sorted) {
			if (l.lapNumber === lapNum) break;
			start += l.timeSeconds;
		}
		return start;
	}
	
	function getVideoTimeFromLapTime(lapRelTime: number, lapNum: number): number | null {
		const currentOffset = videoSource === 'session' ? session.videoOffset || 0 : session.fastestLapVideoOffset || 0;
		if (videoSource === 'session') {
			const lapStart = getLapStartTime(lapNum);
			return lapStart + lapRelTime + currentOffset;
		} else {
			return lapRelTime + currentOffset; 
		}
	}
	
	function getLapTimeFromVideoTime(vTime: number, lapNum: number): number {
		const currentOffset = videoSource === 'session' ? session.videoOffset || 0 : session.fastestLapVideoOffset || 0;
		if (videoSource === 'session') {
			const lapStart = getLapStartTime(lapNum);
			return vTime - currentOffset - lapStart;
		} else {
			return vTime - currentOffset;
		}
	}

	const videoOverlays = $derived(
		filteredTips.map(tip => {
			const start = getVideoTimeFromLapTime(tip.startTime, selectedLap.lapNumber) ?? -100;
			const end = getVideoTimeFromLapTime(tip.endTime, selectedLap.lapNumber) ?? -100;
			return {
				...tip,
				startTime: start,
				endTime: end
			};
		})
	);
</script>

<div class="min-h-screen p-6 md:p-12 text-slate-700 dark:text-slate-200">
	<div class="mb-8 border-b border-slate-200 dark:border-slate-800 pb-8">
		<div class="flex flex-col md:flex-row justify-between items-start">
			<div class="flex-1">
				<div class="flex items-center gap-3 mb-2">
					<span
						class="px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wider bg-orange-600 text-white shadow-lg shadow-orange-900/40"
					>
						{session.name}
					</span>
					<span class="text-sm text-slate-400 dark:text-slate-500"
						>{new Date(session.date).toLocaleDateString()}</span
					>
				</div>

                <h1 class="text-4xl font-bold text-slate-900 dark:text-white mb-2">{session.track}</h1>
                {#if session.driverName}
                    <div class="flex items-center gap-2 mb-2">
                        <User class="w-4 h-4 text-slate-400 dark:text-slate-500" />
                        <span class="text-sm font-semibold" style="color: {session.driverColor}"
                            >{session.driverName}</span
                        >
                    </div>
                {/if}
                {#if session.notes}
                    <p class="text-slate-500 dark:text-slate-400 italic font-light max-w-2xl">
                        "{session.notes}"
                    </p>
                {/if}
			</div>
			<div
				class="flex gap-8 mt-6 md:mt-0 bg-white dark:bg-slate-900/50 p-6 rounded-xl border border-slate-200 dark:border-slate-800 backdrop-blur-sm shadow-sm dark:shadow-none"
			>
				<div class="text-center">
					<span
						class="block text-xs uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1"
						>Best Lap</span
					>
					<span class="text-3xl font-mono font-bold text-emerald-500 dark:text-emerald-400">
						{bestLap ? formatLapTime(bestLap.timeSeconds) : '--:--'}
					</span>
				</div>
				<div class="text-center">
					<span
						class="block text-xs uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1"
						>Avg Lap</span
					>
					<span class="text-3xl font-mono font-bold text-blue-500 dark:text-blue-400">
						{formatLapTime(avgLap)}
					</span>
				</div>
				<div class="text-center">
					<span
						class="block text-xs uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1"
						>Laps</span
					>
					<span class="text-3xl font-mono font-bold text-slate-700 dark:text-slate-200"
						>{laps.length}</span
					>
				</div>
			</div>
		</div>
	</div>

    {#if permissions.showVideo}
		<!-- Video Section -->
		{#if (session.videoUrl || session.fastestLapVideoUrl)}
			{@const currentVideoUrl =
				videoSource === 'session' ? session.videoUrl : session.fastestLapVideoUrl}
			
			<div class="mb-8">
				<Card title="Onboard Video">
					{#if session.videoUrl && session.fastestLapVideoUrl}
						<div class="flex gap-2 mb-4 bg-slate-100 dark:bg-slate-900 p-1 rounded-lg w-fit">
							<button
								class="px-3 py-1 text-xs font-semibold rounded-md transition-colors {videoSource ===
								'session'
									? 'bg-white dark:bg-slate-800 shadow text-slate-900 dark:text-white'
									: 'text-slate-500 hover:text-slate-900 dark:hover:text-white'}"
								onclick={() => (videoSource = 'session')}
							>
								Full Session
							</button>
							<button
								class="px-3 py-1 text-xs font-semibold rounded-md transition-colors {videoSource ===
								'fastest_lap'
									? 'bg-white dark:bg-slate-800 shadow text-slate-900 dark:text-white'
									: 'text-slate-500 hover:text-slate-900 dark:hover:text-white'}"
								onclick={() => (videoSource = 'fastest_lap')}
							>
								Fastest Lap
							</button>
						</div>
					{:else if session.fastestLapVideoUrl && !session.videoUrl}
						<div class="mb-2 text-xs text-slate-500">Fastest Lap Video</div>
					{/if}

					<div class="relative w-full aspect-video bg-black rounded overflow-hidden">
						<!-- svelte-ignore a11y_media_has_caption -->
						{#key currentVideoUrl}
							<UniversalPlayer
								bind:this={playerComponent}
								src={getVideoSrc(currentVideoUrl)}
								rotation={videoRotation}
								onPlay={() => (isVideoPlaying = true)}
								onPause={() => (isVideoPlaying = false)}
								onTimeUpdate={onVideoTimeUpdate}
								overlays={permissions.showAi ? videoOverlays : []}
							/>
						{/key}
                        
                        {#if currentVideoUrl}
                            <div class="absolute bottom-4 right-4 z-20">
                                <button 
                                    class="px-2 py-1 bg-black/50 text-white rounded text-xs hover:bg-black/70"
                                    onclick={() => videoRotation = (videoRotation + 90) % 360}
                                    title="Rotate Video"
                                >
                                    <RefreshCw class="w-4 h-4" />
                                </button>
                            </div>
                        {/if}
					</div>
				</Card>
			</div>
		{/if}
    {/if}

    {#if permissions.showTelemetry}
		<!-- Telemetry Section -->
		<div class="mb-8 space-y-4">
			{#if selectedLap}
				{#if displayData}
                    <Card title="Telemetry Analysis">
                        <div class="h-[300px] w-full relative">
                            <TelemetryChart
                                data={displayData}
                                config={chartConfig}
                                cursorTime={hoverTime}
                                onHover={(t) => {
                                    hoverTime = t;
                                    userInteractingWithChart = true;
                                }}
                            />
                        </div>
                    </Card>
				{:else}
                    <Card title="Telemetry Analysis">
                        <div class="text-center py-12 text-slate-500">
                            Telemetry data not available for this lap or not loaded.
                        </div>
                    </Card>
				{/if}
			{:else}
				<div class="text-center py-12 text-slate-500">Select a lap to view telemetry</div>
			{/if}
		</div>
    {/if}
    
    {#if permissions.showTelemetry}
        <!-- Track Map -->
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div class="lg:col-span-1">
                <Card title="Track Map">
                    <div class="aspect-square bg-slate-100 dark:bg-slate-900 rounded-lg overflow-hidden relative">
                        {#if session.trackConfig && (session.trackConfig.finishLine || session.trackConfig.sector1)}
                             <!-- Use session track config if available -->
                             <TrackMap 
                                pathData={session.trackPathData} 
                                {hoverTime} 
                                lapData={displayData}
                                finishLine={session.trackConfig.finishLine}
                                sector1={session.trackConfig.sector1}
                                sector2={session.trackConfig.sector2}
                                width={400} 
                                height={400} 
                            />
                        {:else if laps.length > 0}
                             <!-- Fallback to generic -->
                            <TrackMap pathData={null} {hoverTime} lapData={displayData} width={400} height={400} />
                        {:else}
                            <div class="flex items-center justify-center h-full text-slate-400">
                                No Track Data
                            </div>
                        {/if}
                    </div>
                </Card>
            </div>
            
            <div class="lg:col-span-2 space-y-6">
                <Card title="Laps">
                    <div class="overflow-x-auto">
                        <table class="w-full text-sm text-left">
                            <thead class="text-xs uppercase bg-slate-50 dark:bg-slate-900 text-slate-500">
                                <tr>
                                    <th class="px-4 py-3">Lap</th>
                                    <th class="px-4 py-3">Time</th>
                                    <th class="px-4 py-3">S1</th>
                                    <th class="px-4 py-3">S2</th>
                                    <th class="px-4 py-3">S3</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
                                {#each graphLaps as lap}
                                    <tr 
                                        class="hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer {selectedLapNumber === lap.lapNumber ? 'bg-blue-50 dark:bg-blue-900/20' : ''}"
                                        onclick={() => {
                                            selectedLapNumber = lap.lapNumber;
                                            hoverTime = 0;
                                        }}
                                    >
                                        <td class="px-4 py-3 font-medium">
                                            {lap.lapNumber}
                                            {#if !lap.valid}
                                                <span class="ml-2 text-[10px] text-red-500 bg-red-100 dark:bg-red-900/30 px-1 rounded">INV</span>
                                            {/if}
                                        </td>
                                        <td class="px-4 py-3 font-mono {bestLap?.lapNumber === lap.lapNumber ? 'text-emerald-600 font-bold' : ''}">
                                            {formatLapTime(lap.timeSeconds)}
                                        </td>
                                        <td class="px-4 py-3 text-slate-500">{formatLapTime(lap.s1)}</td>
                                        <td class="px-4 py-3 text-slate-500">{formatLapTime(lap.s2)}</td>
                                        <td class="px-4 py-3 text-slate-500">{formatLapTime(lap.s3)}</td>
                                    </tr>
                                {/each}
                            </tbody>
                        </table>
                    </div>
                </Card>
            </div>
        </div>
    {/if}

    {#if permissions.showAi && permissions.showTelemetry}
        <!-- AI Coaching -->
        {#if filteredTips.length > 0}
            <div class="mt-8">
                <Card title="AI Analysis">
                     <div class="space-y-2">
                        {#each filteredTips as tip}
                            <div class="p-3 bg-slate-50 dark:bg-slate-900 rounded border border-slate-100 dark:border-slate-800">
                                <div class="flex items-start gap-3">
                                    <div class="mt-1">
                                        {#if tip.severity === 'high'}
                                            <div class="w-2 h-2 rounded-full bg-red-500"></div>
                                        {:else if tip.severity === 'medium'}
                                            <div class="w-2 h-2 rounded-full bg-orange-500"></div>
                                        {:else}
                                            <div class="w-2 h-2 rounded-full bg-blue-500"></div>
                                        {/if}
                                    </div>
                                    <div>
                                        <h4 class="font-medium text-sm">{tip.title}</h4>
                                        <p class="text-xs text-slate-500 mt-1">{tip.description}</p>
                                        <div class="mt-2 flex gap-2">
                                            <button 
                                                class="text-[10px] px-2 py-1 bg-slate-200 dark:bg-slate-800 rounded hover:bg-slate-300 dark:hover:bg-slate-700"
                                                onclick={() => {
                                                    hoverTime = tip.startTime;
                                                }}
                                            >
                                                Jump to Event
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        {/each}
                     </div>
                </Card>
            </div>
        {/if}
    {/if}
</div>

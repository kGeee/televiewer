<script lang="ts">
	import { applyAction, enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
    import { browser } from '$app/environment';
    import { fly } from 'svelte/transition';
	import { Upload } from 'tus-js-client'; // Import TUS client
	import UniversalPlayer from '$lib/components/UniversalPlayer.svelte';
	import {
		ArrowLeft,
		Timer,
		Gauge,
		Thermometer,
		Wind,
		Zap,
		Activity,
		User,
		Video,
		Play,
		Pause,
		RefreshCw,
		Share2,
		X,
		Copy,
		Check,
		UploadCloud,
        FileText,
        ArrowRight,
        AlertCircle,
        Loader,
        Flag
	} from 'lucide-svelte';
	import Card from '$lib/components/Card.svelte';
	import TelemetryChart from '$lib/components/TelemetryChart.svelte';
	import TrackMap from '$lib/components/TrackMap.svelte';
	import { analyzeLap, calculateDerivedChannels, type CoachingTip } from '$lib/analysis/telemetry';
	import ParserWorker from '../import/parser.worker?worker';

	let { data } = $props();

	// State
	const session = $derived(data.session);
	// Mutable state for editing
	let editingSession = $state({ ...data.session }); // Clone for editing
	
    // Remap State
    let parserWorker: Worker | undefined;
    let files: File[] = $state([]);
    let mappingSession: any = $state(null);
    let remapLoading = $state(false);
    let showRemapModal = $state(false);
    let finalizingRemap = false;
    let mergeLoading = $state(false);
    let mergePreview: {
        file: File;
        type: string;
        channels: string[];
        units: Record<string, string>;
        sampleCounts: Record<string, number>;
        lapsWithCoverage: number;
        totalLaps: number;
        matchedLaps: { primaryLap: number; secondaryLap: number; durationDiff: number }[];
        unmatchedPrimaryLaps: number[];
        shift: number;
    } | null = $state(null);
    let mergeSelectedChannels: Record<string, boolean> = $state({});

	$effect(() => {
		// Keep editingSession in sync if data changes (e.g. after save) AND we are not editing
		if (!isEditing) {
			editingSession = { ...data.session };
		}
	});

	let hoverTime = $state(0);
	let hoverXValue = $state<number | null>(null); // X-axis value (distance or time) for precise cursor positioning
	let selectedLapNumber = $state(-1);
	let isEditing = $state(false);
	let showAllLaps = $state(false);
	let outlierThreshold = $state(5);

	// Debounce helper for performance
	let hoverDebounceTimeout: number | null = null;

	// Video State
	let videoSource = $state<'session' | 'fastest_lap'>('session');
	let playerComponent = $state<UniversalPlayer>();
	let videoRotation = $state(0);
	let isVideoPlaying = $state(false);
	let videoTime = $state(0);
	let userInteractingWithChart = $state(false);

	// Upload State
	let isUploading = $state(false);
	let uploadProgress = $state(0);
	let uploadStatus = $state('');
	let fileInput = $state<HTMLInputElement>();

    // Local Video Playback State
    let localVideoUrl = $state<string | null>(null);
    let localFileName = $state<string | null>(null);  // Track filename for UI
    let localFileInput = $state<HTMLInputElement>();

	// Share State
	let showShareModal = $state(false);
	let shareConfig = $state({
		showTelemetry: true,
		showVideo: true,
		showAi: true
	});
	let generatedLink = $state<string | null>(null);
	let isGeneratingLink = $state(false);
	let hasCopiedLink = $state(false);

	// Track Config Modal
	let showTrackConfig = $state(false);
	let editingTrackConfig = $state(session.trackConfig || { finishLine: null });
	// Optimization Status State (separate from session to allow lightweight polling)
	let optimizationStatus = $state(session.optimizationStatus || 'none');

	$effect(() => {
		// Sync from server data (in case of page reload or initial load)
		if (session.optimizationStatus) {
			optimizationStatus = session.optimizationStatus;
		}
	});
    
    // Remap Logic
    $effect(() => {
        if (!browser) return;
        parserWorker = new ParserWorker();
        parserWorker.onmessage = async (e) => {
            const { type, fileName, preview, id, blob, error } = e.data;
            console.log('[Remap] Worker message:', type);

            if (type === 'success') {
                // If we were finalizing, now proceeding to upload
                if (finalizingRemap) {
                     console.log('[Remap] Re-parse complete. Preparing upload...');
                     const payload = JSON.parse(JSON.stringify({
                        action: 'prepareUpload',
                        id: 'remap',
                        driverId: session.driverId,
                        trackConfig: session.trackConfig
                    }));
                    parserWorker?.postMessage(payload);
                    return; // Keep loading true
                }

                // Normal load/preview
                mappingSession = {
                    ...preview,
                    id: id || 'temp',
                    notes: fileName
                };
                remapLoading = false;
            } else if (type === 'uploadReady') {
                // Upload to Replace API
                await replaceSessionData(blob);
                finalizingRemap = false;
            } else if (type === 'error') {
                alert(`Error: ${error}`);
                remapLoading = false;
                finalizingRemap = false;
            }
        };

        return () => {
            parserWorker?.terminate();
        };
    });

    function handleRemapFileSelect(e: Event) {
        const target = e.target as HTMLInputElement;
        if (target.files && target.files.length > 0) {
            const file = target.files[0];
            files = [file]; // Store file
            remapLoading = true;
            finalizingRemap = false;
            
            const reader = new FileReader();
            reader.onload = (e) => {
                const text = e.target?.result as string;
                parserWorker?.postMessage({ 
                    action: 'parse',
                    id: 'remap',
                    file: { name: file.name, size: file.size }, 
                    text,
                    type: file.name.toLowerCase().endsWith('.vbo') ? 'vbo' : 'bosch',
                    trackConfig: session.trackConfig // PASS CONFIG
                });
            };
            reader.readAsText(file);
        }
    }

    function reparseWithMapping(session: any) {
        if (!session || !session.metadata.channelMapping || files.length === 0) return;
        const file = files[0];
        
        remapLoading = true;
        const reader = new FileReader();
        reader.onload = (e) => {
            const text = e.target?.result as string;
            parserWorker?.postMessage({ 
                action: 'parse', // Parse again with mapping to update preview/stats
                id: 'remap',
                file: { name: file.name, size: file.size }, 
                text,
                type: file.name.toLowerCase().endsWith('.vbo') ? 'vbo' : 'bosch',
                mapping: JSON.parse(JSON.stringify(session.metadata.channelMapping)),
                trackConfig: session.trackConfig // PASS CONFIG
            });
        };
        reader.readAsText(file);
    }
    
    function applyRemap() {
        if (!mappingSession) return;
        remapLoading = true;
        finalizingRemap = true;
        // Trigger re-parse with the current mappings
        reparseWithMapping(mappingSession);
    }

    async function replaceSessionData(blob: Blob) {
        try {
            uploadStatus = 'Replacing data...';
            // Validate Blob
			if (!blob || blob.size === 0) throw new Error('Empty data generated');

			const res = await fetch(`/api/sessions/${session.id}/replace`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: blob
			});

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || 'Failed to replace data');
            }

            alert('Session data updated successfully!');
            showRemapModal = false;
            await invalidateAll(); // Reload page
        } catch (e: any) {
            console.error(e);
            alert(`Failed to update: ${e.message}`);
        } finally {
            remapLoading = false;
        }
    }

    async function handleMergeFileSelect(e: Event) {
        const target = e.target as HTMLInputElement;
        const file = target.files?.[0];
        if (!file) return;
        target.value = '';

        try {
            mergeLoading = true;
            const fileType = file.name.toLowerCase().endsWith('.vbo') ? 'vbo' : 'bosch';

            // Step 1: Preview — get available channels and offset
            const formData = new FormData();
            formData.append('file', file);
            formData.append('type', fileType);
            formData.append('action', 'preview');

            const res = await fetch(`/api/sessions/${session.id}/merge`, {
                method: 'POST',
                body: formData
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || 'Preview failed');
            }

            const preview = await res.json();

            // Open channel picker — select all by default
            mergeSelectedChannels = {};
            for (const ch of preview.channels) {
                mergeSelectedChannels[ch] = true;
            }
            mergePreview = {
                file,
                type: fileType,
                channels: preview.channels,
                units: preview.units || {},
                sampleCounts: preview.sampleCounts || {},
                lapsWithCoverage: preview.lapsWithCoverage,
                totalLaps: preview.totalLaps,
                matchedLaps: preview.matchedLaps || [],
                unmatchedPrimaryLaps: preview.unmatchedPrimaryLaps || [],
                shift: preview.shift || 0,
            };
        } catch (e: any) {
            console.error(e);
            alert(`Merge error: ${e.message}`);
        } finally {
            mergeLoading = false;
        }
    }

    async function executeMerge() {
        if (!mergePreview) return;
        const selected = Object.entries(mergeSelectedChannels)
            .filter(([_, v]) => v)
            .map(([k]) => k);

        if (selected.length === 0) {
            alert('Select at least one channel to import.');
            return;
        }

        try {
            mergeLoading = true;
            const formData = new FormData();
            formData.append('file', mergePreview.file);
            formData.append('type', mergePreview.type);
            formData.append('action', 'merge');
            formData.append('channels', JSON.stringify(selected));

            const res = await fetch(`/api/sessions/${session.id}/merge`, {
                method: 'POST',
                body: formData
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || 'Merge failed');
            }

            const data = await res.json();
            mergePreview = null;
            alert(`Imported ${data.channels.length} channels across ${data.lapsWithCoverage} laps (${data.matchedLaps} matched)`);
            await invalidateAll();
        } catch (e: any) {
            console.error(e);
            alert(`Merge error: ${e.message}`);
        } finally {
            mergeLoading = false;
        }
    }

	async function optimizeVideo() {
		try {
			// Optimistic UI
			optimizationStatus = 'processing';

			const res = await fetch('/api/video/optimize', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ sessionId: session.id })
			});

			if (res.ok) {
				pollOptimization();
			} else {
				console.error('Optimization failed to start');
				alert('Failed to start optimization');
				optimizationStatus = 'failed';
			}
		} catch (e) {
			console.error(e);
			alert('Error starting optimization');
			optimizationStatus = 'failed';
		}
	}

	function pollOptimization() {
		const interval = setInterval(async () => {
			try {
				const res = await fetch(`/api/sessions/${session.id}/status`);
				if (res.ok) {
					const statusData = await res.json();
					optimizationStatus = statusData.optimizationStatus;

					if (
						statusData.optimizationStatus === 'completed' ||
						statusData.optimizationStatus === 'failed'
					) {
						clearInterval(interval);
						await invalidateAll(); // Reload page data to get new video URL
					}
				}
			} catch (e) {
				console.error('Polling error', e);
			}
		}, 3000);
	}

	function triggerUpload() {
		console.log('[Upload] Button clicked');
		// Use direct DOM access to bypass binding issues
		const input = document.getElementById('video-upload-input') as HTMLInputElement;
		console.log('[Upload] input element:', input);
		if (input) {
			input.click();
		} else {
			console.error('[Upload] Input element not found');
			alert('Error: Upload element not ready (ID not found).');
		}
	}

	async function handleFileUpload(e: Event) {
		console.log('File upload changed');
		const target = e.target as HTMLInputElement;
		const file = target.files?.[0];
		if (!file) {
			console.log('No file selected');
			return;
		}

		isUploading = true;
		uploadProgress = 0;
		uploadStatus = 'Initializing upload...';

		try {
			// 1. Create video on Bunny via our API
			const createRes = await fetch('/api/bunny/create', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ title: session.name + ' - ' + file.name })
			});

			if (!createRes.ok) throw new Error('Failed to initialize video upload');

			const { guid, expirationTime, signature, libraryId } = await createRes.json();

			// 2. TUS Upload
			const upload = new Upload(file, {
				endpoint: 'https://video.bunnycdn.com/tusupload',
				retryDelays: [0, 3000, 5000, 10000, 20000],
				headers: {
					AuthorizationSignature: signature,
					AuthorizationExpire: expirationTime,
					VideoId: guid,
					LibraryId: libraryId
				},
				chunkSize: 50 * 1024 * 1024, // 5MB chunks
				metadata: {
					filetype: file.type,
					title: file.name
				},
				onError: (error) => {
					console.error('Upload failed details:', error);
					// Check for specific TUS errors
					if (error.originalRequest) {
						console.error('Request:', error.originalRequest);
					}
					if (error.originalResponse) {
						console.error('Response:', error.originalResponse);
					}
					uploadStatus = 'Upload failed: ' + error.message;
					isUploading = false;
					alert('Upload failed: ' + error.message);
				},
				onProgress: (bytesUploaded, bytesTotal) => {
					const percentage = (bytesUploaded / bytesTotal) * 100;
					uploadProgress = percentage;
					uploadStatus = `Uploading... ${percentage.toFixed(0)}%`;
				},
				onSuccess: async () => {
					uploadStatus = 'Processing...';

					// 3. Link to session
					await fetch(`/api/sessions/${session.id}/video`, {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ bunnyVideoId: guid })
					});

					uploadStatus = 'Complete!';
					isUploading = false;
					await invalidateAll();
				}
			});

			upload.start();
		} catch (err: any) {
			console.error(err);
			uploadStatus = 'Error: ' + err.message;
			isUploading = false;
		}
	}

    function handleLocalFileSelect(e: Event) {
        const target = e.target as HTMLInputElement;
        const file = target.files?.[0];
        if (file) {
            if (localVideoUrl) URL.revokeObjectURL(localVideoUrl);
            localVideoUrl = URL.createObjectURL(file);
            localFileName = file.name;
            console.log('[LocalFile] Selected:', file.name, 'Blob:', localVideoUrl);
            alert(`Local file "${file.name}" loaded into player. Please press Play.`);
        }
    }

	function setSyncOffset() {
		applySyncOffset(hoverTime);
	}

	function applySyncOffset(t: number) {
		// The offset aligns video time with telemetry time.
		// Formula: VideoTime = LapStart + t + Offset
		// Therefore: Offset = VideoTime - LapStart - t
		const lapStart = getLapStartTime(selectedLapNumber);
		const calculatedOffset = videoTime - lapStart - t;
		editingSession.videoOffset = parseFloat(calculatedOffset.toFixed(3));

		console.log('[Sync] Set offset:', {
			videoTime: videoTime.toFixed(3),
			lapStart: lapStart.toFixed(3),
			telemetryTime: t.toFixed(3),
			newOffset: calculatedOffset.toFixed(3)
		});
	}

	function onChartClick(t: number) {
		if (isEditing) {
			applySyncOffset(t);
		}
	}

	// Auto-poll if we load the page and it is processing
	$effect(() => {
		if (optimizationStatus === 'processing') {
			pollOptimization();
		}
	});

	async function generateShareLink() {
		isGeneratingLink = true;
		generatedLink = null;
		try {
			const res = await fetch('/api/share/create', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					sessionId: session.id,
					config: shareConfig
				})
			});
			if (res.ok) {
				const data = await res.json();
				generatedLink = `${window.location.origin}${data.url}`;
			} else {
				console.error('Failed to generate link');
			}
		} catch (e) {
			console.error(e);
		} finally {
			isGeneratingLink = false;
		}
	}

	function copyLink() {
		if (generatedLink) {
			navigator.clipboard.writeText(generatedLink);
			hasCopiedLink = true;
			setTimeout(() => {
				hasCopiedLink = false;
			}, 2000);
		}
	}

	// Sync Video to Chart (Cursor -> Video)
	$effect(() => {
		if (!session.videoUrl && session.fastestLapVideoUrl && videoSource === 'session') {
			videoSource = 'fastest_lap';
		}
	});

	$effect(() => {
		if (
			playerComponent &&
			!isVideoPlaying &&
			userInteractingWithChart &&
			displayData &&
			selectedLap
		) {
			// Use the time channel directly with offset calculation
			// hoverTime is lap-relative in seconds, we need to convert to video time
			const targetVTime = getVideoTimeFromLapTime(hoverTime, selectedLap.lapNumber);

			console.log(
				'[Sync Debug] Telemetry time:',
				hoverTime.toFixed(3),
				's | Lap:',
				selectedLap.lapNumber,
				'| Target video time:',
				targetVTime?.toFixed(3),
				's'
			);

			if (targetVTime !== null && targetVTime >= 0) {
				playerComponent.seekTo(targetVTime);
			}
		}
	});

	// Sync Chart to Video (Video -> Cursor)
	let initialSeekDone = $state(false);

	$effect(() => {
		if (playerComponent && selectedLap && !initialSeekDone) {
			console.log('[Playback] Performing initial seek to Lap', selectedLap.lapNumber);
			// Calculate start time
			const start = getLapStartTime(selectedLap.lapNumber);
			const currentOffset =
				videoSource === 'session' ? session.videoOffset || 0 : session.fastestLapVideoOffset || 0;

			// Seek
			// We use a small timeout to ensure inner video element is mounted/ready if needed
			setTimeout(() => {
				if (playerComponent) {
					if (videoSource === 'session') {
						playerComponent.seekTo(start + currentOffset);
					} else {
						playerComponent.seekTo(0);
					}
				}
			}, 500);

			initialSeekDone = true;
		}
	});

	// Throttle helpers
	let lastVideoTimeUpdate = 0;

	function onVideoTimeUpdate(vTime: number) {
		videoTime = vTime;
		if (!playerComponent || !isVideoPlaying || !displayData || !selectedLap) return;

		// 1. Auto-advance Lap Logic (Check every frame)
		if (videoSource === 'session') {
			const currentLapStartV = getVideoTimeFromLapTime(0, selectedLap.lapNumber) ?? -Infinity;
			const currentLapEndV =
				getVideoTimeFromLapTime(selectedLap.timeSeconds, selectedLap.lapNumber) ?? Infinity;

			// If we are past the end of the current lap (with small buffer)
			if (vTime > currentLapEndV + 0.1) {
				const nextLap = laps.find((l) => l.lapNumber === selectedLap.lapNumber + 1);
				if (nextLap) {
					console.log('[Playback] Auto-advancing to Lap', nextLap.lapNumber);
					selectedLapNumber = nextLap.lapNumber;
					return; // Let reactivity handle the switch
				}
			}
			// If we are before the start of the current lap
			else if (vTime < currentLapStartV - 0.1) {
				const prevLap = laps.find((l) => l.lapNumber === selectedLap.lapNumber - 1);
				if (prevLap) {
					console.log('[Playback] Auto-rewinding to Lap', prevLap.lapNumber);
					selectedLapNumber = prevLap.lapNumber;
					return;
				}
			}
		}

		// 2. Throttle Chart Cursor Update (Heavy)
        // Only update cursor every ~50ms (20fps) to save main thread for video decoding
		const now = performance.now();
        if (now - lastVideoTimeUpdate < 50) return;
        lastVideoTimeUpdate = now;

		// Convert video time back to telemetry time using offset calculation
		const calculatedHoverTime = getLapTimeFromVideoTime(vTime, selectedLap.lapNumber);

		// Clamp to lap duration
		const maxLapTime = displayData.time[displayData.time.length - 1] || 100;
		const newHoverTime = Math.max(0, Math.min(maxLapTime, calculatedHoverTime));

		if (!isNaN(newHoverTime)) {
			hoverTime = newHoverTime;
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
		// Filter for laps that actually have telemetry data
		const candidates = laps.filter((l) => l.telemetryData && (l.timeSeconds > 20)); // Basic sanity check
		const valid = candidates.filter((l) => l.valid);
		
		if (valid.length > 0) {
			return valid.reduce((prev, curr) => (prev.timeSeconds < curr.timeSeconds ? prev : curr));
		}
		// Fallback: If no valid laps, use the fastest invalid lap (if any)
		if (candidates.length > 0) {
			return candidates.reduce((prev, curr) => (prev.timeSeconds < curr.timeSeconds ? prev : curr));
		}
		return null;
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

	// Derived values for laps
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

	// View Presets
	let showSavePresetModal = $state(false);
	let presetName = $state('');
	let presetCarId = $state('');

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
		// Run analysis when selectedLap changes (and has data)
		if (selectedLap && selectedLap.telemetryData) {
			// Check if we already have cached analysis (and it's not empty)
			if (
				selectedLap.analysis &&
				Array.isArray(selectedLap.analysis) &&
				selectedLap.analysis.length > 0
			) {
				console.log('[Analysis] Using cached analysis for Lap', selectedLap.lapNumber);
				coachingTips = selectedLap.analysis;
				isAnalyzing = false;
				return;
			}

			console.log('[Analysis] Starting analysis for Lap', selectedLap.lapNumber);
			isAnalyzing = true;
			// Use setTimeout to allow UI to render 'Analyzing...' state and avoid synchronous calculation freeze
			setTimeout(async () => {
				try {
					const tips = analyzeLap(selectedLap.telemetryData);
					console.log('[Analysis] Complete. Tips found:', tips.length);
					coachingTips = tips;

					// Cache the result
					try {
						await fetch(`/api/sessions/${session.id}/laps/${selectedLap.lapNumber}/analysis`, {
							method: 'POST',
							headers: { 'Content-Type': 'application/json' },
							body: JSON.stringify({ analysis: tips })
						});
						console.log('[Analysis] Cached results for Lap', selectedLap.lapNumber);

						// Ideally update the local store/data so we don't re-run if we switch back
						// But 'selectedLap' is derived from 'laps' prop. We can't mutate props easily.
						// We might need to invalidateAll() or just rely on the fact that next load will have it.
						// For now, let's just let it be. If user switches away and back, it might re-run ONCE more until page reload.
						// A better way is to update the local 'data.laps' object.
						const lapIndex = laps.findIndex((l) => l.lapNumber === selectedLap.lapNumber);
						if (lapIndex !== -1) {
							// Mutate the underlying object from data
							laps[lapIndex].analysis = tips;
						}
					} catch (saveErr) {
						console.error('[Analysis] Failed to cache results', saveErr);
					}
				} catch (e) {
					console.error('[Analysis] Error:', e);
					coachingTips = [];
				} finally {
					isAnalyzing = false;
				}
			}, 10);
		} else {
			console.log('[Analysis] No data to analyze');
			coachingTips = [];
			isAnalyzing = false;
		}
	});

	function getVideoSrc(url: string | null | undefined) {
        // Prioritize Local Blob if selected
        if (localVideoUrl) return localVideoUrl;

		// Prioritize Bunny Video
		if (session.bunnyVideoId) {
			// Construct HLS URL using Pull Zone
			// We assume a standard b-cdn.net pull zone is configured.
			// If not available, we can't play it easily without using the iframe embed which UniversalPlayer doesn't support yet (it supports YT).
			// Let's assume a default or public env.
			// Since we can't easily import $env/dynamic/public inside this function scope without top-level import,
			// we'll rely on a hardcoded placeholder or a standard pattern.
			// For now, I'll return a specially formatted URL that the user can replace/configure later.
			// "https://{configure-pull-zone}.b-cdn.net/{id}/playlist.m3u8"

			// To make it functional for testing:
			// The user will need to replace 'flyinglizards' with their actual pull zone name if different.
			const pullZone = 'vz-17b2c87d-c14';
			return `https://${pullZone}.b-cdn.net/${session.bunnyVideoId}/playlist.m3u8`;
		}

		if (!url) return '';
		if (url.startsWith('http')) return url;
		if (url.includes('bunny') || url.includes('.m3u8')) return url;

		// If it's an optimized video (static file), serve directly
		if (url.includes('/videos/optimized/')) {
			return url;
		}

		// Detect likely local paths (absolute paths)
		// Check for unix root '/' or windows drive 'C:'
		const isLocal = url.startsWith('/') || /^[a-zA-Z]:/.test(url);

		if (isLocal) {
			// Use streaming endpoint
			return `/api/video/stream?path=${encodeURIComponent(url)}`;
		}
		return url;
	}

	function normalizeAviTime(t: number) {
		if (!t) return 0;
		// Heuristic: If time is > 1 day in seconds (86400), it's likely microseconds or similar
		// Try to auto-detect unit.
		if (t > 100000) return 60; // Convert us to s? Or ms?
		// Note: aviindex might be 10us units?
		// Without sample file, hard to be perfect. But > 100k for "seconds" is definitely wrong for a lap.
		return t;
	}

	function getLapStartTime(lapNum: number) {
		let start = 0;
		// Sort laps by number to be sure
		const sorted = [...laps].sort((a, b) => a.lapNumber - b.lapNumber);
		for (const l of sorted) {
			if (l.lapNumber === lapNum) break;
			start += l.timeSeconds;
		}
		return start;
	}

	function selectLap(lap: any) {
		selectedLapNumber = lap.lapNumber;
		// Jump to start of this lap
		// If using session video, we need absolute time
		const start = getLapStartTime(lap.lapNumber);
		// Update hoverTime to 0 (start of lap)
		hoverTime = 0;
		// Seek video
		if (playerComponent) {
			const currentOffset =
				videoSource === 'session' ? session.videoOffset || 0 : session.fastestLapVideoOffset || 0;

			// If session video, target is start of lap + offset
			// If fastest lap video, and we are NOT on the fastest lap?
			// Fastest lap video only matches the fastest lap. If user selects another lap,
			// and visualizes it, the fastest lap video (if source='fastest_lap') won't match unless we overlay?
			// Assumption: If source='fastest_lap', we only sync correctly if selectedLap == fastestLap.
			// Or maybe we just play it from 0 and it's a comparison?

			if (videoSource === 'session') {
				playerComponent.seekTo(start + currentOffset);
			} else {
				playerComponent.seekTo(0); // Start of file
			}
		}
	}

	// Sync Mapping Helper
	function getVideoTimeFromLapTime(lapRelTime: number, lapNum: number): number | null {
		const currentOffset =
			videoSource === 'session' ? session.videoOffset || 0 : session.fastestLapVideoOffset || 0;

		if (videoSource === 'session') {
			const lapStart = getLapStartTime(lapNum);
			return lapStart + lapRelTime + currentOffset;
		} else {
			// Fastest Lap Video
			// Only makes sense if selectedLap is the fastest lap (or we are just playing it as reference)
			// Assuming starts at 0 relative
			return lapRelTime + currentOffset;
		}
	}

	function getLapTimeFromVideoTime(vTime: number, lapNum: number): number {
		const currentOffset =
			videoSource === 'session' ? session.videoOffset || 0 : session.fastestLapVideoOffset || 0;

		if (videoSource === 'session') {
			const lapStart = getLapStartTime(lapNum);
			// Relative time = Video - Offset - LapStart
			return vTime - currentOffset - lapStart;
		} else {
			return vTime - currentOffset;
		}
	}

	// Chart Scaling Constants
	const width = 800;
	const height = 300;
	const padding = 40;

	const maxTime = $derived(
		Math.max(...(graphLaps.length ? graphLaps : laps).map((l) => l.timeSeconds)) * 1.01
	);
	const minTime = $derived(
		Math.min(...(graphLaps.length ? graphLaps : laps).map((l) => l.timeSeconds)) * 0.99
	);

	function xScale(lapNum: number) {
		return padding + ((lapNum - 1) / (laps.length - 1 || 1)) * (width - 2 * padding);
	}

	function yScale(time: number) {
		return height - padding - ((time - minTime) / (maxTime - minTime)) * (height - 2 * padding);
	}

	const points = $derived(
		graphLaps.map((l) => `${xScale(l.lapNumber)},${yScale(l.timeSeconds)}`).join(' ')
	);

	const availableChannels = $derived(
		displayData
			? Object.keys(displayData)
					.filter(
						(k) =>
							!['time', 'lat', 'long', 'avitime', 'distance'].includes(k) &&
							Array.isArray(displayData[k]) &&
							typeof displayData[k][0] === 'number'
					)
					.concat(['variance'])
					.sort()
			: []
	);

	const videoOverlays = $derived(
		filteredTips.map((tip) => {
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
	<div class="flex justify-between items-center mb-6">
		<a
			href="/sessions"
			class="inline-flex items-center gap-2 text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors"
		>
			<ArrowLeft class="w-4 h-4" />
			Back to Archives
		</a>
		<div class="flex gap-4">
			<button
				onclick={() => (isEditing = !isEditing)}
				class="text-sm font-semibold {isEditing
					? 'text-slate-500 dark:text-slate-400'
					: 'text-slate-500 dark:text-slate-400'} hover:text-slate-900 dark:hover:text-white transition-colors"
			>
				{isEditing ? 'Cancel' : 'Edit Session'}
			</button>
			{#if isEditing}
				<button
					form="edit-session-form"
					type="submit"
					class="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold rounded shadow-lg shadow-emerald-900/20 transition-all"
				>
					Save
				</button>
			{/if}
			<button
				onclick={() => (showShareModal = true)}
				class="text-sm font-semibold text-emerald-500 hover:text-emerald-400 flex items-center gap-1"
			>
				<Share2 class="w-4 h-4" />
				Share
			</button>
			<a
				href="/sessions/import"
				class="text-sm font-semibold text-orange-500 hover:text-orange-400"
			>
				Import New Data
			</a>
		</div>
	</div>

	<!-- Persistent Upload Progress Toast -->
	{#if isUploading}
		<div
            transition:fly={{ y: 50, duration: 300 }}
			class="fixed bottom-6 right-6 z-50 bg-white dark:bg-slate-900 shadow-2xl rounded-lg p-4 border border-slate-200 dark:border-slate-700 w-80"
		>
			<div class="flex items-center justify-between mb-2">
				<span class="text-sm font-bold text-slate-700 dark:text-slate-200">Uploading Video...</span>
				<span class="text-xs font-mono text-slate-500">{uploadProgress.toFixed(0)}%</span>
			</div>
			<div class="w-full bg-slate-200 dark:bg-slate-800 rounded-full h-2 mb-2 overflow-hidden">
				<div
					class="bg-emerald-500 h-full transition-all duration-300"
					style="width: {uploadProgress}%"
				></div>
			</div>
			<p class="text-xs text-slate-400 truncate">{uploadStatus}</p>
		</div>
	{/if}

	<form
		id="edit-session-form"
		method="POST"
		action="?/update"
		class="hidden"
		use:enhance={() => {
			return async ({ result, update }) => {
				if (result.type === 'success') {
					isEditing = false;
				}
				await update();
			};
		}}
	>
		<input type="hidden" name="telemetryConfig" value={JSON.stringify(chartConfig)} />
	</form>

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

				{#if isEditing}
					<input
						form="edit-session-form"
						type="text"
						name="track"
						value={session.track}
						class="text-4xl font-bold text-slate-900 dark:text-white bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded px-2 w-full mb-2"
					/>
                    
                    <div class="mb-2">
                        <label class="block text-xs uppercase text-slate-500 mb-1">Date</label>
                        <input
                            form="edit-session-form"
                            type="date"
                            name="date"
                            value={new Date(session.date).toISOString().split('T')[0]}
                            class="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded px-2 py-1 text-sm text-slate-600 dark:text-slate-300"
                        />
                    </div>

					<div class="mb-2 grid grid-cols-2 gap-2">
                        <select
							form="edit-session-form"
							name="driverId"
							value={session.driverId}
							class="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded px-2 py-1 text-sm text-slate-600 dark:text-slate-300 w-full"
						>
							<option value={null}>-- Select Driver --</option>
							{#each data.drivers as drv}
								<option value={drv.id}>{drv.name}</option>
							{/each}
						</select>

                        <select
                            form="edit-session-form"
                            name="carId"
                            value={session.carId}
                            class="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded px-2 py-1 text-sm text-slate-600 dark:text-slate-300 w-full"
                        >
                            <option value={null}>-- Select Car --</option>
                            {#each data.cars || [] as car}
                                <option value={car.id}>{car.name}</option>
                            {/each}
                        </select>
					</div>

					<textarea
						form="edit-session-form"
						name="notes"
						value={session.notes}
						class="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded p-2 text-slate-600 dark:text-slate-300 pointer-events-auto"
						rows="3"
					></textarea>

					<div
						class="mt-4 p-4 bg-slate-100 dark:bg-slate-950 rounded border border-slate-200 dark:border-slate-800"
					>
						<h3 class="text-xs font-bold uppercase text-slate-500 mb-2">Video Sync Config</h3>
						<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
							<div>
								<label class="block text-xs text-slate-500 mb-1"
									>Video URL (mp4) - Separate multiple with commas</label
								>
								<div class="flex gap-2">
									<input
										form="edit-session-form"
										type="text"
										name="videoUrl"
										value={session.videoUrl}
										placeholder="https://part1.mp4, https://part2.mp4"
										class="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded px-2 py-1 text-slate-900 dark:text-white text-sm"
									/>
									{#if optimizationStatus !== 'completed' && optimizationStatus !== 'processing'}
										<button
											type="button"
											class="px-3 py-1 bg-blue-600 text-white text-xs font-bold rounded hover:bg-blue-500 shrink-0"
											onclick={optimizeVideo}
										>
											Optimize
										</button>
									{:else if optimizationStatus === 'processing'}
										<span
											class="px-3 py-1 bg-slate-200 text-slate-500 text-xs font-bold rounded shrink-0 animate-pulse"
										>
											Processing...
										</span>
									{:else if optimizationStatus === 'completed'}
										<span
											class="px-3 py-1 bg-emerald-100 text-emerald-600 text-xs font-bold rounded shrink-0"
										>
											Optimized
										</span>
									{/if}
								</div>

								<div class="mt-2">
									<p class="text-xs text-slate-500 mb-1">Direct Upload to Cloud</p>
									<input
										type="file"
										accept="video/*"
										class="hidden"
										id="video-upload-input"
										onchange={handleFileUpload}
									/>
									<button
										type="button"
										class="w-full px-3 py-2 border-2 border-dashed border-slate-300 dark:border-slate-700 rounded text-xs text-slate-500 hover:text-emerald-500 hover:border-emerald-500 transition-colors flex items-center justify-center gap-2"
										onclick={triggerUpload}
										disabled={isUploading}
									>
										{#if isUploading}
											<span class="animate-spin">⏳</span> {uploadStatus}
										{:else}
											<UploadCloud class="w-4 h-4" />
											Upload Video File
										{/if}
									</button>
									{#if isUploading}
										<div class="w-full bg-slate-200 rounded-full h-1.5 mt-2 overflow-hidden">
											<div
												class="bg-emerald-500 h-1.5 rounded-full transition-all duration-300"
												style="width: {uploadProgress}%"
											></div>
										</div>
									{/if}
								</div>
                                
                                <div class="mt-4 pt-4 border-t border-slate-200 dark:border-slate-800">
                                    <label class="block text-xs text-slate-500 mb-1">Play Local File (Temporary/Offline)</label>
                                    <div class="flex gap-2 items-center">
                                        <input
                                            type="file"
                                            accept="video/*"
                                            class="w-full text-xs text-slate-500 file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-slate-100 dark:file:bg-slate-800 file:text-slate-700 dark:file:text-slate-300 hover:file:bg-slate-200"
                                            onchange={handleLocalFileSelect}
                                        />
                                    </div>
                                    <p class="text-[10px] text-slate-400 mt-1">
                                        Select a video from your computer to play immediately. Does not upload or save.
                                    </p>
                                    {#if localFileName}
                                        <p class="text-xs text-emerald-500 font-bold mt-1">
                                            Currently Loaded: {localFileName} <br/>
                                            <span class="text-[10px] font-normal text-slate-400">(Will be cleared if you save/refresh)</span>
                                        </p>
                                    {/if}
                                </div>

							</div>
							<div>
								<label class="block text-xs text-slate-500 mb-1">Sync Offset (seconds)</label>
								<div class="flex gap-2">
									<input
										form="edit-session-form"
										type="number"
										step="0.001"
										name="videoOffset"
										bind:value={editingSession.videoOffset}
										class="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded px-2 py-1 text-slate-900 dark:text-white text-sm"
									/>
									<button
										type="button"
										class="px-2 py-1 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-medium rounded hover:bg-slate-300 dark:hover:bg-slate-600 shrink-0"
										onclick={setSyncOffset}
										title="Align current video frame with current telemetry position"
									>
										Set @ Cur
									</button>
								</div>
								<p class="text-[10px] text-slate-400 mt-1">
									Pause video on a known moment, hover telemetry at same point, click "Set @ Cur"
								</p>
							</div>
						</div>
						<div
							class="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 border-t border-slate-200 dark:border-slate-800 pt-4"
						>
							<div>
								<label class="block text-xs text-slate-500 mb-1">Fastest Lap Video URL (mp4)</label>
								<input
									form="edit-session-form"
									type="text"
									name="fastestLapVideoUrl"
									value={session.fastestLapVideoUrl}
									placeholder="https://..."
									class="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded px-2 py-1 text-slate-900 dark:text-white text-sm"
								/>
							</div>
							<div>
								<label class="block text-xs text-slate-500 mb-1"
									>Fastest Lap Sync Offset (seconds)</label
								>
								<div class="space-y-2">
									<label class="text-xs font-semibold uppercase tracking-wider text-slate-500"
										>Video Offset (sec)</label
									>
									<div class="flex gap-2">
										<input
											type="number"
											step="0.1"
											class="flex-1 bg-slate-100 dark:bg-slate-800 border-transparent rounded px-3 py-2 text-sm font-medium focus:ring-2 focus:ring-primary-500"
											bind:value={editingSession.videoOffset}
										/>
										<button
											class="px-3 py-2 bg-slate-200 dark:bg-slate-700 rounded text-slate-600 dark:text-slate-300 font-medium hover:bg-slate-300 dark:hover:bg-slate-600"
											onclick={() => (videoRotation = (videoRotation + 90) % 360)}
											title="Rotate Video"
										>
											<RefreshCw class="w-4 h-4 {videoRotation > 0 ? 'text-primary-500' : ''}" />
										</button>
									</div>
									<p class="text-[10px] text-slate-400">
										Positive: Video starts AFTER data. Negative: Video starts BEFORE.
									</p>
								</div>
							</div>
						</div>
					</div>
				{:else}
					<h1 class="text-4xl font-bold text-slate-900 dark:text-white mb-2">{session.track}</h1>
					{#if session.driverName || session.carId}
						<div class="flex items-center gap-4 mb-2">
                            {#if session.driverName}
                                <div class="flex items-center gap-2">
                                    <User class="w-4 h-4 text-slate-400 dark:text-slate-500" />
                                    <span class="text-sm font-semibold" style="color: {session.driverColor}"
                                        >{session.driverName}</span
                                    >
                                </div>
                            {/if}
                            {#if session.carId && data.cars}
                                {@const car = data.cars.find(c => c.id === session.carId)}
                                {#if car}
                                    <div class="flex items-center gap-2">
                                        <div class="w-1.5 h-4 rounded-full" style="background-color: {car.color}"></div>
                                        <span class="text-sm font-semibold text-slate-600 dark:text-slate-300">
                                            {car.name}
                                        </span>
                                    </div>
                                {/if}
                            {/if}
						</div>
					{/if}
					{#if session.notes}
						<p class="text-slate-500 dark:text-slate-400 italic font-light max-w-2xl">
							"{session.notes}"
						</p>
					{/if}
				{/if}

				{#if isEditing}
					<button
						onclick={() => {
							editingTrackConfig = session.trackConfig || { finishLine: null };
							showTrackConfig = true;
						}}
						class="text-xs bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 px-3 py-1.5 rounded transition-colors text-slate-700 dark:text-slate-300 font-medium flex items-center gap-2 mt-2 w-fit"
					>
						<Flag class="w-3 h-3" />
						Configure Track Map
					</button>
                    
                    <button
                        onclick={() => {
                            files = [];
                            mappingSession = null;
                            showRemapModal = true;
                        }}
                        class="text-xs bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 px-3 py-1.5 rounded transition-colors text-slate-700 dark:text-slate-300 font-medium flex items-center gap-2 mt-2 w-fit"
                    >
                        <FileText class="w-3 h-3" />
                        Remap Source Channels
                    </button>

                    <div class="relative">
                        <input
                            type="file"
                            accept=".vbo,.txt,.log"
                            class="hidden"
                            id="merge-file-input"
                            onchange={handleMergeFileSelect}
                        />
                        <button
                            onclick={() => document.getElementById('merge-file-input')?.click()}
                            disabled={mergeLoading}
                            class="text-xs bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 px-3 py-1.5 rounded transition-colors text-slate-700 dark:text-slate-300 font-medium flex items-center gap-2 mt-2 w-fit"
                        >
                            {#if mergeLoading}
                                <span class="animate-spin">⏳</span> Analyzing...
                            {:else}
                                <Activity class="w-3 h-3" />
                                Add Secondary Telemetry
                            {/if}
                        </button>
                    </div>
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

	<!-- Share Modal -->
	{#if showShareModal}
		<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
			<div class="bg-white dark:bg-slate-900 rounded-lg shadow-xl max-w-md w-full p-6 relative">
				<button
					class="absolute top-4 right-4 text-slate-500 hover:text-slate-900 dark:hover:text-white"
					onclick={() => {
						showShareModal = false;
						generatedLink = null;
					}}
				>
					<X class="w-5 h-5" />
				</button>

				<h2 class="text-xl font-bold mb-4">Share Session</h2>

				{#if !generatedLink}
					<div class="space-y-4">
						<p class="text-sm text-slate-500">Choose what data to include in the shared link:</p>

						<div class="space-y-3">
							<label class="flex items-center gap-2">
								<input
									type="checkbox"
									bind:checked={shareConfig.showTelemetry}
									class="rounded text-orange-600 focus:ring-orange-500"
								/>
								<span class="text-sm font-medium">Telemetry Data (Charts & Map)</span>
							</label>
							<label class="flex items-center gap-2">
								<input
									type="checkbox"
									bind:checked={shareConfig.showVideo}
									class="rounded text-orange-600 focus:ring-orange-500"
								/>
								<span class="text-sm font-medium">Start/Finish Video</span>
							</label>
							<label class="flex items-center gap-2">
								<input
									type="checkbox"
									bind:checked={shareConfig.showAi}
									class="rounded text-orange-600 focus:ring-orange-500"
								/>
								<span class="text-sm font-medium">AI Coaching Tips</span>
							</label>
						</div>

						<button
							onclick={generateShareLink}
							disabled={isGeneratingLink}
							class="w-full mt-4 bg-orange-600 text-white rounded py-2 font-semibold hover:bg-orange-700 disabled:opacity-50"
						>
							{isGeneratingLink ? 'Generating...' : 'Generate Link'}
						</button>
					</div>
				{:else}
					<div class="space-y-4">
						<div
							class="p-3 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 rounded text-sm"
						>
							Link generated successfully! Anyone with this link can view the selected data.
						</div>

						<div class="flex gap-2">
							<input
								type="text"
								readonly
								value={generatedLink}
								class="flex-1 bg-slate-100 dark:bg-slate-800 border-transparent rounded px-3 py-2 text-sm"
							/>
							<button
								onclick={copyLink}
								class="px-3 py-2 bg-slate-200 dark:bg-slate-700 rounded hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors"
								title="Copy to clipboard"
							>
								{#if hasCopiedLink}
									<Check class="w-4 h-4 text-emerald-500" />
								{:else}
									<Copy class="w-4 h-4" />
								{/if}
							</button>
						</div>

						<p class="text-xs text-slate-400 text-center">Link expires in 7 days.</p>
					</div>
				{/if}
			</div>
		</div>
	{/if}

	<!-- Video Section -->
	{#if session.videoUrl || session.fastestLapVideoUrl || localVideoUrl}
		{@const currentVideoUrl =
			videoSource === 'session' ? session.videoUrl : session.fastestLapVideoUrl}
		{@const currentOffset =
			videoSource === 'session' ? session.videoOffset : session.fastestLapVideoOffset}

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
					<!-- If only fastest lap exists, default to it (though state init is 'session', logic should handle) -->
					<!-- Actually, better to just rely on user or init logic. But we can force update if needed or just let user see blank until switched?
						     Ideally we initialize videoSource based on what's available. -->
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
							overlays={videoOverlays}
						/>
					{/key}

					{#if !isVideoPlaying || true}
						<!-- Always show debug for now if user requests -->
						<div
							class="absolute top-4 left-4 bg-black/70 text-white px-2 py-1 rounded text-xs font-mono pointer-events-none z-20"
						>
							<p>Lap {selectedLap?.lapNumber || '?'} | Offset: {currentOffset || 0}s</p>
							<p>Telemetry: {formatLapTime(hoverTime)} | Video: {videoTime.toFixed(2)}s</p>
							<p class="text-[10px] text-slate-400 mt-1">
								{#if playerComponent}
									{@const info = playerComponent.getDebugInfo()}
									Type: {info.type} | Ready: {info.readyState}
								{:else}
									Loading...
								{/if}
							</p>
							<p class="text-[10px] text-slate-400">
								LapStart: {selectedLap ? getLapStartTime(selectedLap.lapNumber).toFixed(2) : 0}s
							</p>
						</div>
					{/if}
				</div>
			</Card>
		</div>
	{/if}

	<!-- Telemetry Section -->
	<div class="mb-8 space-y-4">
		{#if selectedLap}
			{#if displayData}
				{#if isEditing}
					<div
						class="bg-slate-100 dark:bg-slate-900/50 p-4 rounded-lg border border-slate-200 dark:border-slate-800"
					>
						<div class="flex items-center justify-between mb-2">
							<h3 class="text-sm font-semibold text-slate-600 dark:text-slate-300">
								Channel Configuration
							</h3>
							<div class="flex items-center gap-2">
								{#if data.viewPresets.length > 0}
									<select
										class="text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded px-1.5 py-0.5 text-slate-600 dark:text-slate-300 outline-none"
										onchange={(e) => {
											const preset = data.viewPresets.find(p => p.id === parseInt(e.currentTarget.value));
											if (preset?.config) {
												chartConfig = preset.config as LayoutConfig;
											}
											e.currentTarget.value = '';
										}}
									>
										<option value="">Load Preset...</option>
										{#each data.viewPresets as preset}
											<option value={preset.id}>{preset.name}{preset.carId ? ` (car)` : ''}</option>
										{/each}
									</select>
								{/if}
								<button
									type="button"
									class="text-xs text-blue-500 hover:text-blue-400"
									onclick={() => { showSavePresetModal = true; presetName = ''; presetCarId = ''; }}>Save Preset</button
								>
								<button
									type="button"
									class="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
									onclick={() => (chartConfig = defaultConfig)}>Reset Defaults</button
								>
								<button
									type="button"
									class="text-xs text-orange-500 hover:text-orange-400"
									onclick={() => (chartConfig = chartConfig)}>Redraw</button
								>
							</div>
						</div>
						<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
							{#each chartConfig as lane, idx}
								<div
									class="flex items-center gap-2 bg-white dark:bg-slate-950 p-2 rounded border border-slate-200 dark:border-slate-800"
								>
									<div class="flex flex-col gap-0.5">
										<button
											type="button"
											class="text-[10px] text-slate-400 dark:text-slate-500 hover:text-slate-900 dark:hover:text-white"
											onclick={() => {
												if (idx > 0) {
													const temp = chartConfig[idx];
													chartConfig[idx] = chartConfig[idx - 1];
													chartConfig[idx - 1] = temp;
													chartConfig = [...chartConfig];
												}
											}}>▲</button
										>
										<button
											type="button"
											class="text-[10px] text-slate-400 dark:text-slate-500 hover:text-slate-900 dark:hover:text-white"
											onclick={() => {
												if (idx < chartConfig.length - 1) {
													const temp = chartConfig[idx];
													chartConfig[idx] = chartConfig[idx + 1];
													chartConfig[idx + 1] = temp;
													chartConfig = [...chartConfig];
												}
											}}>▼</button
										>
									</div>

									<input
										type="text"
										bind:value={lane.title}
										class="bg-transparent border-b border-slate-300 dark:border-slate-700 text-xs w-20 text-slate-600 dark:text-slate-300 focus:border-orange-500 outline-none"
									/>

									<div class="flex gap-1 flex-1 flex-wrap">
										{#each lane.channels as chan}
											<div
												class="flex items-center gap-1 bg-slate-100 dark:bg-slate-900 px-1 rounded border border-slate-200 dark:border-slate-700"
											>
												<div
													class="w-2 h-2 rounded-full"
													style="background-color: {chan.color}"
												></div>
												<select
													bind:value={chan.variable}
													class="bg-transparent text-[10px] text-slate-500 dark:text-slate-400 outline-none w-16"
												>
													{#each availableChannels as c}
														<option value={c}>{c}</option>
													{/each}
												</select>
											</div>
										{/each}
									</div>
									<div class="flex items-center gap-1">
										<span class="text-[10px] text-slate-400 dark:text-slate-600">H:</span>
										<input
											type="number"
											bind:value={lane.heightWeight}
											min="1"
											max="5"
											class="w-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs text-center rounded text-slate-600 dark:text-slate-300"
										/>
									</div>
									<div class="flex items-center gap-1">
										<span class="text-[10px] text-slate-400 dark:text-slate-600">Min:</span>
										<input
											type="number"
											bind:value={lane.min}
											placeholder="Auto"
											class="w-12 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs text-center rounded text-slate-600 dark:text-slate-300 placeholder:text-slate-400 dark:placeholder:text-slate-600"
										/>
									</div>
									<div class="flex items-center gap-1">
										<span class="text-[10px] text-slate-400 dark:text-slate-600">Max:</span>
										<input
											type="number"
											bind:value={lane.max}
											placeholder="Auto"
											class="w-12 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs text-center rounded text-slate-600 dark:text-slate-300 placeholder:text-slate-400 dark:placeholder:text-slate-600"
										/>
									</div>
									<button
										type="button"
										class="text-slate-400 dark:text-slate-600 hover:text-red-500 dark:hover:text-red-400"
										onclick={() => {
											chartConfig = chartConfig.filter((_, i) => i !== idx);
										}}>×</button
									>
								</div>
							{/each}
							<button
								type="button"
								class="flex items-center justify-center py-2 text-xs border border-dashed border-slate-300 dark:border-slate-700 text-slate-500 hover:text-slate-900 dark:hover:text-white hover:border-slate-400 dark:hover:border-slate-500 rounded"
								onclick={() => {
									chartConfig = [
										...chartConfig,
										{
											id: 'new_' + Date.now(),
											title: 'New',
											heightWeight: 1,
											channels: [{ variable: 'speed', color: '#db2777', label: 'Speed' }]
										}
									];
								}}>+ Add Lane</button
							>
						</div>
					</div>
				{/if}

				{#if showSavePresetModal}
					<!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
					<div class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center" onclick={(e) => { if (e.target === e.currentTarget) showSavePresetModal = false; }}>
						<div class="bg-white dark:bg-slate-900 rounded-lg p-6 w-96 border border-slate-200 dark:border-slate-800 shadow-xl max-h-[80vh] overflow-y-auto">
							<h3 class="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-4">Save View Preset</h3>
							{#if data.viewPresets.length > 0}
								<div class="mb-4">
									<p class="text-xs text-slate-500 dark:text-slate-400 mb-2">Existing presets:</p>
									<div class="space-y-1">
										{#each data.viewPresets as preset}
											<div class="flex items-center justify-between text-xs bg-slate-50 dark:bg-slate-950 px-2 py-1 rounded border border-slate-200 dark:border-slate-800">
												<span class="text-slate-600 dark:text-slate-300">{preset.name}{preset.carId ? ' (car)' : ''}</span>
												<form method="POST" action="?/deletePreset" use:enhance={() => {
													return async ({ result }) => {
														await invalidateAll();
														await applyAction(result);
													};
												}}>
													<input type="hidden" name="presetId" value={preset.id} />
													<button type="submit" class="text-red-400 hover:text-red-600 text-xs px-1">&times;</button>
												</form>
											</div>
										{/each}
									</div>
								</div>
							{/if}
							<form method="POST" action="?/savePreset" use:enhance={() => {
								return async ({ result }) => {
									if (result.type === 'success') {
										showSavePresetModal = false;
										await invalidateAll();
									}
									await applyAction(result);
								};
							}}>
								<input type="hidden" name="config" value={JSON.stringify(chartConfig)} />
								<div class="space-y-3">
									<div>
										<label for="presetName" class="block text-xs text-slate-500 dark:text-slate-400 mb-1">Preset Name</label>
										<input
											id="presetName"
											type="text"
											name="name"
											bind:value={presetName}
											required
											class="w-full text-sm bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded px-3 py-1.5 text-slate-700 dark:text-slate-200 outline-none focus:border-orange-500"
											placeholder="e.g. Braking Analysis"
										/>
									</div>
									<div>
										<label for="presetCarId" class="block text-xs text-slate-500 dark:text-slate-400 mb-1">Car (optional — leave blank for global)</label>
										<select
											id="presetCarId"
											name="carId"
											bind:value={presetCarId}
											class="w-full text-sm bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded px-3 py-1.5 text-slate-700 dark:text-slate-200 outline-none"
										>
											<option value="">Global (all cars)</option>
											{#each data.cars as car}
												<option value={car.id}>{car.name}</option>
											{/each}
										</select>
									</div>
									<div class="flex justify-end gap-2 pt-2">
										<button
											type="button"
											class="text-xs px-3 py-1.5 rounded border border-slate-300 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"
											onclick={() => (showSavePresetModal = false)}>Cancel</button
										>
										<button
											type="submit"
											class="text-xs px-3 py-1.5 rounded bg-orange-500 text-white hover:bg-orange-600"
											disabled={!presetName.trim()}>Save</button
										>
									</div>
								</div>
							</form>
						</div>
					</div>
				{/if}

				<Card title={'Telemetry Analysis: Lap ' + selectedLap.lapNumber}>
					<div class="mb-4 flex items-center justify-between text-sm">
						<div class="flex items-center gap-3">
							<span
								class="px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded text-slate-700 dark:text-slate-300 font-mono text-lg"
								>{formatLapTime(selectedLap.timeSeconds)}</span
							>
							{#if selectedLap === bestLap}<span
									class="text-emerald-500 text-xs font-bold uppercase tracking-wider"
									>Fastest Lap</span
								>{/if}
							{#if !selectedLap.valid}
								<span
									class="px-2 py-0.5 rounded bg-red-100 dark:bg-red-950 text-red-600 dark:text-red-500 text-xs border border-red-200 dark:border-red-900"
									>Invalid</span
								>
							{/if}
						</div>

						<form method="POST" action="?/toggleLapValidity" use:enhance>
							<input type="hidden" name="lapNumber" value={selectedLap.lapNumber} />
							<input type="hidden" name="valid" value={(!selectedLap.valid).toString()} />
							<button
								class="text-xs px-3 py-1.5 rounded border {selectedLap.valid
									? 'border-red-200 dark:border-red-900/50 text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20'
									: 'border-emerald-200 dark:border-emerald-900/50 text-emerald-500 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/20'}"
							>
								{selectedLap.valid ? 'Mark Invalid' : 'Restore'}
							</button>
						</form>
					</div>
					<div class="flex flex-col lg:flex-row gap-6">
						<div class="flex-1 min-w-0">
							<TelemetryChart
								config={chartConfig}
								data={displayData}
								referenceData={selectedLap !== bestLap ? bestLap?.telemetryData : null}
								analysisEvents={filteredTips}
								onHover={(t) => {
									// PERFORMANCE: Debounce hover updates to reduce repaints
									if (hoverDebounceTimeout) clearTimeout(hoverDebounceTimeout);
									hoverDebounceTimeout = window.setTimeout(() => {
										hoverTime = t;
										userInteractingWithChart = true;
										hoverDebounceTimeout = null;
									}, 10); // 10ms debounce
								}}
								cursorTime={hoverTime}
								onClick={onChartClick}
							/>
						</div>

						{#if displayData}
							<div class="w-full lg:w-72 shrink-0 flex flex-col gap-2">
								{#if displayData.lat && displayData.long && displayData.lat.length > 0}
									<div
										class="bg-slate-100 dark:bg-slate-950 rounded-lg p-2 border border-slate-200 dark:border-slate-800 flex flex-col items-center"
									>
										<span
											class="text-xs uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2 w-full text-center border-b border-slate-200 dark:border-slate-800 pb-1"
											>GPS Track</span
										>
										{#if displayData.lat.length < 10}
											<div class="text-xs text-red-500 p-2">
												Warning: Only {displayData.lat.length} GPS points detected
											</div>
										{/if}
										<TrackMap data={displayData} currentTime={hoverTime} width={250} height={250} />
									</div>
								{:else if isEditing}
									<div class="p-4 text-xs text-slate-400 border border-dashed rounded text-center">
										No GPS Data detected in telemetry for this lap.
									</div>
								{/if}

								<div
									class="bg-white dark:bg-slate-900 rounded p-3 border border-slate-200 dark:border-slate-800 space-y-1 max-h-[400px] overflow-y-auto"
								>
									{#if displayData.time}
										{@const idx = (() => {
											if (!displayData.time || displayData.time.length === 0) return -1;
											let i = displayData.time.findIndex((t) => t >= hoverTime);
											if (i === -1) i = displayData.time.length - 1;
											return i;
										})()}

										<div
											class="flex justify-between text-xs border-b border-slate-100 dark:border-slate-800 pb-1 mb-1 sticky top-0 bg-white dark:bg-slate-900 z-10"
										>
											<span
												class="font-semibold text-slate-400 uppercase tracking-wider text-[10px]"
												>Channel</span
											>
											<span
												class="font-semibold text-slate-400 uppercase tracking-wider text-[10px]"
												>Value</span
											>
										</div>

										{#each Object.entries(displayData).sort( ([a], [b]) => a.localeCompare(b) ) as [key, values]}
											{#if Array.isArray(values) && typeof values[0] === 'number'}
												<div
													class="flex justify-between text-xs items-center hover:bg-slate-50 dark:hover:bg-slate-800 px-1 rounded transition-colors border-b border-slate-50 dark:border-slate-800/50 last:border-0"
												>
													<span
														class="text-slate-500 font-mono text-[10px] truncate mr-4"
														title={key}>{key}</span
													>
													<span
														class="font-mono text-xs {key === 'speed'
															? 'text-blue-500 dark:text-blue-400 font-bold'
															: 'text-slate-700 dark:text-slate-200'}"
													>
														{key === 'time'
															? formatLapTime(values[idx])
															: values[idx] !== undefined
																? values[idx].toFixed(key === 'rpm' ? 0 : 3)
																: '--'}
													</span>
												</div>
											{/if}
										{/each}
									{/if}
								</div>
							</div>
						{/if}
					</div>
				</Card>
			{:else}
				<Card title={'Telemetry Analysis: Lap ' + selectedLap.lapNumber}>
					<div
						class="flex flex-col items-center justify-center h-48 text-slate-400 dark:text-slate-500"
					>
						<Activity class="w-8 h-8 mb-2 opacity-50" />
						<p>No telemetry data available for this lap.</p>
					</div>
				</Card>
			{/if}
		{/if}
	</div>

	<div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
		<!-- Left Column -->
		<div class="space-y-6">
			<!-- AI Coach Section -->
			<Card title="AI Race Engineer">
				<div
					class="mb-4 flex flex-wrap gap-2 text-xs border-b border-slate-100 dark:border-slate-800 pb-3"
				>
					<span
						class="mr-2 text-slate-400 dark:text-slate-500 py-1 uppercase tracking-wider font-bold text-[10px] self-center"
						>Filters:</span
					>

					<button
						class="px-2 py-1 rounded border transition-colors {enabledAnalysis.coasting
							? 'bg-blue-100 dark:bg-blue-900/30 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-200'
							: 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-400 opacity-50'}"
						onclick={() => (enabledAnalysis.coasting = !enabledAnalysis.coasting)}
					>
						<Wind class="w-3 h-3 inline mr-1" /> Coasting
					</button>
					<button
						class="px-2 py-1 rounded border transition-colors {enabledAnalysis.braking
							? 'bg-orange-100 dark:bg-orange-900/30 border-orange-200 dark:border-orange-800 text-orange-700 dark:text-orange-200'
							: 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-400 opacity-50'}"
						onclick={() => (enabledAnalysis.braking = !enabledAnalysis.braking)}
					>
						<Activity class="w-3 h-3 inline mr-1" /> Braking
					</button>
					<button
						class="px-2 py-1 rounded border transition-colors {enabledAnalysis.throttle
							? 'bg-emerald-100 dark:bg-emerald-900/30 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-200'
							: 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-400 opacity-50'}"
						onclick={() => (enabledAnalysis.throttle = !enabledAnalysis.throttle)}
					>
						<Zap class="w-3 h-3 inline mr-1" /> Throttle
					</button>
					<button
						class="px-2 py-1 rounded border transition-colors {enabledAnalysis.steering
							? 'bg-purple-100 dark:bg-purple-900/30 border-purple-200 dark:border-purple-800 text-purple-700 dark:text-purple-200'
							: 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-400 opacity-50'}"
						onclick={() => (enabledAnalysis.steering = !enabledAnalysis.steering)}
					>
						<Gauge class="w-3 h-3 inline mr-1" /> Steering
					</button>
				</div>

				<div class="space-y-3 min-h-[200px]">
					{#if isAnalyzing}
						<div
							class="flex items-center justify-center h-full text-slate-400 dark:text-slate-500 gap-2"
						>
							<Activity class="w-5 h-5 animate-pulse" /> Analyzing Lap Data...
						</div>
					{:else if filteredTips.length > 0}
						{#each filteredTips as tip}
							<div
								class="p-3 rounded border flex items-start gap-3
                             {tip.severity === 'high'
									? 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-200'
									: tip.severity === 'medium'
										? 'bg-orange-50 dark:bg-orange-950/20 border-orange-200 dark:border-orange-900/50 text-orange-700 dark:text-orange-200'
										: 'bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900/50 text-blue-700 dark:text-blue-200'}"
							>
								<div class="mt-0.5">
									{#if tip.type === 'coasting'}<Wind class="w-4 h-4" />
									{:else if tip.type === 'braking'}<Activity class="w-4 h-4" />
									{:else if tip.type === 'throttle'}<Zap class="w-4 h-4" />
									{:else if tip.type === 'steering'}<Gauge class="w-4 h-4" />
									{/if}
								</div>
								<div>
									<div class="text-xs font-mono opacity-60 mb-1">
										{formatLapTime(tip.startTime)} - {formatLapTime(tip.endTime)}
									</div>
									<p class="text-sm">{tip.message}</p>
								</div>
							</div>
						{/each}
					{:else}
						<div
							class="flex flex-col items-center justify-center h-full text-slate-400 dark:text-slate-500 py-8"
						>
							<span class="text-lg mb-2">Clean Lap!</span>
							<span class="text-sm opacity-60">No major driving errors detected.</span>
						</div>
					{/if}
				</div>
			</Card>

			<Card title="Conditions">
				<div class="grid grid-cols-2 gap-4">
					{#if isEditing}
						<div
							class="p-3 rounded-lg bg-slate-100 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800/50"
						>
							<label class="block text-xs text-slate-500 uppercase mb-1">Air Temp (°F)</label>
							<input
								form="edit-session-form"
								type="number"
								name="airTemp"
								value={session.airTemp}
								class="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded px-2 py-1 text-slate-900 dark:text-white"
							/>
						</div>
						<div
							class="p-3 rounded-lg bg-slate-100 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800/50"
						>
							<label class="block text-xs text-slate-500 uppercase mb-1">Track Temp (°F)</label>
							<input
								form="edit-session-form"
								type="number"
								name="trackTemp"
								value={session.trackTemp}
								class="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded px-2 py-1 text-slate-900 dark:text-white"
							/>
						</div>
						<div
							class="col-span-2 p-3 rounded-lg bg-slate-100 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800/50"
						>
							<label class="block text-xs text-slate-500 uppercase mb-1">Condition</label>
							<select
								form="edit-session-form"
								name="condition"
								value={session.condition}
								class="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded px-2 py-1 text-slate-900 dark:text-white"
							>
								<option value="Dry">Dry</option>
								<option value="Wet">Wet</option>
								<option value="Mixed">Mixed</option>
							</select>
						</div>
					{:else}
						<div
							class="flex items-center gap-3 p-3 rounded-lg bg-slate-100 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800/50"
						>
							<Wind class="w-5 h-5 text-slate-400 dark:text-slate-500" />
							<div>
								<dt class="text-xs text-slate-500 uppercase">Air Temp</dt>
								<dd class="font-mono text-lg text-slate-700 dark:text-slate-200">
									{session.airTemp}°F
								</dd>
							</div>
						</div>
						<div
							class="flex items-center gap-3 p-3 rounded-lg bg-slate-100 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800/50"
						>
							<Thermometer class="w-5 h-5 text-orange-500" />
							<div>
								<dt class="text-xs text-slate-500 uppercase">Track Temp</dt>
								<dd class="font-mono text-lg text-slate-700 dark:text-slate-200">
									{session.trackTemp}°F
								</dd>
							</div>
						</div>
						<div
							class="col-span-2 flex items-center gap-3 p-3 rounded-lg bg-slate-100 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800/50"
						>
							<Zap class="w-5 h-5 text-yellow-500" />
							<div>
								<dt class="text-xs text-slate-500 uppercase">Condition</dt>
								<dd class="font-medium text-slate-600 dark:text-slate-300">
									{session.condition}
								</dd>
							</div>
						</div>
					{/if}
				</div>
			</Card>

			<Card title="Tire Setup">
				<div
					class="relative bg-slate-100 dark:bg-slate-950/50 p-6 rounded-lg border border-slate-200 dark:border-slate-800/50 flex justify-center py-10"
				>
					<div
						class="w-32 h-48 border-2 border-slate-300 dark:border-slate-700/30 rounded-lg relative"
					>
						<div
							class="absolute -top-4 -left-4 bg-white dark:bg-slate-800 p-2 rounded border border-slate-200 dark:border-slate-700 text-center w-20 shadow-sm dark:shadow-none"
						>
							<span class="block text-xs text-slate-500">FL</span>
							{#if isEditing}
								<input
									form="edit-session-form"
									type="number"
									step="0.1"
									name="tirePressureFL"
									value={session.tirePressureFL}
									class="w-full bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-600 rounded px-1 py-0.5 text-center font-mono text-orange-500 dark:text-orange-400"
								/>
							{:else}
								<span class="block font-mono font-bold text-orange-500 dark:text-orange-400"
									>{session.tirePressureFL}</span
								>
							{/if}
						</div>
						<div
							class="absolute -top-4 -right-4 bg-white dark:bg-slate-800 p-2 rounded border border-slate-200 dark:border-slate-700 text-center w-20 shadow-sm dark:shadow-none"
						>
							<span class="block text-xs text-slate-500">FR</span>
							{#if isEditing}
								<input
									form="edit-session-form"
									type="number"
									step="0.1"
									name="tirePressureFR"
									value={session.tirePressureFR}
									class="w-full bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-600 rounded px-1 py-0.5 text-center font-mono text-orange-500 dark:text-orange-400"
								/>
							{:else}
								<span class="block font-mono font-bold text-orange-500 dark:text-orange-400"
									>{session.tirePressureFR}</span
								>
							{/if}
						</div>
						<div
							class="absolute -bottom-4 -left-4 bg-white dark:bg-slate-800 p-2 rounded border border-slate-200 dark:border-slate-700 text-center w-20 shadow-sm dark:shadow-none"
						>
							<span class="block text-xs text-slate-500">RL</span>
							{#if isEditing}
								<input
									form="edit-session-form"
									type="number"
									step="0.1"
									name="tirePressureRL"
									value={session.tirePressureRL}
									class="w-full bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-600 rounded px-1 py-0.5 text-center font-mono text-orange-500 dark:text-orange-400"
								/>
							{:else}
								<span class="block font-mono font-bold text-orange-500 dark:text-orange-400"
									>{session.tirePressureRL}</span
								>
							{/if}
						</div>
						<div
							class="absolute -bottom-4 -right-4 bg-white dark:bg-slate-800 p-2 rounded border border-slate-200 dark:border-slate-700 text-center w-20 shadow-sm dark:shadow-none"
						>
							<span class="block text-xs text-slate-500">RR</span>
							{#if isEditing}
								<input
									form="edit-session-form"
									type="number"
									step="0.1"
									name="tirePressureRR"
									value={session.tirePressureRR}
									class="w-full bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-600 rounded px-1 py-0.5 text-center font-mono text-orange-500 dark:text-orange-400"
								/>
							{:else}
								<span class="block font-mono font-bold text-orange-500 dark:text-orange-400"
									>{session.tirePressureRR}</span
								>
							{/if}
						</div>
					</div>

					<div class="absolute bottom-2 w-full text-center">
						{#if isEditing}
							<input
								form="edit-session-form"
								type="text"
								name="tireCompound"
								value={session.tireCompound}
								class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded px-2 py-1 text-xs text-center text-slate-600 dark:text-slate-300 w-full mb-1"
								placeholder="Compound"
							/>
							<label
								class="flex items-center justify-center gap-2 text-xs text-slate-500 cursor-pointer"
							>
								<input
									form="edit-session-form"
									type="checkbox"
									name="isNewSet"
									checked={session.isNewSet}
									class="rounded bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700"
								/>
								New Set?
							</label>
						{:else}
							<span class="text-xs font-mono text-slate-500"
								>{session.tireCompound} • {session.isNewSet
									? 'New Set (Sticker)'
									: 'Scrubbed'}</span
							>
						{/if}
					</div>
				</div>
			</Card>
		</div>

		<!-- Right Column -->
		<div class="lg:col-span-2 space-y-6">
			<Card title="Lap Time Consistency">
				<div class="flex items-center justify-between mb-4 px-4 pt-2">
					<div class="flex items-center gap-4 text-xs">
						<label
							class="flex items-center gap-2 cursor-pointer text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
						>
							<input
								type="checkbox"
								bind:checked={showAllLaps}
								class="rounded bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-orange-500"
							/>
							Show All / Invalid Laps
						</label>
						<div
							class="flex items-center gap-2 border-l border-slate-200 dark:border-slate-800 pl-4"
						>
							<span class="text-slate-500">Outlier Threshold:</span>
							<input
								type="range"
								bind:value={outlierThreshold}
								min="0"
								max="10"
								step="0.5"
								class="w-24 accent-orange-500"
							/>
							<span class="text-slate-600 dark:text-slate-300 font-mono"
								>+ {outlierThreshold.toFixed(1)}s</span
							>
						</div>
					</div>
					<p class="text-xs text-slate-400 dark:text-slate-600">
						Click point to view • {showAllLaps ? 'Showing all laps' : 'Auto-hiding outliers'}
					</p>
				</div>

				<div
					class="w-full aspect-[3/1] bg-slate-100 dark:bg-slate-950/30 rounded-lg border border-slate-200 dark:border-slate-800/50 p-4 overflow-hidden relative"
				>
					<svg viewBox="0 0 {width} {height}" class="w-full h-full overflow-visible">
						{#each [0, 0.25, 0.5, 0.75, 1] as tick}
							<line
								x1={padding}
								y1={padding + tick * (height - 2 * padding)}
								x2={width - padding}
								y2={padding + tick * (height - 2 * padding)}
								class="stroke-slate-300 dark:stroke-slate-700"
								stroke-width="1"
								stroke-dasharray="4 4"
							/>
							<text
								x={padding - 10}
								y={padding + tick * (height - 2 * padding)}
								class="fill-slate-500 dark:fill-slate-500"
								font-size="12"
								text-anchor="end"
								alignment-baseline="middle"
							>
								{formatLapTime(maxTime - tick * (maxTime - minTime))}
							</text>
						{/each}

						<polyline
							fill="none"
							stroke="#f97316"
							stroke-width="2"
							{points}
							vector-effect="non-scaling-stroke"
							class="opacity-50"
						/>

						{#each graphLaps as lap}
							<!-- svelte-ignore a11y_click_events_have_key_events -->
							<!-- svelte-ignore a11y_no_static_element_interactions -->
							<circle
								cx={xScale(lap.lapNumber)}
								cy={yScale(lap.timeSeconds)}
								r={selectedLapNumber === lap.lapNumber ? 8 : lap.valid ? 4 : 3}
								fill={selectedLapNumber === lap.lapNumber
									? '#f97316'
									: lap.valid
										? 'currentColor'
										: '#991b1b'}
								stroke={selectedLapNumber === lap.lapNumber
									? '#fff'
									: lap.valid
										? '#f97316'
										: '#ef4444'}
								stroke-width="2"
								class="hover:r-8 hover:fill-orange-500 transition-all cursor-pointer relative z-10 {lap.valid
									? 'text-slate-200 dark:text-slate-800'
									: ''}"
								onclick={() => selectLap(lap)}
							>
								<title
									>Lap {lap.lapNumber}: {formatLapTime(lap.timeSeconds)}
									{lap.valid ? '' : '(Invalid)'}</title
								>
							</circle>
						{/each}
					</svg>
				</div>
			</Card>

			<Card title="Lap Breakdown">
				<div class="overflow-x-auto">
					<table class="w-full text-left border-collapse">
						<thead>
							<tr
								class="text-xs text-slate-500 uppercase border-b border-slate-200 dark:border-slate-800"
							>
								<th class="p-3 font-medium">Driver</th>
								<th class="p-3 font-medium">Lap</th>
								<th class="p-3 font-medium">Time</th>
								<th class="p-3 font-medium">Valid</th>
								<th class="p-3 font-medium text-right">S1</th>
								<th class="p-3 font-medium text-right">S2</th>
								<th class="p-3 font-medium text-right">S3</th>
								<th class="p-3 font-medium text-right">Delta</th>
								<th class="p-3 font-medium text-right">Action</th>
							</tr>
						</thead>
						<tbody class="text-sm font-mono">
							{#each laps as lap}
								<!-- svelte-ignore a11y_click_events_have_key_events -->
								<!-- svelte-ignore a11y_no_static_element_interactions -->
								<tr
									class="border-b border-slate-100 dark:border-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800/30 transition-colors cursor-pointer
                                {selectedLapNumber === lap.lapNumber
										? 'bg-slate-200 dark:bg-slate-800/80 border-l-2 border-l-orange-500'
										: ''}
                                {!lap.valid ? 'opacity-50' : ''}"
									onclick={() => selectLap(lap)}
								>
									<td class="p-3">
										<!-- svelte-ignore a11y_click_events_have_key_events -->
										<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
										<!-- svelte-ignore a11y_no_static_element_interactions -->
										<form
											action="?/setLapDriver"
											method="POST"
											use:enhance
											onclick={(e) => e.stopPropagation()}
										>
											<input type="hidden" name="lapNumber" value={lap.lapNumber} />
											<select
												name="driverId"
												class="bg-transparent text-xs rounded px-1 py-0.5 cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-700/50"
												style="color: {lap.driverColor ||
													'#94a3b8'}; border: 1px solid {lap.driverColor || '#334155'}"
												onchange={(e) => e.currentTarget.closest('form')?.requestSubmit()}
											>
												{#each data.drivers as drv}
													<option value={drv.id} selected={drv.id === lap.driverId}
														>{drv.name}</option
													>
												{/each}
											</select>
										</form>
									</td>
									<td class="p-3 text-slate-500 dark:text-slate-400">#{lap.lapNumber}</td>
									<td
										class="p-3 font-bold {lap === bestLap
											? 'text-emerald-500 dark:text-emerald-400'
											: 'text-slate-700 dark:text-slate-200'}"
									>
										{formatLapTime(lap.timeSeconds)}
										{#if lap === bestLap}<span
												class="text-xs ml-2 px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-500 border border-emerald-200 dark:border-emerald-900/50"
												>PB</span
											>{/if}
									</td>
									<td class="p-3">
										{#if lap.valid}
											<span class="text-emerald-500">OK</span>
										{:else}
											<span class="text-red-500">OUT</span>
										{/if}
									</td>
									<td class="p-3 text-right text-slate-500 dark:text-slate-400"
										>{lap.s1?.toFixed(2)}</td
									>
									<td class="p-3 text-right text-slate-500 dark:text-slate-400"
										>{lap.s2?.toFixed(2)}</td
									>
									<td class="p-3 text-right text-slate-500 dark:text-slate-400"
										>{lap.s3?.toFixed(2)}</td
									>
									<td
										class="p-3 text-right {lap.timeSeconds < avgLap
											? 'text-emerald-500 dark:text-emerald-400'
											: 'text-red-500 dark:text-red-400'}"
									>
										{lap.timeSeconds < avgLap ? '-' : '+'}{Math.abs(
											lap.timeSeconds - avgLap
										).toFixed(2)}
									</td>
									<td class="p-3 text-right">
										<form
											method="POST"
											action="?/toggleLapValidity"
											use:enhance
											class="inline-block"
											onclick={(e) => e.stopPropagation()}
										>
											<input type="hidden" name="lapNumber" value={lap.lapNumber} />
											<input type="hidden" name="valid" value={(!lap.valid).toString()} />
											<button
												class="text-xs underline hover:text-slate-900 dark:hover:text-white text-slate-500"
											>
												{lap.valid ? 'Invalidate' : 'Restore'}
											</button>
										</form>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</Card>
		</div>
	</div>

	<!-- Track Config Modal -->
	{#if showTrackConfig && displayData}
		<div class="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4">
			<div
				class="bg-white dark:bg-slate-900 rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col relative"
			>
				<div
					class="p-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center"
				>
					<h2 class="text-xl font-bold">Configure Track Map</h2>
					<button
						onclick={() => (showTrackConfig = false)}
						class="text-slate-500 hover:text-slate-900 dark:hover:text-white"
					>
						<X class="w-5 h-5" />
					</button>
				</div>

				<div class="flex-1 min-h-0 p-4 bg-slate-100 dark:bg-slate-950/50">
					<div
						class="h-[60vh] bg-slate-900 rounded-lg border border-slate-800 overflow-hidden relative"
					>
						<TrackMap data={displayData} editable={true} bind:trackConfig={editingTrackConfig} />
					</div>
					<div class="mt-4 text-sm text-slate-500 dark:text-slate-400">
						<p>
							<strong>Instructions:</strong> Use Right-Click to set the Start/Finish line instantly. Clicking
							with Left-Click will place lines sequentially (Finish -> S1 -> S2).
						</p>
						<p class="mt-1 text-orange-500 dark:text-orange-400">
							Warning: Saving will recalculate all lap times and splits based on the new
							Start/Finish line.
						</p>
					</div>
				</div>

				<div
					class="p-4 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-b-lg flex justify-end gap-3"
				>
					<button
						onclick={() => (showTrackConfig = false)}
						class="px-4 py-2 rounded text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
					>
						Cancel
					</button>
					<form
						action="?/updateTrackConfig"
						method="POST"
						use:enhance={() => {
							return async ({ result, update }) => {
								if (result.type === 'success') {
									showTrackConfig = false;
									isEditing = false;
								}
								await update();
							};
						}}
					>
						<input type="hidden" name="config" value={JSON.stringify(editingTrackConfig)} />
						<button
							type="submit"
							class="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded shadow-lg shadow-emerald-900/20 transition-all"
						>
							Save & Recalculate Laps
						</button>
					</form>
				</div>
			</div>
		</div>
	{/if}

    <!-- REMAP MODALS -->
    {#if showRemapModal}
        <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
             <!-- svelte-ignore a11y_click_events_have_key_events -->
             <!-- svelte-ignore a11y_no_static_element_interactions -->
             <div class="absolute inset-0 bg-black/80 backdrop-blur-sm" onclick={() => showRemapModal = false}></div>
             <!-- svelte-ignore a11y_click_events_have_key_events -->
             <!-- svelte-ignore a11y_no_static_element_interactions -->
             <div class="relative w-full max-w-lg bg-slate-900 rounded-xl shadow-2xl border border-slate-800 p-6" onclick={e => e.stopPropagation()}>
                <header class="flex justify-between items-center mb-4">
                    <h3 class="text-xl font-bold text-white">Remap Telemetry Channels</h3>
                    <button onclick={() => showRemapModal = false} class="text-slate-400 hover:text-white"><X class="w-6 h-6"/></button>
                </header>
                
                {#if !mappingSession}
                    <div class="space-y-4">
                         
                         {#if files.length > 0 && remapLoading}
                             <div class="text-center py-8 border-2 border-dashed border-slate-800 rounded-lg">
                                <Loader class="w-10 h-10 text-orange-500 animate-spin mx-auto mb-4"/>
                                <p class="text-sm text-slate-300">Parsing file...</p>
                                <p class="text-xs text-slate-500 mt-1">This may take a few seconds.</p>
                             </div>
                         {:else}
                             <p class="text-sm text-slate-400 mb-2">
                                Updates to channel mappings require the original raw file. Please re-upload it to proceed.
                             </p>
                             <!-- svelte-ignore a11y_click_events_have_key_events -->
                             <!-- svelte-ignore a11y_no_static_element_interactions -->
                             <div 
                                class="border-2 border-dashed border-slate-700 rounded-lg p-8 text-center hover:border-orange-500 transition-colors relative cursor-pointer bg-slate-950/50"
                                onclick={() => document.getElementById('remap-file-input')?.click()}
                            >
                                <input id="remap-file-input" type="file" class="hidden" onchange={handleRemapFileSelect} accept=".vbo,.csv,.txt" />
                                <UploadCloud class="w-10 h-10 text-slate-500 mx-auto mb-3" />
                                <p class="text-sm text-slate-300 font-medium">Click to upload original file</p>
                                <p class="text-xs text-slate-500 mt-1">Supported: .vbo, .csv, .txt</p>
                             </div>
                         {/if}
                    </div>
                {/if}

                {#if mappingSession}
                     <div class="mt-2 flex flex-col h-full max-h-[65vh]">
                        <div class="flex items-center justify-between mb-4 bg-slate-950 p-2 rounded border border-slate-800">
                             <div class="flex flex-col">
                                 <span class="text-xs text-slate-500 uppercase">Load Preset</span>
                                 <select 
                                    class="bg-transparent text-sm text-white outline-none"
                                    onchange={(e) => {
                                        const mappingId = parseInt(e.currentTarget.value);
                                        const mapping = data.channelMappings.find(m => m.id === mappingId);
                                        if (mapping && mappingSession.metadata) {
                                            // Merge or Replace? Let's replace for the keys that exist
                                            if (!mappingSession.metadata.channelMapping) mappingSession.metadata.channelMapping = {};
                                            Object.assign(mappingSession.metadata.channelMapping, mapping.mapping);
                                        }
                                    }}
                                 >
                                    <option value="">-- Select Saved Mapping --</option>
                                    {#each data.channelMappings.filter(m => m.carId === session.carId) as map}
                                        <option value={map.id}>{map.name}</option>
                                    {/each}
                                 </select>
                             </div>
                             
                             <div class="h-8 w-px bg-slate-800 mx-2"></div>
                             
                             <form 
                                action="?/saveChannelMapping" 
                                method="POST" 
                                use:enhance={() => {
                                    return async ({ result }) => {
                                        if (result.type === 'success') {
                                            alert('Mapping saved!');
                                            await invalidateAll(); // Reload to get new list
                                        } else {
                                            alert('Failed to save mapping. Check console.');
                                        }
                                    }
                                }}
                                class="flex items-center gap-2"
                             >
                                <input type="hidden" name="carId" value={session.carId || ''} />
                                <input type="hidden" name="mapping" value={JSON.stringify(mappingSession.metadata.channelMapping)} />
                                
                                <div class="relative group">
                                    <input 
                                        type="text" 
                                        name="name" 
                                        placeholder={session.carId ? "Preset Name..." : "No Car Selected"} 
                                        class="bg-slate-800 text-xs text-white px-2 py-1 rounded border border-slate-700 w-32 disabled:opacity-50 disabled:cursor-not-allowed" 
                                        required
                                        disabled={!session.carId}
                                    />
                                    <button 
                                        type="submit" 
                                        class="text-xs bg-emerald-600 hover:bg-emerald-500 text-white px-2 py-1 rounded disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-slate-600"
                                        disabled={!session.carId}
                                    >
                                        Save
                                    </button>
                                    
                                    {#if !session.carId}
                                        <div class="absolute bottom-full left-0 mb-2 w-48 p-2 bg-slate-800 text-xs text-slate-300 rounded shadow-lg hidden group-hover:block z-50 border border-slate-700">
                                            Please set a Car for this session in the "Edit Session" menu to save channel mappings.
                                        </div>
                                    {/if}
                                </div>
                             </form>
                        </div>

                        <p class="text-xs text-slate-400 mb-4 bg-slate-950 p-3 rounded border border-slate-800">
                            <strong>Instructions:</strong> Match the columns found in your file (Right) to the standard channels (Left). 
                            Required channels (Velocity, Lat/Long) must be mapped for analysis.
                        </p>
                        
                        <div class="overflow-y-auto flex-1 pr-2 space-y-3">
                            {#if mappingSession.metadata.columns}
                                {#each ['velocity', 'rpm', 'throttle', 'brake', 'steer', 'gear', 'lat', 'long'] as channel}
                                    <div class="flex items-center justify-between p-3 bg-slate-950 rounded border border-slate-800">
                                        <div class="flex items-center gap-3">
                                             <span class="text-sm font-bold text-slate-300 capitalize w-16">{channel}</span>
                                             {#if mappingSession.metadata.channelMapping?.[channel]}
                                                 <Check class="w-4 h-4 text-emerald-500" />
                                             {:else}
                                                 <AlertCircle class="w-4 h-4 text-orange-500" />
                                             {/if}
                                        </div>
                                        
                                        <select
                                            value={mappingSession.metadata.channelMapping?.[channel] || ''}
                                            onchange={(e) => {
                                                const val = e.currentTarget.value;
                                                if (!mappingSession.metadata.channelMapping) mappingSession.metadata.channelMapping = {};
                                                mappingSession.metadata.channelMapping[channel] = val;
                                            }}
                                            class="bg-slate-800 border-slate-700 text-white text-xs rounded px-2 py-1.5 w-40 md:w-56 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 outline-none"
                                        >
                                            <option value="">-- Let Auto-Detect --</option>
                                            {#each mappingSession.metadata.columns as col}
                                                <option value={col}>{col}</option>
                                            {/each}
                                        </select>
                                    </div>
                                {/each}
                            {:else}
                                <div class="text-center p-8 text-slate-500">
                                    No column information available.
                                </div>
                            {/if}
                        </div>

                        <div class="mt-4 flex justify-end gap-3 pt-4 border-t border-slate-800">
                             <!-- Reparse button to preview validity? Or just one step -->
                             <!-- Keep it simple for now -->
                            <button
                                onclick={applyRemap}
                                class="px-6 py-2 bg-orange-600 hover:bg-orange-500 text-white font-bold rounded flex items-center gap-2 shadow-lg shadow-orange-900/20"
                                disabled={remapLoading}
                            >
                                {#if remapLoading}
                                    <Loader class="w-4 h-4 animate-spin"/> Processing...
                                {:else}
                                    Apply & Update Session
                                {/if}
                            </button>
                        </div>
                     </div>
                {/if}
            </div>
        </div>
    {/if}

    {#if mergePreview}
        <!-- Channel Picker Modal -->
        <div class="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onclick={() => mergePreview = null}>
            <div class="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-2xl max-w-lg w-full max-h-[80vh] flex flex-col" onclick={(e) => e.stopPropagation()}>
                <div class="p-5 border-b border-slate-200 dark:border-slate-700">
                    <h3 class="text-lg font-semibold text-slate-900 dark:text-white">Select Channels to Import</h3>
                    <p class="text-sm text-slate-500 dark:text-slate-400 mt-1">
                        {mergePreview.file.name} &middot; Matched {mergePreview.lapsWithCoverage}/{mergePreview.totalLaps} laps{mergePreview.shift !== 0 ? ` (shift: ${mergePreview.shift >= 0 ? '+' : ''}${mergePreview.shift})` : ''}
                    </p>
                </div>

                <div class="p-4 overflow-y-auto flex-1">
                    <div class="flex gap-2 mb-3">
                        <button
                            class="text-xs px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300"
                            onclick={() => {
                                const all: Record<string, boolean> = {};
                                for (const ch of mergePreview!.channels) all[ch] = true;
                                mergeSelectedChannels = all;
                            }}
                        >Select All</button>
                        <button
                            class="text-xs px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300"
                            onclick={() => {
                                const none: Record<string, boolean> = {};
                                for (const ch of mergePreview!.channels) none[ch] = false;
                                mergeSelectedChannels = none;
                            }}
                        >Select None</button>
                    </div>

                    <div class="grid gap-1">
                        {#each mergePreview.channels as channel}
                            <label class="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer">
                                <input
                                    type="checkbox"
                                    bind:checked={mergeSelectedChannels[channel]}
                                    class="rounded border-slate-300 dark:border-slate-600"
                                />
                                <span class="font-mono text-sm text-slate-800 dark:text-slate-200 flex-1">{channel}</span>
                                <span class="text-xs text-slate-400 dark:text-slate-500 min-w-[4rem] text-right">
                                    {mergePreview.units[channel] || '—'}
                                </span>
                                <span class="text-xs text-slate-400 dark:text-slate-500 tabular-nums min-w-[5rem] text-right">
                                    {(mergePreview.sampleCounts[channel] || 0).toLocaleString()} pts
                                </span>
                            </label>
                        {/each}
                    </div>
                </div>

                <div class="p-4 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between">
                    <span class="text-xs text-slate-500">
                        {Object.values(mergeSelectedChannels).filter(Boolean).length} of {mergePreview.channels.length} channels selected
                    </span>
                    <div class="flex gap-2">
                        <button
                            class="px-4 py-2 text-sm rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300"
                            onclick={() => mergePreview = null}
                        >Cancel</button>
                        <button
                            class="px-4 py-2 text-sm rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium disabled:opacity-50"
                            disabled={mergeLoading || Object.values(mergeSelectedChannels).filter(Boolean).length === 0}
                            onclick={executeMerge}
                        >
                            {#if mergeLoading}
                                Importing...
                            {:else}
                                Import Channels
                            {/if}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    {/if}
</div>

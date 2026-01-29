<script lang="ts">
	import { onMount, onDestroy, untrack } from 'svelte';

	let { src, onPlay, onPause, onTimeUpdate, overlays = [], rotation = 0 } = $props<{
		src: string;
		onPlay?: () => void;
		onPause?: () => void;
		onTimeUpdate?: (time: number) => void;
        rotation?: number;
		overlays?: {
			startTime: number;
			endTime: number;
			message: string;
			type: string;
			severity: string;
		}[];
	}>();

	let container: HTMLDivElement;
	let nativeVideo: HTMLVideoElement | undefined = $state();
	let ytPlayer: any = $state(); 
	let playerType = $state<'native' | 'youtube'>('native');
	let ytReady = $state(false);
	let timeInterval: any;
	let currentTime = $state(0);

    // Multi-part state
    type Partition = {
        url: string;
        duration: number; // seconds
        globalStart: number;
        globalEnd: number;
        type: 'native' | 'youtube';
        ytId: string | null;
        hasError?: boolean;
    };
    
    let partitions = $state<Partition[]>([]);
	let currentPartitionIndex = $state(0);
    let totalDuration = $state(0);
    // Loading state for metadata
    let metadataLoadedCount = $state(0);
	
	// Parse src into partitions
	$effect(() => {
        const s = src; // Track src
        untrack(() => {
            // Reset
            partitions = [];
            totalDuration = 0;
            metadataLoadedCount = 0;
            currentPartitionIndex = 0;

            let urls: string[] = [];
            try {
                // Try parsing as JSON array
                const parsed = JSON.parse(s);
                if (Array.isArray(parsed)) urls = parsed;
                else urls = [s];
            } catch {
                // Split by comma if not JSON
                urls = s.split(',').map(st => st.trim()).filter(st => st.length > 0);
            }

            // Initialize partitions (durations unknown initially)
            partitions = urls.map(u => {
                const ytId = getYouTubeID(u);
                return {
                    url: u,
                    duration: 0,
                    globalStart: 0, 
                    globalEnd: 0,
                    type: ytId ? 'youtube' : 'native',
                    ytId
                }
            });

            // Load metadata for all parts to establish timeline (Sequentially)
            loadMetadataSequentially();
        });
	});

    async function loadMetadataSequentially() {
        if (partitions.length === 0) return;
        
        // Create a SINGLE video element for probing
        const probeVideo = document.createElement('video');
        probeVideo.preload = 'metadata';
        probeVideo.muted = true;

        for (let i = 0; i < partitions.length; i++) {
            const part = partitions[i];
            
            if (part.type === 'native') {
                try {
                    const duration = await getDurationForUrl(probeVideo, part.url);
                    partitions[i].duration = duration;
                } catch (e) {
                    console.warn('Failed to load metadata for', part.url);
                    partitions[i].duration = 0;
                    partitions[i].hasError = true;
                }
            } else {
                // YouTube placeholders
                partitions[i].duration = 0; 
            }
        }

        // Cleanup
        probeVideo.removeAttribute('src');
        probeVideo.load();

        // Calculate global timeline
        let runningTime = 0;
        partitions.forEach(p => {
            p.globalStart = runningTime;
            p.globalEnd = runningTime + p.duration;
            runningTime += p.duration;
        });
        totalDuration = runningTime;
        
        // Initialize first player
        loadPartition(0);
    }

    function getDurationForUrl(videoEl: HTMLVideoElement, url: string): Promise<number> {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                cleanup();
                console.warn('Metadata load timed out for:', url);
                // If it's a stream, it might just be slow. Let's try to return 0 or 1hr? 
                // Returning 0 might be interpreted as empty/error.
                resolve(0); 
            }, 15000); // 15s timeout for transcoding startup

            const cleanup = () => {
                clearTimeout(timeout);
                videoEl.onloadedmetadata = null;
                videoEl.onerror = null;
            };

            videoEl.onloadedmetadata = () => {
                const d = videoEl.duration;
                cleanup();
                if (d === Infinity) {
                     console.log('[UniversalPlayer] Duration is Infinity (Stream detected). Using fallback.');
                     resolve(3600); // Fallback to 1 hour for stream?
                } else {
                     resolve(d);
                }
            };

            videoEl.onerror = (e) => {
                cleanup();
                const err = (videoEl.error as any);
                console.warn('Error loading video metadata:', url, err.code, err.message);
                resolve(0); // Graceful fallback
            };

            videoEl.src = url;
            // Ensure we trigger load
            videoEl.load();
        });
    }
    
    function loadPartition(index: number, startTimeInPart: number = 0) {
        if (index < 0 || index >= partitions.length) return;
        currentPartitionIndex = index;
        const part = partitions[index];
        
        // Setup Player
        if (part.type === 'youtube' && part.ytId) {
            playerType = 'youtube';
            loadYouTubeAPI(part.ytId, startTimeInPart);
        } else {
            playerType = 'native';
            if (ytPlayer) {
				try { ytPlayer.destroy(); } catch (e) {}
				ytPlayer = null;
			}
            // Add a tick to let DOM update if switching from YT
            setTimeout(() => {
                if (nativeVideo) {
                    nativeVideo.currentTime = startTimeInPart;
                    // If we were playing, auto play? 
                    // Let's assume paused unless told otherwise, but usually 'seek' involves playing if it was playing.
                    // For now, just load.
                }
            }, 0);
        }
    }

	// Extract YouTube ID
	function getYouTubeID(url: string) {
		const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
		const match = url.match(regExp);
		return match && match[2].length === 11 ? match[2] : null;
	}

	function loadYouTubeAPI(videoId: string, startSeconds: number = 0) {
		if (window.YT && window.YT.Player) {
			initYTPlayer(videoId, startSeconds);
		} else {
			// Check if script is already loading
			if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
				const tag = document.createElement('script');
				tag.src = 'https://www.youtube.com/iframe_api';
				const firstScriptTag = document.getElementsByTagName('script')[0];
				firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);
			}

			// Poll for API ready
			const checkYT = setInterval(() => {
				if (window.YT && window.YT.Player) {
					clearInterval(checkYT);
					initYTPlayer(videoId, startSeconds);
				}
			}, 100);
		}
	}

	function initYTPlayer(videoId: string, startSeconds: number = 0) {
		if (ytPlayer) {
            try {
			    ytPlayer.cueVideoById({videoId, startSeconds});
            } catch(e) {
                newYT(videoId, startSeconds);
            }
			return;
		}
        newYT(videoId, startSeconds);
    }
    
    function newYT(videoId: string, startSeconds: number = 0) {
        const divId = 'yt-player-' + Math.random().toString(36).substr(2, 9);
        const el = document.createElement('div');
        el.id = divId;
        const slot = container.querySelector('.yt-slot');
        if (slot) slot.innerHTML = '';
        if (slot) slot.appendChild(el);

		ytPlayer = new window.YT.Player(divId, {
			height: '100%',
			width: '100%',
			videoId: videoId,
			playerVars: {
				playsinline: 1,
                controls: 1,
                modestbranding: 1,
                start: Math.floor(startSeconds)
			},
			events: {
				onReady: (event: any) => {
					ytReady = true;
				},
				onStateChange: (event: any) => {
					if (event.data === 1) { // PLAYING
						if (onPlay) onPlay();
						startPolling();
					} else if (event.data === 2 || event.data === 0) { // PAUSED or ENDED
                        if (event.data === 0) {
                           handlePartitionEnd();
                        } else {
    						if (onPause) onPause();
	    					stopPolling();
                        }
					}
				}
			}
		});
	}
    
    function handlePartitionEnd() {
        // Auto-advance
        if (currentPartitionIndex < partitions.length - 1) {
            loadPartition(currentPartitionIndex + 1, 0);
            // Auto-play next part
             setTimeout(() => {
                 if(playerType === 'native' && nativeVideo) nativeVideo.play();
                 if(playerType === 'youtube' && ytPlayer && ytPlayer.playVideo) ytPlayer.playVideo();
             }, 500);
        } else {
            // Really ended
            if (onPause) onPause();
            stopPolling();
        }
    }

	function startPolling() {
		stopPolling();
		timeInterval = setInterval(() => {
			if (ytPlayer && ytPlayer.getCurrentTime) {
				const time = ytPlayer.getCurrentTime();
                // Update global time
                const part = partitions[currentPartitionIndex];
                if(part) currentTime = part.globalStart + time;
                
				if (onTimeUpdate) onTimeUpdate(currentTime);
			}
		}, 100);
	}

	function stopPolling() {
		if (timeInterval) clearInterval(timeInterval);
	}

    onDestroy(() => {
        stopPolling();
        if (ytPlayer && ytPlayer.destroy) {
            try { ytPlayer.destroy(); } catch(e){}
        }
    });

	// Public API
	export const getDuration = () => {
		return totalDuration || 0;
	};

	export const getCurrentTime = () => {
		return currentTime;
	};

	export const seekTo = (time: number) => {
        // 1. Find which partition this time belongs to
        const partIdx = partitions.findIndex(p => time >= p.globalStart && time < p.globalEnd);
        const targetPartIdx = partIdx !== -1 ? partIdx : (time >= totalDuration ? partitions.length - 1 : 0);
        
        const part = partitions[targetPartIdx];
        if (!part) return;
        
        const cleanTime = Math.max(0, Math.min(time, totalDuration));
        const timeInPart = cleanTime - part.globalStart;
        
        // If switching partition
        if (targetPartIdx !== currentPartitionIndex) {
            loadPartition(targetPartIdx, timeInPart);
            // If we were playing, we should probably resume? Left to consumer or implied state.
        } else {
    		if (playerType === 'native' && nativeVideo) {
    			nativeVideo.currentTime = timeInPart;
    		} else if (playerType === 'youtube' && ytPlayer && ytPlayer.seekTo) {
    			ytPlayer.seekTo(timeInPart, true);
    		}
        }
        
        // Optimistic update
        currentTime = cleanTime;
	};
    
    // Fallback getter/setter for compatibility with code that expects the element-like interface
    export const currentTimeAccessor = {
        get value() { return getCurrentTime(); },
        set value(v: number) { seekTo(v); }
    };
    
    // Debug info exposure
    export const getDebugInfo = () => {
        if (playerType === 'native' && nativeVideo) {
            return {
                width: nativeVideo.videoWidth,
                height: nativeVideo.videoHeight,
                readyState: nativeVideo.readyState,
                type: 'native',
                partition: currentPartitionIndex + 1 + '/' + partitions.length
            }
        }
        if (playerType === 'youtube' && ytPlayer) {
             return {
                width: 0, 
                height: 0,
                readyState: ytReady ? 4 : 0,
                type: 'youtube',
                partition: currentPartitionIndex + 1 + '/' + partitions.length
            }
        }
        return {};
    }

	const activeOverlays = $derived(
		overlays.filter(o => currentTime >= o.startTime && currentTime <= (o.endTime + 2)) 
	);
</script>

<div class="w-full h-full relative bg-black" bind:this={container}>
	{#if playerType === 'native'}
		<video
			bind:this={nativeVideo}
			src={partitions[currentPartitionIndex]?.url}
			class="w-full h-full object-contain transition-transform duration-300"
            style="transform: rotate({rotation}deg);"
			controls
			onplay={onPlay}
			onpause={onPause}
			onended={handlePartitionEnd}
			ontimeupdate={(e) => {
				const timeInPart = nativeVideo?.currentTime || 0;
                const part = partitions[currentPartitionIndex];
                if(part) {
                    currentTime = part.globalStart + timeInPart;
    				if (onTimeUpdate) onTimeUpdate(currentTime);
                }
			}}
		></video>
	{:else}
		<div class="yt-slot w-full h-full"></div>
	{/if}

	<!-- Error Overlay -->
    {#if partitions[currentPartitionIndex]?.hasError}
        <div class="absolute inset-0 flex items-center justify-center bg-black/80 z-40 text-center p-4">
            <div class="text-white space-y-2">
                <p class="text-red-500 font-bold uppercase tracking-wider text-sm">Video Not Found</p>
                <p class="text-xs text-slate-400 break-all">{partitions[currentPartitionIndex].url}</p>
                <p class="text-[10px] text-slate-500 mt-2">Check console for details.</p>
            </div>
        </div>
    {/if}

	<!-- Overlays -->
	<div class="absolute top-0 right-0 p-6 flex flex-col gap-2 z-30 pointer-events-none items-end">
		{#each activeOverlays as overlay (overlay.message + overlay.startTime)}
			<div class="max-w-sm bg-black/80 backdrop-blur-md border-l-4 p-4 rounded shadow-2xl animate-in slide-in-from-right-10 fade-in duration-500
				{overlay.type === 'coasting' ? 'border-yellow-500 shadow-yellow-900/20' : 
				 overlay.type === 'braking' ? 'border-red-500 shadow-red-900/20' :
				 overlay.type === 'throttle' ? 'border-orange-500 shadow-orange-900/20' :
				 overlay.type === 'steering' ? 'border-blue-500 shadow-blue-900/20' : 'border-white'}">
				<div class="flex items-start gap-3">
					<div class="flex-1">
						<h4 class="text-white text-xs font-black uppercase tracking-widest mb-1 opacity-70">
							{overlay.type}
						</h4>
						<p class="text-white font-medium text-sm leading-relaxed text-balance">
							{overlay.message}
						</p>
					</div>
				</div>
			</div>
		{/each}
	</div>
</div>

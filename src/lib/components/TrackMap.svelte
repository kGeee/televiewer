<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { Flag, Circle, X } from 'lucide-svelte';
	import { theme } from '$lib/stores/theme';
	import {
		getTrackBearingAtIndex,
		findClosestTrackPoint,
		offsetPoint,
		type TrackConfig,
		type TrackLine
	} from '$lib/analysis/geo';
	import { browser } from '$app/environment';

	let {
		data,
		currentTime = 0,
		width: propWidth = undefined,
		height: propHeight = undefined,
		editable = false,
		trackConfig = $bindable(null),
		onConfigChange = null
	} = $props();

	let mapElement: HTMLDivElement;
	let map: any;
	let L: any;
	let polyline: any;
	let arrowsLayer: any;
	let positionMarker: any;
	let layers: Record<string, any> = {};

	let placingLine = $state<'finish' | 'sector1' | 'sector2' | null>(null);
	let hoverMarker: any;

	let mirrorMap = $state(false);
	let flipArrows = $state(false);

	// Dynamic Leaflet Import
	onMount(async () => {
		if (browser) {
			const leaflet = await import('leaflet');
			L = leaflet.default;

			// Fix Icons
			delete (L.Icon.Default.prototype as any)._getIconUrl;
			L.Icon.Default.mergeOptions({
				iconRetinaUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png',
				iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
				shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png'
			});

			initMap();
		}
	});

	onDestroy(() => {
		if (map) map.remove();
	});

	function initMap() {
		if (!data || !data.lat || data.lat.length === 0) return;

		// Calculate center roughly
		const midIdx = Math.floor(data.lat.length / 2);
		const centerLat = data.lat[midIdx];
		let centerLng = data.long[midIdx];
		console.log('Detected Center Lng:', centerLng);

		// Heuristic: If Longitude is positive, it indicates East. 
		// But if the user expects it to be West (negative), it's likely an import issue.
		// For now, if > 0, we flip to negative based on user request.
		if (centerLng > 0) {
			console.warn('Auto-correcting inverted longitude (Positive -> Negative)');
			for (let i = 0; i < data.long.length; i++) {
				data.long[i] = -Math.abs(data.long[i]);
			}
			centerLng = -Math.abs(centerLng);
		}

		map = L.map(mapElement, {
			center: [centerLat, centerLng],
			zoom: 16,
			zoomControl: false, // We'll add custom or use default position but ensure it fits UI
			attributionControl: false
		});

		L.control.attribution({ prefix: false }).addTo(map);

		// Satellite Layer
		L.tileLayer(
			'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
			{
				attribution: 'Tiles &copy; Esri',
				maxZoom: 19
			}
		).addTo(map);

		updateTrackPath();
		updateConfigLayers();

		// Listeners for Editing
		map.on('click', handleMapClick);
		map.on('mousemove', handleMouseMove);
		map.on('contextmenu', handleRightClick);
	}

	$effect(() => {
		if (map && data) {
			updateTrackPath();
		}
	});

	$effect(() => {
		if (map && trackConfig) {
			updateConfigLayers();
		}
	});

	// Sync Current Time Marker
	$effect(() => {
		if (!map || !data || !data.time) return;

		// Find index
		let idx = -1;
		// Optimization: binary search or assumes sorted? data.time is usually sorted.
		// Simple linear scan for now as typical requestAnimationFrame handles this fine for < 100k points
		// actually for large sets, this needs to be fast.
		// Let's assume monotonic.
		// Find first time >= currentTime
		// If currentTime is close to last found index, search from there?
		// For simplicity:
		idx = data.time.findIndex((t: number) => t >= currentTime);

		if (idx !== -1 && data.lat[idx] && data.long[idx]) {
			const lat = data.lat[idx];
			const lng = data.long[idx];

			if (!positionMarker) {
				positionMarker = L.circleMarker([lat, lng], {
					radius: 6,
					fillColor: '#f97316',
					color: 'white',
					weight: 2,
					opacity: 1,
					fillOpacity: 1
				}).addTo(map);
			} else {
				positionMarker.setLatLng([lat, lng]);
			}
		}
	});

	function updateTrackPath() {
		if (!map || !data || !data.lat) return;

		// Path
		const latlngs = data.lat
			.map((lat: number, i: number) => [lat, data.long[i]])
			.filter((p: number[]) => p[0] && p[1]);

		if (polyline) map.removeLayer(polyline);
		polyline = L.polyline(latlngs, { color: '#fbbf24', weight: 4 }).addTo(map);

		if (latlngs.length > 0) {
			map.fitBounds(polyline.getBounds(), { padding: [20, 20] });
		}

		// Arrows
		updateArrows();
	}

	function updateArrows() {
		if (!map || !data || !data.lat) return;
		if (arrowsLayer) map.removeLayer(arrowsLayer);

		arrowsLayer = L.layerGroup().addTo(map);

		// Add arrows every N points
		const step = Math.max(1, Math.floor(data.lat.length / 20));

		for (let i = 0; i < data.lat.length; i += step) {
			// Check bounds? Leaflet handles culling usually.
			const lat = data.lat[i];
			const lng = data.long[i];
			if (!lat || !lng) continue;

			const bearing = getTrackBearingAtIndex(data.lat, data.long, i);
			const rotation = flipArrows ? (bearing + 180) % 360 : bearing;

			// Custom Arrow Icon using DivIcon + SVG transform
			const arrowIcon = L.divIcon({
				className: 'arrow-icon',
				html: `<div style="transform: rotate(${rotation}deg); color: rgba(255,255,255,0.7);">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                            <line x1="12" y1="19" x2="12" y2="5"></line>
                            <polyline points="5 12 12 5 19 12"></polyline>
                        </svg>
                       </div>`,
				iconSize: [20, 20],
				iconAnchor: [10, 10]
			});

			L.marker([lat, lng], { icon: arrowIcon, interactive: false }).addTo(arrowsLayer);
		}
	}

	$effect(() => {
		if (map && arrowsLayer) {
			updateArrows();
		}
	});

	function updateConfigLayers() {
		if (!map) return;
		['finish', 's1', 's2'].forEach((k) => {
			if (layers[k]) map.removeLayer(layers[k]);
		});

		if (trackConfig?.finishLine)
			layers['finish'] = drawTrackLine(trackConfig.finishLine, '#22c55e');
		if (trackConfig?.sector1) layers['s1'] = drawTrackLine(trackConfig.sector1, '#ef4444');
		if (trackConfig?.sector2) layers['s2'] = drawTrackLine(trackConfig.sector2, '#3b82f6');
	}

	function drawTrackLine(line: TrackLine, color: string) {
		const perpBearing1 = (line.bearing + 90) % 360;
		const perpBearing2 = (line.bearing + 270) % 360;
		const widthMeters = 30; // 30m wide

		const p1 = offsetPoint(line.lat, line.lng, perpBearing1, widthMeters / 2);
		const p2 = offsetPoint(line.lat, line.lng, perpBearing2, widthMeters / 2);

		const group = L.layerGroup().addTo(map);

		L.polyline(
			[
				[p1.lat, p1.lng],
				[p2.lat, p2.lng]
			],
			{
				color: color,
				weight: 4,
				opacity: 1
			}
		).addTo(group);

		// Dashed white overlay
		L.polyline(
			[
				[p1.lat, p1.lng],
				[p2.lat, p2.lng]
			],
			{
				color: 'white',
				weight: 2,
				dashArray: '4, 6',
				opacity: 0.8
			}
		).addTo(group);

		return group;
	}

	// Interaction Handlers
	let lastMoveTime = 0;

	function handleMouseMove(e: any) {
		if (!editable || !data?.lat) return;

		const now = performance.now();
		if (now - lastMoveTime < 30) return; // Throttle to ~30fps
		lastMoveTime = now;

		const { lat, lng } = e.latlng;
		// Optimization: Find closest point mostly works, but if data is huge, this might lag on mousemove?
		// 100hz mousemove on 10k points -> 1M operations per second. JS can handle it usually.
		const closest = findClosestTrackPoint(data.lat, data.long, lat, lng);

		if (closest.distance < 100) {
			// 100m snap within
			const snappedLatLng: [number, number] = [data.lat[closest.idx], data.long[closest.idx]];

			if (!hoverMarker) {
				hoverMarker = L.circleMarker(snappedLatLng, {
					radius: 6,
					fillColor:
						placingLine === 'finish'
							? '#22c55e'
							: placingLine === 'sector1'
								? '#ef4444'
								: '#3b82f6',
					color: 'white',
					weight: 2,
					opacity: 1,
					fillOpacity: 0.8
				}).addTo(map);
			} else {
				hoverMarker.setLatLng(snappedLatLng);
				hoverMarker.setStyle({
					fillColor:
						placingLine === 'finish' ? '#22c55e' : placingLine === 'sector1' ? '#ef4444' : '#3b82f6'
				});
				if (!map.hasLayer(hoverMarker)) hoverMarker.addTo(map);
			}
		} else {
			if (hoverMarker) map.removeLayer(hoverMarker);
		}
	}

	function handleMapClick(e: any) {
		if (!editable || !placingLine || !data?.lat) return;

		const { lat, lng } = e.latlng;
		const closest = findClosestTrackPoint(data.lat, data.long, lat, lng);
		if (closest.distance > 100) return; // Must be close to track

		const idx = closest.idx;
		const bearing = getTrackBearingAtIndex(data.lat, data.long, idx);

		const newLine: TrackLine = {
			lat: data.lat[idx],
			lng: data.long[idx],
			bearing
		};

		const newConfig = { ...(trackConfig || { finishLine: null, sector1: null, sector2: null }) };

		if (placingLine === 'finish') {
			newConfig.finishLine = newLine;
			placingLine = 'sector1';
		} else if (placingLine === 'sector1') {
			newConfig.sector1 = newLine;
			placingLine = 'sector2';
		} else if (placingLine === 'sector2') {
			newConfig.sector2 = newLine;
			placingLine = null;
		}

		trackConfig = newConfig;
		onConfigChange?.(newConfig);
	}

	function handleRightClick(e: any) {
		if (!editable) return;
		placingLine = 'finish';
		handleMapClick(e);
	}

	// Controls
	function clearLine(lineType: 'finish' | 'sector1' | 'sector2') {
		const newConfig = { ...(trackConfig || { finishLine: null, sector1: null, sector2: null }) };
		newConfig[lineType === 'finish' ? 'finishLine' : lineType] = null;
		// Cascade clear if needed?
		if (lineType === 'finish') {
			newConfig.sector1 = null;
			newConfig.sector2 = null;
			placingLine = 'finish';
		} else if (lineType === 'sector1') {
			newConfig.sector2 = null;
			placingLine = 'sector1';
		} else {
			placingLine = 'sector2';
		}

		trackConfig = newConfig;
		onConfigChange?.(newConfig);
	}

	// Effect to set placing mode
	$effect(() => {
		if (editable) {
			if (!trackConfig?.finishLine) placingLine = 'finish';
			else if (!trackConfig?.sector1) placingLine = 'sector1';
			else if (!trackConfig?.sector2) placingLine = 'sector2';
			else placingLine = null;
		} else {
			placingLine = null;
		}
	});
</script>

<svelte:head>
	<link
		rel="stylesheet"
		href="https://unpkg.com/leaflet@1.7.1/dist/leaflet.css"
		integrity="sha512-xodZBNTC5n17Xt2atTPuE1HxjVMSvLVW9ocqUKLsCC5CXdbqCmblAshOMAS6/keqq/sMZMZ19scR4PsZChSR7A=="
		crossorigin=""
	/>
</svelte:head>

<div
	class="relative flex flex-col group min-h-0"
	style:width={propWidth ? propWidth + 'px' : '100%'}
	style:height={propHeight ? propHeight + 'px' : '100%'}
>
	<!-- Map Container -->
	<div
		bind:this={mapElement}
		class="flex-1 min-h-0 w-full h-full z-0 transition-transform duration-300 bg-slate-100 dark:bg-slate-900"
		style="transform: scaleX({mirrorMap ? -1 : 1});"
	></div>

	<!-- Edit Controls Overlay (Bottom) -->
	{#if editable}
		<div
			class="absolute bottom-0 left-0 right-0 z-[500] flex flex-wrap items-center gap-2 text-xs p-2 bg-slate-100/90 dark:bg-slate-800/90 backdrop-blur border-t border-slate-200 dark:border-slate-700"
		>
			<button
				class="px-3 py-1.5 bg-slate-200 dark:bg-slate-700 rounded hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 font-medium transition-colors"
				onclick={() => (mirrorMap = !mirrorMap)}
			>
				{mirrorMap ? '↔ Unflip Map' : '↔ Flip Map'}
			</button>
			<button
				class="px-3 py-1.5 bg-slate-200 dark:bg-slate-700 rounded hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 font-medium transition-colors"
				onclick={() => (flipArrows = !flipArrows)}
			>
				{flipArrows ? '↑ Reset Arrows' : '↓ Flip Arrows'}
			</button>

			<span class="text-slate-400 dark:text-slate-500 mx-1">|</span>

			{#if placingLine === 'finish'}
				<div
					class="flex items-center gap-1 px-2 py-1 rounded bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400"
				>
					<Flag class="w-3 h-3" />
					Place Start/Finish
				</div>
			{:else if trackConfig?.finishLine}
				<button
					onclick={() => clearLine('finish')}
					class="flex items-center gap-1 px-2 py-1 rounded bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-200 dark:hover:bg-emerald-900/50"
				>
					<Flag class="w-3 h-3" />
					Finish Set
					<X class="w-3 h-3" />
				</button>
			{/if}

			{#if placingLine === 'sector1'}
				<button
					onclick={() => {
						placingLine = 'sector2';
					}}
					class="px-2 py-1 rounded bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-300"
				>
					Skip S1
				</button>
			{:else if trackConfig?.sector1}
				<button
					onclick={() => clearLine('sector1')}
					class="flex items-center gap-1 px-2 py-1 rounded bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50"
				>
					S1 Set
					<X class="w-3 h-3" />
				</button>
			{/if}

			{#if placingLine === 'sector2'}
				<button
					onclick={() => {
						placingLine = null;
					}}
					class="px-2 py-1 rounded bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-300"
				>
					Skip S2
				</button>
			{:else if trackConfig?.sector2}
				<button
					onclick={() => clearLine('sector2')}
					class="flex items-center gap-1 px-2 py-1 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 hover:bg-blue-200 dark:hover:bg-blue-900/50"
				>
					S2 Set
					<X class="w-3 h-3" />
				</button>
			{/if}
		</div>
	{/if}

	<!-- View Controls (Bottom-Right) if NOT editable -->
	{#if !editable}
		<div class="absolute bottom-2 right-2 z-[400] flex gap-2">
			<button
				class="p-1.5 bg-white/50 dark:bg-black/50 rounded hover:bg-white dark:hover:bg-black text-slate-700 dark:text-slate-200 transition-colors backdrop-blur"
				onclick={(e) => {
					e.stopPropagation();
					mirrorMap = !mirrorMap;
				}}
				title="Flip Map"
			>
				<div class="text-[10px] font-bold">↔</div>
			</button>
		</div>
	{/if}
</div>

<style>
	/* Leaflet Overrides */
	:global(.leaflet-control-container .leaflet-top, .leaflet-control-container .leaflet-bottom) {
		z-index: 400; /* Ensure below custom overlays */
	}
</style>

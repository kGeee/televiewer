<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    import { browser } from '$app/environment';
    import { findClosestTrackPoint, getTrackBearingAtIndex, type TrackConfig, type TrackLine, offsetPoint } from '$lib/analysis/geo';

    let { data, trackConfig = $bindable(null), onConfigChange } = $props<{
        data: { lat: number[], long: number[] };
        trackConfig: TrackConfig | null;
        onConfigChange?: (config: TrackConfig) => void;
    }>();

    let mapElement: HTMLDivElement;
    let map: any; // Leaflet Map
    let polyline: any;
    let finishLineLayer: any;
    let s1LineLayer: any;
    let s2LineLayer: any;
    let L: any;

    let placingLine = $state<'finish' | 'sector1' | 'sector2' | null>(null);
    let hoverMarker: any;

    onMount(async () => {
        if (browser) {
            const leaflet = await import('leaflet');
            L = leaflet.default;
            
            // Fix Leaflet's default icon path issues in some bundlers
            delete (L.Icon.Default.prototype as any)._getIconUrl;
            L.Icon.Default.mergeOptions({
                iconRetinaUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png',
                iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
                shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
            });

            initMap();
        }
    });

    onDestroy(() => {
        if (map) {
            map.remove();
            map = null;
        }
    });

    function initMap() {
        if (!data || !data.lat || data.lat.length === 0) return;

        // 1. Robust Data Filtering
        // First, filter out obvious garbage (0,0) and NaNs
        let validPoints = [];
        for(let i=0; i<data.lat.length; i++) {
            const lat = data.lat[i];
            const lng = data.long[i];
            if (lat && lng && (Math.abs(lat) > 0.001 || Math.abs(lng) > 0.001)) {
                validPoints.push({ lat, lng, i }); // Keep index for later
            }
        }

        if (validPoints.length === 0) return;

        // Second, remove outliers using median (in case we have points in two different countries)
        // Sort by lat and lng to find median roughly
        const sortedLats = [...validPoints].sort((a, b) => a.lat - b.lat);
        const sortedLngs = [...validPoints].sort((a, b) => a.lng - b.lng);
        const mid = Math.floor(validPoints.length / 2);
        const medianLat = sortedLats[mid].lat;
        const medianLng = sortedLngs[mid].lng;

        // Filter points within a reasonable degree range of median (e.g., 0.1 degree ~ 11km)
        // This keeps the main track and removes simple glitch points across the world
        const threshold = 0.1; 
        let goodPoints = validPoints.filter(p => 
            Math.abs(p.lat - medianLat) < threshold && 
            Math.abs(p.lng - medianLng) < threshold
        );

        // Fallback: If filtering removed everything (e.g. valid large track?), use all valid points
        if (goodPoints.length === 0) goodPoints = validPoints;

        // Start center
        const startCoords = [medianLat, medianLng];
        
        // Initialize Map
        map = L.map(mapElement).setView(startCoords, 16);

        // Satellite Layer (Esri World Imagery)
        L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
            attribution: 'Tiles &copy; Esri',
            maxZoom: 19
        }).addTo(map);

        // Draw Track Path
        const polylinePoints = goodPoints.map(p => [p.lat, p.lng]);
        polyline = L.polyline(polylinePoints, { color: '#fbbf24', weight: 4, opacity: 0.9 }).addTo(map);
        
        // Fit bounds
        if (polylinePoints.length > 0) {
             map.fitBounds(polyline.getBounds(), { padding: [50, 50], maxZoom: 18 });
        }

        // Event Listeners
        map.on('click', handleMapClick);
        map.on('mousemove', handleMouseMove);
        map.on('mouseout', () => {
             if (hoverMarker) map.removeLayer(hoverMarker);
        });

        // Initial Render of Config
        updateConfigLayers();
    }
    
    function handleMouseMove(e: any) {
        if (!placingLine || !data.lat) return;

        const { lat, lng } = e.latlng;
        // Optimization: Find closest point mostly works, but if data is huge, this might lag on mousemove?
        // 100hz mousemove on 10k points -> 1M operations per second. JS can handle it usually.
        const closest = findClosestTrackPoint(data.lat, data.long, lat, lng);
        
        if (closest.distance < 100) { // 100m snap within
             const snappedLatLng = [data.lat[closest.idx], data.long[closest.idx]];
             
             if (!hoverMarker) {
                 hoverMarker = L.circleMarker(snappedLatLng, {
                     radius: 6,
                     fillColor: placingLine === 'finish' ? '#22c55e' : placingLine === 'sector1' ? '#ef4444' : '#3b82f6',
                     color: 'white',
                     weight: 2,
                     opacity: 1,
                     fillOpacity: 0.8
                 }).addTo(map);
             } else {
                 hoverMarker.setLatLng(snappedLatLng);
                 hoverMarker.setStyle({ 
                    fillColor: placingLine === 'finish' ? '#22c55e' : placingLine === 'sector1' ? '#ef4444' : '#3b82f6' 
                 });
                 if (!map.hasLayer(hoverMarker)) hoverMarker.addTo(map);
             }
        } else {
            if (hoverMarker) map.removeLayer(hoverMarker);
        }
    }

    $effect(() => {
        if (map && trackConfig) {
            updateConfigLayers();
        }
    });

    function updateConfigLayers() {
        if (!map || !L) return;

        if (finishLineLayer) map.removeLayer(finishLineLayer);
        if (s1LineLayer) map.removeLayer(s1LineLayer);
        if (s2LineLayer) map.removeLayer(s2LineLayer);

        if (trackConfig?.finishLine) finishLineLayer = drawLine(trackConfig.finishLine, '#22c55e');
        if (trackConfig?.sector1) s1LineLayer = drawLine(trackConfig.sector1, '#ef4444');
        if (trackConfig?.sector2) s2LineLayer = drawLine(trackConfig.sector2, '#3b82f6');
    }

    function drawLine(line: TrackLine, color: string) {
        const perpBearing1 = (line.bearing + 90) % 360;
        const perpBearing2 = (line.bearing + 270) % 360;
        // 30m wide line visual
        const p1 = offsetPoint(line.lat, line.lng, perpBearing1, 30);
        const p2 = offsetPoint(line.lat, line.lng, perpBearing2, 30);

        return L.polyline([
            [p1.lat, p1.lng],
            [p2.lat, p2.lng]
        ], { color: color, weight: 6 }).addTo(map);
    }

    function handleMapClick(e: any) {
        if (!placingLine) return; // Only allow placement if mode is active (or maybe we allow click to edit if we add UI)
        // User wants functionality "as before" which probably means clicking anywhere to set start/finish?
        // Let's assume the container UI controls `placingLine`.

        const { lat, lng } = e.latlng;
        
        // Find closest point on track
        const closest = findClosestTrackPoint(data.lat, data.long, lat, lng);
        const idx = closest.idx;
        const bearing = getTrackBearingAtIndex(data.lat, data.long, idx);

        const newLine: TrackLine = {
            lat: data.lat[idx],
            lng: data.long[idx],
            bearing
        };

        const newConfig = { ...trackConfig } || { finishLine: null, sector1: null, sector2: null };

        if (placingLine === 'finish') {
            newConfig.finishLine = newLine;
            placingLine = 'sector1'; // Auto-advance?
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

    // Expose placing Logic
    export function setPlacingMode(mode: 'finish' | 'sector1' | 'sector2' | null) {
        placingLine = mode;
    }

</script>

<svelte:head>
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.7.1/dist/leaflet.css" 
          integrity="sha512-xodZBNTC5n17Xt2atTPuE1HxjVMSvLVW9ocqUKLsCC5CXdbqCmblAshOMAS6/keqq/sMZMZ19scR4PsZChSR7A==" 
          crossorigin=""/>
</svelte:head>

<div class="relative w-full h-full">
    <div bind:this={mapElement} class="w-full h-full z-0"></div>
    
    <!-- Overlay Controls -->
    <div class="absolute top-4 right-4 z-[500] flex flex-col gap-2">
         <!-- Mode Toggles matching TrackMap UI style -->
         <div class="bg-white/90 dark:bg-slate-900/90 backdrop-blur p-2 rounded shadow border border-slate-200 dark:border-slate-700 flex flex-col gap-2">
            <div class="text-xs font-bold text-slate-500 uppercase">Configuration</div>
            
            <button 
                class="px-3 py-1.5 rounded text-xs font-semibold flex items-center justify-between gap-2 border {placingLine === 'finish' ? 'bg-emerald-100 border-emerald-500 text-emerald-700' : 'bg-slate-100 border-slate-200 text-slate-600 hover:bg-slate-200'}"
                onclick={() => placingLine = 'finish'}
            >
                Start/Finish {trackConfig?.finishLine ? '(Set)' : ''}
            </button>

             <button 
                class="px-3 py-1.5 rounded text-xs font-semibold flex items-center justify-between gap-2 border {placingLine === 'sector1' ? 'bg-red-100 border-red-500 text-red-700' : 'bg-slate-100 border-slate-200 text-slate-600 hover:bg-slate-200'}"
                onclick={() => placingLine = 'sector1'}
            >
                Sector 1 {trackConfig?.sector1 ? '(Set)' : ''}
            </button>

             <button 
                class="px-3 py-1.5 rounded text-xs font-semibold flex items-center justify-between gap-2 border {placingLine === 'sector2' ? 'bg-blue-100 border-blue-500 text-blue-700' : 'bg-slate-100 border-slate-200 text-slate-600 hover:bg-slate-200'}"
                onclick={() => placingLine = 'sector2'}
            >
                Sector 2 {trackConfig?.sector2 ? '(Set)' : ''}
            </button>

            {#if placingLine}
                <div class="mt-2 text-[10px] text-slate-500 bg-yellow-50 p-1 rounded border border-yellow-200 text-center">
                    Click map to place {placingLine} line
                </div>
            {/if}
         </div>
    </div>
</div>

<script lang="ts">
	import { onMount } from 'svelte';
	import { theme } from '$lib/stores/theme';

	// Clean, reusable props
	// config: Array of lanes. Each lane has { id, title, channels: [{ variable, color, label }], heightWeight }
	// cursorTime: Optional time position to show a vertical cursor line (syncs with video)
	// cursorXValue: Optional x-axis value (distance or time) for precise cursor line positioning
	// onClick: Optional callback when chart is clicked (returns time)
	let { data, referenceData, config = [], analysisEvents = [], onHover, cursorTime = null, cursorXValue = null, onClick } = $props<{
		data: any;
		referenceData?: any;
		config?: any[];
		analysisEvents?: any[];
		onHover?: (time: number, xValue: number) => void;
		cursorTime?: number | null;
		cursorXValue?: number | null;
		onClick?: (time: number) => void;
	}>();

	// Theme-aware colors
	const getColors = (isDark: boolean) => ({
		grid: isDark ? '#1e293b' : '#e2e8f0',
		ticks: isDark ? '#94a3b8' : '#64748b',
		border: isDark ? '#475569' : '#cbd5e1',
		title: isDark ? '#94a3b8' : '#64748b',
		tooltipBg: isDark ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.95)'
	});

	let container = $state<HTMLDivElement>();
	let chart: any;
	let Chart = $state<any>(null);

	// Tooltip State (Component Level)
	let hoveredTip: any | null = $state(null);
	let tooltipPos = $state({ x: 0, y: 0 });

	onMount(async () => {
		const chartJs = await import('chart.js');
		const zoomPlugin = (await import('chartjs-plugin-zoom')).default;

		Chart = chartJs.Chart;
		Chart.register(...chartJs.registerables, zoomPlugin);

		// Cleanup on unmount
		return () => {
			if (chart) {
				chart.destroy();
				chart = null;
			}
		};
	});

	// Decimation helper for performance with large datasets
	function decimateData(data: number[], maxPoints: number = 2000): number[] {
		if (!data || data.length <= maxPoints) return data;
		const step = Math.ceil(data.length / maxPoints);
		const result = [];
		for (let i = 0; i < data.length; i += step) {
			result.push(data[i]);
		}
		return result;
	}

	// Effect to update chart when data or config changes
	$effect(() => {
		// Explicitly declare dependencies (cursorTime triggers redraw for cursor line via separate effect)
		const _deps = [data, config, analysisEvents, $theme];
		const colors = getColors($theme === 'dark');

		if (!container || !data || !Chart || !config.length) return;

		// PERFORMANCE: Only destroy if config structure changed, otherwise update data
		const configChanged =
			chart &&
			JSON.stringify(config.map((c) => c.id)) !== JSON.stringify(chart._customConfigIds || []);

		if (chart && (configChanged || !chart._customConfigIds)) {
			chart.destroy();
			chart = null;
		}

		// Data prep
		let xValues: number[] = [];
		let xLabel = 'Time (s)';

		// Align X axes if possible
		if (
			data.distance &&
			data.distance.length > 0 &&
			data.speed &&
			data.distance.length === data.speed.length
		) {
			const startDist = data.distance[0];
			xValues = data.distance.map((d: number) => d - startDist);
			xLabel = 'Distance (m)';
		} else {
			xValues = data.time || [];
		}

		const toPoints = (yData: number[], sourceData: any, shouldDecimate: boolean = true) => {
			if (!yData) return [];
			let localX = xValues;
			if (sourceData !== data && sourceData) {
				if (sourceData.distance && sourceData.distance.length > 0) {
					const start = sourceData.distance[0];
					localX = sourceData.distance.map((d: number) => d - start);
				} else if (sourceData.time) {
					localX = sourceData.time;
				}
			}
			if (!localX) return [];

			// PERFORMANCE: Decimate large datasets for rendering
			if (shouldDecimate && yData.length > 2000) {
				const step = Math.ceil(yData.length / 2000);
				const decimatedPoints = [];
				for (let i = 0; i < yData.length; i += step) {
					decimatedPoints.push({ x: localX[i] || 0, y: yData[i] });
				}
				return decimatedPoints;
			}

			return yData.map((y, i) => ({ x: localX[i] || 0, y }));
		};

		// Helper to find X coordinate for a given time
		const getXForTime = (time: number) => {
			if (!data.time) return time; // Fallback
			// Binary search or find
			// Since data.time is sorted
			let idx = -1;
			// Simple approximate search
			for (let i = 0; i < data.time.length; i++) {
				if (data.time[i] >= time) {
					idx = i;
					break;
				}
			}
			if (idx === -1) idx = data.time.length - 1;
			return xValues[idx];
		};

		// Custom Plugin for Analysis Highlights
		const analysisPlugin = {
			id: 'analysisOverlay',
			beforeDatasetsDraw(chart: any) {
				if (!analysisEvents || analysisEvents.length === 0) return;

				const { ctx, chartArea, scales } = chart;
				const xScale = scales.x;

				ctx.save();

				analysisEvents.forEach((event: any) => {
					const startVal = getXForTime(event.startTime);
					const endVal = getXForTime(event.endTime);

					// Skip if out of bounds (optimization)
					if (endVal < xScale.min || startVal > xScale.max) return;

					const startX = xScale.getPixelForValue(startVal);
					const endX = xScale.getPixelForValue(endVal);
					const width = endX - startX;

					// Ensure visible even if short
					const drawWidth = Math.max(width, 2);

					let color = 'rgba(59, 130, 246, 0.15)'; // Blue (Low)
					let borderColor = 'rgba(59, 130, 246, 0.5)';

					if (event.severity === 'high') {
						color = 'rgba(239, 68, 68, 0.15)'; // Red
						borderColor = 'rgba(239, 68, 68, 0.5)';
					} else if (event.severity === 'medium') {
						color = 'rgba(249, 115, 22, 0.15)'; // Orange
						borderColor = 'rgba(249, 115, 22, 0.5)';
					}

					// Draw Height spans full chart area
					ctx.fillStyle = color;
					ctx.fillRect(startX, chartArea.top, drawWidth, chartArea.height);

					// Draw Top Borders
					ctx.fillStyle = borderColor;
					ctx.fillRect(startX, chartArea.top, drawWidth, 4); // Top bar
				});

				ctx.restore();
			},
			afterEvent(chart: any, args: any) {
				const { event } = args;
				// Only process mouse movements
				if (event.type !== 'mousemove' && event.type !== 'mouseout') return;

				if (event.type === 'mouseout') {
					hoveredTip = null;
					args.changed = true;
					return;
				}

				const { scales, chartArea } = chart;
				const xScale = scales.x;

				// Check bounds
				if (
					event.x < chartArea.left ||
					event.x > chartArea.right ||
					event.y < chartArea.top ||
					event.y > chartArea.bottom
				) {
					if (hoveredTip) {
						hoveredTip = null;
						args.changed = true;
					}
					return;
				}

				const xVal = xScale.getValueForPixel(event.x);

				// Find matching event
				// Note: event.startTime/endTime are in Time. xVal is in X-Axis units (Time or Dist).
				// We need to compare xVal to getXForTime(startTime).
				// Assuming xValues are sorted ascending.

				const found = analysisEvents.find((e: any) => {
					const s = getXForTime(e.startTime);
					const end = getXForTime(e.endTime);
					// Handle case where s > end (if distance decreases? unlikely)
					const min = Math.min(s, end);
					const max = Math.max(s, end);
					return xVal >= min && xVal <= max;
				});

				if (found !== hoveredTip) {
					hoveredTip = found || null;
					tooltipPos = { x: event.x, y: event.y };
					args.changed = true; // Trigger re-render to ensure sync (though we use overlay DOM)
				} else if (found) {
					// Update pos if moving within same event
					tooltipPos = { x: event.x, y: event.y };
					// args.changed = true; // Not strictly needed for DOM tooltip unless we want to force something
				}

				// Sync External
				if (onHover) {
					// xVal is the X-Axis value (Time or Distance)
					// If using Distance, we might need to map back to Time for other components?
					// BUT TrackMap relies on TIME generally if referencing Time Array.

					let time = xVal;
					if (xLabel === 'Distance (m)' && data.distance && data.time) {
						// Find index of distance closest to xVal
						// Binary search or approx
						let distIdx = -1;
						for (let k = 0; k < data.distance.length; k++) {
							// data.distance is expected to be ascending
							if (data.distance[k] >= xVal) {
								distIdx = k;
								break;
							}
						}
						// data.distance stores raw distance, xVal is relative to startDist (since we subtracted startDist)
						// Oh wait, `xValues` prep subtracted startDist.
						// xVal is (dist - startDist).
						// So we need to find data.distance[k] >= xVal + startDist.
						const startDist = data.distance[0];
						const targetDist = xVal + startDist;

						distIdx = -1;
						for (let k = 0; k < data.distance.length; k++) {
							if (data.distance[k] >= targetDist) {
								distIdx = k;
								break;
							}
						}

						if (distIdx !== -1) time = data.time[distIdx];
					}

					onHover(time, xVal);
				}
			},
		};

		// Custom Plugin for Cursor Line (syncs with video)
		const cursorLinePlugin = {
			id: 'cursorLine',
			afterDatasetsDraw(chart: any) {
				if (cursorTime === null || cursorTime === undefined) return;

				const { ctx, chartArea, scales } = chart;
				const xScale = scales.x;
				
				// Use cursorXValue directly for precise alignment when available
				// Fall back to getXForTime when syncing with video (no cursorXValue)
				const cursorX = cursorXValue !== null ? cursorXValue : getXForTime(cursorTime);
				
				// Check if in bounds
				if (cursorX < xScale.min || cursorX > xScale.max) return;
				
				const pixelX = xScale.getPixelForValue(cursorX);
				
				ctx.save();
				ctx.beginPath();
				ctx.moveTo(pixelX, chartArea.top);
				ctx.lineTo(pixelX, chartArea.bottom);
				ctx.lineWidth = 2;
				ctx.strokeStyle = 'rgba(239, 68, 68, 0.8)'; // Red cursor line
				ctx.stroke();
				
				// Draw small triangle at top
				ctx.beginPath();
				ctx.moveTo(pixelX - 6, chartArea.top);
				ctx.lineTo(pixelX + 6, chartArea.top);
				ctx.lineTo(pixelX, chartArea.top + 8);
				ctx.closePath();
				ctx.fillStyle = 'rgba(239, 68, 68, 0.8)';
				ctx.fill();
				
				ctx.restore();
			}
		};

		// Build Datasets and Scales from Config
		const datasets: any[] = [];
		const scales: any = {
			x: {
				type: 'linear',
				display: true,
				title: { display: true, text: xLabel, color: colors.title },
				grid: { color: colors.grid },
				ticks: { color: colors.ticks }
			}
		};

		config.forEach((lane: any, index: number) => {
			const axisId = `y_${lane.id}`;

			// Add Scale for this Lane
			scales[axisId] = {
				type: 'linear',
				position: 'left',
				stack: 'main',
				stackWeight: lane.heightWeight || 1,
				offset: true,
				title: { display: true, text: lane.title, color: lane.titleColor || colors.title },
				grid: { color: colors.grid },
				ticks: { color: colors.ticks },
				border: { color: colors.border },
				min: lane.min,
				max: lane.max
			};

			// Add Channels for this Lane
			lane.channels.forEach((chan: any, cIdx: number) => {
				// Main Data
				const mainVarData = data[chan.variable];
				if (mainVarData) {
					// Scaling (e.g. throttle 0-1 -> 0-100)
					let plotData = mainVarData;
					if (chan.scale) {
						plotData = plotData.map((v: number) => v * chan.scale);
					} else if (chan.variable === 'throttle') {
						// Auto-detect 0-1
						if (Math.max(...mainVarData) <= 1.05)
							plotData = mainVarData.map((v: number) => v * 100);
					}

					datasets.push({
						label: chan.label || chan.variable,
						data: toPoints(plotData, data),
						borderColor: chan.color,
						borderWidth: 1.5,
						pointRadius: 0,
						pointHoverRadius: 4,
						yAxisID: axisId,
						showLine: true
					});
				}
			});
		});

		// Reference Data (Ghost Lap) overrides
		if (referenceData) {
			datasets.forEach((ds) => {
				// Basic implementation: Clone dataset structure for ref data if variable matches?
				// Actually, easier to iterate config again for Ref
			});

			config.forEach((lane: any) => {
				const axisId = `y_${lane.id}`;
				lane.channels.forEach((chan: any) => {
					const refVarData = referenceData[chan.variable];
					if (refVarData) {
						let plotData = refVarData;
						if (chan.variable === 'throttle' && Math.max(...refVarData) <= 1.05) {
							plotData = refVarData.map((v: number) => v * 100);
						}

						datasets.push({
							label: (chan.label || chan.variable) + ' (Ref)',
							data: toPoints(plotData, referenceData),
							borderColor: chan.color,
							borderWidth: 1,
							borderDash: [4, 4],
							pointRadius: 0,
							pointHoverRadius: 0,
							yAxisID: axisId,
							order: 10, // draw behind
							showLine: true
						});
					}
				});
			});
		}

		if (!chart) {
			// Create new chart only if it doesn't exist
			const canvas = container.querySelector('canvas');
			if (canvas) {
				chart = new Chart(canvas, {
					type: 'scatter',
					data: { datasets },
					plugins: [analysisPlugin, cursorLinePlugin], // Register local plugins
					options: {
						responsive: true,
						maintainAspectRatio: false,
						animation: false,
						interaction: {
							mode: 'index',
							intersect: false
						},
						onClick: (event: any, elements: any, chart: any) => {
							if (onClick) {
								const scales = chart.scales;
								const xVal = scales.x.getValueForPixel(event.x);
								
								// Convert xVal (which might be distance or time) to Time
								// Using the same logic as onHover
								let time = xVal;
								if (xLabel === 'Distance (m)' && data.distance && data.time) {
									// Simple lookup logic similar to onHover
									const startDist = data.distance[0];
									const targetDist = xVal + startDist;
									
									let distIdx = -1;
									// Binary search or simple loop
									for (let k = 0; k < data.distance.length; k++) {
										if (data.distance[k] >= targetDist) {
											distIdx = k;
											break;
										}
									}
									if (distIdx !== -1) time = data.time[distIdx];
								}
								
								onClick(time);
							}
						},
						plugins: {
							tooltip: {
								callbacks: {
									label: (context: any) => {
										let label = context.dataset.label || '';
										if (label) label += ': ';
										if (context.parsed.y !== null) label += context.parsed.y.toFixed(1);
										return label;
									}
								}
							},
							zoom: {
								zoom: {
									wheel: { enabled: true },
									pinch: { enabled: true },
									mode: 'x'
								},
								pan: {
									enabled: true,
									mode: 'x'
								}
							},
							legend: { display: false }
						},
						scales: scales
					}
				});
				// Store config IDs for comparison
				chart._customConfigIds = config.map((c) => c.id);
			}
		} else {
			// PERFORMANCE: Update existing chart data instead of recreating
			chart.data.datasets = datasets;
			chart.options.scales = scales;
			chart.update('none'); // Update without animation
		}
	});

	// Separate effect for lightweight cursor updates
	$effect(() => {
		// Only cursorTime dependency
		const _c = cursorTime;
		if (chart && chart.ctx) {
			// Just trigger a render, the plugin reads the new cursorTime prop directly
			// chart.draw() or chart.render() might not be exposed on the instance type easily in TS,
			// but chart.update('none') is still heavier than needed if we just want to redraw canvas.
			// Actually update('none') is reasonably fast if data didn't change...
			// But since we separated the effects, this runs efficiently.
			chart.draw();
		}
	});
</script>

<div
	bind:this={container}
	class="w-full h-full bg-white dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-800 p-4 relative shadow-sm dark:shadow-none"
>
	<canvas></canvas>

	<div class="absolute top-4 right-4 flex gap-2 z-10">
		<button
			class="px-2 py-1 text-xs bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded border border-slate-300 dark:border-slate-700 transition"
			onclick={() => chart?.resetZoom()}
		>
			Reset Zoom
		</button>
	</div>

	{#if hoveredTip}
		<div
			class="absolute pointer-events-none z-20 p-3 rounded shadow-xl border backdrop-blur-md max-w-xs transition-opacity duration-75 bg-white/95 dark:bg-slate-900/95"
			style="
                left: {Math.min(tooltipPos.x + 10, (container?.clientWidth || 800) - 260)}px;
                top: {Math.min(tooltipPos.y + 10, (container?.clientHeight || 600) - 100)}px;
                border-color: {hoveredTip.severity === 'high'
				? 'rgba(239, 68, 68, 0.5)'
				: hoveredTip.severity === 'medium'
					? 'rgba(249, 115, 22, 0.5)'
					: 'rgba(59, 130, 246, 0.5)'};
            "
		>
			<div class="flex items-center justify-between mb-1">
				<span class="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400"
					>{hoveredTip.type}</span
				>
				{#if hoveredTip.severity === 'high'}
					<span
						class="text-[10px] px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-950 text-red-600 dark:text-red-500 border border-red-200 dark:border-red-900"
						>High Priority</span
					>
				{/if}
			</div>
			<p class="text-xs text-slate-700 dark:text-slate-200 leading-relaxed">{hoveredTip.message}</p>
		</div>
	{/if}
</div>

<!-- <div
	class="mt-4 p-4 bg-slate-950 rounded border border-slate-800 font-mono text-xs overflow-auto max-h-40"
>
	<summary class="cursor-pointer text-slate-500 mb-2 font-bold hover:text-slate-300"
		>Debug Data (Check this if chart is empty)</summary
	>
	<pre class="whitespace-pre-wrap text-slate-400">
Type of Data: {typeof data}
Is Array? {Array.isArray(data)}
Keys: {data ? Object.keys(data).join(', ') : 'null'}
Speed Length: {data?.speed?.length || 0}
Distance Length: {data?.distance?.length || 0}
Sample Speed: {JSON.stringify(data?.speed?.slice(0, 5) || [])}
Sample RPM: {JSON.stringify(data?.rpm?.slice(0, 5) || [])}
Sample Throttle: {JSON.stringify(data?.throttle?.slice(0, 5) || [])}
Sample Brake: {JSON.stringify(data?.brake?.slice(0, 5) || [])}
    </pre>
</div> -->

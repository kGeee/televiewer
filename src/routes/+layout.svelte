<script lang="ts">
	import { browser } from '$app/environment';
	import favicon from '$lib/assets/favicon.svg';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';
	import { theme } from '$lib/stores/theme';
	import '../app.css';

	let { children } = $props();

	// Apply theme class to html element
	$effect(() => {
		if (browser) {
			const root = document.documentElement;
			if ($theme === 'dark') {
				root.classList.add('dark');
			} else {
				root.classList.remove('dark');
			}
		}
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<nav
	class="border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-950/80 backdrop-blur-sm sticky top-0 z-50"
>
	<div class="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
		<div class="flex items-center gap-8">
			<a
				href="/"
				class="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-orange-500 to-red-600"
			>
				Televiewer
			</a>
			<div class="hidden md:flex items-center gap-6 text-sm font-medium">
				<a
					href="/sessions"
					class="text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
					>Sessions</a
				>
				<a
					href="/drivers"
					class="text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
					>Drivers</a
				>
			</div>
		</div>
		<div class="flex items-center gap-4">
			<ThemeToggle />
		</div>
	</div>
</nav>

<main>
	{@render children()}
</main>

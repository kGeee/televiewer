<script lang="ts">
    import { Settings, Sun, Moon, Monitor } from 'lucide-svelte';
    import { themePreference, type ThemePreference } from '$lib/stores/theme';

    let open = $state(false);

    function setTheme(value: ThemePreference) {
        themePreference.set(value);
        open = false;
    }

    function handleClickOutside(event: MouseEvent) {
        const target = event.target as HTMLElement;
        if (!target.closest('.theme-dropdown')) {
            open = false;
        }
    }

    const options: { value: ThemePreference; label: string; icon: typeof Sun }[] = [
        { value: 'system', label: 'System', icon: Monitor },
        { value: 'light', label: 'Light', icon: Sun },
        { value: 'dark', label: 'Dark', icon: Moon },
    ];
</script>

<svelte:window onclick={handleClickOutside} />

<div class="theme-dropdown relative">
    <button
        onclick={() => open = !open}
        class="p-2 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
        aria-label="Settings"
    >
        <Settings class="w-5 h-5" />
    </button>

    {#if open}
        <div class="absolute right-0 mt-2 w-40 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg overflow-hidden z-50">
            <div class="px-3 py-2 text-xs font-medium text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
                Theme
            </div>
            {#each options as option}
                <button
                    onclick={() => setTheme(option.value)}
                    class="w-full flex items-center gap-3 px-3 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors
                        {$themePreference === option.value ? 'bg-slate-100 dark:bg-slate-800 text-orange-600 dark:text-orange-400' : ''}"
                >
                    <option.icon class="w-4 h-4" />
                    {option.label}
                </button>
            {/each}
        </div>
    {/if}
</div>

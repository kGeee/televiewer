import { writable, derived } from 'svelte/store';
import { browser } from '$app/environment';

export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

const STORAGE_KEY = 'theme-preference';

function getSystemTheme(): ResolvedTheme {
    if (!browser) return 'dark';
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function getInitialPreference(): ThemePreference {
    if (!browser) return 'system';
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark' || stored === 'system') {
        return stored;
    }
    return 'system';
}

export const themePreference = writable<ThemePreference>(getInitialPreference());

// Track system theme changes
const systemTheme = writable<ResolvedTheme>(getSystemTheme());

if (browser) {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    mediaQuery.addEventListener('change', (e) => {
        systemTheme.set(e.matches ? 'dark' : 'light');
    });
}

// Resolved theme based on preference
export const theme = derived(
    [themePreference, systemTheme],
    ([$preference, $system]) => {
        if ($preference === 'system') {
            return $system;
        }
        return $preference;
    }
);

// Persist preference changes
if (browser) {
    themePreference.subscribe((value) => {
        localStorage.setItem(STORAGE_KEY, value);
    });
}

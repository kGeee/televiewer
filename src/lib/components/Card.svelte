<script lang="ts">
  import type { Snippet } from 'svelte';
  
  let { title, children, class: className = '' }: { title?: string, children: Snippet, class?: string } = $props();
</script>

<div class={"bg-white dark:bg-slate-900/50 backdrop-blur-md border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm dark:shadow-none " + className}>
  {#if title}
    <h3 class="text-sm uppercase tracking-wider font-semibold text-slate-500 dark:text-slate-400 mb-4">{title}</h3>
  {/if}
  {@render children()}
</div>

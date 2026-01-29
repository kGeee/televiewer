<script lang="ts">
  import Card from '$lib/components/Card.svelte';
  import { Calendar, MapPin, Thermometer, Wind, ChevronRight, Plus } from 'lucide-svelte';

  let { data } = $props();
</script>

<div class="min-h-screen p-6 md:p-12 text-slate-700 dark:text-slate-200">
  <header class="mb-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
    <div>
      <h1 class="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-orange-500 via-red-500 to-red-600 tracking-tight">
        Session Archives
      </h1>
      <p class="text-slate-500 dark:text-slate-400 mt-1 font-light">History of track sessions and telemetry.</p>
    </div>
    <a href="/sessions/import" class="flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white font-semibold rounded-lg transition-colors shadow-lg shadow-orange-900/20">
      <Plus class="w-5 h-5" />
      New Session
    </a>
  </header>

  <div class="grid grid-cols-1 gap-4">
    {#each data.sessions as session}
      <a href="/sessions/{session.id}" class="block group">
        <Card class="hover:border-orange-500/50 transition-colors cursor-pointer group-hover:bg-slate-50 dark:group-hover:bg-slate-900/80">
          <div class="flex flex-col md:flex-row md:items-center justify-between gap-6">

            <!-- Main Info -->
            <div class="flex-1">
              <div class="flex items-center gap-3 mb-2">
                <span class="px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wider bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                  {session.name}
                </span>
                {#if session.status === 'pending'}
                  <span class="px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wider bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-500 border border-yellow-200 dark:border-yellow-800">
                    Pending
                  </span>
                {/if}
                {#if session.driverName}
                  <span class="px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wider text-white" style="background-color: {session.driverColor || '#3b82f6'}">
                     {session.driverName}
                  </span>
                {/if}
                <span class="text-xs text-slate-400 dark:text-slate-500 flex items-center gap-1">
                  <Calendar class="w-3 h-3" />
                  {new Date(session.date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                </span>
              </div>
              <h3 class="text-xl font-semibold text-slate-800 dark:text-slate-100 group-hover:text-orange-500 dark:group-hover:text-orange-400 transition-colors">
                {session.track}
              </h3>
              {#if session.notes}
                <p class="text-sm text-slate-400 dark:text-slate-500 mt-2 line-clamp-1 italic">"{session.notes}"</p>
              {/if}
            </div>

            <!-- Conditions -->
            <div class="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-8 text-sm text-slate-500 dark:text-slate-400 border-t md:border-t-0 md:border-l border-slate-200 dark:border-slate-800 pt-4 md:pt-0 md:pl-8">
              <div class="flex flex-col gap-1">
                 <span class="text-xs uppercase tracking-wider text-slate-400 dark:text-slate-600">Air</span>
                 <div class="flex items-center gap-1.5">
                    <Wind class="w-4 h-4 text-slate-400 dark:text-slate-500" />
                    <span class="font-mono">{session.airTemp}°F</span>
                 </div>
              </div>
              <div class="flex flex-col gap-1">
                 <span class="text-xs uppercase tracking-wider text-slate-400 dark:text-slate-600">Track</span>
                 <div class="flex items-center gap-1.5">
                    <Thermometer class="w-4 h-4 text-orange-500" />
                    <span class="font-mono">{session.trackTemp}°F</span>
                 </div>
              </div>
               <div class="flex flex-col gap-1">
                 <span class="text-xs uppercase tracking-wider text-slate-400 dark:text-slate-600">Cond</span>
                 <span class="font-medium text-slate-600 dark:text-slate-300">{session.condition}</span>
              </div>
               <div class="flex flex-col gap-1">
                 <span class="text-xs uppercase tracking-wider text-slate-400 dark:text-slate-600">Tires</span>
                 <span class="font-medium text-slate-600 dark:text-slate-300">{session.tireCompound}</span>
              </div>
            </div>

            <!-- Arrow -->
            <div class="hidden md:flex items-center justify-center pl-4">
                <ChevronRight class="w-6 h-6 text-slate-300 dark:text-slate-700 group-hover:text-orange-500 transition-colors" />
            </div>

          </div>
        </Card>
      </a>
    {/each}
  </div>
</div>

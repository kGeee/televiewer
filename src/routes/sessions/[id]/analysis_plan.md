
# UniversalPlayer Orientation Fix

The `video` element uses `object-contain`.
If the video is vertical, it will be contained in the horizontal box.
To fix the rotation, we need to apply CSS transform `rotate(90deg)` (or -90, 180).
But rotating a container `w-full h-full` inside another fixed container might cause overflow or sizing issues.

Best approach: Add `rotation` prop to `UniversalPlayer`.
Apply usage of `rotate` CSS class or style.
However, just rotating `video` tag inside `w-full h-full` div:
If 90deg, the width becomes height. It might clip.
We might need to adjust width/height to swap if rotated 90/270.

A simpler UI fix:
Add a "Rotate" button in the Edit UI (in `+page.svelte`), allow user to toggle 0, 90, 180, 270.
Pass this `rotation` to `UniversalPlayer`.

In `UniversalPlayer.svelte`:
```svelte
<video style="transform: rotate({rotation}deg); ...">
```
If rotated 90deg, we probably want to scale it to fit?
If `object-fit: contain` handles the content *before* transform? No, transform applies to the element box.
If we rotate the video element 90deg, it might spill out of the parent div if `w-full h-full` matches parent aspect ratio.

Actually, user said "video is also vertical and should be horizontal".
This usually means it's rotated 90 degrees visually incorrectly.
If I rotate it -90 degrees, it becomes horizontal.
But if the container is 16:9, and I rotate a tall video to be wide, it might look small or cropped depending on how I handle scaling.

Let's stick to adding a `rotation` prop and let CSS transform handle it, maybe with `scale` to fit if needed.
Or just `object-fit: contain` should work IF the rotation is applied correctly?
Actually, rotating a `video` element doesn't change its layout box dimensions in flow, but visuals rotate.
Ideally, we'd swap width/height.
But for a quick fix, `transform: rotate(...)` is the standard way.

**Telemetry Values Disappearing:**
I will proceed with the fix for `formatLapTime` and the logs.

**AI Race Engineer:**
The stuck "Analyzing..." might be due to a genuine hang or error in `analyzeLap` being swallowed or infinite re-renders resetting the state.
I'll add a check in `+page.svelte` to ensure `isAnalyzing` isn't stuck.
And I'll wrap `analyzeLap` call in `try/catch` with better logging.
Actually it is already wrapped.
```typescript
try {
    coachingTips = analyzeLap(selectedLap.telemetryData);
} catch (e) { ... }
```
If it hangs (infinite loop inside `analyzeLap`), the catch block is never reached. `isAnalyzing` stays true.

I'll review `src/lib/analysis/telemetry.ts` briefly.

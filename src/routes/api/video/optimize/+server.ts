import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { sessions } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import fs from 'fs';
import path from 'path';
// @ts-ignore
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';

// Set ffmpeg path
if (ffmpegPath) {
    ffmpeg.setFfmpegPath(ffmpegPath);
}

export const POST: RequestHandler = async ({ request }) => {
    const { sessionId } = await request.json();

    if (!sessionId) {
        throw error(400, 'Session ID required');
    }

    const session = await db.query.sessions.findFirst({
        where: eq(sessions.id, sessionId)
    });

    if (!session || !session.videoUrl) {
        throw error(404, 'Session or video not found');
    }

    // Determine input path
    let inputPath = session.videoUrl;

    // Resolve input path (same logic as stream server)
    if (!fs.existsSync(inputPath)) {
        const cwd = process.cwd();
        const staticPath = path.join(cwd, 'static', inputPath);
        const rootPath = path.join(cwd, inputPath);

        if (fs.existsSync(staticPath)) inputPath = staticPath;
        else if (fs.existsSync(rootPath)) inputPath = rootPath;
        else if (inputPath.startsWith('/')) {
            const relative = inputPath.slice(1);
            const staticRel = path.join(cwd, 'static', relative);
            const rootRel = path.join(cwd, relative);
            if (fs.existsSync(staticRel)) inputPath = staticRel;
            else if (fs.existsSync(rootRel)) inputPath = rootRel;
        }
    }

    if (!fs.existsSync(inputPath)) {
        throw error(404, 'Input video file not found on server');
    }

    // Define output path
    // We'll save it to static/videos/optimized/sessionId.mp4
    // Ensure dir exists
    const staticVideoDir = path.join(process.cwd(), 'static', 'videos', 'optimized');
    if (!fs.existsSync(staticVideoDir)) {
        fs.mkdirSync(staticVideoDir, { recursive: true });
    }

    const outputFileName = `session_${sessionId}_optimized.mp4`;
    const outputPath = path.join(staticVideoDir, outputFileName);
    const publicUrl = `/videos/optimized/${outputFileName}`;

    // Update DB status
    await db.update(sessions)
        .set({
            optimizationStatus: 'processing',
            originalVideoUrl: session.videoUrl // Backup original
        })
        .where(eq(sessions.id, sessionId));

    // Start FFmpeg process in background (fire and forget from request perspective, but we log)
    // Note: In serverless this might be killed, but assuming persistent server (Node)
    console.log(`[Video Opt] Starting optimization for Session ${sessionId}`);
    console.log(`[Video Opt] Input: ${inputPath}`);
    console.log(`[Video Opt] Output: ${outputPath}`);

    ffmpeg(inputPath)
        .outputOptions([
            '-c:v libx264',
            '-pix_fmt yuv420p',
            '-movflags +faststart', // Important for progressive web playback
            '-preset veryfast',     // Faster encoding
            '-crf 23',              // Good balance of quality/size
            '-c:a aac',
            '-b:a 128k',
            '-ac 2'
        ])
        .output(outputPath)
        .on('start', (cmdLine: any) => {
            console.log('[Video Opt] FFmpeg started:', cmdLine);
        })
        .on('progress', (progress: any) => {
            // Optional: could update DB with percentage if needed, but keeps simple for now
            // console.log(`[Video Opt] Progress: ${progress.percent}%`);
        })
        .on('error', async (err: any) => {
            console.error('[Video Opt] Error:', err);
            await db.update(sessions)
                .set({ optimizationStatus: 'failed' })
                .where(eq(sessions.id, sessionId));
        })
        .on('end', async () => {
            console.log('[Video Opt] Finished successfully');
            await db.update(sessions)
                .set({
                    optimizationStatus: 'completed',
                    videoUrl: publicUrl // Point to new optimized file!
                })
                .where(eq(sessions.id, sessionId));
        })
        .run();

    return json({ success: true, message: 'Optimization started' });
};

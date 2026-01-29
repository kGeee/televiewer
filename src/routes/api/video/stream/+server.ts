import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import fs from 'fs';
import path from 'path';
// @ts-ignore
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';
import { PassThrough } from 'stream';

// Set ffmpeg path
if (ffmpegPath) {
    ffmpeg.setFfmpegPath(ffmpegPath);
} else {
    console.warn('ffmpeg-static not found, video transcoding might fail');
}

export const GET: RequestHandler = async ({ url, request, setHeaders }) => {
    const videoPath = url.searchParams.get('path');

    if (!videoPath) {
        throw error(400, 'Missing path parameter');
    }

    let resolvedPath = videoPath;

    // Helper to join paths treating subpath as relative even if it starts with /
    const safeJoin = (base: string, sub: string) => {
        const cleanSub = sub.replace(/^[\/\\]+/, '');
        return path.join(base, cleanSub);
    };

    // Check if the exact path exists (absolute path usage)
    if (!fs.existsSync(resolvedPath)) {
        const cwd = process.cwd();

        // 1. Try inside 'static' folder (treating input as relative)
        const staticPath = safeJoin(path.join(cwd, 'static'), videoPath);

        // 2. Try project root (treating input as relative)
        const rootPath = safeJoin(cwd, videoPath);

        if (fs.existsSync(staticPath)) {
            resolvedPath = staticPath;
        } else if (fs.existsSync(rootPath)) {
            resolvedPath = rootPath;
        } else {
            // Debug log to help identify why lookups failed
            console.log(`[Video Stream] Path lookup failed for: ${videoPath}`);
            console.log(`[Video Stream] Checked Absolute: ${resolvedPath}`);
            console.log(`[Video Stream] Checked Static: ${staticPath}`);
            console.log(`[Video Stream] Checked Root: ${rootPath}`);
        }
    }

    if (!fs.existsSync(resolvedPath)) {
        console.error(`[Video Stream] File not found: ${videoPath}. Tried resolving to: ${resolvedPath}`);
        throw error(404, 'File not found');
    }

    console.log(`[Video Stream] Resolved file path: ${resolvedPath}`);

    // DIRECT STREAMING FOR COMPATIBLE FILES
    // If it's an MP4/MOV/MKV, try to stream directly with Range support
    const ext = path.extname(resolvedPath).toLowerCase();
    const headers = request.headers;
    const range = headers.get('range');

    // List of formats we think browsers can handle directly or we want to try serving raw
    if (['.mp4', '.mov', '.m4v', '.mkv', '.webm'].includes(ext)) {
        const stat = fs.statSync(resolvedPath);
        const fileSize = stat.size;

        if (range) {
            const parts = range.replace(/bytes=/, "").split("-");
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
            const chunksize = (end - start) + 1;

            console.log(`[Video Stream] Serving Range: bytes=${start}-${end} for ${path.basename(resolvedPath)}`);

            const fileStream = fs.createReadStream(resolvedPath, { start, end });

            // Create a ReadableStream from the node stream
            const readable = new ReadableStream({
                start(controller) {
                    fileStream.on('data', (chunk) => controller.enqueue(chunk));
                    fileStream.on('end', () => controller.close());
                    fileStream.on('error', (err) => controller.error(err));
                },
                cancel() {
                    fileStream.destroy();
                }
            });

            return new Response(readable, {
                status: 206,
                headers: {
                    'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                    'Accept-Ranges': 'bytes',
                    'Content-Length': chunksize.toString(),
                    'Content-Type': 'video/mp4', // Simplification: assume mp4 for most, browser sniffs anyway
                    'Access-Control-Allow-Origin': '*'
                }
            });
        } else {
            console.log(`[Video Stream] Serving full file: ${path.basename(resolvedPath)}`);
            const fileStream = fs.createReadStream(resolvedPath);
            const readable = new ReadableStream({
                start(controller) {
                    fileStream.on('data', (chunk) => controller.enqueue(chunk));
                    fileStream.on('end', () => controller.close());
                    fileStream.on('error', (err) => controller.error(err));
                },
                cancel() {
                    fileStream.destroy();
                }
            });

            return new Response(readable, {
                status: 200,
                headers: {
                    'Content-Length': fileSize.toString(),
                    'Content-Type': 'video/mp4',
                    'Access-Control-Allow-Origin': '*'
                }
            });
        }
    }

    // FALLBACK TO FFMPEG TRANSCODING
    // (Used for other formats or if direct streaming is disabled/fails check)
    console.log(`[Video Stream] Transcoding needed for ${ext}`);

    const stream = new ReadableStream({
        start(controller) {
            const passThrough = new PassThrough();

            // Handle data chunks
            passThrough.on('data', (chunk) => {
                try {
                    controller.enqueue(chunk);
                } catch (err) {
                    // Controller likely closed, ignore
                }
            });

            // Handle end
            passThrough.on('end', () => {
                console.log('[Video Stream] Transcoding stream finished');
                try { controller.close(); } catch (e) { }
            });

            // Handle error
            passThrough.on('error', (err) => {
                console.error('[Video Stream] Transcoding stream error:', err);
                try { controller.error(err); } catch (e) { }
            });

            // Transcode to MP4 (H.264/AAC) using ffmpeg
            const command = ffmpeg(resolvedPath)
                .outputOptions([
                    '-movflags frag_keyframe+empty_moov+default_base_moof',
                    '-c:v libx264',
                    '-pix_fmt yuv420p',      // Ensure compatibility with all players (prevents 10-bit/4:4:4 issues)
                    '-preset ultrafast',
                    '-tune zerolatency',
                    '-crf 23',
                    '-c:a aac',
                    '-b:a 128k',
                    '-f mp4'
                ])
                .on('start', (cmdLine: any) => {
                    console.log('[Video Stream] ffmpeg started:', cmdLine);
                })
                .on('error', (err: any) => {
                    // 'Output stream closed' often refers to the client disconnecting
                    if (err.message !== 'Output stream closed' &&
                        !err.message.includes('pipe:1: The operation was aborted') &&
                        !err.message.includes('Output stream error: The operation was aborted')) {
                        console.error('[Video Stream] FFmpeg Error:', err.message);
                        try { controller.error(err); } catch (e) { }
                    } else {
                        console.log('[Video Stream] Client disconnected or stream closed');
                        // Just close controller
                        try { controller.close(); } catch (e) { }
                    }
                })
                .on('end', () => {
                    console.log('[Video Stream] Transcoding finished');
                });

            // Pipe ffmpeg output to the PassThrough stream
            command.pipe(passThrough);

            // Cleanup on client cancel
            // Note: ReadableStream 'cancel' is called when the client disconnects
            return () => {
                console.log('[Video Stream] Cleaning up ffmpeg process');
                command.kill('SIGKILL');
            };
        },
        cancel() {
            console.log('[Video Stream] Stream cancelled by client');
        }
    });

    setHeaders({
        'Content-Type': 'video/mp4',
        'Cache-Control': 'no-cache',
        'Access-Control-Allow-Origin': '*'
    });

    return new Response(stream);
};


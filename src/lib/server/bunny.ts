
import { env } from '$env/dynamic/private';
import crypto from 'crypto';

export class BunnyClient {
    private apiKey: string;
    private libraryId: string;
    private baseUrl = 'https://video.bunnycdn.com';

    constructor() {
        this.apiKey = env.BUNNY_API_KEY || '';
        this.libraryId = env.BUNNY_LIBRARY_ID || '';

        if (!this.apiKey || !this.libraryId) {
            console.warn('Bunny.net API Key or Library ID is missing.');
        }
    }

    /**
     * Create a new video entry in Bunny Stream.
     * Returns the guid and a presigned specific upload signature.
     */
    async createVideo(title: string) {
        const url = `${this.baseUrl}/library/${this.libraryId}/videos`;

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'AccessKey': this.apiKey,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({ title })
        });

        if (!response.ok) {
            const err = await response.text();
            throw new Error(`Failed to create video: ${err}`);
        }

        const data = await response.json();
        const guid = data.guid;

        // Generate Presigned Upload Signature
        // Signature = SHA256(libraryId + apiKey + expirationTime + videoId)
        const expirationTime = Math.floor(Date.now() / 1000) + 3600; // 1 hour
        const signatureString = this.libraryId + this.apiKey + expirationTime + guid;
        const signature = crypto.createHash('sha256').update(signatureString).digest('hex');

        return {
            guid,
            expirationTime,
            signature,
            libraryId: this.libraryId
        };
    }

    /**
     * Get video status
     */
    async getVideo(guid: string) {
        const url = `${this.baseUrl}/library/${this.libraryId}/videos/${guid}`;

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'AccessKey': this.apiKey,
                'Accept': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`Failed to get video: ${response.statusText}`);
        }

        return await response.json();
    }
}

export const bunny = new BunnyClient();

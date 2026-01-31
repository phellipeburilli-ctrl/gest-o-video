import { NextResponse } from 'next/server';
import { extractFrameIoComments, categorizeComment } from '@/lib/frameio-api.service';

export const maxDuration = 60;

// Hardcoded Frame.io links for testing - these are from tasks with alterations
const KNOWN_FRAMEIO_LINKS = [
    'https://f.io/65KiOiBh',  // Task 86aeueh4h - Victor Mazzine
];

export async function POST() {
    try {
        console.log('[Feedbacks Update] Starting extraction...');
        console.log(`[Feedbacks Update] BROWSERLESS_API_KEY: ${!!process.env.BROWSERLESS_API_KEY}`);

        if (!process.env.BROWSERLESS_API_KEY) {
            return NextResponse.json({
                success: false,
                error: 'BROWSERLESS_API_KEY not configured'
            }, { status: 500 });
        }

        // Extract from just one link to test
        const url = KNOWN_FRAMEIO_LINKS[0];
        console.log(`[Feedbacks Update] Extracting from: ${url}`);

        const feedback = await extractFrameIoComments(url);

        console.log(`[Feedbacks Update] Result:`, {
            url: feedback.url,
            assetName: feedback.assetName,
            commentsCount: feedback.comments.length,
            error: feedback.error
        });

        // Categorize comments
        const categorizedComments = feedback.comments.map(c => ({
            ...c,
            category: categorizeComment(c.text)
        }));

        return NextResponse.json({
            success: true,
            url: feedback.url,
            assetName: feedback.assetName,
            commentsCount: feedback.comments.length,
            comments: categorizedComments,
            error: feedback.error
        });

    } catch (error) {
        console.error('[Feedbacks Update] Error:', error);
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}

export async function GET() {
    return POST();
}

import { NextResponse } from 'next/server';
import { extractFrameIoComments, categorizeComment, FeedbackCategory } from '@/lib/frameio-api.service';

export const maxDuration = 60;

/**
 * API para extrair comentários de UM link do Frame.io
 * Chamada múltiplas vezes pelo frontend para processar todos os links
 */
export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { url, taskName } = body;

        if (!url) {
            return NextResponse.json({ error: 'url required' }, { status: 400 });
        }

        if (!process.env.BROWSERLESS_API_KEY) {
            return NextResponse.json({ error: 'BROWSERLESS_API_KEY not configured' }, { status: 500 });
        }

        console.log(`[Extract Link] Processing: ${url}`);

        const feedback = await extractFrameIoComments(url, 55000); // 55s timeout

        if (feedback.error) {
            return NextResponse.json({
                success: false,
                url,
                error: feedback.error,
                comments: []
            });
        }

        // Categorize comments
        const categorizedComments = feedback.comments.map(c => ({
            text: c.text,
            category: categorizeComment(c.text),
            timestamp: c.timestamp,
            taskName: taskName || 'Unknown'
        }));

        // Count by category
        const errorPatterns: Record<FeedbackCategory, number> = {
            'Áudio/Voz': 0,
            'Legenda/Texto': 0,
            'Corte/Transição': 0,
            'Fonte/Tipografia': 0,
            'Cor/Imagem': 0,
            'Timing/Sincronização': 0,
            'Logo/Marca': 0,
            'CTA/Preço': 0,
            'Footage/Vídeo': 0,
            'Outros': 0
        };

        categorizedComments.forEach(c => {
            errorPatterns[c.category as FeedbackCategory]++;
        });

        console.log(`[Extract Link] Found ${categorizedComments.length} comments`);

        return NextResponse.json({
            success: true,
            url,
            assetName: feedback.assetName,
            comments: categorizedComments,
            errorPatterns
        });

    } catch (error) {
        console.error('[Extract Link] Error:', error);
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            comments: []
        }, { status: 500 });
    }
}

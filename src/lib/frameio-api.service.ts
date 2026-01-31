/**
 * Frame.io Comment Extraction Service
 * Uses Browserless.io for serverless Puppeteer execution
 */

export interface FrameIoComment {
    author: string;
    text: string;
    timestamp: string;
    commentNumber: number;
}

export interface FrameIoFeedback {
    url: string;
    assetName: string;
    comments: FrameIoComment[];
    error?: string;
}

export type FeedbackCategory =
    | 'Áudio/Voz'
    | 'Legenda/Texto'
    | 'Corte/Transição'
    | 'Fonte/Tipografia'
    | 'Cor/Imagem'
    | 'Timing/Sincronização'
    | 'Logo/Marca'
    | 'CTA/Preço'
    | 'Footage/Vídeo'
    | 'Outros';

/**
 * Resolves a short Frame.io URL (f.io/xxx) to get share and asset IDs
 */
async function resolveFrameIoUrl(shortUrl: string): Promise<{ shareId: string; assetId: string } | null> {
    try {
        let url = shortUrl.trim();
        if (!url.startsWith('http')) {
            url = `https://${url}`;
        }

        // Follow redirects to get final URL
        const response = await fetch(url, { redirect: 'follow' });
        const finalUrl = response.url;

        // Extract IDs from URL pattern: /share/{shareId}/view/{assetId}
        const match = finalUrl.match(/\/share\/([a-f0-9-]+)(?:\/view\/([a-f0-9-]+))?/);
        if (match) {
            return {
                shareId: match[1],
                assetId: match[2] || ''
            };
        }

        return null;
    } catch (error) {
        console.error('[Frame.io] Error resolving URL:', error);
        return null;
    }
}

/**
 * Extracts comments using Browserless.io (serverless Puppeteer)
 */
export async function extractFrameIoComments(frameIoUrl: string): Promise<FrameIoFeedback> {
    const browserlessApiKey = process.env.BROWSERLESS_API_KEY;

    if (!browserlessApiKey) {
        console.warn('[Frame.io] BROWSERLESS_API_KEY not configured, skipping extraction');
        return {
            url: frameIoUrl,
            assetName: '',
            comments: [],
            error: 'Browserless API key not configured'
        };
    }

    try {
        let url = frameIoUrl.trim();
        if (!url.startsWith('http')) {
            url = `https://${url}`;
        }

        console.log(`[Frame.io] Extracting comments from: ${url}`);

        // Use Browserless scrape API
        const response = await fetch(`https://chrome.browserless.io/scrape?token=${browserlessApiKey}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                url: url,
                elements: [
                    {
                        selector: 'body'
                    }
                ],
                gotoOptions: {
                    waitUntil: 'networkidle2',
                    timeout: 30000
                }
            })
        });

        if (!response.ok) {
            throw new Error(`Browserless API error: ${response.status}`);
        }

        const result = await response.json();
        const bodyText = result.data?.[0]?.results?.[0]?.text || '';

        // Parse comments from the page text
        const comments = parseCommentsFromText(bodyText);

        // Extract asset name from title
        const titleMatch = bodyText.match(/^([^\n]+)/);
        const assetName = titleMatch?.[1]?.trim() || 'Unknown';

        console.log(`[Frame.io] Found ${comments.length} comments in "${assetName}"`);

        return {
            url,
            assetName,
            comments
        };

    } catch (error) {
        console.error(`[Frame.io] Error:`, error);
        return {
            url: frameIoUrl,
            assetName: '',
            comments: [],
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
}

/**
 * Parse comments from Frame.io page text
 */
function parseCommentsFromText(text: string): FrameIoComment[] {
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const comments: FrameIoComment[] = [];

    for (let i = 0; i < lines.length; i++) {
        // Look for pattern: #N followed by timestamp
        const commentMatch = lines[i].match(/^#(\d+)$/);
        if (commentMatch) {
            const commentNum = parseInt(commentMatch[1]);

            // Next line should be timestamp
            const timestampLine = lines[i + 1] || '';
            const timestampMatch = timestampLine.match(/^(\d{2}:\d{2}:\d{2}(?::\d{2})?)/);

            if (timestampMatch) {
                // The comment text follows the timestamp
                const commentText = lines[i + 2] || '';

                // Find the author (usually 2-3 lines before #N)
                let author = 'Unknown';
                for (let j = i - 1; j >= Math.max(0, i - 4); j--) {
                    // Skip common UI elements
                    if (!['Reply', 'Oldest', 'Newest', 'Completed', 'Commenter', 'All comments', 'Edited', 'Read by'].includes(lines[j])
                        && !lines[j].match(/^\d+[hmd]$/) // time ago like "20h"
                        && !lines[j].match(/^Read by \d+/) // "Read by 2 people"
                        && lines[j].length > 1
                        && lines[j].length < 50) {
                        author = lines[j];
                        break;
                    }
                }

                // Handle multi-line comments
                let fullText = commentText;
                let k = i + 3;
                while (k < lines.length && lines[k] !== 'Reply' && !lines[k].match(/^#\d+$/)) {
                    if (lines[k] && !lines[k].match(/^\d{2}:\d{2}:\d{2}/)) {
                        fullText += ' ' + lines[k];
                    }
                    k++;
                }

                if (fullText && fullText !== 'Reply') {
                    comments.push({
                        author,
                        text: fullText.trim(),
                        timestamp: timestampMatch[1],
                        commentNumber: commentNum
                    });
                }
            }
        }
    }

    return comments;
}

/**
 * Extract comments from multiple Frame.io links
 */
export async function extractMultipleFrameIoComments(urls: string[]): Promise<FrameIoFeedback[]> {
    if (urls.length === 0) return [];

    const results: FrameIoFeedback[] = [];

    // Process in batches of 3 to avoid rate limiting
    const batchSize = 3;
    for (let i = 0; i < urls.length; i += batchSize) {
        const batch = urls.slice(i, i + batchSize);
        const batchResults = await Promise.all(batch.map(url => extractFrameIoComments(url)));
        results.push(...batchResults);

        // Small delay between batches
        if (i + batchSize < urls.length) {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }

    return results;
}

/**
 * Categorizes a comment into an error type
 */
export function categorizeComment(text: string): FeedbackCategory {
    const lowerText = text.toLowerCase();

    const patterns: Record<FeedbackCategory, RegExp[]> = {
        'Áudio/Voz': [
            /áudio/i, /audio/i, /som/i, /volume/i, /voz/i, /voice/i,
            /música/i, /musica/i, /barulho/i, /eleven ?labs/i, /avatar/i,
            /locução/i, /locutor/i, /narração/i, /narracao/i
        ],
        'Legenda/Texto': [
            /legenda/i, /subtitle/i, /escrit[oa]/i, /palavra/i, /frase/i,
            /erro.*escrit/i, /ortograf/i, /errad[oa]/i, /texto/i,
            /digitação/i, /digitacao/i, /typo/i
        ],
        'Corte/Transição': [
            /corte/i, /transição/i, /transicao/i, /fade/i, /passar/i,
            /mudar/i, /edição/i, /edicao/i, /pular/i, /jump/i
        ],
        'Fonte/Tipografia': [
            /fonte/i, /font/i, /tamanho/i, /size/i, /tipografia/i,
            /letra/i, /negrito/i, /bold/i, /itálico/i
        ],
        'Cor/Imagem': [
            /cor\b/i, /color/i, /imagem/i, /image/i, /qualidade/i,
            /resolução/i, /brilho/i, /contraste/i, /saturação/i
        ],
        'Timing/Sincronização': [
            /timing/i, /sincroni/i, /tempo/i, /ritmo/i, /velocidade/i,
            /lento/i, /rápido/i, /rapido/i, /atrasa/i, /adiant/i,
            /duração/i, /duracao/i
        ],
        'Logo/Marca': [
            /logo/i, /marca/i, /brand/i, /watermark/i, /selo/i
        ],
        'CTA/Preço': [
            /cta/i, /preço/i, /preco/i, /price/i, /botão/i, /botao/i,
            /comprar/i, /oferta/i, /desconto/i, /valor/i, /\$/
        ],
        'Footage/Vídeo': [
            /footage/i, /vídeo/i, /video/i, /clip/i, /troca/i,
            /aparec/i, /cena/i, /b-?roll/i, /take/i
        ],
        'Outros': []
    };

    for (const [category, regexList] of Object.entries(patterns)) {
        if (category === 'Outros') continue;
        if (regexList.some(regex => regex.test(lowerText))) {
            return category as FeedbackCategory;
        }
    }

    return 'Outros';
}

/**
 * Categorizes all comments and groups by category
 */
export function categorizeComments(comments: FrameIoComment[]): Record<FeedbackCategory, FrameIoComment[]> {
    const result: Record<FeedbackCategory, FrameIoComment[]> = {
        'Áudio/Voz': [],
        'Legenda/Texto': [],
        'Corte/Transição': [],
        'Fonte/Tipografia': [],
        'Cor/Imagem': [],
        'Timing/Sincronização': [],
        'Logo/Marca': [],
        'CTA/Preço': [],
        'Footage/Vídeo': [],
        'Outros': []
    };

    for (const comment of comments) {
        const category = categorizeComment(comment.text);
        result[category].push(comment);
    }

    return result;
}

/**
 * Analyzes feedback patterns for an editor
 */
export function analyzeEditorPatterns(feedbacks: FrameIoFeedback[]): {
    totalComments: number;
    byCategory: Record<FeedbackCategory, number>;
    topIssues: { category: FeedbackCategory; count: number; percentage: number }[];
} {
    const allComments = feedbacks.flatMap(f => f.comments);
    const categorized = categorizeComments(allComments);

    const byCategory: Record<FeedbackCategory, number> = {} as Record<FeedbackCategory, number>;
    let total = 0;

    for (const [category, comments] of Object.entries(categorized)) {
        byCategory[category as FeedbackCategory] = comments.length;
        total += comments.length;
    }

    const topIssues = Object.entries(byCategory)
        .map(([category, count]) => ({
            category: category as FeedbackCategory,
            count,
            percentage: total > 0 ? (count / total) * 100 : 0
        }))
        .filter(item => item.count > 0)
        .sort((a, b) => b.count - a.count);

    return {
        totalComments: total,
        byCategory,
        topIssues
    };
}

export const frameIoApiService = {
    resolveUrl: resolveFrameIoUrl,
    extractComments: extractFrameIoComments,
    extractMultiple: extractMultipleFrameIoComments,
    categorizeComment,
    categorizeComments,
    analyzePatterns: analyzeEditorPatterns
};

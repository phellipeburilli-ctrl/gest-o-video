/**
 * Simple in-memory cache for feedback data
 * In production, this would be stored in a database like Redis or Vercel KV
 */

import { FeedbackCategory } from './frameio-api.service';

interface CachedFeedback {
    editorId: string;
    editorName: string;
    errorPatterns: Record<FeedbackCategory, number>;
    totalErrors: number;
    lastUpdated: number;
}

interface FeedbackCache {
    data: CachedFeedback[];
    lastUpdated: number;
    isUpdating: boolean;
}

// Global cache (persists across requests in serverless, but resets on cold start)
let feedbackCache: FeedbackCache = {
    data: [],
    lastUpdated: 0,
    isUpdating: false
};

export function getCachedFeedbacks(): FeedbackCache {
    return feedbackCache;
}

export function setCachedFeedbacks(data: CachedFeedback[]): void {
    feedbackCache = {
        data,
        lastUpdated: Date.now(),
        isUpdating: false
    };
}

export function setUpdating(status: boolean): void {
    feedbackCache.isUpdating = status;
}

export function isUpdating(): boolean {
    return feedbackCache.isUpdating;
}

export function getCacheAge(): number {
    if (feedbackCache.lastUpdated === 0) return Infinity;
    return Date.now() - feedbackCache.lastUpdated;
}

// Cache is valid for 24 hours
export function isCacheValid(): boolean {
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours
    return getCacheAge() < maxAge;
}

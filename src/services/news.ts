import axios from 'axios';
import type { NewsItem } from '../shared/types/news';
import logger from '../shared/utils/logger';

const NEWS_API_URL = 'https://launcher.hytale.com/launcher-feed/release/feed.json';

/**
 * Fetches news from the Hytale Launcher API
 * Replicates the logic from KyamVersion/src/services/news.js
 */
export async function fetchHytaleNews(): Promise<NewsItem[]> {
    try {
        const response = await axios.get(NEWS_API_URL, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Referer': 'https://hytale.com',
                'Origin': 'https://hytale.com'
            },
            timeout: 8000
        });

        // Handle different response structures
        const items = Array.isArray(response.data)
            ? response.data
            : (response.data.articles || response.data.news || []);

        const newsArray = Array.isArray(items) ? items : [];

        // Map and sanitize response, limit to 6 items
        return newsArray.slice(0, 6).map((item: any, index: number) => ({
            id: item.id?.toString() || `news-${index}`,
            title: item.title || 'Untitled',
            summary: item.short_text || item.description || '',
            link: item.url || item.dest_url || '',
            image: item.image_url
                ? `https://launcher.hytale.com/launcher-feed/release/${item.image_url}`
                : null,
            category: detectCategory(item.title || '')
        }));

    } catch (error) {
        logger.error('Error fetching news', { error: error instanceof Error ? error.message : error });
        return [];
    }
}

/**
 * Detect category based on title keywords
 */
function detectCategory(title: string): NewsItem['category'] {
    const lowerTitle = title.toLowerCase();
    if (lowerTitle.includes('update') || lowerTitle.includes('hotfix')) return 'UPDATE';
    if (lowerTitle.includes('patch')) return 'PATCH';
    if (lowerTitle.includes('event')) return 'EVENT';
    return 'ANNOUNCEMENT';
}

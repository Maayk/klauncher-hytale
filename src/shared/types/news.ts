/**
 * News item structure fetched from Hytale Launcher API
 */
export interface NewsItem {
    id: string;
    title: string;
    summary: string;
    link: string;
    image: string | null;
    category?: 'UPDATE' | 'PATCH' | 'ANNOUNCEMENT' | 'EVENT';
}

/**
 * Response from the news IPC handler
 */
export interface NewsResponse {
    success: boolean;
    data: NewsItem[];
    error?: string;
}

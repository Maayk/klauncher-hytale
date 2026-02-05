import React from 'react';
import { cn } from '@/shared/utils/cn';
import { ExternalLink } from 'lucide-react';
import { Button } from '@/renderer/components/ui/button';
import { IPC_CHANNELS } from '@/shared/constants/channels';
import type { NewsItem, NewsResponse } from '@/shared/types/news';

const categoryColors: Record<string, string> = {
    UPDATE: 'text-amber-400/90',
    PATCH: 'text-cyan-400/90',
    ANNOUNCEMENT: 'text-white/90',
    EVENT: 'text-emerald-400/90'
};

export function NewsRail() {
    const [news, setNews] = React.useState<NewsItem[]>([]);
    const [activeIndex, setActiveIndex] = React.useState(0);
    const [isLoading, setIsLoading] = React.useState(true);
    const [error, setError] = React.useState<string | null>(null);

    // Fetch news on mount
    React.useEffect(() => {
        async function loadNews() {
            try {
                const response = await window.electronAPI.invoke(IPC_CHANNELS.NEWS.GET) as NewsResponse;
                if (response.success && response.data.length > 0) {
                    setNews(response.data);
                } else {
                    setError(response.error || 'Sem notícias disponíveis');
                }
            } catch (e) {
                console.error('[NewsRail] Load error:', e);
                setError('Falha ao carregar notícias');
            } finally {
                setIsLoading(false);
            }
        }
        loadNews();
    }, []);

    // Auto-slide every 6 seconds
    React.useEffect(() => {
        if (news.length <= 1) return;

        const interval = setInterval(() => {
            setActiveIndex(prev => (prev + 1) % news.length);
        }, 6000);

        return () => clearInterval(interval);
    }, [news]);

    const handleSelect = (index: number) => {
        setActiveIndex(index);
    };

    const handleReadMore = () => {
        const currentNews = news[activeIndex];
        if (currentNews?.link) {
            window.electronAPI.invoke('shell:open-external', currentNews.link);
        }
    };

    const activeNews = news[activeIndex];

    if (isLoading) {
        return (
            <div className="flex flex-col gap-2 shrink-0">
                <span className="text-[10px] font-bold tracking-[0.15em] text-white/50 uppercase">Latest News</span>
                <div className="flex items-end gap-3">
                    {[1, 2, 3].map(i => (
                        <div key={i} className="h-24 w-40 rounded-lg bg-white/5 animate-pulse" />
                    ))}
                </div>
            </div>
        );
    }

    if (error || news.length === 0) {
        return (
            <div className="flex flex-col gap-2 shrink-0">
                <span className="text-[10px] font-bold tracking-[0.15em] text-white/50 uppercase">Latest News</span>
                <p className="text-white/40 text-sm">{error || 'Nenhuma notícia encontrada'}</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-2 shrink-0">
            {/* News info row - Title + Read More */}
            <div className="flex items-center gap-3 mb-1">
                <h3 className="text-sm font-bold text-white line-clamp-1 max-w-[300px]">
                    {activeNews?.title || 'Latest News'}
                </h3>
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 gap-1.5 text-white/60 hover:text-white text-[9px] uppercase tracking-wider font-semibold"
                    onClick={handleReadMore}
                >
                    <ExternalLink size={10} />
                    Read More
                </Button>
            </div>

            {/* News Cards Row */}
            <div className="flex items-end gap-3">
                {news.map((item, idx) => {
                    const isActive = activeIndex === idx;
                    const bgImage = item.image || 'https://hytale.com/static/images/media/screenshots/1.jpg';

                    return (
                        <div
                            key={item.id}
                            onClick={() => handleSelect(idx)}
                            className={cn(
                                'group relative overflow-hidden rounded-lg border cursor-pointer transition-all duration-300 w-40 h-24',
                                isActive
                                    ? 'border-white/30'
                                    : 'border-white/10 hover:border-white/20 opacity-75 hover:opacity-100'
                            )}
                        >
                            <div
                                className={cn(
                                    'absolute inset-0 bg-cover bg-center transition-transform duration-500',
                                    isActive && 'scale-105'
                                )}
                                style={{
                                    backgroundImage: `url(${bgImage})`,
                                    backgroundColor: '#1a1a1a'
                                }}
                            />

                            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />

                            <div className="absolute bottom-0 left-0 right-0 p-2.5 flex flex-col">
                                <span className={cn(
                                    'text-[8px] font-bold tracking-wider uppercase mb-0.5',
                                    categoryColors[item.category || 'ANNOUNCEMENT']
                                )}>
                                    {item.category || 'NEWS'}
                                </span>

                                <p className="text-[10px] font-bold text-white leading-tight line-clamp-2">
                                    {item.title}
                                </p>
                            </div>

                            {isActive && (
                                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white/60" />
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Pagination dots */}
            <div className="flex items-center gap-1.5 mt-1">
                {news.map((_, idx) => (
                    <button
                        key={idx}
                        onClick={() => handleSelect(idx)}
                        className={cn(
                            'rounded-full transition-all duration-300 cursor-pointer',
                            activeIndex === idx
                                ? 'w-4 h-1 bg-white/70'
                                : 'w-1 h-1 bg-white/20 hover:bg-white/40'
                        )}
                    />
                ))}
            </div>
        </div>
    );
}

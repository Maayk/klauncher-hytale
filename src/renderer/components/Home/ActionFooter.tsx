import React from 'react';
import { Button } from '@/renderer/components/ui/button';
import { VersionSelector } from './VersionSelector';
import { Play } from 'lucide-react';
import { IPC_CHANNELS } from '@/shared/constants/channels';
import type { Settings } from '@/shared/schemas/config';
import { useGameStore } from '@/renderer/store/useGameStore';

type Channel = 'current' | 'legacy';

export function ActionFooter() {
    const [settings, setSettings] = React.useState<Settings | null>(null);
    const { status, progress, message, setStatus } = useGameStore();

    // We derive isLaunching from the global store status
    const isLaunching = status === 'launching';
    // Use the global message if launching, otherwise default
    const displayStatus = isLaunching ? message : '';
    const displayProgress = isLaunching ? progress : 0;

    React.useEffect(() => {
        const loadSettings = async () => {
            try {
                const settingsData = await window.electronAPI.invoke(IPC_CHANNELS.SETTINGS.GET) as Settings;
                setSettings(settingsData);
            } catch (error) {
                console.error('Failed to load settings:', error);
            }
        };
        loadSettings();
    }, []);

    const handleLaunch = async () => {
        if (isLaunching) return;
        setStatus('launching');

        try {
            // Fetch fresh settings to get the latest nickname
            const freshSettings = await window.electronAPI.invoke(IPC_CHANNELS.SETTINGS.GET) as Settings;

            const channel = freshSettings?.gameChannel || settings?.gameChannel || 'latest';
            const playerName = freshSettings?.playerName || settings?.playerName || 'Player';

            await window.electronAPI.invoke(IPC_CHANNELS.GAME.LAUNCH, channel, playerName);
        } catch (error) {
            console.error('Failed to launch game:', error);
            setStatus('error'); // Store listener might also catch this
        }
    };

    return (
        <div className="flex flex-col items-end gap-3 shrink-0">

            {/* Version Display Only */}
            <VersionSelector />

            {/* Play Button - Clean White Style */}
            <Button
                variant="primary"
                size="lg"
                onClick={handleLaunch}
                disabled={isLaunching}
                className="w-44 h-12 text-base tracking-[0.15em] font-black bg-white hover:bg-white/90 text-black border-0 shadow-[0_0_30px_rgba(255,255,255,0.25)] hover:shadow-[0_0_40px_rgba(255,255,255,0.35)] hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 rounded-lg flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
                {isLaunching ? (
                    <div className="flex flex-col items-center justify-center w-full">
                        <span className="text-[10px] font-bold tracking-wider mb-1 animate-pulse uppercase">{displayStatus || 'LAUNCHING...'}</span>
                        <div className="w-full h-1 bg-gray-200 rounded-full overflow-hidden">
                            <div className="h-full bg-cyan-500 transition-all duration-300 ease-out" style={{ width: `${displayProgress}%` }} />
                        </div>
                    </div>
                ) : (
                    <>
                        <Play size={16} fill="currentColor" />
                        PLAY
                    </>
                )}
            </Button>

        </div>
    );
}
